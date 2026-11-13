import husmodata from './HusmodataService.js';
import payflex from './payflex.js';
import { logger } from '../config/env.js';
import { detectNetwork } from '../utils/networkUtils.js';

export const MASTER_DATA_CATALOG = [
  // ──────────────────────────────────────────
  // 🟡 MTN Data Catalog (17 Plans)
  // ──────────────────────────────────────────
  {
    serial: 1,
    code: 'M110MBS',
    name: '110MB',
    validity: '1 Day',
    network: 'mtn',
    durationCategory: '⚡ *1-Day & 2-Day Plans:*',
    durationPriority: 1,
    baseCost: 98,
    sellPrice: 100,
    primaryProvider: 'husmodata',
    husmoId: 403,
    peyflexCode: 'M110MBS',          // corrected: matches Peyflex mtn_gifting_data catalog
    peyflexNetwork: 'mtn_gifting_data' // corrected: 110MB lives under gifting, not share
  },
  {
    serial: 2,
    code: 'M1GB1D',
    name: '1GB',
    validity: '1 Day',
    network: 'mtn',
    durationCategory: '⚡ *1-Day & 2-Day Plans:*',
    durationPriority: 1,
    baseCost: 260,
    sellPrice: 400,
    primaryProvider: 'husmodata',
    husmoId: 495,
    peyflexCode: 'M1GBS',
    peyflexNetwork: 'mtn_data_share'
  },
  {
    serial: 3,
    code: 'M3m2GB2D',
    name: '3.2GB',
    validity: '2 Days',
    network: 'mtn',
    durationCategory: '⚡ *1-Day & 2-Day Plans:*',
    durationPriority: 2,
    baseCost: 970,
    sellPrice: 1000,
    primaryProvider: 'husmodata',
    husmoId: 378,
    peyflexCode: 'M3m2GBS',
    peyflexNetwork: 'mtn_data_share'
  },
  {
    serial: 4,
    code: 'M7GB2D',
    name: '7GB',
    validity: '2 Days',
    network: 'mtn',
    durationCategory: '⚡ *1-Day & 2-Day Plans:*',
    durationPriority: 2,
    baseCost: 1745,
    sellPrice: 1800,
    primaryProvider: 'husmodata',
    husmoId: 478,
    peyflexCode: 'M6GBS',
    peyflexNetwork: 'mtn_data_share'
  },
  {
    serial: 5,
    code: 'M500MBS',
    name: '500MB',
    validity: '7 Days',
    network: 'mtn',
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7,
    baseCost: 300,
    sellPrice: 500,
    primaryProvider: 'husmodata',
    husmoId: 458,
    peyflexCode: 'M500MBS',
    peyflexNetwork: 'mtn_data_share'
  },
  {
    serial: 6,
    code: 'M1GBS',
    name: '1GB',
    validity: '7 Days',
    network: 'mtn',
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7,
    baseCost: 380,
    sellPrice: 600,
    primaryProvider: 'husmodata',
    husmoId: 466,
    peyflexCode: 'M1GBS',
    peyflexNetwork: 'mtn_data_share'
  },
  {
    serial: 7,
    code: 'M2GBS',
    name: '2GB',
    validity: '7 Days',
    network: 'mtn',
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7,
    baseCost: 735,
    sellPrice: 1200,
    primaryProvider: 'husmodata',
    husmoId: 467,
    peyflexCode: 'M2GBS',
    peyflexNetwork: 'mtn_data_share'
  },
  {
    serial: 8,
    code: 'M3GBS',
    name: '3GB',
    validity: '7 Days',
    network: 'mtn',
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7,
    baseCost: 1075,
    sellPrice: 1400,
    primaryProvider: 'husmodata',
    husmoId: 468,
    peyflexCode: 'M3GBS',
    peyflexNetwork: 'mtn_data_share'
  },
  {
    serial: 9,
    code: 'M1GBS2',
    name: '1GB',
    validity: '30 Days',
    network: 'mtn',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 392,
    sellPrice: 850,
    primaryProvider: 'husmodata',
    husmoId: 457,
    peyflexCode: 'M1GBS2',
    peyflexNetwork: 'mtn_data_share'
  },
  {
    serial: 10,
    code: 'M2GBS2',
    name: '2GB',
    validity: '30 Days',
    network: 'mtn',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 805,
    sellPrice: 1700,
    primaryProvider: 'husmodata',
    husmoId: 459,
    peyflexCode: 'M2GBS2',
    peyflexNetwork: 'mtn_data_share'
  },
  {
    serial: 11,
    code: 'M3GBS2',
    name: '3GB',
    validity: '30 Days',
    network: 'mtn',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 1125,
    sellPrice: 2000,
    primaryProvider: 'husmodata',
    husmoId: 460,
    peyflexCode: 'M3GBS2',
    peyflexNetwork: 'mtn_data_share'
  },
  {
    serial: 12,
    code: 'M5GBS',
    name: '5GB',
    validity: '30 Days',
    network: 'mtn',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 1610,
    sellPrice: 2500,
    primaryProvider: 'husmodata',
    husmoId: 309,
    peyflexCode: 'M5GBS',
    peyflexNetwork: 'mtn_data_share'
  },
  {
    serial: 13,
    code: 'M7GBS',
    name: '7GB',
    validity: '30 Days',
    network: 'mtn',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 3450,
    sellPrice: 3700,
    primaryProvider: 'peyflex',
    husmoId: null,
    peyflexCode: 'M7GBS',
    peyflexNetwork: 'mtn_data_share'
  },
  {
    serial: 14,
    code: 'M14m5GBS',
    name: '14.5GB',
    validity: '30 Days',
    network: 'mtn',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 4850,
    sellPrice: 5200,
    primaryProvider: 'husmodata',
    husmoId: 399,
    peyflexCode: 'M15GBS',
    peyflexNetwork: 'mtn_data_share'
  },
  {
    serial: 15,
    code: 'M20GBS',
    name: '20GB',
    validity: '30 Days',
    network: 'mtn',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 7260,
    sellPrice: 7500,
    primaryProvider: 'husmodata',
    husmoId: 424,
    peyflexCode: 'M20GBS',
    peyflexNetwork: 'mtn_data_share'
  },
  {
    serial: 16,
    code: 'M25GBS',
    name: '25GB',
    validity: '30 Days',
    network: 'mtn',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 8700,
    sellPrice: 9000,
    primaryProvider: 'husmodata',
    husmoId: 423,
    peyflexCode: 'M25GBS',
    peyflexNetwork: 'mtn_data_share'
  },
  {
    serial: 17,
    code: 'M36GBS',
    name: '36GB',
    validity: '30 Days',
    network: 'mtn',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 10670,
    sellPrice: 11000,
    primaryProvider: 'husmodata',
    husmoId: 379,
    peyflexCode: 'M40GBS',
    peyflexNetwork: 'mtn_data_share'
  },

  // ──────────────────────────────────────────
  // 🟢 Glo Data Catalog (12 Plans)
  // ──────────────────────────────────────────
  {
    serial: 18,
    code: 'G2m5GB',
    name: '2.5GB',
    validity: '2 Days',
    network: 'glo',
    durationCategory: '⚡ *2-Day & 3-Day Plans:*',
    durationPriority: 2,
    baseCost: 475,
    sellPrice: 690,
    primaryProvider: 'husmodata',
    husmoId: 323,
    peyflexCode: 'G2m5GB',
    peyflexNetwork: 'glo_data'
  },
  {
    serial: 19,
    code: 'G1GB1',
    name: '1GB',
    validity: '3 Days',
    network: 'glo',
    durationCategory: '⚡ *2-Day & 3-Day Plans:*',
    durationPriority: 3,
    baseCost: 335,
    sellPrice: 400,
    primaryProvider: 'husmodata',
    husmoId: 479,
    peyflexCode: 'G1GB1',
    peyflexNetwork: 'glo_data'
  },
  {
    serial: 20,
    code: 'G3GB1',
    name: '3GB',
    validity: '3 Days',
    network: 'glo',
    durationCategory: '⚡ *2-Day & 3-Day Plans:*',
    durationPriority: 3,
    baseCost: 850,
    sellPrice: 1200,
    primaryProvider: 'peyflex',
    husmoId: null,
    peyflexCode: 'G3GB1',
    peyflexNetwork: 'glo_data'
  },
  {
    serial: 21,
    code: 'G5GB1',
    name: '5GB',
    validity: '3 Days',
    network: 'glo',
    durationCategory: '⚡ *2-Day & 3-Day Plans:*',
    durationPriority: 3,
    baseCost: 1380,
    sellPrice: 2000,
    primaryProvider: 'peyflex',
    husmoId: null,
    peyflexCode: 'G5GB1',
    peyflexNetwork: 'glo_data'
  },
  {
    serial: 22,
    code: 'G1GB2',
    name: '1GB',
    validity: '7 Days',
    network: 'glo',
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7,
    baseCost: 349,
    sellPrice: 400,
    primaryProvider: 'husmodata',
    husmoId: 447,
    peyflexCode: 'G1GB2',
    peyflexNetwork: 'glo_data'
  },
  {
    serial: 23,
    code: 'G3GB2',
    name: '3GB',
    validity: '7 Days',
    network: 'glo',
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7,
    baseCost: 990,
    sellPrice: 1200,
    primaryProvider: 'peyflex',
    husmoId: null,
    peyflexCode: 'G3GB2',
    peyflexNetwork: 'glo_data'
  },
  {
    serial: 24,
    code: 'G5GB2',
    name: '5GB',
    validity: '7 Days',
    network: 'glo',
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7,
    baseCost: 1580,
    sellPrice: 2000,
    primaryProvider: 'peyflex',
    husmoId: null,
    peyflexCode: 'G5GB2',
    peyflexNetwork: 'glo_data'
  },
  {
    serial: 25,
    code: 'G500MB',
    name: '500MB',
    validity: '30 Days',
    network: 'glo',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 200,
    sellPrice: 250,
    primaryProvider: 'husmodata',
    husmoId: 258,
    peyflexCode: 'G500MB',
    peyflexNetwork: 'glo_data'
  },
  {
    serial: 26,
    code: 'G1GB4',
    name: '1GB',
    validity: '30 Days',
    network: 'glo',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 400,
    sellPrice: 460,
    primaryProvider: 'husmodata',
    husmoId: 261,
    peyflexCode: 'G1GB4',
    peyflexNetwork: 'glo_data'
  },
  {
    serial: 27,
    code: 'G2GB4',
    name: '2GB',
    validity: '30 Days',
    network: 'glo',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 800,
    sellPrice: 900,
    primaryProvider: 'husmodata',
    husmoId: 262,
    peyflexCode: 'G2GB4',
    peyflexNetwork: 'glo_data'
  },
  {
    serial: 28,
    code: 'G3GB4',
    name: '3GB',
    validity: '30 Days',
    network: 'glo',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 1200,
    sellPrice: 1500,
    primaryProvider: 'husmodata',
    husmoId: 263,
    peyflexCode: 'G3GB4',
    peyflexNetwork: 'glo_data'
  },
  {
    serial: 29,
    code: 'G5GB4',
    name: '5GB',
    validity: '30 Days',
    network: 'glo',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 2000,
    sellPrice: 2400,
    primaryProvider: 'husmodata',
    husmoId: 297,
    peyflexCode: 'G5GB4',
    peyflexNetwork: 'glo_data'
  },

  // ──────────────────────────────────────────
  // 🔴 Airtel Data Catalog (11 Plans)
  // ──────────────────────────────────────────
  {
    serial: 30,
    code: 'A300MB',
    name: '300MB',
    validity: '2 Days',
    network: 'airtel',
    durationCategory: '⚡ *2-Day Plans:*',
    durationPriority: 2,
    baseCost: 112,
    sellPrice: 400,
    primaryProvider: 'husmodata',
    husmoId: 450,
    peyflexCode: null,
    peyflexNetwork: 'airtel_data'
  },
  {
    serial: 31,
    code: 'A600MB',
    name: '600MB',
    validity: '2 Days',
    network: 'airtel',
    durationCategory: '⚡ *2-Day Plans:*',
    durationPriority: 2,
    baseCost: 213,
    sellPrice: 400,
    primaryProvider: 'husmodata',
    husmoId: 451,
    peyflexCode: null,
    peyflexNetwork: 'airtel_data'
  },
  {
    serial: 32,
    code: 'A4GB',
    name: '4GB (Binge)',
    validity: '2 Days',
    network: 'airtel',
    durationCategory: '⚡ *2-Day Plans:*',
    durationPriority: 2,
    baseCost: 975,
    sellPrice: 1000,
    primaryProvider: 'husmodata',
    husmoId: 407,
    peyflexCode: null,
    peyflexNetwork: 'airtel_data'
  },
  {
    serial: 33,
    code: 'A6GB',
    name: '6GB (Binge)',
    validity: '2 Days',
    network: 'airtel',
    durationCategory: '⚡ *2-Day Plans:*',
    durationPriority: 2,
    baseCost: 1440,
    sellPrice: 1500,
    primaryProvider: 'husmodata',
    husmoId: 498,
    peyflexCode: null,
    peyflexNetwork: 'airtel_data'
  },
  {
    serial: 34,
    code: 'A1GB',
    name: '1GB',
    validity: '7 Days',
    network: 'airtel',
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7,
    baseCost: 780,
    sellPrice: 800,
    primaryProvider: 'husmodata',
    husmoId: 125,
    peyflexCode: null,
    peyflexNetwork: 'airtel_data'
  },
  {
    serial: 35,
    code: 'A20GB',
    name: '20GB',
    validity: '7 Days',
    network: 'airtel',
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7,
    baseCost: 4800,
    sellPrice: 5000,
    primaryProvider: 'husmodata',
    husmoId: 137,
    peyflexCode: null,
    peyflexNetwork: 'airtel_data'
  },
  {
    serial: 36,
    code: 'A2GB',
    name: '2GB',
    validity: '30 Days',
    network: 'airtel',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 1463,
    sellPrice: 1500,
    primaryProvider: 'husmodata',
    husmoId: 406,
    peyflexCode: null,
    peyflexNetwork: 'airtel_data'
  },
  {
    serial: 37,
    code: 'A3GB',
    name: '3GB',
    validity: '30 Days',
    network: 'airtel',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 1950,
    sellPrice: 2000,
    primaryProvider: 'husmodata',
    husmoId: 133,
    peyflexCode: null,
    peyflexNetwork: 'airtel_data'
  },
  {
    serial: 38,
    code: 'A10GB',
    name: '10GB',
    validity: '30 Days',
    network: 'airtel',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 3020,
    sellPrice: 3900,
    primaryProvider: 'husmodata',
    husmoId: 318,
    peyflexCode: null,
    peyflexNetwork: 'airtel_data'
  },
  {
    serial: 39,
    code: 'A25GB',
    name: '25GB',
    validity: '30 Days',
    network: 'airtel',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 7800,
    sellPrice: 8200,
    primaryProvider: 'husmodata',
    husmoId: 139,
    peyflexCode: null,
    peyflexNetwork: 'airtel_data'
  },
  {
    serial: 40,
    code: 'A100GB',
    name: '100GB',
    validity: '30 Days',
    network: 'airtel',
    durationCategory: '🗓️ *30-Day Monthly Plans:*',
    durationPriority: 30,
    baseCost: 19500,
    sellPrice: 20000,
    primaryProvider: 'husmodata',
    husmoId: 141,
    peyflexCode: null,
    peyflexNetwork: 'airtel_data'
  }
];

class TelecomDispatcher {
  constructor() {
    this.catalog = MASTER_DATA_CATALOG.map(p => ({
      ...p,
      id: `${p.network}_${p.code}`,
      plan_code: p.code,
      proxyCost: p.sellPrice
    }));

    // In-memory Circuit Breaker Health Tracking
    this.planHealthMap = new Map();
    this.networkHealthMap = new Map();
    this.CIRCUIT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Record a failed dispatch against a plan and its network.
   * If failure count reaches 2 within 10 minutes, trips status to DEGRADED.
   */
  recordPlanFailure(planCode, reason = 'Gateway timeout') {
    if (!planCode) return;
    const cleanCode = String(planCode).trim().toUpperCase();
    const plan = this.findPlan(cleanCode);
    const now = Date.now();

    const currentHealth = this.planHealthMap.get(cleanCode) || {
      status: 'HEALTHY',
      failureCount: 0,
      lastFailureAt: null,
      cooldownUntil: null,
      failureReason: null
    };

    const isRecent = currentHealth.lastFailureAt && (now - currentHealth.lastFailureAt < 10 * 60 * 1000);
    const newFailureCount = isRecent ? (currentHealth.failureCount + 1) : 1;

    const newStatus = newFailureCount >= 2 ? 'DEGRADED' : 'HEALTHY';
    const cooldownUntil = newStatus === 'DEGRADED' ? now + this.CIRCUIT_COOLDOWN_MS : null;

    const updated = {
      status: newStatus,
      failureCount: newFailureCount,
      lastFailureAt: now,
      cooldownUntil,
      failureReason: reason
    };

    this.planHealthMap.set(cleanCode, updated);
    logger.warn(`[CIRCUIT-BREAKER] Plan ${cleanCode} failure recorded (count: ${newFailureCount}, status: ${newStatus}, reason: ${reason})`);

    // Check if network-level degradation should trip (>= 3 degraded plans on same network)
    if (plan && plan.network) {
      const netKey = plan.network.toLowerCase();
      let degradedCount = 0;
      for (const [code, h] of this.planHealthMap.entries()) {
        const p = this.findPlan(code);
        if (p && p.network.toLowerCase() === netKey && this.isPlanDegraded(code)) {
          degradedCount++;
        }
      }
      if (degradedCount >= 3) {
        this.networkHealthMap.set(netKey, {
          status: 'DEGRADED',
          degradedSince: now,
          cooldownUntil: now + this.CIRCUIT_COOLDOWN_MS,
          reason: `High failure rate across ${degradedCount} ${netKey.toUpperCase()} plans`
        });
        logger.error(`[CIRCUIT-BREAKER] 🔴 NETWORK TRIPPED TO DEGRADED: ${netKey.toUpperCase()} (${degradedCount} failing plans)`);
      }
    }
  }

  /**
   * Reset health state upon successful dispatch.
   */
  recordPlanSuccess(planCode) {
    if (!planCode) return;
    const cleanCode = String(planCode).trim().toUpperCase();
    if (this.planHealthMap.has(cleanCode)) {
      this.planHealthMap.set(cleanCode, {
        status: 'HEALTHY',
        failureCount: 0,
        lastFailureAt: null,
        cooldownUntil: null,
        failureReason: null
      });
      logger.info(`[CIRCUIT-BREAKER] Plan ${cleanCode} restored to HEALTHY.`);
    }
  }

  /**
   * Check if a plan is currently marked degraded or in cooldown.
   */
  isPlanDegraded(planCode) {
    if (!planCode) return false;
    const cleanCode = String(planCode).trim().toUpperCase();
    const plan = this.findPlan(cleanCode);

    // Check network-level degradation first
    if (plan && plan.network && this.isNetworkDegraded(plan.network)) {
      return true;
    }

    const health = this.planHealthMap.get(cleanCode);
    if (!health) return false;

    if (health.status === 'DEGRADED') {
      if (health.cooldownUntil && Date.now() > health.cooldownUntil) {
        // Cooldown expired — auto-probe reset to probation
        health.status = 'HEALTHY';
        health.failureCount = 1; // Probation count
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Check if an entire network is degraded.
   */
  isNetworkDegraded(network) {
    if (!network) return false;
    const cleanNet = String(network).toLowerCase();
    const netHealth = this.networkHealthMap.get(cleanNet);
    if (!netHealth) return false;

    if (netHealth.status === 'DEGRADED') {
      if (netHealth.cooldownUntil && Date.now() > netHealth.cooldownUntil) {
        this.networkHealthMap.delete(cleanNet);
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Returns healthy alternative plans for a given failing plan.
   */
  getAlternativePlans(planIdentifier, count = 3) {
    const targetPlan = this.findPlan(planIdentifier);
    if (!targetPlan) {
      return this.catalog.filter(p => !this.isPlanDegraded(p.code)).slice(0, count);
    }

    // 1. Try healthy plans on same network with comparable pricing
    let sameNet = this.catalog.filter(p =>
      p.network === targetPlan.network &&
      p.code !== targetPlan.code &&
      !this.isPlanDegraded(p.code)
    );
    sameNet.sort((a, b) => Math.abs(a.sellPrice - targetPlan.sellPrice) - Math.abs(b.sellPrice - targetPlan.sellPrice));

    if (sameNet.length >= count) return sameNet.slice(0, count);

    // 2. Supplement with healthy plans from other networks with similar pricing
    let otherNet = this.catalog.filter(p =>
      p.network !== targetPlan.network &&
      !this.isPlanDegraded(p.code)
    );
    otherNet.sort((a, b) => Math.abs(a.sellPrice - targetPlan.sellPrice) - Math.abs(b.sellPrice - targetPlan.sellPrice));

    return [...sameNet, ...otherNet].slice(0, count);
  }

  /**
   * Returns active plans, optionally filtered by network.
   * @param {string|null} network - 'mtn', 'glo', 'airtel'
   */
  async getAvailablePlans(network = null) {
    if (!network) return this.catalog;
    const cleanNet = String(network).toLowerCase();
    return this.catalog.filter(p => p.network.toLowerCase().includes(cleanNet));
  }

  /**
   * Find a plan by serial (1..40), code (e.g. M1GB1D, A10GB), or id
   */
  findPlan(identifier) {
    if (!identifier) return null;
    const cleanId = String(identifier).trim().toUpperCase();

    // 1. Check exact serial
    const bySerial = this.catalog.find(p => p.serial.toString() === cleanId);
    if (bySerial) return bySerial;

    // 2. Check exact code (e.g. A10GB, M110MBS, G2M5GB)
    const byCode = this.catalog.find(p => p.code.toUpperCase() === cleanId);
    if (byCode) return byCode;

    // 3. Check id (e.g. mtn_M110MBS)
    const byId = this.catalog.find(p => p.id.toUpperCase() === cleanId);
    if (byId) return byId;

    return null;
  }

  /**
   * Tier 1 Synchronous Dual-Provider Failover Dispatcher.
   * Attempts primary provider (Husmodata or Peyflex).
   * If primary fails, immediately attempts failover provider within 0-3 seconds.
   */
  async dispenseData(phoneNumber, planIdentifier) {
    const plan = this.findPlan(planIdentifier);
    if (!plan) {
      throw new Error(`Invalid plan identifier: ${planIdentifier}`);
    }

    let cleanPhone = String(phoneNumber).replace(/\D/g, '');
    if (cleanPhone.startsWith('234') && cleanPhone.length === 13) cleanPhone = '0' + cleanPhone.slice(3);
    if (cleanPhone.length === 10) cleanPhone = '0' + cleanPhone;

    logger.info(`[TELECOM-DISPATCHER] Initiating dispense for ${plan.code} (${plan.name}) to ${cleanPhone}`);

    if (plan.primaryProvider === 'husmodata' && plan.husmoId) {
      // Primary: Husmodata
      try {
        const result = await husmodata.purchaseData(plan.network, cleanPhone, plan.husmoId);
        this.recordPlanSuccess(plan.code);
        return {
          status: 'success',
          provider: 'husmodata',
          reference: result.reference,
          planDetails: plan,
          apiResponse: result.apiResponse
        };
      } catch (husmoErr) {
        logger.warn(`[TELECOM-DISPATCHER] Primary Husmodata failed: ${husmoErr.message}. Checking failover...`);

        // Failover: Peyflex
        if (plan.peyflexCode) {
          try {
            logger.info(`[TELECOM-DISPATCHER] 🔄 Failing over to Peyflex for ${plan.peyflexCode}...`);
            const pResult = await payflex.dispenseRaw(cleanPhone, plan.peyflexNetwork, plan.peyflexCode);
            this.recordPlanSuccess(plan.code);
            return {
              status: 'success',
              provider: 'peyflex (failover)',
              reference: pResult.reference,
              planDetails: plan,
              apiResponse: pResult.apiResponse
            };
          } catch (peyflexErr) {
            logger.error(`[TELECOM-DISPATCHER] 🔴 Failover Peyflex also failed: ${peyflexErr.message}`);
            this.recordPlanFailure(plan.code, `Husmodata: ${husmoErr.message} | Peyflex: ${peyflexErr.message}`);
            throw new Error(`Dispatch failed across all providers: Husmodata (${husmoErr.message}) | Peyflex (${peyflexErr.message})`);
          }
        }
        this.recordPlanFailure(plan.code, husmoErr.message);
        throw husmoErr;
      }
    } else {
      // Primary: Peyflex (e.g. M7GBS, G3GB1, G5GB1, G3GB2, G5GB2)
      try {
        const pResult = await payflex.dispenseRaw(cleanPhone, plan.peyflexNetwork, plan.peyflexCode);
        this.recordPlanSuccess(plan.code);
        return {
          status: 'success',
          provider: 'peyflex',
          reference: pResult.reference,
          planDetails: plan,
          apiResponse: pResult.apiResponse
        };
      } catch (peyflexErr) {
        logger.warn(`[TELECOM-DISPATCHER] Primary Peyflex failed: ${peyflexErr.message}. Checking failover...`);

        // Failover: Husmodata (if husmoId exists)
        if (plan.husmoId) {
          try {
            logger.info(`[TELECOM-DISPATCHER] 🔄 Failing over to Husmodata for Plan ID ${plan.husmoId}...`);
            const hResult = await husmodata.purchaseData(plan.network, cleanPhone, plan.husmoId);
            this.recordPlanSuccess(plan.code);
            return {
              status: 'success',
              provider: 'husmodata (failover)',
              reference: hResult.reference,
              planDetails: plan,
              apiResponse: hResult.apiResponse
            };
          } catch (husmoErr) {
            logger.error(`[TELECOM-DISPATCHER] 🔴 Failover Husmodata also failed: ${husmoErr.message}`);
            this.recordPlanFailure(plan.code, `Peyflex: ${peyflexErr.message} | Husmodata (${husmoErr.message})`);
            throw new Error(`Dispatch failed across all providers: Peyflex (${peyflexErr.message}) | Husmodata (${husmoErr.message})`);
          }
        }
        this.recordPlanFailure(plan.code, peyflexErr.message);
        throw peyflexErr;
      }
    }
  }
}

export default new TelecomDispatcher();

