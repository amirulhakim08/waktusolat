"use client";
/**
 * Continuous slideshow engine.
 *
 * - Two stacked layers: the outgoing slide stays fully visible underneath
 *   while the incoming one animates in → no blank frames (true crossfade).
 * - Each item carries its own duration / effect / transition time. Duration
 *   is measured from the start of one transition to the start of the next.
 * - The next image is preloaded + decoded before its transition starts.
 * - Failed media is skipped and retried later; unplayable videos (autoplay
 *   blocked, codec error, stall) never freeze the display.
 * - A newly published playlist is applied at the next slide boundary.
 * - Old layers are unmounted after their transition to release memory.
 */
import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { effectiveTransitionMs, enterStyles, exitStyles, nextPlayableIndex, type SlideItem } from "@/lib/slideshow";

interface Layer {
  key: number;
  item: SlideItem;
  phase: "enter" | "active" | "exit";
}

interface Props {
  items: SlideItem[];
  version: string;
  mediaBase: string;
  fallback: React.ReactNode;
}

const VIDEO_START_TIMEOUT = 8000;
const PRELOAD_TIMEOUT = 20000;
const FAILED_RETRY_MS = 10 * 60 * 1000;

export function srcFor(base: string, path: string) {
  if (/^(https?:)?\//.test(path)) return path;
  return base + path.split("/").map(encodeURIComponent).join("/");
}

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const timer = setTimeout(() => {
      img.src = "";
      reject(new Error("timeout"));
    }, PRELOAD_TIMEOUT);
    img.onload = () => {
      clearTimeout(timer);
      (img.decode ? img.decode() : Promise.resolve()).catch(() => undefined).then(() => resolve());
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("load error"));
    };
    img.src = src;
  });
}

function SlideshowImpl({ items, version, mediaBase, fallback }: Props) {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [empty, setEmpty] = useState(items.length === 0);
  const [single, setSingle] = useState(items.length === 1);

  const itemsRef = useRef(items);
  const pendingRef = useRef<SlideItem[] | null>(null);
  const indexRef = useRef(-1);
  const keyRef = useRef(0);
  const failedRef = useRef(new Set<string>());
  const failedAtRef = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const preloads = useRef(new Map<string, Promise<void>>());
  const advancingRef = useRef(false);
  const mountedRef = useRef(true);

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      if (mountedRef.current) fn();
    }, ms);
    timers.current.add(t);
    return t;
  }, []);

  const preload = useCallback((item: SlideItem) => {
    if (item.kind !== "image") return Promise.resolve();
    const src = srcFor(mediaBase, item.path);
    let p = preloads.current.get(src);
    if (!p) {
      p = preloadImage(src);
      preloads.current.set(src, p);
      // Keep the map tiny: only the most recent couple of preloads.
      if (preloads.current.size > 3) preloads.current.delete(preloads.current.keys().next().value as string);
      p.catch(() => preloads.current.delete(src));
    }
    return p;
  }, [mediaBase]);

  const markFailed = useCallback((item: SlideItem) => {
    if (failedRef.current.size === 0) failedAtRef.current = Date.now();
    failedRef.current.add(item.media_id);
  }, []);

  const advanceRef = useRef<() => void>(() => undefined);

  const advance = useCallback(async () => {
    if (advancingRef.current || !mountedRef.current) return;
    advancingRef.current = true;
    try {
      if (failedRef.current.size && Date.now() - failedAtRef.current > FAILED_RETRY_MS) failedRef.current.clear();
      // Safe boundary: switch to a newly published playlist here.
      if (pendingRef.current) {
        itemsRef.current = pendingRef.current;
        pendingRef.current = null;
        indexRef.current = -1;
      }
      const list = itemsRef.current;
      setSingle(list.length === 1);
      for (let attempts = 0; attempts < Math.max(1, list.length); attempts++) {
        const next = nextPlayableIndex(list, indexRef.current, failedRef.current);
        if (next === -1) {
          setLayers([]);
          setEmpty(true);
          later(() => {
            failedRef.current.clear();
            void advanceRef.current();
          }, 60_000);
          return;
        }
        const item = list[next];
        // A one-item playlist simply keeps showing that item.
        if (list.length === 1 && next === indexRef.current && keyRef.current > 0 && item.kind === "image") {
          later(() => void advanceRef.current(), item.duration_seconds * 1000);
          return;
        }
        try {
          await preload(item);
        } catch {
          markFailed(item);
          indexRef.current = next;
          continue;
        }
        if (!mountedRef.current) return;
        indexRef.current = next;
        setEmpty(false);
        const key = ++keyRef.current;
        setLayers((prev) => {
          const current = prev.filter((l) => l.phase !== "exit").at(-1);
          return current ? [{ ...current, phase: "exit" }, { key, item, phase: "enter" }] : [{ key, item, phase: "enter" }];
        });
        return;
      }
    } finally {
      advancingRef.current = false;
    }
  }, [later, markFailed, preload]);

  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);

  /** Called by a layer when its media is ready to be shown. */
  const onReady = useCallback((key: number, item: SlideItem) => {
    setLayers((prev) => prev.map((l) => (l.key === key ? { ...l, phase: "active" } : l)));
    const tms = effectiveTransitionMs(item);
    later(() => setLayers((prev) => prev.filter((l) => l.phase !== "exit" || l.key === key)), tms + 100);
    // Duration counts from the start of this transition.
    if (item.kind === "image" || itemsRef.current.length > 1) {
      later(() => void advanceRef.current(), Math.max(1000, item.duration_seconds * 1000));
    }
    // Warm the next image while this one is on screen.
    const list = pendingRef.current ?? itemsRef.current;
    const nextIdx = pendingRef.current ? 0 : nextPlayableIndex(list, indexRef.current, failedRef.current);
    if (nextIdx >= 0 && list[nextIdx]) preload(list[nextIdx]).catch(() => undefined);
  }, [later, preload]);

  const onFail = useCallback((key: number, item: SlideItem) => {
    markFailed(item);
    setLayers((prev) => prev.filter((l) => l.key !== key));
    void advanceRef.current();
  }, [markFailed]);

  const onEnded = useCallback(() => {
    if (itemsRef.current.length > 1) void advanceRef.current();
  }, []);

  // New published version → apply at the next boundary (or now if idle).
  useEffect(() => {
    if (indexRef.current === -1 || keyRef.current === 0) {
      itemsRef.current = items;
      indexRef.current = -1;
      void advanceRef.current();
    } else {
      pendingRef.current = items;
      if (itemsRef.current.length <= 1) void advanceRef.current();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  useEffect(() => {
    mountedRef.current = true;
    const t = timers.current;
    return () => {
      mountedRef.current = false;
      t.forEach(clearTimeout);
      t.clear();
    };
  }, []);

  const incoming = layers.find((l) => l.phase !== "exit");
  return (
    <div className="absolute inset-0 overflow-hidden" data-testid="slideshow" data-slide={incoming?.item.media_id ?? ""}>
      {empty && layers.length === 0 && fallback}
      {layers.map((layer) => (
        <SlideLayer
          key={layer.key}
          layer={layer}
          incoming={incoming}
          mediaBase={mediaBase}
          single={single}
          onReady={onReady}
          onFail={onFail}
          onEnded={onEnded}
        />
      ))}
    </div>
  );
}

interface LayerProps {
  layer: Layer;
  incoming: Layer | undefined;
  mediaBase: string;
  single: boolean;
  onReady: (key: number, item: SlideItem) => void;
  onFail: (key: number, item: SlideItem) => void;
  onEnded: () => void;
}

function SlideLayer({ layer, incoming, mediaBase, single, onReady, onFail, onEnded }: LayerProps) {
  const { item, key, phase } = layer;
  const videoRef = useRef<HTMLVideoElement>(null);
  const readyRef = useRef(false);

  const ready = useCallback(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    // Two frames so the "from" styles are painted before transitioning.
    requestAnimationFrame(() => requestAnimationFrame(() => onReady(key, item)));
  }, [item, key, onReady]);

  useEffect(() => {
    if (item.kind === "image") {
      ready();
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    const timeout = setTimeout(() => !readyRef.current && onFail(key, item), VIDEO_START_TIMEOUT);
    v.muted = true;
    const p = v.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => onFail(key, item)); // autoplay blocked → skip
    }
    return () => {
      clearTimeout(timeout);
      v.pause();
      v.removeAttribute("src");
      v.load(); // release decoder + buffers
    };
  }, [item, key, onFail, ready]);

  const tms = effectiveTransitionMs(incoming?.item ?? item);
  const transition = tms > 0 ? `opacity ${tms}ms ease, transform ${tms}ms ease, clip-path ${tms}ms ease` : "none";
  let style: CSSProperties = {};
  if (phase === "enter") {
    style = { ...enterStyles(item.transition).from, transition: "none", zIndex: 2 };
  } else if (phase === "active") {
    style = { ...enterStyles(item.transition).to, transition, zIndex: 2 };
  } else if (incoming?.phase === "active") {
    style = { ...exitStyles(incoming.item.transition), transition, zIndex: 1 };
  } else {
    style = { zIndex: 1 };
  }

  const src = srcFor(mediaBase, item.path);
  const fit = item.fit === "cover" ? "cover" : "contain";
  return (
    <div className="slide-layer" style={style} data-effect={item.transition} data-phase={phase}>
      {item.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- media served from Supabase CDN, preloaded manually
        <img src={src} alt={item.name} crossOrigin="anonymous" decoding="async" draggable={false}
          style={{ objectFit: fit }} onError={() => onFail(key, item)} />
      ) : (
        <video ref={videoRef} src={src} muted playsInline autoPlay preload="auto" crossOrigin="anonymous"
          loop={single} disablePictureInPicture style={{ objectFit: fit, background: "#000" }}
          onPlaying={ready} onError={() => onFail(key, item)} onEnded={onEnded} />
      )}
    </div>
  );
}

export const Slideshow = memo(SlideshowImpl, (a, b) => a.version === b.version && a.mediaBase === b.mediaBase);
