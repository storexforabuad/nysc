# Free Cloud Hosting Plan for Bot Farm MVP

This plan outlines how to host the first 5 to 10 ProxyBots for free using cloud provider generous free tiers.

## Proposed Solutions

### 1. Oracle Cloud "Always Free" (Highest Recommendation)
Oracle offers one of the most generous free tiers in the industry.
- **Resources**: Up to 4 ARM Ampere A1 Compute instances with **24 GB of RAM** and 4 OCPUs.
- **Storage**: 200 GB of Block Storage (plenty for bot sessions).
- **Network**: 10 TB of outbound data transfer per month (Free).
- **Capacity**: Can easily host **100 - 200 ProxyBots** indefinitely for free.

#### Oracle Deep Dive: The "Bot Farm" Dream
> [!TIP]
> **Why this is the best**: While Google Cloud gives you 1GB of RAM, Oracle gives you **24GB**. This is essentially a professional-grade server for free. You could host your entire 1,000-bot operation on just a few of these free accounts.

**Verification with Access Bank VISA (Nigerian Cards)**
- **Will it work?** Yes, it *can* work, but Oracle is very strict. Access Bank VISA cards are generally accepted if international transactions are enabled.
- **Success Requirements**:
  1. **International Transactions**: You MUST go into your **Access Bank Mobile App** and ensure "International Transactions" and "Web/POS" are turned ON.
  2. **Minimum Balance**: Have at least **₦5,000** in the account. Oracle will do a temporary test charge (about $1.00 USD) and then refund it immediately. If the conversion rate is high, ₦5,000 ensures it doesn't decline.
  3. **Exact Address**: The address you type in Oracle's sign-up form must match the address the bank has on file for your BVN/Account **exactly**.
  4. **Browser**: Use a clean browser window (Incognito) and do not use a VPN while signing up.

### 2. Google Cloud Platform (GCP) Free Tier
- **Resources**: 1 "e2-micro" instance (2 vCPUs, 1 GB RAM).
- **Capacity**: Can host **5 to 8 ProxyBots** comfortably (~100MB per bot).
- **Region**: Must be in `us-west1`, `us-central1`, or `us-east1`.

#### GCP Deep Dive: Uptime & Reliability
> [!IMPORTANT]
> **Can bots be "Always Awake"?**
> Yes. Google Compute Engine (GCE) instances are full Virtual Machines. Unlike "App Services" (like Render/Heroku) that sleep after 15 minutes of inactivity, a GCE VM is **always on**. Your bots will stay awake 24/7 unless you manually stop the instance or the server crashes (rare).

**Is it reliable?**
- **Industry Standard**: GCP is used by global giants (Spotify, Twitter/X, etc.). Its uptime is typically 99.9%+.
- **Stability**: Since you are running a Node.js process on a Linux VM (Ubuntu/Debian), it is very stable. If the process crashes, you can use a process manager like **PM2** to auto-restart it.
- **Limitation**: The `e2-micro` has shared CPU and only 1GB RAM. If you exceed 10 bots, the RAM will swap to disk, and the bots will become extremely slow or laggy.

### 3. AWS Free Tier (12 Months)
- **Resources**: 1 "t2/t3.micro" instance (1 GB RAM).
- **Capacity**: Can host **5 to 8 ProxyBots**.
- **Limit**: Free for 12 months only.

### 4. Local Hybrid (Cloudflare Tunnel)
If you have a reliable local PC (even an old one) and a stable internet connection:
- **Resources**: Whatever your PC has (e.g., 8GB RAM = 80 bots).
- **Tool**: [Cloudflare Tunnel](https://www.cloudflare.com/products/tunnel/) (Free).
- **Benefit**: No monthly cloud fees, full control over hardware.

## Implementation Steps

### A. Environment Preparation
1. **Optimize RAM Usage**: Ensure the bot uses `pino` with a high logging level to save memory.
2. **State Management**: Ensure `Firestore` is used for sessions instead of local storage to allow scaling across nodes.

### B. Deployment Guide (Oracle Cloud Example)
1. Register at [oracle.com/cloud/free/](https://www.oracle.com/cloud/free/).
2. Provision an `Always Free` instance.
3. SSH into the instance and run:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   git clone <your-repo-url>
   cd <repo>
   npm install
   npm run build
   npm run start
   ```

## Verification Plan

### Manual Verification
- Deploy 5 bots to the selected free instance.
- Monitor RAM usage via `htop` or `top`.
- Verify each bot responds to "Menu" or "Hi" commands on WhatsApp.
- Check SquadCo webhook integration for successful payment triggers.
