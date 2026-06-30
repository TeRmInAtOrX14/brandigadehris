const ZKLib = require('node-zklib');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

async function dumpUsers() {
  const ip = process.env.ZKTECO_IP || '192.168.18.201';
  const port = Number(process.env.ZKTECO_PORT) || 4370;

  console.log(`Connecting to ZKTeco machine at ${ip}:${port}...`);
  const zk = new ZKLib(ip, port, 10000, 4000);

  try {
    await zk.createSocket();
    console.log('Connected.');

    console.log('Calling zk.getUsers()...');
    const usersResult = await zk.getUsers();
    console.log('Result of getUsers():', JSON.stringify(usersResult, null, 2));

    console.log('Calling zk.getAttendances()...');
    const logsResult = await zk.getAttendances();
    console.log('Total logs:', logsResult.data ? logsResult.data.length : 0);
    if (logsResult.data && logsResult.data.length > 0) {
      console.log('Sample logs (first 5):', JSON.stringify(logsResult.data.slice(0, 5), null, 2));
    }

    await zk.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

dumpUsers();
