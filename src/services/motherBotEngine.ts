/**
 * Deterministic Client-Side MotherBot Engine
 * Zero Node background jobs · Zero Cloud Functions · 100% Local Time & Event-Driven
 */

export interface MotherBotNotification {
  id: string;
  category: 'MOTHERBOT' | 'RUNDOWN' | 'PLATFORM';
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  actionType?: 'COPY_STATUS' | 'QUICK_VEND' | 'VIEW_ORBIT';
  actionPayload?: string;
  actionLabel?: string;
}

const STORAGE_KEY = 'orbit_notifications_v1';
const READ_IDS_KEY = 'orbit_read_notification_ids';

function getReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_IDS_KEY);
    if (!raw) return new Set<string>();
    return new Set<string>(JSON.parse(raw));
  } catch {
    return new Set<string>();
  }
}

export function markNotificationAsRead(id: string): void {
  try {
    const readIds = getReadIds();
    readIds.add(id);
    localStorage.setItem(READ_IDS_KEY, JSON.stringify(Array.from(readIds)));
  } catch {}
}

export function markAllNotificationsAsRead(notifications: MotherBotNotification[]): void {
  try {
    const readIds = getReadIds();
    notifications.forEach(n => readIds.add(n.id));
    localStorage.setItem(READ_IDS_KEY, JSON.stringify(Array.from(readIds)));
  } catch {}
}

/**
 * Computes deterministic notifications based on current time of day,
 * merchant metrics, and streak data.
 */
export function generateMotherBotNotifications(params: {
  todayVends?: number;
  todayProfit?: number;
  streakDays?: number;
  activeReferrals?: number;
  brandName?: string;
}): MotherBotNotification[] {
  const readIds = getReadIds();
  const now = new Date();
  
  // Convert to Nigeria Local Time (UTC+1)
  const utcHours = now.getUTCHours();
  const watHours = (utcHours + 1) % 24;
  const todayDateStr = now.toISOString().slice(0, 10);

  const brand = params.brandName || 'Orbit Reseller';
  const vends = params.todayVends || 0;
  const profit = params.todayProfit || 0;
  const streak = params.streakDays || 1;
  const referrals = params.activeReferrals || 0;

  const notifications: MotherBotNotification[] = [];

  // 1. Platform Health Broadcast (Permanent baseline)
  const platformId = `platform-health-${todayDateStr}`;
  notifications.push({
    id: platformId,
    category: 'PLATFORM',
    title: '⚡ Upstream Telco Speeds Optimal',
    body: 'Automated dispatch active. MTN, Glo & Airtel bundles are delivering in <15 seconds.',
    timestamp: 'Today · Live',
    read: readIds.has(platformId),
    actionType: 'QUICK_VEND',
    actionLabel: 'QUICK VEND'
  });

  // 2. Morning Hustle Nudge (Available from 08:00 AM)
  if (watHours >= 8) {
    const morningId = `morning-nudge-${todayDateStr}`;
    notifications.push({
      id: morningId,
      category: 'MOTHERBOT',
      title: '🌅 08:30 AM · Morning Hustle Wave',
      body: `Good morning! 90% of subscribers exhaust data overnight. Post your morning WhatsApp Status now to capture early student & office refills.`,
      timestamp: '08:30 AM',
      read: readIds.has(morningId),
      actionType: 'COPY_STATUS',
      actionPayload: 'morning',
      actionLabel: 'COPY MORNING DROP'
    });
  }

  // 3. Peak Afternoon Wave (Available from 13:00 PM)
  if (watHours >= 13) {
    const afternoonId = `afternoon-nudge-${todayDateStr}`;
    notifications.push({
      id: afternoonId,
      category: 'MOTHERBOT',
      title: '⚡ 01:30 PM · Peak Refill Wave',
      body: `MiFi refills, remote workers, and campus streamers are active. Share your 1GB deals (MTN ₦290/₦650, Glo ₦390) now!`,
      timestamp: '01:30 PM',
      read: readIds.has(afternoonId),
      actionType: 'COPY_STATUS',
      actionPayload: 'community',
      actionLabel: 'COPY REFILL DROP'
    });
  }

  // 4. Daily Merchant Rundown (Available from 21:00 PM or simulated for evening)
  if (watHours >= 21 || watHours < 5) {
    const rundownId = `daily-rundown-${todayDateStr}`;
    notifications.push({
      id: rundownId,
      category: 'RUNDOWN',
      title: '📊 09:00 PM · Daily Merchant Rundown',
      body: `[DAILY-MERCHANT-JOB] Today: ${vends} orders completed · +₦${profit.toLocaleString()} profit. Streak: Day ${streak} of 7. Keep your streak alive to unlock 5X Ultra VIP!`,
      timestamp: '09:00 PM',
      read: readIds.has(rundownId),
      actionType: 'VIEW_ORBIT',
      actionLabel: 'VIEW ORBIT TAB'
    });
  }

  // 5. Growth & Referral Progress Nudge
  const refId = `referral-status-${referrals}`;
  notifications.push({
    id: refId,
    category: 'MOTHERBOT',
    title: `👥 4X VIP Referral Progress: ${referrals}/5 Active`,
    body: referrals >= 5 
      ? '🎉 Congratulations! You have unlocked permanent 4X VIP wholesale rates!'
      : `Invite ${5 - referrals} more friends to vend. Once they complete 1 order each, 4X MAX VIP unlocks permanently.`,
    timestamp: 'Orbit Engine',
    read: readIds.has(refId),
    actionType: 'VIEW_ORBIT',
    actionLabel: 'INVITE MERCHANTS'
  });

  return notifications;
}

