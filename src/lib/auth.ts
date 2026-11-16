import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./env";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: "master" | "mosque_admin" | "applicant";
}

export interface MosqueRow {
  id: string;
  name: string;
  slug: string;
  address: string;
  state: string;
  district: string;
  zone_code: string;
  status: "active" | "suspended";
  status_reason: string | null;
  storage_quota_bytes: number;
  logo_asset_id: string | null;
  created_at: string;
}

/** Cookie a Master uses to manage a specific mosque from /admin. */
export const ACT_AS_COOKIE = "ws_act_as";

export const getSession = cache(async () => {
  await connection(); // always request-time: never prerender auth state
  if (!isSupabaseConfigured()) return { supabase: null, user: null, profile: null as Profile | null };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { supabase, user: null, profile: null as Profile | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, role")
    .eq("id", data.user.id)
    .single();
  return { supabase, user: data.user, profile: (profile as Profile | null) ?? null };
});

/** Where a signed-in user belongs. */
export async function homeFor(profile: Profile | null): Promise<string> {
  if (!profile) return "/login";
  if (profile.role === "master") return "/master";
  if (profile.role === "mosque_admin") {
    const { supabase } = await getSession();
    const { data } = await supabase!.rpc("admin_mosque_id");
    if (data) return "/admin";
  }
  return "/permohonan";
}

export async function requireUser() {
  const s = await getSession();
  if (!s.user || !s.profile || !s.supabase) redirect("/login");
  return { supabase: s.supabase, user: s.user, profile: s.profile };
}

export async function requireMaster() {
  const s = await requireUser();
  if (s.profile.role !== "master") redirect(await homeFor(s.profile));
  return s;
}

/**
 * Mosque context for /admin. Mosque admins get their own mosque (enforced in
 * the database by admin_mosque_id()); a Master may manage any mosque via the
 * act-as cookie. RLS re-checks every query either way.
 */
export const requireMosqueAdmin = cache(async () => {
  const s = await requireUser();
  let mosqueId: string | null = null;
  let actingAsMaster = false;
  if (s.profile.role === "master") {
    mosqueId = (await cookies()).get(ACT_AS_COOKIE)?.value ?? null;
    actingAsMaster = true;
    if (!mosqueId) redirect("/master/mosques");
  } else {
    const { data } = await s.supabase.rpc("admin_mosque_id");
    mosqueId = (data as string | null) ?? null;
    if (!mosqueId) redirect("/permohonan");
  }
  const { data: mosque } = await s.supabase.from("mosques").select("*").eq("id", mosqueId).single();
  if (!mosque) redirect(actingAsMaster ? "/master/mosques" : "/permohonan");
  return { ...s, mosqueId: mosqueId as string, mosque: mosque as MosqueRow, actingAsMaster };
});

/** For server actions: never redirect, just report. */
export async function assertCanManage(mosqueId: string) {
  const s = await getSession();
  if (!s.supabase || !s.user) throw new Error("forbidden");
  const { data, error } = await s.supabase.rpc("can_manage_mosque", { p_mosque_id: mosqueId });
  if (error || data !== true) throw new Error("forbidden");
  return { supabase: s.supabase, user: s.user, profile: s.profile };
}
