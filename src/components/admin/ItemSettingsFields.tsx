"use client";
import { DURATION_OPTIONS, FITS, FIT_LABELS, TRANSITIONS, TRANSITION_LABELS, TRANSITION_MS_OPTIONS, type Fit, type Transition } from "@/lib/constants";
import { Field, Select } from "../ui";

export interface ItemSettingsValue {
  duration_seconds: number;
  transition: Transition;
  transition_ms: number;
  fit: Fit;
  is_active: boolean;
}

export const DEFAULT_ITEM_SETTINGS: ItemSettingsValue = { duration_seconds: 10, transition: "fade", transition_ms: 1000, fit: "contain", is_active: true };

/** Per-image display settings (spec §9.1 C–G). */
export function ItemSettingsFields({ value, onChange, idPrefix, kind = "image" }: {
  value: ItemSettingsValue; onChange: (v: ItemSettingsValue) => void; idPrefix: string; kind?: "image" | "video";
}) {
  const set = <K extends keyof ItemSettingsValue>(k: K, v: ItemSettingsValue[K]) => {
    const next = { ...value, [k]: v };
    // Keep the transition shorter than the slide duration.
    if (next.transition_ms >= next.duration_seconds * 1000) next.transition_ms = Math.max(0, ...TRANSITION_MS_OPTIONS.filter((t) => t < next.duration_seconds * 1000));
    onChange(next);
  };
  const durations = DURATION_OPTIONS.includes(value.duration_seconds as never) ? DURATION_OPTIONS : [...DURATION_OPTIONS, value.duration_seconds].sort((a, b) => a - b);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={kind === "video" ? "Tempoh maksimum video" : "Tempoh Paparan Gambar"} htmlFor={`${idPrefix}-dur`}
        hint="Masa dari mula pertukaran gambar ini hingga gambar seterusnya (termasuk tempoh pertukaran).">
        <Select id={`${idPrefix}-dur`} value={value.duration_seconds} onChange={(e) => set("duration_seconds", Number(e.target.value))}>
          {durations.map((d) => <option key={d} value={d}>{d} saat</option>)}
        </Select>
      </Field>
      <Field label="Efek Pertukaran" htmlFor={`${idPrefix}-tr`} hint="Cara gambar ini muncul di skrin.">
        <Select id={`${idPrefix}-tr`} value={value.transition} onChange={(e) => set("transition", e.target.value as Transition)}>
          {TRANSITIONS.map((t) => <option key={t} value={t}>{TRANSITION_LABELS[t]}</option>)}
        </Select>
      </Field>
      <Field label="Tempoh Pertukaran" htmlFor={`${idPrefix}-trms`} hint="Berapa lama kesan pertukaran berlangsung.">
        <Select id={`${idPrefix}-trms`} value={value.transition_ms} disabled={value.transition === "none"}
          onChange={(e) => set("transition_ms", Number(e.target.value))}>
          {TRANSITION_MS_OPTIONS.map((t) => <option key={t} value={t} disabled={t >= value.duration_seconds * 1000}>{t / 1000} saat</option>)}
        </Select>
      </Field>
      <Field label="Muat Gambar" htmlFor={`${idPrefix}-fit`}>
        <Select id={`${idPrefix}-fit`} value={value.fit} onChange={(e) => set("fit", e.target.value as Fit)}>
          {FITS.map((f) => <option key={f} value={f}>{FIT_LABELS[f]}</option>)}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={value.is_active} onChange={(e) => set("is_active", e.target.checked)} />
        <span>Aktif — paparkan dalam slaid</span>
      </label>
    </div>
  );
}
