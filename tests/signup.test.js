const assert = require('assert');
const { signup, createUserStore, validateEmail, validatePassword } = require('../src/signup');

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

run('rejects malformed email', () => {
  assert.strictEqual(validateEmail('not-an-email'), 'Invalid email format');
  assert.strictEqual(validateEmail('a@b.c'), null);
});

run('rejects weak password', () => {
  assert.ok(validatePassword('short'));
  assert.ok(validatePassword('alllowercase1'));
  assert.ok(validatePassword('ALLUPPERCASE1'));
  assert.ok(validatePassword('NoNumbersHere'));
  assert.strictEqual(validatePassword('Strong1Password'), null);
});

run('signup throws on invalid email', () => {
  const store = createUserStore();
  assert.throws(() => signup({ email: 'bad', password: 'Strong1Password' }, { store }), {
    code: 'INVALID_EMAIL',
  });
});

run('signup throws on weak password', () => {
  const store = createUserStore();
  assert.throws(() => signup({ email: 'a@b.co', password: 'weak' }, { store }), {
    code: 'WEAK_PASSWORD',
  });
});

run('successful signup returns session token and persists user', () => {
  const store = createUserStore();
  const result = signup({ email: 'Jane@Example.com', password: 'Strong1Password' }, { store });
  assert.ok(result.sessionToken && result.sessionToken.length >= 32);
  assert.strictEqual(result.user.email, 'jane@example.com');
  assert.ok(result.user.id);
  assert.strictEqual(store.all().length, 1);
  assert.ok(store.findByEmail('jane@example.com'));
});

run('duplicate email is rejected with clear error', () => {
  const store = createUserStore();
  signup({ email: 'dup@example.com', password: 'Strong1Password' }, { store });
  assert.throws(
    () => signup({ email: 'DUP@example.com', password: 'Strong1Password' }, { store }),
    (err) => err.code === 'EMAIL_TAKEN' && /already exists/i.test(err.message),
  );
  assert.strictEqual(store.all().length, 1);
});

run('password is not stored in plaintext', () => {
  const store = createUserStore();
  signup({ email: 'secure@example.com', password: 'Strong1Password' }, { store });
  const user = store.findByEmail('secure@example.com');
  assert.ok(!Object.values(user).includes('Strong1Password'));
  assert.ok(user.passwordHash && user.passwordSalt);
});
