const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed with actual teams...');

  // 1. Clean existing data (safe delete order due to foreign key constraints)
  console.log('Cleaning existing data...');
  await prisma.auditLog.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.payslip.deleteMany({});
  await prisma.payrollRun.deleteMany({});
  await prisma.loanRequest.deleteMany({});
  await prisma.wfhRequest.deleteMany({});
  await prisma.halfdayRequest.deleteMany({});
  await prisma.leaveRequest.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.attendanceLog.deleteMany({});
  await prisma.spiff.deleteMany({});
  await prisma.teamCommission.deleteMany({});
  await prisma.commission.deleteMany({});
  await prisma.employeeProject.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({});

  // 2. Seeding teams...
  console.log('Seeding teams...');
  const outreachTeam = await prisma.team.create({
    data: { name: 'Brandigade Outreach' }
  });
  const lvglTeam = await prisma.team.create({
    data: { name: 'LVGL' }
  });
  const cleoTeam = await prisma.team.create({
    data: { name: 'Cleo HR' }
  });
  const logicsTeam = await prisma.team.create({
    data: { name: 'Logics' }
  });
  const patientTeam = await prisma.team.create({
    data: { name: 'PatientWing' }
  });

  // 3. Create Users and Employee Profiles
  console.log('Seeding users and employees...');
  const salt = await bcrypt.genSalt(10);
  const adminPasswordHash = await bcrypt.hash('admin123', salt);
  const testPasswordHash = await bcrypt.hash('test123', salt);

  // Admin User
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@brandigade.com',
      passwordHash: adminPasswordHash,
      role: 'Admin',
      isActive: true,
      mustChangePassword: false
    }
  });

  await prisma.employee.create({
    data: {
      userId: adminUser.id,
      employeeCode: 'EMP-001',
      fullName: 'Brandigade Admin',
      designation: 'Administrator',
      dateOfJoining: new Date('2025-01-01'),
      status: 'active',
      baseSalary: 120000.0,
      currency: 'PKR',
      phone: '+923001234567',
      cnic: '42101-1111111-1',
      shiftStart: '09:30',
      shiftEnd: '18:30',
    }
  });

  // Pseudo Test Employee (SDR / Outbound Campaigner under Brandigade Outreach)
  const testUser = await prisma.user.create({
    data: {
      email: 'test@brandigade.com',
      passwordHash: testPasswordHash,
      role: 'Employee',
      isActive: true,
      mustChangePassword: false
    }
  });

  const testEmployee = await prisma.employee.create({
    data: {
      userId: testUser.id,
      employeeCode: 'EMP-002',
      fullName: 'Kamran Khan',
      designation: 'SDR Outbound Specialist',
      teamId: outreachTeam.id,
      dateOfJoining: new Date('2026-06-01'),
      status: 'active',
      baseSalary: 60000.0,
      currency: 'PKR',
      phone: '+923009998877',
      cnic: '42101-2222222-2',
      shiftStart: '10:00', // Custom Shift Start
      shiftEnd: '19:00',   // Custom Shift End
      zkUserId: '1002'     // Custom Biometric ID
    }
  });
// Team Lead test user
  const leadUser = await prisma.user.create({
    data: {
      email: 'lead@brandigade.com',
      passwordHash: testPasswordHash,
      role: 'Team Lead',
      isActive: true,
      mustChangePassword: false
    }
  });

  const leadEmployee = await prisma.employee.create({
    data: {
      userId: leadUser.id,
      employeeCode: 'EMP-003',
      fullName: 'Aisha Khan',
      designation: 'Team Lead',
      teamId: outreachTeam.id,
      dateOfJoining: new Date('2026-06-15'),
      status: 'active',
      baseSalary: 90000.0,
      currency: 'PKR',
      phone: '+923001112223',
      cnic: '42101-3333333-3',
      shiftStart: '09:00',
      shiftEnd: '18:00'
    }
  });

  // 5. Create Default Project/Campaign matching teams
  console.log('Seeding projects...');
  const outreachProj = await prisma.project.create({
    data: { 
      name: 'Outreach Leads', 
      description: 'Outbound outreach campaign leads and targets',
      settings: {
        sdrSlabs: [
          { min: 0, max: 5, rate: 1000 },
          { min: 6, max: 10, rate: 1500 },
          { min: 11, max: 999, rate: 2000 }
        ],
        teamSlabs: [
          { minAvg: 0, maxAvg: 5, rate: 200 },
          { minAvg: 6, maxAvg: 10, rate: 400 },
          { minAvg: 11, maxAvg: 999, rate: 600 }
        ]
      }
    }
  });

  // Link employee to project/campaign
  await prisma.employeeProject.create({
    data: { employeeId: testEmployee.id, projectId: outreachProj.id, role: 'sdr' }
  });

  console.log('Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
