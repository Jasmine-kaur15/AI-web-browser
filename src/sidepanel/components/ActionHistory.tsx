import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Trash2,
} from 'lucide-react';
import { ActionLogEntry } from '../../shared/types';

export interface ActionHistoryProps {
  history: ActionLogEntry[];
  onClearHistory?: () => void;
}

export const ActionHistory: React.FC<ActionHistoryProps> = ({ history, onClearHistory }) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!history || history.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-slate-500">
        <Clock className="w-6 h-6 text-slate-600 mx-auto mb-2 opacity-50" />
        No actions executed yet.
      </div>
    );
  }

  const handleCopyHistory = () => {
    const textReport = history
      .map(
        (h) =>
          `Step ${h.stepNumber}: [${h.status}] ${h.action.actionType}${
            h.action.targetElementId ? ` on #${h.action.targetElementId}` : ''
          }${h.action.value ? ` with value "${h.action.value}"` : ''} - ${h.userExplanation} (${new Date(
            h.timestamp
          ).toLocaleTimeString()})`
      )
      .join('\n');

    navigator.clipboard.writeText(textReport).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const getBadgeStyle = (actionType: string) => {
    switch (actionType) {
      case 'CLICK':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
      case 'TYPE':
        return 'bg-sky-500/20 text-sky-400 border-sky-500/40';
      case 'SELECT':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'SCROLL':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/40';
      case 'COMPLETED':
        return 'bg-teal-500/20 text-teal-400 border-teal-500/40';
      default:
        return 'bg-slate-700 text-slate-300 border-slate-600';
    }
  };

  return (
    <div className="p-3 space-y-2">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-1 border-b border-slate-800">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
          <Clock className="w-3.5 h-3.5 text-sky-400" />
          <span>Execution Audit Log ({history.length})</span>
        </div>

        <div className="flex items-center gap-1">
          {onClearHistory && (
            <button
              onClick={onClearHistory}
              title="Clear audit log"
              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition text-[11px] flex items-center gap-1 px-1.5"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}

          <button
            onClick={handleCopyHistory}
            title="Copy audit log to clipboard"
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition text-[11px] flex items-center gap-1 px-1.5"
          >
            {isCopied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand audit log' : 'Collapse audit log'}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Log entries */}
      {!isCollapsed && (
        <div className="space-y-2 pt-1">
          {history.map((entry) => (
            <div
              key={entry.id}
              className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs flex items-start gap-2.5 transition hover:border-slate-600"
            >
              {entry.status === 'EXECUTED' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : entry.status === 'SKIPPED' ? (
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-200">
                      Step {entry.stepNumber}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full border ${getBadgeStyle(
                        entry.action.actionType
                      )}`}
                    >
                      {entry.action.actionType}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(entry.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>

                {entry.action.targetElementId !== undefined && (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-300 my-1">
                    <span className="px-1.5 py-0.2 rounded bg-yellow-400 text-black font-extrabold text-[10px]">
                      #{entry.action.targetElementId}
                    </span>
                    {entry.targetLabel && (
                      <span className="text-slate-300 font-medium truncate">
                        {entry.targetLabel}
                      </span>
                    )}
                  </div>
                )}

                <p className="text-slate-400 text-[11px] leading-relaxed">
                  {entry.userExplanation}
                </p>

                {entry.action.value && (
                  <div className="mt-1.5 font-mono text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-300 inline-block max-w-full truncate">
                    Value: "{entry.action.value}"
                  </div>
                )}

                {entry.error && (
                  <div className="mt-1 text-[10px] text-rose-400 font-medium">
                    Error: {entry.error}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
