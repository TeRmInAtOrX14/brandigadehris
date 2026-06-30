const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting Campaign & Commission database seeding...');

  // 1. Clean existing Campaign-related data (safe delete order)
  console.log('Cleaning existing Campaign and performance data...');
  await prisma.attendance.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.payslip.deleteMany({});
  await prisma.payrollRun.deleteMany({});
  await prisma.loanRequest.deleteMany({});
  await prisma.wfhRequest.deleteMany({});
  await prisma.halfdayRequest.deleteMany({});
  await prisma.leaveRequest.deleteMany({});
  await prisma.spiff.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.salaryHistory.deleteMany({});

  await prisma.campaignPerformance.deleteMany({});
  await prisma.commissionSlab.deleteMany({});
  await prisma.commissionStructure.deleteMany({});
  await prisma.campaignMember.deleteMany({});
  await prisma.campaign.deleteMany({});

  // 2. Fetch existing employees (imported from biometric machine)
  let employees = await prisma.employee.findMany({
    include: { user: true }
  });

  // If no employees exist (e.g. empty database), create default ones first
  if (employees.length === 0) {
    console.log('No employees found. Seeding default accounts...');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Brandigade2026!', salt);

    // Create Admin
    const adminUser = await prisma.user.create({
      data: {
        email: 'hassan_1001@brandigade.com',
        passwordHash,
        role: 'Admin',
        mustChangePassword: true
      }
    });
    await prisma.employee.create({
      data: {
        userId: adminUser.id,
        employeeCode: 'EMP-1001',
        fullName: 'HASSAN',
        designation: 'Administrator',
        zkUserId: '1001',
        dateOfJoining: new Date(),
        status: 'active',
        baseSalary: 120000.0,
        currency: 'PKR'
      }
    });

    // Create SDR 1
    const sdrUser1 = await prisma.user.create({
      data: {
        email: 'waheed_1002@brandigade.com',
        passwordHash,
        role: 'Employee',
        mustChangePassword: true
      }
    });
    await prisma.employee.create({
      data: {
        userId: sdrUser1.id,
        employeeCode: 'EMP-1002',
        fullName: 'WAHEED',
        designation: 'SDR Specialist',
        zkUserId: '1002',
        dateOfJoining: new Date(),
        status: 'active',
        baseSalary: 60000.0,
        currency: 'PKR'
      }
    });

    // Create SDR 2
    const sdrUser2 = await prisma.user.create({
      data: {
        email: 'mahad_1003@brandigade.com',
        passwordHash,
        role: 'Employee',
        mustChangePassword: true
      }
    });
    await prisma.employee.create({
      data: {
        userId: sdrUser2.id,
        employeeCode: 'EMP-1003',
        fullName: 'MAHAD',
        designation: 'SDR Specialist',
        zkUserId: '1003',
        dateOfJoining: new Date(),
        status: 'active',
        baseSalary: 55000.0,
        currency: 'PKR'
      }
    });

    // Re-query
    employees = await prisma.employee.findMany({
      include: { user: true }
    });
  }

  // 3. Create Default Campaigns
  console.log('Seeding Campaigns...');
  const solarCampaign = await prisma.campaign.create({
    data: {
      name: 'US Solar Campaign',
      description: 'Outreach sales campaign for solar panels installation booking.',
      status: 'active',
      startDate: new Date('2026-06-01'),
      monthlyShowupTarget: 100,
      notes: 'Standard dynamic showups slabs configured.'
    }
  });

  const lvglCampaign = await prisma.campaign.create({
    data: {
      name: 'LVGL Campaign',
      description: 'Outbound sales and integration services for LVGL graphics toolkit.',
      status: 'active',
      startDate: new Date('2026-06-01'),
      monthlyShowupTarget: 80,
      notes: 'Flat commission override fallback.'
    }
  });

  // 4. Create Commission Structure & Slabs
  console.log('Seeding Commission Structures & Slabs...');
  // US Solar active slabs:
  // Slab 1: 1-10 -> 3000 PKR / showup
  // Slab 2: 11-20 -> 3750 PKR / showup
  // Slab 3: 21-30 -> 4500 PKR / showup
  // Slab 4: 31+ -> 5500 PKR / showup
  const solarStructure = await prisma.commissionStructure.create({
    data: {
      campaignId: solarCampaign.id,
      name: 'Standard Tiered Showups Plan',
      status: 'active',
      startDate: new Date('2026-06-01'),
      slabs: {
        create: [
          { minShowups: 1, maxShowups: 10, rate: 3000, type: 'per_showup' },
          { minShowups: 11, maxShowups: 20, rate: 3750, type: 'per_showup' },
          { minShowups: 21, maxShowups: 30, rate: 4500, type: 'per_showup' },
          { minShowups: 31, maxShowups: null, rate: 5500, type: 'per_showup' }
        ]
      }
    }
  });

  // LVGL active structure: Fixed / Hybrid Commission
  const lvglStructure = await prisma.commissionStructure.create({
    data: {
      campaignId: lvglCampaign.id,
      name: 'LVGL Flat Commission overrides',
      status: 'active',
      startDate: new Date('2026-06-01'),
      slabs: {
        create: [
          { minShowups: 1, maxShowups: 10, rate: 2500, type: 'per_showup' },
          { minShowups: 11, maxShowups: null, rate: 3500, type: 'per_showup' }
        ]
      }
    }
  });

  // 5. Assign Members to Campaigns
  console.log('Assigning employees to campaigns...');
  const hassan = employees.find(e => e.zkUserId === '1001');
  const waheed = employees.find(e => e.zkUserId === '1002');
  const mahad = employees.find(e => e.zkUserId === '1003');
  const emaz = employees.find(e => e.zkUserId === '1004');
  const shayan = employees.find(e => e.zkUserId === '1008');

  // Hassan is Admin/Team Lead of US Solar
  if (hassan) {
    await prisma.campaignMember.create({
      data: { campaignId: solarCampaign.id, employeeId: hassan.id, role: 'team_lead', status: 'active' }
    });
    // Set designation to Team Lead for dashboard checks
    await prisma.employee.update({
      where: { id: hassan.id },
      data: { designation: 'Team Lead' }
    });
  }

  // Waheed, Mahad are SDRs on Solar
  if (waheed) {
    await prisma.campaignMember.create({
      data: { campaignId: solarCampaign.id, employeeId: waheed.id, role: 'sdr', status: 'active' }
    });
  }
  if (mahad) {
    await prisma.campaignMember.create({
      data: { campaignId: solarCampaign.id, employeeId: mahad.id, role: 'sdr', status: 'active' }
    });
  }

  // Emaz, Shayan are SDRs on LVGL
  if (emaz) {
    await prisma.campaignMember.create({
      data: { campaignId: lvglCampaign.id, employeeId: emaz.id, role: 'sdr', status: 'active' }
    });
  }
  if (shayan) {
    await prisma.campaignMember.create({
      data: { campaignId: lvglCampaign.id, employeeId: shayan.id, role: 'sdr', status: 'active' }
    });
  }

  // 6. Seed Monthly Performance logs (June 2026)
  console.log('Logging mock performance records...');
  const currentMonth = 6; // June
  const currentYear = 2026;

  if (waheed) {
    await prisma.campaignPerformance.create({
      data: {
        employeeId: waheed.id,
        campaignId: solarCampaign.id,
        month: currentMonth,
        year: currentYear,
        meetingsBooked: 22,
        showups: 15,
        noShows: 4,
        cancelledMeetings: 3
      }
    });
  }

  if (mahad) {
    await prisma.campaignPerformance.create({
      data: {
        employeeId: mahad.id,
        campaignId: solarCampaign.id,
        month: currentMonth,
        year: currentYear,
        meetingsBooked: 12,
        showups: 8,
        noShows: 2,
        cancelledMeetings: 2
      }
    });
  }

  if (emaz) {
    await prisma.campaignPerformance.create({
      data: {
        employeeId: emaz.id,
        campaignId: lvglCampaign.id,
        month: currentMonth,
        year: currentYear,
        meetingsBooked: 18,
        showups: 12,
        noShows: 3,
        cancelledMeetings: 3
      }
    });
  }

  if (shayan) {
    await prisma.campaignPerformance.create({
      data: {
        employeeId: shayan.id,
        campaignId: lvglCampaign.id,
        month: currentMonth,
        year: currentYear,
        meetingsBooked: 15,
        showups: 10,
        noShows: 3,
        cancelledMeetings: 2
      }
    });
  }

  console.log('Database Campaign seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
