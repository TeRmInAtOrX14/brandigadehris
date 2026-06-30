const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, isActive: true }
    });
    console.log('--- Users in DB ---');
    console.table(users);
  } catch (err) {
    console.error('Error fetching users:', err);
  } finally {
    await prisma.$disconnect();
  }
})();
