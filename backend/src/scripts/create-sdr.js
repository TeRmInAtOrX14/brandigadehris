const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

(async () => {
  const prisma = new PrismaClient();
  try {
    // Create or update SDR user
    const email = 'sdr@brandigade.com';
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log('SDR user already exists, skipping creation');
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('sdrpassword', salt);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'SDR',
        isActive: true,
        mustChangePassword: false,
      },
    });

    // Find the outreach team (created by seed)
    const outreachTeam = await prisma.team.findFirst({
      where: { name: { contains: 'Outreach', mode: 'insensitive' } },
    });

    await prisma.employee.create({
      data: {
        userId: user.id,
        employeeCode: 'EMP-003',
        fullName: 'SDR Test User',
        designation: 'SDR',
        teamId: outreachTeam ? outreachTeam.id : undefined,
        dateOfJoining: new Date(),
        status: 'active',
        baseSalary: 60000,
        currency: 'PKR',
      },
    });

    console.log('SDR test user created successfully');
  } catch (e) {
    console.error('Error creating SDR user:', e);
  } finally {
    await prisma.$disconnect();
  }
})();
