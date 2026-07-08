const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emps = await prisma.employee.findMany({
    select: {
      employeeCode: true,
      fullName: true,
      shiftStart: true,
      shiftEnd: true
    },
    orderBy: {
      employeeCode: 'asc'
    }
  });
  console.table(emps);
}

main().finally(() => prisma.$disconnect());
