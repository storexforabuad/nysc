import { logger } from '../config/env.js';

export const NETWORK_PREFIXES = {
    mtn: ['0803', '0806', '0810', '0813', '0814', '0816', '0703', '0706', '0903', '0906', '0913', '0916'],
    airtel: ['0802', '0808', '0812', '0701', '0708', '0901', '0902', '0904', '0907', '0912'],
    glo: ['0805', '0807', '0811', '0815', '0705', '0905', '0915'],
    '9mobile': ['0809', '0817', '0818', '0908', '0909']
};

export const detectNetwork = (from) => {
    if (!from) return null;
    const cleanNumber = from.split('@')[0].replace(/\D/g, '');
    let normalized = cleanNumber;
    if (cleanNumber.startsWith('234')) {
        normalized = '0' + cleanNumber.substring(3);
    } else if (!cleanNumber.startsWith('0')) {
        normalized = '0' + cleanNumber;
    }

    const prefix = normalized.substring(0, 4);
    for (const [network, prefixes] of Object.entries(NETWORK_PREFIXES)) {
        if (prefixes.includes(prefix)) return network;
    }
    return null;
};
