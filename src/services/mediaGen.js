import { createCanvas, registerFont } from 'canvas';
import { logger } from '../config/env.js';
import { getImpactLevel } from './WalletService.js';

/**
 * Renders the signature Clarion A.I. bugle emblem with reddish/orange WiFi signal waves.
 */
function drawClarionBugleEmblem(ctx, cx, cy, scale = 1.0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // Outer gold circular badge
  ctx.fillStyle = '#FFFDF5';
  ctx.beginPath();
  ctx.arc(0, 0, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#C8A951';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Bugle Horn body (Forest Green & Gold)
  ctx.fillStyle = '#1E5622';
  ctx.strokeStyle = '#1E5622';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Mouthpiece and tubing
  ctx.beginPath();
  ctx.moveTo(-22, 6);
  ctx.lineTo(-8, 6);
  ctx.bezierCurveTo(-2, 6, 2, -6, 12, -4);
  ctx.stroke();

  // Bell flare
  ctx.beginPath();
  ctx.moveTo(12, -9);
  ctx.lineTo(24, -18);
  ctx.lineTo(24, 8);
  ctx.lineTo(12, 0);
  ctx.closePath();
  ctx.fill();

  // Bell gold rim
  ctx.strokeStyle = '#C8A951';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(24, -5, 3, 13, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Reddish-Orange WiFi / Broadcast waves emanating from the horn bell
  ctx.lineCap = 'round';

  // Wave 1 (inner)
  ctx.strokeStyle = '#FF5722';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(24, -5, 12, -Math.PI * 0.32, Math.PI * 0.32);
  ctx.stroke();

  // Wave 2 (middle)
  ctx.strokeStyle = '#FF7043';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(24, -5, 21, -Math.PI * 0.32, Math.PI * 0.32);
  ctx.stroke();

  // Wave 3 (outer)
  ctx.strokeStyle = '#F4511E';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(24, -5, 30, -Math.PI * 0.32, Math.PI * 0.32);
  ctx.stroke();

  ctx.restore();
}

class MediaGenerator {
  constructor() {}

  async generatePromoImage(coMemberName) {
    try {
      const width = 1080;
      const height = 1440;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // Background - Warm Cream
      ctx.fillStyle = '#F7F3E8';
      ctx.fillRect(0, 0, width, height);

      // Top Banner - Forest Green
      ctx.fillStyle = '#1E5622';
      ctx.fillRect(0, 0, width, 240);

      // Emblem with WiFi waves
      drawClarionBugleEmblem(ctx, 100, 120, 1.4);

      ctx.fillStyle = '#C8A951';
      ctx.font = 'bold 32px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('CLARION A.I. • NYSC SAED', 190, 95);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 56px Arial';
      ctx.fillText('SUBSIDIZED DATA & AIRTIME', 190, 160);

      // Pricing Card Container
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(80, 290, 920, 780, 24);
      ctx.fill();
      ctx.strokeStyle = '#C8A951';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Table Headers
      ctx.fillStyle = '#FF5722'; // Clarion Orange
      ctx.font = 'bold 44px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Data Plan', 140, 380);
      ctx.textAlign = 'center';
      ctx.fillText('Market Rate', 540, 380);
      ctx.textAlign = 'right';
      ctx.fillText('Partner Rate', 940, 380);

      const rows = [
        { size: '1GB SME', std: '₦500', our: '₦260' },
        { size: '2GB SME', std: '₦1,000', our: '₦520' },
        { size: '3GB SME', std: '₦1,500', our: '₦780' },
        { size: '5GB SME', std: '₦2,500', our: '₦1,300' },
        { size: '10GB SME', std: '₦5,000', our: '₦2,600' }
      ];

      ctx.fillStyle = '#2B2B2B';
      ctx.font = 'bold 40px Arial';
      rows.forEach((row, i) => {
        const y = 470 + (i * 110);
        ctx.textAlign = 'left';
        ctx.fillText(row.size, 140, y);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#888888';
        ctx.fillText(row.std, 540, y);
        ctx.fillStyle = '#1E5622';
        ctx.textAlign = 'right';
        ctx.fillText(row.our, 940, y);
        ctx.fillStyle = '#2B2B2B';

        ctx.strokeStyle = '#EFE8D8';
        ctx.beginPath();
        ctx.moveTo(130, y + 35);
        ctx.lineTo(950, y + 35);
        ctx.stroke();
      });

      // Footer
      ctx.fillStyle = '#1E5622';
      ctx.font = 'bold 36px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`Verified Storefront of: ${coMemberName}`, width / 2, 1150);

      ctx.fillStyle = '#FF5722';
      ctx.font = 'bold 48px Arial';
      ctx.fillText('TEXT "DATA" ON WHATSAPP TO BUY', width / 2, 1240);

      ctx.fillStyle = '#666666';
      ctx.font = '24px Arial';
      ctx.fillText('Instant automated dispatch • MTN, Airtel, Glo & 9mobile', width / 2, 1310);

      logger.info(`Generated promo image for ${coMemberName}`);
      return canvas.toBuffer('image/png');
    } catch (error) {
      logger.error('Error generating promo image:', error);
      throw error;
    }
  }

  /**
   * Generates a Clarion Brand Franchise Profile ID Card with Community Impact Odometer.
   */
  async generateProfileCard(userData) {
    try {
      const width = 1080;
      const height = 1420;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      const name = (userData.verifiedName || userData.name || 'CORPS MEMBER').toUpperCase();
      const stateCode = (userData.stateCode || 'NY/XX/0000').toUpperCase();
      const tier = (userData.donationTier || 'MEMBER').toUpperCase();
      const rankBadge = userData.rankBadge || (tier === 'PIONEER' ? 'LORD' : tier);
      const bank = userData.bankDetails?.bankName || 'Verified Bank';
      const acctNum = userData.bankDetails?.accountNumber || '0000000000';
      const virtualAcct = userData.virtualAccount || { bankName: 'HabariPay (GTCO)', accountNumber: '0123456789' };
      const totalCds = Number(userData.totalCdsDonated) || 0;
      const impact = getImpactLevel(totalCds);

      // Background: Warm Cream gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#F7F3E8');
      bgGrad.addColorStop(1, '#FFFDF8');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Outer Gold Border Frame
      ctx.strokeStyle = '#C8A951';
      ctx.lineWidth = 8;
      ctx.strokeRect(28, 28, width - 56, height - 56);

      // Inner Card Frame
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(50, 50, width - 100, height - 100, 24);
      ctx.fill();
      ctx.strokeStyle = '#E0D8C3';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Top Header Banner (Forest Green)
      ctx.fillStyle = '#1E5622';
      ctx.beginPath();
      ctx.roundRect(70, 70, width - 140, 170, 18);
      ctx.fill();

      // Bugle Horn with Reddish-Orange WiFi waves
      drawClarionBugleEmblem(ctx, 150, 155, 1.4);

      // Header Text
      ctx.fillStyle = '#C8A951';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('CLARION A.I. • NYSC SAED ENTERPRISE', 240, 125);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 40px Arial';
      ctx.fillText('FRANCHISE PARTNER LICENSE', 240, 185);

      // Rank Badge (top right inside banner)
      const badgeBg = tier === 'PIONEER' ? '#C8A951' : rankBadge === 'LORD' ? '#7C3AED' : rankBadge === 'MASTER' ? '#2563EB' : '#1E5622';
      ctx.fillStyle = badgeBg;
      ctx.beginPath();
      ctx.roundRect(width - 340, 115, 230, 60, 12);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      const badgeLabel = tier === 'PIONEER' ? '🏆 PIONEER' : `👑 ${rankBadge}`;
      ctx.fillText(badgeLabel, width - 225, 153);

      // Section 1: Partner Identity Card
      ctx.fillStyle = '#F9F7F1';
      ctx.beginPath();
      ctx.roundRect(70, 260, width - 140, 270, 18);
      ctx.fill();
      ctx.strokeStyle = '#E2DBC8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#7A7A7A';
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('VERIFIED FRANCHISE OPERATOR', 110, 305);

      ctx.fillStyle = '#1E5622';
      ctx.font = 'bold 42px Arial';
      ctx.fillText(name.length > 25 ? name.substring(0, 25) + '...' : name, 110, 360);

      ctx.fillStyle = '#555555';
      ctx.font = 'bold 20px Arial';
      ctx.fillText('STATE CODE:', 110, 420);
      ctx.fillStyle = '#1E5622';
      ctx.font = 'bold 30px Arial';
      ctx.fillText(stateCode, 260, 422);

      ctx.fillStyle = '#555555';
      ctx.font = 'bold 20px Arial';
      ctx.fillText('CASH-OUT BANK:', 110, 475);
      ctx.fillStyle = '#2B2B2B';
      ctx.font = 'bold 22px Arial';
      const maskedAcct = acctNum.length > 6 ? `${acctNum.substring(0, 3)}****${acctNum.substring(acctNum.length - 3)}` : '000****000';
      ctx.fillText(`${bank} (${maskedAcct})`, 300, 476);

      // Section 2: Dedicated Virtual Collection Account
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(70, 550, width - 140, 280, 18);
      ctx.fill();
      ctx.strokeStyle = '#C8A951';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = '#1E5622';
      ctx.font = 'bold 20px Arial';
      ctx.fillText('DEDICATED STORE COLLECTION ACCOUNT (AUTOMATED)', 110, 595);

      ctx.fillStyle = '#666666';
      ctx.font = '20px Arial';
      ctx.fillText('Bank Provider:', 110, 645);
      ctx.fillStyle = '#2B2B2B';
      ctx.font = 'bold 26px Arial';
      ctx.fillText(virtualAcct.bankName || 'HabariPay (GTCO)', 280, 645);

      ctx.fillStyle = '#666666';
      ctx.font = '20px Arial';
      ctx.fillText('Account Number:', 110, 710);
      ctx.fillStyle = '#FF5722'; // Orange highlight
      ctx.font = 'bold 44px Arial';
      ctx.fillText(virtualAcct.accountNumber || '0123456789', 280, 712);

      ctx.fillStyle = '#666666';
      ctx.font = '20px Arial';
      ctx.fillText('Account Name:', 110, 768);
      ctx.fillStyle = '#1E5622';
      ctx.font = 'bold 24px Arial';
      ctx.fillText(`Clarion - ${name.substring(0, 26)}`, 280, 768);

      ctx.fillStyle = '#777777';
      ctx.font = 'italic 18px Arial';
      ctx.fillText('⚡ Customers who transfer here receive instant automated data 24/7.', 110, 810);

      // Section 3: Community Impact Odometer
      ctx.fillStyle = '#F3EFE3';
      ctx.beginPath();
      ctx.roundRect(70, 850, width - 140, 270, 18);
      ctx.fill();
      ctx.strokeStyle = '#1E5622';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Header row with Icon
      ctx.fillStyle = '#1E5622';
      ctx.font = 'bold 22px Arial';
      ctx.fillText('NYSC COMMUNITY IMPACT ODOMETER (CDS)', 110, 895);

      const milestoneTitle = impact.current ? `${impact.current.badge} ${impact.current.title}` : '🌱 Community Contributor';
      ctx.fillStyle = '#2B2B2B';
      ctx.font = 'bold 32px Arial';
      ctx.fillText(milestoneTitle, 110, 945);

      ctx.fillStyle = '#FF5722';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(`₦${totalCds.toLocaleString()} Donated`, width - 110, 945);
      ctx.textAlign = 'left';

      // Progress Bar
      const barX = 110;
      const barY = 980;
      const barW = width - 220;
      const barH = 26;

      ctx.fillStyle = '#DDD5BF';
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, 13);
      ctx.fill();

      // Filled Portion
      const fillW = Math.max(16, (barW * impact.percentage) / 100);
      const progGrad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
      progGrad.addColorStop(0, '#2E7D32');
      progGrad.addColorStop(1, '#4CAF50');
      ctx.fillStyle = progGrad;
      ctx.beginPath();
      ctx.roundRect(barX, barY, fillW, barH, 13);
      ctx.fill();

      // Next Target Label
      ctx.fillStyle = '#555555';
      ctx.font = 'bold 18px Arial';
      if (impact.next) {
        ctx.fillText(`${impact.percentage}% complete`, 110, 1045);
        ctx.textAlign = 'right';
        ctx.fillText(`Next: ${impact.next.badge} ${impact.next.title} (₦${impact.next.threshold.toLocaleString()})`, width - 110, 1045);
        ctx.textAlign = 'left';
      } else {
        ctx.fillText('💎 Maximum NYSC Hero of Service Impact Achieved!', 110, 1045);
      }

      ctx.fillStyle = '#777777';
      ctx.font = 'italic 16px Arial';
      const donateRate = tier === 'LORD' ? '64%' : tier === 'MASTER' ? '40%' : '16%';
      ctx.fillText(`• ${donateRate} of your vendor profits automatically pool into the NYSC community development project.`, 110, 1085);

      // Security Footer Banner
      ctx.fillStyle = '#1E5622';
      ctx.beginPath();
      ctx.roundRect(70, 1140, width - 140, 150, 16);
      ctx.fill();

      ctx.fillStyle = '#C8A951';
      ctx.font = 'bold 22px Arial';
      ctx.fillText('VERIFIED CLARION ENTERPRISE INFRASTRUCTURE', 110, 1185);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '18px Arial';
      ctx.fillText('• 24/7 Automated Top-up Service • Backed by Squad HabariPay Banking Rails', 110, 1225);
      ctx.fillText('• Official NYSC SAED Community Philanthropy Protocol', 110, 1255);

      // Bottom Stamp
      ctx.fillStyle = '#888888';
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`CLARION PROTOCOL v3.0  |  ISSUED: ${new Date().toLocaleDateString('en-GB')}  |  UID: ${userData.uid || 'NYSC-CORP'}`, width / 2, 1335);

      logger.info(`Generated franchise profile card for ${name}`);
      return canvas.toBuffer('image/png');
    } catch (error) {
      logger.error('Error generating profile card:', error);
      throw error;
    }
  }

  /**
   * Generates a viral 1080x1080 square Share Card for WhatsApp Status / Instagram with Clarion brand palette.
   */
  async generateShareCard(userData) {
    try {
      const width = 1080;
      const height = 1080;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      const name = (userData.verifiedName || userData.name || 'NYSC CORPS MEMBER').toUpperCase();
      const phone = userData.phone || userData.phoneNumber || '';
      const formattedPhone = phone.startsWith('234') ? '0' + phone.substring(3) : phone;

      // Background: Warm Cream gradient with soft radial glow
      const bg = ctx.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, '#F9F6EE');
      bg.addColorStop(1, '#EFE8D8');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // Gold & Green Outer Border
      ctx.strokeStyle = '#C8A951';
      ctx.lineWidth = 10;
      ctx.strokeRect(30, 30, width - 60, height - 60);

      // Inner white card
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(55, 55, width - 110, height - 110, 30);
      ctx.fill();
      ctx.strokeStyle = '#E0D8C3';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Top Header (Forest Green)
      ctx.fillStyle = '#1E5622';
      ctx.beginPath();
      ctx.roundRect(80, 80, width - 160, 160, 20);
      ctx.fill();

      // Bugle Emblem with Reddish-Orange WiFi waves!
      drawClarionBugleEmblem(ctx, 160, 160, 1.45);

      ctx.fillStyle = '#C8A951';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('CLARION A.I. • NYSC SAED', 250, 135);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 44px Arial';
      ctx.fillText('CHEAPEST 24/7 DATA HUB', 250, 195);

      // Storefront Owner Callout
      ctx.fillStyle = '#777777';
      ctx.font = 'bold 20px Arial';
      ctx.fillText('OFFICIAL DIGITAL STOREFRONT OF:', 100, 290);

      ctx.fillStyle = '#1E5622';
      ctx.font = 'bold 46px Arial';
      ctx.fillText(name.length > 24 ? name.substring(0, 24) + '...' : name, 100, 350);

      // Telco Pills (MTN, Airtel, Glo, 9mobile)
      const networks = [
        { name: 'MTN', color: '#FFCC00', text: '#000000' },
        { name: 'AIRTEL', color: '#ED1C24', text: '#FFFFFF' },
        { name: 'GLO', color: '#008234', text: '#FFFFFF' },
        { name: '9MOBILE', color: '#004F32', text: '#FFFFFF' }
      ];

      const pillW = 195;
      const pillH = 65;
      const startX = 100;
      const pillY = 385;

      networks.forEach((net, idx) => {
        const px = startX + idx * (pillW + 25);
        ctx.fillStyle = net.color;
        ctx.beginPath();
        ctx.roundRect(px, pillY, pillW, pillH, 12);
        ctx.fill();

        ctx.fillStyle = net.text;
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(net.name, px + pillW / 2, pillY + 42);
      });

      // Price Callout Box
      ctx.textAlign = 'left';
      ctx.fillStyle = '#FDF9F0';
      ctx.beginPath();
      ctx.roundRect(100, 480, width - 200, 260, 20);
      ctx.fill();
      ctx.strokeStyle = '#C8A951';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = '#1E5622';
      ctx.font = 'bold 30px Arial';
      ctx.fillText('⚡ Instant Automated Delivery', 140, 535);

      ctx.fillStyle = '#555555';
      ctx.font = '24px Arial';
      ctx.fillText('• 1GB from ₦260  |  2GB from ₦520', 140, 585);
      ctx.fillText('• 3GB from ₦780  |  5GB from ₦1,300', 140, 630);
      ctx.fillText('• Airtime & Exam Scratch Cards available 24/7', 140, 675);

      ctx.fillStyle = '#FF5722';
      ctx.font = 'bold 22px Arial';
      ctx.fillText('✓ Never runs out of stock  ✓ Instant automated top-up', 140, 715);

      // WhatsApp CTA Box (Forest Green with Gold border)
      ctx.fillStyle = '#1E5622';
      ctx.beginPath();
      ctx.roundRect(100, 770, width - 200, 180, 20);
      ctx.fill();
      ctx.strokeStyle = '#C8A951';
      ctx.lineWidth = 3;
      ctx.stroke();

      const isSame = !!userData.isSameNumber;
      ctx.fillStyle = '#C8A951';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';

      if (isSame) {
        ctx.fillText('REPLY DIRECTLY TO MY STATUS OR CHAT:', width / 2, 815);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 44px Arial';
        ctx.fillText('Reply with "DATA" right here!', width / 2, 875);
        ctx.fillStyle = '#81C784';
        ctx.font = 'bold 22px Arial';
        ctx.fillText('Automated AI bot replies and delivers in under 30 seconds!', width / 2, 920);
      } else {
        ctx.fillText('TAP LINK OR SEND WHATSAPP MESSAGE TO ORDER:', width / 2, 815);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 44px Arial';
        ctx.fillText(`Text "DATA" to ${formattedPhone || 'this number'}`, width / 2, 875);
        ctx.fillStyle = '#81C784';
        ctx.font = 'bold 22px Arial';
        ctx.fillText('Automated AI bot replies and delivers in under 30 seconds!', width / 2, 920);
      }

      // Bottom Footer
      ctx.fillStyle = '#888888';
      ctx.font = 'bold 18px Arial';
      ctx.fillText('POWERED BY CLARION A.I. • EMPOWERING NYSC CORPS MEMBERS NATIONWIDE', width / 2, 995);

      logger.info(`Generated share card for ${name}`);
      return canvas.toBuffer('image/png');
    } catch (error) {
      logger.error('Error generating share card:', error);
      throw error;
    }
  }

  /**
   * Generates a custom Launch Giveaway Promo Card when a partner funds their wallet.
   * Tailored dynamically for same-number vs separate-number messaging.
   */
  async generateGiveawayPromoCard(userData, fundedAmount = 1000) {
    try {
      const width = 1080;
      const height = 1080;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      const name = (userData.verifiedName || userData.name || 'NYSC CORPS MEMBER').toUpperCase();
      const phone = userData.phone || userData.phoneNumber || '';
      const formattedPhone = phone.startsWith('234') ? '0' + phone.substring(3) : phone;
      const isSame = !!userData.isSameNumber;

      // Background: Warm Cream gradient
      const bg = ctx.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, '#FFFDF8');
      bg.addColorStop(1, '#F4EDE0');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // Gold Outer Border
      ctx.strokeStyle = '#C8A951';
      ctx.lineWidth = 10;
      ctx.strokeRect(30, 30, width - 60, height - 60);

      // Inner Container
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(55, 55, width - 110, height - 110, 28);
      ctx.fill();
      ctx.strokeStyle = '#E2DBC8';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Top Header Banner (Forest Green)
      ctx.fillStyle = '#1E5622';
      ctx.beginPath();
      ctx.roundRect(80, 80, width - 160, 160, 20);
      ctx.fill();

      // Bugle Horn Emblem with radiant reddish-orange WiFi waves!
      drawClarionBugleEmblem(ctx, 160, 160, 1.45);

      ctx.fillStyle = '#C8A951';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('CLARION A.I. • NYSC SAED ENTERPRISE', 250, 135);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 42px Arial';
      ctx.fillText('STOREFRONT LAUNCH GIVEAWAY!', 250, 195);

      // Sponsor Callout
      ctx.fillStyle = '#777777';
      ctx.font = 'bold 20px Arial';
      ctx.fillText('PROUDLY SPONSORED BY:', 100, 290);

      ctx.fillStyle = '#1E5622';
      ctx.font = 'bold 44px Arial';
      ctx.fillText(name.length > 24 ? name.substring(0, 24) + '...' : name, 100, 345);

      // Giveaway Centerpiece Card (Gold / Amber Accent)
      ctx.fillStyle = '#FFFDF5';
      ctx.beginPath();
      ctx.roundRect(100, 380, width - 200, 360, 22);
      ctx.fill();
      ctx.strokeStyle = '#C8A951';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Badge inside centerpiece
      ctx.fillStyle = '#FF5722';
      ctx.beginPath();
      ctx.roundRect(width / 2 - 240, 405, 480, 50, 12);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('🎁 FREE DATA AIRDROP / LAUNCH SPECIAL', width / 2, 440);

      // Big Giveaway Headline
      ctx.fillStyle = '#1E5622';
      ctx.font = 'bold 46px Arial';
      ctx.fillText('FIRST 5 – 10 PEOPLE WIN', width / 2, 515);

      ctx.fillStyle = '#FF5722';
      ctx.font = 'bold 50px Arial';
      ctx.fillText('FREE 500MB / 1GB DATA!', width / 2, 580);

      // Telco Pills (MTN, Airtel, Glo, 9mobile)
      const networks = [
        { name: 'MTN', color: '#FFCC00', text: '#000000' },
        { name: 'AIRTEL', color: '#ED1C24', text: '#FFFFFF' },
        { name: 'GLO', color: '#008234', text: '#FFFFFF' },
        { name: '9MOBILE', color: '#004F32', text: '#FFFFFF' }
      ];
      const pillW = 190;
      const pillH = 50;
      const startX = 115;
      const pillY = 615;

      networks.forEach((net, idx) => {
        const px = startX + idx * (pillW + 20);
        ctx.fillStyle = net.color;
        ctx.beginPath();
        ctx.roundRect(px, pillY, pillW, pillH, 10);
        ctx.fill();

        ctx.fillStyle = net.text;
        ctx.font = 'bold 20px Arial';
        ctx.fillText(net.name, px + pillW / 2, pillY + 33);
      });

      // Assurance subtext
      ctx.fillStyle = '#555555';
      ctx.font = 'bold 20px Arial';
      ctx.fillText('⚡ 20-Second Automated Delivery • 24/7 Available • Zero Stress', width / 2, 710);

      // Bottom Action Banner (Contextual CTA based on same vs separate number)
      ctx.fillStyle = '#1E5622';
      ctx.beginPath();
      ctx.roundRect(100, 770, width - 200, 180, 20);
      ctx.fill();
      ctx.strokeStyle = '#C8A951';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#C8A951';
      ctx.font = 'bold 22px Arial';
      ctx.fillText('👉 HOW TO CLAIM YOUR FREE DATA RIGHT NOW:', width / 2, 815);

      if (isSame) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 44px Arial';
        ctx.fillText('Reply to this status with "DATA"!', width / 2, 875);

        ctx.fillStyle = '#81C784';
        ctx.font = 'bold 22px Arial';
        ctx.fillText('Or DM me "DATA" — my bot will vend it to you in 20 seconds! ⚡', width / 2, 920);
      } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 44px Arial';
        ctx.fillText(`Text "DATA" to ${formattedPhone || 'my store line'}`, width / 2, 875);

        ctx.fillStyle = '#81C784';
        ctx.font = 'bold 22px Arial';
        ctx.fillText('Send "DATA" to my automated bot to receive your free top-up! ⚡', width / 2, 920);
      }

      // Bottom Footer
      ctx.fillStyle = '#888888';
      ctx.font = 'bold 18px Arial';
      ctx.fillText('POWERED BY CLARION A.I. • OFFICIAL NYSC SAED COMMUNITY INITIATIVE', width / 2, 995);

      logger.info(`Generated giveaway promo card for ${name}`);
      return canvas.toBuffer('image/png');
    } catch (error) {
      logger.error('Error generating giveaway promo card:', error);
      throw error;
    }
  }
}

export default new MediaGenerator();
