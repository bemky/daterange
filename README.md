# daterange

A dependency-free, immutable date range class.

```js
import DateRange from 'daterange';

const q1 = new DateRange('[2026-01-01,2026-03-31]');
const jan = new DateRange('2026-01-01', '2026-01-31');

q1.contains(jan);                         // true
q1.overlaps(new Date(2026, 3, 1));        // false: April 1, local midnight
q1.iso8601;                               // in UTC; in Chicago: "2026-01-01T06:00:00.000Z/2026-04-01T04:59:59.999Z"
q1.format({ dateStyle: 'medium' });       // "Jan 1 – Mar 31, 2026"
```

## API

### `new DateRange(interval)` / `new DateRange(start, end)`

- `interval`: an ISO 8601 interval (`"2021-01-01/2021-02-01"`) or a Postgres range (`"[2021-01-01,2021-02-01)"`).
- `start`, `end`: date strings or `Date` objects. Strings may carry a bracket on their outer side: `"[2021-01-01"`, `"2021-02-01)"`.

**Date-only bounds** (`2021`, `2021-02`, `2021-02-01`) are read in local time and cover that whole year, month or day. The bracket decides how much of the period the range takes:

| Bound              | Becomes (local)          |
| ------------------ | ------------------------ |
| `[2021-02-01`      | 02/01/2021, 12:00:00 AM  |
| `(2021-02-01`      | 02/01/2021, 11:59:59 PM  |
| `2021-02-01]`      | 02/01/2021, 11:59:59 PM  |
| `2021-02-01)`      | 02/01/2021, 12:00:00 AM  |

A bound with no bracket is inclusive. Times are set to the millisecond, so "11:59:59 PM" means 23:59:59.999.

**Bounds with a time** (`2021-02-01T10:00:00Z`, or Postgres's `"2021-02-01 10:00:00+00"`) are used exactly as given, and brackets do not move them. A time without an offset is read in local time.

Throws `TypeError` for malformed arguments, and `RangeError` for unparseable or impossible dates (`2021-02-30`), unbounded Postgres ranges (`[2021-01-01,)`), or a start after the end.

### Properties

- `start`, `end`: `Date` copies. Changing them does not change the range.
- `iso8601`: the range as an ISO 8601 interval in UTC.

### Methods

- `overlaps(Date | DateRange)`: true if the two share at least one instant.
- `contains(Date | DateRange)`: true if the argument lies entirely within the range.
- `format(options)`: `new Intl.DateTimeFormat(undefined, options).formatRange(start, end)`.
- `toString()`, `toJSON()`: return `iso8601`.

After parsing, the stored `start` and `end` are both inclusive, so ranges that touch at an endpoint overlap. `[2021-01-01,2021-02-01)` and `[2021-02-01,2021-03-01)` share the instant 2021-02-01 00:00.
