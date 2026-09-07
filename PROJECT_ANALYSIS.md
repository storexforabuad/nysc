# 📡 Clarion A.I. (NYSC Digital Hub) — Comprehensive Project Analysis & Blueprint

---

## 1. Executive Summary & Core Mission

**Clarion A.I.** (also referred to as **Clarion Digital Hub** or **NYSC Bot System**) is an automated WhatsApp-based enterprise ecosystem inspired by the **NYSC SAED** (*Skill Acquisition and Entrepreneurship Development*) initiative in Nigeria.

The platform empowers **National Youth Service Corps (NYSC) members** to launch and operate **autonomous, 24/7 telecommunications data vending franchises** directly from their existing WhatsApp phone numbers without requiring upfront capital, physical inventory, or manual customer service.

Beyond individual income generation, the platform has an embedded **social impact mission**: a customizable percentage of all transaction profits is routed directly into funding NYSC community development initiatives:
* Renovating corps members' lodges across Nigeria.
* Primary Place of Assignment (PPA) renovations, library upgrades, and school supplies.
* NYSC local government secretariat community development service (CDS) projects.
* Sponsoring additional kits and gear for corps members **during and after orientation camp**.
* Providing direct micro-grants for corps members' personal CDS projects.

---

## 2. Core Philosophy & Business Model

* **Tagline & Brand Pillar:** *"Simplicity, Instant, Reliable, Affordable."*
* **Pricing Strategy:** Unlike typical retail third-party vendors that impose steep markups, Clarion prices data **at or below official network rates** while remaining profitable through wholesale aggregator pricing.
* **Frictionless Customer Experience:** Customers do not navigate complex web portals or long multi-page menus. They send a single message to the storefront:
  ```text
  Data 500
  ```
  or for third-party gifting:
  ```text
  Data 1000 08012345678
  ```
  The bot automatically detects the network operator (MTN, Airtel, Glo, 9mobile) from the phone number prefix and returns the top 3–4 curated options around that price bracket.

---

## 3. Dynamic Profit-Sharing & Gamified Ranks

The profit-sharing architecture separates the **Platform Infrastructure Share (fixed 20%)** from the **Member Enterprise Pool (80%)**. The corps member retains agency over their 80% pool by selecting their community donation tier, which drives the platform's gamified ranking system:

```
                          ┌─────────────────────────────────────────┐
                          │       Gross Profit on Transaction       │
                          │        (Sell Price - Base Cost)         │
                          └────────────────────┬────────────────────┘
                                               │
                      ┌────────────────────────┴────────────────────────┐
                      ▼                                                 ▼
             ┌─────────────────┐                               ┌─────────────────┐
             │       20%       │                               │       80%       │
             │ Clarion Platform│                               │ Corp Member     │
             │ Infrastructure  │                               │ Enterprise Pool │
             └─────────────────┘                               └────────┬────────┘
                                                                        │
                 ┌──────────────────────────────┬───────────────────────┴──────┬──────────────────────────────┐
                 ▼                              ▼                              ▼                              ▼
         ┌──────────────┐               ┌──────────────┐               ┌──────────────┐               ┌──────────────┐
         │Pioneer Class │               │ Clarion Lord │               │Clarion Master│               │Clarion Member│
         │(Launch Tier) │               │(80% Donated) │               │(50% Donated) │               │(20% Donated) │
         ├──────────────┤               ├──────────────┤               ├──────────────┤               ├──────────────┤
         │ CDS:   16.0% │               │ CDS:   64.0% │               │ CDS:   40.0% │               │ CDS:   16.0% │
         │ Owner: 64.0% │               │ Owner: 16.0% │               │ Owner: 40.0% │               │ Owner: 64.0% │
         │ Badge: LORD  │               │ Badge: LORD  │               │ Badge: MASTER│               │ Badge: MEMBER│
         └──────────────┘               └──────────────┘               └──────────────┘               └──────────────┘
```

### 🏆 Gamified Ranks, Benefits & Value-Added Privileges

Clarion goes beyond a simple data bot to act as a **comprehensive NYSC service year companion**. Each tier unlocks distinct career, networking, and recognition benefits:

| Rank / Tier | Corp Member Keeps | NYSC CDS Donated | Visual Badge | Value-Added Privileges & Benefits |
| :--- | :--- | :--- | :--- | :--- |
| **Clarion Pioneer Class** *(Founding Batch)* | **64% of total profit** (80% of vendor pool) | **16% of total profit** (20% of vendor pool) | 🥇 **Gold & Royal Purple Imperial Shield** | **All Lord Perks Included:** Gold Profile ID Card, NYSC Contacts Backup, Career Courses, PPA Reviews, Job+ Priority, Clarion Merch, Event Invites, Clarion Awards consideration, and **Personal CDS Grant Sponsorship Eligibility**. |
| **Clarion Member** *(Standard / Default)* | **64% of total profit** (80% of vendor pool) | **16% of total profit** (20% of vendor pool) | 🥉 **Bronze Clarion Shield** | • **NYSC Contacts Auto-Backup:** Exports numbers tagged with "NYSC" into downloadable VCF.<br>• **Career Courses:** Access to self-paced digital skills curriculum.<br>• **PPA Reviews:** Crowdsourced ratings & accommodation tips for schools, ministries, and firms.<br>• **Job Board:** Access to entry-level job and internship listings. |
| **Clarion Master** *(Community Partner)* | **40% of total profit** (50% of vendor pool) | **40% of total profit** (50% of vendor pool) | 🥈 **Silver Clarion Shield** | • **All Member Benefits Included**.<br>• **Job+ Access:** Priority CV forwarding to corporate hiring partners.<br>• **Clarion Merch:** Discounts & access to branded tees, caps, and stickers.<br>• **Event Invites:** Exclusive invitations to Clarion leadership meetups and webinars. |
| **Clarion Lord** *(Hero of Service)* | **16% of total profit** (20% of vendor pool) | **64% of total profit** (80% of vendor pool) | 🥇 **Gold & Royal Purple Imperial Shield** | • **All Master Benefits Included**.<br>• **Clarion Awards:** Official State Honors nomination endorsement & physical trophy.<br>• **Personal CDS Sponsorship (`CDS APPLY`):** Direct eligibility to submit proposals for Clarion to fund personal community development projects. |

### 🔄 Rank Management via MotherBot
* Corps members select their starting tier during initial onboarding.
* Post-onboarding, members can message `RANK` to MotherBot at any time to:
  * View current donation tier, active badge, and cumulative CDS impact score.
  * Switch ranks instantly (e.g. promoting from Member to Master or Lord).
  * Automatically trigger the dispatch of a newly updated Clarion Profile Card. 

---

## 4. Visual Media Engine: Profile Cards, Impact Odometers & CDS Grants

Using the server-side Node.js `canvas` graphics engine (`src/services/mediaGen.js`), Clarion automatically renders high-resolution social assets.

### 🪪 The Clarion Franchise Profile Card
* **Generation Triggers:**
  1. Upon successful onboarding and QR pairing.
  2. Whenever a member upgrades or changes their rank via the `RANK` command.
  3. On demand when texting `PROFILE` or `CARD` to MotherBot.
* **Visual Elements on Card:**
  * Official NYSC SAED x Clarion Co-Branding Banner.
  * Verified Account Name & State Code (`NY/24A/1234`).
  * Storefront WhatsApp Phone Number (`+234 80X XXX XXXX`).
  * Dynamic Rank Crest (Clarion Member, Master, or Lord/Pioneer).
  * Verification QR Code linking directly to chat with their storefront bot.

### 📈 The Community Impact Odometer
* Tracks the cumulative naira value of CDS donations generated through that member's storefront (`totalCdsDonated` in Firestore).
* **Milestone Levels:**
  * 🥉 **₦1,000 Milestone:** *Community Helper*
  * 🥈 **₦5,000 Milestone:** *Community Builder*
  * 🥇 **₦10,000 Milestone:** *Community Pillar*
  * 💎 **₦25,000+ Milestone:** *NYSC Hero of Service*
* Rendered directly onto the Profile Card once the member crosses the ₦1,000 milestone, providing tangible visual proof of service for State Coordinator commendations. (so that means motherbot will send an updated prile automatically when these milestones are reached)

### 📑 Personal CDS Sponsorship Proposals (`CDS APPLY` via PDF)
Corps members holding the **Clarion Lord** or **Clarion Pioneer Class** rank can apply for direct co-funding of their personal community projects (e.g., school borehole, library renovation, medical outreach):
1. **Submission via WhatsApp:** Member texts `CDS APPLY` to MotherBot.
2. **Document Ingestion:** MotherBot prompts the user to upload their project proposal as a **PDF document** (containing project scope, community LGA, budget breakdown, and site photos).
3. **Database & Storage:** The PDF is uploaded to Firebase Storage, creating an entry in the Firestore `cds_proposals` collection.
4. **Admin Command Center Workflow (Localhost):**
   * A dedicated **"CDS Project Proposals"** management tab displays incoming proposals with Corps Member Name, State Code, Rank, Cumulative Sales, Requested Grant Amount, and an embedded PDF viewer.
   * **[ACCEPT] Button:** Admin clicks Accept $\rightarrow$ MotherBot dispatches an automated WhatsApp message confirming grant approval, milestone disbursements, and publicity coordination.
   * **[REJECT] Button:** Admin clicks Reject with feedback $\rightarrow$ MotherBot dispatches an encouraging notification explaining the rejection reason with instructions for resubmission.

---

## 5. MotherBot Direct Data Purchasing Engine (Self & Public)

MotherBot (`src/bot/MotherBot.js`) serves two distinct buyer types:

### 1. Registered Corps Member (Store Owner) Self-Purchase
* **Syntax:**
  * `DATA [Amount]` (e.g., `DATA 500`) $\rightarrow$ displays plans for the corps member's own line.
  * `DATA [Amount] [Phone]` (e.g., `DATA 1000 08012345678`) $\rightarrow$ gifts/sends data to a third party.
* **Payment Routing:**
  * **Option A (Clarion Profit Wallet):** If the member's wallet balance $\ge$ wholesale base cost, funds are debited directly from their wallet at **wholesale cost**. Personal data becomes an instant operational discount.
  * **Option B (Dedicated Squad Virtual Account):** If wallet funds are insufficient, MotherBot returns the member's **personal dedicated Squad virtual account**. Once paid, profit is computed and credited back to their own wallet according to their rank.

### 2. General Public / Non-Proxy Buyer Purchase
* If an unregistered user or customer chats MotherBot requesting data:
  * MotherBot detects their mobile operator and returns matching plans.
  * **Payment Account Provided:** MotherBot supplies the **Central ClarionHub Squad Virtual Account**.
  * **Profit Settlement:** 100% of the net profit on the transaction is split between **Clarion Platform Ops (50%)** and the **Central NYSC CDS Pool (50%)**, as there is no intermediary proxy owner.

---

## 6. High-Level System Architecture

```
                            ┌───────────────────────────────┐
                            │    Admin Web Command Center   │
                            │     (React 19 / Vite SPA)     │
                            │  • VPS Health & Scale Advisor │
                            │  • CDS Proposal Review Panel  │
                            └───────────────┬───────────────┘
                                            │ HTTP / JWT
                                            ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             Clarion Node.js Backend                              │
│                                                                                  │
│   ┌────────────────────────────────┐        ┌────────────────────────────────┐   │
│   │    MotherBot (Clarion Hub)     │        │      ProxyWorker Threads       │   │
│   │    • Onboarding & Bank Lock    │        │    • Runs on Corp Member WA    │   │
│   │    • Pioneer / Rank Engine     │        │    • Isolated worker per bot   │   │
│   │    • Profile Card & Odometer   │        │    • Interacts with buyers     │   │
│   │    • Direct Self/Gift Purchases│        │    • Third-party DATA gifting  │   │
│   │    • CDS Proposal Ingestion    │        │    • Customer Wallets          │   │
│   │    • Wallet & 1-Tap Cashouts   │        │                                │   │
│   └───────────────┬────────────────┘        └────────────────┬───────────────┘   │
│                   │                                          │                   │
│   ┌───────────────┴──────────────────────────────────────────┴───────────────┐   │
│   │                             Core Services                                │   │
│   │  • SquadService (GTCO Virtual Accounts, Name Lookup & Bank Transfers)    │   │
│   │  • PayflexService (SME/Gifting Telco Data API + Tiered Pricing)          │   │
│   │  • WalletService (Dynamic Rank Settlement, Ledger Accounting)            │   │
│   │  • MediaGen (Node Canvas: Receipts, Price Cards, Profile ID Cards)       │   │
│   │  • RetryQueue (Exponential backoff & Telco Auto-Refund to Wallet)        │   │
│   │  • StatusPostJob (Cron-based automated WhatsApp status marketing)        │   │
│   │  • NetworkRecoveryNotifier (Proactive wallet alerts on network restore)  │   │
│   └──────────────────────────────────────────────────────────────────────────┘   │
└───────────────────────┬──────────────────────────────┬───────────────────────────┘
                        │                              │
                        ▼                              ▼
          ┌───────────────────────────┐  ┌───────────────────────────┐
          │     Firebase Firestore    │  │    External API Gateways  │
          │  • users, contacts & banks│  │  • Squad (HabariPay/GTCO) │
          │  • ledger & cds_proposals │  │  • Peyflex (Telco API)    │
          │  • plansCache             │  │  • Baileys (WhatsApp Web) │
          └───────────────────────────┘  └───────────────────────────┘
```

---

## 7. Key Workflows & User Journeys

### 1. Corp Member Onboarding & Permanent Identity Lock
1. **Trigger:** Corps member messages MotherBot: `connect 000`.
2. **NYSC State Code:** Validated via regex (`^[A-Z]{2}/\d{2}[A-C]/\d{4}$`, e.g., `LA/24B/1234`).
3. **Gamified Partnership Selection:**
   ```text
   Choose your Clarion Partnership Tier:
   1 - Clarion Member (Keep 64% Profit, Donate 16% to CDS) [Default]
   2 - Clarion Master (Keep 40% Profit, Donate 40% to CDS)
   3 - Clarion Lord (Keep 16% Profit, Donate 64% to CDS)

   4 - Clarion Pioneer Class (Founding Batch: Keep 64% Profit + Awarded Clarion Lord Rank & All Privileges) 🚀
   ```
4. **Bank Details Setup & Name Locking:**
   * MotherBot prompts: *"Please reply with your Bank Name and 10-digit Account Number for profit cashouts (e.g., GTBank 0123456789):"*
   * System calls `squad.validateBankAccount(bankCode, accountNumber)`.
   * The returned account holder name (e.g. `ADEKUNLE SAMUEL OLUWASEUN`) is verified with the member and permanently locked in Firestore as `userData.verifiedName` and `userData.bankDetails`.
5. **Dedicated Virtual Account Creation:** Generates their personal HabariPay/GTCO collection account.
6. **QR Code Pairing via Linked Devices:** Generated and sent to a secondary phone or computer screen for scanning.
7. **Instant Profile Card Dispatch:** Canvas renders their personalized **Clarion Franchise ID Card** and delivers it directly to the chat.
8. **Safe Launch Copy-Paste Kit:** To prevent WhatsApp algorithmic bans on day 1, automated mass broadcasts are bypassed. MotherBot delivers a pre-formatted message with a clickable link (`https://wa.me/234XXXXXXXXXX?text=Data%20500`) for the member to forward to their top 20 contacts and WhatsApp status.

### 2. Customer Purchase, Third-Party Gifting & Proactive Recovery
1. **Inquiry:** Customer chats the Proxy storefront with `Data 500` (for self) or `Data 1000 08031234567` (to gift someone else).
2. Bot auto-detects the target phone number's network operator and returns matching plans.
3. If the customer has an existing balance in their **Clarion Customer Wallet** (from a prior telco failure), funds are deducted immediately and data is dispensed.
4. If paying by transfer, the bot provides the store owner's Squad GTCO virtual account.
5. Squad webhook confirms payment $\rightarrow$ Payflex API dispenses data $\rightarrow$ Profit is split according to the store owner's active rank $\rightarrow$ Node Canvas generates a branded receipt.
6. **Proactive Recovery Notification:** If an order previously failed due to telco downtime and was auto-refunded to a customer wallet, the background notifier pings the customer once the network stabilizes:
   > *"🟢 Good news! The MTN network downtime has cleared. You still have ₦500 in your Clarion Wallet. Just reply 'Data 500' to complete your recharge instantly!"*

### 3. Corp Member Cashout Flow & Bank Update Security
* Texting `BALANCE` or `BAL` displays earned wallet balance and pending cashouts.
* Texting `WITHDRAW [amount]` (Minimum: ₦1,000):
  * **Zero Repetitive Typing:** Because bank details are locked on file, MotherBot immediately prompts:
    > *"💸 Transfer ₦2,000 (Net ₦1,910 after ₦90 fee) to your verified GTBank (0123456789 - ADEKUNLE SAMUEL)? Reply YES to confirm or CANCEL."*
  * **Fee Calculation:**
    * Squad Bank Payout Fee: **₦50.00**
    * Platform Service Fee: **₦40.00**
    * Total Deduction: **₦90.00** (psychologically optimized sub-₦100 fee).
  * Initiates bank transfer via Squad payout endpoints upon `YES`.
* **Updating Bank Details (`UPDATE BANK`):**
  * Members can text `UPDATE BANK` to change their payout account.
  * To prevent account tampering and cover API validation charges, a **₦100.00 verification fee** is debited from their wallet balance.

---

## 8. Scalable Infrastructure & Financial Blueprint (TrueHost)

### 🖥️ TrueHost Nigeria VPS Specs & Cost Matrix

| Plan Tier | vCPU | RAM | SSD Storage | Bandwidth | Monthly Cost (Approx) | Safe Active ProxyBot Capacity |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Cloud VPS 1** | 1 Core | 1 GB | 25 GB | 1 TB | ~₦6,910 | 5–8 Bots *(Not recommended due to OOM risk)* |
| **Cloud VPS 2 (Entry Tier)** | **1 Core** | **2 GB** | **50 GB** | **1 TB** | **~₦10,133 – ₦11,000** | **15–20 Bots** *(Optimal Starting Point)* |
| **Cloud VPS 3 (Growth Tier)** | **2 Core** | **4 GB** | **100 GB** | **10 TB** | **~₦17,622** | **40–60 Bots** |
| **Cloud VPS 4 (Pod Unit Tier)**| **4 Core** | **8 GB** | **200 GB** | **25 TB** | **~₦36,666** | **100–125 Bots** *(The Core Scaling Brick)* |

---

### 🌐 The "Sharded Pod" Multi-Node Architecture (Scaling to 1,000 – 5,000 Bots)

#### Why NOT a Single Monolithic Server?
Connecting 1,000+ WhatsApp Web sockets to Meta from a single IP address will trigger Meta's automated data-center anti-bot firewalls, leading to mass session disconnects and IP bans. Furthermore, one MotherBot number cannot handle incoming traffic from 5,000 corps members simultaneously.

#### The Distributed Sharded Pod Solution:
1. **Modular Pod Sizing:** Use TrueHost **Cloud VPS 4 (₦36,666/mo — 8GB RAM)** as the fundamental building block. Each VPS runs as an isolated pod hosting **100 to 125 active ProxyWorkers**.
2. **Dedicated Static IP per Pod:** Each VPS has its own unique IPv4 address. Meta's servers only see ~100 distributed connections per IP, completely bypassing automated bot-farm detection.
3. **Dedicated MotherBots per NYSC Batch/Zone:** Instead of one overloaded central number, MotherBots are sharded across lines:
   * *MotherBot Line 1:* South-West & Lagos Corps Members (Pods 1–3)
   * *MotherBot Line 2:* North-Central & Abuja Corps Members (Pods 4–6)
   * *MotherBot Line 3:* South-South / South-East (Pods 7–9), etc.
4. **Shared Cloud Brain:** All Pods read and write to the same **Firebase Firestore** database and report to the same **Localhost Admin Command Center**.

```
                                  ┌─────────────────────────────────────────┐
                                  │       Central Command & Database        │
                                  │   • Firebase Firestore (Shared State)   │
                                  │   • Squad Webhook Load Balancer         │
                                  │   • React Admin Command Center          │
                                  └────────────────────┬────────────────────┘
                                                       │
         ┌─────────────────────────────────────────────┼─────────────────────────────────────────────┐
         ▼                                             ▼                                             ▼
 ┌───────────────────────────┐                 ┌───────────────────────────┐                 ┌───────────────────────────┐
 │   Pod 1: Cloud VPS 4      │                 │   Pod 2: Cloud VPS 4      │                 │   Pod N: Cloud VPS 4      │
 │   (TrueHost ~₦36,666/mo)  │                 │   (TrueHost ~₦36,666/mo)  │                 │   (TrueHost ~₦36,666/mo)  │
 │   IP: Dedicated Node A    │                 │   IP: Dedicated Node B    │                 │   IP: Dedicated Node N    │
 ├───────────────────────────┤                 ├───────────────────────────┤                 ├───────────────────────────┤
 │ • MotherBot 1 (Zone A)    │                 │ • MotherBot 2 (Zone B)    │                 │ • MotherBot N (Regional)  │
 │ • 100 – 125 ProxyWorkers  │                 │ • 100 – 125 ProxyWorkers  │                 │ • 100 – 125 ProxyWorkers  │
 │ • Local 4GB Swap Cushion  │                 │ • Local 4GB Swap Cushion  │                 │ • Local 4GB Swap Cushion  │
 └───────────────────────────┘                 └───────────────────────────┘                 └───────────────────────────┘
```

---

### 💰 Unit Economics & Financial Breakdown

#### 1. Per-Transaction Profit Mechanics
* Across all telco data tiers, the **weighted average net profit is ~₦42.50** per transaction.
* **Platform Share (Fixed 20%):** **₦8.50** per data transaction.
* **Vendor Pool (80%):** **₦34.00** per data transaction split based on rank:
  * **Clarion Pioneer Class / Member:** Corp Member keeps **₦27.20**, donates **₦6.80** to CDS.
  * **Clarion Master:** Corp Member keeps **₦17.00**, donates **₦17.00** to CDS.
  * **Clarion Lord:** Corp Member keeps **₦6.80**, donates **₦27.20** to CDS.
* **Individual Vendor Earnings:** A Pioneer Class vendor doing 5 sales/day clears **₦4,080 / month** in personal cash; at 10 sales/day, they clear **₦8,160 / month** of passive pocket money.
* **Platform Revenue Streams:**
  1. 20% Data Transaction Margin (₦8.50 avg per order)
  2. Platform Cashout Service Fee (₦40.00 per withdrawal)
  3. Security Bank Update Fee (₦100.00 per bank change)

---

### 📊 Grand Profitability Scaling Matrix (15 to 5,000 Bots)

The following financial projections assume a conservative average of **4 data sales per active bot per day** and **2 withdrawals per vendor per month**:

| Scale Milestone | Active ProxyBots | TrueHost Hosting Setup | Total Monthly Hosting Cost | Total Monthly Data Orders | Total Monthly Gross Platform Revenue | **Net Monthly Platform Profit** | Total Monthly CDS Community Pool |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Launch Phase** | **15 – 20** | 1x Cloud VPS 2 (2GB) | **₦11,000** | 2,400 | **₦22,000** | **+₦11,000 / month** | **₦16,320 / month** |
| **Growth Phase** | **50** | 1x Cloud VPS 3 (4GB) | **₦17,622** | 6,000 | **₦55,000** | **+₦37,378 / month** | **₦40,800 / month** |
| **Pod Unit Tier** | **125** | 1x Cloud VPS 4 (8GB) | **₦36,666** | 15,000 | **₦137,500** | **+₦100,834 / month** | **₦102,000 / month** |
| **Scale 1,000** | **1,000** | 8x Cloud VPS 4 (Pods) | **₦293,328** | 120,000 | **₦1,100,000** | **+₦806,672 / month** | **₦816,000 / month** |
| **Scale 2,500** | **2,500** | 20x Cloud VPS 4 (Pods) | **₦733,320** | 300,000 | **₦2,750,000** | **+₦2,016,680 / month** | **₦2,040,000 / month** |
| **Scale 5,000** | **5,000** | 40x Cloud VPS 4 (Pods) | **₦1,466,640**| 600,000 | **₦5,500,000** | **+₦4,033,360 / month** | **₦4,080,000 / month** |

---

### 🖥️ Admin Command Center: Real-Time VPS Scale Advisor Widget

To maintain operational visibility on `localhost` (fully responsive on mobile and desktop), the Admin Dashboard incorporates a **Hosting Health & Scale Advisor** card:

* **Real-Time Sockets Gauge:** Visual indicator displaying active ProxyBot connections vs. current VPS RAM threshold (e.g. `16 / 20 Bots Active — 80% RAM Allocation`).
* **Financial Odometer:** Real-time counters showing Total Monthly Gross Platform Revenue, Net Platform Profit, and Total CDS Funds Available.
* **Proactive Action Banner:**
  * *Green State:* `"🟢 VPS Status: Optimal. Capacity headroom at 35%."`
  * *Yellow State (Upgrade Trigger):* `"🟡 Scale Alert: 18/20 bots active & monthly platform profit is ₦26,400. Threshold reached: Ready for 1-click in-place upgrade to Cloud VPS 3."`
  * *Red State (Pod Saturated):* `"🔴 Pod Saturated: Current pod has reached 120 bots. Provision Pod #2 to balance incoming traffic."`

---

## 9. Directory Structure at a Glance

| Directory / File | Description |
| :--- | :--- |
| `src/bot/MotherBot.js` | Central onboarding, rank management, profile card delivery, direct self/gift vending, bank withdrawals, `CDS APPLY` ingestion |
| `src/bot/ProxyBot.js` | Storefront bot handling customer orders, third-party gifting (`DATA [amt] [phone]`), wallet deductions, and price matching |
| `src/bot/ProxyWorker.js` | Isolated worker thread runner for each corps member's Baileys WhatsApp socket |
| `src/bot/SessionManager.js` | Lifecycle orchestrator for Baileys auth credentials, QR code generation, and IPC |
| `src/services/payflex.js` | Telco data catalog, tiered markups, and live vending via Peyflex API |
| `src/services/SquadService.js` | HabariPay/GTCO virtual accounts, real-time bank name verification, and bank transfers |
| `src/services/WalletService.js` | Dynamic 80/20 tripartite settlement, ledger accounting, bank fee rules |
| `src/services/mediaGen.js` | Node Canvas engine for Franchise Profile Cards, Rank Badges, and Impact Odometers |
| `src/services/PriceCardGenerator.js` | Visual data plan price cards with 5G badges for daily marketing |
| `src/services/ReceiptGenerator.js` | Dynamic transaction receipt graphics rendered per sale |
| `src/services/RetryQueue.js` | Automated exponential backoff retry runner with wallet auto-refunds |
| `src/services/BroadcastQueue.js` | Safe, rate-throttled promotional broadcasting engine |
| `src/jobs/statusPostJob.js` | 4-post daily automated WhatsApp status poster using Node Canvas |
| `src/App.tsx` | Cyber-industrial landing page and Admin Dashboard routing |
| `src/components/admin/ScaleAdvisor.tsx` | Real-time VPS health, RAM gauge, and upgrade advisor widget |
| `src/components/admin/CdsProposals.tsx` | Admin review panel for corps members' personal CDS grant proposals |
| `why.md` | Original creator's statement of intent and SAED inspiration |

---

## 10. Summary of Architectural Implementation Checklist

1. **Firestore Schema Updates:**
   * `users` document: `donationTier` (`'PIONEER'` | `'MEMBER'` | `'MASTER'` | `'LORD'`), `totalCdsDonated`, `verifiedName`, `bankDetails` (`{ bankName, bankCode, accountNumber, accountName }`).
   * `cds_proposals` collection: `proposalId`, `userId`, `stateCode`, `grantAmountRequested`, `pdfUrl`, `status` (`'PENDING'` | `'APPROVED'` | `'REJECTED'`), `submittedAt`.
2. **MotherBot Logic Upgrades:**
   * Onboarding step 3: Include Option 4 **Clarion Pioneer Class**.
   * Onboarding step 4: One-time bank account validation via Squad and permanent name locking.
   * `UPDATE BANK` command with ₦100 wallet debit.
   * `CDS APPLY` PDF document listener.
   * Direct `DATA [amount]` and `DATA [amount] [phone]` purchasing.
3. **ProxyBot Gifting Syntax:**
   * Support `DATA [amount] [phone]` to detect recipient network and dispense directly to third parties.
4. **Node Canvas Graphics:**
   * Build `generateProfileCard(userData)` in `src/services/mediaGen.js` featuring the member's rank badge, verified name, and impact odometer.
5. **Admin Dashboard Widgets:**
   * Build the **Real-Time VPS Scale Advisor** card.
   * Build the **CDS Proposal Review Panel** with Accept/Reject actions.
