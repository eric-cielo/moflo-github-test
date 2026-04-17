const crypto = require('crypto');

const { hashPassword, validatePassword } = require('./signup');

const DEFAULT_TTL_MS = 60 * 60 * 1000;

function createResetTokenStore() {
  const byToken = new Map();
  return {
    put: (token, userId, expiresAt) => byToken.set(token, { userId, expiresAt }),
    get: (token) => byToken.get(token) || null,
    delete: (token) => byToken.delete(token),
    deleteForUser: (userId) => {
      for (const [t, entry] of byToken.entries()) {
        if (entry.userId === userId) byToken.delete(t);
      }
    },
  };
}

function createSessionStore() {
  const byToken = new Map();
  return {
    register: (token, userId) => byToken.set(token, userId),
    isValid: (token) => byToken.has(token),
    userFor: (token) => byToken.get(token) || null,
    invalidateAllForUser: (userId) => {
      for (const [t, uid] of byToken.entries()) {
        if (uid === userId) byToken.delete(t);
      }
    },
    size: () => byToken.size,
  };
}

function requestPasswordReset(
  { email },
  { store, resetTokens, ttlMs = DEFAULT_TTL_MS, now = () => new Date() } = {},
) {
  if (!store) throw new Error('store is required');
  if (!resetTokens) throw new Error('resetTokens is required');

  if (typeof email !== 'string') return null;

  const user = store.findByEmail(email);
  if (!user) return null;

  resetTokens.deleteForUser(user.id);

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = now().getTime() + ttlMs;
  resetTokens.put(token, user.id, expiresAt);
  return { token, expiresAt };
}

function resetPassword(
  { token, newPassword },
  { store, resetTokens, sessionStore, now = () => new Date() } = {},
) {
  if (!store) throw new Error('store is required');
  if (!resetTokens) throw new Error('resetTokens is required');
  if (!sessionStore) throw new Error('sessionStore is required');

  const invalid = () => {
    const err = new Error('Invalid or expired reset token');
    err.code = 'INVALID_TOKEN';
    return err;
  };

  const entry = typeof token === 'string' ? resetTokens.get(token) : null;
  if (!entry) throw invalid();

  if (now().getTime() > entry.expiresAt) {
    resetTokens.delete(token);
    throw invalid();
  }

  const pwError = validatePassword(newPassword);
  if (pwError) {
    const err = new Error(pwError);
    err.code = 'WEAK_PASSWORD';
    throw err;
  }

  const user = store.findById(entry.userId);
  if (!user) {
    resetTokens.delete(token);
    throw invalid();
  }

  const { salt, hash } = hashPassword(newPassword);
  user.passwordSalt = salt;
  user.passwordHash = hash;

  resetTokens.delete(token);
  sessionStore.invalidateAllForUser(user.id);

  return { userId: user.id };
}

module.exports = {
  requestPasswordReset,
  resetPassword,
  createResetTokenStore,
  createSessionStore,
  DEFAULT_TTL_MS,
};
