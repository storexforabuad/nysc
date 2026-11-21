import fs from 'fs';

let content = fs.readFileSync('src/components/merchant/MerchantDashboard.tsx', 'utf8');
const lines = content.split('\n');

// 1. Update activeTab type to include 'orbit'
content = content.replace(
  `const [activeTab, setActiveTab] = useState<'marketing' | 'wallet' | 'sales'>('marketing');`,
  `const [activeTab, setActiveTab] = useState<'marketing' | 'wallet' | 'sales' | 'orbit'>('marketing');`
);

// 2. Add imports for orbit components and motherBotEngine
const importInsert = `import { Bell } from 'lucide-react';
import NotificationsModal from '../orbit/NotificationsModal';
import OrbitTab from '../orbit/OrbitTab';
import { generateMotherBotNotifications, markAllNotificationsAsRead, type MotherBotNotification } from '../../services/motherBotEngine';
`;
content = content.replace(
  `  Building2\n} from 'lucide-react';`,
  `  Building2,\n  Bell\n} from 'lucide-react';\nimport NotificationsModal from '../orbit/NotificationsModal';\nimport OrbitTab from '../orbit/OrbitTab';\nimport { generateMotherBotNotifications, markAllNotificationsAsRead, type MotherBotNotification } from '../../services/motherBotEngine';`
);

// 3. Add state for notifications after showTopUpGuide line
content = content.replace(
  `  const [showTopUpGuide, setShowTopUpGuide] = useState(false);`,
  `  const [showTopUpGuide, setShowTopUpGuide] = useState(false);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [notifications, setNotifications] = useState<MotherBotNotification[]>(() =>
    generateMotherBotNotifications({
      todayVends: (data.user.metrics?.totalOrders || 0),
      todayProfit: (data.user.metrics?.totalProfitNaira || 0),
      streakDays: parseInt(typeof window !== 'undefined' ? (localStorage.getItem('orbit_streak_days') || '4') : '4', 10),
      activeReferrals: parseInt(typeof window !== 'undefined' ? (localStorage.getItem('orbit_active_referrals') || '3') : '3', 10),
      brandName: data.user.franchiseName || data.user.name || undefined
    })
  );
  const unreadNotifCount = notifications.filter(n => !n.read).length;
  const refreshNotifications = () =>
    setNotifications(generateMotherBotNotifications({
      todayVends: (data.user.metrics?.totalOrders || 0),
      todayProfit: (data.user.metrics?.totalProfitNaira || 0),
      streakDays: parseInt(typeof window !== 'undefined' ? (localStorage.getItem('orbit_streak_days') || '4') : '4', 10),
      activeReferrals: parseInt(typeof window !== 'undefined' ? (localStorage.getItem('orbit_active_referrals') || '3') : '3', 10),
      brandName: data.user.franchiseName || data.user.name || undefined
    }));`
);

// 4. Add notification bell to header (after the LIVE badge)
content = content.replace(
  `          <button
            onClick={onRefresh}
            className="p-1.5 text-zinc-400 hover:text-accent transition-colors cursor-pointer"
            title="Refresh Dashboard"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </header>`,
  `          <button
            type="button"
            onClick={() => setShowNotifModal(true)}
            className="relative p-1.5 text-zinc-400 hover:text-accent transition-colors cursor-pointer"
            title="Notifications"
          >
            <Bell size={15} />
            {unreadNotifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-amber-400 rounded-full text-[9px] text-black font-black flex items-center justify-center leading-none animate-pulse">
                {unreadNotifCount}
              </span>
            )}
          </button>
          <button
            onClick={onRefresh}
            className="p-1.5 text-zinc-400 hover:text-accent transition-colors cursor-pointer"
            title="Refresh Dashboard"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </header>`
);

// 5. Update nav from grid-cols-3 to grid-cols-4 and add ORBIT tab
content = content.replace(
  `          <div className="max-w-2xl mx-auto grid grid-cols-3 gap-1 p-1 bg-zinc-900/70 border border-zinc-800">`,
  `          <div className="max-w-2xl mx-auto grid grid-cols-4 gap-1 p-1 bg-zinc-900/70 border border-zinc-800">`
);

// 6. Add ORBIT tab button after the SALES tab button closing
content = content.replace(
  `          </div>
        </nav>

        {/* ── Main Dashboard Content ── */}`,
  `            <button
              onClick={() => setActiveTab('orbit')}
              className={\`py-2 px-1 text-[11px] sm:text-xs font-mono font-bold transition-all cursor-pointer flex items-center justify-center gap-1 text-center whitespace-nowrap overflow-hidden \${
                activeTab === 'orbit'
                  ? 'bg-accent text-black shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }\`}
            >
              <Bell size={12} className="shrink-0" />
              <span className="truncate">ORBIT</span>
            </button>
          </div>
        </nav>

        {/* ── Main Dashboard Content ── */}`
);

// 7. Add ORBIT tab content after the sales section closing line
content = content.replace(
  `        )}

      </main>

      {/* ── Withdrawal / Cash-Out Modal Overlay ── */}`,
  `        )}

        {/* ── TAB 4: ORBIT ── */}
        {activeTab === 'orbit' && (
          <OrbitTab
            user={user}
            brandName={brandName}
            onUpdateBrandName={(newName) => {
              try { localStorage.setItem('clarion_merchant_brand', newName); } catch {}
            }}
            onOpenQuickVend={() => openUnifiedVendModal()}
          />
        )}

      </main>

      {/* ── Notifications Modal ── */}
      {showNotifModal && (
        <NotificationsModal
          isOpen={showNotifModal}
          onClose={() => setShowNotifModal(false)}
          notifications={notifications}
          onRefreshNotifications={refreshNotifications}
          onActionClick={(actionType, payload) => {
            setShowNotifModal(false);
            if (actionType === 'QUICK_VEND') openUnifiedVendModal();
            else if (actionType === 'VIEW_ORBIT') setActiveTab('orbit');
            else if (actionType === 'COPY_STATUS') setActiveTab('marketing');
          }}
        />
      )}

      {/* ── Withdrawal / Cash-Out Modal Overlay ── */}`
);

fs.writeFileSync('src/components/merchant/MerchantDashboard.tsx', content, 'utf8');
console.log('Done! MerchantDashboard.tsx patched with ORBIT tab + notification bell.');

