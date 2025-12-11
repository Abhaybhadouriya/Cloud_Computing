const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const config = require('./config');
const logger = require('./logger');
const utils = require('./utils');

const packageDefinition = protoLoader.loadSync(path.join(__dirname, '../proto/kvstore.proto'), {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
});
const kvProto = grpc.loadPackageDefinition(packageDefinition).kvstore;

function startWorker(workerId) {
    const HTTP_PORT = config.WORKER_BASE_PORT + workerId;
    const GRPC_PORT = config.WORKER_GRPC_BASE_PORT + workerId;
    const STORAGE_FILE = path.join(__dirname, `../database/storage_worker_${workerId}.json`);
    let currentReplicaCount = config.REPLICA_COUNT; 

    const app = express();
    app.use(cors());
    app.use(bodyParser.json());

    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: "*" } });

    function broadcastData() {
        io.emit('data_update', dataStore);
    }

    function loadData() {
        try { return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8')); } 
        catch { return {}; }
    }
    function saveData(data) {
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
        broadcastData();
    }
    const dataStore = loadData();

    io.on('connection', () => broadcastData());

    const controllerClient = new kvProto.ControllerService(
        `localhost:${config.CONTROLLER_GRPC_PORT}`, grpc.credentials.createInsecure()
    );

    function getWorkerClient(targetId) {
        const targetPort = config.WORKER_GRPC_BASE_PORT + targetId;
        return new kvProto.WorkerService(`localhost:${targetPort}`, grpc.credentials.createInsecure());
    }

    function register() {
        controllerClient.Register({
            worker_id: workerId,
            http_address: `http://localhost:${HTTP_PORT}`,
            grpc_address: `localhost:${GRPC_PORT}`
        }, (err) => { if (err) logger.error("Reg failed"); else logger.info("Registered"); });
    }
    register();
    
    setInterval(() => {
        controllerClient.Heartbeat({ worker_id: workerId }, (err, response) => {
            if (!err && response && response.config_replica_count) {
                if (currentReplicaCount !== response.config_replica_count) {
                    currentReplicaCount = response.config_replica_count;
                    logger.info(`Synced Config: Replicas = ${currentReplicaCount}`);
                }
            }
        });
    }, config.HEARTBEAT_INTERVAL_MS);

    const grpcServer = new grpc.Server();
    grpcServer.addService(kvProto.WorkerService.service, {
        Replicate: (call, callback) => {
            const { key, value } = call.request;
            dataStore[key] = value;
            saveData(dataStore);
            logger.info(`(gRPC) Replicated '${key}'`);
            callback(null, { success: true });
        },
        Recover: (call, callback) => { 
             const { dead_node_id, target_grpc_address } = call.request;
            logger.info(`Recovery Scan for Dead Node ${dead_node_id}...`);
            
            const recoveryClient = new kvProto.WorkerService(target_grpc_address, grpc.credentials.createInsecure());

            Object.entries(dataStore).forEach(([key, val]) => {
                const nodesForKey = utils.getPartitionNodes(key, config.NUM_WORKERS, currentReplicaCount);
                if (nodesForKey.includes(dead_node_id)) {
                    recoveryClient.Replicate({ key, value: String(val) }, (err) => {
                        if (err) logger.warn(`Recovery seed failed for ${key}`);
                    });
                }
            });
            callback(null, { success: true });
        }
    });
    grpcServer.bindAsync(`0.0.0.0:${GRPC_PORT}`, grpc.ServerCredentials.createInsecure(), () => {});

    app.get('/debug/dump', (req, res) => res.json(dataStore));
    
    app.get('/kv/:key', (req, res) => {
        const val = dataStore[req.params.key];
        res.json(val !== undefined ? { found: true, value: val, node_id: workerId } : { found: false });
    });

    app.put('/kv/:key', async (req, res) => {
        const key = req.params.key;
        const val = req.body.value;
        const targetIds = utils.getPartitionNodes(key, config.NUM_WORKERS, currentReplicaCount);
        
        let successCount = 0;
        if (targetIds.includes(workerId)) {
            dataStore[key] = val;
            saveData(dataStore);
            logger.info(`Stored '${key}' locally`);
            successCount = 1;
        } else {
            logger.info(`Coordinator: Proxying '${key}'`);
        }

        const replicaIds = targetIds.filter(id => id !== workerId);
        let responseSent = false;
        
        if (successCount >= currentReplicaCount) {
            res.json({ status: "success", replicas: successCount });
            responseSent = true;
        }

        const checkQuorum = () => {
            if (!responseSent && successCount >= currentReplicaCount) {
                responseSent = true;
                res.json({ status: "success", replicas: successCount, note: "background_write_active" });
            }
        };

        const promises = replicaIds.map(id => {
            return new Promise((resolve) => {
                const client = getWorkerClient(id);
                client.Replicate({ key, value: String(val) }, (err, response) => {
                    if (!err && response.success) {
                        successCount++;
                        checkQuorum();
                        resolve(true); 
                    } else {
                        logger.warn(`gRPC repl failed to Node ${id}`);
                        resolve(false);
                    }
                });
            });
        });

        Promise.all(promises).then(() => {
            if (!responseSent) {
                if (successCount >= currentReplicaCount) {
                     res.json({ status: "success", replicas: successCount });
                } else {
                     res.status(500).json({ status: "partial_failure", replicas: successCount });
                }
            } else {
                logger.info(`Background write finished. Total copies: ${successCount}`);
            }
        });
    });

    server.listen(HTTP_PORT, () => logger.info(`HTTP+Socket Worker ${workerId} on port ${HTTP_PORT}`));
}

module.exports = { startWorker };