import { createCanvas } from 'canvas';
import { logger } from '../config/env.js';
import path from 'path';
import fs from 'fs';

// Helper to mask phone numbers
export const maskPhoneNumber = (phone) => {
    if (!phone) return '081****XXXX';
    const cleanNumber = phone.replace(/[^0-9]/g, '');

    // NGR formatting: if 234, get the local format
    let localFormat = cleanNumber;
    if (cleanNumber.startsWith('234') && cleanNumber.length === 13) {
        localFormat = '0' + cleanNumber.substring(3);
    }

    // Mask middle digits: 08123456789 -> 081****6789
    return localFormat.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
};

export class ReceiptGenerator {
    static async generate(orderData, storeName = 'Clarion Digital Store') {
        try {
            const width = 1080;
            const height = 1920;
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            // --- Background ---
            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, '#0f172a'); // Very dark blue/black
            gradient.addColorStop(1, '#020617');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);

            // --- Inner Canvas Ticket Card ---
            const margin = 80;
            const cardY = 300;
            const cardHeight = 1250;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.roundRect(margin, cardY, width - (margin * 2), cardHeight, [40]);
            ctx.fill();

            // --- Header Status ---
            ctx.fillStyle = '#16a34a'; // Vibrant green
            ctx.font = 'bold 70px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Transaction Successful ✅', width / 2, cardY + 140);

            // --- Date ---
            const d = new Date();
            const dateStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}  ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
            ctx.fillStyle = '#64748b';
            ctx.font = '36px Arial';
            ctx.fillText(dateStr, width / 2, cardY + 220);

            // --- Separator ---
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 4;
            ctx.setLineDash([15, 15]);
            ctx.beginPath();
            ctx.moveTo(margin + 50, cardY + 300);
            ctx.lineTo(width - margin - 50, cardY + 300);
            ctx.stroke();

            // --- Main Content ---
            ctx.setLineDash([]);
            ctx.textAlign = 'left';

            const drawRow = (label, value, yPos, isBold = false) => {
                ctx.fillStyle = '#64748b';
                ctx.font = 'bold 45px Arial';
                ctx.fillText(label, margin + 80, yPos);

                ctx.fillStyle = isBold ? '#0f172a' : '#334155';
                ctx.font = isBold ? 'bold 50px Arial' : '50px Arial';
                ctx.textAlign = 'right';
                // Replace any undefined fields proactively
                const safeValue = value ? value.toString() : 'N/A';
                ctx.fillText(safeValue, width - margin - 80, yPos);
                ctx.textAlign = 'left'; // reset
            };

            let currentY = cardY + 440;
            drawRow('Vendor:', storeName, currentY, true); currentY += 130;
            drawRow('Product:', orderData.planName || 'Data Vending', currentY, true); currentY += 130;
            drawRow('Client No:', maskPhoneNumber(orderData.buyerPhone), currentY, true); currentY += 130;
            drawRow('Amount:', `₦${orderData.amount || 0}`, currentY, true); currentY += 130;
            drawRow('Order Ref:', orderData.id || `TXN_${Date.now()}`, currentY, false); currentY += 130;

            // --- Footer Hook ---
            ctx.fillStyle = '#475569';
            ctx.font = 'italic 40px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Thank you for trusting us! 🥂', width / 2, cardY + cardHeight - 120);

            // --- Bottom Watermark ---
            ctx.fillStyle = '#94a3b8';
            ctx.font = 'bold 36px Arial';
            ctx.fillText('Powered by Clarion A.I (NYSC SAED Project)', width / 2, height - 100);

            // Export to File
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
