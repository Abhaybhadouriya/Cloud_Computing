const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { exec } = require('child_process');
const http = require('http');
const { Server } = require('socket.io');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const utils = require('./utils');

const packageDefinition = protoLoader.loadSync(path.join(__dirname, '../proto/kvstore.proto'), {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});
const kvProto = grpc.loadPackageDefinition(packageDefinition).kvstore;

function startController() {
    const app = express();
    app.use(cors());
    app.use(bodyParser.json());
    let dynamicReplicaCount = config.REPLICA_COUNT;

    const server = http.createServer(app); 
    const io = new Server(server, {
        cors: { origin: "*" }
    });

    const workers = {}; 

    function broadcastClusterState() {
         io.emit('cluster_update', {
            config: {
                total_workers: config.NUM_WORKERS,
                replica_count: dynamicReplicaCount
            },
            workers: workers
        });
    }

    io.on('connection', (socket) => {
        broadcastClusterState();
    });

    app.post('/config', (req, res) => {
        const { replica_count } = req.body;
        if (replica_count && replica_count > 0) {
            dynamicReplicaCount = parseInt(replica_count);
            logger.info(`Config Updated: Replicas = ${dynamicReplicaCount}`);
            broadcastClusterState(); 
            res.json({ success: true, new_count: dynamicReplicaCount });
        } else {
            res.status(400).json({ error: "Invalid count" });
        }
    });

    app.get('/status', (req, res) => {
        res.json({
            config: { total_workers: config.NUM_WORKERS, replica_count: config.REPLICA_COUNT },
            workers: workers
        });
    });
    
    app.get('/partition/:key', (req, res) => {
        const key = req.params.key;
        const nodeIds = utils.getPartitionNodes(key, config.NUM_WORKERS, dynamicReplicaCount); 
        let primaryInfo = null;
        for (let nid of nodeIds) {
            if (workers[nid] && workers[nid].alive) {
                primaryInfo = workers[nid];
                break;
            }
        }
        if (!primaryInfo) return res.status(503).json({ error: "No available workers" });
        res.json({ primary_address: primaryInfo.http_address, replica_node_ids: nodeIds });
    });

    const grpcServer = new grpc.Server();

    grpcServer.addService(kvProto.ControllerService.service, {
        Register: (call, callback) => {
            const { worker_id, http_address, grpc_address } = call.request;
            workers[worker_id] = {
                http_address,
                grpc_address, 
                address: http_address,
                lastHeartbeat: Date.now(),
                alive: true
            };
            logger.info(`gRPC Registered Worker ${worker_id}`);
            broadcastClusterState();
            callback(null, { success: true, config_replica_count: dynamicReplicaCount });
        },
        Heartbeat: (call, callback) => {
            const { worker_id } = call.request;
            if (workers[worker_id]) {
                workers[worker_id].lastHeartbeat = Date.now();
                if (!workers[worker_id].alive) {
                    workers[worker_id].alive = true;
                    logger.info(`Worker ${worker_id} is back ONLINE.`);
                    broadcastClusterState(); 
                }
            }
            callback(null, { 
                success: true, 
                config_replica_count: dynamicReplicaCount 
            });
        }
    });

    const grpcBind = `0.0.0.0:${config.CONTROLLER_GRPC_PORT}`;
    grpcServer.bindAsync(grpcBind, grpc.ServerCredentials.createInsecure(), () => {
        logger.info(`gRPC Controller running on port ${config.CONTROLLER_GRPC_PORT}`);
    });


    function triggerRecovery(deadNodeId) {
      
        try {
            const restartCmd = utils.makeRestartCommand(config.ENTRY_POINT_SCRIPT, deadNodeId);
            exec(restartCmd, (err) => {
                if (err) logger.error(`Failed to restart process: ${err.message}`);
            });
            logger.info(`Attempting to restart Worker ${deadNodeId} (Process)...`);
        } catch (e) { 
            logger.error(e.message); 
        }

        const aliveWorkers = Object.values(workers).filter(w => w.alive);
        if (aliveWorkers.length > 0) {
            const target = aliveWorkers[0];
            logger.info(`Asking ${target.grpc_address} to recover data for Worker ${deadNodeId}`);
            
            const client = new kvProto.WorkerService(target.grpc_address, grpc.credentials.createInsecure());
            client.Recover({ 
                dead_node_id: parseInt(deadNodeId), 
                target_grpc_address: `localhost:${config.WORKER_GRPC_BASE_PORT + parseInt(deadNodeId)}` 
            }, (err) => {
                if (err) logger.warn(`Recovery trigger failed: ${err.message}`);
            });
        }
    }

    setInterval(() => {
        const now = Date.now();
        let changed = false;
        Object.keys(workers).forEach(wId => {
            const info = workers[wId];
            if (info.alive && (now - info.lastHeartbeat > config.HEARTBEAT_TIMEOUT_MS)) {
                logger.warn(`Worker ${wId} dead.`);
                info.alive = false;
                changed = true;
                triggerRecovery(wId); 
            }
        });
        if (changed) broadcastClusterState();
    }, 5000);

    server.listen(config.CONTROLLER_PORT, () => 
        logger.info(`HTTP+Socket Dashboard running on port ${config.CONTROLLER_PORT}`));
}

module.exports = { startController };