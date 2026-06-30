const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function showUsers() {
  console.log('Querying users in database...');
  try {
    const users = await prisma.user.findMany({
      include: {
        employee: true
      }
    });
    console.log(`Found ${users.length} users:`);
    users.forEach(u => {
      console.log(`- ID: ${u.id}, Email: ${u.email}, Role: ${u.role}, Employee: ${u.employee ? u.employee.fullName : 'None'}`);
    });
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

showUsers();
