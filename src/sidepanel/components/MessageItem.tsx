import React, { useState } from 'react';
import {
  Bot,
  User,
  Copy,
  Check,
  HelpCircle,
  Languages,
  MessageSquareQuote,
  Camera,
} from 'lucide-react';
import { ChatMessage } from '../../shared/types';
import { getContextActionTitle } from '../hooks/useExtensionMsg';
import { MarkdownRenderer } from './MarkdownRenderer';

interface MessageItemProps {
  message: ChatMessage;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  const isAssistant = message.role === 'assistant';

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`flex gap-2.5 group message-enter ${isAssistant ? 'justify-start' : 'justify-end'
        }`}
    >
      {/* Assistant Avatar */}
      {isAssistant && (
        <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5 text-white shadow-sm shadow-sky-500/20">
          <Bot className="w-3.5 h-3.5" />
        </div>
      )}

      {/* Message Bubble Container */}
      <div className="relative max-w-[85%]">
        <div
          className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${isAssistant
              ? 'bg-slate-800/95 text-slate-100 rounded-bl-none border border-slate-700/80 shadow-md'
              : 'bg-sky-600 text-white rounded-br-none shadow-md'
            }`}
        >
          {isAssistant ? (
            <div className="break-words">
              <MarkdownRenderer
                content={message.content}
                isStreaming={message.isStreaming}
              />
            </div>
          ) : (
            <div className="space-y-2">
              {message.contextAction && (
                <div className="p-2.5 rounded-lg bg-sky-950/70 border border-sky-400/40 space-y-1.5 shadow-inner">
                  <div className="flex items-center justify-between gap-1 text-[11px] font-semibold text-sky-200">
                    <div className="flex items-center gap-1.5">
                      {message.contextAction.action === 'sahayak-explain' && (
                        <HelpCircle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                      )}
                      {message.contextAction.action === 'sahayak-translate' && (
                        <Languages className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                      )}
                      {message.contextAction.action === 'sahayak-reply' && (
                        <MessageSquareQuote className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                      )}
                      <span>{getContextActionTitle(message.contextAction.action)}</span>
                    </div>
                    {message.contextAction.pageUrl && (
                      <span className="text-[9px] text-sky-300/70 truncate max-w-[110px] font-mono">
                        {(() => {
                          try {
                            return new URL(message.contextAction.pageUrl).hostname;
                          } catch {
                            return '';
                          }
                        })()}
                      </span>
                    )}
                  </div>
                  <blockquote className="text-[11px] text-sky-100/90 italic border-l-2 border-sky-400 pl-2 py-0.5 line-clamp-3 bg-slate-900/40 rounded-r">
                    &ldquo;{message.contextAction.selectedText}&rdquo;
                  </blockquote>
                </div>
              )}
              {/* Milestone 2.3: Captured Viewport Preview */}
              {message.screenshot?.dataUrl && (
                <div className="rounded-lg overflow-hidden border border-sky-400/30 bg-slate-950/70 shadow-sm">
                  <div className="flex items-center justify-between px-2.5 py-1 bg-slate-900/80 border-b border-slate-800 text-[10px] text-slate-300">
                    <span className="flex items-center gap-1 font-medium text-emerald-400">
                      <Camera className="w-3 h-3" />
                      Captured Viewport
                    </span>
                    {message.screenshot.byteSize && (
                      <span className="font-mono text-[9px] text-slate-400">
                        {Math.round(message.screenshot.byteSize / 1024)} KB
                      </span>
                    )}
                  </div>
                  <div className="p-1">
                    <img
                      src={message.screenshot.dataUrl}
                      alt="Captured Viewport"
                      className="w-full max-h-40 object-cover rounded border border-slate-800"
                    />
                  </div>
                </div>
              )}

              <div className="whitespace-pre-wrap break-words">{message.content}</div>
            </div>
          )}
        </div>

        {/* Action Footnotes & Copy Button */}
        <div
          className={`flex items-center gap-2 mt-1 px-1 text-[10px] text-slate-500 ${isAssistant ? 'justify-start' : 'justify-end'
            }`}
        >
          <span>
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>

          {isAssistant && message.content && !message.isStreaming && (
            <button
              onClick={handleCopyMessage}
              className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-slate-300 flex items-center gap-0.5"
              title="Copy answer"
            >
              {copied ? (
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
          )}
        </div>
      </div>

      {/* User Avatar */}
      {!isAssistant && (
        <div className="w-6 h-6 rounded-md bg-slate-700 flex items-center justify-center shrink-0 mt-0.5 text-slate-300">
          <User className="w-3.5 h-3.5" />
        </div>
      )}
    </div>
  );
};

