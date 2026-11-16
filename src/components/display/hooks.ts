"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DisplayPayload } from "./types";
import { REALTIME_PREFIX } from "@/lib/constants";

const safeGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* quota / private mode */ } };
const safeDel = (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

/**
 * Corrected clock: Date.now() + offset measured against /api/time
 * (NTP-synced server). Re-syncs periodically and after sleep/wake.
 */
export function useServerClock(enabled: boolean) {
  const offsetRef = useRef<number>(Number(safeGet("ws:clock-offset")) || 0);
  const [synced, setSynced] = useState(false);

  const sync = useCallback(async () => {
    try {
      const t0 = Date.now();
      const res = await fetch("/api/time", { cache: "no-store" });
      const t1 = Date.now();
      if (!res.ok) return;
      const { now } = (await res.json()) as { now: number };
      const rtt = t1 - t0;
      if (rtt > 5000 || typeof now !== "number") return; // too noisy to trust
      offsetRef.current = now + rtt / 2 - t1;
      safeSet("ws:clock-offset", String(Math.round(offsetRef.current)));
      setSynced(true);
    } catch {
      /* offline: keep the last known offset */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial async sync
    void sync();
    const id = setInterval(sync, 10 * 60 * 1000);
    const onVis = () => document.visibilityState === "visible" && void sync();
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, sync]);

  return { offsetRef, synced };
}

/** Re-renders once per second, aligned to the second boundary. */
export function useTick(offsetRef: React.RefObject<number>) {
  const [now, setNow] = useState(() => Date.now() + (Number(safeGet("ws:clock-offset")) || 0));
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(Date.now() + (offsetRef.current ?? 0));
    const align = setTimeout(() => {
      tick();
      interval = setInterval(tick, 1000);
    }, 1000 - ((Date.now() + (offsetRef.current ?? 0)) % 1000));
    const onVis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(align);
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [offsetRef]);
  return now;
}

export type LoadStatus = "loading" | "ready" | "offline" | "not_found" | "unavailable";

/**
 * Published display payload with offline cache (localStorage), polling
 * fallback and Supabase Realtime "something changed" notifications.
 */
export function useDisplayData(slug: string, initial: DisplayPayload | null, live: boolean) {
  const cacheKey = `ws:display:${slug}`;
  const [payload, setPayload] = useState<DisplayPayload | null>(initial);
  const [status, setStatus] = useState<LoadStatus>(initial ? "ready" : "loading");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const inflight = useRef(false);

  const load = useCallback(async (bust = false) => {
    if (!live || inflight.current) return;
    inflight.current = true;
    try {
      const res = await fetch(`/api/display/${slug}${bust ? `?t=${Date.now()}` : ""}`, { cache: "no-store" });
      if (res.status === 404) {
        safeDel(cacheKey);
        setPayload(null);
        setStatus("not_found");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (data.redirect) {
        window.location.replace(`/${data.redirect}`);
        return;
      }
      if (data.unavailable) {
        safeDel(cacheKey);
        setPayload(null);
        setStatus("unavailable");
        return;
      }
      const at = new Date().toISOString();
      setPayload(data as DisplayPayload);
      setStatus("ready");
      setLastSyncAt(at);
      safeSet(cacheKey, JSON.stringify({ data, at }));
    } catch {
      setStatus((s) => (s === "loading" || s === "ready" || s === "offline" ? "offline" : s));
    } finally {
      inflight.current = false;
    }
  }, [cacheKey, live, slug]);

  // Initial: cached copy first (instant + offline), then network.
  useEffect(() => {
    if (!live) return;
    const cached = safeGet(cacheKey);
    if (cached) {
      try {
        const { data, at } = JSON.parse(cached);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from cache
        setPayload(data);
        setLastSyncAt(at);
        setStatus("offline");
      } catch { /* corrupt cache */ }
    }
    void load();
    const poll = setInterval(() => void load(), 60_000);
    const onOnline = () => void load(true);
    const onVis = () => document.visibilityState === "visible" && void load();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(poll);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [cacheKey, live, load]);

  // Realtime notifications (best effort; polling covers outages).
  const mosqueId = payload?.mosque.id;
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!live || !mosqueId || !url || !key) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    import("@supabase/supabase-js").then(({ createClient }) => {
      if (cancelled) return;
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const channel = client
        .channel(`${REALTIME_PREFIX}:${mosqueId}`)
        .on("broadcast", { event: "update" }, () => {
          // Small jitter so many TVs don't stampede the API at once.
          setTimeout(() => void load(true), Math.random() * 3000);
        })
        .subscribe();
      cleanup = () => void client.removeChannel(channel);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [live, mosqueId, load]);

  return { payload, status, lastSyncAt, reload: load };
}

/** Keeps the screen awake where the Screen Wake Lock API exists. */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        lock = await (navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen");
      } catch { /* not allowed without gesture on some browsers */ }
    };
    void request();
    const onVis = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => undefined);
    };
  }, [enabled]);
}

export function sessionId(): string {
  let id = safeGet("ws:session");
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
          (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
    safeSet("ws:session", id);
  }
  return id;
}
export function resetSessionId() { safeDel("ws:session"); }
