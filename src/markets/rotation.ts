import type { CountryLabel } from "../config/defaults.ts";

const SEQUENCE = ["Chile", "México", "Brasil", "Chile", "USA", "Argentina", "Colombia"] as const satisfies readonly CountryLabel[];
const TIME_ZONE = "America/Argentina/Buenos_Aires";
const START = { y: 2026, m: 11, d: 9 };

export function marketOn(date: Date): CountryLabel | null {
  const day = zoned(date);
  if (isWeekend(day.y, day.m, day.d) || civilKey(day) < civilKey(START)) {
    return null;
  }
  let index = 0;
  let cursor = { ...START };
  while (civilKey(cursor) < civilKey(day)) {
    if (!isWeekend(cursor.y, cursor.m, cursor.d)) {
      index += 1;
    }
    cursor = nextCivil(cursor);
  }
  return SEQUENCE[index % SEQUENCE.length] ?? null;
}

function zoned(date: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { y: read("year"), m: read("month"), d: read("day") };
}

function isWeekend(y: number, m: number, d: number): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
  }).format(new Date(Date.UTC(y, m - 1, d, 15, 0, 0)));
  return weekday === "Sat" || weekday === "Sun";
}

function nextCivil(day: { y: number; m: number; d: number }): { y: number; m: number; d: number } {
  const date = new Date(Date.UTC(day.y, day.m - 1, day.d, 15, 0, 0));
  date.setUTCDate(date.getUTCDate() + 1);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

function civilKey(day: { y: number; m: number; d: number }): number {
  return day.y * 10000 + day.m * 100 + day.d;
}
