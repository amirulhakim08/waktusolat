import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Short-lived signed link to a private registration document (Master only). */
export async function GET(_req: Request, ctx: RouteContext<"/api/master/applications/[id]/document">) {
  const { id } = await ctx.params;
  const { supabase, profile } = await getSession();
  if (!supabase || profile?.role !== "master") return new Response("Forbidden", { status: 403 });
  const { data: app } = await supabase.from("mosque_applications").select("id, document_path").eq("id", id).maybeSingle();
  if (!app?.document_path) return new Response("Not found", { status: 404 });
  const { data, error } = await createAdminClient().storage.from(DOCUMENTS_BUCKET).createSignedUrl(app.document_path, 120);
  if (error || !data) return new Response("Unavailable", { status: 500 });
  return Response.redirect(data.signedUrl, 302);
}
