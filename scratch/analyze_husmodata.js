import fs from 'fs';
import { ACTIVE_APPROVED_PLANS } from '../src/services/payflex.js';

console.log('ACTIVE_APPROVED_PLANS count:', Object.keys(ACTIVE_APPROVED_PLANS).length);
const mtnShare = Object.entries(ACTIVE_APPROVED_PLANS).filter(([k]) => k.startsWith('mtn_data_share'));
const glo = Object.entries(ACTIVE_APPROVED_PLANS).filter(([k]) => k.startsWith('glo_data'));
const mtnGift = Object.entries(ACTIVE_APPROVED_PLANS).filter(([k]) => k.startsWith('mtn_gifting_data'));

console.log('mtn_data_share count:', mtnShare.length);
console.log('glo_data count:', glo.length);
console.log('Pilot (mtn_share + glo) count:', mtnShare.length + glo.length);
console.log('mtn_gifting_data count:', mtnGift.length);

