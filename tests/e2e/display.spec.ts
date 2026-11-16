/**
 * End-to-end tests for the public TV display.
 *
 * The display only talks to /api/display/[slug], /api/time and media URLs,
 * so these are intercepted with deterministic fixtures and the browser clock
 * is controlled with Playwright's fake clock. This exercises the real
 * production bundle: slideshow engine, prayer state machine, refresh
 * recovery, offline cache and publication updates.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import sharp from "sharp";

const DATE = "2026-11-16"; // Monday
const FRIDAY = "2026-11-20";
const at = (date: string, time: string) => new Date(`${date}T${time}+08:00`);

const day = (date: string, maghrib = "19:12") => ({
  date, hijri: "1448-05-26", subuh: "05:50", syuruk: "06:59", zohor: "12:59", asar: "16:22", maghrib, isyak: "20:25",
});

const colors: Record<string, string> = { a: "#c0392b", b: "#2980b9", c: "#27ae60", d: "#8e44ad" };
const images: Record<string, Buffer> = {};

test.beforeAll(async () => {
  for (const [k, c] of Object.entries(colors)) {
    images[k] = await sharp({ create: { width: 1600, height: 900, channels: 3, background: c } }).png().toBuffer();
  }
});

type Item = { id: string; duration: number; transition?: string; transition_ms?: number; fit?: string };
const item = ({ id, duration, transition = "fade", transition_ms = 1000, fit = "contain" }: Item) => ({
  item_id: `item-${id}`, media_id: id, kind: "image", name: `Poster ${id}`, path: `${id}.png`, mime: "image/png",
  size: 1000, width: 1600, height: 900, duration_seconds: duration, transition, transition_ms, fit,
});

const prayerMode = {
  subuh: { enabled: true, countdown_minutes: 15, solat_minutes: 5 },
  zohor: { enabled: true, countdown_minutes: 10, solat_minutes: 5 },
  asar: { enabled: true, countdown_minutes: 10, solat_minutes: 5 },
  maghrib: { enabled: true, countdown_minutes: 5, solat_minutes: 5 },
  isyak: { enabled: true, countdown_minutes: 15, solat_minutes: 5 },
  jumaat: { enabled: false, countdown_minutes: 30, solat_minutes: 15, replaces_zohor: true },
};

function payload(opts: { slug?: string; name?: string; items?: ReturnType<typeof item>[]; version?: number; schedules?: object[]; mode?: object; overrides?: object[]; display?: object } = {}) {
  return {
    mosque: { id: "m-1", name: opts.name ?? "Surau Al-Amin", slug: opts.slug ?? "surau-al-amin", zone: "SGR01", logo_path: null },
    playlist: opts.items ? { version: opts.version ?? 1, published_at: "2026-11-16T00:00:00Z", items: opts.items } : null,
    prayer_mode: opts.mode ?? prayerMode,
    display: opts.display ?? {},
    overrides: opts.overrides ?? [],
    schedules: opts.schedules ?? [day("2026-11-15"), day(DATE), day("2026-11-17"), day("2026-11-19"), day(FRIDAY)],
    server_time: new Date().toISOString(),
    media_base: "/test-media/",
  };
}

/** Wires network fixtures. `getPayload` is re-evaluated on every request. */
async function setup(page: Page, getPayload: (slug: string) => object | null | "offline", opts: { failMedia?: string[] } = {}) {
  await page.route("**/api/time", (r) => r.fulfill({ status: 503, body: "" }));
  await page.route("**/api/display/*/heartbeat", (r) => r.fulfill({ status: 204, body: "" }));
  await page.route(/\/api\/display\/[^/]+(\?.*)?$/, (route: Route) => {
    const slug = new URL(route.request().url()).pathname.split("/").pop()!;
    const p = getPayload(slug);
    if (p === "offline") return route.abort("internetdisconnected");
    if (!p) return route.fulfill({ status: 404, json: { error: "not_found" } });
    return route.fulfill({ status: 200, json: p });
  });
  await page.route("**/test-media/**", (route) => {
    const name = route.request().url().split("/").pop()!.replace(".png", "");
    if (opts.failMedia?.includes(name) || !images[name]) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, body: images[name], headers: { "content-type": "image/png", "access-control-allow-origin": "*" } });
  });
}

const currentSlide = (page: Page) => page.getByTestId("slideshow").getAttribute("data-slide");

test.describe("normal mode layout", () => {
  test("shows mosque name, clock, date and the six official prayer times without login", async ({ page }) => {
    await page.clock.install({ time: at(DATE, "13:30:00") });
    await setup(page, () => payload({ items: [item({ id: "a", duration: 10 })] }));
    await page.goto("/surau-al-amin");
    await expect(page.getByTestId("mode-normal")).toBeVisible();
    await expect(page.getByTestId("mosque-name")).toHaveText("Surau Al-Amin");
    await expect(page.getByTestId("clock")).toContainText("13:30");
    await expect(page.getByText("Isnin, 16 November 2026")).toBeVisible();
    await expect(page.getByText("26 Jamadilawal 1448H")).toBeVisible();
    const bar = page.getByTestId("prayer-bar");
    for (const [p, t] of [["subuh", "05:50"], ["syuruk", "06:59"], ["zohor", "12:59"], ["asar", "16:22"], ["maghrib", "19:12"], ["isyak", "20:25"]]) {
      await expect(bar.locator(`[data-prayer="${p}"]`)).toContainText(t);
    }
    await expect(bar.locator('[data-next="true"]')).toHaveAttribute("data-prayer", "asar");
    await expect(page.getByTestId("next-prayer")).toContainText("Asar");
    await expect(page.getByTestId("warnings")).toHaveCount(0);
  });

  test("labels Zohor as Jumaat on Fridays", async ({ page }) => {
    await page.clock.install({ time: at(FRIDAY, "10:00:00") });
    await setup(page, () => payload({}));
    await page.goto("/surau-al-amin");
    await expect(page.getByTestId("prayer-bar").locator('[data-prayer="zohor"]')).toContainText("Jumaat");
  });

  test("unknown mosque shows a not-found message", async ({ page }) => {
    await setup(page, () => null);
    await page.goto("/masjid-tiada");
    await expect(page.getByText("Paparan tidak dijumpai")).toBeVisible();
  });
});

test.describe("slideshow engine", () => {
  test("plays items in order with individual durations and loops", async ({ page }) => {
    await page.clock.install({ time: at(DATE, "10:00:00") });
    await setup(page, () => payload({ items: [item({ id: "a", duration: 5 }), item({ id: "b", duration: 15, transition: "slide_left", transition_ms: 1500 }), item({ id: "c", duration: 5, transition: "zoom_in", transition_ms: 2000 })] }));
    await page.goto("/surau-al-amin");
    await expect.poll(() => currentSlide(page)).toBe("a");
    await page.clock.runFor(5_500);
    await expect.poll(() => currentSlide(page)).toBe("b");
    await expect(page.locator('.slide-layer[data-effect="slide_left"]')).toBeVisible();
    await page.clock.runFor(8_000); // 13.5 s into B's 15 s
    expect(await currentSlide(page)).toBe("b");
    await page.clock.runFor(2_000);
    await expect.poll(() => currentSlide(page)).toBe("c");
    await expect(page.locator('.slide-layer[data-effect="zoom_in"]')).toBeVisible();
    await page.clock.runFor(5_500);
    await expect.poll(() => currentSlide(page)).toBe("a"); // loop
  });

  test("crossfade keeps the previous slide underneath (no blank frame) and then releases it", async ({ page }) => {
    await page.clock.install({ time: at(DATE, "10:00:00") });
    await setup(page, () => payload({ items: [item({ id: "a", duration: 5 }), item({ id: "b", duration: 5, transition: "fade", transition_ms: 3000 })] }));
    await page.goto("/surau-al-amin");
    await expect.poll(() => currentSlide(page)).toBe("a");
    await page.clock.runFor(5_200);
    await expect.poll(() => page.locator(".slide-layer").count()).toBe(2); // both layers during transition
    await expect(page.locator('.slide-layer[data-phase="exit"] img')).toHaveAttribute("src", /a\.png/);
    await page.clock.runFor(3_500);
    await expect.poll(() => page.locator(".slide-layer").count()).toBe(1); // old layer unmounted
  });

  test("skips media that fails to load", async ({ page }) => {
    await page.clock.install({ time: at(DATE, "10:00:00") });
    await setup(page, () => payload({ items: [item({ id: "a", duration: 5 }), item({ id: "b", duration: 5 }), item({ id: "c", duration: 5 })] }), { failMedia: ["b"] });
    await page.goto("/surau-al-amin");
    await expect.poll(() => currentSlide(page)).toBe("a");
    await page.clock.runFor(5_500);
    await expect.poll(() => currentSlide(page)).toBe("c");
  });

  test("empty playlist shows the mosque branding", async ({ page }) => {
    await page.clock.install({ time: at(DATE, "10:00:00") });
    await setup(page, () => payload({ items: [] }));
    await page.goto("/surau-al-amin");
    await expect(page.getByTestId("empty-slides")).toContainText("Surau Al-Amin");
  });

  test("a newly published playlist is picked up by polling and applied at a slide boundary", async ({ page }) => {
    await page.clock.install({ time: at(DATE, "10:00:00") });
    let version = 1;
    await setup(page, () => version === 1
      ? payload({ version: 1, items: [item({ id: "a", duration: 30 }), item({ id: "b", duration: 30 })] })
      : payload({ version: 2, items: [item({ id: "d", duration: 10 })] }));
    await page.goto("/surau-al-amin");
    await expect.poll(() => currentSlide(page)).toBe("a");
    version = 2;
    await page.clock.runFor(61_000); // poll fires at 60 s; A→B boundary was at 30 s, next boundary at 60 s
    await page.clock.runFor(30_000);
    await expect.poll(() => currentSlide(page)).toBe("d");
  });
});

test.describe("prayer mode (Maghrib 19:12, countdown 5 min, solat 5 min)", () => {
  test("normal → countdown → solat → normal on schedule", async ({ page }) => {
    await page.clock.install({ time: at(DATE, "19:11:50") });
    await setup(page, () => payload({ items: [item({ id: "a", duration: 10 })] }));
    await page.goto("/surau-al-amin");
    await expect(page.getByTestId("mode-normal")).toBeVisible();

    await page.clock.runFor(10_500);
    await expect(page.getByTestId("mode-countdown")).toBeVisible();
    await expect(page.getByText("Solat Maghrib Berjemaah")).toBeVisible();
    await expect(page.getByText("Akan bermula dalam")).toBeVisible();
    await expect(page.getByTestId("countdown")).toHaveText(/^0[45]:[0-5]\d$/);
    await expect(page.getByTestId("slideshow")).toHaveCount(0); // slideshow stopped & hidden
    // Dark green background (regression: a pattern class once reset it to white).
    expect(await page.getByTestId("mode-countdown").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(6, 42, 34)");

    await page.clock.runFor(60_000);
    await expect(page.getByTestId("countdown")).toHaveText(/^0[34]:[0-5]\d$/);

    await page.clock.runFor(4 * 60_000);
    await expect(page.getByTestId("mode-solat")).toBeVisible();
    await expect(page.getByTestId("solat-title")).toHaveText("Solat Sedang Berlangsung");
    await expect(page.locator("img, video")).toHaveCount(0);
    await expect(page.getByTestId("countdown")).toHaveCount(0);

    await page.clock.runFor(5 * 60_000);
    await expect(page.getByTestId("mode-normal")).toBeVisible();
    await expect.poll(() => currentSlide(page)).toBe("a"); // slideshow resumes
  });

  test("refresh during countdown restores the remaining time (no restart)", async ({ page }) => {
    await page.clock.install({ time: at(DATE, "19:15:00") });
    await setup(page, () => payload({}));
    await page.goto("/surau-al-amin");
    await expect(page.getByTestId("countdown")).toHaveText(/^0(1:5\d|2:00)$/);
    await page.reload();
    await expect(page.getByTestId("countdown")).toHaveText(/^0(1:5\d|2:00)$/);
  });

  test("refresh during Solat Mode restores it and keeps the original end time", async ({ page }) => {
    await page.clock.install({ time: at(DATE, "19:20:00") });
    await setup(page, () => payload({}));
    await page.goto("/surau-al-amin");
    await expect(page.getByTestId("mode-solat")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("mode-solat")).toBeVisible();
    await page.clock.runFor(2 * 60_000 + 1000);
    await expect(page.getByTestId("mode-normal")).toBeVisible();
  });

  test("an expired prayer window is not restarted by a refresh", async ({ page }) => {
    await page.clock.install({ time: at(DATE, "19:23:00") });
    await setup(page, () => payload({}));
    await page.goto("/surau-al-amin");
    await expect(page.getByTestId("mode-normal")).toBeVisible();
  });

  test("disabled prayers and Syuruk never trigger Prayer Mode", async ({ page }) => {
    await page.clock.install({ time: at(DATE, "19:13:00") });
    await setup(page, () => payload({ mode: { ...prayerMode, maghrib: { ...prayerMode.maghrib, enabled: false } } }));
    await page.goto("/surau-al-amin");
    await expect(page.getByTestId("mode-normal")).toBeVisible();
    await page.clock.setFixedTime(at(DATE, "07:00:00"));
    await page.reload();
    await expect(page.getByTestId("mode-normal")).toBeVisible();
  });

  test("black-screen Solat Mode option shows no text at all", async ({ page }) => {
    await page.clock.install({ time: at(DATE, "19:18:00") });
    await setup(page, () => payload({ display: { solat_screen_style: "black" } }));
    await page.goto("/surau-al-amin");
    await expect(page.getByTestId("mode-solat")).toBeVisible();
    await expect(page.getByTestId("mode-solat")).toHaveText("");
  });

  test("manual override: Solat Mode started early by the admin", async ({ page }) => {
    const start = at(DATE, "19:13:00");
    await page.clock.install({ time: at(DATE, "19:13:30") });
    await setup(page, () => payload({
      overrides: [{ kind: "solat", prayer: "maghrib", starts_at: start.toISOString(), countdown_ends_at: null, ends_at: new Date(start.getTime() + 5 * 60_000).toISOString() }],
    }));
    await page.goto("/surau-al-amin");
    await expect(page.getByTestId("mode-solat")).toBeVisible();
    await page.clock.runFor(5 * 60_000);
    await expect(page.getByTestId("mode-normal")).toBeVisible(); // not re-triggered by the scheduled window
  });

  test("Friday settings replace Zohor when enabled", async ({ page }) => {
    await page.clock.install({ time: at(FRIDAY, "13:20:00") });
    await setup(page, () => payload({ mode: { ...prayerMode, jumaat: { enabled: true, countdown_minutes: 30, solat_minutes: 15, replaces_zohor: true } } }));
    await page.goto("/surau-al-amin");
    await expect(page.getByText("Solat Jumaat Berjemaah")).toBeVisible();
    await expect(page.getByTestId("countdown")).toHaveText(/^0(8:5\d|9:00)$/);
  });
});

test.describe("data validity, offline and multiple displays", () => {
  test("missing official schedule shows a warning and does not start a countdown", async ({ page }) => {
    await page.clock.install({ time: at("2026-11-18", "19:13:00") });
    await setup(page, () => payload({}));
    await page.goto("/surau-al-amin");
    await expect(page.getByTestId("mode-normal")).toBeVisible();
    await expect(page.getByTestId("warnings")).toContainText("tidak dapat disahkan");
    await expect(page.getByTestId("prayer-bar").locator('[data-prayer="maghrib"]')).toContainText("--:--");
  });

  test("manual prayer times are labelled and drive Prayer Mode like official ones", async ({ page }) => {
    await page.clock.install({ time: at(DATE, "19:06:00") });
    const p = payload({ schedules: [{ ...day(DATE, "19:05"), source: "manual" }] }) as ReturnType<typeof payload> & { mosque: Record<string, unknown> };
    p.mosque.prayer_time_source = "manual";
    await setup(page, () => p);
    await page.goto("/surau-al-amin");
    await expect(page.getByTestId("mode-countdown")).toBeVisible();
    await page.clock.runFor(5 * 60_000);
    await expect(page.getByTestId("mode-solat")).toBeVisible();
    await page.clock.runFor(5 * 60_000);
    await expect(page.getByTestId("manual-label")).toHaveText(/Waktu ditetapkan oleh masjid/);
  });

  test("missing manual times show a manual-specific warning", async ({ page }) => {
    await page.clock.install({ time: at(DATE, "12:00:00") });
    const p = payload({ schedules: [] }) as ReturnType<typeof payload> & { mosque: Record<string, unknown> };
    p.mosque.prayer_time_source = "manual";
    await setup(page, () => p);
    await page.goto("/surau-al-amin");
    await expect(page.getByTestId("warnings")).toContainText("belum dimasukkan oleh pentadbir masjid");
  });

  test("keeps running from cache when the connection drops, then recovers", async ({ page }) => {
    await page.clock.install({ time: at(DATE, "19:10:00") });
    let online = true;
    await setup(page, () => (online ? payload({ items: [item({ id: "a", duration: 10 })] }) : "offline"));
    await page.goto("/surau-al-amin");
    await expect(page.getByTestId("mode-normal")).toBeVisible();
    online = false;
    await page.reload();
    await expect(page.getByTestId("mosque-name")).toHaveText("Surau Al-Amin");
    await expect(page.getByTestId("warnings")).toContainText("Luar talian");
    await page.clock.runFor(2 * 60_000 + 5000); // still computes the schedule offline
    await expect(page.getByTestId("mode-countdown")).toBeVisible();
    online = true;
    await page.clock.runFor(5 * 60_000); // 19:17:05
    await expect(page.getByTestId("mode-solat")).toBeVisible();
    await page.clock.runFor(5 * 60_000);
    await expect(page.getByTestId("warnings")).toHaveCount(0);
  });

  test("two mosques with different settings run independently; two TVs of one mosque agree", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: "block" });
    const pages = await Promise.all([ctx.newPage(), ctx.newPage(), ctx.newPage()]);
    for (const p of pages) {
      await p.clock.install({ time: at(DATE, "19:18:00") });
      await setup(p, (slug) => slug === "masjid-b"
        ? payload({ slug, name: "Masjid B", mode: { ...prayerMode, maghrib: { enabled: true, countdown_minutes: 10, solat_minutes: 5 } } })
        : payload({ slug }));
    }
    await pages[0].goto("/surau-al-amin");
    await pages[1].goto("/surau-al-amin");
    await pages[2].goto("/masjid-b");
    await expect(pages[0].getByTestId("mode-solat")).toBeVisible();
    await expect(pages[1].getByTestId("mode-solat")).toBeVisible();
    await expect(pages[2].getByTestId("mode-countdown")).toBeVisible();
    await expect(pages[2].getByTestId("countdown")).toHaveText(/^0(3:5\d|4:00)$/);
    await ctx.close();
  });

  test("a playlist update during Solat Mode does not interrupt it", async ({ page }) => {
    await page.clock.install({ time: at(DATE, "19:18:00") });
    let version = 1;
    await setup(page, () => payload({ version, items: version === 1 ? [item({ id: "a", duration: 10 })] : [item({ id: "d", duration: 10 })] }));
    await page.goto("/surau-al-amin");
    await expect(page.getByTestId("mode-solat")).toBeVisible();
    version = 2;
    await page.clock.runFor(61_000);
    await expect(page.getByTestId("mode-solat")).toBeVisible();
    await page.clock.runFor(3 * 60_000);
    await expect(page.getByTestId("mode-normal")).toBeVisible();
    await expect.poll(() => currentSlide(page)).toBe("d"); // latest published playlist on resume
  });

  test("scales to 1280×720 and 4K without overflow", async ({ browser }) => {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 3840, height: 2160 }, { width: 1366, height: 768 }]) {
      const ctx = await browser.newContext({ viewport, serviceWorkers: "block" });
      const p = await ctx.newPage();
      await p.clock.install({ time: at(DATE, "13:30:00") });
      await setup(p, () => payload({ items: [item({ id: "a", duration: 10 })] }));
      await p.goto("/surau-al-amin");
      await expect(p.getByTestId("prayer-bar")).toBeVisible();
      const box = await p.getByTestId("prayer-bar").boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
      await ctx.close();
    }
  });
});
