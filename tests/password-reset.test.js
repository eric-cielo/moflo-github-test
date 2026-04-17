const assert = require('assert');
const { signup, createUserStore } = require('../src/signup');
const { login, createRateLimiter } = require('../src/login');
const {
  requestPasswordReset,
  resetPassword,
  createResetTokenStore,
  createSessionStore,
  DEFAULT_TTL_MS,
} = require('../src/password-reset');

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
  const sessionStore = createSessionStore();
  const user = signup({ email: 'user@example.com', password: 'Strong1Password' }, { store });
  sessionStore.register(user.sessionToken, user.user.id);
  return { store, sessionStore, user: user.user };
}

run('request returns a token and expiry one hour in the future', () => {
  const { store } = seeded();
  const resetTokens = createResetTokenStore();
  const t0 = 1_000_000;
  const res = requestPasswordReset(
    { email: 'user@example.com' },
    { store, resetTokens, now: () => new Date(t0) },
  );
  assert.ok(res && typeof res.token === 'string' && res.token.length >= 32);
  assert.strictEqual(res.expiresAt, t0 + DEFAULT_TTL_MS);
});

run('request is case-insensitive on email', () => {
  const { store } = seeded();
  const resetTokens = createResetTokenStore();
  const res = requestPasswordReset({ email: 'USER@example.com' }, { store, resetTokens });
  assert.ok(res && res.token);
});

run('request for unknown email returns null (no enumeration)', () => {
  const { store } = seeded();
  const resetTokens = createResetTokenStore();
  const res = requestPasswordReset({ email: 'missing@example.com' }, { store, resetTokens });
  assert.strictEqual(res, null);
});

run('request for non-string email returns null', () => {
  const { store } = seeded();
  const resetTokens = createResetTokenStore();
  assert.strictEqual(requestPasswordReset({ email: null }, { store, resetTokens }), null);
  assert.strictEqual(requestPasswordReset({}, { store, resetTokens }), null);
});

run('requesting again invalidates the prior token', () => {
  const { store } = seeded();
  const resetTokens = createResetTokenStore();
  const first = requestPasswordReset({ email: 'user@example.com' }, { store, resetTokens });
  requestPasswordReset({ email: 'user@example.com' }, { store, resetTokens });
  assert.strictEqual(resetTokens.get(first.token), null);
});

run('reset with valid token sets a new password', () => {
  const { store, sessionStore } = seeded();
  const resetTokens = createResetTokenStore();
  const { token } = requestPasswordReset(
    { email: 'user@example.com' },
    { store, resetTokens },
  );
  resetPassword(
    { token, newPassword: 'NewStrong1Pass' },
    { store, resetTokens, sessionStore },
  );
  const rateLimiter = createRateLimiter();
  const res = login(
    { email: 'user@example.com', password: 'NewStrong1Pass' },
    { store, rateLimiter },
  );
  assert.ok(res.sessionToken);
});

run('old password no longer works after reset', () => {
  const { store, sessionStore } = seeded();
  const resetTokens = createResetTokenStore();
  const { token } = requestPasswordReset(
    { email: 'user@example.com' },
    { store, resetTokens },
  );
  resetPassword(
    { token, newPassword: 'NewStrong1Pass' },
    { store, resetTokens, sessionStore },
  );
  const rateLimiter = createRateLimiter();
  assert.throws(
    () => login({ email: 'user@example.com', password: 'Strong1Password' }, { store, rateLimiter }),
    (err) => err.code === 'INVALID_CREDENTIALS',
  );
});

run('reset token is single-use', () => {
  const { store, sessionStore } = seeded();
  const resetTokens = createResetTokenStore();
  const { token } = requestPasswordReset(
    { email: 'user@example.com' },
    { store, resetTokens },
  );
  resetPassword(
    { token, newPassword: 'NewStrong1Pass' },
    { store, resetTokens, sessionStore },
  );
  assert.throws(
    () =>
      resetPassword(
        { token, newPassword: 'AnotherStrong1' },
        { store, resetTokens, sessionStore },
      ),
    (err) => err.code === 'INVALID_TOKEN',
  );
});

run('reset token expires after 1 hour', () => {
  const { store, sessionStore } = seeded();
  const resetTokens = createResetTokenStore();
  let t = 1_000_000;
  const now = () => new Date(t);
  const { token } = requestPasswordReset(
    { email: 'user@example.com' },
    { store, resetTokens, now },
  );
  t += DEFAULT_TTL_MS + 1;
  assert.throws(
    () =>
      resetPassword(
        { token, newPassword: 'NewStrong1Pass' },
        { store, resetTokens, sessionStore, now },
      ),
    (err) => err.code === 'INVALID_TOKEN',
  );
});

run('reset token still valid just before 1 hour', () => {
  const { store, sessionStore } = seeded();
  const resetTokens = createResetTokenStore();
  let t = 1_000_000;
  const now = () => new Date(t);
  const { token } = requestPasswordReset(
    { email: 'user@example.com' },
    { store, resetTokens, now },
  );
  t += DEFAULT_TTL_MS - 1;
  resetPassword(
    { token, newPassword: 'NewStrong1Pass' },
    { store, resetTokens, sessionStore, now },
  );
});

run('reset rejects weak new password', () => {
  const { store, sessionStore } = seeded();
  const resetTokens = createResetTokenStore();
  const { token } = requestPasswordReset(
    { email: 'user@example.com' },
    { store, resetTokens },
  );
  assert.throws(
    () =>
      resetPassword(
        { token, newPassword: 'weak' },
        { store, resetTokens, sessionStore },
      ),
    (err) => err.code === 'WEAK_PASSWORD',
  );
});

run('reset rejects unknown/invalid token', () => {
  const { store, sessionStore } = seeded();
  const resetTokens = createResetTokenStore();
  assert.throws(
    () =>
      resetPassword(
        { token: 'does-not-exist', newPassword: 'NewStrong1Pass' },
        { store, resetTokens, sessionStore },
      ),
    (err) => err.code === 'INVALID_TOKEN',
  );
  assert.throws(
    () =>
      resetPassword(
        { token: null, newPassword: 'NewStrong1Pass' },
        { store, resetTokens, sessionStore },
      ),
    (err) => err.code === 'INVALID_TOKEN',
  );
});

run('all existing sessions are invalidated on reset', () => {
  const { store, sessionStore, user } = seeded();
  const rateLimiter = createRateLimiter();
  const second = login(
    { email: 'user@example.com', password: 'Strong1Password' },
    { store, rateLimiter },
  );
  sessionStore.register(second.sessionToken, user.id);
  assert.strictEqual(sessionStore.size(), 2);

  const resetTokens = createResetTokenStore();
  const { token } = requestPasswordReset(
    { email: 'user@example.com' },
    { store, resetTokens },
  );
  resetPassword(
    { token, newPassword: 'NewStrong1Pass' },
    { store, resetTokens, sessionStore },
  );

  assert.strictEqual(sessionStore.size(), 0);
});
