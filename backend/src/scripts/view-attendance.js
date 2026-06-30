const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + (process.env.DATABASE_URL.includes('?') ? '&' : '?') + 'connection_limit=1'
    }
  }
});

async function showAttendance() {
  console.log('Fetching synced attendance records from database...');
  try {
    const records = await prisma.attendance.findMany({
      include: {
        employee: {
          select: {
            fullName: true,
            employeeCode: true
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });

    if (records.length === 0) {
      console.log('No attendance records found in database.');
      return;
    }

    console.log(`Total Synced Records: ${records.length}\n`);
    console.log('---------------------------------------------------------------------------------------------------------------------');
    console.log('Date       | Employee Name     | Code     | Check-In            | Check-Out           | Late (mins) | Overtime (mins)');
    console.log('---------------------------------------------------------------------------------------------------------------------');
    
    records.forEach(r => {
      const dateStr = r.date.toISOString().split('T')[0];
      const checkInStr = r.checkIn ? new Date(r.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
      const checkOutStr = r.checkOut ? new Date(r.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
      const name = r.employee?.fullName.padEnd(17, ' ') || 'Unknown';
      const code = r.employee?.employeeCode.padEnd(8, ' ') || 'Unknown';
      const late = String(r.late).padStart(11, ' ');
      const ot = String(r.overtime).padStart(15, ' ');
      
      console.log(`${dateStr} | ${name} | ${code} | ${checkInStr.padEnd(19, ' ')} | ${checkOutStr.padEnd(19, ' ')} | ${late} | ${ot}`);
    });
    console.log('---------------------------------------------------------------------------------------------------------------------');
  } catch (err) {
    console.error('Error fetching attendance:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

showAttendance();
