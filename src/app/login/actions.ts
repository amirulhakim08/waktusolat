"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/env";
import type { ActionResult } from "@/lib/errors";

export async function loginAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, error: "Sistem belum dikonfigurasi." };
  const parsed = loginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Maklumat tidak sah." };
  const ip = await clientIp();
  const okIp = await rateLimit(`login:ip:${ip}`, 30, 900);
  const okEmail = await rateLimit(`login:email:${parsed.data.email}`, 10, 900);
  if (!okIp || !okEmail) return { ok: false, error: "Terlalu banyak cubaan log masuk. Sila cuba lagi dalam 15 minit." };

  const supabase = await createClient();
  const { data: signIn, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (/not confirmed/i.test(error.message)) {
      return { ok: false, error: "E-mel anda belum disahkan. Sila klik pautan pengesahan dalam e-mel anda." };
    }
    return { ok: false, error: "E-mel atau kata laluan tidak sah." };
  }
  // The Supabase project may be shared with other apps: only accounts that
  // have a WaktuSolat profile may use this site.
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", signIn.user.id).maybeSingle();
  if (!profile) {
    await supabase.auth.signOut();
    return { ok: false, error: "Akaun ini tidak berdaftar dengan WaktuSolat. Sila daftar masjid/surau terlebih dahulu." };
  }
  const next = String(fd.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/auth/route");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
