// Tests for the pure formatting helpers in web/jungle/format.js.
// Run: node --test tests/js/
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { fmtTok, fmtUsd, ago, dur } from '../../web/jungle/format.js';

// Fixed "now" in seconds; Date.now() returns milliseconds.
const NOW = 1_700_000_000;
function freezeTime() {
  beforeEach(() => mock.method(Date, 'now', () => NOW * 1000));
  afterEach(() => mock.restoreAll());
}

describe('fmtTok', () => {
  test('falsy values render as 0', () => {
    for (const v of [0, undefined, null, NaN, '']) assert.equal(fmtTok(v), '0');
  });
  test('below 1000 is the plain number', () => {
    assert.equal(fmtTok(1), '1');
    assert.equal(fmtTok(42), '42');
    assert.equal(fmtTok(999), '999');
  });
  test('thousands use k with one decimal', () => {
    assert.equal(fmtTok(1000), '1.0k');
    assert.equal(fmtTok(1500), '1.5k');
    assert.equal(fmtTok(12_345), '12.3k');
    assert.equal(fmtTok(999_949), '999.9k');
  });
  test('millions use M with one decimal', () => {
    assert.equal(fmtTok(1_000_000), '1.0M');
    assert.equal(fmtTok(2_560_000), '2.6M');
    assert.equal(fmtTok(1_234_567_890), '1234.6M');
  });
  test('just under 1M rounds up inside the k branch', () => {
    // Documents current behaviour: 999,950 is < 1e6 so it takes the k branch
    // and toFixed(1) rounds it to "1000.0k" rather than "1.0M".
    assert.equal(fmtTok(999_950), '1000.0k');
    assert.equal(fmtTok(999_999), '1000.0k');
  });
  test('negative numbers are passed through unabbreviated', () => {
    assert.equal(fmtTok(-5), '-5');
    assert.equal(fmtTok(-5000), '-5000');
  });
});

describe('fmtUsd', () => {
  test('null and undefined render as $0.00', () => {
    assert.equal(fmtUsd(null), '$0.00');
    assert.equal(fmtUsd(undefined), '$0.00');
    assert.equal(fmtUsd(undefined, 4), '$0.00');
  });
  test('zero and default two decimals', () => {
    assert.equal(fmtUsd(0), '$0.00');
    assert.equal(fmtUsd(1), '$1.00');
    assert.equal(fmtUsd(12.3456), '$12.35');
  });
  test('custom decimals, including 0', () => {
    assert.equal(fmtUsd(12.3456, 4), '$12.3456');
    assert.equal(fmtUsd(12.6, 0), '$13');
    assert.equal(fmtUsd(0.00012, 5), '$0.00012');
  });
  test('numeric strings are coerced', () => {
    assert.equal(fmtUsd('3.5'), '$3.50');
  });
  test('large values are not abbreviated', () => {
    assert.equal(fmtUsd(1_234_567.891), '$1234567.89');
  });
  test('rounding follows toFixed (binary floating point)', () => {
    assert.equal(fmtUsd(0.125), '$0.13');
    assert.equal(fmtUsd(1.005), '$1.00'); // 1.005 is stored as 1.00499...
  });
  test('negative values put the sign after $', () => {
    assert.equal(fmtUsd(-2), '$-2.00');
  });
});

describe('ago', () => {
  freezeTime();
  test('falsy timestamps render as empty string', () => {
    for (const v of [0, undefined, null]) assert.equal(ago(v), '');
  });
  test('seconds', () => {
    assert.equal(ago(NOW), '0s ago');
    assert.equal(ago(NOW - 1), '1s ago');
    assert.equal(ago(NOW - 59), '59s ago');
  });
  test('fractional timestamps floor the difference', () => {
    assert.equal(ago(NOW - 59.9), '59s ago');
  });
  test('minutes boundary at 60s', () => {
    assert.equal(ago(NOW - 60), '1m ago');
    assert.equal(ago(NOW - 119), '1m ago');
    assert.equal(ago(NOW - 3599), '59m ago');
  });
  test('hours boundary at 3600s', () => {
    assert.equal(ago(NOW - 3600), '1h ago');
    assert.equal(ago(NOW - 86399), '23h ago');
  });
  test('days boundary at 86400s', () => {
    assert.equal(ago(NOW - 86400), '1d ago');
    assert.equal(ago(NOW - 86400 * 400), '400d ago');
  });
  test('future timestamps currently give a negative seconds string', () => {
    assert.equal(ago(NOW + 5), '-5s ago');
  });
});

describe('dur', () => {
  freezeTime();
  test('falsy start renders as empty string', () => {
    for (const v of [0, undefined, null]) assert.equal(dur(v), '');
  });
  test('seconds only', () => {
    assert.equal(dur(NOW), '0s');
    assert.equal(dur(NOW - 59), '59s');
  });
  test('minutes and seconds', () => {
    assert.equal(dur(NOW - 60), '1m 0s');
    assert.equal(dur(NOW - 61), '1m 1s');
    assert.equal(dur(NOW - 3599), '59m 59s');
  });
  test('hours and minutes (seconds dropped, no day rollover)', () => {
    assert.equal(dur(NOW - 3600), '1h 0m');
    assert.equal(dur(NOW - 3661), '1h 1m');
    assert.equal(dur(NOW - 86400 * 2 - 90), '48h 1m');
  });
  test('fractional start floors elapsed time', () => {
    assert.equal(dur(NOW - 59.9), '59s');
  });
});
