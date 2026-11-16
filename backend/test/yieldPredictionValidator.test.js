import test from 'node:test';
import assert from 'node:assert/strict';
import { validateYieldPredictionInput as validate } from '../src/validators/yieldPredictionValidator.js';
import { YIELD_BODY } from './helpers.js';

const fieldsOf = (r) => r.errors.map((e) => e.field).sort();

test('accepts a valid body and returns exactly the four features', () => {
  const r = validate(YIELD_BODY);
  assert.equal(r.valid, true);
  assert.deepEqual(r.value, YIELD_BODY);
});

test('trims text and accepts a digit-string year', () => {
  const r = validate({ state: ' Punjab ', season: 'Rabi ', crop: ' Wheat', year: ' 2015 ' });
  assert.deepEqual(r.value, YIELD_BODY);
});

test('boundary years 1997 and 2030 are accepted', () => {
  assert.equal(validate({ ...YIELD_BODY, year: 1997 }).valid, true);
  assert.equal(validate({ ...YIELD_BODY, year: 2030 }).valid, true);
});

test('rejects out-of-range years', () => {
  for (const year of [1996, 2031, 0, -1, 99999]) {
    const r = validate({ ...YIELD_BODY, year });
    assert.deepEqual(fieldsOf(r), ['year'], String(year));
  }
});

test('over-long digit strings get the range error, not a crash', () => {
  assert.match(validate({ ...YIELD_BODY, year: '20155' }).errors[0].message, /between 1997 and 2030/);
  assert.match(validate({ ...YIELD_BODY, year: '999999999' }).errors[0].message, /between 1997 and 2030/);
});

test('rejects non-whole / non-numeric years', () => {
  for (const year of [2015.5, 'abc', '2015.5', '20e2', '-2015', NaN, Infinity, true, [], {}, '0x7df']) {
    assert.deepEqual(fieldsOf(validate({ ...YIELD_BODY, year })), ['year'], String(year));
  }
});

test('all four fields are required', () => {
  assert.deepEqual(fieldsOf(validate({})), ['crop', 'season', 'state', 'year']);
  for (const blank of ['', '   ', null]) {
    assert.deepEqual(fieldsOf(validate({ ...YIELD_BODY, state: blank })), ['state']);
  }
});

test('area and production are rejected as unknown fields (leakage guard)', () => {
  const r = validate({ ...YIELD_BODY, area: 120, production: 4000, Production: 1 });
  assert.equal(r.valid, false);
  assert.deepEqual(fieldsOf(r), ['Production', 'area', 'production']);
});

test('rejects wrong types, overlong text, control characters', () => {
  for (const bad of [5, true, [], {}, 'x'.repeat(101), 'Pun\u0000jab', 'Pun\njab']) {
    assert.deepEqual(fieldsOf(validate({ ...YIELD_BODY, state: bad })), ['state'], JSON.stringify(bad));
  }
});

test('rejects non-object bodies and __proto__ style keys', () => {
  for (const body of [undefined, null, 'x', 1, [], [YIELD_BODY]]) assert.equal(validate(body).errors[0].field, 'body');
  const polluted = JSON.parse('{"__proto__": {"admin": true}}');
  assert.equal(validate({ ...YIELD_BODY, ...polluted }).valid, false);
});
