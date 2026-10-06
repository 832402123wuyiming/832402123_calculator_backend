/** A limited arithmetic grammar; user input is never executed as code. */
export class CalculationError extends Error {
  constructor(message, code = 'INVALID_EXPRESSION') {
    super(message);
    this.name = 'CalculationError';
    this.code = code;
    this.status = 400;
  }
}

function gcd(a, b) {
  a = a < 0n ? -a : a;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

/** Reduced fractions preserve decimal arithmetic until final formatting. */
class Fraction {
  constructor(numerator, denominator = 1n) {
    if (denominator === 0n) {
      throw new CalculationError('Division by zero is not allowed.', 'DIVISION_BY_ZERO');
    }
    if (denominator < 0n) {
      numerator = -numerator;
      denominator = -denominator;
    }
    const divisor = gcd(numerator, denominator);
    this.n = numerator / divisor;
    this.d = denominator / divisor;
    if (this.n.toString().length > 120 || this.d.toString().length > 120) {
      throw new CalculationError('The calculation exceeds the supported numeric range.', 'OUT_OF_RANGE');
    }
  }

  operate(operator, other) {
    switch (operator) {
      case '+': return new Fraction(this.n * other.d + other.n * this.d, this.d * other.d);
      case '-': return new Fraction(this.n * other.d - other.n * this.d, this.d * other.d);
      case '*': return new Fraction(this.n * other.n, this.d * other.d);
      case '/': return new Fraction(this.n * other.d, this.d * other.n);
      default: throw new CalculationError('Unsupported operator.');
    }
  }

  format() {
    const scale = 10n ** 12n;
    const absolute = this.n < 0n ? -this.n : this.n;
    let scaled = absolute * scale / this.d;
    if ((absolute * scale % this.d) * 2n >= this.d) scaled += 1n;
    const whole = scaled / scale;
    const fractional = (scaled % scale).toString().padStart(12, '0').replace(/0+$/, '');
    const sign = this.n < 0n && scaled !== 0n ? '-' : '';
    return `${sign}${whole}${fractional ? `.${fractional}` : ''}`;
  }
}

export function calculateExpression(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new CalculationError('Enter a mathematical expression.');
  }
  if (input.length > 256) {
    throw new CalculationError('Expressions must contain at most 256 characters.', 'EXPRESSION_TOO_LONG');
  }
  const expression = input.trim().replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-');
  if (!/^[\d\s.+*/()-]+$/.test(expression)) {
    throw new CalculationError('Only numbers, +, -, *, /, and parentheses are allowed.');
  }
  const tokens = [];
  let position = 0;
  while (position < expression.length) {
    if (/\s/.test(expression[position])) { position += 1; continue; }
    const number = expression.slice(position).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (number) {
      if (number[0].replace('.', '').length > 30) {
        throw new CalculationError('A number may contain at most 30 digits.', 'OUT_OF_RANGE');
      }
      tokens.push({type: 'number', value: number[0]});
      position += number[0].length;
    } else if ('+-*/()'.includes(expression[position])) {
      tokens.push({type: expression[position], value: expression[position]});
      position += 1;
    } else {
      throw new CalculationError(`Invalid character at position ${position + 1}.`);
    }
  }
  let cursor = 0;
  const take = (type) => {
    if (tokens[cursor]?.type === type) { cursor += 1; return true; }
    return false;
  };
  function primary() {
    if (take('(')) {
      const value = sum();
      if (!take(')')) throw new CalculationError('A closing parenthesis is missing.');
      return value;
    }
    const token = tokens[cursor];
    if (token?.type !== 'number') {
      throw new CalculationError('Expected a number or an opening parenthesis.');
    }
    cursor += 1;
    const [whole, decimal = ''] = token.value.split('.');
    return new Fraction(BigInt(`${whole || '0'}${decimal}`), 10n ** BigInt(decimal.length));
  }
  function unary() {
    if (take('+')) return unary();
    if (take('-')) {
      const value = unary();
      return new Fraction(-value.n, value.d);
    }
    return primary();
  }
  function product() {
    let value = unary();
    while (['*', '/'].includes(tokens[cursor]?.type)) {
      const operator = tokens[cursor++].type;
      value = value.operate(operator, unary());
    }
    return value;
  }
  function sum() {
    let value = product();
    while (['+', '-'].includes(tokens[cursor]?.type)) {
      const operator = tokens[cursor++].type;
      value = value.operate(operator, product());
    }
    return value;
  }
  const result = sum();
  if (cursor !== tokens.length) {
    throw new CalculationError('Unexpected token. Use an operator between numbers and parentheses.');
  }
  return {expression, result: result.format()};
}
