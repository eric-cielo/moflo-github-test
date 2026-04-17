const assert = require('assert');
const { signup, createUserStore } = require('../src/signup');
const { login, createRateLimiter, GENERIC_ERROR } = require('../src/login');

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

function seeded() {
  const store = createUserStore();
  signup({ email: 'user@example.com', password: 'Strong1Password' }, { store });
  return store;
}

run('successful login returns a session token and user', () => {
  const store = seeded();
  const rateLimiter = createRateLimiter();
  const result = login(
    { email: 'user@example.com', password: 'Strong1Password' },
    { store, rateLimiter },
  );
  assert.ok(result.sessionToken && result.sessionToken.length >= 32);
  assert.strictEqual(result.user.email, 'user@example.com');
  assert.ok(result.user.id);
});

run('login is case-insensitive on email', () => {
  const store = seeded();
  const rateLimiter = createRateLimiter();
  const result = login(
    { email: 'USER@example.com', password: 'Strong1Password' },
    { store, rateLimiter },
  );
  assert.strictEqual(result.user.email, 'user@example.com');
});

run('wrong password returns generic error', () => {
  const store = seeded();
  const rateLimiter = createRateLimiter();
  assert.throws(
    () => login({ email: 'user@example.com', password: 'WrongPass1' }, { store, rateLimiter }),
    (err) => err.code === 'INVALID_CREDENTIALS' && err.message === GENERIC_ERROR,
  );
});

run('unknown email returns same generic error (no enumeration)', () => {
  const store = seeded();
  const rateLimiter = createRateLimiter();
  assert.throws(
    () => login({ email: 'missing@example.com', password: 'Strong1Password' }, { store, rateLimiter }),
    (err) => err.code === 'INVALID_CREDENTIALS' && err.message === GENERIC_ERROR,
  );
});

run('non-string email or password returns generic error', () => {
  const store = seeded();
  const rateLimiter = createRateLimiter();
  assert.throws(
    () => login({ email: null, password: 'Strong1Password' }, { store, rateLimiter }),
    (err) => err.code === 'INVALID_CREDENTIALS',
  );
  assert.throws(
    () => login({ email: 'user@example.com', password: 123 }, { store, rateLimiter }),
    (err) => err.code === 'INVALID_CREDENTIALS',
  );
});

run('rate limiter blocks after too many failed attempts', () => {
  const store = seeded();
  const rateLimiter = createRateLimiter({ maxAttempts: 3, windowMs: 60_000 });
  for (let i = 0; i < 3; i++) {
    assert.throws(
      () => login({ email: 'user@example.com', password: 'Wrong1Pass' }, { store, rateLimiter }),
      (err) => err.code === 'INVALID_CREDENTIALS',
    );
  }
  assert.throws(
    () => login({ email: 'user@example.com', password: 'Strong1Password' }, { store, rateLimiter }),
    (err) => err.code === 'RATE_LIMITED',
  );
});

run('successful login resets the failure counter', () => {
  const store = seeded();
  const rateLimiter = createRateLimiter({ maxAttempts: 3, windowMs: 60_000 });
  for (let i = 0; i < 2; i++) {
    assert.throws(
      () => login({ email: 'user@example.com', password: 'Wrong1Pass' }, { store, rateLimiter }),
      (err) => err.code === 'INVALID_CREDENTIALS',
    );
  }
  const ok = login(
    { email: 'user@example.com', password: 'Strong1Password' },
    { store, rateLimiter },
  );
  assert.ok(ok.sessionToken);
  for (let i = 0; i < 2; i++) {
    assert.throws(
      () => login({ email: 'user@example.com', password: 'Wrong1Pass' }, { store, rateLimiter }),
      (err) => err.code === 'INVALID_CREDENTIALS',
    );
  }
});

run('rate limit window expires', () => {
  const store = seeded();
  const rateLimiter = createRateLimiter({ maxAttempts: 2, windowMs: 1000 });
  let t = 0;
  const now = () => new Date(t);
  for (let i = 0; i < 2; i++) {
    assert.throws(
      () => login({ email: 'user@example.com', password: 'Wrong1Pass' }, { store, rateLimiter, now }),
      (err) => err.code === 'INVALID_CREDENTIALS',
    );
  }
  assert.throws(
    () => login({ email: 'user@example.com', password: 'Strong1Password' }, { store, rateLimiter, now }),
    (err) => err.code === 'RATE_LIMITED',
  );
  t = 2000;
  const ok = login(
    { email: 'user@example.com', password: 'Strong1Password' },
    { store, rateLimiter, now },
  );
  assert.ok(ok.sessionToken);
});

run('rate limit is per-email', () => {
  const store = createUserStore();
  signup({ email: 'a@example.com', password: 'Strong1Password' }, { store });
  signup({ email: 'b@example.com', password: 'Strong1Password' }, { store });
  const rateLimiter = createRateLimiter({ maxAttempts: 2, windowMs: 60_000 });
  for (let i = 0; i < 2; i++) {
    assert.throws(
      () => login({ email: 'a@example.com', password: 'Wrong1Pass' }, { store, rateLimiter }),
      (err) => err.code === 'INVALID_CREDENTIALS',
    );
  }
  const ok = login(
    { email: 'b@example.com', password: 'Strong1Password' },
    { store, rateLimiter },
  );
  assert.ok(ok.sessionToken);
});
