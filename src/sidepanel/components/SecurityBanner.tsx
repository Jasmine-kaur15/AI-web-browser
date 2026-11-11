import React from 'react';
import {
  ShieldAlert,
  Lock,
  Landmark,
  KeyRound,
  FileBadge2,
  ExternalLink,
  Info,
  CheckCircle2,
} from 'lucide-react';
import type { SecurityAssessment } from '../../shared/types';

interface SecurityBannerProps {
  assessment: SecurityAssessment;
  compact?: boolean;
  onNavigateToChat?: () => void;
  onAllowLocalhost?: () => void;
}

export const SecurityBanner: React.FC<SecurityBannerProps> = ({
  assessment,
  compact = false,
  onNavigateToChat,
  onAllowLocalhost,
}) => {
  const getCategoryDetails = () => {
    switch (assessment.category) {
      case 'banking':
        return {
          title: 'Financial & Banking Security',
          badge: 'Banking & Fintech',
          badgeClass: 'bg-amber-950/80 text-amber-400 border-amber-500/50',
          icon: <Landmark className="w-4 h-4 text-amber-400" />,
          borderClass: 'border-amber-500/40 bg-amber-950/20',
        };
      case 'auth':
        return {
          title: 'Authentication & SSO Security',
          badge: 'Login & Credentials',
          badgeClass: 'bg-indigo-950/80 text-indigo-400 border-indigo-500/50',
          icon: <KeyRound className="w-4 h-4 text-indigo-400" />,
          borderClass: 'border-indigo-500/40 bg-indigo-950/20',
        };
      case 'government':
        return {
          title: 'Government Identity & Tax Security',
          badge: 'Government & Tax Portal',
          badgeClass: 'bg-emerald-950/80 text-emerald-400 border-emerald-500/50',
          icon: <FileBadge2 className="w-4 h-4 text-emerald-400" />,
          borderClass: 'border-emerald-500/40 bg-emerald-950/20',
        };
      case 'password_detected':
        return {
          title: 'Credential Input Protection',
          badge: 'Password Field Detected',
          badgeClass: 'bg-rose-950/80 text-rose-400 border-rose-500/50',
          icon: <Lock className="w-4 h-4 text-rose-400" />,
          borderClass: 'border-rose-500/40 bg-rose-950/20',
        };
      case 'restricted_browser':
      default:
        return {
          title: 'System Protected Page',
          badge: 'Internal Browser Page',
          badgeClass: 'bg-slate-800 text-slate-300 border-slate-600',
          icon: <Lock className="w-4 h-4 text-slate-400" />,
          borderClass: 'border-slate-700 bg-slate-900/60',
        };
    }
  };

  const details = getCategoryDetails();

  if (compact) {
    return (
      <div
        className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs ${details.borderClass}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="shrink-0">{details.icon}</div>
          <div className="truncate">
            <span className="font-semibold text-slate-200">Sahayak Paused: </span>
            <span className="text-slate-400">{assessment.reason}</span>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${details.badgeClass}`}>
          {details.badge}
        </span>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-2xl border ${details.borderClass} space-y-3.5 shadow-lg`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-slate-900/90 border border-slate-700/80 flex items-center justify-center shrink-0 shadow-sm">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
              <span>Sahayak is Paused for Your Safety</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {details.title}
            </p>
          </div>
        </div>

        <span
          className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${details.badgeClass}`}
        >
          {details.badge}
        </span>
      </div>

      {/* Main message */}
      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2 text-xs">
        <p className="text-slate-300 font-medium leading-relaxed">
          {assessment.advice || 'Sahayak is paused for your safety on this sensitive page.'}
        </p>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Automated Set-of-Marks mapping, form autofilling, and DOM action execution are strictly disabled on this page to protect your passwords, identity, and financial transactions.
        </p>
        {assessment.domain && (
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 pt-1">
            <span className="text-slate-500">Domain:</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-400">
              {assessment.domain}
            </span>
          </div>
        )}
      </div>

      {/* Safety Guardrails Checklist */}
      <div className="space-y-1.5 text-[11px] text-slate-400 px-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Passwords, OTPs, and CVVs are never captured or automated</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Zero cloud relay: BYOK keys remain strictly in local storage</span>
        </div>
      </div>

      {/* Action footer */}
      <div className="pt-1 flex items-center justify-between gap-2">
        {onAllowLocalhost && (assessment.domain === 'localhost' || assessment.domain === '127.0.0.1') ? (
          <button
            onClick={onAllowLocalhost}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition flex items-center gap-1.5 shadow-sm"
          >
            <span>⚡ Enable Practice on Localhost</span>
          </button>
        ) : <div />}

        {onNavigateToChat && (
          <button
            onClick={onNavigateToChat}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            Switch to Chat View
          </button>
        )}
      </div>
    </div>
  );
};

export default SecurityBanner;

