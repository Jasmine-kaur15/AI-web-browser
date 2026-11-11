import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, AlertCircle, Key, Globe, Youtube, RefreshCw } from 'lucide-react';
import {
  ChatMessage,
  LanguageMode,
  ScreenCaptureResult,
  ReplyTone,
  ReplyPlatform,
} from '../../shared/types';
import { MessageItem } from './MessageItem';
import { VisionPreview } from './VisionPreview';
import { DraftComposer } from './DraftComposer';

export interface PageContextInfo {
  title: string;
  url: string;
  wordCount: number;
  isYouTube?: boolean;
}

export interface DraftComposerState {
  isOpen: boolean;
  selectedText: string;
  pageUrl?: string;
  tone: ReplyTone;
  platform: ReplyPlatform;
  customInstructions?: string;
  generatedDraft: string;
  isGenerating: boolean;
}

interface ChatViewProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, screenshot?: ScreenCaptureResult | null) => void;
  isStreaming?: boolean;
  hasApiKey: boolean;
  onOpenSettings: () => void;
  activeContext?: PageContextInfo | null;
  onRefreshContext?: () => void;
  lang?: LanguageMode;
  stagedScreenshot?: ScreenCaptureResult | null;
  onClearStagedScreenshot?: () => void;
  draftState?: DraftComposerState | null;
  onCloseDraft?: () => void;
  onGenerateDraft?: (options: {
    selectedText: string;
    tone: ReplyTone;
    platform: ReplyPlatform;
    customInstructions?: string;
  }) => void;
  onInsertDraftToPage?: (text: string) => Promise<{ success: boolean; error?: string }>;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  onSendMessage,
  isStreaming = false,
  hasApiKey,
  onOpenSettings,
  activeContext,
  onRefreshContext,
  lang = 'en',
  stagedScreenshot,
  onClearStagedScreenshot,
  draftState,
  onCloseDraft,
  onGenerateDraft,
  onInsertDraftToPage,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming, stagedScreenshot, draftState?.isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasApiKey) {
      onOpenSettings();
      return;
    }
    if (!input.trim() || isStreaming) return;
    onSendMessage(input.trim(), stagedScreenshot);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-900">
      {/* Missing API Key Warning */}
      {!hasApiKey && (
        <div className="mx-3 mt-3 p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 flex items-start gap-2.5 text-xs text-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold block mb-0.5">AI API Key Required</span>
            Sahayak runs entirely client-side using Bring-Your-Own-Key (Groq or Gemini).
            <button
              onClick={onOpenSettings}
              className="mt-1.5 flex items-center gap-1 text-sky-400 font-semibold underline hover:text-sky-300"
            >
              <Key className="w-3 h-3" />
              <span>Add Free API Key (Groq / Gemini) in Settings &rarr;</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Grounded Context Banner */}
      {hasApiKey && activeContext && (
        <div className="mx-3 mt-2 px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 flex items-center justify-between text-[11px] text-slate-300 shadow-sm">
          <div className="flex items-center gap-1.5 min-w-0">
            {activeContext.isYouTube ? (
              <Youtube className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            ) : (
              <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            )}
            <span className="text-slate-400 shrink-0">Grounded to:</span>
            <span className="font-semibold text-white truncate max-w-[170px]" title={activeContext.title}>
              {activeContext.title || 'Active Tab'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-sky-400 font-mono bg-sky-950/80 border border-sky-800/60 px-1.5 py-0.2 rounded">
              {activeContext.wordCount} words
            </span>
            {onRefreshContext && (
              <button
                onClick={onRefreshContext}
                className="text-slate-400 hover:text-white transition p-0.5"
                title="Re-scan active page"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 select-none">
            <div className="w-12 h-12 rounded-2xl bg-sky-950/50 border border-sky-800/50 flex items-center justify-center mb-3 text-sky-400 shadow-inner">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-200 mb-1">
              {lang === 'hinglish' ? 'Grounded Sahayak (Hinglish Mode)' : 'Grounded Page Assistant'}
            </h3>
            <p className="text-xs text-slate-400 max-w-[250px] leading-relaxed mb-3">
              {lang === 'hinglish'
                ? 'Open page ya YouTube video ke baare me sawal poochhein. Sahayak page context ke aadhar par jawab dega.'
                : 'Ask anything about the open page or YouTube video. Sahayak answers strictly using page context.'}
            </p>
            <div className="text-[11px] text-slate-500 bg-slate-950/60 border border-slate-800/80 rounded-lg px-2.5 py-1.5 max-w-[240px]">
              {lang === 'hinglish'
                ? 'Tip: Agar koi fact is page par nahi hai, toh Sahayak hallucinate nahi karega aur seedhe bata dega.'
                : 'Tip: If a fact is not on the page, Sahayak explicitly flags it to prevent hallucinations.'}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageItem key={msg.id} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Milestone 2.4: Staged Viewport Vision Preview & Quick Question Chips */}
      {stagedScreenshot && (
        <VisionPreview
          screenshot={stagedScreenshot}
          onClear={onClearStagedScreenshot || (() => {})}
          onAskQuestion={(question) => {
            onSendMessage(question, stagedScreenshot);
          }}
          disabled={isStreaming}
        />
      )}

      {/* Milestone 2.5: Selection-Aware Draft Reply Composer */}
      {draftState?.isOpen && (
        <DraftComposer
          initialText={draftState.selectedText}
          pageUrl={draftState.pageUrl}
          onClose={onCloseDraft || (() => {})}
          onGenerateDraft={onGenerateDraft || (() => {})}
          isGenerating={draftState.isGenerating}
          generatedDraft={draftState.generatedDraft}
          onInsertToActiveField={onInsertDraftToPage}
          onSendToChat={(draft) => onSendMessage(draft)}
          disabled={isStreaming}
        />
      )}

      {/* Input Box */}
      <form onSubmit={handleSubmit} className="p-3 bg-slate-950 border-t border-slate-800 shrink-0">
        <div className="relative flex items-center">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !hasApiKey
                ? lang === 'hinglish'
                  ? 'Chat shuru karne ke liye Settings me API Key dalein...'
                  : 'Configure Gemini API Key in Settings to chat...'
                : stagedScreenshot
                ? lang === 'hinglish'
                  ? 'Is screenshot ke baare me sawaal poochhein (e.g. chart, data, errors)...'
                  : 'Ask about this screenshot (charts, data, errors)...'
                : activeContext?.isYouTube
                ? lang === 'hinglish'
                  ? 'Is YouTube video ke baare me poochhein...'
                  : 'Ask about this YouTube video...'
                : lang === 'hinglish'
                ? 'Is page ke baare me poochhein...'
                : 'Ask about this page...'
            }
            rows={1}
            disabled={!hasApiKey || isStreaming}
            className={`input-field pr-10 resize-none max-h-24 py-2 ${
              !hasApiKey ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          />
          <button
            type="submit"
            disabled={!hasApiKey || !input.trim() || isStreaming}
            className="absolute right-1.5 p-1.5 rounded-md bg-sky-500 hover:bg-sky-400 text-white disabled:opacity-30 disabled:hover:bg-sky-500 transition shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
};
