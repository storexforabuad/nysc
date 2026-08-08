import { createCanvas } from 'canvas';
import { logger } from '../config/env.js';
import path from 'path';
import fs from 'fs';

export const maskPhoneNumber = (phone) => {
    if (!phone) return '081****XXXX';
    const cleanNumber = phone.replace(/[^0-9]/g, '');

    let localFormat = cleanNumber;
    if (cleanNumber.startsWith('234') && cleanNumber.length === 13) {
        localFormat = '0' + cleanNumber.substring(3);
    }

    return localFormat.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
};

export class ReceiptGenerator {
    static async generate(orderData, storeName = 'Clarion Digital Store') {
        try {
            const width = 1080;
            const height = 1440;
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, '#F8FAFC');
            gradient.addColorStop(1, '#E2E8F0');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);

            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.roundRect(50, 80, width - 100, height - 160, [60]);
            ctx.fill();

            ctx.fillStyle = '#0F172A';
            ctx.font = 'bold 64px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('Clarion A.I. Receipt', 100, 170);

            ctx.fillStyle = '#475569';
            ctx.font = 'bold 34px Arial';
            ctx.fillText(storeName, 100, 220);

            const lineStart = 100;
            let currentY = 300;
            const lineGap = 90;

            const drawRow = (label, value) => {
                ctx.fillStyle = '#94A3B8';
                ctx.font = 'bold 30px Arial';
                ctx.fillText(label, lineStart, currentY);

                ctx.fillStyle = '#0F172A';
                ctx.font = 'bold 40px Arial';
                ctx.fillText(value, lineStart, currentY + 45);
                currentY += lineGap;
            };

            const d = new Date();
            const dateStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

            drawRow('Date', dateStr);
            drawRow('Product', orderData.planName || 'Data Vending');
            drawRow('Proxy Store', storeName);
            drawRow('Client', maskPhoneNumber(orderData.buyerPhone));
            drawRow('Amount', `₦${orderData.amount || 0}`);
            drawRow('Order Ref', orderData.id || `TXN_${Date.now()}`);

            ctx.fillStyle = '#CBD5E1';
            ctx.strokeStyle = '#E2E8F0';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(100, currentY);
            ctx.lineTo(width - 100, currentY);
            ctx.stroke();

            currentY += 70;
            ctx.fillStyle = '#475569';
            ctx.font = '28px Arial';
            ctx.fillText('Thank you for choosing Clarion A.I. Proxy Vending.', 100, currentY);

            ctx.fillStyle = '#94A3B8';
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Powered by Clarion A.I (NYSC SAED Project)', width / 2, height - 90);

            const fileName = `txn_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
            const outPath = path.join(process.cwd(), 'src/media/receipts', fileName);
            const buffer = canvas.toBuffer('image/jpeg');
            fs.writeFileSync(outPath, buffer);

            logger.info(`Generated receipt for ${orderData.id} at ${fileName}`);
            return outPath;
        } catch (err) {
            logger.error(`Receipt generation failed: ${err.message}`);
            return null;
        }
    }
}
export default ReceiptGenerator;
