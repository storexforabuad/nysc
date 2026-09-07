# 📡 Clarion A.I. (NYSC Digital Hub) — Comprehensive Project Analysis

---

## 1. Executive Summary & Core Mission

**Clarion A.I.** (also referred to as **Clarion Digital Hub** or **NYSC Bot System**) is an automated WhatsApp-based enterprise ecosystem inspired by the **NYSC SAED** (*Skill Acquisition and Entrepreneurship Development*) initiative in Nigeria.

The platform empowers **National Youth Service Corps (NYSC) members** to launch and operate **autonomous, 24/7 telecommunications data vending franchises** directly from their existing WhatsApp phone numbers without requiring upfront capital, physical inventory, or manual customer service.

Beyond individual income generation, the platform has an embedded **social impact mission**: a fixed percentage of all transaction profits is routed directly into funding NYSC community development initiatives:
* Renovating corps members' lodges across Nigeria.
* Primary Place of Assignment (PPA) renovations and upgrades.
* NYSC local government secretariat community projects.
* Sponsoring additional kits and gear for corps members during and after orientation camp.

---

## 2. Core Philosophy & Business Model

* **Tagline & Brand Pillar:** *"Simplicity, Instant, Reliable, Affordable."*
* **Pricing Strategy:** Unlike typical third-party data vendors that impose steep retail markups, Clarion prices data **at or below official network rates** while remaining profitable through wholesale aggregator pricing.
* **Frictionless Customer Experience:** Customers do not navigate complex menus or long price lists. They send a single message:
  ```text
  Data 500
  ```
  or
  ```text
  Data 1000
  ```
  The bot automatically detects their mobile network (MTN, Airtel, Glo, 9mobile) and returns the top 3–4 curated options around that price bracket.


### 💰 Profit-Sharing Tripartite Model
For every completed data vending transaction, the net profit (retail selling price minus wholesale base cost) is split automatically via the ledger:

```
               ┌─────────────────────────────────────────┐
               │         Net Profit on Transaction       │
               └────────────────────┬────────────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           ▼                        ▼                        ▼
     ┌───────────┐            ┌───────────┐            ┌───────────┐
     │    50%    │            │    30%    │            │    20%    │
     │Corp Member│            │Platform   │            │ NYSC CDS  │
     │(ProxyBot) │            │Ops & Dev  │            │ Community │
     └───────────┘            └───────────┘            └───────────┘
```
i want platform to be 20% and the remaining 80% the corp member decides if they wish to donate 80%, 50% or 20% of it. this will be like a rank something, gamified, people donating 80% will be ranked as Clarion Lords, 50% as Clarion master, and 20% as clarion member, anybody can be called clarion members though. Corp members shuld be able to select this during onboarding. also after onboarding, a corp member donating 20% should be able to message mother bot and text a keyword, see their current rank details and the option to increase to either 50% or 80% or their profit share. we also need to create some sort of media assets for each registerd corp memeber like a Clarion profile with some few info on it and and rank, things like this to make the corp member look good. what do you think? 
   
* **50% to the Corp Member:** Credited immediately to their personal Clarion Profit Wallet.
* **30% to Clarion Platform:** Covers server compute, API infrastructure, maintenance, and platform expansion.
* **20% to the NYSC CDS Pool:** Directly sponsors Community Development Service projects, lodge renovations, and camp kits.

---

## 3. High-Level Architecture

The application is structured as a full-stack, distributed WhatsApp automation platform built on **Node.js (ES Modules)**, **Express**, **React 19**, **Vite**, **Tailwind CSS**, and **Firebase Firestore**.

```
                           ┌───────────────────────────────┐
                           │    Admin Web Command Center   │
                           │     (React 19 / Vite SPA)     │
                           └───────────────┬───────────────┘
                                           │ HTTP/JWT
                                           ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             Clarion Node.js Backend                              │
│                                                                                  │
│   ┌────────────────────────────────┐        ┌────────────────────────────────┐   │
│   │     MotherBot (Clarion Hub)    │        │      ProxyWorker Threads       │   │
│   │    • Corp Member Onboarding    │        │    • Runs on Corp Member WA    │   │
│   │    • State Code & Bank Setup   │        │    • Isolated worker per bot   │   │
│   │    • Wallet & Withdrawals      │        │    • Interacts with buyers     │   │
│   │    • Weekly Performance Digest │        │    • Handles DATA / BUY orders │   │
│   └───────────────┬────────────────┘        └────────────────┬───────────────┘   │
│                   │                                          │                   │
│   ┌───────────────┴──────────────────────────────────────────┴───────────────┐   │
│   │                             Core Services                                │   │
│   │  • SquadService (GTCO Virtual Accounts & Webhook Verification)           │   │
│   │  • PayflexService (SME/Gifting Telco Data API + Tiered Pricing)          │   │
│   │  • WalletService (Ledger accounting, double-spend protection)            │   │
│   │  • RetryQueue (Exponential backoff & Telco auto-healing)                 │   │
│   │  • BroadcastQueue (Spintax, anti-ban delayed announcements)              │   │
│   │  • PriceCard & ReceiptGenerator (Node Canvas graphics engine)            │   │
│   │  • StatusPostJob (Cron-based automated WhatsApp status marketing)        │   │
│   └──────────────────────────────────────────────────────────────────────────┘   │
└───────────────────────┬──────────────────────────────┬───────────────────────────┘
                        │                              │
                        ▼                              ▼
          ┌───────────────────────────┐  ┌───────────────────────────┐
          │     Firebase Firestore    │  │    External API Gateways  │
          │  • users & contacts       │  │  • Squad (HabariPay/GTCO) │
          │  • ledger (audit trail)   │  │  • Peyflex (Telco API)    │
          │  • plansCache             │  │  • Baileys (WhatsApp Web) │
          └───────────────────────────┘  └───────────────────────────┘
```

---

## 4. Key Workflows & User Journeys

### 1. Corp Member Onboarding & ProxyBot Pairing (we need to add step to allow corp memeber to select donation weather 20%, 50% or 80% of total profit (80%) while 20% is for bot maintenance etc also using truehost vps will 20% be profitable for us clarion? )
1. **Trigger:** The corps member messages the central **MotherBot** with `connect 000`.
2. **NYSC Verification:** Prompts for state code (validated via regex: `^[A-Z]{2}/\d{2}[A-C]/\d{4}$`, e.g., `NY/24A/1234`).
3. **Automated Virtual Bank Creation:** Generates a dedicated **HabariPay (GTCO / Squad)** virtual account tied to the user for instant collections.
4. **Bot Phone Registration:** Corp member enters the WhatsApp number they want their storefront to run on.
5. **QR Code Pairing via WhatsApp Image:**
   - The user chooses whether to receive the QR image directly or send it to another number (personal phone, friend, or computer screen).
   - Node dynamically generates a QR code image via `qrcode.toBuffer` and dispatches it over WhatsApp.
   - The user scans the QR code using WhatsApp's *Linked Devices*.
6. **Launch Broadcast:** The user can share contacts or VCARDs to receive an automated launch announcement introducing their new store.
(instead of broadcasts for now can we give them the broadcast message seperately so they can easily copy and paste to their top 20 contacts etc we shouldnt remove the broadcast feature but we will disable it for now including the auto status, disable them for now ) lets follow an effective, manual and fun broadcast for now . 

### 2. Customer Purchase Flow (On the ProxyBot)
1. **Inquiry:** Customer chats the Corp Member’s number:
   ```text
   data 500
   ```
2. **Network Detection & Plan Filtering:**
   - The system inspects the phone number prefix (`0803`, `0805`, `0701`, etc.) to determine the network operator.
   - Returns the closest plans around ₦500 grouped by duration (Daily, Weekly, Monthly) with clear serial tags (e.g. `BUY 14`).
3. **Checkout / Payment:**
   - If the customer has an existing balance in their **Clarion Wallet** (e.g., from prior refunds), the system deducts funds directly. (is there a way we can let the customer with existing balance that the network is back proactively so they can use their wallet money?)
   - Otherwise, the bot returns payment instructions with the Corp Member's unique Squad GTCO virtual account details.
4. **Automated Webhook & Dispense:**
   - Customer transfers money from any Nigerian banking app.
   - Squad fires `charge_successful` to `/webhook/squad`.
   - The order state transitions from `AWAITING_PAYMENT` ➔ `DISPENSING`.
   - Backend triggers the Payflex API to deliver the data instantly to the customer's line.
   - The order completes and calculates the 50/30/20 profit split in the ledger.(this is being reviewed)
5. **Dynamic Receipt:**
   - The Node `canvas` engine renders a branded transaction receipt with the Corp Member’s store name and masked phone number (`081****1234`), delivering it to the customer.

### 3. Corp Member Wallet & Cashout Flow
* `BALANCE` or `BAL`: Returns available earned profits and pending withdrawals.
* `HISTORY` or `TX`: Detailed ledger history of all incoming profits and cashouts.
* `WITHDRAW [amount]`:
  - Enforces a minimum withdrawal threshold (₦1,000).
  - Prompts for bank details (e.g., `GTBank 0123456789`).
  - Resolves bank code and validates account holder name in real-time via Squad API.
  - Automatically computes the breakdown:
    - Squad Bank Fee: ₦50.00
    - Platform Service Fee: ₦40.00
  - Once confirmed with `YES`, initiates bank transfer via Squad payout endpoints.
* `VIP`: Shows a ranked leaderboard of their highest-spending customers.

can we also add a feature where proxy bot or anybody can message mother bot, data, data + amount, to buy data incase a proxy owner needs data for their selves, if its a proxy owner, we should give them option to use their wallet balance if they have a wallet balance as a clarion proxy etc if they dont we should send them their own generated bank account so the profit will be sent to them, they should be able to send Data + price + number if they wanna send to somebody else. understand? 

---

## 5. Standout Engineering & Architectural Highlights

### ⚡ Worker Threads for Multi-Session Isolation
Each active Corp Member ProxyBot runs inside its own Node.js `Worker` thread (`src/bot/ProxyWorker.js`).
* If a session disconnects, encounters socket errors, or requires a restart, it **does not freeze or block the main Node event loop** for the MotherBot or any other Corp Member's store.
* Inter-Process Communication (IPC) passes broadcast orders, status uploads, and customer notifications between the main process and workers.

### 🛡️ Anti-Ban & WhatsApp Protection
WhatsApp strictly monitors bulk messaging and automated accounts. Clarion incorporates multiple protection layers:
1. **Spintax & Dynamic Variations:** Broadcast messages use `{option1|option2|option3}` syntax so identical text is not sent to multiple recipients.
2. **Simulated Human Presence:** Sends WhatsApp presence updates (`composing` ➔ `paused`) before delivering text or media.
3. **Randomized Delays:** Messages and images include jittered delays (1.5s to 6.0s) between successive sends.
4. **Number Registration Pre-Flight:** Contacts are verified with `sock.onWhatsApp()` before queuing broadcasts to ensure messages are never sent to non-WhatsApp numbers.
5. **Opt-Out Compliance:** Buyers can text `STOP` at any time to automatically unsubscribe.
6. **Deduplication & Inbound/Outbound Rate Limiting:** Debounce windows prevent double-taps on `BUY` commands, and rate limiters restrict excessive inbound queries.

### 🔄 Self-Healing Retry Queue & Customer Wallet
* If the telco aggregator experiences network downtime during vending, the order enters `FAILED_DISPENSE`. can we let the customer know when service is back for a superb customer experience and also let them know the data validity period text them when they have reach 80% of their validity period etc. what proactive interactions/triggers do you think we should impliment for customers to make them return customers etc 
* `src/services/RetryQueue.js` runs every 2 minutes with **exponential backoff** (2m, 4m, 8m).
* If all retries fail, funds are not lost: the order value is automatically converted into an in-store **Clarion Customer Wallet** balance so the customer can reuse it anytime or request support.

### 🎨 100% Automated WhatsApp Status Marketing Engine (lets disable this for now)
* Runs a 4-post daily schedule posting automated social proof to the Corp Member's WhatsApp status:
  * **7:00 AM:** Top 10 Best Data Plans visual card with 5G badges.
  * **12:30 PM & 9:00 PM:** Dynamic purchase receipt cards (anonymized) showing real sales.
  * **6:00 PM:** Targeted network promotion (MTN/Airtel/Glo deal of the day).
* **Zero Cloud Storage Cost:** Renders images dynamically on the server via `canvas` and stores them in local rotating scratch directories, purging media older than 48 hours.

### 🖥️ Admin Command Center
A React 19 web dashboard (`src/App.tsx` and `src/components/admin/ManagementViews.tsx`) featuring:
* Real-time metrics: Total System Profit, Total CDS/Philanthropy Reserve, Daily Order Volume, and Active Bot Nodes.
* Partner management: Listing all enrolled corps members and their current wallet balances.
* Pending withdrawal approvals & ledger auditing.
* Marketing Playground: Live preview generators for test receipts and price cards, plus a status caption configuration editor.

---

## 6. Directory Structure at a Glance

| Directory / File | Description |
| :--- | :--- |
| `src/bot/MotherBot.js` | Central onboarding, bank setup, wallet balance, withdrawals, and report commands |
| `src/bot/ProxyBot.js` | Customer-facing storefront bot handling `DATA`, `BUY`, and price matching |
| `src/bot/ProxyWorker.js` | Worker thread runner for isolating each corps member's Baileys WhatsApp socket |
| `src/bot/SessionManager.js` | Lifecycle orchestrator for Baileys auth credentials, QR code generation, and IPC |
| `src/services/payflex.js` | Telco data catalog, tiered markups, and live vending via Peyflex API |
| `src/services/SquadService.js` | HabariPay/GTCO virtual bank accounts, webhook verification, and bank transfers |
| `src/services/WalletService.js` | Ledger accounting, balance calculation, withdrawal records, and fee rules |
| `src/services/RetryQueue.js` | Automated exponential backoff retry runner for failed telco orders |
| `src/services/BroadcastQueue.js` | Safe, rate-throttled promotional broadcasting engine |
| `src/jobs/statusPostJob.js` | 4-post daily automated WhatsApp status poster using Node Canvas |
| `src/App.tsx` | Cyber-industrial landing page and Admin Dashboard routing |
| `why.md` | Original creator's statement of intent and SAED inspiration |
| `ProxyBot_Status_Marketing_Blueprint.md` | Marketing specification for automated WhatsApp status posting |
| `SQUAD_UAT_RESULTS.txt` | UAT test results confirming Squad Sandbox integration sign-off |

---

## 7. Current Project State & Observations

1. **Feature Completeness:** The core architecture (onboarding, virtual accounts, payment webhook, data vending, ledger accounting, withdrawals, and status marketing) is implemented with high architectural maturity (circuit breakers, rate limiting, worker threads, and retry queues).
2. **Sandbox / UAT Verification:** Integration with Squad's sandbox API for virtual account creation and transfers has already been tested and signed off.
3. **Session Stability:** Historical analysis demonstrates attention to WhatsApp LID (Linked Identity) vs. phone JID session mapping to ensure reliable message delivery across linked devices.
