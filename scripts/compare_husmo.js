import fs from 'fs';
import { ACTIVE_APPROVED_PLANS } from '../src/services/payflex.js';

const rawHusmo = `
13	9MOBILE	GIFTING	₦4050.0	15.0 GB	---30 days
14	9MOBILE	GIFTING	₦3240.0	11.0 GB	--- 30 days
15	9MOBILE	GIFTING	₦1620.0	4.5 GB	---30 days
33	9MOBILE	GIFTING	₦972.0	2.0 GB	--- 30 days
36	9MOBILE	GIFTING	₦810.0	1.5 GB	---30 days
58	9MOBILE	GIFTING	₦12150.0	75.0 GB	--- 30 days
393	9MOBILE	AWOOF GIFTING	₦970.0	1.5 GB	--- 7 days
117	9MOBILE	GIFTING	₦44.0	25.0 MB	--- 1 day
118	9MOBILE	CORPORATE GIFTING	₦4650.0	10.0 GB	--- 30 days
119	9MOBILE	GIFTING	₦168.0	650.0 MB	--- 1 day
120	9MOBILE	GIFTING	₦243.0	1.0 GB	--- 1 day
121	9MOBILE	GIFTING	₦410.0	2000.0 MB	--- 1 day
122	9MOBILE	GIFTING	₦168.0	250.0 MB	--- 7 days
123	9MOBILE	GIFTING	₦410.0	500.0 MB	--- 30 days
142	9MOBILE	GIFTING	₦8100.0	40.0 GB	--- 30 days
241	9MOBILE	SME	₦300.0	1.0 GB	--- 30 days
242	9MOBILE	SME	₦600.0	2.0 GB	--- 30 days
243	9MOBILE	SME	₦450.0	1.5 GB	--- 30 days
244	9MOBILE	SME	₦900.0	3.0 GB	--- 30 days
245	9MOBILE	SME	₦1200.0	4.0 GB	--- 30 days
246	9MOBILE	SME	₦1350.0	4.5 GB	--- 30 days
247	9MOBILE	SME	₦1050.0	3.5 GB	--- 30 days
248	9MOBILE	SME	₦1500.0	5.0 GB	--- 30 days
249	9MOBILE	SME	₦3000.0	10.0 GB	--- 30 days
256	9MOBILE	SME	₦9100.0	40.0 GB	--- 30 days
272	9MOBILE	CORPORATE GIFTING	₦420.0	1.0 GB	--- 30 days
464	9MOBILE	CORPORATE GIFTING	₦540.0	1.5 GB	--- 30 days
274	9MOBILE	CORPORATE GIFTING	₦930.0	2.0 GB	--- 30 days
275	9MOBILE	CORPORATE GIFTING	₦233.0	500.0 MB	--- 30 days
463	9MOBILE	CORPORATE GIFTING	₦1860.0	4.0 GB	--- 30 days
277	9MOBILE	CORPORATE GIFTING	₦1395.0	3.0 GB	--- 30 days
278	9MOBILE	CORPORATE GIFTING	₦2093.0	4.5 GB	--- 30 days
280	9MOBILE	CORPORATE GIFTING	₦5115.0	11.0 GB	--- 30 days
281	9MOBILE	CORPORATE GIFTING	₦6975.0	15.0 GB	...30days
282	9MOBILE	CORPORATE GIFTING	₦9300.0	20.0 GB	...30days
283	9MOBILE	CORPORATE GIFTING	₦13950.0	30.0 GB	...30days
284	9MOBILE	CORPORATE GIFTING	₦11625.0	25.0 GB	...30days
286	9MOBILE	CORPORATE GIFTING	₦3488.0	7.5 GB	--- 30 days
418	9MOBILE	AWOOF GIFTING	₦1448.0	1.8 GB	--- 30 days plus 335 airtime
295	9MOBILE	CORPORATE GIFTING	₦2325.0	5.0 GB	--- 30 days
310	9MOBILE	AWOOF GIFTING	₦488.0	1.0 GB	---1 day
373	9MOBILE	AWOOF GIFTING	₦730.0	2.5 GB	--- 1 day
366	9MOBILE	GIFTING	₦438.0	750.0 MB	--- 3 days
465	9MOBILE	CORPORATE GIFTING	₦18600.0	40.0 GB	--- 30 days
490	9MOBILE	CORPORATE GIFTING	₦117.0	250.0 MB	----30days
492	9MOBILE	AWOOF GIFTING	₦430.0	500.0 MB	--- 30 days
500	9MOBILE	AWOOF GIFTING	₦995.0	5.0 GB	----30days
503	9MOBILE	AWOOF GIFTING	₦7680.0	28.0 GB	14days
504	9MOBILE	AWOOF GIFTING	₦210.0	1.0 GB	--- 30 days
505	9MOBILE	AWOOF GIFTING	₦402.0	2.0 GB	--- 30 days
506	9MOBILE	AWOOF GIFTING	₦404.0	2.0 GB	--- 1 day
507	9MOBILE	AWOOF GIFTING	₦608.0	3.0 GB	----30days
508	9MOBILE	AWOOF GIFTING	₦630.0	3.0 GB	----1days
509	9MOBILE	AWOOF GIFTING	₦830.0	4.0 GB	---30days
510	9MOBILE	AWOOF GIFTING	₦126.0	500.0 MB	----1 day
437	AIRTEL	AWOOF GIFTING	₦14840.0	60.0 GB	----30days
389	AIRTEL	GIFTING	₦5850.0	18.0 GB	---- 30 days
387	AIRTEL	GIFTING	₦29250.0	160.0 GB	--- 30 days
388	AIRTEL	GIFTING	₦480.0	1.5 GB	-- 2 days
386	AIRTEL	GIFTING	₦2925.0	8.0 GB	--- 30 days
125	AIRTEL	GIFTING	₦780.0	1.0 GB	--- 7 day
126	AIRTEL	GIFTING	₦732.0	2.0 GB	--- 2 day
129	AIRTEL	GIFTING	₦4875.0	13.0 GB	---30 days
443	AIRTEL	AWOOF GIFTING	₦415.0	1.5 GB	--1days
131	AIRTEL	GIFTING	₦980.0	1.5 GB	--- 7 days
407	AIRTEL	GIFTING	₦975.0	4.0 GB	---- 2 days
133	AIRTEL	GIFTING	₦1950.0	3.0 GB	--- 30 days
134	AIRTEL	GIFTING	₦2437.0	4.0 GB	--- 30 days
135	AIRTEL	GIFTING	₦2437.0	8.0 GB	--- 7 days
136	AIRTEL	GIFTING	₦3900.0	10.0 GB	--- 30 days
137	AIRTEL	GIFTING	₦4800.0	20.0 GB	--- 7 days
138	AIRTEL	GIFTING	₦2925.0	10.0 GB	--- 7 days
139	AIRTEL	GIFTING	₦7800.0	25.0 GB	--- 30 days
140	AIRTEL	GIFTING	₦14700.0	60.0 GB	--- 30 days ROUTER PLAN
141	AIRTEL	GIFTING	₦19500.0	100.0 GB	--- 30 days
212	AIRTEL	CORPORATE GIFTING	₦460.0	500.0 MB	--- 30 days
213	AIRTEL	CORPORATE GIFTING	₦915.0	1.0 GB	--- 30 days
214	AIRTEL	CORPORATE GIFTING	₦1830.0	2.0 GB	--- 30 days
215	AIRTEL	CORPORATE GIFTING	₦4575.0	5.0 GB	--- 30 days
216	AIRTEL	CORPORATE GIFTING	₦100.0	100.0 MB	--- 7 days
217	AIRTEL	CORPORATE GIFTING	₦310.0	300.0 MB	--- 7 days
231	AIRTEL	CORPORATE GIFTING	₦9100.0	10.0 GB	--- 30 days
232	AIRTEL	CORPORATE GIFTING	₦14400.0	15.0 GB	--- 30 days
233	AIRTEL	CORPORATE GIFTING	₦19200.0	20.0 GB	--- 30 days
298	AIRTEL	GIFTING	₦9900.0	35.0 GB	-- 7 days Unltd Ultra Router
499	AIRTEL	GIFTING	₦1920.0	6.0 GB	--- 7 days
432	AIRTEL	AWOOF GIFTING	₦50.0	250.0 MB	--1days Night Plan
300	AIRTEL	GIFTING	₦488.0	1.0 GB	--- 1 day
313	AIRTEL	AWOOF GIFTING	₦53.0	150.0 MB	--- 1 day
436	AIRTEL	AWOOF GIFTING	₦9900.0	35.0 GB	----30days
420	AIRTEL	AWOOF GIFTING	₦620.0	2.0 GB	--- 2 days
441	AIRTEL	AWOOF GIFTING	₦5000.0	18.0 GB	----7days
318	AIRTEL	AWOOF GIFTING	₦3020.0	10.0 GB	--- 30days
414	AIRTEL	GIFTING	₦488.0	500.0 MB	--- 7 days
435	AIRTEL	AWOOF GIFTING	₦7760.0	25.0 GB	----30days
390	AIRTEL	AWOOF GIFTING	₦4940.0	13.0 GB	--- 30days
413	AIRTEL	GIFTING	₦293.0	300.0 MB	-- 2 days
412	AIRTEL	GIFTING	₦98.0	100.0 MB	---- 1 days
408	AIRTEL	GIFTING	₦1463.0	3.5 GB	---- 7 days
409	AIRTEL	GIFTING	₦1463.0	4.0 GB	--- 7 days
410	AIRTEL	GIFTING	₦14700.0	60.0 GB	--- 30 days
411	AIRTEL	GIFTING	₦74.0	75.0 MB	--- 1 days
406	AIRTEL	GIFTING	₦1463.0	2.0 GB	--- 30days
429	AIRTEL	AWOOF GIFTING	₦330.0	1.0 GB	-- 3 days Social Bundle
434	AIRTEL	AWOOF GIFTING	₦970.0	1.5 GB	--7days (Weekly plan)
438	AIRTEL	AWOOF GIFTING	₦20000.0	100.0 GB	---30days
439	AIRTEL	AWOOF GIFTING	₦1500.0	3.5 GB	---- 7days Weekly
444	AIRTEL	AWOOF GIFTING	₦750.0	2.0 GB	--2days
445	AIRTEL	AWOOF GIFTING	₦5000000000000.0	500.0 MB	not available
446	AIRTEL	AWOOF GIFTING	₦530.0	1.5 GB	---1days Social Plan
450	AIRTEL	AWOOF GIFTING	₦112.0	300.0 MB	---2 days
451	AIRTEL	AWOOF GIFTING	₦213.0	600.0 MB	--- 2 days
452	AIRTEL	AWOOF GIFTING	₦2450.0	5.0 GB	--- 7 days
453	AIRTEL	AWOOF GIFTING	₦800.0	3.0 GB	--- 2days
454	AIRTEL	AWOOF GIFTING	₦75.0	75.0 MB	---1days
455	AIRTEL	AWOOF GIFTING	₦3020.0	10.0 GB	--- 7days
470	AIRTEL	CORPORATE GIFTING	₦2475.0	3.0 GB	---30 days
472	AIRTEL	GIFTING	₦195.0	200.0 MB	--2day
498	AIRTEL	GIFTING	₦1440.0	6.0 GB	----2days
27	GLO	GIFTING	₦3720.0	12.5 GB	- 30days 12gbday + 2gbnite=12g
28	GLO	GIFTING	₦2790.0	10.0 GB	-30days 8gday + 2gbnite =10gb
29	GLO	GIFTING	₦2325.0	7.25 GB	30days 4.5gbday + 3gb =7.5gb
30	GLO	GIFTING	₦1860.0	6.25 GB	30days 3.15gbday+3gbnite=6.25g
31	GLO	GIFTING	₦1395.0	5.2 GB	30days. 2gbday + 3gbnite=5gb
32	GLO	GIFTING	₦930.0	2.6 GB	30days 1.1gday +1.5gbnite=2.6g
37	GLO	GIFTING	₦465.0	1.5 GB	- 7days 500mbday +1gb nite
73	GLO	GIFTING	₦5580.0	20.5 GB	-30 days 18gbday + 2gbnite
74	GLO	GIFTING	₦9300.0	38.0 GB	--- 30 days
75	GLO	GIFTING	₦4650.0	16.5 GB	--- 30 days
143	GLO	GIFTING	₦13950.0	64.0 GB	--- 30 days
144	GLO	GIFTING	₦18600.0	107.0 GB	--- 30 days
207	GLO	GIFTING	₦7440.0	28.0 GB	--- 30 days
250	GLO	GIFTING	₦1860.0	9.0 GB	-7days 6gbday+2.5gbnite=8.5gb
251	GLO	GIFTING	₦930.0	3.7 GB	---7days 1.5gbday+2gbnite=3.5g
252	GLO	GIFTING	₦698.0	1.1 GB	--- 14 days
258	GLO	CORPORATE GIFTING	₦200.0	500.0 MB	--- 30 days
262	GLO	CORPORATE GIFTING	₦800.0	2.0 GB	--- 30 days
261	GLO	CORPORATE GIFTING	₦400.0	1.0 GB	--- 30 days
263	GLO	CORPORATE GIFTING	₦1200.0	3.0 GB	--- 30 days
265	GLO	CORPORATE GIFTING	₦4000.0	10.0 GB	--- 30 days
296	GLO	CORPORATE GIFTING	₦72.0	200.0 MB	--- 14 days
297	GLO	CORPORATE GIFTING	₦2000.0	5.0 GB	--- 30 days
321	GLO	AWOOF GIFTING	₦190.0	750.0 MB	--- 1 day
322	GLO	AWOOF GIFTING	₦285.0	1.5 GB	--- 1 day
323	GLO	AWOOF GIFTING	₦475.0	2.5 GB	---2 days
324	GLO	AWOOF GIFTING	₦1900.0	10.0 GB	---7 days
426	GLO	GIFTING	₦4650.0	20.5 GB	--- 7 days
447	GLO	CORPORATE GIFTING	₦349.0	1.0 GB	---7days
448	GLO	CORPORATE GIFTING	₦1047.0	3.0 GB	----7days
449	GLO	CORPORATE GIFTING	₦1745.0	5.0 GB	----7days
479	GLO	CORPORATE GIFTING	₦335.0	1.0 GB	--- 3 day
480	GLO	CORPORATE GIFTING	₦1005.0	3.0 GB	--- 3 days
481	GLO	CORPORATE GIFTING	₦1675.0	5.0 GB	--- 3 days
482	GLO	CORPORATE GIFTING	₦349.0	1.0 GB	--- 14 days Night Only
483	GLO	CORPORATE GIFTING	₦1047.0	3.0 GB	--- 14 days Night Only
484	GLO	CORPORATE GIFTING	₦1745.0	5.0 GB	--- 14 days Night Only
485	GLO	CORPORATE GIFTING	₦3150.0	10.0 GB	---14days night plan
50	MTN	SME	₦1440.0	2.0 GB	--- 30 days
51	MTN	SME	₦720.0	1.0 GB	---30days
394	MTN	SME	₦360.0	500.0 MB	--- 7 days
458	MTN	DATA SHARE	₦300.0	500.0 MB	---7days
99	MTN	CORPORATE GIFTING	₦400.0	500.0 MB	--- 30 days (C. G)
100	MTN	CORPORATE GIFTING	₦530.0	1.0 GB	--- 30 days (C. G)
101	MTN	CORPORATE GIFTING	₦1000.0	2.0 GB	--- 30 days (C. G)
384	MTN	GIFTING	₦48500.0	200.0 GB	--- 60 days
385	MTN	GIFTING	₦6305.0	16.5 GB	--- 30 days
382	MTN	GIFTING	₦33950.0	165.0 GB	--- 60 days
380	MTN	GIFTING	₦53350.0	250.0 GB	--- 30 days
381	MTN	GIFTING	₦6790.0	35.0 GB	--- 30 days postpaid plan only
379	MTN	GIFTING	₦10670.0	36.0 GB	--- 30 days
397	MTN	GIFTING	₦4365.0	10.0 GB	--- 30 days
378	MTN	GIFTING	₦970.0	3.2 GB	--- 2 days
116	MTN	CORPORATE GIFTING	₦1900.0	5.0 GB	--- 30 days (C. G)
355	MTN	GIFTING	₦970.0	1.5 GB	--- 7 days
400	MTN	GIFTING	₦8730.0	40.0 GB	--- 60 days postpaid plan onl
146	MTN	CORPORATE GIFTING	₦8100.0	10.0 GB	--- 30 days (C. G)
149	MTN	CORPORATE GIFTING	₦16400.0	20.0 GB	--- 30 days
150	MTN	SME	₦7200.0	10.0 GB	--- 30 days
208	MTN	CORPORATE GIFTING	₦12300.0	15.0 GB	--- 30 days
209	MTN	CORPORATE GIFTING	₦32800.0	40.0 GB	--- 30 days
210	MTN	CORPORATE GIFTING	₦61500.0	75.0 GB	--- 30 days
211	MTN	CORPORATE GIFTING	₦82000.0	100.0 GB	--- 30 days
226	MTN	CORPORATE GIFTING	₦1200.0	3.0 GB	--- 30 days
376	MTN	AWOOF GIFTING	₦3395.0	11.0 GB	--7 days
377	MTN	GIFTING	₦728.0	1.2 GB	--- 7 days
398	MTN	GIFTING	₦5335.0	12.5 GB	--- 30 days
360	MTN	GIFTING	₦17460.0	75.0 GB	--- 30 days direct data
253	MTN	CORPORATE GIFTING	₦205.0	250.0 MB	--- 30 days
254	MTN	CORPORATE GIFTING	₦150.0	150.0 MB	--- 30 days
255	MTN	CORPORATE GIFTING	₦52.0	50.0 MB	--- 30 days
266	MTN	SME2	₦530.0	1.0 GB	30 days.
267	MTN	SME2	₦1000.0	2.0 GB	30 days.
268	MTN	SME2	₦1250.0	3.0 GB	30 days
269	MTN	SME2	₦1900.0	5.0 GB	30 days
271	MTN	SME2	₦405.0	500.0 MB	7 days
467	MTN	DATA SHARE	₦735.0	2.0 GB	--- 7 days
416	MTN	GIFTING	₦582.0	1.5 GB	--- 2 days
375	MTN	GIFTING	₦1940.0	2.7 GB	--- 30days
403	MTN	GIFTING	₦98.0	110.0 MB	--- 1 day
404	MTN	GIFTING	₦74.0	75.0 MB	--- 1 day
401	MTN	GIFTING	₦485.0	500.0 MB	--- 7 days
402	MTN	GIFTING	₦194.0	230.0 MB	--- 1 day
457	MTN	DATA SHARE	₦392.0	1.0 GB	----30days
309	MTN	DATA SHARE	₦1610.0	5.0 GB	30days
311	MTN	AWOOF GIFTING	₦970.0	3.2 GB	---2 days
312	MTN	AWOOF GIFTING	₦2910.0	6.75 GB	---30days
374	MTN	GIFTING	₦2910.0	6.75 GB	-- 7 day
396	MTN	GIFTING	₦2428.0	3.5 GB	--- 30 days
371	MTN	GIFTING	₦1455.0	2.0 GB	--- 30days
391	MTN	GIFTING	₦2425.0	6.0 GB	--- 7 days
368	MTN	GIFTING	₦873.0	2.5 GB	--- 2 days
367	MTN	GIFTING	₦24250.0	90.0 GB	--- 60 days
417	MTN	SME	₦2160.0	3.0 GB	--30days
399	MTN	AWOOF GIFTING	₦4850.0	14.5 GB	--- 30days Xtra Special Tariff
364	MTN	GIFTING	₦728.0	2.0 GB	--- 2 days
365	MTN	GIFTING	₦780.0	1.0 GB	--- 7 days direct data
466	MTN	DATA SHARE	₦380.0	1.0 GB	--- 7 days
421	MTN	AWOOF GIFTING	₦4840.0	20.0 GB	--- 7 days
422	MTN	AWOOF GIFTING	₦4840.0	20.0 GB	--- 7days
423	MTN	GIFTING	₦8700.0	25.0 GB	--- 30days
424	MTN	GIFTING	₦7260.0	20.0 GB	---- 30 days
425	MTN	GIFTING	₦3380.0	7.0 GB	---- 7 days
496	MTN	AWOOF GIFTING	₦560.0	2.5 MB	-----1day
459	MTN	DATA SHARE	₦805.0	2.0 GB	---30days
460	MTN	DATA SHARE	₦1125.0	3.0 GB	---30days
461	MTN	GIFTING	₦339.0	500.0 MB	---1day
462	MTN	GIFTING	₦120625.0	800.0 GB	---- 1 year
468	MTN	DATA SHARE	₦1075.0	3.0 GB	--- 7 days
473	MTN	GIFTING	₦1455.0	3.5 GB	----7days
478	MTN	AWOOF GIFTING	₦1745.0	7.0 GB	---2days
486	MTN	GIFTING	₦960.0	3.5 GB	---1day
487	MTN	GIFTING	₦1152.0	4.0 GB	---2,days
488	MTN	GIFTING	₦1440.0	5.5 GB	---2days
495	MTN	AWOOF GIFTING	₦260.0	1.0 GB	---1day
491	MTN	GIFTING	₦430.0	500.0 MB	--- 30 days
501	MTN	AWOOF GIFTING	₦4320.0	12.5 GB	14days
502	MTN	AWOOF GIFTING	₦5760.0	18.0 GB	14days
`;

// Parse Husmo
const husmoLines = rawHusmo.trim().split('\n').filter(l => l.trim().length > 0);
const husmoPlans = [];

for (const line of husmoLines) {
  const parts = line.split('\t').map(p => p.trim());
  if (parts.length >= 6) {
    const [id, network, planType, rawAmount, size, validity] = parts;
    const amount = parseFloat(rawAmount.replace(/[^\d.]/g, ''));
    husmoPlans.push({
      id,
      network: network.toLowerCase(),
      planType: planType.toLowerCase(),
      amount,
      size,
      validity
    });
  }
}

console.log(`Parsed ${husmoPlans.length} Husmodata plans.`);

// Let's analyze comparison against our 54 ACTIVE_APPROVED_PLANS
const results = [];

for (const [key, planDef] of Object.entries(ACTIVE_APPROVED_PLANS)) {
  const [netKey, planCode] = key.split(':');
  
  // Normalize network
  let targetNet = 'mtn';
  if (netKey.includes('airtel')) targetNet = 'airtel';
  else if (netKey.includes('glo')) targetNet = 'glo';
  else if (netKey.includes('9mobile')) targetNet = '9mobile';

  // Find matching Husmo plans
  // Normalize size (e.g., '1GB', '500MB', '14.5GB')
  const nameClean = planDef.name.toLowerCase();
  
  const matches = husmoPlans.filter(h => {
    if (h.network !== targetNet) return false;
    
    // Check size match
    const hSize = h.size.toLowerCase().replace(/\s+/g, '');
    const pSize = nameClean.replace(/\s+/g, '');
    
    // Check if capacity matches
    const capMatch = pSize.includes(hSize) || hSize.includes(pSize.split(' ')[0]);
    if (!capMatch) return false;
    
    // Check validity/duration match
    const durCat = planDef.durationCategory.toLowerCase();
    const hVal = h.validity.toLowerCase();
    
    if (durCat.includes('1-day') && (hVal.includes('1 day') || hVal.includes('1day'))) return true;
    if (durCat.includes('2-day') && (hVal.includes('2 day') || hVal.includes('2day'))) return true;
    if (durCat.includes('3-day') && (hVal.includes('3 day') || hVal.includes('3day'))) return true;
    if (durCat.includes('7-day') && (hVal.includes('7 day') || hVal.includes('7day') || hVal.includes('weekly'))) return true;
    if (durCat.includes('30-day') && (hVal.includes('30 day') || hVal.includes('30day') || hVal.includes('1 month'))) return true;
    if (durCat.includes('2-month') && (hVal.includes('60 day') || hVal.includes('2 month'))) return true;
    if (durCat.includes('yearly') && (hVal.includes('1 year') || hVal.includes('365'))) return true;
    
    return false;
  });

  results.push({
    key,
    network: netKey,
    code: planCode,
    name: planDef.name,
    durationCategory: planDef.durationCategory,
    ourWholesale: planDef.basePrice,
    ourSellPrice: planDef.sellPrice,
    husmoMatches: matches
  });
}

fs.writeFileSync('storage/husmo_comparison.json', JSON.stringify(results, null, 2));
console.log('Saved storage/husmo_comparison.json');
