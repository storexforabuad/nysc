# Unit Economics Analysis: Combined Levers at 1,000 Bots Scale

This analysis models the financial outcome of running **1,000 active ProxyBots** when we simultaneously apply:
1.  **Lever 1**: Increasing the base markup by ₦20.
2.  **Lever 2**: Restructuring the profit split to favor the Platform (which bears the massive infrastructure cost).

---

## 1. The Baseline Assumptions at 1,000 Scale

- **Active Storefronts**: 1,000 (Corper ProxyBots).
- **Daily Volume**: 3 orders per bot/day = 3,000 orders/day.
- **Monthly Volume**: 90,000 orders/month.
- **Infrastructure Cost**: ≈ ₦1,096,000 / month (11 VPS cluster + Database).

---

## 2. Applying Lever 1: The New Markup Strategy

Currently, the markup scales based on the data plan size. We will introduce a flat **+₦20** tier bump across all levels.

| Wholesale Cost | Old Markup (Profit) | New Markup (Profit) |
| :--- | :--- | :--- |
| `< ₦500` | ₦15 | **₦35** |
| `₦500 - ₦999` | ₦20 | **₦40** |
| `₦1000 - ₦2999` | ₦50 | **₦70** |
| `₦3000+` | ₦100 | **₦120** |

**New Average Markup**: Let's assume an average blended markup of **₦50** per transaction (combining cheap and expensive data plans).

**Total System Monthly Profit**: 90,000 orders × ₦50 = **₦4,500,000**

---

## 3. Applying Lever 2: Restructuring the Profit Split

The original 30% Platform split isn't sustainable at scale. We restructure it to heavily subsidize server costs while still providing excellent passive income to the Corpers.

**The New Split:**
- **Platform (You)**: 50%
- **Corper (Storefront Owner)**: 40%
- **CDS Group / Platoon (Admin)**: 10%

## 4. The Final Financial Breakdown

Let's apply the **₦4,500,000** total gross system profit to the new split:

### A. Beneficiary Payouts
- **Corpers' Revenue (40%)**: **₦1,800,000/month** 
  _Average Earnings per Corper: ₦1,800/month in purely passive income. While this sounds small individually, remember they do ZERO work, and this scales entirely based on how much their friends buy from their number._
- **CDS/Platoon Revenue (10%)**: **₦450,000/month**
  _Perfect for funding community development projects or weekly admin stipends._

### B. Platform Economics (Your Wallet)
- **Gross Platform Income (50%)**: **₦2,250,000**
- **Minus Server Costs**: -₦1,096,000
- **Pure Net Profit**: **₦1,154,000 / month**

## 5. Risk / Reward Assessment

**The Beauty of the Combined Levers:**
By simply adding a tiny ₦20 to the price of data (which is still cheaper than the bank rate) and securing 20% more of the split for the platform, you transform the project from an **₦286,000 loss** into a highly sustainable **₦1.15 million profit engine**.

**What you must do in the code to implement this before scaling:**
1.  **Update [payflex.js](file:///c:/Users/m/Downloads/nysc/src/services/payflex.js)**: `const getTieredMarkup = (basePrice) => { if (basePrice >= 3000) return 120; if (basePrice >= 1000) return 70; if (basePrice >= 500) return 40; return 35; };`
2.  **Update [server.js](file:///c:/Users/m/Downloads/nysc/src/server.js) (Webhook settlement)**: 
    ```javascript
    const coMemberShare = +(netProfit * 0.40).toFixed(2); // 40%
    const systemShare = +(netProfit * 0.50).toFixed(2);   // 50%
    const cdsShare = +(netProfit * 0.10).toFixed(2);      // 10%
    ```
