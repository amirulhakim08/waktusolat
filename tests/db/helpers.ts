import { Client, Pool, type PoolClient } from "pg";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "";
export const hasDb = ADMIN_URL.length > 0;

const root = path.resolve(__dirname, "../..");

/** Creates a fresh database with the stub + all migrations applied. */
export async function createTestDatabase(): Promise<{ pool: Pool; drop: () => Promise<void> }> {
  const name = `wt_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const setup = new Client({ connectionString: url.toString() });
  await setup.connect();
  const files = [
    path.join(root, "tests/db/supabase-stub.sql"),
    ...fs
      .readdirSync(path.join(root, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => path.join(root, "supabase/migrations", f)),
  ];
  for (const f of files) await setup.query(fs.readFileSync(f, "utf8"));
  await setup.end();

  const pool = new Pool({ connectionString: url.toString(), max: 8 });
  return {
    pool,
    drop: async () => {
      await pool.end();
      const c = new Client({ connectionString: ADMIN_URL });
      await c.connect();
      await c.query(`drop database if exists ${name} with (force)`);
      await c.end();
    },
  };
}

type Role = { kind: "user"; id: string } | { kind: "anon" } | { kind: "service" };

/** Runs fn inside a transaction impersonating a Supabase role/JWT. */
export async function as<T>(pool: Pool, role: Role, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    if (role.kind === "user") {
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: role.id, role: "authenticated" })]);
    } else if (role.kind === "anon") {
      await c.query("set local role anon");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    } else {
      await c.query("set local role service_role");
    }
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

export const user = (id: string): Role => ({ kind: "user", id });
export const anon: Role = { kind: "anon" };
export const service: Role = { kind: "service" };

export async function createAuthUser(pool: Pool, opts: { email?: string; confirmed?: boolean; meta?: object } = {}) {
  const id = randomUUID();
  await pool.query(
    "insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3, $4)",
    [id, opts.email ?? `${id.slice(0, 8)}@example.test`, opts.confirmed ? new Date() : null, JSON.stringify(opts.meta ?? {})],
  );
  return id;
}

export async function createMaster(pool: Pool) {
  const id = await createAuthUser(pool, { confirmed: true });
  await as(pool, service, (c) => c.query("select public.bootstrap_master($1)", [id]));
  return id;
}

export async function submitApplication(pool: Pool, applicantId: string, mosqueName = "Surau Al-Amin") {
  const r = await pool.query(
    `insert into public.mosque_applications
      (applicant_id, full_name, email, phone, mosque_name, address, state, district, zone_code, applicant_position)
     values ($1, 'Ahmad', 'a@example.test', '0123456789', $2, 'Jalan 1', 'Selangor', 'Petaling', 'SGR01', 'Setiausaha')
     returning id, status`,
    [applicantId, mosqueName],
  );
  return r.rows[0] as { id: string; status: string };
}

/** Full happy path: verified applicant approved by master. */
export async function createApprovedMosque(pool: Pool, masterId: string, slug: string, name = "Masjid Ujian") {
  const adminId = await createAuthUser(pool, { confirmed: true });
  const app = await submitApplication(pool, adminId, name);
  const r = await as(pool, user(masterId), (c) =>
    c.query("select public.approve_application($1, $2) as id", [app.id, slug]),
  );
  return { adminId, mosqueId: r.rows[0].id as string, applicationId: app.id };
}

export async function addReadyImage(pool: Pool, mosqueId: string, size = 1000) {
  const id = randomUUID();
  await pool.query(
    `insert into public.media_assets (id, mosque_id, kind, status, name, storage_path, mime_type, size_bytes)
     values ($1, $2, 'image', 'ready', 'Poster', $3, 'image/jpeg', $4)`,
    [id, mosqueId, `mosques/${mosqueId}/media/${id}.jpg`, size],
  );
  return id;
}

export async function expectPgError(p: Promise<unknown>, match: RegExp) {
  try {
    await p;
  } catch (e) {
    const msg = (e as Error).message;
    if (!match.test(msg)) throw new Error(`Expected error matching ${match}, got: ${msg}`);
    return;
  }
  throw new Error(`Expected error matching ${match}, but promise resolved`);
}
