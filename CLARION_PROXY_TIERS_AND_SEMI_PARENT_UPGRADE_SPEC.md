# 🏛️ Clarion A.I. Dynamic Micro-Investment & Liquidity-Backed Proxy Architecture

*Document Type: Master Architectural Blueprint, Mathematical Settlement Engine & Strategic Implementation Plan*  
*Author: Antigravity (Google DeepMind Pair Programmer) for MGL (`07032905036`)*  
*Status: Approved Design Specification & Actionable Engineering Roadmap (Pre-Implementation)*  
*Date: 2026-11-07 · Version: 2.1 (Dynamic Liquidity-Backed Model + Explicit Bank Confirmation)*  

---

## 📑 Table of Contents
1. [The Paradigm Shift: From Static Tiers to Dynamic Self-Funding Investment](#1-the-paradigm-shift)
2. [Master Economic Model & Mathematical Proof](#2-master-economic-model)
   - [Net Profit Definition (Post-Paystack Absorption)](#net-profit-definition)
   - [The Proportional Co-Funding Formula ($\alpha$-Ratio)](#proportional-formula)
   - [Detailed Settlement Scenarios Across Catalog Plans](#settlement-scenarios)
3. [The 3 Proxy Operational States](#3-proxy-operational-states)
   - [State A: Standard Child Proxy ($W < ₦1,000$)](#state-a-child)
   - [State B: Dynamic Semi-Parent Proxy ($W \ge ₦1,000$)](#state-b-semi-parent)
   - [State C: Super Parent Proxy (`07032905036` - Master Liquidity Node)](#state-c-super-parent)
4. [Zero-Fee Onboarding & Physical Anti-Spam Gate](#4-zero-fee-onboarding)
   - [₦0 Upgrade Fee & ₦0 Subscription Guarantee](#zero-fee-guarantee)
   - [The `SUGGEST` Physical Proximity QR-Binding Gate](#suggest-gate)
5. [Squad Referral Downline Model (5-Slot Milestone Engine)](#5-squad-model)
   - [Activation Milestones & Reserve Threshold](#squad-milestone)
   - [Downline Split Math (50% / 10% / 30% / 10%)](#squad-math)
6. [On-Demand Paystack Thursday Withdrawal Engine](#6-withdrawal-engine)
   - [Explicit `WITHDRAW` Command Mechanics](#withdraw-command)
   - [Updated Non-Thursday Message with Instant Data Vending Notice](#non-thursday-msg)
   - [Two-Step NIBSS `BANK` Account Binding (Confirm Before Link)](#bank-binding)
   - [Fee Deductions (₦50 Paystack + ₦50 Clarion = ₦100 Flat)](#fee-deductions)
7. [Daily & Weekly Wallet Performance Reviews](#7-performance-reviews)
   - [Daily Return Notification (8:00 PM)](#daily-report)
   - [Pre-Cashout Weekly Summary (Wednesday 8:00 PM)](#weekly-report)
8. [Comprehensive Edge Cases & Failure Protection Matrix](#8-edge-cases)
9. [Comprehensive Implementation Plan (Step-by-Step Roadmap)](#9-implementation-plan)

---

<a name="1-the-paradigm-shift"></a>
## 1. The Paradigm Shift: From Static Tiers to Dynamic Self-Funding Investment

### The Core Vision
Clarion has evolved from a traditional hierarchical reseller system into an **intelligent, self-funding micro-investment engine**.

Instead of charging arbitrary "upgrade fees" or monthly software subscriptions, **every proxy starts completely free**. An agent's earning power scales dynamically with the **working liquidity they maintain in their Clarion In-Chat Wallet**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   CLARION DYNAMIC LIQUIDITY ENGINE                     │
├────────────────────────────────────────────────────────────────────────┤
│  Wallet < ₦1,000      ──> Base Child Rate: 10% Profit (Wallet Only)    │
│  Wallet ≥ ₦1,000      ──> Dynamic Semi-Parent: Up to 40% Profit        │
│  Full Capital Backing ──> Full 40% Profit + Thursday Bank Cashout      │
│  Partial Capital (60%)──> Proportional 24% Profit (60% of 40%)         │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Principles Established by MGL (`07032905036`):
1. **₦0 Upgrade Fee**: Becoming a Semi-Parent requires zero upfront capital. Upgrades happen dynamically as wallet balance reaches ₦1,000.
2. **₦0 Recurring Subscription**: Software hosting for the automated WhatsApp bot is 100% free forever, covered by the platform's 10% cut.
3. **Master Account Centralization**: All customer payments flow directly into Super Parent `07032905036`'s Paystack account (zero KYC friction, instant setup).
4. **On-Demand Thursday Withdrawals**: Cashouts are never forced automatically; proxies initiate an on-demand `WITHDRAW` command every Thursday.
5. **Physical-Proximity Anti-Spam Gate**: New proxies can *only* be created via `SUGGEST`, and the QR code is sent to the existing proxy's screen—requiring both people to be physically together.

---

<a name="2-master-economic-model"></a>
## 2. Master Economic Model & Mathematical Proof

<a name="net-profit-definition"></a>
### Net Profit Definition (Post-Paystack Absorption)
All profit splits across the network are calculated **strictly after Paystack collection fees are absorbed**:

$$S = \text{Customer Retail Sell Price}$$
$$C = \text{Wholesale Telecom Cost (Husmodata / Peyflex)}$$
$$F = \text{Paystack Gateway Fee} = \begin{cases} \text{round}(S \times 0.015) & \text{if } S < ₦2,500 \\ \min(2000, \text{round}(S \times 0.015 + 100)) & \text{if } S \ge ₦2,500 \end{cases}$$

$$\mathbf{P = \text{Net Distributable Profit} = S - C - F}$$

*Net Profit $P$ is the single source of truth distributed among Super Parent (`07032905036`), Child Proxies, Semi-Parents, Squad Leaders, and the Platform.*

---

<a name="proportional-formula"></a>
### The Proportional Co-Funding Formula ($\alpha$-Ratio)

Let $W$ be the proxy's available wallet balance at the time of order fulfillment.

#### Step 1: Liquidity Qualification Gate
* If $W < ₦1,000$: Proxy earns the **Base Child Rate** of **10%**.
* If $W \ge ₦1,000$: Proxy enters the **Dynamic Semi-Parent State**.

#### Step 2: Calculate Capital Backing Ratio ($\alpha$)
$$\alpha = \min\left(1.0, \; \frac{W}{C}\right)$$

* If $W \ge C$ (Wallet covers 100% of wholesale cost): $\alpha = 1.0$.
* If $W < C$ (Wallet covers a partial fraction, e.g. ₦600 of ₦1,000 cost): $\alpha = 0.60$.

#### Step 3: Dynamic Profit Allocation
$$\text{Proxy Share \%} = \max\left(10\%, \; \alpha \times 40\%\right)$$
$$\text{Platform Share \%} = 10\% \quad \text{(Fixed Platform Fee)}$$
$$\text{Super Parent Share \%} = 100\% - 10\% - \text{Proxy Share \%} = 90\% - \text{Proxy Share \%}$$

$$\text{Proxy Naira Profit} = \text{Proxy Share \%} \times P$$
$$\text{Super Parent Naira Profit} = \text{Super Parent Share \%} \times P$$
$$\text{Platform Naira Profit} = 10\% \times P$$

$$\mathbf{\text{Total Distributed}} = \text{Proxy} + \text{Parent} + \text{Platform} = 100\% \times P \quad \text{(Airtight zero-leakage)}$$

---

<a name="settlement-scenarios"></a>
### Detailed Settlement Scenarios Across Catalog Plans

#### Scenario 1: MTN 2GB 7-Days (`M2GBS`)
* $S = ₦1,200$, $C = ₦735$, $F = ₦18$, **$P = ₦447$**.

| Proxy Wallet State | Capital Ratio ($\alpha$) | Proxy Share | Super Parent (`07032905036`) | Platform (10%) |
| :--- | :---: | :---: | :---: | :---: |
| **Full Liquidity** ($W \ge ₦735$) | $1.00$ | **40% (₦178.80)** | **50% (₦223.50)** | **10% (₦44.70)** |
| **Partial 60% Liquidity** ($W = ₦441$) | $0.60$ | **24% (₦107.28)** | **66% (₦295.02)** | **10% (₦44.70)** |
| **Partial 40% Liquidity** ($W = ₦294$) | $0.40$ | **16% (₦71.52)** | **74% (₦330.78)** | **10% (₦44.70)** |
| **Sub-Threshold / Child** ($W < ₦1,000$) | $0.00$ | **10% (₦44.70)** | **80% (₦357.60)** | **10% (₦44.70)** |

#### Scenario 2: Airtel 10GB 30-Days (`A10GB`)
* $S = ₦3,900$, $C = ₦3,020$, $F = ₦159$, **$P = ₦721$**.

| Proxy Wallet State | Capital Ratio ($\alpha$) | Proxy Share | Super Parent (`07032905036`) | Platform (10%) |
| :--- | :---: | :---: | :---: | :---: |
| **Full Liquidity** ($W \ge ₦3,020$) | $1.00$ | **40% (₦288.40)** | **50% (₦360.50)** | **10% (₦72.10)** |
| **Partial Liquidity** ($W = ₦1,510$, 50%)| $0.50$ | **20% (₦144.20)** | **70% (₦504.70)** | **10% (₦72.10)** |
| **Sub-Threshold / Child** ($W < ₦1,000$) | $0.00$ | **10% (₦72.10)** | **80% (₦576.80)** | **10% (₦72.10)** |

> [!IMPORTANT]
> **Super Parent Protection Guarantee**:  
> In every transaction, Super Parent `07032905036` receives **at least 50%**, and up to **80%** of net profit, ensuring substantial margins while child and semi-parent proxies expand the network.

---

<a name="3-proxy-operational-states"></a>
## 3. The 3 Proxy Operational States

---

<a name="state-a-child"></a>
### State A: Standard Child Proxy ($W < ₦1,000$)
* **Trigger**: Available wallet profit balance is below ₦1,000.
* **Capabilities**:
  * **Operates via Parent Proxy's Automated 24/7 AI WhatsApp Bot**: The child proxy does not maintain a standalone server session; their traffic routes through the parent proxy's bot infrastructure.
  * **Manual Vending**: Can vend manually anytime by texting `DATA` or `BUY` to their parent proxybot or sharing a WhatsApp contact card / phone number.
* **Profit Rate**: Fixed at **10%** of net profit on all sales when wallet profit balance $< ₦1,000$.
* **Earnings Destination**: Credited exclusively to their **In-Chat Wallet**.
* **Usage Restriction**: **They can ONLY buy or gift data with this wallet balance.**
* **Cashout Status**: **Locked**. Cannot withdraw to a bank account until they cross the ₦1,000 Dynamic Semi-Parent threshold.
* **Wholesale Discount**: None. When buying data for themselves, they pay standard retail.

---

<a name="state-b-semi-parent"></a>
### State B: Dynamic Semi-Parent Proxy ($W \ge ₦1,000$)
* **Trigger**: Available wallet balance is ₦1,000 or greater.
* **Capabilities**:
  * **Dynamic Profit Share**: Earns between **10% and 40%** on every sale based on their $\alpha$-ratio.
  * **Wholesale Data Discount**: Automatically unlocks **40% off profit** when buying personal data via wallet.
  * **Thursday Cashouts**: Unlocks the right to use `WITHDRAW` to transfer cash to their personal bank account every Thursday.
  * **Squad Downline Unlocking**: Eligible to recruit up to 5 squad downline agents once sales milestone is reached.

---

<a name="state-c-super-parent"></a>
### State C: Super Parent Proxy (`07032905036` - Master Liquidity Node)
* **Identity**: Mustapha Lawal Gambo (`07032905036` / `08119772223`).
* **Privileges**:
  * Owns the Master Paystack collection virtual account.
  * Collects between **50% and 80%** on every single transaction executed across the entire network.
  * Holds the central clearing ledger and processes Thursday withdrawals.

---

<a name="4-zero-fee-onboarding"></a>
## 4. Zero-Fee Onboarding & Physical Anti-Spam Gate

---

<a name="zero-fee-guarantee"></a>
### ₦0 Upgrade Fee & ₦0 Subscription Guarantee
* **No Paywall**: Agents never pay ₦3,500 or any arbitrary fee to "upgrade".
* **No Monthly Dues**: Agents never pay ₦950/month.
* **Server Cost Coverage**: The **10% Clarion Platform Cut** covers all server infrastructure, VPS hosting, Baileys web socket connections, and Paystack API integration costs.

---

<a name="suggest-gate"></a>
### The `SUGGEST` Physical Proximity QR-Binding Gate
Because onboarding is free, how do we prevent malicious bot spamming?

1. **Invite-Only Sponsorship**: A new proxy bot can **only** be created if an existing active proxy sends:
   ```
   SUGGEST 08012345678 Mustapha Gambo
   ```
2. **Physical Co-Location Requirement**:
   * When `SUGGEST` is received, the server generates the activation QR code and sends the image **directly to the WhatsApp of the existing proxy who sent the command**!
   * The existing proxy displays the QR code on their phone screen.
   * The new candidate uses their own phone camera to scan the QR code via **WhatsApp > Settings > Linked Devices > Link a Device**.
   * **Result**: Both individuals **must be physically together in person**. Remote bot farming, disposable fake accounts, and programmatic bot spamming are physically impossible.
3. **Natural Liquidity Filter**: A dormant bot with ₦0 balance earns only 10% wallet balance and cannot withdraw to bank. There is zero financial incentive for spammers.

---

<a name="5-squad-model"></a>
## 5. Squad Referral Downline Model (5-Slot Milestone Engine)

---

<a name="squad-milestone"></a>
### Activation Milestones & Reserve Threshold
To prevent premature downline proliferation, a Semi-Parent unlocks their **5 Squad Slots** only when they meet two criteria:
1. **Performance Milestone**: Completed at least **10 personal sales** through their bot.
2. **Liquidity Reserve**: Must maintain at least **₦1,000 reserve** in their wallet. If wallet drops below ₦1,000, squad recruitment is temporarily paused.

---

<a name="squad-math"></a>
### Downline Split Math (50% / 10% / 30% / 10%)
When a recruited Squad Child makes a sale with Net Profit $P$:

$$\text{Squad Child} = 10\% \times P \quad \text{(Credited to Child Wallet - Data Purchases Only)}$$
$$\text{Semi-Parent (Squad Leader)} = 30\% \times P \quad \text{(Passive Cash Profit)}$$
$$\text{Super Parent (07032905036)} = 50\% \times P \quad \text{(Master Cash Profit)}$$
$$\text{Clarion Platform} = 10\% \times P \quad \text{(Platform Operations)}$$

$$\text{Total} = 10\% + 30\% + 50\% + 10\% = 100\%$$

* **Zero Dilution**: Super Parent's 50% and Platform's 10% remain completely untouched. The 10% awarded to the squad member comes directly from the Semi-Parent's 40% allocation ($40\% - 10\% = 30\%$).

---

<a name="6-withdrawal-engine"></a>
## 6. On-Demand Paystack Thursday Withdrawal Engine

Rather than an automatic force-push that might empty an agent's working capital against their will, Clarion implements an **On-Demand `WITHDRAW` feature** powered by Paystack Transfers.

---

<a name="withdraw-command"></a>
### Explicit `WITHDRAW` Command Mechanics
* **Permitted Window**: **Every Thursday (00:01 AM – 11:59 PM Lagos Time)**.
* **Commands**:
  * `WITHDRAW` $\rightarrow$ Displays available cashout balance, linked bank details, and instructions.
  * `WITHDRAW [amount]` (e.g. `WITHDRAW 5000`) $\rightarrow$ Initiates disbursement.
  * `WITHDRAW ALL` $\rightarrow$ Sweeps all available earnings.

---

<a name="non-thursday-msg"></a>
### Updated Non-Thursday Rejection Message (With Data Vending Notice)
If an agent types `WITHDRAW` on Monday, Tuesday, Wednesday, Friday, Saturday, or Sunday:

```
🗓️ CLARION CASHOUT WINDOW NOTICE 💳
━━━━━━━━━━━━━━Withdrawals are processed exclusively every THURSDAY!

💰 Your current withdrawable earnings: ₦8,450
📈 Your funds are currently active in your wallet, earning you up to 40% profit on every customer order!

💡 Need data right now?
You can use your wallet balance to BUY or GIFT data anytime 24/7 with zero waiting!
👉 Reply BUY [code] (e.g. BUY M2GBS) to vend data instantly.

👉 Next bank cashout window opens this Thursday at 12:00 AM.
· Type BALANCE anytime to view your earnings.
```

---

<a name="bank-binding"></a>
### Two-Step NIBSS `BANK` Account Binding (Confirm Before Link)
When an agent attempts their first Thursday withdrawal without a connected bank account (or types `BANK 0123456789 GTBank`):

#### Step 1: NIBSS Name Resolution & Confirmation Prompt
Clarion calls `paystack.validateBankAccount(bankCode, accountNumber)` to resolve the name with NIBSS:

```
🔍 PLEASE CONFIRM YOUR BANK ACCOUNT:
━━━━━━━━━━━━━━🏦 Bank: Guaranty Trust Bank (GTBank)
🔢 Account Number: 0123456789
👤 Account Name: MUSTAPHA LAWAL GAMBO ✅

━━━━━━━━━━━━━━Reply 1 to CONFIRM & LINK THIS ACCOUNT
Reply 2 to ENTER A DIFFERENT ACCOUNT
· Reply CANCEL to abort
```

#### Step 2: Confirmation Gate
* If customer replies `1`: Account details are permanently linked in Firestore under `db.users.doc(userId).bankDetails` and marked `verified: true`.
* If customer replies `2`: Bot loops back: *"Please enter your 10-digit NUBAN and bank name (e.g. BANK 0123456789 AccessBank)"*.

---

<a name="fee-deductions"></a>
### Fee Deductions (₦50 Paystack + ₦50 Clarion = ₦100 Flat)
* **Paystack Transfer Cost**: ₦50.00
* **Clarion Platform Processing Fee**: ₦50.00
* **Total Deduction**: **₦100.00 Flat**
* **Minimum Withdrawal Amount**: **₦1,000** (Net payout: ₦900).

$$\text{Net Transferred} = \text{Requested Amount} - ₦100.00$$

---

<a name="7-performance-reviews"></a>
## 7. Daily & Weekly Wallet Performance Reviews

---

<a name="daily-report"></a>
### Daily Return Notification (Every Evening at 8:00 PM)

```
📊 CLARION DAILY WALLET YIELD REPORT 📈
━━━━━━━━━━━━━━Hello Mustapha! Here is how your wallet worked for you today:

💼 Starting Balance: ₦5,200
📦 Orders Co-Funded Today: 6 Orders
💰 Total Daily Profit Generated: ₦1,080.40
📈 Today's Dynamic ROI: +20.7% Daily Yield!

🏆 Current Proxy Status: Dynamic Semi-Parent (40% Tier)
💵 Total Withdrawable Balance: ₦6,280.40

💡 Pro-Tip: Keep your balance above ₦3,000 to maintain maximum 40% profit cuts on high-capacity bundles!
· Type BALANCE anytime for live wallet breakdown.
```

---

<a name="weekly-report"></a>
### Pre-Cashout Weekly Summary (Every Wednesday at 8:00 PM)

```
📅 WEEKLY PERFORMANCE & CASHOUT PREVIEW 💰
━━━━━━━━━━━━━━Tomorrow is THURSDAY — Clarion Cashout Day! 🚀

📊 This Week's Performance:
• Total Network Orders: 28 Sales
• Direct Bot Sales: 22 Sales (₦3,850 profit)
• Squad Downline Overrides: 6 Sales (₦804 profit)
• Total Weekly Earnings: ₦4,654.00

🏦 Connected Bank: GTBank (••••36)
💵 Available to Cashout Tomorrow: ₦4,654.00
🛡️ Fee: ₦100 Flat

👉 Tomorrow morning, simply reply WITHDRAW to transfer your earnings directly to your bank account!
👉 Remember: You can also keep your balance in your wallet to continue earning up to 40% profit on every order!
```

---

<a name="8-edge-cases"></a>
## 8. Comprehensive Edge Cases & Failure Protection Matrix

| # | Edge Case Scenario | Potential Risk | Clarion Engineering Solution |
| :-: | :--- | :--- | :--- |
| **1** | **The Zero-Balance / Dust Wallet ($W < ₦1,000$)** | Agent expects 40% profit despite having no liquidity. | **Graceful Fallback**: System automatically fulfills order using Parent capital and awards base Child rate (10%). Wallet funds are restricted to data purchases only. |
| **2** | **Simultaneous Concurrent Orders (Race Condition)** | Two customers buy at the exact same second, depleting wallet twice. | **Atomic Firestore Transactions**: Wallet debit/pledge is wrapped in an atomic Firestore transaction. Order 1 gets full coverage ratio; Order 2 recalculates $\alpha$ based on remaining balance. Zero negative balances possible. |
| **3** | **Thursday Post-Withdrawal Liquidity Drop** | Agent withdraws entire balance on Thursday, then makes a sale Friday morning with ₦0. | **Educational Pre-Warning**: Before confirming `WITHDRAW ALL`, bot warns: *"⚠️ Note: Withdrawing your entire balance will temporarily reset your profit cut to 10% until you replenish your wallet. Consider leaving ₦1,000 to keep earning 40%!"* |
| **4** | **Partial Ratio for High-Cost Plans (e.g. ₦7,800 cost)** | Agent has ₦2,000 wallet, customer buys ₦8,200 bundle. | **Proportional $\alpha$-Yield**: $\alpha = 2,000 / 7,800 = 25.6\%$. Proxy earns $25.6\% \times 40\% = 10.2\%$ profit. Platform gets 10%, Parent gets 79.8%. No transaction is ever rejected! |
| **5** | **Paystack Transfer API Temporary Failure** | Agent types `WITHDRAW`, but Paystack NIP interbank rail is experiencing downtime. | **Ledger Hold & Auto-Refund**: Transaction status tagged as `TRANSFER_FAILED`. Wallet balance is instantly rolled back. Agent notified immediately: *"Paystack banking network is temporarily busy. Your funds have been restored to your wallet. Please retry in 30 minutes."* |
| **6** | **Bank Account Name Mismatch (Fraud Attempt)** | Agent enters someone else's stolen bank account number. | **NIBSS Pre-Confirmation Gate**: Paystack account resolution matches account name, and requires explicit user confirmation (`Reply 1 to confirm`) before saving. |
| **7** | **Downline Squad Member Drops Liquidity** | Squad child drops to ₦0 wallet. | Squad child still earns 10% on their sales (Parent funds wholesale). Semi-Parent still gets their 30% passive override! System remains completely stable. |
| **8** | **Non-Thursday Withdrawal Attempts** | Agent urgently asks for withdrawal on Monday. | Polite rejection notice stating the platform operates on a weekly Thursday payroll cycle, while highlighting that wallet funds can be used for instant 24/7 data vending. |

---

<a name="9-implementation-plan"></a>
## 9. Comprehensive Implementation Plan (Step-by-Step Roadmap)

> **Implementation Constraint Compliance**:  
> No application source code has been altered in this planning phase. The following actionable blueprint defines the exact file-by-file changes required for execution.

---

### Phase 1: Dynamic Settlement Engine Refactoring
**Target File**: `src/services/WalletService.js`

1. **Calculate Post-Paystack Net Profit**:
   - Update `calculateSettlement()` and `settleCompletedOrder()` to explicitly compute:
     $$P = \text{sellPrice} - \text{baseCost} - \text{calculatePaystackFee}(\text{sellPrice})$$
2. **Implement Proportional Co-Funding ($\alpha$-Ratio)**:
   - Create `calculateDynamicSettlement({ netProfit, wholesaleCost, walletBalance, isSquadSale, parentId })`:
     - If `walletBalance < 1000`: Rate is 10%.
     - If `walletBalance >= 1000`: $\alpha = \min(1.0, \text{walletBalance} / \text{wholesaleCost})$. Rate is $\max(10\%, \alpha \times 40\%)$.
     - Compute split: Proxy (`rate`), Super Parent (`90% - rate`), Platform (`10%`).
3. **Wholesale Personal Discount Calculator**:
   - Create `getWholesalePrice(plan, walletBalance)`:
     - If `walletBalance >= 1000` and `netProfit > 0`: returns `plan.sellPrice - (0.40 * netProfit)`.
     - Else: returns `plan.sellPrice`.
4. **Update Withdrawal Fee Structure**:
   - Update `WITHDRAWAL_FEES`:
     ```javascript
     export const WITHDRAWAL_FEES = {
       PAYSTACK_FEE: 50.00,
       SERVICE_FEE: 50.00,
       TOTAL: 100.00,
       MIN_WITHDRAWAL: 1000.00
     };
     ```

---

### Phase 2: On-Demand Thursday Withdrawal & NIBSS Confirmation Flow
**Target Files**: `src/services/PaystackService.js`, `src/bot/ProxyBot.js`

1. **In-Memory State Maps in `src/bot/ProxyBot.js`**:
   - Add `awaitingBankConfirmMap = new Map();` (stores `{ accountNumber, bankCode, bankName, resolvedName, timestamp }`).
   - Add `awaitingWithdrawMap = new Map();` (stores `{ amount, timestamp }`).
2. **Command Handler: `BANK [AccountNo] [BankName]`**:
   - Resolve bank code using `paystack.getBanks()`.
   - Call `paystack.validateBankAccount(bankCode, cleanAccount)`.
   - Store in `awaitingBankConfirmMap`.
   - Send Step 1 confirmation prompt:
     ```
     🔍 Confirm Your Bank Account Details:
     ━━━━━━━━━━━━━━     Bank: [BankName]
     Account: [AccountNo]
     Resolved Name: [ResolvedName] ✅

     Reply 1 to CONFIRM & LINK THIS ACCOUNT
     Reply 2 to ENTER A DIFFERENT ACCOUNT
     ```
3. **Interactive Confirmation Handler (Replies `1` or `2`)**:
   - If `1`: Commit bank details to `db.users.doc(userId)` with `{ verified: true }`.
   - If `2`: Clear map and prompt user to re-enter.
4. **Command Handler: `WITHDRAW [amount]`**:
   - Check day of week: `const isThursday = new Date().getDay() === 4;` (or config override in mock mode).
   - If not Thursday: send the updated rejection message highlighting **instant 24/7 data vending**.
   - If Thursday:
     - Check if bank details are verified. If not, trigger `BANK` prompt.
     - Check minimum balance: withdrawable balance must be $\ge ₦1,000$.
     - Deduct ₦100 fee and call `paystack.initiateTransfer()`.
     - Record `WITHDRAWAL` transaction in `db.ledger`.
     - Send WhatsApp receipt with Paystack NIP transfer reference.

---

### Phase 3: Physical-Proximity `SUGGEST` QR Workflow
**Target Files**: `src/bot/ProxyBot.js`, `src/bot/SessionManager.js`

1. **Modify `SUGGEST` Command in `ProxyBot.js`**:
   - Extract `candidatePhone` and `candidateName`.
   - Start Baileys QR pairing session.
   - When QR buffer is generated:
     - Send the QR image **directly to the sender (`from`)**, NOT the candidate:
       ```
       📸 Scan this Activation QR Code with [CandidateName]'s phone!
       ━━━━━━━━━━━━━━       1. Open WhatsApp on +[CandidatePhone]
       2. Go to Settings > Linked Devices > Link a Device
       3. Point camera at this screen right now!

       ⏱️ Expires in 60 seconds.
       ```

---

### Phase 4: Daily & Weekly Performance Cron Jobs
**Target File**: `src/jobs/walletYieldReportJob.js` (New File), `src/server.js`

1. **Daily Report Cron (`0 20 * * *` - 8:00 PM Daily)**:
   - Aggregate orders co-funded today for each proxy.
   - Compute total profit generated and dynamic ROI %.
   - Dispatch structured report to proxy WhatsApp.
2. **Wednesday Cashout Preview Cron (`0 20 * * 3` - Wednesday 8:00 PM)**:
   - Summarize total weekly earnings and connected bank account.
   - Remind them of Thursday's cashout window.
3. **Register Cron in `src/server.js`**:
   - Import and invoke `startWalletYieldReportJob()`.

---

### Phase 5: Verification & End-to-End Simulation
**Target File**: `scratch/test_dynamic_co_funding.js`

1. Test $\alpha$-ratio calculations for full, 60%, 40%, and 0% wallet coverage.
2. Test non-Thursday withdrawal rejection logic.
3. Test Thursday withdrawal fee deduction (₦100).
4. Test NIBSS bank account confirmation gate (Option 1 vs Option 2).
5. Verify zero-leakage financial reconciliation across all 40 catalog plans.
