const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const camps = await prisma.campaign.findMany({
    include: { commissionStructures: { include: { slabs: true } } }
  });
  console.log('Campaigns in DB:');
  camps.forEach(c => {
    console.log(`- ${c.name} (ID: ${c.id})`);
    c.commissionStructures.forEach(cs => {
      console.log(`  Structure: ${cs.name} (${cs.status})`);
      cs.slabs.forEach(s => {
        console.log(`    Slab: Min ${s.minShowups} - Max ${s.maxShowups} | Rate: ${s.rate} | Type: ${s.type}`);
      });
    });
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
