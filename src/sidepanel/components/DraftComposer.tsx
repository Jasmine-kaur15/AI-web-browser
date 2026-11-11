import React, { useState } from 'react';
import {
  PenLine,
  X,
  Copy,
  Check,
  ArrowUpRight,
  Sparkles,
  RefreshCw,
  MessageSquareQuote,
  Briefcase,
  Zap,
  Languages,
  Send,
  ChevronDown,
  Globe,
} from 'lucide-react';
import { ReplyTone, ReplyPlatform } from '../../shared/types';
import { TONE_OPTIONS, PLATFORM_INFO, detectPlatformFromUrl } from '../../shared/prompts';

export interface DraftComposerProps {
  initialText: string;
  pageUrl?: string;
  onClose: () => void;
  onGenerateDraft: (options: {
    selectedText: string;
    tone: ReplyTone;
    platform: ReplyPlatform;
    customInstructions?: string;
  }) => void;
  isGenerating?: boolean;
  generatedDraft?: string;
  onInsertToActiveField?: (text: string) => Promise<{ success: boolean; error?: string }>;
  onSendToChat?: (text: string) => void;
  disabled?: boolean;
}

export const DraftComposer: React.FC<DraftComposerProps> = ({
  initialText,
  pageUrl,
  onClose,
  onGenerateDraft,
  isGenerating = false,
  generatedDraft = '',
  onInsertToActiveField,
  onSendToChat,
  disabled = false,
}) => {
  const [selectedText, setSelectedText] = useState(initialText);
  const [selectedTone, setSelectedTone] = useState<ReplyTone>('professional');
  const [selectedPlatform, setSelectedPlatform] = useState<ReplyPlatform>(
    detectPlatformFromUrl(pageUrl)
  );
  const [customInstructions, setCustomInstructions] = useState('');
  const [editableDraft, setEditableDraft] = useState(generatedDraft);
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);
  const [insertError, setInsertError] = useState<string | null>(null);
  const [showPlatformDropdown, setShowPlatformDropdown] = useState(false);
  const [isSnippetExpanded, setIsSnippetExpanded] = useState(false);

  // Sync draft when parent updates generatedDraft
  React.useEffect(() => {
    setEditableDraft(generatedDraft);
  }, [generatedDraft]);

  const handleCopy = async () => {
    const textToCopy = editableDraft.trim();
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (err) {
      console.warn('[DraftComposer] Clipboard write failed:', err);
    }
  };

  const handleInsert = async () => {
    const textToInsert = editableDraft.trim();
    if (!textToInsert || !onInsertToActiveField) return;

    setInsertError(null);
    const result = await onInsertToActiveField(textToInsert);

    if (result.success) {
      setInserted(true);
      setTimeout(() => setInserted(false), 2500);
    } else {
      // Auto-fallback to clipboard copy if no editable field is focused
      await handleCopy();
      setInsertError('No active input field on page. Copied to clipboard instead!');
      setTimeout(() => setInsertError(null), 4000);
    }
  };

  const handleGenerate = () => {
    if (!selectedText.trim() || isGenerating) return;
    onGenerateDraft({
      selectedText: selectedText.trim(),
      tone: selectedTone,
      platform: selectedPlatform,
      customInstructions: customInstructions.trim() || undefined,
    });
  };

  const charCount = editableDraft.length;
  const wordCount = editableDraft.trim() ? editableDraft.trim().split(/\s+/).length : 0;

  return (
    <div className="mx-3 my-2 p-3 rounded-xl bg-slate-900/95 border border-amber-500/40 shadow-xl space-y-3 animate-in fade-in duration-150">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
          <PenLine className="w-4 h-4 text-amber-400" />
          <span>Draft Reply Tool</span>
        </div>

        {/* Platform Selector Badge */}
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPlatformDropdown((prev) => !prev)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[10px] text-slate-300 hover:text-white transition"
              title="Change target platform"
            >
              <span>{PLATFORM_INFO[selectedPlatform].badge}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showPlatformDropdown && (
              <div className="absolute right-0 top-6 z-20 w-44 rounded-lg bg-slate-900 border border-slate-700 shadow-xl p-1 text-[11px] space-y-0.5">
                {(Object.keys(PLATFORM_INFO) as ReplyPlatform[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setSelectedPlatform(p);
                      setShowPlatformDropdown(false);
                    }}
                    className={`w-full text-left px-2 py-1 rounded flex items-center justify-between transition ${
                      selectedPlatform === p
                        ? 'bg-amber-950/70 text-amber-300 font-semibold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>{PLATFORM_INFO[p].badge}</span>
                    {selectedPlatform === p && <Check className="w-3 h-3 text-amber-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            title="Dismiss draft composer"
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Snippet being replied to */}
      <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-2 text-xs space-y-1">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <MessageSquareQuote className="w-3 h-3 text-amber-400" />
            <span>Replying to:</span>
          </span>
          {selectedText.length > 120 && (
            <button
              type="button"
              onClick={() => setIsSnippetExpanded((prev) => !prev)}
              className="text-sky-400 hover:underline"
            >
              {isSnippetExpanded ? 'Show less' : 'Expand full'}
            </button>
          )}
        </div>
        <blockquote
          className={`text-[11px] text-slate-200 italic border-l-2 border-amber-400/80 pl-2 leading-relaxed ${
            isSnippetExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'
          }`}
        >
          &ldquo;{selectedText}&rdquo;
        </blockquote>
      </div>

      {/* Tone Selection Chips (Milestone 2.5: 4 Specialized Presets) */}
      <div className="space-y-1.5">
        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Select Tone
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {TONE_OPTIONS.map((t) => {
            const isSelected = selectedTone === t.id;
            return (
              <button
                key={t.id}
                type="button"
                disabled={isGenerating || disabled}
                onClick={() => setSelectedTone(t.id)}
                className={`flex items-start gap-1.5 p-2 rounded-lg border text-left transition ${
                  isSelected
                    ? 'bg-amber-950/50 border-amber-500/80 text-amber-200 shadow-sm'
                    : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-700/80 hover:text-white'
                } disabled:opacity-50`}
              >
                <div className="shrink-0 mt-0.5">
                  {t.id === 'professional' && <Briefcase className="w-3 h-3 text-amber-400" />}
                  {t.id === 'concise' && <Zap className="w-3 h-3 text-amber-300" />}
                  {t.id === 'enthusiastic' && <Sparkles className="w-3 h-3 text-emerald-400" />}
                  {t.id === 'hinglish' && <Languages className="w-3 h-3 text-sky-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium leading-tight truncate">{t.label}</div>
                  <div className="text-[9px] text-slate-400 leading-tight truncate mt-0.5">
                    {t.tagline}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Optional Custom Instructions Input */}
      <div>
        <input
          type="text"
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          placeholder="Specific guidance (e.g. 'Decline politely', 'Ask for meeting link')..."
          disabled={isGenerating || disabled}
          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/70"
        />
      </div>

      {/* Generate / Regenerate Action Trigger */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || disabled || !selectedText.trim()}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-semibold text-xs shadow-md transition disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Drafting Reply...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>{editableDraft ? 'Regenerate Reply' : 'Generate Reply Draft'}</span>
            </>
          )}
        </button>
      </div>

      {/* Generated Draft Output (Editable with 1-Click Copy and Insert) */}
      {(editableDraft || isGenerating) && (
        <div className="space-y-1.5 pt-1 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-[10px] text-slate-400 px-0.5">
            <span className="font-semibold text-slate-300">Generated Reply Draft:</span>
            <span className="font-mono text-[9px] text-slate-400">
              {wordCount} words · {charCount} chars
            </span>
          </div>

          <textarea
            value={editableDraft}
            onChange={(e) => setEditableDraft(e.target.value)}
            disabled={isGenerating}
            rows={4}
            className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 resize-y focus:outline-none focus:border-sky-500/70 font-sans leading-relaxed shadow-inner"
            placeholder={isGenerating ? 'AI is composing your reply draft...' : 'Your draft will appear here...'}
          />

          {insertError && (
            <div className="text-[10px] text-amber-300 bg-amber-950/60 border border-amber-800/80 rounded px-2 py-1">
              {insertError}
            </div>
          )}

          {/* Action Button Bar: Copy, Insert, Chat */}
          <div className="flex items-center gap-1.5 pt-0.5">
            {/* 1-Click Copy Button */}
            <button
              type="button"
              onClick={handleCopy}
              disabled={!editableDraft.trim() || isGenerating}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold border transition ${
                copied
                  ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              } disabled:opacity-50`}
              title="Copy draft to system clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy to Clipboard</span>
                </>
              )}
            </button>

            {/* 1-Click Insert into Active Field Button */}
            {onInsertToActiveField && (
              <button
                type="button"
                onClick={handleInsert}
                disabled={!editableDraft.trim() || isGenerating}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold border transition ${
                  inserted
                    ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                    : 'bg-sky-950/80 hover:bg-sky-900 border-sky-600/70 text-sky-200'
                } disabled:opacity-50`}
                title="Insert reply into active input field on current webpage"
              >
                {inserted ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Inserted into Page!</span>
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="w-3.5 h-3.5 text-sky-400" />
                    <span>Insert into Page</span>
                  </>
                )}
              </button>
            )}

            {/* Optional Send to Chat */}
            {onSendToChat && (
              <button
                type="button"
                onClick={() => {
                  onSendToChat(editableDraft);
                  onClose();
                }}
                disabled={!editableDraft.trim() || isGenerating}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white transition"
                title="Send reply to chat conversation"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

