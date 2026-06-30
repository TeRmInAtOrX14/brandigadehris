const jwt = require('jsonwebtoken');

const accessSecret = process.env.JWT_SECRET || 'fallback_access_secret';
const refreshSecret = process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret';
const accessExpires = process.env.JWT_ACCESS_EXPIRES || '15m';
const refreshExpires = process.env.JWT_REFRESH_EXPIRES || '7d';

exports.generateTokens = (user) => {
  const payload = {
    userId: user.id,
    role: user.role,
  };

  const accessToken = jwt.sign(payload, accessSecret, { expiresIn: accessExpires });
  const refreshToken = jwt.sign(payload, refreshSecret, { expiresIn: refreshExpires });

  return { accessToken, refreshToken };
};

exports.verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, accessSecret);
  } catch (err) {
    return null;
  }
};

exports.verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, refreshSecret);
  } catch (err) {
    return null;
  }
};
