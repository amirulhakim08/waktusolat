/**
 * Offline resilience with the service worker enabled: after one online
 * visit, a display must survive a reload / restart with no internet.
 */
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

const DATE = "2026-11-16";
const day = (date: string) => ({ date, hijri: "1448-05-26", subuh: "05:50", syuruk: "06:59", zohor: "12:59", asar: "16:22", maghrib: "19:12", isyak: "20:25" });
const payload = {
  mosque: { id: "m-1", name: "Surau Luar Talian", slug: "surau-luar-talian", zone: "SGR01", logo_path: null },
  playlist: null,
  prayer_mode: { maghrib: { enabled: true, countdown_minutes: 5, solat_minutes: 5 } },
  display: {}, overrides: [],
  schedules: [day(DATE), day("2026-11-17"), day("2026-11-18")],
  server_time: new Date().toISOString(),
  media_base: "/test-media/",
};

test("a display that loaded once still opens after a reload with no internet", async ({ page, context }) => {
  await context.route(/\/api\/display\/[^/]+(\?.*)?$/, (r) => r.fulfill({ json: payload }));
  await context.route("**/api/time", (r) => r.fulfill({ status: 503, body: "" }));
  await context.route("**/heartbeat", (r) => r.fulfill({ status: 204, body: "" }));

  await page.goto("/surau-luar-talian");
  await expect(page.getByTestId("mosque-name")).toHaveText("Surau Luar Talian");
  // Wait until the service worker controls the page and has precached the shell.
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 }).catch(async () => {
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 });
  });
  // Every static asset this page loaded must be in the shell cache before we go offline.
  await expect.poll(async () => page.evaluate(async () => {
    const shell = (await caches.keys()).find((k) => k.startsWith("ws-shell-"));
    if (!shell) return ["no cache yet"];
    const cache = await caches.open(shell);
    const needed = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => u.includes("/_next/static/"));
    const missing: string[] = [];
    for (const u of needed) if (!(await cache.match(u, { ignoreSearch: true }))) missing.push(u);
    if (!(await cache.match(location.href, { ignoreSearch: true }))) missing.push(location.href);
    return missing;
  }), { timeout: 20_000 }).toEqual([]);

  // Remove the mock so requests really hit the (offline) network.
  await context.unrouteAll({ behavior: "ignoreErrors" });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("mosque-name")).toHaveText("Surau Luar Talian");
  await expect(page.getByTestId("prayer-bar").locator('[data-prayer="maghrib"]')).toContainText("19:12");
  await expect(page.getByTestId("warnings")).toContainText("Luar talian");
  await context.setOffline(false);
});
