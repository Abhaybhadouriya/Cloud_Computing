# High-Performance Distributed Key-Value Store

A robust, fault-tolerant distributed key-value storage system built with **Node.js**. This project simulates a production-grade distributed system featuring **Consistent Hashing**, **Latent Replication** (Background Writing), and a **Hybrid Communication Protocol** (REST + gRPC). It includes a real-time interactive dashboard for visualizing cluster health and data distribution.

![Project Status](https://img.shields.io/badge/status-active-success.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

---

## 🚀 Features

### Core Functionalities
- **Distributed Architecture**: Operates with 1 Controller node and 4 Worker nodes by default.
- **Data Partitioning**: Implements **Consistent Hashing** using a ring topology with Virtual Nodes (vNodes) to ensure uniform data distribution.
- **Replication**: Ensures high availability by replicating every key to **3 distinct nodes** (1 Primary + 2 Replicas).
- **Latent Replication**: Optimizes write latency by acknowledging the client after a **Quorum of 2** writes, while the 3rd replica is written asynchronously in the background.

### Advanced Capabilities
- **Hybrid Communication**: RESTful HTTP APIs for client interactions combined with high-performance **gRPC** for node-to-node replication.
- **Smart Proxying**: Workers act as coordinators; if a request reaches the wrong node, it is transparently proxied to the correct owner.
- **Real-Time Dashboard**: A Vue.js-based UI powered by **Socket.IO** that visualizes cluster health and data storage in real-time.

---

## 🛠️ Technology Stack

- **Runtime**: Node.js
- **Frontend**: Vue.js 3, Tailwind CSS
- **Backend Framework**: Express.js
- **Internal RPC**: gRPC (@grpc/grpc-js) + Protocol Buffers
- **Real-Time Events**: Socket.IO
- **Persistence**: JSON File Storage

---

## 📂 Project Structure

```text
project-root/
│
├── database/                # Persistent JSON storage for workers
├── proto/                   # gRPC Protocol Buffer definitions
├── public/                  # Frontend Dashboard
├── src/                     # Source Code
│   ├── config.js            # Configuration constants
│   ├── controller.js        # Cluster Manager logic
│   ├── kv_stores.js         # Main Entry Point
│   ├── logger.js            # Custom logging utility
│   ├── utils.js             # Consistent Hashing algorithm
│   └── worker.js            # Storage Node logic
├── package.json             # Dependencies
└── start.bat                # Windows Startup Script
```

---

## ⚡ Getting Started

### Prerequisites

- Node.js (v14 or higher)

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/distributed-kv-store.git
cd distributed-kv-store
```

### 2. Install dependencies

```bash
npm install
```

---

## ▶️ Running the System

### Windows

```dos
start.bat
```

### Mac/Linux

```bash
node src/kv_stores.js controller
node src/kv_stores.js worker 0
node src/kv_stores.js worker 1
node src/kv_stores.js worker 2
node src/kv_stores.js worker 3
```

---

## 🌐 Accessing the Dashboard

Open: **http://localhost:5000**

---

## 📡 API Reference

### 1. Store Data (PUT)

```http
PUT http://localhost:5001/kv/{key}
Content-Type: application/json

{
  "value": "your_data_here"
}
```

### Response

```json
{
  "status": "success",
  "replicas": 2,
  "note": "background_write_active"
}
```

---

### 2. Retrieve Data (GET)

```http
GET http://localhost:5001/kv/{key}
```

### Response

```json
{
  "found": true,
  "value": "your_data_here",
  "node_id": 1
}
```

---

### 3. Partition Info

```http
GET http://localhost:5000/partition/{key}
```

---

## 🧪 Testing Scenarios

### Replication Test
- Store a key in dashboard.
- Key appears in 3 workers.

### Fault Tolerance Test
- Kill Worker 1.
- Dashboard marks offline.
- GET still works due to replicas.

### Background Writing Test
- PUT returns quickly.
- Third replica updated asynchronously.

---

## 📄 License

MIT License.

---

