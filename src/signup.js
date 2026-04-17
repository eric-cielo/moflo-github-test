const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email) {
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return 'Invalid email format';
  }
  return null;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain a number';
  return null;
}

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, s, 64).toString('hex');
  return { salt: s, hash };
}

function createUserStore() {
  const byEmail = new Map();
  const byId = new Map();
  return {
    findByEmail: (email) => byEmail.get(email.toLowerCase()) || null,
    findById: (id) => byId.get(id) || null,
    insert: (user) => {
      byEmail.set(user.email.toLowerCase(), user);
      byId.set(user.id, user);
      return user;
    },
    all: () => Array.from(byEmail.values()),
  };
}

function createSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function signup({ email, password }, { store, now = () => new Date() } = {}) {
  const emailError = validateEmail(email);
  if (emailError) {
    const err = new Error(emailError);
    err.code = 'INVALID_EMAIL';
    throw err;
  }
  const pwError = validatePassword(password);
  if (pwError) {
    const err = new Error(pwError);
    err.code = 'WEAK_PASSWORD';
    throw err;
  }
  if (!store) throw new Error('store is required');

  if (store.findByEmail(email)) {
    const err = new Error('An account with this email already exists');
    err.code = 'EMAIL_TAKEN';
    throw err;
  }

  const { salt, hash } = hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    email: email.toLowerCase(),
    passwordSalt: salt,
    passwordHash: hash,
    createdAt: now().toISOString(),
  };
  store.insert(user);

  return {
    user: { id: user.id, email: user.email, createdAt: user.createdAt },
    sessionToken: createSessionToken(),
  };
}

module.exports = {
  signup,
  validateEmail,
  validatePassword,
  hashPassword,
  createUserStore,
  createSessionToken,
};
