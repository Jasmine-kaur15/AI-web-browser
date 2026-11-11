import React, { useState, useEffect, useCallback } from 'react';
import {
  Check,
  FastForward,
  Square,
  AlertTriangle,
  Edit3,
  Crosshair,
  CheckCircle2,
  AlertCircle,
  CornerDownLeft,
} from 'lucide-react';
import { LLMActionProposalResponse, ProposedAction } from '../../shared/types';
import { MESSAGE_TYPES } from '../../shared/constants';
import { MarkdownRenderer } from './MarkdownRenderer';

export interface HITLApprovalProps {
  proposal: LLMActionProposalResponse;
  stepNumber: number;
  totalSteps?: number;
  onApprove: (actionOverride?: ProposedAction) => void;
  onSkip: () => void;
  onStop: () => void;
  isExecuting?: boolean;
}

/**
 * Regex detecting sensitive, irreversible, or high-consequence user actions
 * (e.g., payments, account deletion, irreversible form submissions).
 */
export const IRREVERSIBLE_ACTION_REGEX =
  /(pay|payment|purchase|buy|checkout|order|subscribe|submit|send|transfer|delete|remove|destroy|cancel membership)/i;

/**
 * Checks whether the proposed action is potentially irreversible or critical.
 */
export function isIrreversibleAction(action?: ProposedAction, userExplanation = ''): boolean {
  if (!action) return false;
  const targetText = `${action.targetLabel || ''} ${action.value || ''} ${userExplanation}`;
  return IRREVERSIBLE_ACTION_REGEX.test(targetText);
}

export const HITLApproval: React.FC<HITLApprovalProps> = ({
  proposal,
  stepNumber,
  totalSteps,
  onApprove,
  onSkip,
  onStop,
  isExecuting = false,
}) => {
  const action = proposal.action;
  const [editedValue, setEditedValue] = useState(action?.value || '');

  // Synchronize local input state whenever a new action proposal arrives
  useEffect(() => {
    setEditedValue(action?.value || '');
  }, [action?.value, action?.targetElementId]);

  // Highlight the target element on the active tab whenever a proposal is shown
  const triggerPageHighlight = useCallback(() => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query && action?.targetElementId) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: MESSAGE_TYPES.HIGHLIGHT_ELEMENT,
            payload: { targetElementId: action.targetElementId },
          }).catch(() => {});
        }
      });
    }
  }, [action?.targetElementId]);

  useEffect(() => {
    triggerPageHighlight();
  }, [triggerPageHighlight]);

  const handleApprove = useCallback(() => {
    if (isExecuting) return;
    if (action?.actionType === 'TYPE' || action?.actionType === 'SELECT') {
      onApprove({
        ...action,
        value: editedValue,
      });
    } else {
      onApprove(action);
    }
  }, [action, editedValue, isExecuting, onApprove]);

  // Keyboard shortcut handler: Enter to approve, Esc to stop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isExecuting) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onStop();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        // Prevent accidental submission if user is multiline typing in a textarea
        const activeTag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
        if (activeTag === 'textarea') return;

        e.preventDefault();
        handleApprove();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleApprove, onStop, isExecuting]);

  const getActionColor = (type?: string) => {
    switch (type) {
      case 'CLICK':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
      case 'TYPE':
        return 'bg-sky-500/20 text-sky-400 border-sky-500/40';
      case 'SELECT':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'SCROLL':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/40';
      case 'WAIT':
        return 'bg-slate-700/40 text-slate-300 border-slate-600';
      case 'COMPLETED':
        return 'bg-teal-500/20 text-teal-400 border-teal-500/40';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  // Case 1: Task Completed State
  if (proposal.status === 'TASK_COMPLETED') {
    return (
      <div className="m-3 p-4 rounded-xl glass-panel border border-emerald-500/40 bg-emerald-950/20 shadow-lg text-slate-200">
        <div className="flex items-center gap-2 mb-2 text-emerald-400">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <h3 className="text-xs font-bold uppercase tracking-wider">Goal Accomplished!</h3>
        </div>
        <div className="text-xs text-slate-300 leading-relaxed mb-4">
          <MarkdownRenderer content={proposal.userExplanation || 'The browser task has been completed successfully.'} />
        </div>
        <button
          onClick={onStop}
          className="btn-primary w-full text-xs py-2 bg-emerald-600 hover:bg-emerald-500"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Finish Task</span>
        </button>
      </div>
    );
  }

  // Case 2: Cannot Proceed State
  if (proposal.status === 'CANNOT_PROCEED') {
    return (
      <div className="m-3 p-4 rounded-xl glass-panel border border-rose-500/40 bg-rose-950/20 shadow-lg text-slate-200">
        <div className="flex items-center gap-2 mb-2 text-rose-400">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <h3 className="text-xs font-bold uppercase tracking-wider">Task Paused</h3>
        </div>
        <div className="text-xs text-slate-300 leading-relaxed mb-4">
          <MarkdownRenderer content={proposal.userExplanation || 'Cannot proceed with the next browser action.'} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onSkip} className="btn-secondary flex-1 text-xs py-2">
            <FastForward className="w-3.5 h-3.5 text-amber-400" />
            <span>Try Alternative</span>
          </button>
          <button
            onClick={onStop}
            className="btn-secondary text-xs py-2 px-3 hover:text-rose-400 hover:border-rose-800"
          >
            <Square className="w-3.5 h-3.5 text-rose-500" />
            <span>Stop</span>
          </button>
        </div>
      </div>
    );
  }

  const isIrreversible = isIrreversibleAction(action, proposal.userExplanation);

  return (
    <div className="m-3 p-4 rounded-xl glass-panel border border-sky-500/30 bg-slate-800/90 shadow-xl animate-in fade-in duration-200">
      {/* Header: Step Number & Action Type */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">
            Step {stepNumber}
            {totalSteps ? ` of ${totalSteps}` : ''}
          </span>
          <span className="text-[10px] text-slate-500 font-medium">Supervisor Approval</span>
        </div>
        <span
          className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${getActionColor(
            action?.actionType
          )}`}
        >
          {action?.actionType || 'ACTION'}
        </span>
      </div>

      {/* Irreversible Action Warning Banner */}
      {isIrreversible && (
        <div className="mb-3 p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/50 flex items-start gap-2 text-amber-300 text-xs leading-snug">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <span className="font-bold block text-amber-200">Critical Action Warning:</span>
            This action may be irreversible (e.g. submit or purchase). Please verify carefully.
          </div>
        </div>
      )}

      {/* Target & Action Details */}
      <div className="space-y-2.5 mb-4">
        {action?.targetElementId !== undefined && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-700/50 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="px-1.5 py-0.5 rounded bg-yellow-400 text-black font-extrabold text-[11px] shrink-0">
                #{action.targetElementId}
              </span>
              <span className="font-medium text-slate-200 truncate" title={action.targetLabel || 'Interactive Element'}>
                {action.targetLabel || 'Target Element'}
              </span>
            </div>

            <button
              onClick={triggerPageHighlight}
              title="Locate and pulse outline on webpage"
              className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded hover:bg-sky-950/50 transition"
            >
              <Crosshair className="w-3 h-3" />
              <span>Locate</span>
            </button>
          </div>
        )}

        {/* Editable Value for TYPE actions */}
        {action?.actionType === 'TYPE' && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                <Edit3 className="w-3 h-3 text-sky-400" />
                <span>Text to Type:</span>
              </label>
              <span className="text-[10px] text-slate-500">Editable before approval</span>
            </div>
            <input
              type="text"
              value={editedValue}
              onChange={(e) => setEditedValue(e.target.value)}
              disabled={isExecuting}
              placeholder="Enter text value..."
              className="w-full text-xs py-2 px-3 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition"
            />
          </div>
        )}

        {/* Editable Value for SELECT actions */}
        {action?.actionType === 'SELECT' && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                <Edit3 className="w-3 h-3 text-amber-400" />
                <span>Option to Select:</span>
              </label>
              <span className="text-[10px] text-slate-500">Editable</span>
            </div>
            <input
              type="text"
              value={editedValue}
              onChange={(e) => setEditedValue(e.target.value)}
              disabled={isExecuting}
              placeholder="Enter or choose option..."
              className="w-full text-xs py-2 px-3 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
            />
          </div>
        )}

        {/* Scroll Direction Detail */}
        {action?.actionType === 'SCROLL' && (
          <div className="text-xs text-purple-300 font-mono p-2 rounded bg-purple-950/30 border border-purple-800/40">
            Scroll Direction: <span className="font-bold">{action.scrollDirection || 'DOWN'}</span>
          </div>
        )}

        {/* AI Action Rationale & Plan */}
        <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-700/60 text-xs text-slate-300 leading-relaxed space-y-1.5">
          <span className="font-semibold text-slate-200 block flex items-center gap-1.5">
            <span className="text-sky-400 font-bold">💡</span>
            <span>AI Action Rationale & Plan:</span>
          </span>
          <div className="text-xs text-slate-200 leading-relaxed">
            <MarkdownRenderer content={proposal.userExplanation} />
          </div>
        </div>
      </div>

      {/* Action Buttons with Keyboard Shortcuts */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-700/60">
        <button
          onClick={handleApprove}
          disabled={isExecuting}
          className="btn-primary flex-1 text-xs py-2 shadow-md flex items-center justify-center gap-1.5"
          title="Approve this action (Enter)"
        >
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>{isExecuting ? 'Executing...' : 'Approve'}</span>
          <span className="text-[10px] opacity-75 font-mono ml-0.5 flex items-center">
            (↵)
          </span>
        </button>

        <button
          onClick={onSkip}
          disabled={isExecuting}
          title="Skip this step and request an alternative"
          className="btn-secondary text-xs py-2 px-3 flex items-center gap-1"
        >
          <FastForward className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Skip</span>
        </button>

        <button
          onClick={onStop}
          disabled={isExecuting}
          title="Abort task and clear badges (Esc)"
          className="btn-secondary text-xs py-2 px-3 hover:bg-rose-950/40 hover:text-rose-400 hover:border-rose-800 flex items-center gap-1"
        >
          <Square className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span>Stop</span>
          <span className="text-[10px] text-slate-500 font-mono ml-0.5">Esc</span>
        </button>
      </div>
    </div>
  );
};
