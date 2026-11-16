"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { computeDisplayState, currentPrayer, nextPrayer, scheduleFor } from "@/lib/prayer/engine";
import { PRAYER_KEYS, PRAYER_LABELS, type DaySchedule, type PrayerKey } from "@/lib/prayer/types";
import {
  addDays, formatClock, formatCountdown, formatHHMM, formatHijri, formatMalayDate, isFriday, klDateString, malayDayName,
} from "@/lib/time";
import { Slideshow, srcFor } from "./Slideshow";
import { resetSessionId, sessionId, useDisplayData, useServerClock, useTick, useWakeLock } from "./hooks";
import { DEFAULT_DISPLAY, type DisplayPayload, type DisplaySettings } from "./types";

interface Props {
  slug: string;
  /** Preview mode renders a given (possibly draft) payload without network side-effects. */
  initialPayload?: DisplayPayload | null;
  preview?: boolean;
}

export default function DisplayApp({ slug, initialPayload = null, preview = false }: Props) {
  const live = !preview;
  const { offsetRef, synced } = useServerClock(live);
  const now = useTick(offsetRef);
  const { payload, status, lastSyncAt } = useDisplayData(slug, initialPayload, live);
  useWakeLock(live);
  const cursor = useCursorReveal();

  const settings: DisplaySettings = { ...DEFAULT_DISPLAY, ...(payload?.display ?? {}) };
  const state = useMemo(
    () => computeDisplayState({ now, schedules: payload?.schedules ?? [], config: payload?.prayer_mode ?? {}, overrides: payload?.overrides ?? [] }),
    [now, payload],
  );

  useHeartbeat(live && !!payload, slug, state.mode, payload?.playlist?.version ?? null, state.scheduleValid, lastSyncAt);
  useServiceWorker(live, payload);

  useEffect(() => {
    document.documentElement.dataset.displayMode = state.mode;
  }, [state.mode]);

  if (!payload) {
    return (
      <div className="tv-root tv-pattern flex items-center justify-center">
        <div className="text-center">
          {status === "loading" && <p className="text-[4vmin] text-gold-300">Memuatkan paparan…</p>}
          {status === "not_found" && <Message title="Paparan tidak dijumpai" body="Sila semak alamat URL masjid anda." />}
          {status === "unavailable" && <Message title="Paparan tidak tersedia" body="Akaun masjid ini tidak aktif buat masa ini." />}
          {status === "offline" && <Message title="Tiada sambungan internet" body="Paparan akan dimuatkan secara automatik apabila sambungan pulih." />}
        </div>
      </div>
    );
  }

  const mosqueName = payload.mosque.name;

  if (state.mode === "solat") {
    return (
      <div className={`tv-root ${settings.solat_screen_style === "black" ? "tv-black" : "tv-solat"}`} data-testid="mode-solat">
        <SolatScreen
          black={settings.solat_screen_style === "black"}
          title={settings.solat_title}
          subtitle={state.solatMessage || settings.solat_subtitle}
          mosqueName={mosqueName}
        />
      </div>
    );
  }

  const offline = status === "offline";
  const warnings: string[] = [];
  const manualTimes = payload.mosque.prayer_time_source === "manual";
  if (!state.scheduleValid) {
    warnings.push(manualTimes
      ? "Waktu solat untuk hari ini belum dimasukkan oleh pentadbir masjid. Mod Solat automatik dimatikan."
      : "Data waktu solat rasmi untuk hari ini tidak dapat disahkan. Mod Solat automatik dimatikan.");
  }
  if (offline) warnings.push(`Luar talian — memaparkan data tersimpan${lastSyncAt ? ` (dikemas kini ${new Date(lastSyncAt).toLocaleTimeString("ms-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" })})` : ""}.`);
  if (live && !synced && offline) warnings.push("Jam peranti belum disegerakkan dengan pelayan.");
  const lastDay = payload.schedules.at(-1)?.date;
  if (offline && lastDay && state.scheduleValid && lastDay <= addDays(klDateString(now), 2)) {
    warnings.push(`Waktu solat tersimpan hanya sehingga ${formatMalayDate(lastDay)}. Sila sambungkan semula internet.`);
  }

  if (state.mode === "countdown" && state.countdownEndsAt) {
    return (
      <div className={`tv-root tv-pattern ${cursor ? "tv-cursor" : ""}`} data-testid="mode-countdown">
        <CountdownScreen
          mosqueName={mosqueName}
          prayerLabel={state.label ?? "Solat"}
          remaining={formatCountdown(state.countdownEndsAt - now)}
          message={state.countdownMessage || settings.countdown_subtitle}
          clock={formatClock(now, settings.clock_format, false)}
        />
        <FullscreenButton visible={cursor} />
      </div>
    );
  }

  const today = klDateString(now);
  const day = scheduleFor(payload.schedules, today);
  const next = nextPrayer(now, payload.schedules);
  const current = currentPrayer(now, payload.schedules);
  const clock = formatClock(now, settings.clock_format, settings.show_seconds);
  const hijri = settings.show_hijri ? formatHijri(day?.hijri) : null;
  const items = payload.playlist?.items ?? [];
  const logo = payload.mosque.logo_path ? srcFor(payload.media_base, payload.mosque.logo_path) : null;

  return (
    <div className={`tv-root flex flex-col ${cursor ? "tv-cursor" : ""}`} data-testid="mode-normal">
      {/* Header */}
      <header className="flex h-[13vh] shrink-0 items-center justify-between gap-[2vw] px-[2.5vw]">
        <div className="flex min-w-0 items-center gap-[1.2vw]">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" crossOrigin="anonymous" className="h-[9vh] w-[9vh] shrink-0 rounded-[1.2vh] bg-white/5 object-contain" />
          )}
          <div className="min-w-0">
            <h1 className="truncate text-[4.6vh] font-bold leading-tight tracking-tight text-gold-300" data-testid="mosque-name">{mosqueName}</h1>
            <p className="truncate text-[2.2vh] text-white/70">
              {malayDayName(today)}, {formatMalayDate(today)}{hijri && <span className="text-gold-400"> · {hijri}</span>}
              {manualTimes && <span className="text-white/50" data-testid="manual-label"> · Waktu ditetapkan oleh masjid</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-[2vw]">
          {next && (
            <div className="hidden text-right sm:block" data-testid="next-prayer">
              <p className="text-[1.9vh] uppercase tracking-[0.2em] text-white/60">Waktu seterusnya</p>
              <p className="text-[3vh] font-semibold text-white">
                {next.label} <span className="text-gold-300">{formatHHMM(scheduleTime(payload.schedules, next.date, next.prayer), settings.clock_format)}</span>
                <span className="ml-[0.6vw] text-[2.4vh] font-normal text-white/70">dalam {formatCountdown(next.at - now)}</span>
              </p>
            </div>
          )}
          <div className="rounded-[1.5vh] bg-black/25 px-[1.6vw] py-[0.8vh] text-right ring-1 ring-gold-500/30">
            <p className="text-[7vh] font-bold leading-none tracking-tight text-white" data-testid="clock">
              {clock.time}
              {clock.suffix && <span className="ml-[0.4vw] text-[2.6vh] font-semibold text-gold-300">{clock.suffix}</span>}
            </p>
          </div>
        </div>
      </header>

      {/* Media */}
      <main className="relative mx-[2.5vw] flex-1 overflow-hidden rounded-[2vh] bg-black/40 ring-1 ring-gold-500/25">
        <Slideshow
          items={items}
          version={`${payload.playlist?.version ?? "none"}:${items.length}${preview ? `:${items.map((i) => i.item_id + i.duration_seconds + i.transition + i.transition_ms + i.fit).join()}` : ""}`}
          mediaBase={payload.media_base}
          fallback={<EmptySlides name={mosqueName} logo={logo} />}
        />
      </main>

      {/* Prayer times */}
      <PrayerBar day={day ?? null} next={next?.date === today ? next.prayer : null} current={current}
        format={settings.clock_format} friday={isFriday(today)} />

      {warnings.length > 0 && (
        <div className="pointer-events-none absolute bottom-[25vh] left-[3vw] max-w-[60vw] space-y-[0.6vh]" data-testid="warnings">
          {warnings.map((w) => (
            <p key={w} className="rounded-[1vh] bg-amber-500/90 px-[1.2vw] py-[0.6vh] text-[1.9vh] font-semibold text-black shadow-lg">{w}</p>
          ))}
        </div>
      )}
      <FullscreenButton visible={cursor} />
    </div>
  );
}

function scheduleTime(schedules: DaySchedule[], date: string, p: PrayerKey): string {
  return scheduleFor(schedules, date)?.[p] ?? "--:--";
}

const PrayerBar = memo(function PrayerBar({ day, next, current, format, friday }: {
  day: DaySchedule | null; next: PrayerKey | null; current: PrayerKey | null; format: "24h" | "12h"; friday: boolean;
}) {
  return (
    <footer className="grid h-[24vh] shrink-0 grid-cols-6 gap-[1vw] px-[2.5vw] py-[2.2vh]" data-testid="prayer-bar">
      {PRAYER_KEYS.map((p) => {
        const isNext = p === next;
        const isCurrent = !isNext && p === current;
        const label = p === "zohor" && friday ? PRAYER_LABELS.jumaat : PRAYER_LABELS[p];
        return (
          <div key={p} data-prayer={p} data-next={isNext || undefined}
            className={`flex flex-col items-center justify-center rounded-[1.8vh] ${
              isNext ? "bg-gradient-to-b from-gold-400 to-gold-600 text-brand-950 shadow-[0_0_4vh_rgba(212,167,58,.35)]"
              : isCurrent ? "bg-white/10 text-white ring-2 ring-gold-500/60" : "bg-white/[.06] text-white ring-1 ring-white/10"}`}>
            <p className={`text-[3vh] font-semibold uppercase tracking-[0.12em] ${isNext ? "text-brand-950/80" : "text-gold-300"}`}>{label}</p>
            <p className="mt-[0.6vh] text-[7.2vh] font-bold leading-none tracking-tight">
              {day ? formatHHMM(day[p], format).replace(/ (PG|PTG)$/, "") : "--:--"}
              {day && format === "12h" && <span className="ml-[0.3vw] text-[2.2vh] font-semibold">{Number(day[p].slice(0, 2)) < 12 ? "PG" : "PTG"}</span>}
            </p>
          </div>
        );
      })}
    </footer>
  );
});

const CountdownScreen = memo(function CountdownScreen({ mosqueName, prayerLabel, remaining, message, clock }: {
  mosqueName: string; prayerLabel: string; remaining: string; message: string; clock: { time: string; suffix: string };
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-[6vw] text-center">
      <p className="text-[4vh] font-semibold uppercase tracking-[0.3em] text-gold-300">{mosqueName}</p>
      <div className="my-[3vh] h-px w-[30vw] bg-gradient-to-r from-transparent via-gold-500 to-transparent" />
      <h1 className="text-[7.5vh] font-bold uppercase tracking-wide text-white">Solat {prayerLabel} Berjemaah</h1>
      <p className="mt-[2vh] text-[4vh] text-white/80">Akan bermula dalam</p>
      <p className="mt-[1vh] text-[30vh] font-bold leading-none tracking-tight text-gold-400" data-testid="countdown" aria-live="off">{remaining}</p>
      <p className="mt-[3vh] text-[3.6vh] text-white/85">{message}</p>
      <p className="absolute bottom-[4vh] text-[3vh] text-white/50">{clock.time} {clock.suffix}</p>
    </div>
  );
});

/** Completely static: no clock, no animation, no media. */
const SolatScreen = memo(function SolatScreen({ black, title, subtitle, mosqueName }: { black: boolean; title: string; subtitle: string; mosqueName: string }) {
  if (black) return <div className="h-full w-full bg-black" aria-label={title} />;
  return (
    <div className="flex h-full flex-col items-center justify-center px-[8vw] text-center">
      <p className="text-[3vh] uppercase tracking-[0.3em] text-gold-500/70">{mosqueName}</p>
      <div className="my-[3vh] h-px w-[24vw] bg-gold-500/40" />
      <h1 className="text-[8vh] font-semibold text-white/90" data-testid="solat-title">{title}</h1>
      {subtitle && <p className="mt-[3vh] text-[3.6vh] text-white/60">{subtitle}</p>}
    </div>
  );
});

function EmptySlides({ name, logo }: { name: string; logo: string | null }) {
  return (
    <div className="tv-pattern flex h-full flex-col items-center justify-center text-center" data-testid="empty-slides">
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" crossOrigin="anonymous" className="mb-[3vh] h-[20vh] w-[20vh] object-contain" />
      )}
      <p className="text-[6vh] font-bold text-gold-300">{name}</p>
      <p className="mt-[1.5vh] text-[2.6vh] text-white/60">Selamat datang</p>
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-[5vmin] font-bold text-gold-300">{title}</p>
      <p className="mt-[2vmin] text-[2.6vmin] text-white/70">{body}</p>
    </div>
  );
}

/** Shows cursor + fullscreen button briefly after pointer/key activity. */
function useCursorReveal() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    let t = setTimeout(() => setVisible(false), 10_000);
    const show = () => {
      setVisible(true);
      clearTimeout(t);
      t = setTimeout(() => setVisible(false), 4000);
    };
    window.addEventListener("mousemove", show);
    window.addEventListener("keydown", show);
    window.addEventListener("touchstart", show);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", show);
      window.removeEventListener("keydown", show);
      window.removeEventListener("touchstart", show);
    };
  }, []);
  return visible;
}

function FullscreenButton({ visible }: { visible: boolean }) {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection after mount
    setSupported(typeof document !== "undefined" && !!document.documentElement.requestFullscreen);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={toggleFullscreen}
      className={`absolute right-[1.5vw] top-[14vh] z-50 rounded-full bg-black/60 px-[1.4vw] py-[1vh] text-[2vh] font-semibold text-gold-300 ring-1 ring-gold-500/50 transition-opacity focus:opacity-100 ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      ⛶ Skrin Penuh
    </button>
  );
}

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

function useHeartbeat(enabled: boolean, slug: string, mode: string, version: number | null, scheduleOk: boolean, lastSyncAt: string | null) {
  const latest = useRef({ mode, version, scheduleOk, lastSyncAt });
  useEffect(() => {
    latest.current = { mode, version, scheduleOk, lastSyncAt };
  }, [mode, version, scheduleOk, lastSyncAt]);
  useEffect(() => {
    if (!enabled) return;
    const send = async () => {
      const s = latest.current;
      try {
        const res = await fetch(`/api/display/${slug}/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            session_id: sessionId(),
            mode: s.mode,
            playlist_version: s.version,
            schedule_ok: s.scheduleOk,
            screen: `${window.screen.width}x${window.screen.height}`,
            last_sync_at: s.lastSyncAt,
          }),
        });
        if (res.status === 409) resetSessionId();
      } catch { /* offline */ }
    };
    const first = setTimeout(send, 3000);
    const id = setInterval(send, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [enabled, slug]);
}

/** Optional: offline shell + media cache. Displays work without it. */
function useServiceWorker(enabled: boolean, payload: DisplayPayload | null) {
  useEffect(() => {
    if (!enabled || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    // Ask the browser not to evict our caches under storage pressure (best effort).
    navigator.storage?.persist?.().catch(() => undefined);
    // Precache this page and every same-origin asset it has loaded, so a
    // reload/restart works offline even if they loaded before the SW existed.
    navigator.serviceWorker.ready
      .then((reg) => {
        const assets = performance.getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin));
        reg.active?.postMessage({ type: "precache-shell", urls: [location.href, ...new Set(assets)] });
      })
      .catch(() => undefined);
  }, [enabled]);
  const version = payload?.playlist?.version;
  useEffect(() => {
    if (!enabled || !payload || !("serviceWorker" in navigator)) return;
    const urls = (payload.playlist?.items ?? []).map((i) => srcFor(payload.media_base, i.path));
    if (payload.mosque.logo_path) urls.push(srcFor(payload.media_base, payload.mosque.logo_path));
    navigator.serviceWorker.ready
      .then((reg) => reg.active?.postMessage({ type: "keep-media", urls }))
      .catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, version]);
}
