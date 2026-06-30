/**
 * Script: create-admin-accounts.js
 * Creates admin accounts for hr@brandigade.com, syed@brandigade.com, kashan.ahmed@brandigade.com
 * Run: node src/scripts/create-admin-accounts.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const admins = [
  {
    email: 'hr@brandigade.com',
    fullName: 'HR Admin',
    employeeCode: 'EMP-HR-001',
    designation: 'HR Manager',
    role: 'Admin',
    password: 'Brandigade2026!'
  },
  {
    email: 'syed@brandigade.com',
    fullName: 'Syed',
    employeeCode: 'EMP-CEO-001',
    designation: 'CEO',
    role: 'CEO',
    password: 'Brandigade2026!'
  },
  {
    email: 'kashan.ahmed@brandigade.com',
    fullName: 'Kashan Ahmed',
    employeeCode: 'EMP-COO-001',
    designation: 'COO',
    role: 'COO',
    password: 'Brandigade2026!'
  }
];

async function main() {
  console.log('Creating admin accounts...\n');

  const salt = await bcrypt.genSalt(10);

  for (const admin of admins) {
    const existing = await prisma.user.findUnique({ where: { email: admin.email } });

    if (existing) {
      console.log(`⚠️  User already exists: ${admin.email} — skipping`);
      continue;
    }

    const passwordHash = await bcrypt.hash(admin.password, salt);

    const user = await prisma.user.create({
      data: {
        email: admin.email,
        passwordHash,
        role: admin.role,
        mustChangePassword: false,
        employee: {
          create: {
            employeeCode: admin.employeeCode,
            fullName: admin.fullName,
            designation: admin.designation,
            dateOfJoining: new Date(),
            status: 'active',
            baseSalary: 0,
            currency: 'PKR'
          }
        }
      },
      include: { employee: true }
    });

    console.log(`✅ Created: ${user.email} (${user.role}) — Employee: ${user.employee.fullName}`);
  }

  console.log('\nDone! All admin accounts are ready.');
  console.log('Default password for all: Brandigade2026!');
  console.log('They can now login with Google SSO using their registered emails.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
