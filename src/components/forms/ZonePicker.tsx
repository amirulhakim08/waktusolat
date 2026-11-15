"use client";
import { useMemo, useState } from "react";
import { MALAYSIAN_STATES } from "@/lib/constants";
import { Field, Select } from "../ui";

export interface ZoneOption { code: string; state: string; name: string }

export function ZonePicker({ zones, defaultState = "", defaultZone = "", errors = {}, stateName = "state" }: {
  zones: ZoneOption[]; defaultState?: string; defaultZone?: string; errors?: Record<string, string>; stateName?: string | null;
}) {
  const [state, setState] = useState(defaultState || zones.find((z) => z.code === defaultZone)?.state || "");
  const [zone, setZone] = useState(defaultZone);
  const options = useMemo(() => zones.filter((z) => !state || z.state === state), [zones, state]);
  return (
    <>
      <Field label="Negeri" htmlFor="state" error={errors.state}>
        <Select id="state" name={stateName ?? undefined} value={state} required invalid={!!errors.state}
          onChange={(e) => { setState(e.target.value); setZone(""); }}>
          <option value="">— Pilih negeri —</option>
          {MALAYSIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </Field>
      <Field label="Zon waktu solat JAKIM" htmlFor="zone_code" error={errors.zone_code}
        hint="Pilih zon e-Solat yang meliputi lokasi masjid/surau anda.">
        <Select id="zone_code" name="zone_code" value={zone} onChange={(e) => setZone(e.target.value)} required invalid={!!errors.zone_code}>
          <option value="">— Pilih zon —</option>
          {options.map((z) => <option key={z.code} value={z.code}>{z.code} — {z.name}</option>)}
        </Select>
      </Field>
    </>
  );
}
