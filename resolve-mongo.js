const dns = require('dns');

// Force using Google's DNS servers
dns.setServers(['8.8.8.8', '8.8.4.4']);

const srvName = '_mongodb._tcp.hackathon.qb8nv1y.mongodb.net';
const txtName = 'hackathon.qb8nv1y.mongodb.net';

async function resolve() {
  try {
    const srvRecords = await dns.promises.resolveSrv(srvName);
    const txtRecords = await dns.promises.resolveTxt(txtName);

    console.log('--- SRV Records ---');
    console.log(JSON.stringify(srvRecords, null, 2));

    console.log('--- TXT Records ---');
    console.log(JSON.stringify(txtRecords, null, 2));

    process.exit(0);
  } catch (err) {
    console.error('Resolution failed:', err);
    process.exit(1);
  }
}

resolve();
