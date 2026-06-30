/**
 * Script: seed-campaign-commissions.js
 * Sets up the 5 campaigns (LVGL, CLEO HR, PATIENT WING, LOGICS, BRANDIGADE OUTREACH)
 * with the correct SDR tiered commission slabs in the database.
 * Run: node src/scripts/seed-campaign-commissions.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const campaignsToSeed = [
  { name: 'LVGL Campaign' },
  { name: 'CLEO HR Campaign' },
  { name: 'PATIENT WING Campaign' },
  { name: 'LOGICS Campaign' },
  { name: 'BRANDIGADE OUTREACH Campaign' }
];

const slabs = [
  { minShowups: 3, maxShowups: 5, rate: 3000, type: 'per_showup' },
  { minShowups: 6, maxShowups: 8, rate: 4000, type: 'per_showup' },
  { minShowups: 9, maxShowups: null, rate: 5000, type: 'per_showup' }
];

async function main() {
  console.log('=== Seeding Campaigns & Commission Structures ===\n');

  for (const c of campaignsToSeed) {
    // 1. Upsert Campaign
    let campaign = await prisma.campaign.findUnique({
      where: { name: c.name }
    });

    if (!campaign) {
      campaign = await prisma.campaign.create({
        data: {
          name: c.name,
          description: `Campaign for ${c.name.replace(' Campaign', '')}`,
          status: 'active'
        }
      });
      console.log(`✅ Created campaign: ${campaign.name}`);
    } else {
      console.log(`ℹ️  Campaign already exists: ${campaign.name}`);
    }

    // 2. Set all other commission structures for this campaign to inactive
    await prisma.commissionStructure.updateMany({
      where: { campaignId: campaign.id },
      data: { status: 'inactive' }
    });

    // 3. Create & Activate new commission structure
    const structure = await prisma.commissionStructure.create({
      data: {
        campaignId: campaign.id,
        name: 'SDR Standard Tiered Plan',
        status: 'active',
        startDate: new Date('2026-06-01'),
        slabs: {
          create: slabs.map(s => ({
            minShowups: s.minShowups,
            maxShowups: s.maxShowups,
            rate: s.rate,
            type: s.type
          }))
        }
      },
      include: { slabs: true }
    });

    console.log(`   🏆 Created & activated commission structure: "${structure.name}" for ${campaign.name}`);
    structure.slabs.forEach(s => {
      console.log(`      - Slab: Min ${s.minShowups} - Max ${s.maxShowups ?? '∞'} | Rate: PKR ${s.rate} | Type: ${s.type}`);
    });
  }

  console.log('\nDone! Campaigns and commission structures seeded.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
