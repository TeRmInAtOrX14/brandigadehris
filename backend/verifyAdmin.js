const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
(async () => {
  try {
    const admin = await prisma.user.findUnique({ where: { email: 'admin@brandigade.com' } });
    console.log('Admin hash:', admin.passwordHash);
    const match = await bcrypt.compare('admin123', admin.passwordHash);
    console.log('Password match?', match);
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
})();
