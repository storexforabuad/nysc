const fs = require('fs');

let payflex = fs.readFileSync('./src/services/payflex.js', 'utf8');

const analyzeStr = 
const analyzeDuration = (label) => {
  const lbl = label.toLowerCase();
  let priority = 99;
  let category = 'Other Plans';
  
  if (lbl.includes('1 day') || lbl.includes('1day')) { priority = 1; category = '? *1-Day Plans:*'; }
  else if (lbl.includes('2 day') || lbl.includes('2day')) { priority = 2; category = '? *2-Day Plans:*'; }
  else if (lbl.includes('3 day') || lbl.includes('3day')) { priority = 3; category = '? *3-Day Plans:*'; }
  else if (lbl.includes('7 day') || lbl.includes('7day') || lbl.includes('weekly')) { priority = 7; category = '?? *7-Day Plans:*'; }
  else if (lbl.includes('14 day') || lbl.includes('14day')) { priority = 14; category = '?? *14-Day Plans:*'; }
  else if (lbl.includes('1 month') || lbl.includes('30 day') || lbl.includes('30day')) { priority = 30; category = '??? *30-Day/Monthly Plans:*'; }
  else if (lbl.includes('2 month') || lbl.includes('60 day') || lbl.includes('60day')) { priority = 60; category = '??? *2-Month Plans:*'; }
  else if (lbl.includes('1 year') || lbl.includes('365 day')) { priority = 365; category = '?? *Yearly Plans:*'; }
  
  return { category, priority };
};
;

const whitelistStr = 
const CUSTOM_MTN_PLANS = {
  // 7 Days
  'mtn_data_share:M500MBS': { sellPrice: 490 },
  'mtn_data_share:M1GBS': { sellPrice: 690 },
  'mtn_data_share:M2GBS': { sellPrice: 990 },
  'mtn_data_share:M3GBS': { sellPrice: 1290 },
  // 30 Days
  'mtn_data_share:M1GBS2': { sellPrice: 790 },
  'mtn_data_share:M2GBS2': { sellPrice: 1290 },
  'mtn_data_share:M3GBS2': { sellPrice: 1950 },
  'mtn_data_share:M5GBS': { sellPrice: 2550 },
  
  // Gifting
  'mtn_gifting_data:M1m2GB': { sellPrice: 650 },
  'mtn_gifting_data:M2m5GB': { sellPrice: 800 },
  'mtn_gifting_data:M2m5GBS': { sellPrice: 990 },
  'mtn_gifting_data:M2GBS': { sellPrice: 765 },
  'mtn_gifting_data:M3m2GBS': { sellPrice: 1090 },
  'mtn_gifting_data:M3m5GBS': { sellPrice: 2495 },
  'mtn_gifting_data:M6GBS': { sellPrice: 2550 },
  'mtn_gifting_data:M7GBS': { sellPrice: 3550 },
  'mtn_gifting_data:M12m5GBS': { sellPrice: 5490 },
  'mtn_gifting_data:M14m5GBS': { sellPrice: 4995 },
  'mtn_gifting_data:M20GBS': { sellPrice: 7490 },
  'mtn_gifting_data:M25GBS': { sellPrice: 8990 },
  'mtn_gifting_data:M36GBS': { sellPrice: 10990 },
  'mtn_gifting_data:M65GBS': { sellPrice: 15980 },
  'mtn_gifting_data:M75GBS': { sellPrice: 17980 },
  'mtn_gifting_data:M90GBS': { sellPrice: 24980 },
  'mtn_gifting_data:M150GBS': { sellPrice: 39950 },
  'mtn_gifting_data:M165GBS': { sellPrice: 34950 },
  'mtn_gifting_data:M200GBS': { sellPrice: 49950 },
  'mtn_gifting_data:M250GBS': { sellPrice: 54950 },
  'mtn_gifting_data:M800GBS': { sellPrice: 124950 },
};
;

const targetReg = /(?=\n\/\/ Deterministic plan_code)/;
payflex = payflex.replace(targetReg, analyzeStr + whitelistStr);

const payflexMapLogicOld = '      // Assign global serials and apply Official Price Ceiling + Smart Discount strategy.\\n      // Uses plan_code keyed map so it is IMMUNE to API plan count/ordering changes.\\n      allPlans = allPlans.map((p, index) => {\\n        // Build the lookup key using network prefix to resolve plan_code collisions (e.g. MTN Share vs Gifting)\\n        const mapKey = \\:\\;\\n        const official = OFFICIAL_PRICES_MAP[mapKey] ?? null;\\n        let newSellPrice = p.sellPrice;\\n\\n        if (official !== null && official !== undefined) {\\n          if (p.sellPrice < official) {\\n            // Full profit capture: raise to network retail ceiling\\n            newSellPrice = official;\\n          } else if (p.sellPrice > official) {\\n            // Above market: set just below official to stay competitive\\n            newSellPrice = official - 5;\\n          }\\n        }\\n\\n        // --- Smart Advertising Discount Strategy ---\\n        const grossMargin = newSellPrice - p.basePrice;\\n        if (grossMargin >= 500) {\\n          newSellPrice -= 50;\\n        } else if (grossMargin >= 200) {\\n          newSellPrice -= 20;\\n        } else if (grossMargin >= 100) {\\n          newSellPrice -= 10;\\n        } else if (grossMargin >= 50) {\\n          newSellPrice -= 5;\\n        }\\n\\n        // Safety net: never sell below cost\\n        if (newSellPrice <= p.basePrice) {\\n          newSellPrice = p.basePrice + Math.max(5, p.markup);\\n        }';


const newLogic = \      // Step 1: Filter MTN down to the strict 29-plan whitelist
      allPlans = allPlans.filter(p => {
        if (p.network.includes('mtn')) {
          const mapKey = \\\\\\\\:\\\\\\\\;
          return !!CUSTOM_MTN_PLANS[mapKey];
        }
        return true;
      });

      // Step 2: Assign global serials, apply duration categories, and process pricing strategy
      allPlans = allPlans.map((p, index) => {
        const mapKey = \\\\\\\\:\\\\\\\\;
        const dur = analyzeDuration(p.name);
        
        let newSellPrice = p.sellPrice;
        let official = null;

        if (p.network.includes('mtn')) {
          // Absolute override for MTN
          newSellPrice = CUSTOM_MTN_PLANS[mapKey].sellPrice;
        } else {
          official = OFFICIAL_PRICES_MAP[mapKey] ?? null;
          
          if (official !== null && official !== undefined) {
            if (p.sellPrice < official) {
              newSellPrice = official;
            } else if (p.sellPrice > official) {
              newSellPrice = official - 5;
            }
          }

          const grossMargin = newSellPrice - p.basePrice;
          if (grossMargin >= 500) { newSellPrice -= 50; }
          else if (grossMargin >= 200) { newSellPrice -= 20; }
          else if (grossMargin >= 100) { newSellPrice -= 10; }
          else if (grossMargin >= 50) { newSellPrice -= 5; }

          if (newSellPrice <= p.basePrice) {
            newSellPrice = p.basePrice + Math.max(5, p.markup);
          }
        }\;

// Quick workaround: replace lines natively
const lines = payflex.split('\\n');
const startIdx = lines.findIndex(l => l.includes('// Assign global serials'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes('return {'));

if (startIdx !== -1 && endIdx !== -1) {
    lines.splice(startIdx, endIdx - startIdx, newLogic);
}

let resultStr = lines.join('\\n');

const objEndOld = \        return {
          ...p,
          serial: index + 1,
          officialPrice: official,
          sellPrice: newSellPrice,
          proxyCost: newSellPrice
        };
      });\;
      
const objEndNew = \        return {
          ...p,
          serial: index + 1,
          officialPrice: official,
          sellPrice: newSellPrice,
          proxyCost: newSellPrice,
          durationCategory: dur.category,
          durationPriority: dur.priority
        };
      });
      // Final sort for allPlans to group by duration
      allPlans.sort((a, b) => {
        if (a.durationPriority !== b.durationPriority) return a.durationPriority - b.durationPriority;
        return a.sellPrice - b.sellPrice;
      });
\;

resultStr = resultStr.replace(objEndOld, objEndNew);
fs.writeFileSync('./src/services/payflex.js', resultStr);
console.log('patched payflex.js');
