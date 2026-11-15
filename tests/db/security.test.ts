import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  addReadyImage,
  anon,
  as,
  createApprovedMosque,
  createAuthUser,
  createMaster,
  createTestDatabase,
  expectPgError,
  hasDb,
  service,
  submitApplication,
  user,
} from "./helpers";

describe.skipIf(!hasDb)("database: registration, approval & tenancy", () => {
  let pool: Pool;
  let drop: () => Promise<void>;
  let masterId: string;

  beforeAll(async () => {
    ({ pool, drop } = await createTestDatabase());
    masterId = await createMaster(pool);
  });
  afterAll(async () => drop?.());

  describe("registration", () => {
    it("creates an applicant profile and ignores a role smuggled in metadata", async () => {
      const id = await createAuthUser(pool, { meta: { full_name: "Ali", role: "master" } });
      const r = await pool.query("select role, full_name from public.profiles where id = $1", [id]);
      expect(r.rows[0]).toEqual({ role: "applicant", full_name: "Ali" });
    });

    it("keeps an application pending verification until email is confirmed, then notifies master", async () => {
      const id = await createAuthUser(pool, { confirmed: false });
      const app = await submitApplication(pool, id, "Masjid Verifikasi");
      expect(app.status).toBe("pending_verification");
      const before = await pool.query(
        "select count(*)::int n from public.notifications where user_id = $1 and link = $2",
        [masterId, `/master/approvals/${app.id}`],
      );
      expect(before.rows[0].n).toBe(0);

      await pool.query("update auth.users set email_confirmed_at = now() where id = $1", [id]);
      const after = await pool.query("select status, email_verified_at from public.mosque_applications where id = $1", [app.id]);
      expect(after.rows[0].status).toBe("pending_approval");
      expect(after.rows[0].email_verified_at).not.toBeNull();
      const notes = await pool.query(
        "select count(*)::int n from public.notifications where user_id = $1 and link = $2",
        [masterId, `/master/approvals/${app.id}`],
      );
      expect(notes.rows[0].n).toBe(1);
    });

    it("cannot approve an application whose email is not verified", async () => {
      const id = await createAuthUser(pool, { confirmed: false });
      const app = await submitApplication(pool, id, "Masjid Belum Sah");
      await expectPgError(
        as(pool, user(masterId), (c) => c.query("select public.approve_application($1, 'masjid-belum-sah')", [app.id])),
        /invalid_application_status/,
      );
    });

    it("allows only one open application per applicant", async () => {
      const id = await createAuthUser(pool, { confirmed: true });
      await submitApplication(pool, id, "Masjid Satu");
      await expectPgError(submitApplication(pool, id, "Masjid Dua"), /one_open_per_applicant/);
    });

    it("applicants cannot read other applications and anon cannot read any", async () => {
      const a = await createAuthUser(pool, { confirmed: true });
      const b = await createAuthUser(pool, { confirmed: true });
      const appA = await submitApplication(pool, a, "Masjid A Rahsia");
      await submitApplication(pool, b, "Masjid B Rahsia");
      const seen = await as(pool, user(a), (c) => c.query("select id from public.mosque_applications"));
      expect(seen.rows.map((r) => r.id)).toEqual([appA.id]);
      await expectPgError(
        as(pool, anon, (c) => c.query("select * from public.mosque_applications")),
        /permission denied/,
      );
    });
  });

  describe("approval workflow", () => {
    it("approve activates mosque, assigns admin, creates defaults", async () => {
      const { adminId, mosqueId } = await createApprovedMosque(pool, masterId, "surau-al-amin", "Surau Al-Amin");
      const m = await pool.query("select status, slug, storage_quota_bytes from public.mosques where id = $1", [mosqueId]);
      expect(m.rows[0]).toMatchObject({ status: "active", slug: "surau-al-amin", storage_quota_bytes: "104857600" });
      const p = await pool.query("select role from public.profiles where id = $1", [adminId]);
      expect(p.rows[0].role).toBe("mosque_admin");
      const pm = await pool.query(
        "select prayer, enabled, countdown_minutes, solat_minutes from public.prayer_mode_settings where mosque_id = $1 order by prayer",
        [mosqueId],
      );
      expect(pm.rows).toHaveLength(6);
      expect(pm.rows.find((r) => r.prayer === "maghrib")).toMatchObject({ enabled: true, countdown_minutes: 5, solat_minutes: 5 });
      expect(pm.rows.find((r) => r.prayer === "jumaat")).toMatchObject({ enabled: false });
      const pub = await pool.query("select prayer_mode, display from public.mosque_publications where mosque_id = $1", [mosqueId]);
      expect(pub.rows[0].prayer_mode.subuh.countdown_minutes).toBe(15);
      const pl = await pool.query("select count(*)::int n from public.playlists where mosque_id = $1", [mosqueId]);
      expect(pl.rows[0].n).toBe(1);
      const ctx = await as(pool, user(adminId), (c) => c.query("select public.admin_mosque_id() id"));
      expect(ctx.rows[0].id).toBe(mosqueId);
    });

    it("rejects reserved or duplicate slugs", async () => {
      const id = await createAuthUser(pool, { confirmed: true });
      const app = await submitApplication(pool, id, "Masjid Admin");
      await expectPgError(
        as(pool, user(masterId), (c) => c.query("select public.approve_application($1, 'admin')", [app.id])),
        /invalid_slug/,
      );
      await expectPgError(
        as(pool, user(masterId), (c) => c.query("select public.approve_application($1, 'surau-al-amin')", [app.id])),
        /slug_taken/,
      );
    });

    it("non-master users cannot approve, reject or request info", async () => {
      const applicant = await createAuthUser(pool, { confirmed: true });
      const app = await submitApplication(pool, applicant, "Masjid Cuba");
      const { adminId } = await createApprovedMosque(pool, masterId, "masjid-lain", "Masjid Lain");
      for (const who of [applicant, adminId]) {
        await expectPgError(
          as(pool, user(who), (c) => c.query("select public.approve_application($1, 'masjid-cuba')", [app.id])),
          /forbidden/,
        );
        await expectPgError(
          as(pool, user(who), (c) => c.query("select public.reject_application($1, 'tidak lengkap')", [app.id])),
          /forbidden/,
        );
      }
      await expectPgError(
        as(pool, anon, (c) => c.query("select public.approve_application($1, 'masjid-cuba')", [app.id])),
        /permission denied/,
      );
    });

    it("prevents self-approval", async () => {
      const master2 = await createMaster(pool);
      const app = await submitApplication(pool, master2, "Masjid Sendiri");
      await expectPgError(
        as(pool, user(master2), (c) => c.query("select public.approve_application($1, 'masjid-sendiri')", [app.id])),
        /self_approval_not_allowed/,
      );
    });

    it("request info → applicant responds → pending again; reject blocks access", async () => {
      const applicant = await createAuthUser(pool, { confirmed: true });
      const app = await submitApplication(pool, applicant, "Masjid Maklumat");
      await as(pool, user(masterId), (c) => c.query("select public.request_application_info($1, 'Sila muat naik surat lantikan')", [app.id]));
      await as(pool, user(applicant), (c) => c.query("select public.respond_application_info($1, 'Surat telah dihantar melalui e-mel')", [app.id]));
      let s = await pool.query("select status from public.mosque_applications where id = $1", [app.id]);
      expect(s.rows[0].status).toBe("pending_approval");
      await as(pool, user(masterId), (c) => c.query("select public.reject_application($1, 'Dokumen tidak sah')", [app.id]));
      s = await pool.query("select status from public.mosque_applications where id = $1", [app.id]);
      expect(s.rows[0].status).toBe("rejected");
      const ctx = await as(pool, user(applicant), (c) => c.query("select public.admin_mosque_id() id"));
      expect(ctx.rows[0].id).toBeNull();
      const mosques = await as(pool, user(applicant), (c) => c.query("select id from public.mosques"));
      expect(mosques.rows).toHaveLength(0);
    });
  });

  describe("one active administrator per mosque", () => {
    it("blocks a second admin unless replacement is explicit, and records history", async () => {
      const { adminId: first, mosqueId } = await createApprovedMosque(pool, masterId, "masjid-satu-admin");
      const second = await createAuthUser(pool, { confirmed: true });
      const app2 = await submitApplication(pool, second, "Masjid Satu Admin");
      await expectPgError(
        as(pool, user(masterId), (c) => c.query("select public.approve_application($1, null, $2, false)", [app2.id, mosqueId])),
        /mosque_has_active_admin/,
      );
      await as(pool, user(masterId), (c) => c.query("select public.approve_application($1, null, $2, true)", [app2.id, mosqueId]));
      const rows = await pool.query(
        "select user_id, status from public.mosque_admin_assignments where mosque_id = $1 order by assigned_at",
        [mosqueId],
      );
      expect(rows.rows).toEqual([
        { user_id: first, status: "revoked" },
        { user_id: second, status: "active" },
      ]);
      const firstCtx = await as(pool, user(first), (c) => c.query("select public.admin_mosque_id() id"));
      expect(firstCtx.rows[0].id).toBeNull();
      const audit = await pool.query("select count(*)::int n from public.audit_logs where action = 'admin.replaced' and mosque_id = $1", [mosqueId]);
      expect(audit.rows[0].n).toBe(1);
    });

    it("database constraint rejects a second active assignment", async () => {
      const { mosqueId } = await createApprovedMosque(pool, masterId, "masjid-kekangan");
      const other = await createAuthUser(pool, { confirmed: true });
      await expectPgError(
        pool.query("insert into public.mosque_admin_assignments (mosque_id, user_id) values ($1, $2)", [mosqueId, other]),
        /mosque_admin_one_active_per_mosque/,
      );
    });

    it("concurrent approvals for the same mosque: exactly one succeeds", async () => {
      const { mosqueId } = await createApprovedMosque(pool, masterId, "masjid-serentak");
      await as(pool, user(masterId), (c) => c.query("select public.revoke_mosque_admin($1, 'Ujian serentak')", [mosqueId]));
      const a = await createAuthUser(pool, { confirmed: true });
      const b = await createAuthUser(pool, { confirmed: true });
      const appA = await submitApplication(pool, a, "Masjid Serentak");
      const appB = await submitApplication(pool, b, "Masjid Serentak");
      const results = await Promise.allSettled([
        as(pool, user(masterId), (c) => c.query("select public.approve_application($1, null, $2, false)", [appA.id, mosqueId])),
        as(pool, user(masterId), (c) => c.query("select public.approve_application($1, null, $2, false)", [appB.id, mosqueId])),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const active = await pool.query(
        "select count(*)::int n from public.mosque_admin_assignments where mosque_id = $1 and status = 'active'",
        [mosqueId],
      );
      expect(active.rows[0].n).toBe(1);
    });
  });

  describe("tenant isolation", () => {
    let A: { adminId: string; mosqueId: string };
    let B: { adminId: string; mosqueId: string };
    beforeAll(async () => {
      A = await createApprovedMosque(pool, masterId, "masjid-tenant-a", "Masjid Tenant A");
      B = await createApprovedMosque(pool, masterId, "masjid-tenant-b", "Masjid Tenant B");
    });

    it("admin A only sees mosque A", async () => {
      const r = await as(pool, user(A.adminId), (c) => c.query("select id from public.mosques"));
      expect(r.rows.map((x) => x.id)).toEqual([A.mosqueId]);
      const s = await as(pool, user(A.adminId), (c) => c.query("select mosque_id from public.prayer_mode_settings"));
      expect(new Set(s.rows.map((x) => x.mosque_id))).toEqual(new Set([A.mosqueId]));
    });

    it("admin A cannot modify mosque B settings", async () => {
      const r = await as(pool, user(A.adminId), (c) =>
        c.query("update public.prayer_mode_settings set countdown_minutes = 99 where mosque_id = $1", [B.mosqueId]),
      );
      expect(r.rowCount).toBe(0);
      const u = await as(pool, user(A.adminId), (c) =>
        c.query("update public.mosques set name = 'Hacked' where id = $1", [B.mosqueId]),
      );
      expect(u.rowCount).toBe(0);
      const b = await pool.query("select name from public.mosques where id = $1", [B.mosqueId]);
      expect(b.rows[0].name).toBe("Masjid Tenant B");
    });

    it("admin A cannot use mosque B media, playlists or functions", async () => {
      const mediaB = await addReadyImage(pool, B.mosqueId);
      const plB = (await pool.query("select id from public.playlists where mosque_id = $1", [B.mosqueId])).rows[0].id;
      const plA = (await pool.query("select id from public.playlists where mosque_id = $1", [A.mosqueId])).rows[0].id;
      await expectPgError(
        as(pool, user(A.adminId), (c) =>
          c.query("insert into public.playlist_items (playlist_id, mosque_id, media_id, position) values ($1, $2, $3, 0)", [plB, B.mosqueId, mediaB]),
        ),
        // Denied either by the validation trigger (B's media is invisible under RLS) or by the RLS policy.
        /row-level security|media_not_in_mosque/,
      );
      // Using B's media inside A's own playlist is rejected by trigger.
      await expectPgError(
        as(pool, user(A.adminId), (c) =>
          c.query("insert into public.playlist_items (playlist_id, mosque_id, media_id, position) values ($1, $2, $3, 0)", [plA, A.mosqueId, mediaB]),
        ),
        /media_not_in_mosque/,
      );
      await expectPgError(as(pool, user(A.adminId), (c) => c.query("select public.publish_playlist($1)", [plB])), /forbidden/);
      await expectPgError(
        as(pool, user(A.adminId), (c) =>
          c.query("select * from public.reserve_media_upload($1, 'image', 'x', 'image/jpeg', 100, 'jpg')", [B.mosqueId]),
        ),
        /forbidden/,
      );
      await expectPgError(as(pool, user(A.adminId), (c) => c.query("select public.delete_media_asset($1)", [mediaB])), /forbidden/);
      await expectPgError(
        as(pool, user(A.adminId), (c) => c.query("select public.create_prayer_override($1, 'solat', null, null, 5)", [B.mosqueId])),
        /forbidden/,
      );
      const media = await as(pool, user(A.adminId), (c) => c.query("select id from public.media_assets where id = $1", [mediaB]));
      expect(media.rows).toHaveLength(0);
    });

    it("admins cannot elevate their role or change master-only fields", async () => {
      await expectPgError(
        as(pool, user(A.adminId), (c) => c.query("update public.profiles set role = 'master' where id = $1", [A.adminId])),
        /permission denied/,
      );
      await expectPgError(
        as(pool, user(A.adminId), (c) => c.query("update public.mosques set storage_quota_bytes = 999999999 where id = $1", [A.mosqueId])),
        /permission denied/,
      );
      await expectPgError(
        as(pool, user(A.adminId), (c) => c.query("update public.mosques set status = 'active' where id = $1", [A.mosqueId])),
        /permission denied/,
      );
      await expectPgError(
        as(pool, user(A.adminId), (c) => c.query("select public.set_mosque_quota($1, 999999999)", [A.mosqueId])),
        /forbidden/,
      );
      await expectPgError(
        as(pool, user(A.adminId), (c) => c.query("insert into public.mosque_admin_assignments (mosque_id, user_id) values ($1, $2)", [B.mosqueId, A.adminId])),
        /permission denied/,
      );
    });

    it("master can see and manage all mosques", async () => {
      const r = await as(pool, user(masterId), (c) => c.query("select id from public.mosques where id = any($1)", [[A.mosqueId, B.mosqueId]]));
      expect(r.rows).toHaveLength(2);
      const u = await as(pool, user(masterId), (c) =>
        c.query("update public.prayer_mode_settings set countdown_minutes = 20 where mosque_id = $1 and prayer = 'isyak'", [B.mosqueId]),
      );
      expect(u.rowCount).toBe(1);
    });

    it("audit logs are read-only for everyone and tenant-scoped for admins", async () => {
      await expectPgError(
        as(pool, user(A.adminId), (c) => c.query("insert into public.audit_logs (action) values ('fake')")),
        /permission denied/,
      );
      await expectPgError(pool.query("update public.audit_logs set action = 'x'"), /immutable/);
      await expectPgError(pool.query("delete from public.audit_logs"), /immutable/);
      const seen = await as(pool, user(A.adminId), (c) => c.query("select distinct mosque_id from public.audit_logs"));
      for (const r of seen.rows) expect(r.mosque_id).toBe(A.mosqueId);
    });

    it("suspension removes admin access and public display", async () => {
      const C = await createApprovedMosque(pool, masterId, "masjid-gantung");
      await as(pool, user(masterId), (c) => c.query("select public.set_mosque_status($1, 'suspended', 'Ujian')", [C.mosqueId]));
      const ctx = await as(pool, user(C.adminId), (c) => c.query("select public.admin_mosque_id() id"));
      expect(ctx.rows[0].id).toBeNull();
      const pub = await as(pool, anon, (c) => c.query("select public.get_public_display('masjid-gantung') d"));
      expect(pub.rows[0].d).toEqual({ unavailable: true });
      await as(pool, user(masterId), (c) => c.query("select public.set_mosque_status($1, 'active', 'Pulih')", [C.mosqueId]));
      const ctx2 = await as(pool, user(C.adminId), (c) => c.query("select public.admin_mosque_id() id"));
      expect(ctx2.rows[0].id).toBe(C.mosqueId);
    });
  });

  describe("public viewer", () => {
    it("anon has no direct table access", async () => {
      for (const t of ["mosques", "media_assets", "playlists", "playlist_items", "prayer_mode_settings", "profiles", "audit_logs"]) {
        await expectPgError(as(pool, anon, (c) => c.query(`select * from public.${t} limit 1`)), /permission denied/);
      }
      await expectPgError(
        as(pool, anon, (c) => c.query("insert into public.display_sessions (id, mosque_id) values (gen_random_uuid(), gen_random_uuid())")),
        /permission denied/,
      );
    });

    it("returns only published data; drafts stay hidden until publish", async () => {
      const M = await createApprovedMosque(pool, masterId, "masjid-awam", "Masjid Awam");
      const img = await addReadyImage(pool, M.mosqueId, 5000);
      const pl = (await pool.query("select id from public.playlists where mosque_id = $1", [M.mosqueId])).rows[0].id;
      await as(pool, user(M.adminId), async (c) => {
        await c.query(
          "insert into public.playlist_items (playlist_id, mosque_id, media_id, position, duration_seconds, transition, transition_ms, fit) values ($1,$2,$3,0,15,'slide_left',1500,'cover')",
          [pl, M.mosqueId, img],
        );
        await c.query("update public.prayer_mode_settings set countdown_minutes = 7 where mosque_id = $1 and prayer = 'maghrib'", [M.mosqueId]);
      });
      let d = (await as(pool, anon, (c) => c.query("select public.get_public_display('masjid-awam') d"))).rows[0].d;
      expect(d.mosque.name).toBe("Masjid Awam");
      expect(d.playlist).toBeNull();
      expect(d.prayer_mode.maghrib.countdown_minutes).toBe(5);
      expect(JSON.stringify(d)).not.toContain("applicant");

      await as(pool, user(M.adminId), async (c) => {
        await c.query("select public.publish_playlist($1)", [pl]);
        await c.query("select public.publish_prayer_mode($1)", [M.mosqueId]);
      });
      d = (await as(pool, anon, (c) => c.query("select public.get_public_display('masjid-awam') d"))).rows[0].d;
      expect(d.playlist.version).toBe(1);
      expect(d.playlist.items[0]).toMatchObject({ media_id: img, duration_seconds: 15, transition: "slide_left", transition_ms: 1500, fit: "cover" });
      expect(d.prayer_mode.maghrib.countdown_minutes).toBe(7);

      // Editing the draft after publish does not change the live version.
      await as(pool, user(M.adminId), (c) => c.query("update public.playlist_items set duration_seconds = 60 where playlist_id = $1", [pl]));
      d = (await as(pool, anon, (c) => c.query("select public.get_public_display('masjid-awam') d"))).rows[0].d;
      expect(d.playlist.items[0].duration_seconds).toBe(15);
      await expectPgError(pool.query("update public.playlist_versions set item_count = 9"), /immutable/);
    });

    it("unknown slug returns null; renamed slug redirects", async () => {
      const M = await createApprovedMosque(pool, masterId, "masjid-lama", "Masjid Lama");
      await as(pool, user(M.adminId), (c) => c.query("select public.set_mosque_slug($1, 'masjid-baharu')", [M.mosqueId]));
      const old = (await as(pool, anon, (c) => c.query("select public.get_public_display('masjid-lama') d"))).rows[0].d;
      expect(old).toEqual({ redirect: "masjid-baharu" });
      const none = (await as(pool, anon, (c) => c.query("select public.get_public_display('tiada-masjid') d"))).rows[0].d;
      expect(none).toBeNull();
      // Another mosque may not claim the old slug.
      const N = await createApprovedMosque(pool, masterId, "masjid-n", "Masjid N");
      await expectPgError(as(pool, user(N.adminId), (c) => c.query("select public.set_mosque_slug($1, 'masjid-lama')", [N.mosqueId])), /slug_taken/);
    });
  });

  describe("media quota & deletion", () => {
    it("enforces quota server-side", async () => {
      const M = await createApprovedMosque(pool, masterId, "masjid-kuota");
      await as(pool, user(masterId), (c) => c.query("select public.set_mosque_quota($1, 3145728)", [M.mosqueId])); // 3 MB
      await as(pool, user(M.adminId), (c) =>
        c.query("select * from public.reserve_media_upload($1, 'image', 'a', 'image/jpeg', 2000000, 'jpg')", [M.mosqueId]),
      );
      await expectPgError(
        as(pool, user(M.adminId), (c) =>
          c.query("select * from public.reserve_media_upload($1, 'image', 'b', 'image/jpeg', 2000000, 'jpg')", [M.mosqueId]),
        ),
        /quota_exceeded/,
      );
    });

    it("rejects oversized images and unsupported types", async () => {
      const M = await createApprovedMosque(pool, masterId, "masjid-jenis");
      await expectPgError(
        as(pool, user(M.adminId), (c) => c.query("select * from public.reserve_media_upload($1, 'image', 'a', 'image/jpeg', 3000000, 'jpg')", [M.mosqueId])),
        /file_too_large/,
      );
      await expectPgError(
        as(pool, user(M.adminId), (c) => c.query("select * from public.reserve_media_upload($1, 'image', 'a', 'image/gif', 1000, 'gif')", [M.mosqueId])),
        /unsupported_type/,
      );
      await expectPgError(
        as(pool, user(M.adminId), (c) => c.query("select * from public.reserve_media_upload($1, 'video', 'a', 'video/quicktime', 1000, 'mov')", [M.mosqueId])),
        /unsupported_type/,
      );
    });

    it("concurrent reservations cannot jointly exceed the quota", async () => {
      const M = await createApprovedMosque(pool, masterId, "masjid-serentak-kuota");
      await as(pool, user(masterId), (c) => c.query("select public.set_mosque_quota($1, 5242880)", [M.mosqueId])); // 5 MB
      const attempts = Array.from({ length: 6 }, (_, i) =>
        as(pool, user(M.adminId), (c) =>
          c.query("select * from public.reserve_media_upload($1, 'image', $2, 'image/png', 2000000, 'png')", [M.mosqueId, `img${i}`]),
        ),
      );
      const res = await Promise.allSettled(attempts);
      expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(2);
      const used = await pool.query("select public.mosque_storage_used($1)::bigint u", [M.mosqueId]);
      expect(Number(used.rows[0].u)).toBeLessThanOrEqual(5242880);
    });

    it("finalize is service-only and cannot grow beyond the reservation", async () => {
      const M = await createApprovedMosque(pool, masterId, "masjid-final");
      const r = await as(pool, user(M.adminId), (c) =>
        c.query("select * from public.reserve_media_upload($1, 'image', 'a', 'image/jpeg', 1000, 'jpg')", [M.mosqueId]),
      );
      const assetId = r.rows[0].asset_id;
      await expectPgError(
        as(pool, user(M.adminId), (c) => c.query("select public.finalize_media_upload($1, 900, 'image/jpeg', 10, 10, null, null, null)", [assetId])),
        /permission denied/,
      );
      await expectPgError(
        as(pool, service, (c) => c.query("select public.finalize_media_upload($1, 5000, 'image/jpeg', 10, 10, null, null, null)", [assetId])),
        /size_mismatch/,
      );
      await as(pool, service, (c) => c.query("select public.finalize_media_upload($1, 900, 'image/jpeg', 10, 10, null, null, null)", [assetId]));
      const a = await pool.query("select status, size_bytes from public.media_assets where id = $1", [assetId]);
      expect(a.rows[0]).toEqual({ status: "ready", size_bytes: "900" });
    });

    it("expired reservations stop counting and are queued for cleanup", async () => {
      const M = await createApprovedMosque(pool, masterId, "masjid-luput");
      const r = await as(pool, user(M.adminId), (c) =>
        c.query("select * from public.reserve_media_upload($1, 'image', 'a', 'image/jpeg', 1500, 'jpg')", [M.mosqueId]),
      );
      await pool.query("update public.media_assets set reservation_expires_at = now() - interval '1 hour' where id = $1", [r.rows[0].asset_id]);
      const used = await pool.query("select public.mosque_storage_used($1)::bigint u", [M.mosqueId]);
      expect(Number(used.rows[0].u)).toBe(0);
      await as(pool, service, (c) => c.query("select public.cleanup_expired_reservations()"));
      const q = await pool.query("select count(*)::int n from public.storage_deletion_queue where path = $1", [r.rows[0].storage_path]);
      expect(q.rows[0].n).toBe(1);
    });

    it("cannot delete media in a playlist or in the live published version", async () => {
      const M = await createApprovedMosque(pool, masterId, "masjid-padam");
      const img = await addReadyImage(pool, M.mosqueId);
      const pl = (await pool.query("select id from public.playlists where mosque_id = $1", [M.mosqueId])).rows[0].id;
      const item = await pool.query(
        "insert into public.playlist_items (playlist_id, mosque_id, media_id, position) values ($1,$2,$3,0) returning id",
        [pl, M.mosqueId, img],
      );
      await expectPgError(as(pool, user(M.adminId), (c) => c.query("select public.delete_media_asset($1)", [img])), /media_in_playlist/);
      await as(pool, user(M.adminId), (c) => c.query("select public.publish_playlist($1)", [pl]));
      await pool.query("delete from public.playlist_items where id = $1", [item.rows[0].id]);
      await expectPgError(as(pool, user(M.adminId), (c) => c.query("select public.delete_media_asset($1)", [img])), /media_published/);
      await as(pool, user(M.adminId), (c) => c.query("select public.publish_playlist($1)", [pl])); // empty version
      await as(pool, user(M.adminId), (c) => c.query("select public.delete_media_asset($1)", [img]));
      const q = await pool.query("select count(*)::int n from public.storage_deletion_queue where path like $1", [`%${img}%`]);
      expect(q.rows[0].n).toBe(1);
    });

    it("playlist items require transition shorter than duration", async () => {
      const M = await createApprovedMosque(pool, masterId, "masjid-tempoh");
      const img = await addReadyImage(pool, M.mosqueId);
      const pl = (await pool.query("select id from public.playlists where mosque_id = $1", [M.mosqueId])).rows[0].id;
      await expectPgError(
        pool.query(
          "insert into public.playlist_items (playlist_id, mosque_id, media_id, position, duration_seconds, transition_ms) values ($1,$2,$3,0,3,3000)",
          [pl, M.mosqueId, img],
        ),
        /check constraint/,
      );
    });
  });

  describe("manual overrides", () => {
    it("persists, exposes publicly, and can be cleared", async () => {
      const M = await createApprovedMosque(pool, masterId, "masjid-override");
      await as(pool, user(M.adminId), (c) => c.query("select public.create_prayer_override($1, 'countdown', 'maghrib', 5, 5)", [M.mosqueId]));
      let d = (await as(pool, anon, (c) => c.query("select public.get_public_display('masjid-override') d"))).rows[0].d;
      expect(d.overrides).toHaveLength(1);
      expect(d.overrides[0]).toMatchObject({ kind: "countdown", prayer: "maghrib" });
      await as(pool, user(M.adminId), (c) => c.query("select public.create_prayer_override($1, 'solat', 'maghrib', null, 5)", [M.mosqueId]));
      const rows = await pool.query("select kind, cancelled_at is not null as cancelled, previous_state is not null as has_prev from public.prayer_mode_overrides where mosque_id = $1 order by created_at", [M.mosqueId]);
      expect(rows.rows).toEqual([
        { kind: "countdown", cancelled: true, has_prev: false },
        { kind: "solat", cancelled: false, has_prev: true },
      ]);
      await as(pool, user(M.adminId), (c) => c.query("select public.clear_prayer_override($1)", [M.mosqueId]));
      d = (await as(pool, anon, (c) => c.query("select public.get_public_display('masjid-override') d"))).rows[0].d;
      for (const o of d.overrides) expect(new Date(o.ends_at).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
      const audit = await pool.query("select count(*)::int n from public.audit_logs where mosque_id = $1 and action like 'override.%'", [M.mosqueId]);
      expect(audit.rows[0].n).toBe(3);
    });

    it("rejects invalid or unbounded durations", async () => {
      const M = await createApprovedMosque(pool, masterId, "masjid-override-2");
      await expectPgError(
        as(pool, user(M.adminId), (c) => c.query("select public.create_prayer_override($1, 'solat', null, null, 500)", [M.mosqueId])),
        /invalid_duration/,
      );
      await expectPgError(
        pool.query(
          "insert into public.prayer_mode_overrides (mosque_id, kind, starts_at, ends_at) values ($1, 'solat', now(), now() + interval '5 hours')",
          [M.mosqueId],
        ),
        /check constraint/,
      );
    });
  });

  describe("rate limiting", () => {
    it("allows up to the limit within a window", async () => {
      const results: boolean[] = [];
      for (let i = 0; i < 4; i++) {
        const r = await as(pool, service, (c) => c.query("select public.check_rate_limit('test:key', 3, 60) ok"));
        results.push(r.rows[0].ok);
      }
      expect(results).toEqual([true, true, true, false]);
      await expectPgError(as(pool, anon, (c) => c.query("select public.check_rate_limit('x', 1, 1)")), /permission denied/);
    });
  });
});
