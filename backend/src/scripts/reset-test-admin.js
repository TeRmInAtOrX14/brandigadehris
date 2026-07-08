const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Resetting/Creating test admin user (test@gmail.com)...');

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('Brandigade2026!', salt);

  const existing = await prisma.user.findUnique({
    where: { email: 'test@gmail.com' },
    include: { employee: true }
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        role: 'Admin',
        isActive: true
      }
    });
    console.log('✅ Successfully updated test@gmail.com password to Brandigade2026!');
  } else {
    const user = await prisma.user.create({
      data: {
        email: 'test@gmail.com',
        passwordHash,
        role: 'Admin',
        isActive: true,
        employee: {
          create: {
            employeeCode: 'EMP-TEST-001',
            fullName: 'Test Admin',
            designation: 'System Administrator',
            status: 'active',
            baseSalary: 100000,
            currency: 'PKR'
          }
        }
      }
    });
    console.log('✅ Successfully created test@gmail.com user with password Brandigade2026!');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
