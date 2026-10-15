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
  assert.equal(range.iso8601, JAN);
});

test('accepts Date objects', () => {
  const range = new DateRange(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-31T00:00:00Z'));
  assert.equal(range.iso8601, JAN);
});

const local = (...args) => new Date(...args).getTime();
const startOf = (range) => range.start.getTime();
const endOf = (range) => range.end.getTime();

test('date-only bounds are local and inclusive by default', () => {
  for (const range of [new DateRange('2021-01-01/2021-02-01'), new DateRange('2021-01-01', '2021-02-01')]) {
    assert.equal(startOf(range), local(2021, 0, 1));
    assert.equal(endOf(range), local(2021, 1, 1, 23, 59, 59, 999));
  }
});

test('parses Postgres range syntax', () => {
  let range = new DateRange('[2021-01-01,2021-02-01)');
  assert.equal(startOf(range), local(2021, 0, 1));
  assert.equal(endOf(range), local(2021, 1, 1));

  range = new DateRange('[2021-01-01,2021-02-01]');
  assert.equal(endOf(range), local(2021, 1, 1, 23, 59, 59, 999));

  range = new DateRange('(2021-01-01,2021-02-01]');
  assert.equal(startOf(range), local(2021, 0, 1, 23, 59, 59, 999));

  range = new DateRange(' [ 2021-01-01 , 2021-02-01 ) ');
  assert.equal(endOf(range), local(2021, 1, 1));
});

test('matches the documented local formatting', () => {
  const format = (date) => date.toLocaleString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', second: '2-digit',
  });
  assert.equal(format(new DateRange('[2021-01-01,2021-02-01]').end), '02/01/2021, 11:59:59 PM');
  assert.equal(format(new DateRange('[2021-01-01,2021-02-01)').end), '02/01/2021, 12:00:00 AM');
});

test('reads brackets on separate start and end arguments', () => {
  const range = new DateRange('(2021-01-01', '2021-02-01)');
  assert.equal(startOf(range), local(2021, 0, 1, 23, 59, 59, 999));
  assert.equal(endOf(range), local(2021, 1, 1));
  assert.equal(endOf(new DateRange('2021-01-01', '2021-02-01]')), local(2021, 1, 1, 23, 59, 59, 999));
});

test('reduced-precision dates cover the whole month or year', () => {
  let range = new DateRange('2021-02/2021-03');
  assert.equal(startOf(range), local(2021, 1, 1));
  assert.equal(endOf(range), local(2021, 3, 1) - 1);

  range = new DateRange('[2021,2022)');
  assert.equal(startOf(range), local(2021, 0, 1));
  assert.equal(endOf(range), local(2022, 0, 1));
});

test('bounds with a time ignore brackets', () => {
  const range = new DateRange('(2021-01-01T10:00:00Z,2021-02-01T10:00:00Z)');
  assert.equal(range.iso8601, '2021-01-01T10:00:00.000Z/2021-02-01T10:00:00.000Z');
});

test('parses quoted Postgres timestamps', () => {
  const range = new DateRange('["2021-01-01 00:00:00+00","2021-02-01 10:30:00.123456-05:30")');
  assert.equal(range.iso8601, '2021-01-01T00:00:00.000Z/2021-02-01T16:00:00.123Z');
  assert.equal(new DateRange('[2021-01-01 00:00:00+0530,2021-02-01 00:00:00Z)').start.toISOString(), '2020-12-31T18:30:00.000Z');
});

test('rejects malformed ranges and impossible dates', () => {
  assert.throws(() => new DateRange('[2021-01-01,)'), RangeError, 'unbounded');
  assert.throws(() => new DateRange('empty'), TypeError);
  assert.throws(() => new DateRange('2021-02-30/2021-03-01'), RangeError);
  assert.throws(() => new DateRange('2021-13/2022'), RangeError);
  assert.throws(() => new DateRange('(2021-01-01,2021-01-01)'), RangeError, 'start after end');
  assert.throws(() => new DateRange('2021-01-01]', '2021-02-01'), RangeError, 'closing bracket on start');
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

test('serializes to the ISO 8601 interval', () => {
  const range = new DateRange(JAN);
  assert.equal(String(range), JAN);
  assert.equal(JSON.stringify({ range }), `{"range":"${JAN}"}`);
});
