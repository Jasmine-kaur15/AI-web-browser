import React from 'react';
import { FileText, Youtube, Camera, RefreshCw, PenLine } from 'lucide-react';

interface QuickActionsProps {
  onSummarizeArticle: () => void;
  onSummarizeYouTube: () => void;
  onCaptureScreen: () => void;
  onDraftReply?: () => void;
  disabled?: boolean;
  isCapturing?: boolean;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  onSummarizeArticle,
  onSummarizeYouTube,
  onCaptureScreen,
  onDraftReply,
  disabled = false,
  isCapturing = false,
}) => {
  return (
    <div className="grid grid-cols-4 gap-1.5 px-3 py-2 bg-slate-950/40 border-b border-slate-800">
      <button
        onClick={onSummarizeArticle}
        disabled={disabled || isCapturing}
        title="Summarize the current article content"
        className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700 text-slate-200 transition text-[10px] font-medium gap-1 disabled:opacity-50"
      >
        <FileText className="w-3.5 h-3.5 text-sky-400" />
        <span>Summarize</span>
      </button>

      <button
        onClick={onSummarizeYouTube}
        disabled={disabled || isCapturing}
        title="Extract and summarize YouTube video transcript"
        className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700 text-slate-200 transition text-[10px] font-medium gap-1 disabled:opacity-50"
      >
        <Youtube className="w-3.5 h-3.5 text-rose-400" />
        <span>YouTube</span>
      </button>

      <button
        onClick={onCaptureScreen}
        disabled={disabled || isCapturing}
        title="Analyze charts, tables, or screen visually"
        className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700 text-slate-200 transition text-[10px] font-medium gap-1 disabled:opacity-50"
      >
        {isCapturing ? (
          <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
        ) : (
          <Camera className="w-3.5 h-3.5 text-emerald-400" />
        )}
        <span>{isCapturing ? 'Capturing...' : 'Screen'}</span>
      </button>

      <button
        onClick={onDraftReply}
        disabled={disabled || isCapturing}
        title="Draft a context-aware reply to selected text"
        className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700 text-slate-200 transition text-[10px] font-medium gap-1 disabled:opacity-50"
      >
        <PenLine className="w-3.5 h-3.5 text-amber-400" />
        <span>Reply</span>
      </button>
    </div>
  );
};


