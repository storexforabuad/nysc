import { createCanvas } from 'canvas';
import { logger } from '../config/env.js';
import path from 'path';
import fs from 'fs';

const COLOR_MAP = {
  mtn: { top: '#F6E05E', bottom: '#F59E0B', accent: '#0F172A', name: 'MTN' },
  airtel: { top: '#FEE2E2', bottom: '#EF4444', accent: '#111827', name: 'AIRTEL' },
  glo: { top: '#D8FAE5', bottom: '#22C55E', accent: '#0F172A', name: 'GLO' },
  '9mobile': { top: '#DBEAFE', bottom: '#2563EB', accent: '#0F172A', name: '9MOBILE' }
};

const parseQuantity = (text) => {
  if (!text) return { label: 'OTHER', value: Number.MAX_VALUE };
  const normalized = text.toString().toLowerCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)(?:\s*)(gb|mb|tb)/i);
  if (match) {
    const quantity = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    let value = quantity;
    if (unit === 'mb') value /= 1024;
    if (unit === 'tb') value *= 1024;
    return { label: `${quantity}${unit.toUpperCase()}`, value };
  }
  const fallbackMatch = normalized.match(/(\d+(?:\.\d+)?)/);
  if (fallbackMatch) {
    return { label: `${fallbackMatch[1]}GB`, value: parseFloat(fallbackMatch[1]) };
  }
  return { label: 'OTHER', value: Number.MAX_VALUE };
};

// Contrast helper: choose readable text color (dark or light) for a given hex background
function hexToRgb(hex) {
    const cleaned = hex.replace('#', '');
    const full = cleaned.length === 3 ? cleaned.split('').map(c => c + c).join('') : cleaned;
    const intVal = parseInt(full, 16);
    return { r: (intVal >> 16) & 255, g: (intVal >> 8) & 255, b: intVal & 255 };
}

function relativeLuminance(r, g, b) {
    const srgb = [r, g, b].map(v => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function chooseContrastColor(hex) {
    try {
        const { r, g, b } = hexToRgb(hex);
        const lum = relativeLuminance(r, g, b);
        return lum > 0.5 ? '#0F172A' : '#FFFFFF';
    } catch (e) {
        return '#FFFFFF';
    }
}

export class PriceCardGenerator {
    static async generateWeeklyCards(allPlans) {
        if (!allPlans || allPlans.length === 0) return [];

        const networks = ['mtn', 'airtel', 'glo', '9mobile'];
        const savedPaths = [];

        for (const net of networks) {
            const netPlans = allPlans.filter(p => {
                if (net === 'mtn') return p.network?.toLowerCase().includes('mtn');
                return p.network?.toLowerCase().includes(net);
            });

            if (netPlans.length === 0) continue;

            const cheapestBySize = new Map();
            for (const plan of netPlans) {
                const quantity = this._normalizePlanSize(plan);
                const existing = cheapestBySize.get(quantity.label);
                if (!existing || plan.sellPrice < existing.sellPrice) {
                    cheapestBySize.set(quantity.label, plan);
                }
            }

            const uniquePlans = Array.from(cheapestBySize.values())
                .map(plan => ({ plan, quantity: this._normalizePlanSize(plan) }))
                .sort((a, b) => a.quantity.value - b.quantity.value)
                .slice(0, 6)
                .map(item => item.plan);

            const cardPath = await this._drawNetworkCard(net, uniquePlans);
            if (cardPath) savedPaths.push(cardPath);
        }

        return savedPaths;
    }

    static _normalizePlanSize(plan) {
        const text = `${plan.name || ''} ${plan.description || ''}`;
        return parseQuantity(text);
    }

    static async _drawNetworkCard(networkName, plans) {
        try {
            const width = 1080;
            const height = 1440;
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            const config = COLOR_MAP[networkName] || { top: '#0F172A', bottom: '#111827', accent: '#FFFFFF', name: networkName.toUpperCase() };

            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, config.top);
            gradient.addColorStop(1, config.bottom);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);

            const softPanelY = 140;
            ctx.fillStyle = 'rgba(255,255,255,0.14)';
            ctx.beginPath();
            ctx.roundRect(60, softPanelY, width - 120, 240, [50]);
            ctx.fill();

            // 5G Badge: prefer explicit badge token, then bottom, then top; ensures network-specific color
            const badgeBg = config.badge || config.bottom || config.top || '#FBBF24';
            const badgeText = chooseContrastColor(badgeBg);
            ctx.fillStyle = badgeBg;
            ctx.beginPath();
            ctx.ellipse(width / 2, 220, 140, 140, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = badgeText;
            ctx.font = 'bold 72px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('5G', width / 2, 245);

            // Heading: Clarion A.I [NETWORK] Data
            ctx.fillStyle = '#111827';
            ctx.font = 'bold 60px Arial';
            ctx.fillText(`Clarion A.I ${config.name} Data`, width / 2, 420);

            ctx.fillStyle = '#475569';
            ctx.font = 'bold 32px Arial';
            ctx.fillText('Fast • Reliable • Affordable', width / 2, 470);

            const cardStartY = 520;
            const rowHeight = 100;
            const rowGap = 24;
            const boxWidth = width - 120;
            const maxRows = 6;

            plans.forEach((plan, index) => {
                const y = cardStartY + index * (rowHeight + rowGap);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.beginPath();
                ctx.roundRect(60, y, boxWidth, rowHeight, [30]);
                ctx.fill();

                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 36px Arial';
                ctx.textAlign = 'left';
                const planLabel = this._normalizePlanSize(plan).label || plan.name;
                ctx.fillText(planLabel, 100, y + 55);

                ctx.fillStyle = '#111827';
                ctx.font = 'bold 46px Arial';
                ctx.textAlign = 'right';
                ctx.fillText(`₦${plan.sellPrice}`, width - 100, y + 60);
            });

            // Dynamic spacing: position CTA and footer relative to last plan row to avoid overlap.
            // Use text metrics where possible to ensure adequate separation.
            const lastIndex = Math.max(0, plans.length - 1);
            const lastRowY = cardStartY + lastIndex * (rowHeight + rowGap);
            const lastRowBottom = plans.length > 0 ? lastRowY + rowHeight : (cardStartY - rowGap);

            // CTA measurements
            const ctaText = 'Reply DATA to buy instantly';
            ctx.font = 'bold 42px Arial';
            const ctaMetrics = (ctx.measureText && ctx.measureText(ctaText)) || {};
            const ctaAscent = ctaMetrics.actualBoundingBoxAscent || 34;
            const ctaDescent = ctaMetrics.actualBoundingBoxDescent || 8;
            const ctaHeight = ctaAscent + ctaDescent;

            // Footer measurements
            const footerText = 'Powered by Clarion A.I (NYSC SAED Project)';
            ctx.font = '28px Arial';
            const footerMetrics = (ctx.measureText && ctx.measureText(footerText)) || {};
            const footerAscent = footerMetrics.actualBoundingBoxAscent || 18;
            const footerDescent = footerMetrics.actualBoundingBoxDescent || 6;
            const footerHeight = footerAscent + footerDescent;

            // Desired spacing: at least 40px gap after last row, and at least 24px between CTA and footer
            const minGapAfterRows = 40;
            const minGapBetweenCtaAndFooter = 24;

            // Compute baseline Y positions (baseline is approximately ascent from top)
            const tentativeCtaTop = lastRowBottom + minGapAfterRows;
            // Baseline y = top + ascent
            let ctaY = Math.min(height - 140, tentativeCtaTop + ctaAscent);

            // Ensure footer is sufficiently below CTA
            let footerY = ctaY + (ctaDescent + minGapBetweenCtaAndFooter + footerAscent + 4);
            // Clamp footer to not go off-canvas
            if (footerY > height - 40) {
                footerY = height - 40;
                // if footer clamped, move CTA up if it would overlap
                const maxCtaY = footerY - (footerAscent + minGapBetweenCtaAndFooter + ctaDescent);
                if (ctaY > maxCtaY) ctaY = maxCtaY;
            }

            // Draw CTA
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 42px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(ctaText, width / 2, ctaY);

            // Draw footer
            ctx.fillStyle = '#CBD5E1';
            ctx.font = '28px Arial';
            ctx.fillText(footerText, width / 2, footerY);

            const fileName = `${networkName}_best10_${Date.now()}.jpg`;
            const outPath = path.join(process.cwd(), 'src/media/price_cards', fileName);
            logger.info(`Price card generation: network=${networkName} badgeBg=${badgeBg} heading="Clarion A.I ${config.name} Data" output=${fileName}`);
            const buffer = canvas.toBuffer('image/jpeg');
            fs.writeFileSync(outPath, buffer);

            logger.info(`Generated Clarion card for ${networkName} at ${fileName}`);
            return outPath;
        } catch (err) {
            logger.error(`Generation failed for ${networkName} card: ${err.message}`);
            return null;
        }
    }
}

export default PriceCardGenerator;
