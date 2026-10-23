/**
 * Helper to match user-typed bank names against Nigerian bank list
 */
const BANK_ALIASES = {
    'gtb': ['guaranty trust', 'gtbank', 'gt bank', '058'],
    'gtbank': ['guaranty trust', 'gtb', 'gt bank', '058'],
    'access': ['access bank', 'access bank diamond', 'access/diamond', '044'],
    'diamond': ['access bank', '044'],
    'zenith': ['zenith bank', '057'],
    'firstbank': ['first bank of nigeria', 'first bank', 'fbn', '011'],
    'first bank': ['first bank of nigeria', 'firstbank', 'fbn', '011'],
    'uba': ['united bank for africa', 'uba', '033'],
    'kuda': ['kuda microfinance bank', 'kuda bank', '50211'],
    'opay': ['opay', 'paycom', '999992'],
    'palmpay': ['palmpay', 'palm pay', '999991'],
    'palm pay': ['palmpay', 'palm pay', '999991'],
    'moniepoint': ['moniepoint', 'moniepoint mfb', '50515'],
    'wema': ['wema bank', 'alat', '035'],
    'alat': ['wema bank', 'alat', '035'],
    'stanbic': ['stanbic ibtc', 'stanbic ibtc bank', '221'],
    'sterling': ['sterling bank', '232'],
    'union': ['union bank of nigeria', 'union bank', '032'],
    'fcmb': ['first city monument bank', 'fcmb', '214'],
    'fidelity': ['fidelity bank', '070'],
    'polaris': ['polaris bank', 'skye', '076'],
    'keystone': ['keystone bank', '082'],
    'jaiz': ['jaiz bank', '301'],
    'taj': ['taj bank', '302'],
    'ecobank': ['ecobank nigeria', 'ecobank', '050'],
    'providus': ['providus bank', '101']
};

export function matchBank(banks, input) {
    if (!input || !Array.isArray(banks)) return null;
    const cleanInput = input.toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Direct exact or code match
    for (const b of banks) {
        const cleanName = b.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanName === cleanInput || b.code === cleanInput) {
            return b;
        }
    }

    // 2. Alias match
    for (const [key, aliases] of Object.entries(BANK_ALIASES)) {
        const cleanKey = key.replace(/[^a-z0-9]/g, '');
        if (cleanInput === cleanKey || cleanInput.includes(cleanKey)) {
            for (const alias of aliases) {
                const cleanAlias = alias.replace(/[^a-z0-9]/g, '');
                const found = banks.find(b => {
                    const norm = b.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                    return norm.includes(cleanAlias) || cleanAlias.includes(norm);
                });
                if (found) return found;
            }
        }
    }

    // 3. Substring match
    return banks.find(b => {
        const norm = b.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return norm.includes(cleanInput) || cleanInput.includes(norm);
    }) || null;
}
