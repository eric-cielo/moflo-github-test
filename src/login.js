const crypto = require('crypto');

const { createSessionToken } = require('./signup');

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const GENERIC_ERROR = 'Invalid email or password';

function verifyPassword(password, salt, expectedHash) {
  if (typeof password !== 'string' || typeof salt !== 'string' || typeof expectedHash !== 'string') {
    return false;
  }
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function createRateLimiter({ maxAttempts = DEFAULT_MAX_ATTEMPTS, windowMs = DEFAULT_WINDOW_MS } = {}) {
  const attempts = new Map();

  function prune(key, now) {
    const list = attempts.get(key);
    if (!list) return [];
    const fresh = list.filter((t) => now - t < windowMs);
    if (fresh.length) attempts.set(key, fresh);
    else attempts.delete(key);
    return fresh;
  }

  return {
    check: (key, now = Date.now()) => {
      const fresh = prune(key, now);
      return fresh.length < maxAttempts;
    },
    recordFailure: (key, now = Date.now()) => {
      const fresh = prune(key, now);
      fresh.push(now);
      attempts.set(key, fresh);
    },
    reset: (key) => {
      attempts.delete(key);
    },
  };
}

function login(
  { email, password },
  { store, rateLimiter, now = () => new Date() } = {},
) {
  if (!store) throw new Error('store is required');
  if (!rateLimiter) throw new Error('rateLimiter is required');

  const key = typeof email === 'string' ? email.toLowerCase() : '';

  if (!rateLimiter.check(key, now().getTime())) {
    const err = new Error('Too many login attempts. Please try again later.');
    err.code = 'RATE_LIMITED';
    throw err;
  }

  const fail = () => {
    rateLimiter.recordFailure(key, now().getTime());
    const err = new Error(GENERIC_ERROR);
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  };

  if (typeof email !== 'string' || typeof password !== 'string') {
    fail();
  }

  const user = store.findByEmail(email);
  if (!user) {
    fail();
  }

  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    fail();
  }

  rateLimiter.reset(key);

  return {
    user: { id: user.id, email: user.email, createdAt: user.createdAt },
    sessionToken: createSessionToken(),
  };
}

module.exports = {
  login,
  verifyPassword,
  createRateLimiter,
  GENERIC_ERROR,
};
