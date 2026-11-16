import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCropRecommendationInput as validate } from '../src/validators/cropRecommendationValidator.js';
import { VALID_BODY } from './helpers.js';

const fieldsOf = (r) => r.errors.map((e) => e.field).sort();

test('accepts a valid body and returns only numbers + season', () => {
  const r = validate(VALID_BODY);
  assert.equal(r.valid, true);
  assert.deepEqual(r.value, VALID_BODY);
});

test('accepts plain decimal strings and converts them to numbers', () => {
  const r = validate({ ...VALID_BODY, ph: ' 6.5 ', nitrogen: '120' });
  assert.equal(r.valid, true);
  assert.equal(r.value.ph, 6.5);
  assert.equal(r.value.nitrogen, 120);
});

test('accepts boundary values', () => {
  assert.equal(validate({ ...VALID_BODY, ph: 3, humidity: 100, rainfall: 0 }).valid, true);
});

test('rejects non-object bodies', () => {
  for (const body of [undefined, null, 'x', 5, [], [VALID_BODY]]) {
    const r = validate(body);
    assert.equal(r.valid, false);
    assert.equal(r.errors[0].field, 'body');
  }
});

test('reports every missing field', () => {
  const r = validate({});
  assert.deepEqual(fieldsOf(r), Object.keys(VALID_BODY).sort());
});

test('rejects out-of-range numbers', () => {
  for (const [field, bad] of [['ph', 10.1], ['ph', 2.9], ['humidity', 100.5], ['rainfall', -1], ['temperature', 51], ['nitrogen', 301]]) {
    const r = validate({ ...VALID_BODY, [field]: bad });
    assert.equal(r.valid, false, `${field}=${bad}`);
    assert.deepEqual(fieldsOf(r), [field]);
  }
});

test('rejects non-numeric, NaN, Infinity, booleans, exponent strings', () => {
  for (const bad of ['abc', '1e3', '0x10', '7,5', NaN, Infinity, -Infinity, true, [], {}, '--1']) {
    assert.equal(validate({ ...VALID_BODY, ph: bad }).valid, false, String(bad));
  }
});

test('blank strings and null count as missing', () => {
  for (const bad of ['', '   ', null]) {
    const r = validate({ ...VALID_BODY, potassium: bad });
    assert.deepEqual(fieldsOf(r), ['potassium']);
    assert.match(r.errors[0].message, /required/i);
  }
});

test('rejects invalid seasons', () => {
  for (const bad of ['Monsoon', 'rabi', 'RABI', 5, ['Rabi'], {}]) {
    assert.deepEqual(fieldsOf(validate({ ...VALID_BODY, season: bad })), ['season'], String(bad));
  }
});

test('rejects unknown fields (no arbitrary payloads), including __proto__ style keys', () => {
  const polluted = JSON.parse('{"__proto__": {"admin": true}, "constructor": 1}');
  const r = validate({ ...VALID_BODY, crop: 'Rice', ...polluted });
  assert.equal(r.valid, false);
  assert.ok(fieldsOf(r).includes('crop'));
});

test('does not mutate its input', () => {
  const input = { ...VALID_BODY, ph: '6.5' };
  validate(input);
  assert.equal(input.ph, '6.5');
});
