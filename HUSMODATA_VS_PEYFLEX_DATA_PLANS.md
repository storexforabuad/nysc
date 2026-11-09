# ⚡ Husmodata vs. Peyflex Wholesale Data Plans Comparison Catalog

*Generated on: 2026-11-06*  
*Husmodata API Endpoint: https://husmodata.com/api/*  
*Peyflex API Endpoint: https://client.peyflex.com.ng*  

---

## Executive Summary & Key Takeaways

1. **Massive Cost Savings on MTN Data Share (Up to 32% cheaper):**  
   Husmodata offers significantly lower wholesale rates on MTN Data Share plans. For example:
   - **MTN 1GB (30 Days)**: Peyflex wholesale is **₦580** vs. Husmodata **₦392** (**₦188 / 32% cheaper**).
   - **MTN 500MB (7 Days)**: Peyflex is **₦350** vs. Husmodata **₦300** (**₦50 cheaper**).
   - **MTN 2GB (30 Days)**: Peyflex is **₦950** vs. Husmodata **₦805** (**₦145 cheaper**).
   - **MTN 5GB (30 Days)**: Peyflex is **₦1,800** vs. Husmodata **₦1,610** (**₦190 cheaper**).

2. **Glo 30-Day Monthly Plans Are Cheaper on Husmodata (Double Profit Margin):**  
   - **Glo 1GB (30 Days)**: Peyflex is **₦450** vs. Husmodata **₦400** (**₦50 cheaper**). Margin on ₦460 retail jumps from ₦10 to ₦60!
   - **Glo 2GB (30 Days)**: Peyflex is **₦900** vs. Husmodata **₦800** (**₦100 cheaper**). Margin on ₦900 retail jumps from ₦0 to ₦100!
   - **Glo 3GB (30 Days)**: Peyflex is **₦1,350** vs. Husmodata **₦1,200** (**₦150 cheaper**). Profit doubles from ₦150 to ₦300!
   - **Glo 5GB (30 Days)**: Peyflex is **₦2,200** vs. Husmodata **₦2,000** (**₦200 cheaper**). Profit doubles from ₦200 to ₦400!

3. **Peyflex Retains Advantage on Short-Validity Glo Plans (3-Day & 7-Day multi-GB):**  
   - Glo 3GB (3 Days) is **₦850** on Peyflex vs. **₦1,005** on Husmodata.
   - Glo 5GB (3 Days) is **₦1,380** on Peyflex vs. **₦1,675** on Husmodata.

4. **Wider Catalog Availability:**  
   Husmodata provides **237 plans** across MTN, Glo, Airtel, and 9mobile compared to Peyflex's **86 plans**, giving us access to low-cost Micro Data (50MB–250MB), Corporate Gifting, and Awoof Gifting.

---

## 🎯 Direct Comparison: The 18 Pilot Plans We Currently Sell

These are the 18 active plans configured in `src/services/payflex.js` for our pilot launch (8 MTN Data Share + 10 Glo Data):

| # | Network & Plan Code | Capacity | Duration | Our Retail Price | Peyflex Wholesale | Husmodata Plan ID & Type | Husmodata Wholesale | Price Delta (Husmo vs Peyflex) | Impact on Profit Margin |
| :-: | :--- | :-: | :-: | --: | --: | :--- | --: | :---: | :--- |
| 1 | `M500MBS` (MTN) | **500MB** | 7 Days | ₦500 | ₦350 | ID `458` [DATA SHARE] | ₦300 | 🟢 **-₦50** (Husmo Cheaper) | Profit increases from ₦150 to **₦200** (+33%) |
| 2 | `M1GBS` (MTN) | **1GB** | 7 Days | ₦600 | ₦450 | ID `466` [DATA SHARE] | ₦380 | 🟢 **-₦70** (Husmo Cheaper) | Profit increases from ₦150 to **₦220** (+47%) |
| 3 | `M2GBS` (MTN) | **2GB** | 7 Days | ₦1,200 | ₦850 | ID `467` [DATA SHARE] | ₦735 | 🟢 **-₦115** (Husmo Cheaper) | Profit increases from ₦350 to **₦465** (+33%) |
| 4 | `M3GBS` (MTN) | **3GB** | 7 Days | ₦1,400 | ₦1,200 | ID `468` [DATA SHARE] | ₦1,075 | 🟢 **-₦125** (Husmo Cheaper) | Profit increases from ₦200 to **₦325** (+63%) |
| 5 | `M1GBS2` (MTN) | **1GB** | 30 Days | ₦850 | ₦580 | ID `457` [DATA SHARE] | ₦392 | 🟢 **-₦188** (Husmo Cheaper) | Profit increases from ₦270 to **₦458** (+70%) |
| 6 | `M2GBS2` (MTN) | **2GB** | 30 Days | ₦1,700 | ₦950 | ID `459` [DATA SHARE] | ₦805 | 🟢 **-₦145** (Husmo Cheaper) | Profit increases from ₦750 to **₦895** (+19%) |
| 7 | `M3GBS2` (MTN) | **3GB** | 30 Days | ₦2,000 | ₦1,250 | ID `460` [DATA SHARE] | ₦1,125 | 🟢 **-₦125** (Husmo Cheaper) | Profit increases from ₦750 to **₦875** (+17%) |
| 8 | `M5GBS` (MTN) | **5GB** | 30 Days | ₦2,500 | ₦1,800 | ID `309` [DATA SHARE] | ₦1,610 | 🟢 **-₦190** (Husmo Cheaper) | Profit increases from ₦700 to **₦890** (+27%) |
| 9 | `G1GB1` (Glo) | **1GB** | 3 Days | ₦400 | ₦335 | ID `479` [CORPORATE GIFTING] | ₦335 | ⚪ **₦0** (Equal) | Identical profit (₦65) |
| 10 | `G3GB1` (Glo) | **3GB** | 3 Days | ₦1,200 | ₦850 | ID `480` [CORPORATE GIFTING] | ₦1,005 | 🔴 **+₦155** (Peyflex Cheaper) | Peyflex yields ₦350 vs. Husmo ₦195 |
| 11 | `G5GB1` (Glo) | **5GB** | 3 Days | ₦2,000 | ₦1,380 | ID `481` [CORPORATE GIFTING] | ₦1,675 | 🔴 **+₦295** (Peyflex Cheaper) | Peyflex yields ₦620 vs. Husmo ₦325 |
| 12 | `G1GB2` (Glo) | **1GB** | 7 Days | ₦400 | ₦360 | ID `447` [CORPORATE GIFTING] | ₦349 | 🟢 **-₦11** (Husmo Cheaper) | Profit increases from ₦40 to **₦51** (+28%) |
| 13 | `G3GB2` (Glo) | **3GB** | 7 Days | ₦1,200 | ₦990 | ID `448` [CORPORATE GIFTING] | ₦1,047 | 🔴 **+₦57** (Peyflex Cheaper) | Peyflex yields ₦210 vs. Husmo ₦153 |
| 14 | `G5GB2` (Glo) | **5GB** | 7 Days | ₦2,000 | ₦1,580 | ID `449` [CORPORATE GIFTING] | ₦1,745 | 🔴 **+₦165** (Peyflex Cheaper) | Peyflex yields ₦420 vs. Husmo ₦255 |
| 15 | `G1GB4` (Glo) | **1GB** | 30 Days | ₦460 | ₦450 | ID `261` [CORPORATE GIFTING] | ₦400 | 🟢 **-₦50** (Husmo Cheaper) | Profit increases from ₦10 to **₦60** (+500%) |
| 16 | `G2GB4` (Glo) | **2GB** | 30 Days | ₦900 | ₦900 | ID `262` [CORPORATE GIFTING] | ₦800 | 🟢 **-₦100** (Husmo Cheaper) | Profit increases from ₦0 to **₦100** (+Infinity%) |
| 17 | `G3GB4` (Glo) | **3GB** | 30 Days | ₦1,500 | ₦1,350 | ID `263` [CORPORATE GIFTING] | ₦1,200 | 🟢 **-₦150** (Husmo Cheaper) | Profit increases from ₦150 to **₦300** (+100%) |
| 18 | `G5GB4` (Glo) | **5GB** | 30 Days | ₦2,400 | ₦2,200 | ID `297` [CORPORATE GIFTING] | ₦2,000 | 🟢 **-₦200** (Husmo Cheaper) | Profit increases from ₦200 to **₦400** (+100%) |

> **Pilot Takeaway:** If routing the 8 MTN Data Share plans through Husmodata, average gross profit per transaction increases by **+38.5%**. For Glo, route 30-day plans through Husmodata and 3-day plans through Peyflex.

---

## 🌐 MTN Telecommunications Plans (80 Total Plans)

### Category: CORPORATE GIFTING (14 Plans)

| Plan ID | Plan Capacity | Validity / Duration | Husmodata Wholesale (₦) | Peyflex Equivalent | Peyflex Wholesale (₦) | Variance / Cheaper Provider |
| :-: | :--- | :--- | --: | :--- | --: | :--- |
| `255` | **50.0MB** | 30 days | **₦52** | — | — | Unique to Husmodata |
| `254` | **150.0MB** | 30 days | **₦150** | — | — | Unique to Husmodata |
| `253` | **250.0MB** | 30 days | **₦205** | — | — | Unique to Husmodata |
| `99` | **500.0MB** | 30 days (C. G) | **₦400** | `M500MBS` (500MB) | ₦350 | 🔴 **+₦50** (Peyflex Cheaper) |
| `100` | **1.0GB** | 30 days (C. G) | **₦530** | `M1GBS2` (1GB) | ₦580 | 🟢 **-₦50** (Husmodata Cheaper) |
| `101` | **2.0GB** | 30 days (C. G) | **₦1,000** | `M2GBS2` (2GB) | ₦950 | 🔴 **+₦50** (Peyflex Cheaper) |
| `226` | **3.0GB** | 30 days | **₦1,200** | `M3GBS2` (3GB) | ₦1,250 | 🟢 **-₦50** (Husmodata Cheaper) |
| `116` | **5.0GB** | 30 days (C. G) | **₦1,900** | `M5GBS` (5GB) | ₦1,800 | 🔴 **+₦100** (Peyflex Cheaper) |
| `146` | **10.0GB** | 30 days (C. G) | **₦8,100** | — | — | Unique to Husmodata |
| `208` | **15.0GB** | 30 days | **₦12,300** | — | — | Unique to Husmodata |
| `149` | **20.0GB** | 30 days | **₦16,400** | `M20GBS` (20GB) | ₦7,380 | 🔴 **+₦9020** (Peyflex Cheaper) |
| `209` | **40.0GB** | 30 days | **₦32,800** | — | — | Unique to Husmodata |
| `210` | **75.0GB** | 30 days | **₦61,500** | `M75GBS` (75GB) | ₦17,800 | 🔴 **+₦43700** (Peyflex Cheaper) |
| `211` | **100.0GB** | 30 days | **₦82,000** | — | — | Unique to Husmodata |

### Category: GIFTING (37 Plans)

| Plan ID | Plan Capacity | Validity / Duration | Husmodata Wholesale (₦) | Peyflex Equivalent | Peyflex Wholesale (₦) | Variance / Cheaper Provider |
| :-: | :--- | :--- | --: | :--- | --: | :--- |
| `404` | **75.0MB** | 1 day | **₦74** | — | — | Unique to Husmodata |
| `403` | **110.0MB** | 1 day | **₦98** | `M110MBS` (110MB) | ₦99 | 🟢 **-₦1** (Husmodata Cheaper) |
| `402` | **230.0MB** | 1 day | **₦194** | — | — | Unique to Husmodata |
| `461` | **500.0MB** | 1day | **₦339** | — | — | Unique to Husmodata |
| `491` | **500.0MB** | 30 days | **₦430** | — | — | Unique to Husmodata |
| `401` | **500.0MB** | 7 days | **₦485** | `M500MBS` (500MB) | ₦350 | 🔴 **+₦135** (Peyflex Cheaper) |
| `416` | **1.5GB** | 2 days | **₦582** | — | — | Unique to Husmodata |
| `377` | **1.2GB** | 7 days | **₦728** | `M1m2GB` (1.2GB) | ₦495 | 🔴 **+₦233** (Peyflex Cheaper) |
| `364` | **2.0GB** | 2 days | **₦728** | `M2GBS` (2GB) | ₦745 | 🟢 **-₦17** (Husmodata Cheaper) |
| `365` | **1.0GB** | 7 days direct data | **₦780** | `M1GBS` (1GB) | ₦796 | 🟢 **-₦16** (Husmodata Cheaper) |
| `368` | **2.5GB** | 2 days | **₦873** | `M2m5GB` (2.5GB) | ₦650 | 🔴 **+₦223** (Peyflex Cheaper) |
| `486` | **3.5GB** | 1day | **₦960** | `M3m5GBS` (3.5GB) | ₦2,480 | 🟢 **-₦1520** (Husmodata Cheaper) |
| `355` | **1.5GB** | 7 days | **₦970** | — | — | Unique to Husmodata |
| `378` | **3.2GB** | 2 days | **₦970** | `M3m2GBS` (3.2GB) | ₦990 | 🟢 **-₦20** (Husmodata Cheaper) |
| `487` | **4.0GB** | 2,days | **₦1,152** | — | — | Unique to Husmodata |
| `488` | **5.5GB** | 2days | **₦1,440** | — | — | Unique to Husmodata |
| `371` | **2.0GB** | 30days | **₦1,455** | `M2GBS2` (2GB) | ₦950 | 🔴 **+₦505** (Peyflex Cheaper) |
| `473` | **3.5GB** | 7days | **₦1,455** | `M3m5GBS` (3.5GB) | ₦2,480 | 🟢 **-₦1025** (Husmodata Cheaper) |
| `375` | **2.7GB** | 30days | **₦1,940** | `M2m7GBS` (2.7GB) | ₦1,990 | 🟢 **-₦50** (Husmodata Cheaper) |
| `391` | **6.0GB** | 7 days | **₦2,425** | `M6GBS` (6GB) | ₦2,480 | 🟢 **-₦55** (Husmodata Cheaper) |
| `396` | **3.5GB** | 30 days | **₦2,428** | `M3m5GBS` (3.5GB) | ₦2,480 | 🟢 **-₦52** (Husmodata Cheaper) |
| `374` | **6.75GB** | 7 day | **₦2,910** | — | — | Unique to Husmodata |
| `425` | **7.0GB** | 7 days | **₦3,380** | `M7GBS` (7GB) | ₦3,450 | 🟢 **-₦70** (Husmodata Cheaper) |
| `397` | **10.0GB** | 30 days | **₦4,365** | — | — | Unique to Husmodata |
| `398` | **12.5GB** | 30 days | **₦5,335** | `M12m5GBS` (12.5GB) | ₦5,435 | 🟢 **-₦100** (Husmodata Cheaper) |
| `385` | **16.5GB** | 30 days | **₦6,305** | — | — | Unique to Husmodata |
| `381` | **35.0GB** | 30 days postpaid plan only | **₦6,790** | — | — | Unique to Husmodata |
| `424` | **20.0GB** | 30 days | **₦7,260** | `M20GBS` (20GB) | ₦7,380 | 🟢 **-₦120** (Husmodata Cheaper) |
| `423` | **25.0GB** | 30days | **₦8,700** | `M25GBS` (25GB) | ₦8,850 | 🟢 **-₦150** (Husmodata Cheaper) |
| `400` | **40.0GB** | 60 days  postpaid plan onl | **₦8,730** | — | — | Unique to Husmodata |
| `379` | **36.0GB** | 30 days | **₦10,670** | `M36GBS` (36GB) | ₦10,850 | 🟢 **-₦180** (Husmodata Cheaper) |
| `360` | **75.0GB** | 30 days direct data | **₦17,460** | `M75GBS` (75GB) | ₦17,800 | 🟢 **-₦340** (Husmodata Cheaper) |
| `367` | **90.0GB** | 60 days | **₦24,250** | `M90GBS` (90GB) | ₦24,650 | 🟢 **-₦400** (Husmodata Cheaper) |
| `382` | **165.0GB** | 60 days | **₦33,950** | `M165GBS` (165GB) | ₦34,500 | 🟢 **-₦550** (Husmodata Cheaper) |
| `384` | **200.0GB** | 60 days | **₦48,500** | `M200GBS` (200GB) | ₦49,200 | 🟢 **-₦700** (Husmodata Cheaper) |
| `380` | **250.0GB** | 30 days | **₦53,350** | `M250GBS` (250GB) | ₦54,500 | 🟢 **-₦1150** (Husmodata Cheaper) |
| `462` | **800.0GB** | 1 year | **₦120,625** | `M800GBS` (800GB) | ₦123,500 | 🟢 **-₦2875** (Husmodata Cheaper) |

### Category: AWOOF GIFTING (11 Plans)

| Plan ID | Plan Capacity | Validity / Duration | Husmodata Wholesale (₦) | Peyflex Equivalent | Peyflex Wholesale (₦) | Variance / Cheaper Provider |
| :-: | :--- | :--- | --: | :--- | --: | :--- |
| `495` | **1.0GB** | 1day | **₦260** | `M1GBS` (1GB) | ₦796 | 🟢 **-₦536** (Husmodata Cheaper) |
| `496` | **2.5MB** | 1day | **₦560** | — | — | Unique to Husmodata |
| `311` | **3.2GB** | 2 days | **₦970** | `M3m2GBS` (3.2GB) | ₦990 | 🟢 **-₦20** (Husmodata Cheaper) |
| `478` | **7.0GB** | 2days | **₦1,745** | `M7GBS` (7GB) | ₦3,450 | 🟢 **-₦1705** (Husmodata Cheaper) |
| `312` | **6.75GB** | 30days | **₦2,910** | — | — | Unique to Husmodata |
| `376` | **11.0GB** | 7 days | **₦3,395** | `M11GBS` (11GB) | ₦3,500 | 🟢 **-₦105** (Husmodata Cheaper) |
| `501` | **12.5GB** | 14days | **₦4,320** | `M12m5GBS` (12.5GB) | ₦5,435 | 🟢 **-₦1115** (Husmodata Cheaper) |
| `422` | **20.0GB** | 7days | **₦4,840** | `M20GBS` (20GB) | ₦7,380 | 🟢 **-₦2540** (Husmodata Cheaper) |
| `421` | **20.0GB** | 7 days | **₦4,840** | `M20GBS` (20GB) | ₦7,380 | 🟢 **-₦2540** (Husmodata Cheaper) |
| `399` | **14.5GB** | 30days Xtra Special Tariff | **₦4,850** | `M14m5GBS` (14.5GB) | ₦4,950 | 🟢 **-₦100** (Husmodata Cheaper) |
| `502` | **18.0GB** | 14days | **₦5,760** | — | — | Unique to Husmodata |

### Category: DATA SHARE (8 Plans)

| Plan ID | Plan Capacity | Validity / Duration | Husmodata Wholesale (₦) | Peyflex Equivalent | Peyflex Wholesale (₦) | Variance / Cheaper Provider |
| :-: | :--- | :--- | --: | :--- | --: | :--- |
| `458` | **500.0MB** | 7days | **₦300** | `M500MBS` (500MB) | ₦350 | 🟢 **-₦50** (Husmodata Cheaper) |
| `466` | **1.0GB** | 7 days | **₦380** | `M1GBS` (1GB) | ₦450 | 🟢 **-₦70** (Husmodata Cheaper) |
| `457` | **1.0GB** | 30days | **₦392** | `M1GBS2` (1GB) | ₦580 | 🟢 **-₦188** (Husmodata Cheaper) |
| `467` | **2.0GB** | 7 days | **₦735** | `M2GBS` (2GB) | ₦850 | 🟢 **-₦115** (Husmodata Cheaper) |
| `459` | **2.0GB** | 30days | **₦805** | `M2GBS2` (2GB) | ₦950 | 🟢 **-₦145** (Husmodata Cheaper) |
| `468` | **3.0GB** | 7 days | **₦1,075** | `M3GBS` (3GB) | ₦1,200 | 🟢 **-₦125** (Husmodata Cheaper) |
| `460` | **3.0GB** | 30days | **₦1,125** | `M3GBS2` (3GB) | ₦1,250 | 🟢 **-₦125** (Husmodata Cheaper) |
| `309` | **5.0GB** | 30days | **₦1,610** | `M5GBS` (5GB) | ₦1,800 | 🟢 **-₦190** (Husmodata Cheaper) |

### Category: SME (5 Plans)

| Plan ID | Plan Capacity | Validity / Duration | Husmodata Wholesale (₦) | Peyflex Equivalent | Peyflex Wholesale (₦) | Variance / Cheaper Provider |
| :-: | :--- | :--- | --: | :--- | --: | :--- |
| `394` | **500.0MB** | 7 days | **₦360** | `M500MBS` (500MB) | ₦350 | 🔴 **+₦10** (Peyflex Cheaper) |
| `51` | **1.0GB** | 30days | **₦720** | `M1GBS2` (1GB) | ₦580 | 🔴 **+₦140** (Peyflex Cheaper) |
| `50` | **2.0GB** | 30 days | **₦1,440** | `M2GBS2` (2GB) | ₦950 | 🔴 **+₦490** (Peyflex Cheaper) |
| `417` | **3.0GB** | 30days | **₦2,160** | `M3GBS2` (3GB) | ₦1,250 | 🔴 **+₦910** (Peyflex Cheaper) |
| `150` | **10.0GB** | 30 days | **₦7,200** | — | — | Unique to Husmodata |

### Category: SME2 (5 Plans)

| Plan ID | Plan Capacity | Validity / Duration | Husmodata Wholesale (₦) | Peyflex Equivalent | Peyflex Wholesale (₦) | Variance / Cheaper Provider |
| :-: | :--- | :--- | --: | :--- | --: | :--- |
| `271` | **500.0MB** | 7 days | **₦405** | `M500MBS` (500MB) | ₦350 | 🔴 **+₦55** (Peyflex Cheaper) |
| `266` | **1.0GB** | 30 days. | **₦530** | `M1GBS2` (1GB) | ₦580 | 🟢 **-₦50** (Husmodata Cheaper) |
| `267` | **2.0GB** | 30 days. | **₦1,000** | `M2GBS2` (2GB) | ₦950 | 🔴 **+₦50** (Peyflex Cheaper) |
| `268` | **3.0GB** | 30 days | **₦1,250** | `M3GBS2` (3GB) | ₦1,250 | ⚪ **₦0** (Identical) |
| `269` | **5.0GB** | 30 days | **₦1,900** | `M5GBS` (5GB) | ₦1,800 | 🔴 **+₦100** (Peyflex Cheaper) |


## 🌐 Glo Telecommunications Plans (38 Total Plans)

### Category: CORPORATE GIFTING (17 Plans)

| Plan ID | Plan Capacity | Validity / Duration | Husmodata Wholesale (₦) | Peyflex Equivalent | Peyflex Wholesale (₦) | Variance / Cheaper Provider |
| :-: | :--- | :--- | --: | :--- | --: | :--- |
| `296` | **200.0MB** | 14 days | **₦72** | — | — | Unique to Husmodata |
| `258` | **500.0MB** | 30 days | **₦200** | `G500MB` (500MB) | ₦245 | 🟢 **-₦45** (Husmodata Cheaper) |
| `479` | **1.0GB** | 3 day | **₦335** | `G1GB1` (1GB) | ₦335 | ⚪ **₦0** (Identical) |
| `447` | **1.0GB** | 7days | **₦349** | `G1GB2` (1GB) | ₦360 | 🟢 **-₦11** (Husmodata Cheaper) |
| `482` | **1.0GB** | 14 days Night Only | **₦349** | `G1GB3` (1GB) | ₦360 | 🟢 **-₦11** (Husmodata Cheaper) |
| `261` | **1.0GB** | 30 days | **₦400** | `G1GB4` (1GB) | ₦450 | 🟢 **-₦50** (Husmodata Cheaper) |
| `262` | **2.0GB** | 30 days | **₦800** | `G2GB4` (2GB) | ₦900 | 🟢 **-₦100** (Husmodata Cheaper) |
| `480` | **3.0GB** | 3 days | **₦1,005** | `G3GB1` (3GB) | ₦850 | 🔴 **+₦155** (Peyflex Cheaper) |
| `483` | **3.0GB** | 14 days Night Only | **₦1,047** | `G3GB3` (3GB) | ₦990 | 🔴 **+₦57** (Peyflex Cheaper) |
| `448` | **3.0GB** | 7days | **₦1,047** | `G3GB2` (3GB) | ₦990 | 🔴 **+₦57** (Peyflex Cheaper) |
| `263` | **3.0GB** | 30 days | **₦1,200** | `G3GB4` (3GB) | ₦1,350 | 🟢 **-₦150** (Husmodata Cheaper) |
| `481` | **5.0GB** | 3 days | **₦1,675** | `G5GB1` (5GB) | ₦1,380 | 🔴 **+₦295** (Peyflex Cheaper) |
| `449` | **5.0GB** | 7days | **₦1,745** | `G5GB2` (5GB) | ₦1,580 | 🔴 **+₦165** (Peyflex Cheaper) |
| `484` | **5.0GB** | 14 days Night Only | **₦1,745** | `G5GB3` (5GB) | ₦1,640 | 🔴 **+₦105** (Peyflex Cheaper) |
| `297` | **5.0GB** | 30 days | **₦2,000** | `G5GB4` (5GB) | ₦2,200 | 🟢 **-₦200** (Husmodata Cheaper) |
| `485` | **10.0GB** | 14days night plan | **₦3,150** | `G10GB1` (10GB) | ₦3,300 | 🟢 **-₦150** (Husmodata Cheaper) |
| `265` | **10.0GB** | 30 days | **₦4,000** | `G10GB2` (10GB) | ₦4,250 | 🟢 **-₦250** (Husmodata Cheaper) |

### Category: AWOOF GIFTING (4 Plans)

| Plan ID | Plan Capacity | Validity / Duration | Husmodata Wholesale (₦) | Peyflex Equivalent | Peyflex Wholesale (₦) | Variance / Cheaper Provider |
| :-: | :--- | :--- | --: | :--- | --: | :--- |
| `321` | **750.0MB** | 1 day | **₦190** | — | — | Unique to Husmodata |
| `322` | **1.5GB** | 1 day | **₦285** | — | — | Unique to Husmodata |
| `323` | **2.5GB** | 2 days | **₦475** | — | — | Unique to Husmodata |
| `324` | **10.0GB** | 7 days | **₦1,900** | — | — | Unique to Husmodata |

### Category: GIFTING (17 Plans)

| Plan ID | Plan Capacity | Validity / Duration | Husmodata Wholesale (₦) | Peyflex Equivalent | Peyflex Wholesale (₦) | Variance / Cheaper Provider |
| :-: | :--- | :--- | --: | :--- | --: | :--- |
| `37` | **1.5GB** | 7days 500mbday +1gb nite | **₦465** | — | — | Unique to Husmodata |
| `252` | **1.1GB** | 14 days | **₦698** | — | — | Unique to Husmodata |
| `251` | **3.7GB** | 7days 1.5gbday+2gbnite=3.5g | **₦930** | — | — | Unique to Husmodata |
| `32` | **2.6GB** | 30days 1.1gday +1.5gbnite=2.6g | **₦930** | — | — | Unique to Husmodata |
| `31` | **5.2GB** | 30days. 2gbday + 3gbnite=5gb | **₦1,395** | — | — | Unique to Husmodata |
| `250` | **9.0GB** | 7days 6gbday+2.5gbnite=8.5gb | **₦1,860** | — | — | Unique to Husmodata |
| `30` | **6.25GB** | 30days 3.15gbday+3gbnite=6.25g | **₦1,860** | — | — | Unique to Husmodata |
| `29` | **7.25GB** | 30days 4.5gbday + 3gb =7.5gb | **₦2,325** | — | — | Unique to Husmodata |
| `28` | **10.0GB** | 30days 8gday + 2gbnite =10gb | **₦2,790** | `G10GB2` (10GB) | ₦4,250 | 🟢 **-₦1460** (Husmodata Cheaper) |
| `27` | **12.5GB** | 30days 12gbday + 2gbnite=12g | **₦3,720** | — | — | Unique to Husmodata |
| `426` | **20.5GB** | 7 days | **₦4,650** | — | — | Unique to Husmodata |
| `75` | **16.5GB** | 30 days | **₦4,650** | — | — | Unique to Husmodata |
| `73` | **20.5GB** | 30 days 18gbday + 2gbnite | **₦5,580** | — | — | Unique to Husmodata |
| `207` | **28.0GB** | 30 days | **₦7,440** | — | — | Unique to Husmodata |
| `74` | **38.0GB** | 30 days | **₦9,300** | — | — | Unique to Husmodata |
| `143` | **64.0GB** | 30 days | **₦13,950** | — | — | Unique to Husmodata |
| `144` | **107.0GB** | 30 days | **₦18,600** | — | — | Unique to Husmodata |


## 🌐 Airtel Telecommunications Plans (64 Total Plans)

### Category: AWOOF GIFTING (23 Plans)

| Plan ID | Plan Capacity | Validity / Duration | Husmodata Wholesale (₦) | Peyflex Equivalent | Peyflex Wholesale (₦) | Variance / Cheaper Provider |
| :-: | :--- | :--- | --: | :--- | --: | :--- |
| `432` | **250.0MB** | 1days Night Plan | **₦50** | — | — | Unique to Husmodata |
| `313` | **150.0MB** | 1 day | **₦53** | — | — | Unique to Husmodata |
| `454` | **75.0MB** | 1days | **₦75** | — | — | Unique to Husmodata |
| `450` | **300.0MB** | 2 days | **₦112** | `A300MB` (300MB) | ₦298 | 🟢 **-₦186** (Husmodata Cheaper) |
| `451` | **600.0MB** | 2 days | **₦213** | — | — | Unique to Husmodata |
| `429` | **1.0GB** | 3 days Social Bundle | **₦330** | `A1GBS` (1GB) | ₦338 | 🟢 **-₦8** (Husmodata Cheaper) |
| `443` | **1.5GB** | 1days | **₦415** | — | — | Unique to Husmodata |
| `446` | **1.5GB** | 1days Social Plan | **₦530** | — | — | Unique to Husmodata |
| `420` | **2.0GB** | 2  days | **₦620** | — | — | Unique to Husmodata |
| `444` | **2.0GB** | 2days | **₦750** | `A2GBS` (2GB) | ₦745 | 🔴 **+₦5** (Peyflex Cheaper) |
| `453` | **3.0GB** | 2days | **₦800** | `A3GB` (3GB) | ₦1,980 | 🟢 **-₦1180** (Husmodata Cheaper) |
| `434` | **1.5GB** | 7days (Weekly plan) | **₦970** | `A1a5GB` (1.5GB) | ₦530 | 🔴 **+₦440** (Peyflex Cheaper) |
| `439` | **3.5GB** | 7days Weekly | **₦1,500** | `A3a5GB` (3.5GB) | ₦1,488 | 🔴 **+₦12** (Peyflex Cheaper) |
| `452` | **5.0GB** | 7 days | **₦2,450** | — | — | Unique to Husmodata |
| `318` | **10.0GB** | 30days | **₦3,020** | `A10GB` (10GB) | ₦3,950 | 🟢 **-₦930** (Husmodata Cheaper) |
| `455` | **10.0GB** | 7days | **₦3,020** | `A10GBS` (10GB) | ₦2,975 | 🔴 **+₦45** (Peyflex Cheaper) |
| `390` | **13.0GB** | 30days | **₦4,940** | `A13GB` (13GB) | ₦4,955 | 🟢 **-₦15** (Husmodata Cheaper) |
| `441` | **18.0GB** | 7days | **₦5,000** | `A18GB` (18GB) | ₦5,940 | 🟢 **-₦940** (Husmodata Cheaper) |
| `435` | **25.0GB** | 30days | **₦7,760** | `A25GB` (25GB) | ₦7,900 | 🟢 **-₦140** (Husmodata Cheaper) |
| `436` | **35.0GB** | 30days | **₦9,900** | `A35GB` (35GB) | ₦9,900 | ⚪ **₦0** (Identical) |
| `437` | **60.0GB** | 30days | **₦14,840** | `A60GB` (60GB) | ₦14,900 | 🟢 **-₦60** (Husmodata Cheaper) |
| `438` | **100.0GB** | 30days | **₦20,000** | `A100GB` (100GB) | ₦19,800 | 🔴 **+₦200** (Peyflex Cheaper) |
| `445` | **500.0MB** | not available | **₦5,000,000,000,000** | — | — | Unique to Husmodata |

### Category: GIFTING (31 Plans)

| Plan ID | Plan Capacity | Validity / Duration | Husmodata Wholesale (₦) | Peyflex Equivalent | Peyflex Wholesale (₦) | Variance / Cheaper Provider |
| :-: | :--- | :--- | --: | :--- | --: | :--- |
| `411` | **75.0MB** | 1 days | **₦74** | — | — | Unique to Husmodata |
| `412` | **100.0MB** | 1 days | **₦98** | — | — | Unique to Husmodata |
| `472` | **200.0MB** | 2day | **₦195** | `A200MB` (200MB) | ₦199 | 🟢 **-₦4** (Husmodata Cheaper) |
| `413` | **300.0MB** | 2 days | **₦293** | `A300MB` (300MB) | ₦298 | 🟢 **-₦5** (Husmodata Cheaper) |
| `388` | **1.5GB** | 2 days | **₦480** | — | — | Unique to Husmodata |
| `300` | **1.0GB** | 1 day | **₦488** | — | — | Unique to Husmodata |
| `414` | **500.0MB** | 7 days | **₦488** | — | — | Unique to Husmodata |
| `126` | **2.0GB** | 2 day | **₦732** | `A2GBS` (2GB) | ₦745 | 🟢 **-₦13** (Husmodata Cheaper) |
| `125` | **1.0GB** | 7 day | **₦780** | `A1GB` (1GB) | ₦795 | 🟢 **-₦15** (Husmodata Cheaper) |
| `407` | **4.0GB** | 2 days | **₦975** | `A4GBS` (4GB) | ₦990 | 🟢 **-₦15** (Husmodata Cheaper) |
| `131` | **1.5GB** | 7 days | **₦980** | `A1a5GB` (1.5GB) | ₦530 | 🔴 **+₦450** (Peyflex Cheaper) |
| `498` | **6.0GB** | 2days | **₦1,440** | `A6GBS` (6GB) | ₦1,485 | 🟢 **-₦45** (Husmodata Cheaper) |
| `406` | **2.0GB** | 30days | **₦1,463** | `A2GB2` (2GB) | ₦1,478 | 🟢 **-₦15** (Husmodata Cheaper) |
| `409` | **4.0GB** | 7 days | **₦1,463** | — | — | Unique to Husmodata |
| `408` | **3.5GB** | 7 days | **₦1,463** | `A3a5GB` (3.5GB) | ₦1,488 | 🟢 **-₦25** (Husmodata Cheaper) |
| `499` | **6.0GB** | 7 days | **₦1,920** | `A6GB` (6GB) | ₦1,970 | 🟢 **-₦50** (Husmodata Cheaper) |
| `133` | **3.0GB** | 30 days | **₦1,950** | `A3GB` (3GB) | ₦1,980 | 🟢 **-₦30** (Husmodata Cheaper) |
| `134` | **4.0GB** | 30 days | **₦2,437** | `A4GB` (4GB) | ₦2,477 | 🟢 **-₦40** (Husmodata Cheaper) |
| `135` | **8.0GB** | 7 days | **₦2,437** | `A8GBS` (8GB) | ₦2,487 | 🟢 **-₦50** (Husmodata Cheaper) |
| `386` | **8.0GB** | 30 days | **₦2,925** | `A8GB` (8GB) | ₦2,975 | 🟢 **-₦50** (Husmodata Cheaper) |
| `138` | **10.0GB** | 7 days | **₦2,925** | `A10GBS` (10GB) | ₦2,975 | 🟢 **-₦50** (Husmodata Cheaper) |
| `136` | **10.0GB** | 30 days | **₦3,900** | `A10GB` (10GB) | ₦3,950 | 🟢 **-₦50** (Husmodata Cheaper) |
| `137` | **20.0GB** | 7 days | **₦4,800** | `A20GB` (20GB) | ₦4,950 | 🟢 **-₦150** (Husmodata Cheaper) |
| `129` | **13.0GB** | 30 days | **₦4,875** | `A13GB` (13GB) | ₦4,955 | 🟢 **-₦80** (Husmodata Cheaper) |
| `389` | **18.0GB** | 30 days | **₦5,850** | `A18GB` (18GB) | ₦5,940 | 🟢 **-₦90** (Husmodata Cheaper) |
| `139` | **25.0GB** | 30 days | **₦7,800** | `A25GB` (25GB) | ₦7,900 | 🟢 **-₦100** (Husmodata Cheaper) |
| `298` | **35.0GB** | 7 days Unltd Ultra Router | **₦9,900** | `A35GB` (35GB) | ₦9,900 | ⚪ **₦0** (Identical) |
| `410` | **60.0GB** | 30 days | **₦14,700** | `A60GB` (60GB) | ₦14,900 | 🟢 **-₦200** (Husmodata Cheaper) |
| `140` | **60.0GB** | 30 days ROUTER PLAN | **₦14,700** | `A60GB` (60GB) | ₦14,900 | 🟢 **-₦200** (Husmodata Cheaper) |
| `141` | **100.0GB** | 30 days | **₦19,500** | `A100GB` (100GB) | ₦19,800 | 🟢 **-₦300** (Husmodata Cheaper) |
| `387` | **160.0GB** | 30 days | **₦29,250** | `A160GB` (160GB) | ₦29,750 | 🟢 **-₦500** (Husmodata Cheaper) |

### Category: CORPORATE GIFTING (10 Plans)

| Plan ID | Plan Capacity | Validity / Duration | Husmodata Wholesale (₦) | Peyflex Equivalent | Peyflex Wholesale (₦) | Variance / Cheaper Provider |
| :-: | :--- | :--- | --: | :--- | --: | :--- |
| `216` | **100.0MB** | 7 days | **₦100** | — | — | Unique to Husmodata |
| `217` | **300.0MB** | 7 days | **₦310** | `A300MB` (300MB) | ₦298 | 🔴 **+₦12** (Peyflex Cheaper) |
| `212` | **500.0MB** | 30 days | **₦460** | — | — | Unique to Husmodata |
| `213` | **1.0GB** | 30 days | **₦915** | — | — | Unique to Husmodata |
| `214` | **2.0GB** | 30 days | **₦1,830** | `A2GB2` (2GB) | ₦1,478 | 🔴 **+₦352** (Peyflex Cheaper) |
| `470` | **3.0GB** | 30 days | **₦2,475** | `A3GB` (3GB) | ₦1,980 | 🔴 **+₦495** (Peyflex Cheaper) |
| `215` | **5.0GB** | 30 days | **₦4,575** | — | — | Unique to Husmodata |
| `231` | **10.0GB** | 30 days | **₦9,100** | `A10GB` (10GB) | ₦3,950 | 🔴 **+₦5150** (Peyflex Cheaper) |
| `232` | **15.0GB** | 30 days | **₦14,400** | — | — | Unique to Husmodata |
| `233` | **20.0GB** | 30 days | **₦19,200** | `A20GB` (20GB) | ₦4,950 | 🔴 **+₦14250** (Peyflex Cheaper) |


## 🌐 9mobile / T2 Mobile Plans (55 Total Plans)

### Category: GIFTING (14 Plans)

| Plan ID | Plan Capacity | Validity / Duration | Husmodata Wholesale (₦) | Peyflex Equivalent | Peyflex Wholesale (₦) | Variance / Cheaper Provider |
| :-: | :--- | :--- | --: | :--- | --: | :--- |
| `117` | **25.0MB** | 1 day | **₦44** | — | — | Unique to Husmodata |
| `119` | **650.0MB** | 1 day | **₦168** | — | — | Unique to Husmodata |
| `122` | **250.0MB** | 7 days | **₦168** | — | — | Unique to Husmodata |
| `120` | **1.0GB** | 1 day | **₦243** | `E1GB` (1GB) | ₦500 | 🟢 **-₦257** (Husmodata Cheaper) |
| `123` | **500.0MB** | 30 days | **₦410** | `E500MB` (500MB) | ₦300 | 🔴 **+₦110** (Peyflex Cheaper) |
| `121` | **2000.0MB** | 1 day | **₦410** | `E2GB` (2GB) | ₦980 | 🟢 **-₦570** (Husmodata Cheaper) |
| `366` | **750.0MB** | 3 days | **₦438** | — | — | Unique to Husmodata |
| `36` | **1.5GB** | 30 days | **₦810** | — | — | Unique to Husmodata |
| `33` | **2.0GB** | 30 days | **₦972** | `E2GB` (2GB) | ₦980 | 🟢 **-₦8** (Husmodata Cheaper) |
| `15` | **4.5GB** | 30 days | **₦1,620** | — | — | Unique to Husmodata |
| `14` | **11.0GB** | 30 days | **₦3,240** | — | — | Unique to Husmodata |
| `13` | **15.0GB** | 30 days | **₦4,050** | `E15GB` (15GB) | ₦6,950 | 🟢 **-₦2900** (Husmodata Cheaper) |
| `142` | **40.0GB** | 30 days | **₦8,100** | `E40GB` (40GB) | ₦18,800 | 🟢 **-₦10700** (Husmodata Cheaper) |
| `58` | **75.0GB** | 30 days | **₦12,150** | — | — | Unique to Husmodata |

### Category: CORPORATE GIFTING (17 Plans)

| Plan ID | Plan Capacity | Validity / Duration | Husmodata Wholesale (₦) | Peyflex Equivalent | Peyflex Wholesale (₦) | Variance / Cheaper Provider |
| :-: | :--- | :--- | --: | :--- | --: | :--- |
| `490` | **250.0MB** | 30days | **₦117** | — | — | Unique to Husmodata |
| `275` | **500.0MB** | 30 days | **₦233** | `E500MB` (500MB) | ₦300 | 🟢 **-₦67** (Husmodata Cheaper) |
| `272` | **1.0GB** | 30 days | **₦420** | `E1GB` (1GB) | ₦500 | 🟢 **-₦80** (Husmodata Cheaper) |
| `464` | **1.5GB** | 30 days | **₦540** | — | — | Unique to Husmodata |
| `274` | **2.0GB** | 30 days | **₦930** | `E2GB` (2GB) | ₦980 | 🟢 **-₦50** (Husmodata Cheaper) |
| `277` | **3.0GB** | 30 days | **₦1,395** | `E3GB` (3GB) | ₦1,500 | 🟢 **-₦105** (Husmodata Cheaper) |
| `463` | **4.0GB** | 30 days | **₦1,860** | — | — | Unique to Husmodata |
| `278` | **4.5GB** | 30 days | **₦2,093** | — | — | Unique to Husmodata |
| `295` | **5.0GB** | 30 days | **₦2,325** | `E5GB` (5GB) | ₦2,500 | 🟢 **-₦175** (Husmodata Cheaper) |
| `286` | **7.5GB** | 30 days | **₦3,488** | — | — | Unique to Husmodata |
| `118` | **10.0GB** | 30 days | **₦4,650** | `E10GB` (10GB) | ₦5,000 | 🟢 **-₦350** (Husmodata Cheaper) |
| `280` | **11.0GB** | 30 days | **₦5,115** | — | — | Unique to Husmodata |
| `281` | **15.0GB** | ...30days | **₦6,975** | `E15GB` (15GB) | ₦6,950 | 🔴 **+₦25** (Peyflex Cheaper) |
| `282` | **20.0GB** | ...30days | **₦9,300** | `E20GB` (20GB) | ₦9,500 | 🟢 **-₦200** (Husmodata Cheaper) |
| `284` | **25.0GB** | ...30days | **₦11,625** | — | — | Unique to Husmodata |
| `283` | **30.0GB** | ...30days | **₦13,950** | — | — | Unique to Husmodata |
| `465` | **40.0GB** | 30 days | **₦18,600** | `E40GB` (40GB) | ₦18,800 | 🟢 **-₦200** (Husmodata Cheaper) |

### Category: AWOOF GIFTING (14 Plans)

| Plan ID | Plan Capacity | Validity / Duration | Husmodata Wholesale (₦) | Peyflex Equivalent | Peyflex Wholesale (₦) | Variance / Cheaper Provider |
| :-: | :--- | :--- | --: | :--- | --: | :--- |
| `510` | **500.0MB** | 1 day | **₦126** | `E500MB` (500MB) | ₦300 | 🟢 **-₦174** (Husmodata Cheaper) |
| `504` | **1.0GB** | 30 days | **₦210** | `E1GB` (1GB) | ₦500 | 🟢 **-₦290** (Husmodata Cheaper) |
| `505` | **2.0GB** | 30 days | **₦402** | `E2GB` (2GB) | ₦980 | 🟢 **-₦578** (Husmodata Cheaper) |
| `506` | **2.0GB** | 1 day | **₦404** | `E2GB` (2GB) | ₦980 | 🟢 **-₦576** (Husmodata Cheaper) |
| `492` | **500.0MB** | 30 days | **₦430** | `E500MB` (500MB) | ₦300 | 🔴 **+₦130** (Peyflex Cheaper) |
| `310` | **1.0GB** | 1 day | **₦488** | `E1GB` (1GB) | ₦500 | 🟢 **-₦12** (Husmodata Cheaper) |
| `507` | **3.0GB** | 30days | **₦608** | `E3GB` (3GB) | ₦1,500 | 🟢 **-₦892** (Husmodata Cheaper) |
| `508` | **3.0GB** | 1days | **₦630** | `E3GB` (3GB) | ₦1,500 | 🟢 **-₦870** (Husmodata Cheaper) |
| `373` | **2.5GB** | 1 day | **₦730** | — | — | Unique to Husmodata |
| `509` | **4.0GB** | 30days | **₦830** | — | — | Unique to Husmodata |
| `393` | **1.5GB** | 7 days | **₦970** | — | — | Unique to Husmodata |
| `500` | **5.0GB** | 30days | **₦995** | `E5GB` (5GB) | ₦2,500 | 🟢 **-₦1505** (Husmodata Cheaper) |
| `418` | **1.8GB** | 30 days plus 335 airtime | **₦1,448** | — | — | Unique to Husmodata |
| `503` | **28.0GB** | 14days | **₦7,680** | — | — | Unique to Husmodata |

### Category: SME (10 Plans)

| Plan ID | Plan Capacity | Validity / Duration | Husmodata Wholesale (₦) | Peyflex Equivalent | Peyflex Wholesale (₦) | Variance / Cheaper Provider |
| :-: | :--- | :--- | --: | :--- | --: | :--- |
| `241` | **1.0GB** | 30 days | **₦300** | `E1GB` (1GB) | ₦500 | 🟢 **-₦200** (Husmodata Cheaper) |
| `243` | **1.5GB** | 30 days | **₦450** | — | — | Unique to Husmodata |
| `242` | **2.0GB** | 30 days | **₦600** | `E2GB` (2GB) | ₦980 | 🟢 **-₦380** (Husmodata Cheaper) |
| `244` | **3.0GB** | 30 days | **₦900** | `E3GB` (3GB) | ₦1,500 | 🟢 **-₦600** (Husmodata Cheaper) |
| `247` | **3.5GB** | 30 days | **₦1,050** | — | — | Unique to Husmodata |
| `245` | **4.0GB** | 30 days | **₦1,200** | — | — | Unique to Husmodata |
| `246` | **4.5GB** | 30 days | **₦1,350** | — | — | Unique to Husmodata |
| `248` | **5.0GB** | 30 days | **₦1,500** | `E5GB` (5GB) | ₦2,500 | 🟢 **-₦1000** (Husmodata Cheaper) |
| `249` | **10.0GB** | 30 days | **₦3,000** | `E10GB` (10GB) | ₦5,000 | 🟢 **-₦2000** (Husmodata Cheaper) |
| `256` | **40.0GB** | 30 days | **₦9,100** | `E40GB` (40GB) | ₦18,800 | 🟢 **-₦9700** (Husmodata Cheaper) |


---

## 🛠️ Husmodata Technical Integration & API Specification

### 1. Authentication
All requests require an HTTP Authorization header:
```http
Authorization: Token 096fce20c04dfbeb3954210f4dea5a99d04fd76d
Content-Type: application/json
```

### 2. Core Endpoints
| Action | HTTP Method | Endpoint | Description |
| :--- | :---: | :--- | :--- |
| **Check Balance & Profile** | `GET` | `https://husmodata.com/api/user/` | Returns user wallet balance, account details, and tier discount plans. |
| **List All Live Plans** | `GET` | `https://husmodata.com/api/network/` | Returns real-time dataplan objects for MTN, Glo, Airtel, and 9mobile. |
| **Purchase Data Bundle** | `POST` | `https://husmodata.com/api/data/` | Dispatches instant data delivery to customer phone number. |
| **Query Transaction Status**| `GET` | `https://husmodata.com/api/data/<transaction_id>` | Verifies receipt, server delivery status, and token. |

### 3. Purchase Request Payload Format
To vend a data bundle, send a `POST` to `https://husmodata.com/api/data/` with the following body:
```json
{
  "network": 1,
  "mobile_number": "08012345678",
  "plan": 457,
  "Ported_number": true
}
```

#### Network Numerical IDs on Husmodata:
- **MTN**: `1`
- **GLO**: `2`
- **AIRTEL**: `3`
- **9MOBILE**: `4`

`plan` is the exact integer `id` / `dataplan_id` from the catalog tables above.

---

## 💡 Operational Recommendations for MotherBot & ProxyBot

1. **Implement Dual-Provider Routing / Dynamic Fallback:**
   - Configure a primary provider for each plan ID based on the highest profit margin.
   - For MTN Data Share, route first to **Husmodata** (yielding +₦50 to +₦190 more margin per transaction).
   - If Husmodata's API triggers a circuit breaker or returns a network error, automatically failover to **Peyflex**.
2. **Glo Hybrid Routing:**
   - Route Glo 30-day plans (1GB, 2GB, 3GB, 5GB) to **Husmodata** (saving ₦50 to ₦200 per bundle).
   - Route Glo 3-day plans (3GB, 5GB) to **Peyflex** (saving ₦155 to ₦295 per bundle).
3. **Wallet Pre-funding:**
   - Current Husmodata balance is **₦0**. Fund the Husmodata wallet before switching live purchase traffic.
