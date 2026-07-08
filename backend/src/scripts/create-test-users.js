const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('=== Creating SDR and Team Lead Test Users ===\n');

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('Brandigade2026!', salt);

  // 1. Create/Reset SDR Test User
  const sdrEmail = 'sdr_test@brandigade.com';
  let sdrUser = await prisma.user.findUnique({
    where: { email: sdrEmail },
    include: { employee: true }
  });

  if (sdrUser) {
    sdrUser = await prisma.user.update({
      where: { id: sdrUser.id },
      data: { passwordHash, role: 'SDR', isActive: true },
      include: { employee: true }
    });
    console.log(`✅ Reset SDR test user: ${sdrEmail}`);
  } else {
    sdrUser = await prisma.user.create({
      data: {
        email: sdrEmail,
        passwordHash,
        role: 'SDR',
        isActive: true,
        employee: {
          create: {
            employeeCode: 'EMP-T-SDR-99',
            fullName: 'Raameen Ali (SDR)',
            designation: 'SDR Outreach Agent',
            baseSalary: 65000,
            currency: 'PKR',
            birthday: 'June 15',
            status: 'active'
          }
        }
      },
      include: { employee: true }
    });
    console.log(`✅ Created SDR test user: ${sdrEmail}`);
  }

  // 2. Create/Reset Team Lead Test User
  const tlEmail = 'tl_test@brandigade.com';
  let tlUser = await prisma.user.findUnique({
    where: { email: tlEmail },
    include: { employee: true }
  });

  if (tlUser) {
    tlUser = await prisma.user.update({
      where: { id: tlUser.id },
      data: { passwordHash, role: 'Team Lead', isActive: true },
      include: { employee: true }
    });
    console.log(`✅ Reset Team Lead test user: ${tlEmail}`);
  } else {
    tlUser = await prisma.user.create({
      data: {
        email: tlEmail,
        passwordHash,
        role: 'Team Lead',
        isActive: true,
        employee: {
          create: {
            employeeCode: 'EMP-T-TL-99',
            fullName: 'Emaaz Khan (TL)',
            designation: 'Team Lead Coordinator',
            baseSalary: 95000,
            currency: 'PKR',
            birthday: 'September 20',
            status: 'active'
          }
        }
      },
      include: { employee: true }
    });
    console.log(`✅ Created Team Lead test user: ${tlEmail}`);
  }

  // 3. Ensure a test campaign exists
  let campaign = await prisma.campaign.findFirst({
    where: { name: 'Brandigade Outreach' }
  });

  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: {
        name: 'Brandigade Outreach',
        description: 'Outbound sales and appointment setting',
        status: 'active'
      }
    });
    console.log(`✅ Created campaign: Brandigade Outreach`);
  }

  // 4. Assign Team Lead to Campaign
  const tlMember = await prisma.campaignMember.findFirst({
    where: { campaignId: campaign.id, employeeId: tlUser.employee.id }
  });

  if (!tlMember) {
    await prisma.campaignMember.create({
      data: {
        campaignId: campaign.id,
        employeeId: tlUser.employee.id,
        role: 'team_lead',
        status: 'active'
      }
    });
    console.log(`✅ Linked Team Lead to Brandigade Outreach`);
  } else {
    await prisma.campaignMember.update({
      where: { id: tlMember.id },
      data: { role: 'team_lead', status: 'active' }
    });
  }

  // 5. Assign SDR to Campaign
  const sdrMember = await prisma.campaignMember.findFirst({
    where: { campaignId: campaign.id, employeeId: sdrUser.employee.id }
  });

  if (!sdrMember) {
    await prisma.campaignMember.create({
      data: {
        campaignId: campaign.id,
        employeeId: sdrUser.employee.id,
        role: 'sdr',
        status: 'active'
      }
    });
    console.log(`✅ Linked SDR to Brandigade Outreach`);
  } else {
    await prisma.campaignMember.update({
      where: { id: sdrMember.id },
      data: { role: 'sdr', status: 'active' }
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
