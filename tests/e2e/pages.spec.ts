import { expect, test } from "@playwright/test";

test.describe("public pages & route protection", () => {
  test("landing page links to registration and login", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Paparan waktu solat");
    await expect(page.getByRole("link", { name: "Daftar Masjid" })).toHaveAttribute("href", "/register");
    await expect(page.getByRole("link", { name: "Log Masuk" }).first()).toHaveAttribute("href", "/login");
  });

  test("registration form has all required fields", async ({ page }) => {
    await page.goto("/register");
    for (const label of ["Nama penuh", "E-mel", "No. telefon", "Kata laluan", "Nama masjid / surau", "Alamat", "Negeri", "Daerah", "Zon waktu solat JAKIM", "Jawatan dalam masjid/surau", "Surat kebenaran / lantikan"]) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
  });

  test("dashboards require authentication", async ({ page }) => {
    for (const path of ["/admin", "/admin/media", "/master", "/master/approvals", "/permohonan"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("E-mel")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log Masuk" })).toBeVisible();
  });

  test("manifest and service worker are served", async ({ request }) => {
    const m = await request.get("/manifest.webmanifest");
    expect(m.ok()).toBe(true);
    expect((await m.json()).name).toBe("WaktuSolat");
    const sw = await request.get("/sw.js");
    expect(sw.ok()).toBe(true);
  });
});

test.describe("API hardening", () => {
  test("time endpoint returns server epoch without caching", async ({ request }) => {
    const r = await request.get("/api/time");
    expect(r.headers()["cache-control"]).toContain("no-store");
    expect(typeof (await r.json()).now).toBe("number");
  });

  test("display API rejects malformed slugs", async ({ request }) => {
    expect((await request.get("/api/display/..%2Fadmin")).status()).toBe(404);
    expect((await request.get("/api/display/ABC")).status()).toBe(404);
  });

  test("cron endpoint requires the secret", async ({ request }) => {
    expect((await request.get("/api/cron/daily")).status()).toBe(401);
    expect((await request.get("/api/cron/daily", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
  });

  test("admin media APIs reject anonymous callers", async ({ request }) => {
    expect((await request.post("/api/admin/media/upload-intent", { data: {} })).status()).toBe(401);
    expect((await request.delete("/api/admin/media/00000000-0000-0000-0000-000000000000")).status()).toBe(401);
    expect((await request.get("/api/master/applications/00000000-0000-0000-0000-000000000000/document")).status()).toBe(403);
  });

  test("heartbeat rejects junk", async ({ request }) => {
    const r = await request.post("/api/display/surau-al-amin/heartbeat", { data: { session_id: "x" } });
    expect([204, 400]).toContain(r.status());
  });
});
