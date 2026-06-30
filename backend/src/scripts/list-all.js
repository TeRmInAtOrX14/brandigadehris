const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emps = await prisma.employee.findMany({ include: { user: true } });
  console.log(`Found ${emps.length} employees:\n`);
  emps.forEach(e => {
    console.log(`Name: ${e.fullName} | Code: ${e.employeeCode} | zkUserId: ${e.zkUserId || 'N/A'} | Email: ${e.user?.email || 'NO USER'} | Role: ${e.user?.role || 'N/A'} | EmpID: ${e.id} | UserID: ${e.userId}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
