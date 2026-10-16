import { test } from 'node:test';
import assert from 'node:assert/strict';
import DateRange from '../src/index.js';

const JAN = '2026-01-01T00:00:00.000Z/2026-01-31T00:00:00.000Z';

test('parses an ISO 8601 interval string', () => {
  const range = new DateRange(JAN);
  assert.equal(range.start.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-01-31T00:00:00.000Z');
});

test('parses separate start and end strings', () => {
  const range = new DateRange('2026-01-01T00:00:00Z', '2026-01-31T00:00:00Z');
  assert.equal(String(range), '[2026-01-01T00:00:00.000Z,2026-01-31T00:00:00.000Z]');
});

test('accepts Date objects', () => {
  const range = new DateRange(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-31T00:00:00Z'));
  assert.equal(String(range), '[2026-01-01T00:00:00.000Z,2026-01-31T00:00:00.000Z]');
});

test('has no iso8601 property', () => {
  assert.ok(!('iso8601' in new DateRange(JAN)));
});

const at = (iso) => new Date(iso);
const bounds = (range) => [range.start?.toISOString(), range.end?.toISOString(), range.startInclusive, range.endInclusive];

test('strings without an offset are UTC', () => {
  assert.equal(String(new DateRange('2021-01-01T10:00', '2021-02-01 10:00:00')), '[2021-01-01T10:00:00.000Z,2021-02-01T10:00:00.000Z]');
  assert.equal(new DateRange('2021-01-01/2021-02-01').start.toISOString(), '2021-01-01T00:00:00.000Z');
});

test('unbracketed bounds are inclusive', () => {
  assert.deepEqual(bounds(new DateRange(JAN)).slice(2), [true, true]);
  assert.deepEqual(bounds(new DateRange(at('2021-01-01'), at('2021-02-01'))).slice(2), [true, true]);
  assert.equal(String(new DateRange('2021-01-01/2021-01-31')), '[2021-01-01,2021-02-01)');
  assert.equal(String(new DateRange('2021-01-01', '2021-01-31')), '[2021-01-01,2021-02-01)');
});

test('timestamp bounds keep their brackets and instants', () => {
  const [a, b] = ['2021-01-01T00:00:00.000Z', '2021-02-01T00:00:00.000Z'];
  assert.deepEqual(bounds(new DateRange(`[${a},${b})`)), [a, b, true, false]);
  assert.deepEqual(bounds(new DateRange(`(${a},${b}]`)), [a, b, false, true]);
  assert.deepEqual(bounds(new DateRange(`(${a},${b})`)), [a, b, false, false]);
  assert.deepEqual(bounds(new DateRange(` [ ${a} , ${b} ) `)), [a, b, true, false]);
  assert.deepEqual(bounds(new DateRange(`(${a}`, `${b})`)), [a, b, false, false]);
});

test('date bounds name whole UTC days, canonicalized like a Postgres daterange', () => {
  const jan = new DateRange('[2021-01-01,2021-01-31]');
  assert.ok(jan.contains(at('2021-01-31T12:00:00Z')));
  assert.ok(jan.contains(at('2021-01-31T23:59:59.999Z')));
  assert.ok(!jan.contains(at('2021-02-01T00:00:00Z')));
  assert.deepEqual(bounds(jan), ['2021-01-01T00:00:00.000Z', '2021-02-01T00:00:00.000Z', true, false]);

  const afterNewYearsEve = new DateRange('(2020-12-31,2021-02-01)');
  assert.ok(!afterNewYearsEve.contains(at('2020-12-31T12:00:00Z')));
  assert.equal(String(afterNewYearsEve), '[2021-01-01,2021-02-01)');
  assert.equal(String(new DateRange('(2020-12-31', '2021-01-31]')), '[2021-01-01,2021-02-01)');
  assert.equal(String(new DateRange('[2021-01-01,2021-01-01]')), '[2021-01-01,2021-01-02)');
});

test('reduced-precision dates name whole months and years', () => {
  assert.equal(String(new DateRange('2021-02/2021-03')), '[2021-02-01,2021-04-01)');
  assert.equal(String(new DateRange('(2021,2022]')), '[2022-01-01,2023-01-01)');
});

test('a date bound beside a timestamp bound', () => {
  assert.equal(String(new DateRange('2021-01-01', '2021-01-31T12:00:00Z')), '[2021-01-01T00:00:00.000Z,2021-01-31T12:00:00.000Z]');
  assert.equal(String(new DateRange('[2021-01-01T12:00Z,2021-01-31]')), '[2021-01-01T12:00:00.000Z,2021-02-01T00:00:00.000Z)');
});

test('parses Ruby ranges: .. includes the end, ... excludes it', () => {
  assert.equal(String(new DateRange('2019-01-01..2019-04-01')), '[2019-01-01,2019-04-02)');
  assert.equal(String(new DateRange('2019-01-01...2019-04-01')), '[2019-01-01,2019-04-01)');
  assert.equal(String(new DateRange(' 2019-01-01...2019-04-01 ')), '[2019-01-01,2019-04-01)');
  assert.ok(new DateRange('2019-01-01..2019-04-01').contains(at('2019-04-01T12:00:00Z')));
  assert.ok(!new DateRange('2019-01-01...2019-04-01').contains(at('2019-04-01T00:00:00Z')));
  assert.ok(new DateRange('2019-01-01...2019-01-01').isEmpty);
});

test('parses Ruby Time#to_s bounds', () => {
  assert.equal(
    String(new DateRange('2019-01-01 00:00:00 UTC...2019-04-01 10:00:00.5 +0530')),
    '[2019-01-01T00:00:00.000Z,2019-04-01T04:30:00.500Z)',
  );
  assert.equal(
    String(new DateRange('2019-01-01T00:00:00.123Z..2019-04-01T00:00:00Z')),
    '[2019-01-01T00:00:00.123Z,2019-04-01T00:00:00.000Z]',
  );
});

test('rejects endless and beginless Ruby ranges', () => {
  assert.throws(() => new DateRange('2019-01-01..'), RangeError);
  assert.throws(() => new DateRange('...2019-04-01'), RangeError);
  assert.throws(() => new DateRange('2019-01-01....2019-04-01'), RangeError);
  assert.throws(() => new DateRange('2019-01-01/..'), RangeError, 'ISO 8601-2 open end');
});

test('parses quoted Postgres timestamps', () => {
  const range = new DateRange('["2021-01-01 00:00:00+00","2021-02-01 10:30:00.123456-05:30")');
  assert.equal(String(range), '[2021-01-01T00:00:00.000Z,2021-02-01T16:00:00.123Z)');
  assert.equal(new DateRange('[2021-01-01 00:00:00+0530,2021-02-01 00:00:00Z)').start.toISOString(), '2020-12-31T18:30:00.000Z');
});

test('empty ranges', () => {
  for (const value of [
    'empty', ' EMPTY ',
    '[2021-01-01T00:00Z,2021-01-01T00:00Z)', '(2021-01-01T00:00Z,2021-01-01T00:00Z]', '(2021-01-01T00:00Z,2021-01-01T00:00Z)',
    '[2021-01-01,2021-01-01)', '(2021-01-01,2021-01-01)', '(2021-01-01,2021-01-02)', '(2021-01-01,2021-01-01T12:00Z]',
  ]) {
    const range = new DateRange(value);
    assert.ok(range.isEmpty, value);
    assert.equal(range.start, null);
    assert.equal(range.end, null);
    assert.equal(range.startInclusive, false);
    assert.equal(range.endInclusive, false);
    assert.equal(String(range), 'empty');
    assert.equal(range.format(), '');
  }
  assert.ok(!new DateRange('[2021-01-01T00:00Z,2021-01-01T00:00Z]').isEmpty, 'a single instant');
});

test('rejects malformed ranges, impossible dates and non-ISO formats', () => {
  assert.throws(() => new DateRange('[2021-01-01,)'), RangeError, 'unbounded');
  assert.throws(() => new DateRange('2021-02-30/2021-03-01'), RangeError);
  assert.throws(() => new DateRange('2021-02-30T00:00Z/2021-03-01'), RangeError);
  assert.throws(() => new DateRange('2021-13/2022'), RangeError);
  assert.throws(() => new DateRange('Jan 1 2021/Feb 1 2021'), RangeError);
  assert.throws(() => new DateRange('2021-01-01]', '2021-02-01'), RangeError, 'closing bracket on start');
});

// Each case: [a, b, a && b, a @> b], checked against Postgres daterange, and against tstzrange with
// the same bounds as midnight timestamps.
const RANGE_CASES = [
  ['[2021-01-01,2021-02-01)', '[2021-02-01,2021-03-01)', false, false],
  ['[2021-01-01,2021-02-01]', '[2021-02-01,2021-03-01)', true, false],
  ['[2021-01-01,2021-02-01]', '(2021-02-01,2021-03-01)', false, false],
  ['[2021-01-01,2021-03-01)', '[2021-01-01,2021-02-01)', true, true],
  ['(2021-01-01,2021-03-01)', '[2021-01-01,2021-02-01)', true, false],
  ['[2021-01-01,2021-02-01)', '(2021-01-01,2021-02-01)', true, true],
  ['(2021-01-01,2021-02-01)', '[2021-01-01,2021-02-01]', true, false],
  ['[2021-01-01,2021-02-01)', '[2021-01-01,2021-02-01]', true, false],
  ['[2021-01-01,2021-02-01)', 'empty', false, true],
  ['empty', 'empty', false, true],
  ['empty', '[2021-01-01,2021-02-01)', false, false],
];

test('range comparisons match Postgres', () => {
  const asTimestamps = (range) => range.replace(/(\d{4}-\d{2}-\d{2})/g, '$1T00:00:00Z');
  for (const convert of [(range) => range, asTimestamps]) {
    for (const [a, b, overlaps, contains] of RANGE_CASES.map(([a, b, ...rest]) => [convert(a), convert(b), ...rest])) {
      assert.equal(new DateRange(a).overlaps(new DateRange(b)), overlaps, `${a} && ${b}`);
      assert.equal(new DateRange(b).overlaps(new DateRange(a)), overlaps, `${b} && ${a}`);
      assert.equal(new DateRange(a).contains(new DateRange(b)), contains, `${a} @> ${b}`);
    }
  }
});

test('Date comparisons respect exclusive bounds', () => {
  const range = new DateRange('[2021-01-01T00:00Z,2021-02-01T00:00Z)');
  assert.ok(range.contains(at('2021-01-01T00:00:00Z')));
  assert.ok(!range.contains(at('2021-02-01T00:00:00Z')));
  assert.ok(range.contains(at('2021-01-31T23:59:59.999Z')));
  assert.ok(!range.overlaps(at('2021-02-01T00:00:00Z')));
  assert.ok(!new DateRange('(2021-01-01T00:00Z,2021-02-01T00:00Z]').contains(at('2021-01-01T00:00:00Z')));
  assert.ok(!new DateRange('(2021-01-01,2021-02-01]').contains(at('2021-01-01T12:00:00Z')), 'excluded day');
  assert.ok(!new DateRange('empty').contains(at('2021-01-01T00:00:00Z')));
});

test('allows a zero-length range', () => {
  const range = new DateRange('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
  assert.equal(range.start.getTime(), range.end.getTime());
});

test('rejects invalid input', () => {
  assert.throws(() => new DateRange('2026-01-01'), TypeError);
  assert.throws(() => new DateRange('a/b/c'), TypeError);
  assert.throws(() => new DateRange(123), TypeError);
  assert.throws(() => new DateRange('nope/2026-01-01'), RangeError);
  assert.throws(() => new DateRange('2026-01-01', new Date('nope')), RangeError);
  assert.throws(() => new DateRange('2026-02-01', '2026-01-01'), RangeError);
});

test('start and end are defensive copies', () => {
  const range = new DateRange(JAN);
  range.start.setUTCFullYear(1999);
  assert.equal(range.start.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.throws(() => { range.start = new Date(); }, TypeError);
});

test('contains a Date, inclusive of both ends', () => {
  const range = new DateRange(JAN);
  assert.ok(range.contains(new Date('2026-01-15T00:00:00Z')));
  assert.ok(range.contains(new Date('2026-01-01T00:00:00Z')));
  assert.ok(range.contains(new Date('2026-01-31T00:00:00Z')));
  assert.ok(!range.contains(new Date('2026-01-31T00:00:00.001Z')));
  assert.ok(!range.contains(new Date('2025-12-31T23:59:59.999Z')));
});

test('contains a DateRange', () => {
  const range = new DateRange(JAN);
  assert.ok(range.contains(new DateRange('2026-01-10T00:00:00Z/2026-01-20T00:00:00Z')));
  assert.ok(range.contains(new DateRange(JAN)));
  assert.ok(!range.contains(new DateRange('2026-01-10T00:00:00Z/2026-02-10T00:00:00Z')));
});

test('overlaps a Date', () => {
  const range = new DateRange(JAN);
  assert.ok(range.overlaps(new Date('2026-01-31T00:00:00Z')));
  assert.ok(!range.overlaps(new Date('2026-02-01T00:00:00Z')));
});

test('overlaps a DateRange', () => {
  const range = new DateRange(JAN);
  assert.ok(range.overlaps(new DateRange('2025-12-15T00:00:00Z/2026-01-05T00:00:00Z')));
  assert.ok(range.overlaps(new DateRange('2026-01-10T00:00:00Z/2026-01-20T00:00:00Z')));
  assert.ok(range.overlaps(new DateRange('2025-12-01T00:00:00Z/2026-03-01T00:00:00Z')));
  assert.ok(range.overlaps(new DateRange('2026-01-31T00:00:00Z/2026-02-10T00:00:00Z')), 'touching ends overlap');
  assert.ok(!range.overlaps(new DateRange('2026-02-01T00:00:00Z/2026-02-10T00:00:00Z')));
});

test('overlaps and contains reject other types', () => {
  const range = new DateRange(JAN);
  assert.throws(() => range.overlaps('2026-01-01'), TypeError);
  assert.throws(() => range.contains(new Date('nope')), RangeError);
});

test('format delegates to Intl.DateTimeFormat#formatRange', () => {
  const range = new DateRange(JAN);
  const options = { dateStyle: 'medium', timeZone: 'UTC' };
  assert.equal(
    range.format(options),
    new Intl.DateTimeFormat(undefined, options).formatRange(range.start, range.end),
  );
});

test('format shows the last included day of a date range, in UTC', () => {
  const range = new DateRange('[2021-01-01,2021-01-31]');
  const utc = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
  assert.equal(range.format({ dateStyle: 'medium' }), utc.formatRange(at('2021-01-01T00:00Z'), at('2021-01-31T00:00Z')));
});

test('serializes to Postgres range syntax', () => {
  assert.equal(JSON.stringify({ range: new DateRange(JAN) }), '{"range":"[2026-01-01T00:00:00.000Z,2026-01-31T00:00:00.000Z]"}');
  assert.equal(JSON.stringify(new DateRange('[2021-01-01,2021-01-31]')), '"[2021-01-01,2021-02-01)"');
  assert.equal(JSON.stringify(new DateRange('empty')), '"empty"');
});

test('round-trips through toJSON', () => {
  for (const value of [JAN, '(2021-01-01T10:00Z,2021-02-01T00:00Z]', '[2021-01-01,2021-01-31]', '2021-01-01/2021-01-31T12:00Z', 'empty']) {
    const range = new DateRange(value);
    const copy = new DateRange(range.toJSON());
    assert.deepEqual([bounds(copy), copy.isEmpty, String(copy)], [bounds(range), range.isEmpty, String(range)], value);
  }
});
