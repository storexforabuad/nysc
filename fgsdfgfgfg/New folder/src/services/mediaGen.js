import { createCanvas, registerFont } from 'canvas';
import { logger } from '../config/env.js';

class MediaGenerator {
  constructor() {
    // Optional: Register custom fonts here if needed
    // registerFont('assets/fonts/Inter-Bold.ttf', { family: 'Inter' });
  }

  async generatePromoImage(coMemberName) {
    try {
      const width = 1080;
      const height = 1440; // 3:4 Aspect Ratio
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // Background - Emerald Green (#00A86B)
      ctx.fillStyle = '#00A86B';
      ctx.fillRect(0, 0, width, height);

      // Header Section
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 80px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('NYSC SUBSIDIZED DATA', width / 2, 150);
      
      ctx.font = '40px Arial';
      ctx.fillText('Empowering Co-members via the African Idea Engine', width / 2, 220);

      // Pricing Table Background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.roundRect(100, 300, 880, 800, 40);
      ctx.fill();

      // Table Headers
      ctx.fillStyle = '#FF6700'; // Sunset Orange
      ctx.font = 'bold 50px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Plan', 150, 400);
      ctx.textAlign = 'center';
      ctx.fillText('Standard', 540, 400);
      ctx.textAlign = 'right';
      ctx.fillText('Our Price', 930, 400);

      // Sample Data Rows (In production, fetch from plansCache)
      const rows = [
        { size: '1GB', std: '₦500', our: '₦250' },
        { size: '3GB', std: '₦1,500', our: '₦700' },
        { size: '5GB', std: '₦2,500', our: '₦1,100' },
        { size: '10GB', std: '₦5,000', our: '₦2,100' },
        { size: '20GB', std: '₦10,000', our: '₦4,000' }
      ];

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '45px Arial';
      rows.forEach((row, i) => {
        const y = 500 + (i * 120);
        ctx.textAlign = 'left';
        ctx.fillText(row.size, 150, y);
        ctx.textAlign = 'center';
        ctx.fillText(row.std, 540, y);
        ctx.textAlign = 'right';
        ctx.fillText(row.our, 930, y);
        
        // Line separator
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.moveTo(150, y + 40);
        ctx.lineTo(930, y + 40);
        ctx.stroke();
      });

      // Footer - Personalized Stamp
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'italic 40px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`Managed by: ${coMemberName}`, width / 2, 1250);
      
      ctx.fillStyle = '#FF6700';
      ctx.font = 'bold 50px Arial';
      ctx.fillText('TEXT ".data" TO START', width / 2, 1350);

      logger.info(`Generated promo image for ${coMemberName}`);
      return canvas.toBuffer('image/png');
    } catch (error) {
      logger.error('Error generating media:', error);
      throw error;
    }
  }
}

export default new MediaGenerator();
