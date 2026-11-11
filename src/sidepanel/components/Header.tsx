import React from 'react';
import { Settings, Sparkles } from 'lucide-react';
import { LanguageMode } from '../../shared/types';

export type AgentStatus = 'active' | 'idle' | 'busy';

export interface HeaderProps {
  currentLang: LanguageMode;
  onToggleLang: () => void;
  onSetLang?: (lang: LanguageMode) => void;
  onOpenSettings: () => void;
  status?: AgentStatus;
  isBusy?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentLang,
  onToggleLang,
  onSetLang,
  onOpenSettings,
  status,
  isBusy = false,
}) => {
  // Resolve active status: prioritize explicit status prop, fallback to isBusy
  const resolvedStatus: AgentStatus = status || (isBusy ? 'busy' : 'active');

  const statusConfig: Record<
    AgentStatus,
    { dotColor: string; pingColor: string; label: string; textColor: string }
  > = {
    active: {
      dotColor: 'bg-emerald-400',
      pingColor: 'bg-emerald-400',
      label: 'Active',
      textColor: 'text-emerald-400',
    },
    idle: {
      dotColor: 'bg-slate-400',
      pingColor: 'bg-slate-400',
      label: 'Idle',
      textColor: 'text-slate-400',
    },
    busy: {
      dotColor: 'bg-amber-400',
      pingColor: 'bg-amber-400',
      label: 'Busy',
      textColor: 'text-amber-400',
    },
  };

  const currentStatusConfig = statusConfig[resolvedStatus];

  const handleSegmentClick = (lang: LanguageMode, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSetLang) {
      onSetLang(lang);
    } else if (currentLang !== lang) {
      onToggleLang();
    }
  };

  return (
    <header className="glass-header px-3 py-2 flex items-center justify-between select-none sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md">
      {/* Brand & Live Status Dot */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-sky-500 via-sky-600 to-indigo-600 flex items-center justify-center shadow-md shadow-sky-500/20 shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="font-bold text-xs tracking-tight text-white truncate">Sahayak</h1>
            <span className="text-[9px] text-sky-400 font-semibold px-1 py-0.2 rounded bg-sky-950/80 border border-sky-800/70 shrink-0 leading-tight">
              सहायक
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] leading-tight mt-0.5">
            <span className="relative flex h-2 w-2 shrink-0">
              {resolvedStatus !== 'idle' && (
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${currentStatusConfig.pingColor}`}
                />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${currentStatusConfig.dotColor} ${
                  resolvedStatus === 'busy' ? 'animate-pulse' : ''
                }`}
              />
            </span>
            <span className={`font-medium ${currentStatusConfig.textColor}`}>
              {currentStatusConfig.label}
            </span>
          </div>
        </div>
      </div>

      {/* Language Toggle Pill & Settings Button */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Quick Language Toggle Pill [ EN | HI-EN ] */}
        <div
          role="group"
          aria-label="Toggle response language"
          className="flex items-center bg-slate-950/80 border border-slate-700/80 rounded-full p-0.5 shadow-inner"
        >
          <button
            type="button"
            onClick={(e) => handleSegmentClick('en', e)}
            className={`px-2 py-0.5 text-[10px] font-bold rounded-full transition-all duration-150 ${
              currentLang === 'en'
                ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="English Response Mode"
          >
            EN
          </button>
          <button
            type="button"
            onClick={(e) => handleSegmentClick('hinglish', e)}
            className={`px-2 py-0.5 text-[10px] font-bold rounded-full transition-all duration-150 ${
              currentLang === 'hinglish'
                ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Hinglish (Hindi-English) Response Mode"
          >
            HI-EN
          </button>
        </div>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          title="Settings & BYOK API Key"
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white border border-transparent hover:border-slate-700 transition shrink-0"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
