const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { generateTokens, verifyRefreshToken } = require('../utils/jwt');
const { OAuth2Client } = require('google-auth-library');

const prisma = new PrismaClient();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Handle Traditional Email & Password Login
 */
exports.login = async (req, res, next) => {
  try {
    console.log('Login request body:', req.body);
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { employee: true }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials or inactive account' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user);

    // Save refresh token
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken }
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        employee: user.employee
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Handle Token Refreshing
 */
exports.refresh = async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const decoded = verifyRefreshToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { employee: true }
    });

    if (!user || user.refreshToken !== token || !user.isActive) {
      return res.status(401).json({ error: 'Token revoked or user inactive' });
    }

    const tokens = generateTokens(user);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken }
    });

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Handle Google SSO (OAuth2 ID Token Verification)
 */
exports.googleLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'Google ID token is required' });
    }

    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch (e) {
      return res.status(400).json({ error: 'Invalid Google ID token' });
    }

    const payload = ticket.getPayload();
    const { email, sub: googleId, name, picture } = payload;

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email },
      include: { employee: true }
    });

    if (user) {
      // User exists. Update googleId if not present
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId },
          include: { employee: true }
        });
      }
    } else {
      // Auto-register employee if user doesn't exist (Enterprise choice: we can auto-create or restrict)
      // For testing & convenience, let's auto-create as Employee role
      const salt = await bcrypt.genSalt(10);
      const randomPassword = Math.random().toString(36).substring(2, 15);
      const passwordHash = await bcrypt.hash(randomPassword, salt);

      user = await prisma.user.create({
        data: {
          email,
          googleId,
          passwordHash,
          role: 'Employee',
          mustChangePassword: false,
          employee: {
            create: {
              employeeCode: `EMP-G-${Date.now().toString().slice(-4)}`,
              fullName: name || 'Google User',
              designation: 'SDR Executive',
              dateOfJoining: new Date(),
              photoUrl: picture
            }
          }
        },
        include: {
          employee: true
        }
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'User account is inactive' });
    }

    const { accessToken, refreshToken } = generateTokens(user);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken }
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        employee: user.employee
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Log out user (revoke refresh token)
 */
exports.logout = async (req, res, next) => {
  try {
    const { userId } = req.body;
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: { refreshToken: null }
      });
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};
