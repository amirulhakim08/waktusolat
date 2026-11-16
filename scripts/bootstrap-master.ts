/**
 * One-time provisioning of the Master Super Admin.
 *
 *   MASTER_EMAIL=... MASTER_PASSWORD=... MASTER_NAME="..." \
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/bootstrap-master.ts
 *
 * Creates (or reuses) a confirmed auth user and grants the master role via
 * public.bootstrap_master(), which only the service role may execute.
 * The public registration flow can never create a master.
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.MASTER_EMAIL?.trim().toLowerCase();
  const password = process.env.MASTER_PASSWORD;
  const name = process.env.MASTER_NAME ?? "Master Super Admin";
  if (!url || !key || !email || !password) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MASTER_EMAIL and MASTER_PASSWORD");
  }
  if (password.length < 12) throw new Error("MASTER_PASSWORD must be at least 12 characters");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: "waktusolat" } });

  let userId: string | undefined;
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name, app: "waktusolat" } });
  if (created.data.user) {
    userId = created.data.user.id;
    console.log(`Created auth user ${email}`);
  } else {
    // Already exists: find it (paginate) and reuse.
    for (let page = 1; page < 50 && !userId; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
      if (data.users.length < 200) break;
    }
    if (!userId) throw created.error ?? new Error("Could not create or find user");
    console.log(`Reusing existing auth user ${email}`);
  }
  const { error } = await db.rpc("bootstrap_master", { p_user_id: userId });
  if (error) throw error;
  await db.from("profiles").update({ full_name: name }).eq("id", userId);
  console.log(`✔ ${email} is now Master Super Admin. Log in at /login.`);
}

main().catch((e) => {
  console.error("✖", e instanceof Error ? e.message : e);
  process.exit(1);
});
