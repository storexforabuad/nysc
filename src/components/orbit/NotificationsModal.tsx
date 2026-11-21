import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, CheckCheck, X, Zap, MessageSquare, TrendingUp, Sparkles } from 'lucide-react';
import { MotherBotNotification, markNotificationAsRead, markAllNotificationsAsRead } from '../../services/motherBotEngine';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: MotherBotNotification[];
  onRefreshNotifications: () => void;
  onActionClick: (actionType: string, payload?: string) => void;
}

export default function NotificationsModal({
  isOpen,
  onClose,
  notifications,
  onRefreshNotifications,
  onActionClick
}: NotificationsModalProps) {
  const [filter, setFilter] = useState<'ALL' | 'MOTHERBOT' | 'RUNDOWN' | 'PLATFORM'>('ALL');

  if (!isOpen) return null;

  const filtered = notifications.filter(n => {
    if (filter === 'ALL') return true;
    return n.category === filter;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAllRead = () => {
    markAllNotificationsAsRead(notifications);
    onRefreshNotifications();
  };

  const handleItemClick = (notif: MotherBotNotification) => {
    if (!notif.read) {
      markNotificationAsRead(notif.id);
      onRefreshNotifications();
    }
    if (notif.actionType) {
      onActionClick(notif.actionType, notif.actionPayload);
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'RUNDOWN':
        return <TrendingUp size={14} className="text-emerald-400" />;
      case 'PLATFORM':
        return <Zap size={14} className="text-cyan-400" />;
      default:
        return <Sparkles size={14} className="text-amber-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-zinc-950 border border-zinc-800 w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden font-mono"
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Bell size={18} className="text-accent" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full animate-ping" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">MotherBot Broadcast Stream</h2>
              <p className="text-[10px] text-zinc-400">
                {unreadCount > 0 ? `${unreadCount} unread broadcast${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-[10px] text-zinc-400 hover:text-white px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <CheckCheck size={12} />
                <span>MARK ALL READ</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="px-4 py-2 bg-zinc-900/30 border-b border-zinc-800 flex items-center gap-1.5 overflow-x-auto text-[10px]">
          {(['ALL', 'MOTHERBOT', 'RUNDOWN', 'PLATFORM'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className={`px-2.5 py-1 uppercase tracking-wider font-bold transition-colors cursor-pointer shrink-0 ${
                filter === cat
                  ? 'bg-accent text-black'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {cat === 'MOTHERBOT' ? 'COACHING' : cat}
            </button>
          ))}
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-zinc-900/80">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-xs">
              No notifications in this category.
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className={`pt-2.5 first:pt-0 p-3 border transition-all ${
                  item.read
                    ? 'bg-zinc-900/20 border-zinc-900 text-zinc-400'
                    : 'bg-zinc-900/60 border-accent/30 text-zinc-200 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    {getCategoryIcon(item.category)}
                    <span className="text-xs font-bold text-white tracking-wide">{item.title}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 shrink-0 font-mono">{item.timestamp}</span>
                </div>

                <p className="text-[11px] text-zinc-300 leading-relaxed mb-3 font-sans">
                  {item.body}
                </p>

                {item.actionLabel && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleItemClick(item)}
                      className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold uppercase tracking-wider border border-zinc-700 hover:border-accent transition-all cursor-pointer active:scale-95 flex items-center gap-1"
                    >
                      <Zap size={10} className="text-accent" />
                      <span>{item.actionLabel}</span>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-900/50 flex items-center justify-between text-[10px] text-zinc-500">
          <span>⚡ Real-time Orbit Client Stream</span>
          <span>Zero Server Overhead</span>
        </div>
      </motion.div>
    </div>
  );
}

