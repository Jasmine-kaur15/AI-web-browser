import React, { useEffect } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X, RefreshCw } from 'lucide-react';

export type ToastType = 'error' | 'warning' | 'info' | 'success';

export interface ToastData {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  isRateLimit?: boolean;
  onRetry?: () => void;
  durationMs?: number;
}

interface ToastNotificationProps {
  toast: ToastData | null;
  onClose: () => void;
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({ toast, onClose }) => {
  useEffect(() => {
    if (!toast) return;

    // Default duration: 6s for normal toasts, 9s for rate limits
    const duration = toast.durationMs ?? (toast.isRateLimit ? 9000 : 6000);
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const stylesConfig = {
    error: {
      bg: 'bg-rose-950/90 border-rose-800 text-rose-100',
      icon: <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />,
      titleColor: 'text-rose-200',
    },
    warning: {
      bg: 'bg-amber-950/90 border-amber-800 text-amber-100',
      icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />,
      titleColor: 'text-amber-200',
    },
    info: {
      bg: 'bg-sky-950/90 border-sky-800 text-sky-100',
      icon: <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />,
      titleColor: 'text-sky-200',
    },
    success: {
      bg: 'bg-emerald-950/90 border-emerald-800 text-emerald-100',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />,
      titleColor: 'text-emerald-200',
    },
  };

  const currentStyle = stylesConfig[toast.type];

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-14 left-3 right-3 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <div
        className={`flex items-start gap-2.5 p-3 rounded-xl border backdrop-blur-md shadow-2xl ${currentStyle.bg}`}
      >
        {currentStyle.icon}

        <div className="flex-1 min-w-0">
          {toast.title && (
            <h4 className={`text-xs font-bold leading-tight mb-0.5 ${currentStyle.titleColor}`}>
              {toast.title}
            </h4>
          )}
          <p className="text-[11px] leading-relaxed break-words opacity-95">
            {toast.message}
          </p>

          {toast.onRetry && (
            <button
              onClick={() => {
                toast.onRetry?.();
                onClose();
              }}
              className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-white/10 hover:bg-white/20 text-white transition border border-white/20"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry Now</span>
            </button>
          )}
        </div>

        <button
          onClick={onClose}
          aria-label="Dismiss notification"
          className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
