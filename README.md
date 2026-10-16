# daterange

A dependency-free, immutable date range class with Postgres range semantics: date bounds behave like `daterange`, timestamp bounds like `tstzrange`.

```js
import DateRange from 'daterange';

const q1 = new DateRange('[2026-01-01,2026-03-31]');
const jan = new DateRange('2026-01-01/2026-01-31');

q1.contains(jan);                                       // true
q1.contains(new Date('2026-03-31T12:00:00Z'));          // true: March 31 is included all day
q1.overlaps(new DateRange('[2026-04-01,2026-06-30]'));  // false
q1.format({ dateStyle: 'medium' });                     // "Jan 1 – Mar 31, 2026"
JSON.stringify(q1);                                     // '"[2026-01-01,2026-04-01)"'
```

## API

### `new DateRange(interval)` / `new DateRange(start, end)`

- `interval`: an ISO 8601 interval (`"2021-01-01/2021-02-01"`), a Postgres range (`"[2021-01-01,2021-02-01)"`), or `"empty"`.
- `start`, `end`: date strings or `Date` objects. Strings may carry a bracket on their outer side: `"[2021-01-01"`, `"2021-02-01)"`.

`[` and `]` make a bound inclusive, `(` and `)` exclusive. A bound with no bracket, including a `Date`, is inclusive. ISO 8601 has no inclusivity syntax, so an ISO interval is read as inclusive at both ends, the same as `[start,end]`.

Strings must be ISO 8601 dates (`2021`, `2021-02`, `2021-02-01`) or date-times (`2021-02-01T10:00:00Z`, or Postgres's `"2021-02-01 10:00:00.123456+00"`, quoted or not). Anything without an offset is read as **UTC**.

**Date bounds** name a whole UTC day, month or year, like a Postgres `daterange`. They are canonicalized the same way, to an inclusive start and an exclusive end on period boundaries:

| Input                     | Stored as                    |
| ------------------------- | ---------------------------- |
| `[2021-01-01,2021-01-31]` | `[2021-01-01,2021-02-01)`    |
| `(2020-12-31,2021-01-31)` | `[2021-01-01,2021-01-31)`    |
| `2021-01/2021-03`         | `[2021-01-01,2021-04-01)`    |

So `[2021-01-01,2021-01-31]` contains `2021-01-31T12:00:00Z`, and its `end` is Feb 1 00:00 UTC with `endInclusive: false`, as Postgres's `upper()` would report.

**Timestamp bounds** keep their instant and bracket, like `tstzrange`. A `Date` holds milliseconds, so fractional seconds beyond that are truncated.

As in Postgres, a range with no instants is empty: `[x,x)`, `(x,x]`, `(x,x)`, and date ranges such as `(2021-01-01,2021-01-02)`.

Throws `TypeError` for malformed arguments, and `RangeError` for other date formats, impossible dates (`2021-02-30`), unbounded ranges (`[2021-01-01,)`), or a start after the end.

### Properties

- `start`, `end`: `Date` copies, so changing them does not change the range. `null` when empty.
- `startInclusive`, `endInclusive`: booleans. `false` when empty, matching Postgres `lower_inc`/`upper_inc`.
- `isEmpty`: whether the range contains no instants.

### Methods

- `overlaps(Date | DateRange)`: like Postgres `&&`. Ranges that only touch at an exclusive bound do not overlap. Empty ranges overlap nothing.
- `contains(Date | DateRange)`: like Postgres `@>`. Every range contains an empty range.
- `format(options)`: `new Intl.DateTimeFormat(undefined, options).formatRange(start, end)`. For a date range it shows the last included day (`Jan 1 – 31`, not `Jan 1 – Feb 1`), and `timeZone` defaults to `'UTC'`. Returns `''` when empty.
- `toString()`, `toJSON()`: Postgres range syntax that the constructor and Postgres both read back unchanged:
  - both bounds dates: `[2021-01-01,2021-02-01)`, as Postgres prints a `daterange`
  - otherwise: UTC timestamps, `[2021-01-01T10:00:00.000Z,2021-02-01T00:00:00.000Z)`, readable as a `tstzrange`
  - `"empty"` when empty

A `Date` argument is treated as the single instant `[date,date]`. Note that `new Date('2021-01-31T12:00:00')` with no offset is *local* time in JavaScript. Add `Z` for UTC.

Tested against Postgres 18 for every bracket combination: date ranges against `daterange` (`&&`, `@>`, text output) and timestamp ranges against `tstzrange`.
