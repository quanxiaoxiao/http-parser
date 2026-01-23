const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const MONTH_MAP = new Map<string, number>(
  MONTHS.map((m, index) => [m, index]),
);

const HTTP_DATE_PATTERNS = [
  {
    regex: /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/,
    parse: (m: RegExpExecArray) => [Number(m[4]), m[3], Number(m[2]), Number(m[5]), Number(m[6]), Number(m[7])] as const,
  },
  {
    regex: /^(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/,
    parse: (m: RegExpExecArray) => {
      let year = Number(m[3]);
      year += year >= 70 ? 1900 : 2000;
      return [year, m[2], Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6])] as const;
    },
  },
  {
    regex: /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s{1,2}(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/,
    parse: (m: RegExpExecArray) => [Number(m[7]), m[2], Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])] as const,
  },
] as const;

const pad2 = (n: number): string => String(n).padStart(2, '0');

function buildUtcDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  min: number,
  sec: number,
): Date | null {
  const d = new Date(Date.UTC(year, month, day, hour, min, sec));
  if (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month &&
    d.getUTCDate() === day &&
    d.getUTCHours() === hour &&
    d.getUTCMinutes() === min &&
    d.getUTCSeconds() === sec
  ) {
    return d;
  }
  return null;
}

export function formatHttpDate(date: Date): string {
  const day = WEEKDAYS[date.getUTCDay()];
  const dateNumber = pad2(date.getUTCDate());
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hour = pad2(date.getUTCHours());
  const min = pad2(date.getUTCMinutes());
  const sec = pad2(date.getUTCSeconds());
  return `${day}, ${dateNumber} ${month} ${year} ${hour}:${min}:${sec} GMT`;
}

export function parseHttpDate(value: string): Date | null {
  if (value.length < 24 || value.length > 40) {
    return null;
  }
  for (const pattern of HTTP_DATE_PATTERNS) {
    const match = pattern.regex.exec(value);
    if (match) {
      const [year, monthString, day, hour, min, sec] = pattern.parse(match);
      const month = MONTH_MAP.get(monthString as string);
      if (month === undefined) {
        return null;
      }
      return buildUtcDate(year, month, day, hour, min, sec);
    }
  }
  return null;
}

export function isValidHttpDate(value: string): boolean {
  return parseHttpDate(value) !== null;
}
