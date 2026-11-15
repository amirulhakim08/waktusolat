import type { Fit, Transition } from "./constants";

/** Item as published in a playlist_versions snapshot. */
export interface SlideItem {
  item_id: string;
  media_id: string;
  kind: "image" | "video";
  name: string;
  path: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  duration_seconds: number;
  transition: Transition;
  transition_ms: number;
  fit: Fit;
}

export function mediaUrl(path: string, base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""): string {
  if (/^https?:\/\//.test(path) || path.startsWith("/")) return path;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/media/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Index of the next playable slide after `current`, skipping items that
 * failed to load. Returns -1 when nothing is playable.
 */
export function nextPlayableIndex(items: SlideItem[], current: number, failed: ReadonlySet<string>): number {
  const n = items.length;
  if (n === 0) return -1;
  for (let step = 1; step <= n; step++) {
    const i = (((current + step) % n) + n) % n;
    if (!failed.has(items[i].media_id)) return i;
  }
  return -1;
}

/**
 * Effective transition time: always shorter than the slide duration
 * (duration includes the transition — spec §9.3).
 */
export function effectiveTransitionMs(item: Pick<SlideItem, "transition" | "transition_ms" | "duration_seconds">): number {
  if (item.transition === "none") return 0;
  const max = Math.max(0, item.duration_seconds * 1000 - 250);
  return Math.min(Math.max(0, item.transition_ms), max);
}

/** CSS (inline style) for the entering layer before/after its transition. */
export function enterStyles(t: Transition): { from: Record<string, string>; to: Record<string, string> } {
  switch (t) {
    case "slide_left":
      return { from: { transform: "translate3d(100%,0,0)" }, to: { transform: "translate3d(0,0,0)" } };
    case "slide_right":
      return { from: { transform: "translate3d(-100%,0,0)" }, to: { transform: "translate3d(0,0,0)" } };
    case "zoom_in":
      return { from: { opacity: "0", transform: "scale(0.85)" }, to: { opacity: "1", transform: "scale(1)" } };
    case "zoom_out":
      return { from: { opacity: "0", transform: "scale(1.15)" }, to: { opacity: "1", transform: "scale(1)" } };
    case "wipe":
      return { from: { clipPath: "inset(0 100% 0 0)" }, to: { clipPath: "inset(0 0 0 0)" } };
    case "fade":
      return { from: { opacity: "0" }, to: { opacity: "1" } };
    default:
      return { from: {}, to: {} };
  }
}

/** CSS for the leaving layer (slides push the old one out; others stay underneath). */
export function exitStyles(t: Transition): Record<string, string> {
  if (t === "slide_left") return { transform: "translate3d(-100%,0,0)" };
  if (t === "slide_right") return { transform: "translate3d(100%,0,0)" };
  return {};
}
