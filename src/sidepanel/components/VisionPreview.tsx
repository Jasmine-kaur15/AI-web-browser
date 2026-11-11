import React from 'react';
import { Eye, X, BarChart3, TrendingUp, FileText, Bug, Sparkles } from 'lucide-react';
import { ScreenCaptureResult } from '../../shared/types';

export interface VisionPreviewProps {
  screenshot: ScreenCaptureResult;
  onClear: () => void;
  onAskQuestion: (question: string) => void;
  disabled?: boolean;
}

export const VisionPreview: React.FC<VisionPreviewProps> = ({
  screenshot,
  onClear,
  onAskQuestion,
  disabled = false,
}) => {
  const kbSize = screenshot.byteSize ? Math.round(screenshot.byteSize / 1024) : null;

  const quickQuestions = [
    {
      icon: <BarChart3 className="w-3 h-3 text-amber-400 shrink-0" />,
      text: 'Analyze the chart or graph in this screenshot. Provide a clear, fast breakdown with: 1) Chart Type & Title, 2) Key Metrics/Data Points (highest, lowest, current), and 3) Main Trend or Takeaway.',
      label: 'Analyze Chart',
    },
    {
      icon: <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />,
      text: 'Highlight the key trends, peaks, troughs, and outliers shown in this visual chart in clear bullet points.',
      label: 'Key Trends',
    },
    {
      icon: <FileText className="w-3 h-3 text-sky-400 shrink-0" />,
      text: 'Extract and transcribe all key numbers, legend items, and data labels visible in this chart as a structured list.',
      label: 'Extract Data',
    },
    {
      icon: <Bug className="w-3 h-3 text-rose-400 shrink-0" />,
      text: 'Inspect this screen for any visual glitches, data anomalies, or broken UI elements.',
      label: 'Find UI Bugs',
    },
  ];

  return (
    <div className="mx-3 my-2 p-2.5 rounded-xl bg-slate-900/95 border border-sky-500/40 shadow-lg space-y-2 animate-in fade-in duration-150">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-200">
          <Eye className="w-3.5 h-3.5 text-sky-400" />
          <span>Screen Visual Inspection</span>
          {kbSize && (
            <span className="text-[10px] text-slate-400 font-mono font-normal bg-slate-800/80 px-1.5 py-0.2 rounded border border-slate-700">
              {kbSize} KB
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          title="Dismiss screenshot"
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Thumbnail + info preview */}
      <div className="flex items-start gap-2.5">
        <div className="relative group shrink-0">
          <img
            src={screenshot.dataUrl}
            alt="Staged screen capture"
            className="w-24 h-16 object-cover rounded-lg border border-slate-700 shadow-sm group-hover:opacity-90 transition cursor-pointer"
            onClick={() => {
              if (screenshot.dataUrl) {
                const w = window.open('');
                w?.document.write(
                  `<img src="${screenshot.dataUrl}" style="max-width:100%;height:auto;background:#000;" />`
                );
              }
            }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-slate-300 leading-snug">
            Viewport staged for <strong className="text-sky-300">Gemini Multimodal Vision</strong>. Click a suggestion below or type your question:
          </p>
        </div>
      </div>

      {/* Quick Visual Question Chips */}
      <div className="grid grid-cols-2 gap-1.5 pt-1">
        {quickQuestions.map((q) => (
          <button
            key={q.label}
            type="button"
            disabled={disabled}
            onClick={() => onAskQuestion(q.text)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 text-[10px] text-slate-200 font-medium transition text-left disabled:opacity-50"
          >
            {q.icon}
            <span className="truncate">{q.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

