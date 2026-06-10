# Detailed Analysis: Mother Bot & Proxy Bot Synergistic Interactions

Based on architectural priorities, the core of the synergy between the central management (Mother Bot) and distributed stores (Proxy Bots) relies on safe auto-broadcasting, strict uptime monitoring, and consistent engagement.

To optimize the development pipeline, the features below have been arranged from **Easiest to Hardest to Implement**.

---

## 1. Automated Performance Reports (Mother → Proxy Owner)
*Complexity: 🟩 Low (Easiest to Implement)*

**Problem**: Sustained engagement is key. Sellers need motivation and visibility into their metrics without opening external dashboards.
**Interaction Flow**:
1. Mother Bot runs a simple scheduled cron job every **Friday morning**.
2. Mother Bot compiles a digest of the `COMPLETED_DATA` ledger records for that specific week.
3. Mother Bot pushes a formatted summary directly to the co-member so they start their weekend fully updated:
   > 📊 *Your Weekly Store Report*
   > Orders Processed: 42
   > Gross Revenue: ₦12,500
   > Net Profit Earned: ₦2,100
   > Active Customers: 18

## 2. Uptime Monitoring & Health Alerts (Mother → Proxy Owner)
*Complexity: 🟩 Low to Medium*

**Problem**: Because Proxy Bots operate via Baileys Web socket sessions, they can disconnect if the overarching WhatsApp account logs them out or encounters network limits.
**Interaction Flow**:
1. Mother Bot periodically monitors the internal `sessionManager` map structure in memory/DB.
2. If a Proxy Bot's status changes to `offline` or `banned`, the Mother Bot instantly intercepts this event.
3. Mother Bot messages the co-member:
   > ⚠️ *Critical Alert: Your Data Store is offline.*
   > Your customers currently cannot place orders. Please reply **PAIR [your_phone_number]** to reconnect a fresh session immediately. (e.g., PAIR 08012345678)

## 3. The Unified Auto-Broadcast System
*Complexity: 🟨 Medium to High (Requires queue and delay logic)*

### A. The "Post-Onboarding" Launch Broadcast
**Trigger**: Immediately after a co-member completes onboarding via the `PAIR [your_phone_number]` command.
**Interaction Flow**:
1. **Permission Request**: Once the device pairs, Mother Bot sends an automated prompt to the co-member asking if they wish to broadcast the launch to their contacts (replying YES or NO).
2. **Safe Proxy Bot Batching**: If YES, the Proxy Bot reads the synced contacts list, initializes a job queue, and begins sending introductory messages to 10-15 contacts per hour, introducing random delays (jitter) of 3 to 7 minutes between each message to evade anti-spam algorithms.

### B. Feature Updates & Promo Broadcasts
**Trigger**: The platform administrator rolls out a new service (e.g., WAEC Pins).
**Interaction Flow**:
1. **Mother Bot Notification**: Mother Bot pushes a message to all Proxy Owners asking if they want to enable the new feature and broadcast the news (YES/NO).
2. **Execution/Batching**: The Proxy Bot dynamically updates its customer-facing UI and begins safely batch-broadcasting the news strictly to users who have previously interacted with it.

---

## Deferred Features (Later Phases)
*Complexity: 🟥 High (Hardest to Implement)*

To maintain laser focus on core functionality and platform stability, these highly-requested features are explicitly scheduled for later phases:

### 4. Dynamic Profit Management 
*Complexity: 🟥 High (Complex DB cascades and boundary validation)*
Allowing co-members to manually set and tweak individual margin markups (e.g., `SET MARKUP 40`). This requires safely updating base prices across potentially thousands of generated menus dynamically without breaking parsing logic.

### 5. Customer Conflict Escalation & Dispute Resolution
*Complexity: 🟥 Very High (Live chat routing between separate Baileys sessions)*
If an end-user says "Refund", the Proxy bot suspends its automated responses, tags a dispute session, and proxies the chat flow to the central Mother Bot for a human Admin to take over the conversation seamlessly. This involves complex state-locking and multi-node message brokering.
