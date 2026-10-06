import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateExpression} from '../src/service/calculator.js';

const examples = [
  ['12+8', '20'], ['12-8', '4'], ['5*8', '40'], ['10/2', '5'],
  ['1+2*3', '7'], ['(1+2)*3', '9'], ['10/2+7', '12'], ['8-3*2', '2'],
  ['-5+8', '3'], ['3*-2', '-6'], ['+5 + -2', '3'], ['-(2+3)*4', '-20'],
  ['0.1+0.2', '0.3'], ['.5+1.25', '1.75'], ['1.+2', '3'],
  ['12 × 8 ÷ 4', '24'], ['8/4/2', '1'], ['8-3-2', '3'],
  ['1/3', '0.333333333333'], ['2/3', '0.666666666667'],
  ['-1/2000000000000', '-0.000000000001'], ['-0', '0'],
  ['(1/3)*3', '1'], ['2--3', '5'], ['\t2 + 3\n', '5'],
];
for (const [expression, expected] of examples) {
  test(`calculate ${JSON.stringify(expression)} = ${expected}`, () => {
    assert.equal(calculateExpression(expression).result, expected);
  });
}
for (const expression of ['', ' ', '1+', '(2+3', '2+3)', '1..2', '2(3)', '1 2',
  '()', '.', '**', 'Math.sqrt(4)', 'process.exit()', '1;2', '1e3', '2**3',
  '2%1', null, 42, '9'.repeat(31), '1'.repeat(257)]) {
  test(`reject invalid input ${JSON.stringify(expression)}`, () => {
    assert.throws(() => calculateExpression(expression), {name: 'CalculationError'});
  });
}
for (const expression of ['1/0', '1/(3-3)', '0/0', '2/-0']) {
  test(`division by zero ${expression}`, () => {
    assert.throws(() => calculateExpression(expression), {code: 'DIVISION_BY_ZERO'});
  });
}
test('bounded intermediate arithmetic', () => {
  assert.throws(() => calculateExpression(Array(5).fill('9'.repeat(30)).join('*')), {code: 'OUT_OF_RANGE'});
});
