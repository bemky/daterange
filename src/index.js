/**
 * An immutable range between two instants, with Postgres range semantics: each bound is inclusive
 * or exclusive, and a range with no instants in it is empty.
 */
export class DateRange {
  #start;
  #end;
  #startInclusive = false;
  #endInclusive = false;
  #empty = false;
  #dates = false;

  /**
   * Bounds may carry Postgres-style brackets: "[" or "]" is inclusive, "(" or ")" is exclusive.
   * Unbracketed bounds are inclusive. Strings without an offset are read as UTC.
   *
   * A date-only bound names a whole UTC day (or month, or year), as in a Postgres daterange:
   * "[2021-01-01,2021-01-31]" includes all of January 31 and is stored as
   * [2021-01-01T00:00Z, 2021-02-01T00:00Z).
   *
   * @param {string|Date} start An ISO 8601 interval ("start/end"), a Postgres range ("[start,end)"
   *   or "empty"), or the start of the range ("2021-01-01", "[2021-01-01", "(2021-01-01").
   * @param {string|Date} [end] The end of the range ("2021-02-01", "2021-02-01]", "2021-02-01)").
   *   Omit when `start` is an interval or range string.
   */
  constructor(start, end) {
    if (end === undefined) {
      if (typeof start !== 'string') {
        throw new TypeError('DateRange expects an interval string ("start/end" or "[start,end)") or a start and an end');
      }
      if (/^\s*empty\s*$/i.test(start)) {
        this.#empty = true;
        return;
      }
      [start, end] = splitInterval(start);
    }

    let [startTime, startInclusive, startNext] = toBound(start, 'start');
    let [endTime, endInclusive, endNext] = toBound(end, 'end');

    if (startTime > endTime) {
      throw new RangeError('DateRange start must not be after its end');
    }

    // Like Postgres's daterange canonicalization: a date bound becomes an inclusive start or an
    // exclusive end on a period boundary, so (2021-01-01 is [2021-01-02 and 2021-01-31] is 2021-02-01).
    const isEmpty = startTime === endTime && !(startInclusive && endInclusive);
    if (startNext !== undefined && !startInclusive) {
      [startTime, startInclusive] = [startNext, true];
    }
    if (endNext !== undefined && endInclusive) {
      [endTime, endInclusive] = [endNext, false];
    }

    // As in Postgres, [x,x) (x,x] and (x,x) contain no instants.
    if (isEmpty || startTime > endTime || (startTime === endTime && !(startInclusive && endInclusive))) {
      this.#empty = true;
      return;
    }
    this.#start = startTime;
    this.#end = endTime;
    this.#startInclusive = startInclusive;
    this.#endInclusive = endInclusive;
    this.#dates = startNext !== undefined && endNext !== undefined;
  }

  /** @returns {Date|null} A copy of the start, so callers cannot mutate the range. Null when empty. */
  get start() {
    return this.#empty ? null : new Date(this.#start);
  }

  /** @returns {Date|null} A copy of the end, so callers cannot mutate the range. Null when empty. */
  get end() {
    return this.#empty ? null : new Date(this.#end);
  }

  /** @returns {boolean} Whether `start` is part of the range. False when empty. */
  get startInclusive() {
    return this.#startInclusive;
  }

  /** @returns {boolean} Whether `end` is part of the range. False when empty. */
  get endInclusive() {
    return this.#endInclusive;
  }

  /** @returns {boolean} Whether the range contains no instants. */
  get isEmpty() {
    return this.#empty;
  }

  /**
   * Whether this range shares at least one instant with `other`, like Postgres `&&`. For a Date,
   * the same as `contains`.
   * @param {Date|DateRange} other
   * @returns {boolean}
   */
  overlaps(other) {
    const [start, end, startInclusive, endInclusive, empty] = this.#bounds(other);
    if (this.#empty || empty) {
      return false;
    }
    return (this.#start < end || (this.#start === end && this.#startInclusive && endInclusive))
      && (start < this.#end || (start === this.#end && startInclusive && this.#endInclusive));
  }

  /**
   * Whether `other` lies entirely within this range, like Postgres `@>`. Every range contains an
   * empty range.
   * @param {Date|DateRange} other
   * @returns {boolean}
   */
  contains(other) {
    const [start, end, startInclusive, endInclusive, empty] = this.#bounds(other);
    if (empty) {
      return true;
    }
    if (this.#empty) {
      return false;
    }
    return (this.#start < start || (this.#start === start && (this.#startInclusive || !startInclusive)))
      && (end < this.#end || (end === this.#end && (this.#endInclusive || !endInclusive)));
  }

  /**
   * Formats the range with `Intl.DateTimeFormat.prototype.formatRange` in the default locale.
   * A range of dates shows its last included day ("Jan 1 – 31", not "Jan 1 – Feb 1") and defaults
   * to `timeZone: 'UTC'`, since its days are UTC days. Returns an empty string for an empty range.
   * @param {Intl.DateTimeFormatOptions} [options]
   * @returns {string}
   */
  format(options) {
    if (this.#empty) {
      return '';
    }
    if (this.#dates) {
      const lastDay = new Date(this.#end);
      lastDay.setUTCDate(lastDay.getUTCDate() - 1);
      return new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...options }).formatRange(this.#start, lastDay);
    }
    return new Intl.DateTimeFormat(undefined, options).formatRange(this.#start, this.#end);
  }

  /**
   * The range in Postgres syntax: "[2021-01-01,2021-02-01)" when both bounds are dates, otherwise
   * UTC timestamps, e.g. "[2021-01-01T10:00:00.000Z,2021-02-01T10:00:00.000Z)". "empty" when empty.
   * @returns {string}
   */
  toString() {
    if (this.#empty) {
      return 'empty';
    }
    const text = (time) => {
      const iso = new Date(time).toISOString();
      return this.#dates ? iso.slice(0, 10) : iso;
    };
    return `${this.#startInclusive ? '[' : '('}${text(this.#start)},${text(this.#end)}${this.#endInclusive ? ']' : ')'}`;
  }

  toJSON() {
    return this.toString();
  }

  // A Date is treated as the single-instant range [date,date].
  #bounds(other) {
    if (other instanceof DateRange) {
      return [other.#start, other.#end, other.#startInclusive, other.#endInclusive, other.#empty];
    }
    if (other instanceof Date) {
      const [time] = toBound(other, 'argument');
      return [time, time, true, true, false];
    }
    throw new TypeError('Expected a Date or a DateRange');
  }
}

const POSTGRES_RANGE = /^\s*([[(])\s*(.*?)\s*,\s*(.*?)\s*([\])])\s*$/;
const START_BRACKET = /^\s*([[(])?\s*(.*?)\s*$/;
const END_BRACKET = /^\s*(.*?)\s*([\])])?\s*$/;
const DATE_ONLY = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

// Returns [start, end] with any range brackets left on the bounds for toBound to read.
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

// Returns [time, inclusive, next], where next is the start of the following period for a date-only
// bound and undefined otherwise.
function toBound(value, name) {
  if (value instanceof Date) {
    const time = value.getTime();
    if (Number.isNaN(time)) {
      throw new RangeError(`Invalid DateRange ${name}: Invalid Date`);
    }
    return [time, true];
  }
  if (typeof value !== 'string') {
    throw new TypeError(`DateRange ${name} must be a string or a Date`);
  }

  const isStart = name === 'start';
  const [, a, b] = (isStart ? START_BRACKET : END_BRACKET).exec(value);
  const [bracket, text] = isStart ? [a, b] : [b, a];

  const [time, next] = parseUTC(unquote(text));
  if (Number.isNaN(time)) {
    throw new RangeError(`Invalid DateRange ${name}: "${value}"`);
  }
  return [time, bracket !== '(' && bracket !== ')', next];
}

// Postgres quotes bounds that contain spaces, e.g. ["2021-01-01 00:00:00+00",...).
function unquote(text) {
  const quoted = /^"(.*)"$/.exec(text);
  return quoted ? quoted[1].replace(/\\(.)/g, '$1') : text;
}

// Accepts ISO 8601 dates ("2021", "2021-02", "2021-02-01") and date-times, including Postgres's
// "2021-02-01 10:00:00.123456+00". Anything without an offset is UTC. Other formats return NaN,
// since Date.parse would read them in local time or differently across engines.
// Returns [time, next], where next is the start of the following year, month or day for a date.
function parseUTC(text) {
  const dateTime = DATE_TIME.exec(text);
  const date = DATE_ONLY.exec(dateTime ? dateTime[1] : text);
  if (!date) {
    return [NaN];
  }
  const [, year, month, day] = date;
  const midnight = new Date(Date.parse(`${year}-${month ?? '01'}-${day ?? '01'}T00:00:00.000Z`));
  // Date.parse rolls impossible days over, e.g. 2021-02-30 to March 2.
  if (midnight.getUTCFullYear() !== +year || midnight.getUTCMonth() + 1 !== +(month ?? 1) || midnight.getUTCDate() !== +(day ?? 1)) {
    return [NaN];
  }
  if (dateTime) {
    return [Date.parse(normalizeDateTime(dateTime))];
  }

  const next = new Date(midnight);
  if (day) {
    next.setUTCDate(next.getUTCDate() + 1);
  } else if (month) {
    next.setUTCMonth(next.getUTCMonth() + 1);
  } else {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  }
  return [midnight.getTime(), next.getTime()];
}

// Rewrites a DATE_TIME match into the ECMAScript date-time format, which is the only one every
// engine is required to parse.
function normalizeDateTime(match) {
  const [, date, hoursMinutes, seconds = '00', fraction = '', offset = 'Z'] = match;
  const millis = fraction.padEnd(3, '0').slice(0, 3);
  let zone = offset.toUpperCase();
  if (/^[+-]\d{2}$/.test(zone)) {
    zone += ':00';
  } else if (/^[+-]\d{4}$/.test(zone)) {
    zone = `${zone.slice(0, 3)}:${zone.slice(3)}`;
  }
  return `${date}T${hoursMinutes}:${seconds}.${millis}${zone}`;
}

export default DateRange;
