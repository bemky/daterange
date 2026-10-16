export interface DateRangeFormatOptions extends Intl.DateTimeFormatOptions {
  /** Label before the start of a range with no end. Default "Since". */
  after?: string;
  /** Label before the end of a range with no start. Default "Until". */
  before?: string;
}

export declare class DateRange {
  /**
   * Parses an ISO 8601 interval ("start/end"), a Postgres range ("[start,end)") or "empty", or a
   * Ruby range ("start..end" includes the end, "start...end" excludes it).
   * "[" / "]" or no bracket is inclusive, "(" / ")" exclusive. Strings without an offset are UTC.
   * Date-only bounds name whole UTC days and are canonicalized like a Postgres daterange.
   * Unbounded sides: "[2021-01-01,)", "[2021-01-01,infinity)", "2021-01-01/..", "2021-01-01..".
   */
  constructor(interval: string);
  /**
   * Each bound may carry a bracket on its outer side: "[2021-01-01", "2021-02-01)".
   * Null for an unbounded side.
   */
  constructor(start: string | Date | null, end: string | Date | null);

  /** A copy of the start instant, or null when empty or unbounded. */
  readonly start: Date | null;
  /** A copy of the end instant, or null when empty or unbounded. */
  readonly end: Date | null;
  /** Whether `start` is part of the range. False when empty or unbounded. */
  readonly startInclusive: boolean;
  /** Whether `end` is part of the range. False when empty or unbounded. */
  readonly endInclusive: boolean;
  /** Whether the range has no start, like Postgres `lower_inf`. */
  readonly startUnbounded: boolean;
  /** Whether the range has no end, like Postgres `upper_inf`. */
  readonly endUnbounded: boolean;
  /** Whether the range contains no instants. */
  readonly isEmpty: boolean;

  /** Like Postgres `&&`. A Date is the single instant [date,date]. */
  overlaps(other: Date | DateRange): boolean;
  /** Like Postgres `@>`. A Date is the single instant [date,date]. */
  contains(other: Date | DateRange): boolean;
  /**
   * Formats with `new Intl.DateTimeFormat(undefined, options).formatRange(start, end)`.
   * With one bound, formats it after `after` ("Since") or `before` ("Until").
   * A date range shows its last included day and defaults to `timeZone: 'UTC'`.
   * '' when empty or unbounded at both ends.
   */
  format(options?: DateRangeFormatOptions): string;

  /**
   * Postgres range syntax: "[2021-01-01,2021-02-01)" for dates, UTC timestamps otherwise, a blank
   * side when unbounded ("[2021-01-01,)"), or "empty".
   */
  toString(): string;
  /** Same as `toString()`. */
  toJSON(): string;
}

export default DateRange;
