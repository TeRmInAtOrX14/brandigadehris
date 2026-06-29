const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

router.get('/google-config', (req, res) => {
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID || null });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(String(email).toLowerCase());
  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const employee = db.prepare(`SELECT id, full_name FROM employees WHERE user_id = ?`).get(user.id);

  db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(user.id);

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      employeeId: employee ? employee.id : null,
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: !!user.must_change_password,
      fullName: employee ? employee.full_name : null,
      employeeId: employee ? employee.id : null,
    },
  });
});

router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  // Skip current-password check only on forced first-login change; otherwise require it.
  if (!user.must_change_password) {
    if (!currentPassword || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
  }

  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?`).run(hash, user.id);

  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(`SELECT id, email, role, must_change_password FROM users WHERE id = ?`).get(req.user.id);
  const employee = db.prepare(`SELECT * FROM employees WHERE user_id = ?`).get(req.user.id);
  res.json({ user, employee });
});

// Google SSO — verify Google ID token and log in as the matching user
router.post('/google-login', async (req, res) => {
  const { credential } = req.body || {};
  if (!credential) {
    return res.status(400).json({ error: 'Google credential token is required.' });
  }

  try {
    // Verify the ID token using Google's public tokeninfo endpoint
    const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!googleRes.ok) {
      return res.status(401).json({ error: 'Invalid Google token. Please try again.' });
    }
    const payload = await googleRes.json();

    // Validate audience matches our app
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && payload.aud !== clientId) {
      return res.status(401).json({ error: 'Token audience mismatch. Ensure GOOGLE_CLIENT_ID is correct.' });
    }

    if (!payload.email_verified || payload.email_verified === 'false') {
      return res.status(401).json({ error: 'Google email is not verified.' });
    }

    const email = String(payload.email).toLowerCase();
    const user = db.prepare(`SELECT * FROM users WHERE email = ? AND is_active = 1`).get(email);
    if (!user) {
      return res.status(401).json({
        error: `No HRIS account found for ${email}. Please contact your administrator.`,
      });
    }

    const employee = db.prepare(`SELECT id, full_name FROM employees WHERE user_id = ?`).get(user.id);
    db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(user.id);

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        employeeId: employee ? employee.id : null,
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        mustChangePassword: false, // Google SSO users skip forced password change
        fullName: employee ? employee.full_name : payload.name || null,
        employeeId: employee ? employee.id : null,
      },
    });
  } catch (err) {
    console.error('[Auth] Google SSO error:', err);
    res.status(500).json({ error: 'Server error during Google login.' });
  }
});

module.exports = router;
