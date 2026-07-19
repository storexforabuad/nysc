# 📡 Clarion A.I. — Auto-Generated WhatsApp Status Marketing Blueprint (VPS Edition)
### 100% Automated, Zero-Touch, VPS Local Storage Workflow

> **Philosophy:** To maximize passive sales and keep system costs at ₦0, we bypass Firebase Storage completely. All images, videos, and dynamic graphics are generated instantly using the server's Windows/Linux compute and stored sequentially on local memory. The ProxyBot automatically posts these generated assets directly to their WhatsApp status to drive organic FOMO and impulse buying.

---

## 🎯 The Power of Auto-Generated Social Proof & Price Cards

We run a **Double-Engine Marketing Machine**:
1. **Dynamic Receipts:** Replaces the need for manual screenshots. Auto-generated instantly, masking private phone numbers (e.g. `080****5678`), delivering a professional look the server automatically shares to WhatsApp Status. *(Note: ProxyBot owners can still manually post live WhatsApp chat screenshot proof whenever they like for extra authenticity!)*
2. **"Top 10" Network Cards:** Instead of cramped text messages, beautiful graphics showing the 10 absolute best plans for a specific network (across different time durations) are generated.

---

## 🏗️ System Architecture (Local Storage)

```
Clarion A.I. Backend (VPS/Local Node Environment)
     │
     ├─▶ Local Directory: ./media/status_library/ (Admin videos/promo banners)
     ├─▶ Local Directory: ./media/receipts/ (Auto-generated proof tickets)
     └─▶ Local Directory: ./media/price_cards/ (The Best 10 Plans visual cards)
           │
           ▼
StatusQueue Service (Picks files from local folders based on schedule)
           │
           ▼
Each ProxyBot Session (Uploads local media directly to WhatsApp Status API)
```

---

## 📆 The 4-Post Daily Schedule

| Time | Content Source | Rationale |
|------|---------------|-----------|
| **7:00 AM** | **Auto-Generated "10 Best" Network Card** | Morning commute — people checking data balance |
| **12:30 PM** | **Auto-Generated Receipt (Proof) / Manual chat SS**| Lunch break scroll |
| **6:00 PM** | **Network Promo (Text/Image)** | After work dopamine |
| **9:00 PM** | **Auto-Generated Receipt (Proof)**| Night scroll — prime impulse buy time |

---

## 🗂️ Core Auto-Generated Assets

### 1. 🥇 The "10 Best [Network] Data" Cards (Auto-Generated Weekly)
To optimize compute, the Node Canvas engine draws 4 fresh, visually stunning price charts (one for each network: MTN, Airtel, Glo, 9mobile) once a week (e.g., Sunday night) using live data from Payflex. Every morning, all 4 cards are posted sequentially to Status.

**Design Features:**
- **Header:** "10 Best [Network] Data"
- **Sub-Heading:** "Instant Reliable Affordable"
- **Badge:** A big beautiful **5G Ribbon** draped across the corner to emphasize speed.
- **Content:** The layout extracts the 10 best plans spanning multiple durations *(2 Days, 3 Days, Weekly, 1 Month, 2 Months)*.
- **A clear instruction:** "Reply *DATA [amount]* (e.g DATA 1000) to buy now".
- **Theme:** Sleek dark mode background matching the network's color (Yellow glow for MTN, Red for Airtel, Green for Glo, Dark Green for 9mobile).

**Status Caption (Appended to the final card):**
```
🔥 Today's data deals are LIVE!

Instantly delivered. No broker delaying you. 
Just reply *DATA [amount]* (e.g DATA 1000) to see all plans and buy right now! ✅
```

---

### 2. 🧾 The Dynamic Order Receipt (Auto-Generated on Purchase)
Every time a user successfully buys data, `canvas` instantly draws an image ticket.

**Design Features:**
- **Store Name:** `[ProxyBot Owner's Name] Digital Store` prominently displayed.
- **Header:** "Transaction Successful ✅"
- **Product Details:** e.g., "MTN 10GB Data"
- **Privacy Number Masking:** Displays the target number as `081****1234`.
- **Watermark Footer:** "Powered by Clarion A.I (NYSC SAED Project)"

**The Double-Action Workflow:**
1. **Immediate Delivery:** The bot replies to the buyer with this image + the confirmation text context.
2. **Status Queuing:** The image is saved to `./media/receipts/`. The `StatusQueueService` schedules this image to be pushed to the ProxyBot's WhatsApp status during the very next "Social Proof" slot (e.g., 12:30 PM). 

**Status Caption:**
```
Another one delivered! 🚀

Someone just bought [X]GB for ₦[Y] and it landed in seconds. 

Want yours? Send me *DATA [amount]* (e.g DATA 1000) to order automatically right now. 
```

---

### 3. 📊 Network Promo / Limited Offer (Daily 6 PM)
Focus on one network's best deal with urgency.

**Caption:**
```
‼️ MTN gang, this one is for una

1.5GB = ₦490 (expires midnight)

Text me *DATA 490* and we go sort you out fast fast 🔥🇳🇬

#ClarionAI #NYSC #DataDeals
```

---

## 🛠️ Technical Implementation Plan

### Phase 1: Native Local Node Dependencies
Since this must work on local Windows architecture during testing and standard Linux VPS:
- We will install `canvas`. It works robustly on local environments for rendering headers, ribbons, and text.
- Directories like `./media/receipts/` will be used (relative to the `src` runner) to ensure absolute compatibility regardless of the host OS.

### Phase 2: Generating The 10 Best Network Cards
**File:** `src/services/StatusImageGen.js`
- Logic: `payflex.getAvailablePlans()` -> Filter by specific `network` -> Group by validities (`2 days`, `7 days`, `30 days`) -> Pick the top tier from each to build a list of 10.
- Canvas draws the *"10 Best MTN Data"* header, the *"Instant Reliable Affordable"* subheading, and stamps a pre-designed PNG of a `big beautiful 5G ribbon` floating in the top right.
- Renders and saves to `./media/price_cards/mtn_today.jpg`.

### Phase 3: The Status Scheduler Job
**File:** `src/jobs/statusPostJob.js`
- Runs 4 times a day.
- **At 12:30 PM & 9:00 PM:** Looks inside `./media/receipts/`, picks a recent, unused receipt, creates the hype caption, and pushes it to the ProxyBot's `sock.sendImageMessage('status@broadcast', ...)`.
- **At 7:00 AM:** Hits the `PriceCardGenerator`, builds the card, and uploads it to Status.
- **At 6:00 PM:** Picks a random text promo format.

### Phase 4: Admin Visual Preview Dashboard
**Files:** `src/server.js`, `src/App.tsx`
- We will build an explicit "Marketing Playground" section inside the admin Web UI.
- It will feature designated `Generate Test Receipt` and `Generate Best 10 Card` buttons.
- Hitting the button triggers the exact `canvas` backend routines and serves the raw image back to the UI, so the admin can physically review the styling, formatting, and 5G ribbons on the fly before they ever hit real ProxyBot statuses.

---

## 🔒 Privacy & Local Memory Rules

1. **Space Saving Cron Job:** Every night, a job wipes receipts older than 2 days from `./media/receipts/`. We never clutter the local hard drive.
2. **Number Privacy Filter:** Runs `phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')`.
3. **Manual Override Allowed:** While we handle auto-receipts, ProxyBot owners possess complete freedom to upload their own raw (censored) WhatsApp chat screenshot proof manually to their status for visceral authenticity!
