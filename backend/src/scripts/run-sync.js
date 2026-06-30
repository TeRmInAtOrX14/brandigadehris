const { syncZKTeco } = require('../utils/zkteco');

async function runSync() {
  console.log('Starting ZKTeco Biometric Synchronization...');
  try {
    const result = await syncZKTeco();
    console.log('Sync Complete!');
    console.log(`- Synced records: ${result.synced}`);
    console.log(`- Skipped records: ${result.skipped}`);
    if (result.errors && result.errors.length > 0) {
      console.log('Errors encountered during sync:');
      result.errors.forEach(err => console.error(`  - ${err}`));
    }
  } catch (err) {
    console.error('Fatal Sync Error:', err.message);
  }
}

runSync();
