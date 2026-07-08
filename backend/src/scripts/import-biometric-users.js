const ZKLib = require('node-zklib');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { syncZKTeco } = require('../utils/zkteco');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + (process.env.DATABASE_URL.includes('?') ? '&' : '?') + 'connection_limit=1'
    }
  }
});

async function main() {
  const ip = process.env.ZKTECO_IP || '192.168.18.201';
  const port = Number(process.env.ZKTECO_PORT) || 4370;

  console.log(`Connecting to ZKTeco machine at ${ip}:${port}...`);
  const zk = new ZKLib(ip, port, 10000, 4000);

  try {
    await zk.createSocket();
    console.log('Connected to machine.');

    console.log('Fetching users from biometric machine...');
    let usersResult = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Attempt ${attempt} to fetch users...`);
        usersResult = await zk.getUsers();
        if (usersResult && usersResult.data && usersResult.data.length > 0) {
          break;
        }
      } catch (e) {
        console.error(`Attempt ${attempt} failed:`, e.message);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log('Raw users result:', JSON.stringify(usersResult));

    if (!usersResult || !usersResult.data || usersResult.data.length === 0) {
      console.error('Error: No users found on the biometric machine.');
      await zk.disconnect();
      return;
    }

    const deviceUsers = usersResult.data;
    console.log(`Found ${deviceUsers.length} users on biometric device.`);

    // Password hash for default password "Brandigade2026!"
    const defaultPasswordHash = await bcrypt.hash('Brandigade2026!', 10);

    console.log('Cleaning up existing pseudo data from database...');
    // Delete all child tables to prevent foreign key constraint violations
    await prisma.attendance.deleteMany({});
    await prisma.document.deleteMany({});
    await prisma.salaryHistory.deleteMany({});
    await prisma.employeeProject.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.halfdayRequest.deleteMany({});
    await prisma.wfhRequest.deleteMany({});
    await prisma.loanRequest.deleteMany({});
    await prisma.payslip.deleteMany({});
    await prisma.spiff.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.auditLog.deleteMany({});
    
    // Delete employees and users
    await prisma.employee.deleteMany({});
    await prisma.user.deleteMany({});
    console.log('Database cleaned successfully.');

    console.log('Importing biometric users into database...');
    for (const dUser of deviceUsers) {
      const cleanName = dUser.name.trim();
      const devUserId = String(dUser.userId).trim();
      
      // Generate clean email based on name
      const emailUsername = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const email = `${emailUsername || 'user'}_${devUserId}@brandigade.com`;

      // Determine role: Set HASSAN (1001) as Admin
      let role = 'Employee';
      if (cleanName.toUpperCase() === 'HASSAN' || devUserId === '1001') {
        role = 'Admin';
      }

      console.log(`Creating user & employee: ${cleanName} (ID: ${devUserId}, Email: ${email}, Role: ${role})`);

      // Create user and employee
      await prisma.user.create({
        data: {
          email,
          passwordHash: defaultPasswordHash,
          role,
          mustChangePassword: true,
          employee: {
            create: {
              employeeCode: `EMP-${devUserId}`,
              fullName: cleanName,
              designation: role === 'Admin' ? 'Administrator' : 'Software Engineer',
              zkUserId: devUserId,
              status: 'active',
              baseSalary: 50000
            }
          }
        }
      });
    }

    console.log('All biometric users successfully imported.');

    // Disconnect machine connection so we don't hit socket busy issues
    await zk.disconnect();
    console.log('Disconnected from biometric machine.');

    // Trigger full ZKTeco attendance sync to download all 648 logs for the new employees!
    console.log('Starting ZKTeco attendance sync for the imported employees...');
    const syncRes = await syncZKTeco();
    console.log('Sync Complete!');
    console.log(`- Synced logs count: ${syncRes.synced}`);
    console.log(`- Skipped logs count: ${syncRes.skipped}`);
    if (syncRes.errors && syncRes.errors.length > 0) {
      console.log('Sync Errors:');
      syncRes.errors.forEach(e => console.error(`  - ${e}`));
    }

  } catch (err) {
    console.error('Fatal Error during import:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
