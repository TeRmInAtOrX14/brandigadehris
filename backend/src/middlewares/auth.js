const { verifyAccessToken } = require('../utils/jwt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const requireAuth = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Missing or invalid token' });
    }

    const decoded = verifyAccessToken(token);

    if (!decoded) {
      return res.status(401).json({ error: 'Token expired or invalid' });
    }

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { employee: true }
    });
    
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Account disabled or deleted' });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }

    next();
  };
};

module.exports = { requireAuth, requireRole };
