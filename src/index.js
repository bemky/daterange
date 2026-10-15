/**
 * An immutable range between two instants. Both ends are inclusive.
 */
export class DateRange {
  #start;
  #end;

  /**
   * Bounds may carry Postgres-style brackets: "[" or "]" includes a date-only bound's whole day,
   * "(" or ")" excludes it. Unbracketed date-only bounds are inclusive. Bounds with a time are
   * used as given.
   *
   * @param {string|Date} start An ISO 8601 interval ("start/end"), a Postgres range ("[start,end)"),
   *   or the start of the range ("2021-01-01", "[2021-01-01", "(2021-01-01").
   * @param {string|Date} [end] The end of the range ("2021-02-01", "2021-02-01]", "2021-02-01)").
   *   Omit when `start` is an interval or range string.
   */
  constructor(start, end) {
    if (end === undefined) {
      if (typeof start !== 'string') {
        throw new TypeError('DateRange expects an interval string ("start/end" or "[start,end)") or a start and an end');
      }
      [start, end] = splitInterval(start);
    }

    this.#start = toTime(start, 'start');
    this.#end = toTime(end, 'end');

    if (this.#start > this.#end) {
      throw new RangeError('DateRange start must not be after its end');
    }
  }

  /** @returns {Date} A copy of the start, so callers cannot mutate the range. */
  get start() {
    return new Date(this.#start);
  }

  /** @returns {Date} A copy of the end, so callers cannot mutate the range. */
  get end() {
    return new Date(this.#end);
  }

  /** @returns {string} The range as an ISO 8601 interval in UTC, e.g. "2026-01-01T00:00:00.000Z/2026-02-01T00:00:00.000Z". */
  get iso8601() {
    return `${this.start.toISOString()}/${this.end.toISOString()}`;
  }

  /**
   * Whether this range shares at least one instant with `other`.
   * @param {Date|DateRange} other
   * @returns {boolean}
   */
  overlaps(other) {
    const [start, end] = bounds(other);
    return this.#start <= end && start <= this.#end;
  }

  /**
   * Whether `other` lies entirely within this range.
   * @param {Date|DateRange} other
   * @returns {boolean}
   */
  contains(other) {
    const [start, end] = bounds(other);
    return this.#start <= start && end <= this.#end;
  }

  /**
   * Formats the range with `Intl.DateTimeFormat.prototype.formatRange` in the default locale.
   * @param {Intl.DateTimeFormatOptions} [options]
   * @returns {string}
   */
  format(options) {
    return new Intl.DateTimeFormat(undefined, options).formatRange(this.#start, this.#end);
  }

  toString() {
    return this.iso8601;
  }

  toJSON() {
    return this.iso8601;
  }
}

const POSTGRES_RANGE = /^\s*([[(])\s*(.*?)\s*,\s*(.*?)\s*([\])])\s*$/;
const START_BRACKET = /^\s*([[(])?\s*(.*?)\s*$/;
const END_BRACKET = /^\s*(.*?)\s*([\])])?\s*$/;
const DATE_ONLY = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

// Returns [start, end] with any range brackets left on the bounds for toTime to read.
function splitInterval(value) {
  const range = POSTGRES_RANGE.exec(value);
  if (range) {
    const [, open, start, end, close] = range;
    return [open + start, end + close];
  }
  const parts = value.split('/');
  if (parts.length !== 2) {
    throw new TypeError(`Invalid interval: "${value}"`);
  }
  return parts;
}

function toTime(value, name) {
  if (value instanceof Date) {
    const time = value.getTime();
    if (Number.isNaN(time)) {
      throw new RangeError(`Invalid DateRange ${name}: Invalid Date`);
    }
    return time;
  }
  if (typeof value !== 'string') {
    throw new TypeError(`DateRange ${name} must be a string or a Date`);
  }

  const isStart = name === 'start';
  const [, a, b] = (isStart ? START_BRACKET : END_BRACKET).exec(value);
  const [bracket, text] = isStart ? [a, b] : [b, a];
  const exclusive = bracket === '(' || bracket === ')';
  const bound = unquote(text);

  const time = DATE_ONLY.test(bound)
    ? dateOnlyBound(bound, isStart, exclusive)
    : Date.parse(normalizeDateTime(bound));
  if (Number.isNaN(time)) {
    throw new RangeError(`Invalid DateRange ${name}: "${value}"`);
  }
  return time;
}

// Postgres quotes bounds that contain spaces, e.g. ["2021-01-01 00:00:00+00",...).
function unquote(text) {
  const quoted = /^"(.*)"$/.exec(text);
  return quoted ? quoted[1].replace(/\\(.)/g, '$1') : text;
}

// A date-only bound covers a whole local year, month or day. Including it reaches to the period's
// last millisecond; excluding it stops at the period's edge.
function dateOnlyBound(text, isStart, exclusive) {
  const [, y, m, d] = DATE_ONLY.exec(text).map(Number);
  const year = y;
  const month = m ? m - 1 : 0;
  const day = d || 1;

  const first = localTime(year, month, day);
  const check = new Date(first);
  if (check.getFullYear() !== year || check.getMonth() !== month || check.getDate() !== day) {
    return NaN;
  }
  const next = d ? localTime(year, month, day + 1)
    : m ? localTime(year, month + 1, 1)
    : localTime(year + 1, 0, 1);

  if (isStart) {
    return exclusive ? next - 1 : first;
  }
  return exclusive ? first : next - 1;
}

// Unlike new Date(y, m, d), keeps years 0–99 as written.
function localTime(year, month, day) {
  const date = new Date(0);
  date.setFullYear(year, month, day);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

// Rewrites Postgres timestamps ("2021-01-01 10:00:00.123456+00") into the ECMAScript date-time
// format, which is the only one every engine is required to parse.
function normalizeDateTime(text) {
  const match = DATE_TIME.exec(text);
  if (!match) {
    return text;
  }
  const [, date, hoursMinutes, seconds = '00', fraction = '', offset = ''] = match;
  const millis = fraction.padEnd(3, '0').slice(0, 3);
  let zone = offset.toUpperCase();
  if (/^[+-]\d{2}$/.test(zone)) {
    zone += ':00';
  } else if (/^[+-]\d{4}$/.test(zone)) {
    zone = `${zone.slice(0, 3)}:${zone.slice(3)}`;
  }
  return `${date}T${hoursMinutes}:${seconds}.${millis}${zone}`;
}

function bounds(value) {
  if (value instanceof DateRange) {
    return [value.start.getTime(), value.end.getTime()];
  }
  if (value instanceof Date) {
    const time = toTime(value, 'argument');
    return [time, time];
  }
  throw new TypeError('Expected a Date or a DateRange');
}

export default DateRange;
