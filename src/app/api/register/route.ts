import { randomUUID } from "node:crypto";
import { registrationSchema, documentMetaSchema, fieldErrors } from "@/lib/validation";
import { detectFileType, EXT_FOR } from "@/lib/media/detect";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { DOCUMENTS_BUCKET } from "@/lib/constants";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400, fields?: Record<string, string>) =>
  Response.json({ ok: false, error, fields }, { status });

export async function POST(req: Request) {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fail("Sistem belum dikonfigurasi. Sila hubungi pentadbir.", 503);
  }
  const ip = await clientIp();
  if (!(await rateLimit(`register:${ip}`, 5, 3600))) {
    return fail("Terlalu banyak cubaan pendaftaran. Sila cuba lagi dalam sejam.", 429);
  }

  const form = await req.formData().catch(() => null);
  if (!form) return fail("Borang tidak sah.");
  const raw = Object.fromEntries(
    ["full_name", "email", "phone", "password", "mosque_name", "address", "state", "district", "zone_code", "applicant_position"]
      .map((k) => [k, String(form.get(k) ?? "")]),
  );
  const parsed = registrationSchema.safeParse(raw);
  const file = form.get("document");
  const fileMeta = documentMetaSchema.safeParse(file instanceof File ? { size: file.size, type: file.type } : {});
  const fields = { ...(parsed.success ? {} : fieldErrors(parsed.error)) };
  if (!fileMeta.success) fields.document = fileMeta.error.issues[0]?.message ?? "Sila lampirkan dokumen sokongan";
  if (!parsed.success || !fileMeta.success || !(file instanceof File)) {
    return fail("Sila semak semula maklumat borang.", 400, fields);
  }
  const input = parsed.data;

  // Verify the actual bytes, not the browser-declared type.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectFileType(bytes);
  if (!detected || detected === "video/mp4" || detected !== file.type) {
    return fail("Dokumen sokongan mesti fail PDF atau gambar yang sah.", 400, { document: "Format dokumen tidak sah" });
  }

  const admin = createAdminClient();
  const { data: zone } = await admin.from("prayer_zones").select("code").eq("code", input.zone_code).eq("is_active", true).maybeSingle();
  if (!zone) return fail("Zon waktu solat tidak sah.", 400, { zone_code: "Zon tidak sah" });

  // Creates the (unverified) auth account and triggers the verification e-mail.
  const supabase = await createClient();
  const { data: signUp, error: signUpError } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${publicEnv().siteUrl}/auth/callback?next=/permohonan`,
      data: { full_name: input.full_name, phone: input.phone },
    },
  });
  if (signUpError || !signUp.user) {
    const msg = signUpError?.message ?? "";
    if (/password/i.test(msg)) return fail("Kata laluan tidak memenuhi syarat keselamatan.", 400, { password: msg });
    console.error("[register] signUp", msg);
    return fail("Pendaftaran tidak dapat diproses. Sila cuba lagi.", 400);
  }
  // Supabase returns a user with no identities when the e-mail already exists.
  if (!signUp.user.identities || signUp.user.identities.length === 0) {
    return fail("Pendaftaran tidak dapat diproses. Jika anda sudah mempunyai akaun, sila log masuk.", 409);
  }
  const userId = signUp.user.id;

  const docPath = `${userId}/${randomUUID()}.${EXT_FOR[detected]}`;
  try {
    const up = await admin.storage.from(DOCUMENTS_BUCKET).upload(docPath, bytes, { contentType: detected, upsert: false });
    if (up.error) throw up.error;
    const ins = await admin.from("mosque_applications").insert({
      applicant_id: userId,
      full_name: input.full_name,
      email: input.email,
      phone: input.phone,
      mosque_name: input.mosque_name,
      address: input.address,
      state: input.state,
      district: input.district,
      zone_code: input.zone_code,
      applicant_position: input.applicant_position,
      document_path: docPath,
      document_name: file.name.slice(0, 200),
      document_size: file.size,
      document_mime: detected,
    });
    if (ins.error) throw ins.error;
  } catch (e) {
    // Roll back so the applicant can retry with the same e-mail.
    console.error("[register] rollback", e);
    await admin.storage.from(DOCUMENTS_BUCKET).remove([docPath]).catch(() => undefined);
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    return fail("Permohonan tidak dapat disimpan. Sila cuba lagi.", 500);
  }

  return Response.json({ ok: true, needsVerification: !signUp.session });
}
