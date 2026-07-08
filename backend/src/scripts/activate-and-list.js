const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Activating and Listing Users ===\n');

  try {
    // 1. Activate all users
    const updateResult = await prisma.user.updateMany({
      where: { isActive: false },
      data: { isActive: true }
    });
    console.log(`Activated ${updateResult.count} inactive users.\n`);

    // 2. Fetch all employees with their user information
    const employees = await prisma.employee.findMany({
      include: {
        user: true
      },
      orderBy: {
        fullName: 'asc'
      }
    });

    console.log('Registered Employee Emails for Google SSO:');
    console.log('---------------------------------------------------------');
    employees.forEach(emp => {
      const email = emp.user ? emp.user.email : 'NO USER LINKED';
      const role = emp.user ? emp.user.role : 'N/A';
      const active = emp.user ? emp.user.isActive : false;
      console.log(`Code: ${emp.employeeCode.padEnd(10)} | Name: ${emp.fullName.padEnd(20)} | Email: ${email.padEnd(30)} | Role: ${role.padEnd(12)} | Active: ${active}`);
    });
    console.log('---------------------------------------------------------');
    console.log(`Total count: ${employees.length} employees.`);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
