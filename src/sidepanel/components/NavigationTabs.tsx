import React from 'react';
import { MessageSquare, PlayCircle, UserCheck, Settings } from 'lucide-react';

export type TabId = 'chat' | 'actions' | 'profile' | 'settings';

interface NavigationTabsProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  pendingActionsCount?: number;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  activeTab,
  onSelectTab,
  pendingActionsCount = 0,
}) => {
  const tabs: Array<{
    id: TabId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'actions', label: 'Actions', icon: PlayCircle, badge: pendingActionsCount },
    { id: 'profile', label: 'Profile', icon: UserCheck },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav
      className="flex items-center justify-around border-b border-slate-800 bg-slate-900/95 px-1 py-1 select-none backdrop-blur-sm shrink-0"
      role="tablist"
      aria-label="Navigation Tabs"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectTab(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-lg text-[11px] font-medium transition-all duration-150 relative min-w-0 ${
              isActive
                ? 'text-sky-400 bg-sky-950/40 border-b-2 border-sky-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <div className="relative flex items-center justify-center">
              <Icon className={`w-4 h-4 mb-0.5 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
              {Boolean(tab.badge && tab.badge > 0) && (
                <span className="absolute -top-1 -right-2 bg-rose-500 text-white text-[9px] font-extrabold px-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full animate-pulse shadow-sm">
                  {tab.badge}
                </span>
              )}
            </div>
            <span className="truncate w-full text-center leading-tight">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
