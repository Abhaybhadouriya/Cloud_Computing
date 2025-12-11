const os = require('os');
const crypto = require('crypto');
const config = require('./config');

function hashStringToInt(str) {
    const hash = crypto.createHash('md5').update(str).digest('hex');
    return parseInt(hash.substring(0, 8), 16);
}

function getPartitionNodes(key, totalWorkers, currentReplicaCount) {
    if (totalWorkers === 0) return [];

    const ring = [];
    
    for (let wId = 0; wId < totalWorkers; wId++) {
        for (let v = 0; v < config.VNODES_PER_WORKER; v++) {
            const vNodeId = `worker-${wId}-vnode-${v}`;
            const pos = hashStringToInt(vNodeId);
            ring.push({ pos: pos, workerId: wId });
        }
    }

    ring.sort((a, b) => a.pos - b.pos);

    const keyPos = hashStringToInt(key);
    let iterator = 0;
    
    while (iterator < ring.length && ring[iterator].pos < keyPos) {
        iterator++;
    }

    if (iterator >= ring.length) {
        iterator = 0;
    }

    const selectedWorkers = new Set();
    
    while (selectedWorkers.size < currentReplicaCount && selectedWorkers.size < totalWorkers) {
        const node = ring[iterator];
        selectedWorkers.add(node.workerId);
        iterator++;
        if (iterator >= ring.length) iterator = 0;
    }

    return Array.from(selectedWorkers);
}

function makeRestartCommand(scriptPath, workerId) {
    const platform = os.platform();
    if (platform === 'win32') {
        return `start "Worker ID" cmd /k node ${scriptPath} worker ${workerId}`;
    }
    if (platform === 'darwin') {
        return `osascript -e 'tell application "Terminal" to do script "node \\"${scriptPath}\\" worker ${workerId}"'`;
    }
    return `gnome-terminal -- bash -c "node \\"${scriptPath}\\" worker ${workerId}; exec bash" || xterm -hold -e "node \\"${scriptPath}\\" worker ${workerId}"`;
}

module.exports = {
    getPartitionNodes,
    makeRestartCommand
};