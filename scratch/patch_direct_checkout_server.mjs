import fs from 'fs';

let content = fs.readFileSync('src/server.js', 'utf8');

// 1. Add direct-checkout endpoint right after /api/merchant/:phone/vend (around line 1342)
const targetVendEndpointEnd = `      logger.error('Error in /api/merchant/vend:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });`;

const directCheckoutEndpoint = `      logger.error('Error in /api/merchant/vend:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── OrbitVTU Direct Buy: Paystack Checkout Session ──
  app.post('/api/orbit/direct-checkout', apiLimiter, async (req, res) => {
    try {
      const { planCode, recipientPhone, network, amount } = req.body;
      if (!planCode || !recipientPhone || !amount) {
        return res.status(400).json({ success: false, error: 'planCode, recipientPhone and amount are required' });
      }

      const cleanDigits = String(recipientPhone).replace(/\\D/g, '');
      const formattedRecip = cleanDigits.startsWith('234') && cleanDigits.length === 13 
        ? '0' + cleanDigits.slice(3) 
        : cleanDigits;

      const plan = telecomDispatcher.findPlan(planCode);
      if (!plan) {
        return res.status(404).json({ success: false, error: 'Selected data plan not found in catalog' });
      }

      const reference = \`orbit_\${Date.now()}_\${Math.random().toString(36).substring(2, 7)}\`;
      const host = req.get('host') || 'localhost:3000';
      const protocol = req.protocol === 'https' || host.includes('vercel.app') ? 'https' : 'http';
      const callbackUrl = \`\${protocol}://\${host}/?status=success&reference=\${reference}&plan=\${encodeURIComponent(plan.name)}&network=\${encodeURIComponent(plan.network)}&phone=\${encodeURIComponent(formattedRecip)}&amount=\${amount}\`;

      const checkoutSession = await paystack.initializeTransaction({
        email: \`customer_\${formattedRecip}@orbitvtu.com\`,
        amountNaira: Number(amount),
        reference,
        callbackUrl,
        metadata: {
          type: 'DIRECT_VEND',
          planCode: plan.code,
          recipientPhone: formattedRecip,
          network: plan.network,
          planName: plan.name,
          validity: plan.validity,
          amountPaid: Number(amount)
        }
      });

      res.json({
        success: true,
        authorizationUrl: checkoutSession.authorizationUrl,
        reference: checkoutSession.reference,
        accessCode: checkoutSession.accessCode
      });
    } catch (err) {
      logger.error('Error in /api/orbit/direct-checkout:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to initialize Paystack checkout' });
    }
  });`;

if (!content.includes('/api/orbit/direct-checkout')) {
  content = content.replace(targetVendEndpointEnd, directCheckoutEndpoint);
}

// 2. In processPaymentEvent, handle DIRECT_VEND event right inside if (Event === 'charge_successful')
const targetChargeSuccessful = `    if (Event === 'charge_successful') {
      logger.info(\`Received successful payment: \${TransactionRef} (Amount: ₦\${Body.amount})\`);

      try {`;

const replacementDirectVendFulfill = `    if (Event === 'charge_successful') {
      logger.info(\`Received successful payment: \${TransactionRef} (Amount: ₦\${Body.amount})\`);

      try {
        // Check if this is an OrbitVTU Direct Buy payment
        const meta = rawPayload?.data?.metadata || {};
        if (meta.type === 'DIRECT_VEND' && meta.recipientPhone && meta.planCode) {
          logger.info(\`[DIRECT-VEND] Instant dispensing \${meta.planCode} to \${meta.recipientPhone} (Ref: \${TransactionRef})\`);
          try {
            await telecomDispatcher.dispenseData(meta.recipientPhone, meta.planCode);
            logger.info(\`[DIRECT-VEND] Dispense successful for \${meta.recipientPhone} on plan \${meta.planCode}\`);
          } catch (dispenseErr) {
            logger.error(\`[DIRECT-VEND] Upstream dispense failed for \${meta.recipientPhone}:\`, dispenseErr.message);
          }
          return { status: 'success', message: 'Direct vend processed' };
        }
`;

if (!content.includes('[DIRECT-VEND] Instant dispensing')) {
  content = content.replace(targetChargeSuccessful, replacementDirectVendFulfill);
}

fs.writeFileSync('src/server.js', content, 'utf8');
console.log('Successfully patched src/server.js with direct-checkout endpoint & DIRECT_VEND fulfillment!');

