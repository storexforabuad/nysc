# Deployment Plan: NYSC Data Vending Bot

This plan outlines the steps to move the NYSC WhatsApp bot from local development to a live production server.

## User Review Required

> [!IMPORTANT]
> **VPS Payment Method**: International providers like DigitalOcean require a Dollar-denominated card. If you only have a Naira card, we should use a local provider like **Whogohost**.
> **WhatsApp Connection**: You will need to re-scan the QR code for the MotherBot and any Proxy Bots once they are running on the server to establish a persistent session.

## Proposed Setup

### 1. Hardware Selection
For a Baileys-based WhatsApp bot with multiple sessions:
- **Operating System**: Ubuntu 22.04 LTS (Standard for Node.js)
- **RAM**: Minimum 2GB (WhatsApp sessions can be memory-intensive)
- **CPU**: 1 vCPU is sufficient for start
- **Storage**: 20GB SSD

### 2. Software Infrastructure
- **Process Manager**: [PM2](https://pm2.keymetrics.io/) to keep the bot running 24/7 and restart it automatically if it crashes.
- **Node.js**: v20 or v22 (LTS).
- **Database**: Continue using the current Firestore setup (ensure credentials are secure).

### 3. File Changes (Production Settings)

#### [MODIFY] [env.js](file:///c:/Users/m/Downloads/nysc/src/config/env.js)
- Ensure `MOCK_MODE` can be easily toggled via the `.env` file on the server.
- Add protection to ensure `PAYFLEX_TOKEN` and `MONNIFY` credentials are loaded correctly from environment variables.

#### [NEW] [ecosystem.config.cjs](file:///c:/Users/m/Downloads/nysc/ecosystem.config.cjs)
- Create a PM2 configuration file to manage the [server.js](file:///c:/Users/m/Downloads/nysc/src/server.js) process with appropriate environment variables and log management.

## Scaling Strategy

To grow from 10 users to 10,000, we will scale in three phases:

### Phase 1: Vertical Scaling (The Quick Fix)
- **RAM Upgrade**: WhatsApp sessions are memory-heavy. As you add more Proxy Bots, we simply increase the VPS RAM (e.g., from 2GB to 8GB).
- **PM2 Clustering**: Run the MotherBot and groups of ProxyBots in separate processes so one error doesn't take down the whole system.

### Phase 2: Distributed "Bot Farm"
- **ProxyBot Rotation**: Instead of one bot handling everyone, we distribute users across 10-20 WhatsApp accounts. This prevents "Spam Bans" from WhatsApp.
- **Load Balancing**: Implementing logic to assign a new customer to the least-busy ProxyBot.

### Phase 3: Infrastructure Decoupling
- **Redis Session Storage**: Move session data from the local disk to a Redis database for faster performance and multi-server support.
- **Microservices**: Separate the **Payment Engine** (Monnify) and **Vending Engine** (Peyflex) into their own services to ensure they never lag.

## Verification Plan

### Automated Tests
- `npm test` (if existing) to ensure core logic is intact.
- Run `node src/server.js` in a temporary test mode on the server to verify database connectivity.

### Manual Verification
1. **Connectivity**: Send a message to the MotherBot on the new server to confirm it responds.
2. **Vending Test**: Set a test data plan price to ₦50, pay via a real Monnify virtual account, and verify the data is dispensed by Peyflex.
3. **Reboot Test**: Restart the VPS and verify PM2 automatically restarts the bot and it reconnects to WhatsApp without a new scan (using saved sessions).
