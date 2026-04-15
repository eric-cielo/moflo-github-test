const { describe, it } = require('node:test');
const assert = require('node:assert');
const { greet } = require('../src/greet');

describe('greet', () => {
  it('greets by name', () => {
    assert.strictEqual(greet('Alice'), 'Hello, Alice!');
  });

  it('handles empty string', () => {
    assert.strictEqual(greet(''), 'Hello, !');
  });
});
