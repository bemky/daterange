export declare class DateRange {
  /**
   * Parses an ISO 8601 interval ("start/end") or a Postgres range ("[start,end)").
   * Date-only bounds are local; "[" / "]" or no bracket includes the whole day, "(" / ")" excludes it.
   */
  constructor(interval: string);
  /** Each bound may carry a bracket on its outer side: "[2021-01-01", "2021-02-01)". */
  constructor(start: string | Date, end: string | Date);

  /** A copy of the start instant. */
  readonly start: Date;
  /** A copy of the end instant. */
  readonly end: Date;
  /** The range as an ISO 8601 interval in UTC. */
  readonly iso8601: string;

  /** Whether this range shares at least one instant with `other` (ends inclusive). */
  overlaps(other: Date | DateRange): boolean;
  /** Whether `other` lies entirely within this range (ends inclusive). */
  contains(other: Date | DateRange): boolean;
  /** Formats with `new Intl.DateTimeFormat(undefined, options).formatRange(start, end)`. */
  format(options?: Intl.DateTimeFormatOptions): string;

  toString(): string;
  toJSON(): string;
}

export default DateRange;
