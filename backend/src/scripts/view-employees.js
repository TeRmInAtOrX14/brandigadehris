const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function showEmployees() {
  console.log('Querying employees in database...');
  try {
    const employees = await prisma.employee.findMany();
    console.log(`Found ${employees.length} employees:`);
    employees.forEach(emp => {
      console.log(`- ID: ${emp.id}, Code: ${emp.employeeCode}, Name: ${emp.fullName}, zkUserId: ${emp.zkUserId}`);
    });
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

showEmployees();
