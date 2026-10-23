import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHealth } from '../src/utils/healthScore.ts';
test('requires enough samples', () => {
  const result = evaluateHealth([{rpm: 100}]);
  assert.equal(result.score, null);
});
test('stable motor', () => {
  const result = evaluateHealth(Array.from({length: 6}, (_,i) => ({rpm: 100, power: 0.7, ticks: i * 100})));
  assert.equal(result.score, 100);
});
test('stalled motor', () => {
  const result = evaluateHealth(Array.from({length: 6}, () => ({rpm: 0, power: 0.9, ticks: 0})));
  assert.ok(result.score < 80);
});
