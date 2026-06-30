/**
 * Fix admin accounts — correct order:
 * 1. Delete duplicate records FIRST (to free up the emails)
 * 2. Then update the real JAFAR & KASHAN employees with correct emails/roles
 * 3. Remove HR Admin from employee list (keep user as virtual assistant)
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Fixing Admin Accounts ===\n');

  // -----------------------------------------------------------------------
  // STEP 1: Delete all 3 duplicate records FIRST (frees up emails)
  // -----------------------------------------------------------------------

  // Delete duplicate: Syed / EMP-CEO-001 (has syed@brandigade.com)
  const dupSyed = await prisma.employee.findFirst({ where: { employeeCode: 'EMP-CEO-001' } });
  if (dupSyed) {
    await prisma.employee.delete({ where: { id: dupSyed.id } });
    await prisma.user.delete({ where: { id: dupSyed.userId } });
    console.log('🗑️  Deleted duplicate: Syed (EMP-CEO-001)');
  } else {
    console.log('⏭️  Syed (EMP-CEO-001) already deleted');
  }

  // Delete duplicate: Kashan Ahmed / EMP-COO-001 (has kashan.ahmed@brandigade.com)
  const dupKashan = await prisma.employee.findFirst({ where: { employeeCode: 'EMP-COO-001' } });
  if (dupKashan) {
    await prisma.employee.delete({ where: { id: dupKashan.id } });
    await prisma.user.delete({ where: { id: dupKashan.userId } });
    console.log('🗑️  Deleted duplicate: Kashan Ahmed (EMP-COO-001)');
  } else {
    console.log('⏭️  Kashan Ahmed (EMP-COO-001) already deleted');
  }

  // Delete HR Admin employee record (keep user)
  const hrAdmin = await prisma.employee.findFirst({ where: { employeeCode: 'EMP-HR-001' } });
  if (hrAdmin) {
    await prisma.employee.delete({ where: { id: hrAdmin.id } });
    console.log('🗑️  Removed HR Admin from employee list (user kept as virtual assistant)');
  } else {
    console.log('⏭️  HR Admin employee record already removed');
  }

  // -----------------------------------------------------------------------
  // STEP 2: Update real employees with correct emails and roles
  // -----------------------------------------------------------------------

  // JAFAR (EMP-1000) → syed@brandigade.com, CEO
  const jafar = await prisma.employee.findFirst({
    where: { employeeCode: 'EMP-1000' },
    include: { user: true }
  });
  if (jafar) {
    await prisma.user.update({
      where: { id: jafar.userId },
      data: { email: 'syed@brandigade.com', role: 'CEO' }
    });
    console.log('✅ JAFAR (EMP-1000) → email: syed@brandigade.com, role: CEO');
  } else {
    console.log('⚠️  JAFAR (EMP-1000) not found!');
  }

  // KASHAN (EMP-1501) → kashan.ahmed@brandigade.com, COO
  const kashan = await prisma.employee.findFirst({
    where: { employeeCode: 'EMP-1501' },
    include: { user: true }
  });
  if (kashan) {
    await prisma.user.update({
      where: { id: kashan.userId },
      data: { email: 'kashan.ahmed@brandigade.com', role: 'COO' }
    });
    console.log('✅ KASHAN (EMP-1501) → email: kashan.ahmed@brandigade.com, role: COO');
  } else {
    console.log('⚠️  KASHAN (EMP-1501) not found!');
  }

  // -----------------------------------------------------------------------
  // STEP 3: Verify final state
  // -----------------------------------------------------------------------
  console.log('\n=== Verification ===\n');

  const emps = await prisma.employee.findMany({ include: { user: true }, orderBy: { employeeCode: 'asc' } });
  console.log(`Total employees: ${emps.length}\n`);
  for (const e of emps) {
    console.log(`  ${e.fullName.padEnd(15)} | ${e.employeeCode} | ${e.user?.email?.padEnd(30) || 'NO USER'} | ${e.user?.role}`);
  }

  const hrUser = await prisma.user.findUnique({ where: { email: 'hr@brandigade.com' }, include: { employee: true } });
  console.log(`\n  hr@brandigade.com → Role: ${hrUser?.role} | Employee record: ${hrUser?.employee ? 'YES ❌' : 'NONE ✅ (virtual assistant)'}`);

  console.log('\nDone!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
