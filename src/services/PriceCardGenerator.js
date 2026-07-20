import { createCanvas } from 'canvas';
import { logger } from '../config/env.js';
import path from 'path';
import fs from 'fs';

export class PriceCardGenerator {

    /**
     * Build '10 Best' Cards for all 4 networks and store them locally.
     * @param {Array} allPlans - Raw plans from payflex payload
     * @returns {Array} - Array of saved file paths
     */
    static async generateWeeklyCards(allPlans) {
        if (!allPlans || allPlans.length === 0) return [];

        const networks = ['mtn', 'airtel', 'glo', '9mobile'];
        const savedPaths = [];

        for (const net of networks) {
            // 1) Filter plans belonging to this network natively
            const netPlans = allPlans.filter(p => {
                if (net === 'mtn') return p.network.includes('mtn');
                return p.network.includes(net);
            });

            if (netPlans.length === 0) continue;

            // 2) Select top 10 best values
            // Currently sorting strictly by price to get the most affordable fast-selling options
            const sorted = netPlans.sort((a, b) => a.sellPrice - b.sellPrice).slice(0, 10);

            // 3) Draw and Save
            const cardPath = await this._drawNetworkCard(net, sorted);
            if (cardPath) {
                savedPaths.push(cardPath);
            }
        }
        return savedPaths;
    }

    static async _drawNetworkCard(networkName, plans) {
        try {
            const width = 1080;
            const height = 1920;
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            // --- Theme Selection ---
            let bgConfig = { top: '#0f172a', bottom: '#020617', name: networkName.toUpperCase() };
            if (networkName === 'mtn') bgConfig = { top: '#423d06', bottom: '#000000', name: 'MTN' };
            if (networkName === 'airtel') bgConfig = { top: '#4a0714', bottom: '#000000', name: 'AIRTEL' };
            if (networkName === 'glo') bgConfig = { top: '#064215', bottom: '#000000', name: 'GLO' };
            if (networkName === '9mobile') bgConfig = { top: '#073322', bottom: '#000000', name: '9MOBILE' };

            // --- Background Gradient ---
            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, bgConfig.top);
            gradient.addColorStop(1, bgConfig.bottom);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);

            // --- Badges & Ribbons ---
            // Draw a quick vector "5G" badge top right (mocking ribbon)
            ctx.fillStyle = '#fbbf24'; // Yellow ribbon
            ctx.beginPath();
            ctx.moveTo(900, 0);
            ctx.lineTo(1080, 0);
            ctx.lineTo(1080, 180);
            ctx.lineTo(900, 0);
            ctx.fill();

            ctx.save();
            ctx.translate(1010, 70);
            ctx.rotate(Math.PI / 4);
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 36px Arial';
            ctx.fillText('5G ✨', 0, 0);
            ctx.restore();

            // --- Headers ---
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 80px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`10 Best ${bgConfig.name} Data`, width / 2, 200);

            ctx.fillStyle = '#94a3b8';
            ctx.font = 'bold 45px Arial';
            ctx.fillText('INSTANT • RELIABLE • AFFORDABLE', width / 2, 280);

            // --- Body Box (The 10 Plans) ---
            const margin = 80;
            let currentY = 400;

            const boxHeight = 110;
            const boxSpacing = 30;

            plans.forEach(plan => {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.beginPath();
                ctx.roundRect(margin, currentY, width - (margin * 2), boxHeight, [20]);
                ctx.fill();

                // Draw Text
                ctx.textAlign = 'left';
                ctx.fillStyle = '#f8fafc';
                ctx.font = 'bold 45px Arial';
                // truncate plan name slightly if too long
                const pName = plan.name.length > 25 ? plan.name.substring(0, 25) + '...' : plan.name;
                ctx.fillText(pName, margin + 40, currentY + 70);

                ctx.textAlign = 'right';
                // Show Official Price crossed out (Optional design touch)
                if (plan.officialPrice && plan.officialPrice > plan.sellPrice) {
                    ctx.fillStyle = '#ef4444'; // Red crossed out
                    ctx.font = '30px Arial';
                    const offPText = `₦${plan.officialPrice}`;
                    ctx.fillText(offPText, width - margin - 220, currentY + 70);
                    // strikethrough
                    const strikeWx = ctx.measureText(offPText).width;
                    ctx.beginPath();
                    ctx.moveTo(width - margin - 220 - strikeWx, currentY + 60);
                    ctx.lineTo(width - margin - 220, currentY + 60);
                    ctx.strokeStyle = '#ef4444';
                    ctx.lineWidth = 3;
                    ctx.stroke();
                }

                // Final Sell Price
                ctx.fillStyle = '#4ade80'; // Bright Green
                ctx.font = 'bold 54px Arial';
                ctx.fillText(`₦${plan.sellPrice}`, width - margin - 40, currentY + 75);

                currentY += boxHeight + boxSpacing;
            });

            // --- Bottom Instruction ---
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 50px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`Reply DATA to buy instantly 🚀`, width / 2, currentY + 100);

            // Export to File
            const fileName = `${networkName}_best10.jpg`;
            const outPath = path.join(process.cwd(), 'src/media/price_cards', fileName);
            const buffer = canvas.toBuffer('image/jpeg');
            fs.writeFileSync(outPath, buffer);

            logger.info(`Generated 10-Best Card for ${networkName} at ${fileName}`);
            return outPath;

        } catch (err) {
            logger.error(`Generation failed for ${networkName} card: ${err.message}`);
            return null;
        }
    }
}
export default PriceCardGenerator;
