const { startController } = require('./controller');
const { startWorker } = require('./worker');

const MODE = process.argv[2]; 
const ID = process.argv[3];

console.log("---------------------------------------------------");
console.log(`Starting Distributed KV Store Node: ${MODE ? MODE.toUpperCase() : 'UNKNOWN'} ${ID || ''}`);
console.log("---------------------------------------------------");

if (MODE === 'controller') {
    startController();
} else if (MODE === 'worker') {
    startWorker(parseInt(ID));
} else {
    console.log("Usage: node kv_stores.js [controller | worker <id>]");
    process.exit(1);
}