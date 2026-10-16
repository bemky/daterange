export declare class DateRange {
  /**
   * Parses an ISO 8601 interval ("start/end"), a Postgres range ("[start,end)") or "empty", or a
   * Ruby range ("start..end" includes the end, "start...end" excludes it).
   * "[" / "]" or no bracket is inclusive, "(" / ")" exclusive. Strings without an offset are UTC.
   * Date-only bounds name whole UTC days and are canonicalized like a Postgres daterange.
   */
  constructor(interval: string);
  /** Each bound may carry a bracket on its outer side: "[2021-01-01", "2021-02-01)". */
  constructor(start: string | Date, end: string | Date);

  /** A copy of the start instant, or null when empty. */
  readonly start: Date | null;
  /** A copy of the end instant, or null when empty. */
  readonly end: Date | null;
  /** Whether `start` is part of the range. False when empty. */
  readonly startInclusive: boolean;
  /** Whether `end` is part of the range. False when empty. */
  readonly endInclusive: boolean;
  /** Whether the range contains no instants. */
  readonly isEmpty: boolean;

  /** Like Postgres `&&`. A Date is the single instant [date,date]. */
  overlaps(other: Date | DateRange): boolean;
  /** Like Postgres `@>`. A Date is the single instant [date,date]. */
  contains(other: Date | DateRange): boolean;
  /**
   * Formats with `new Intl.DateTimeFormat(undefined, options).formatRange(start, end)`; '' when empty.
   * A date range shows its last included day and defaults to `timeZone: 'UTC'`.
   */
  format(options?: Intl.DateTimeFormatOptions): string;

  /** Postgres range syntax: "[2021-01-01,2021-02-01)" for dates, UTC timestamps otherwise, or "empty". */
  toString(): string;
  /** Same as `toString()`. */
  toJSON(): string;
}

export default DateRange;
