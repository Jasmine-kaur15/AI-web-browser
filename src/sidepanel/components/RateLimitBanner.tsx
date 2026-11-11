import React, { useEffect, useState } from 'react';
import { Clock, RefreshCw, X, AlertTriangle } from 'lucide-react';

export interface RateLimitState {
  secondsRemaining: number;
  totalSeconds: number;
  attempt: number;
  maxAttempts: number;
  message?: string;
  provider?: string;
}

interface RateLimitBannerProps {
  state: RateLimitState;
  onCancel?: () => void;
}

export const RateLimitBanner: React.FC<RateLimitBannerProps> = ({ state, onCancel }) => {
  const [remaining, setRemaining] = useState(state.secondsRemaining);

  useEffect(() => {
    setRemaining(state.secondsRemaining);
  }, [state.secondsRemaining]);

  useEffect(() => {
    if (remaining <= 0) return;

    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [remaining]);

  const progressPercent = Math.max(
    0,
    Math.min(100, ((state.totalSeconds - remaining) / (state.totalSeconds || 1)) * 100)
  );

  const providerLabel = state.provider === 'gemini' ? 'Google Gemini' : 'Groq';

  return (
    <div className="bg-amber-950/70 border border-amber-500/50 rounded-xl p-3 text-xs text-amber-200 shadow-md space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-900/80 border border-amber-500/40 flex items-center justify-center shrink-0">
            <RefreshCw className="w-3.5 h-3.5 text-amber-300 animate-spin" />
          </div>
          <div>
            <h4 className="font-semibold text-white flex items-center gap-1.5">
              <span>Rate Limit Reset Active</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-900 text-amber-300 border border-amber-600/40">
                Attempt {state.attempt} of {state.maxAttempts}
              </span>
            </h4>
            <p className="text-[11px] text-amber-300/80">
              {providerLabel} API 429 threshold reached.
            </p>
          </div>
        </div>

        {onCancel && (
          <button
            onClick={onCancel}
            className="text-amber-400 hover:text-white p-1 rounded-md transition"
            title="Cancel Request"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] font-mono text-amber-300">
        <span>Resuming in:</span>
        <span className="font-bold text-white text-xs">
          {remaining > 0 ? `${remaining}s` : 'Resuming now...'}
        </span>
      </div>

      {/* Animated Countdown Progress Bar */}
      <div className="w-full bg-slate-900/80 rounded-full h-1.5 overflow-hidden border border-amber-900/60">
        <div
          className="bg-amber-400 h-full transition-all duration-1000 ease-linear rounded-full shadow-[0_0_8px_rgba(251,191,36,0.5)]"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <p className="text-[10.5px] text-amber-300/70 leading-relaxed">
        {state.message || 'Waiting for the provider rate limit window to expire before automatic retry.'}
      </p>
    </div>
  );
};

export default RateLimitBanner;

