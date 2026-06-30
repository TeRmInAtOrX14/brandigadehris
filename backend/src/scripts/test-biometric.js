const ZKLib = require('node-zklib');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

async function testConnection() {
  const ip = process.argv[2] || process.env.ZKTECO_IP;
  const port = Number(process.argv[3] || process.env.ZKTECO_PORT) || 4370;

  if (!ip) {
    console.error('Error: Please provide an IP address. Example: node test-biometric.js 192.168.1.201');
    process.exit(1);
  }

  console.log(`Attempting to connect to ZKTeco machine at ${ip}:${port}...`);
  const zkInstance = new ZKLib(ip, port, 10000, 4000);

  try {
    // Try to connect
    await zkInstance.createSocket();
    console.log('✅ Connection established successfully!');

    // Fetch device info
    try {
      const users = await zkInstance.getUsers();
      console.log(`- Total registered users on device: ${users.data ? users.data.length : 0}`);
    } catch (e) {
      console.log('- Could not fetch users list (some firmware versions restrict this).');
    }

    try {
      const logs = await zkInstance.getAttendances();
      console.log(`- Total attendance punch records on device: ${logs.data ? logs.data.length : 0}`);
    } catch (e) {
      console.log('- Could not fetch attendance records.');
    }

    // Disconnect
    await zkInstance.disconnect();
    console.log('Disconnected successfully.');
  } catch (err) {
    console.error('❌ Connection failed!');
    console.error(`Reason: ${err.message}`);
    console.error('\nTroubleshooting tips:');
    console.error('1. Make sure you can ping the IP address from this computer.');
    console.error('2. Verify the port matches the machine settings (default is 4370).');
    console.error('3. Make sure the biometric device is powered on and connected to the network.');
  }
}

testConnection();
