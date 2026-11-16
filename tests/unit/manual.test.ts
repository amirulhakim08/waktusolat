import { describe, expect, it } from "vitest";
import { expandRange, normaliseDate, normaliseTime, parseManualCsv, validateTimes } from "@/lib/prayer/manual";

const t = { subuh: "05:40", syuruk: "06:55", zohor: "12:55", asar: "16:15", maghrib: "19:05", isyak: "20:15" };

describe("manual prayer times", () => {
  it("normalises dates and times", () => {
    expect(normaliseDate("17/11/2026")).toBe("2026-11-17");
    expect(normaliseDate("2026-11-17")).toBe("2026-11-17");
    expect(normaliseDate("31/02/2026")).toBeNull();
    expect(normaliseTime("5:40")).toBe("05:40");
    expect(normaliseTime("19.05")).toBe("19:05");
    expect(normaliseTime("24:00")).toBeNull();
  });

  it("requires all six times in order", () => {
    expect(validateTimes(t).ok).toBe(true);
    expect(validateTimes({ ...t, asar: "12:00" })).toMatchObject({ ok: false });
    expect(validateTimes({ ...t, isyak: "" })).toMatchObject({ ok: false });
  });

  it("expands a date range inclusively and caps its length", () => {
    const r = expandRange("2026-11-30", "2026-12-02", t);
    expect(r.ok && r.rows.map((x) => x.date)).toEqual(["2026-11-30", "2026-12-01", "2026-12-02"]);
    expect(expandRange("2026-12-02", "2026-11-30", t).ok).toBe(false);
    expect(expandRange("2026-01-01", "2027-12-31", t).ok).toBe(false);
  });

  it("parses pasted CSV/spreadsheet rows with a header and reports bad lines", () => {
    const { rows, errors } = parseManualCsv(
      "Tarikh,Subuh,Syuruk,Zohor,Asar,Maghrib,Isyak\n" +
      "17/11/2026,5:40,6:55,12:55,16:15,19:05,20:15\n" +
      "2026-11-18\t05:41\t06:55\t12:55\t16:16\t19:05\t20:16\n" +
      "2026-11-19;05:41;06:56;12:56;11:00;19:06;20:16\n" +
      "bad line\n",
    );
    expect(rows.map((r) => r.date)).toEqual(["2026-11-17", "2026-11-18"]);
    expect(rows[0].subuh).toBe("05:40");
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("2026-11-19");
  });
});
