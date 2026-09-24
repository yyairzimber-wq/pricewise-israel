/**
 * Transparency files carry Israel local wall-clock times with no offset
 * ("2026-09-23 05:21:00"). Convert them to UTC ISO strings, honouring DST.
 */

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Jerusalem",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function offsetMinutes(utcMs: number): number {
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (asUtc - utcMs) / 60_000;
}

export function israelPartsToIso(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): string | null {
  if (!y || !mo || !d || mo > 12 || d > 31 || h > 24 || mi > 59) return null;
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  // Two passes settle the offset correctly around DST transitions.
  let utc = naive - offsetMinutes(naive) * 60_000;
  utc = naive - offsetMinutes(utc) * 60_000;
  return new Date(utc).toISOString();
}

/** Accepts "2026-09-23", "2026-09-23 05:21:00", "2026-09-23T05:21:00.000", "23/09/2026 05:21". */
export function israelLocalToIso(value: string | undefined | null, timeOverride?: string): string | null {
  if (!value) return null;
  const v = String(value).trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  let y: number, mo: number, d: number;
  let time: (string | undefined)[] = [];
  if (m) {
    [y, mo, d] = [+m[1], +m[2], +m[3]];
    time = [m[4], m[5], m[6]];
  } else if ((m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) {
    [d, mo, y] = [+m[1], +m[2], +m[3]];
    time = [m[4], m[5], m[6]];
  } else {
    return null;
  }
  if (timeOverride) {
    const t = timeOverride.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (t) time = [t[1], t[2], t[3]];
  }
  return israelPartsToIso(y, mo, d, Number(time[0] ?? 0), Number(time[1] ?? 0), Number(time[2] ?? 0));
}
