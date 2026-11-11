import React, { useState } from 'react';
import { Copy, Check, ExternalLink, Terminal } from 'lucide-react';

export interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

/**
 * Fast, lightweight syntax token highlighter for code blocks.
 */
function highlightCodeTokens(code: string): React.ReactNode {
  // Tokenize comments, strings, numbers, booleans, and keywords
  const tokenRegex =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:true|false|null|undefined|None|True|False)\b|\b\d+(?:\.\d+)?\b|\b(?:const|let|var|function|return|if|else|for|while|import|export|from|class|async|await|def|try|catch|finally|throw|new|typeof|interface|type|in|of|public|private|static|extends|implements)\b)/g;

  const parts = code.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    // Comment
    if (part.startsWith('//') || part.startsWith('/*') || part.startsWith('#')) {
      return (
        <span key={idx} className="text-slate-500 italic">
          {part}
        </span>
      );
    }
    // String
    if (
      (part.startsWith('"') && part.endsWith('"')) ||
      (part.startsWith("'") && part.endsWith("'")) ||
      (part.startsWith('`') && part.endsWith('`'))
    ) {
      return (
        <span key={idx} className="text-emerald-300">
          {part}
        </span>
      );
    }
    // Boolean / Null
    if (/^(?:true|false|null|undefined|None|True|False)$/.test(part)) {
      return (
        <span key={idx} className="text-purple-400 font-semibold">
          {part}
        </span>
      );
    }
    // Number
    if (/^\d+(?:\.\d+)?$/.test(part)) {
      return (
        <span key={idx} className="text-amber-300">
          {part}
        </span>
      );
    }
    // Keyword
    if (
      /^(?:const|let|var|function|return|if|else|for|while|import|export|from|class|async|await|def|try|catch|finally|throw|new|typeof|interface|type|in|of|public|private|static|extends|implements)$/.test(
        part
      )
    ) {
      return (
        <span key={idx} className="text-sky-400 font-semibold">
          {part}
        </span>
      );
    }

    return <span key={idx}>{part}</span>;
  });
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('[MarkdownRenderer] Copy code failed:', err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 transition"
      title="Copy code snippet"
    >
      {copied ? (
        <>
          <Check className="w-3 h-3 text-emerald-400" />
          <span className="text-emerald-400 font-semibold">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

/**
 * Formats inline markdown elements: bold, italic, inline code, links, timestamps, strikethrough.
 */
export function formatInlineMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  // Regex for:
  // 1. Links: [label](url)
  // 2. Bold: **text** or __text__
  // 3. Strikethrough: ~~text~~
  // 4. Italic: *text* or _text_
  // 5. Inline code: `code`
  // 6. Timestamps: [MM:SS] or [HH:MM:SS]
  const inlineRegex =
    /(\[[^\]]+\]\([^\)]+\)|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|_[^_]+_|`[^`]+`|\[\d{1,2}:\d{2}(?::\d{2})?\])/g;

  const parts = text.split(inlineRegex);

  return parts.map((part, index) => {
    if (!part) return null;

    // Link: [label](url)
    if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
      const match = part.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
      if (match) {
        const [, label, url] = match;
        return (
          <a
            key={index}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 hover:text-sky-300 underline inline-flex items-center gap-0.5 font-medium transition"
          >
            <span>{label}</span>
            <ExternalLink className="w-2.5 h-2.5 inline shrink-0 opacity-75" />
          </a>
        );
      }
    }

    // Bold: **text** or __text__
    if (
      (part.startsWith('**') && part.endsWith('**')) ||
      (part.startsWith('__') && part.endsWith('__'))
    ) {
      return (
        <strong key={index} className="font-bold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Strikethrough: ~~text~~
    if (part.startsWith('~~') && part.endsWith('~~')) {
      return (
        <del key={index} className="line-through text-slate-400">
          {part.slice(2, -2)}
        </del>
      );
    }

    // Italic: *text* or _text_
    if (
      (part.startsWith('*') && part.endsWith('*')) ||
      (part.startsWith('_') && part.endsWith('_'))
    ) {
      return (
        <em key={index} className="italic text-slate-200">
          {part.slice(1, -1)}
        </em>
      );
    }

    // Inline Code: `code`
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={index}
          className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-950 text-sky-300 border border-slate-800 shadow-sm"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // YouTube / Media Timestamp: [MM:SS] or [HH:MM:SS]
    if (part.match(/^\[\d{1,2}:\d{2}(?::\d{2})?\]$/)) {
      return (
        <span
          key={index}
          className="inline-flex items-center px-1.5 py-0.2 rounded bg-sky-950/80 border border-sky-800/80 text-sky-300 font-mono text-[10px] font-semibold mx-0.5 shadow-sm"
          title="Video Timestamp Citation"
        >
          {part}
        </span>
      );
    }

    return part;
  });
}

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('|') &&
    trimmed.endsWith('|') &&
    /^\|(\s*:?-+:?\s*\|)+$/.test(trimmed)
  );
}

function isTableRowLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2;
}

function parseTableAlignments(separatorLine: string): ('left' | 'center' | 'right')[] {
  const cells = separatorLine
    .trim()
    .slice(1, -1)
    .split('|')
    .map((c) => c.trim());

  return cells.map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });
}

function parseTableRowCells(rowLine: string): string[] {
  return rowLine
    .trim()
    .slice(1, -1)
    .split('|')
    .map((c) => c.trim());
}

/**
 * Main Markdown Renderer Component for Sahayak Side Panel
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isStreaming = false,
  className = '',
}) => {
  // If streaming and content has not arrived yet, show shimmer loading skeleton
  if (!content && isStreaming) {
    return (
      <div className="space-y-2 py-1 animate-pulse">
        <div className="flex items-center gap-2 text-xs text-sky-300/90 italic mb-2">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
          <span>Thinking & analyzing context...</span>
        </div>
        <div className="h-2.5 bg-slate-700/60 rounded w-3/4 shimmer-bg" />
        <div className="h-2.5 bg-slate-700/40 rounded w-full shimmer-bg" />
        <div className="h-2.5 bg-slate-700/50 rounded w-5/6 shimmer-bg" />
      </div>
    );
  }

  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLang = '';

  let inTable = false;
  let tableHeaders: string[] = [];
  let tableAlignments: ('left' | 'center' | 'right')[] = [];
  let tableRows: string[][] = [];

  const flushTable = (keyIdx: number) => {
    if (tableHeaders.length > 0) {
      elements.push(
        <div
          key={`table-${keyIdx}`}
          className="my-2.5 overflow-x-auto rounded-lg border border-slate-700/80 bg-slate-950/70 shadow-sm max-w-full"
        >
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-slate-700/80 bg-slate-900 text-slate-200 font-semibold">
                {tableHeaders.map((header, hIdx) => (
                  <th
                    key={hIdx}
                    className="px-2.5 py-1.5 whitespace-nowrap"
                    style={{ textAlign: tableAlignments[hIdx] || 'left' }}
                  >
                    {formatInlineMarkdown(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {tableRows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className="hover:bg-slate-800/40 transition even:bg-slate-900/30"
                >
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className="px-2.5 py-1.5 text-slate-300 leading-snug"
                      style={{ textAlign: tableAlignments[cIdx] || 'left' }}
                    >
                      {formatInlineMarkdown(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    inTable = false;
    tableHeaders = [];
    tableAlignments = [];
    tableRows = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Code block toggling
    if (line.startsWith('```')) {
      if (inTable) flushTable(i);

      if (inCodeBlock) {
        // Close code block
        const codeText = codeBlockLines.join('\n');
        const langDisplay = (codeBlockLang || 'code').toUpperCase();

        elements.push(
          <div
            key={`code-${i}`}
            className="my-2 rounded-lg bg-slate-950 border border-slate-700/90 shadow-md overflow-hidden max-w-full"
          >
            <div className="flex items-center justify-between px-3 py-1 bg-slate-900/90 border-b border-slate-800 text-[10px] text-slate-400">
              <div className="flex items-center gap-1.5 font-mono font-medium">
                <Terminal className="w-3 h-3 text-sky-400" />
                <span className="text-sky-300">{langDisplay}</span>
              </div>
              <CopyCodeButton code={codeText} />
            </div>
            <pre className="p-3 text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre text-slate-200">
              {highlightCodeTokens(codeText)}
            </pre>
          </div>
        );
        inCodeBlock = false;
        codeBlockLines = [];
        codeBlockLang = '';
      } else {
        // Open code block
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // 2. Table parsing (Markdown Tables)
    if (isTableRowLine(line)) {
      // If next line is a separator line, this line is the header
      if (!inTable && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
        inTable = true;
        tableHeaders = parseTableRowCells(line);
        tableAlignments = parseTableAlignments(lines[i + 1]);
        i++; // Skip the separator line
        continue;
      } else if (inTable) {
        tableRows.push(parseTableRowCells(line));
        continue;
      }
    } else if (inTable) {
      flushTable(i);
    }

    // 3. Headings
    if (line.startsWith('#### ')) {
      elements.push(
        <h5 key={`h4-${i}`} className="font-bold text-xs text-slate-200 mt-2 mb-1">
          {formatInlineMarkdown(line.slice(5))}
        </h5>
      );
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={`h3-${i}`} className="font-bold text-xs text-sky-300 mt-2.5 mb-1">
          {formatInlineMarkdown(line.slice(4))}
        </h4>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h3
          key={`h2-${i}`}
          className="font-bold text-sm text-white mt-3 mb-1.5 border-b border-slate-700/60 pb-1"
        >
          {formatInlineMarkdown(line.slice(3))}
        </h3>
      );
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h2
          key={`h1-${i}`}
          className="font-extrabold text-base text-white mt-3.5 mb-1.5 border-b border-sky-500/40 pb-1"
        >
          {formatInlineMarkdown(line.slice(2))}
        </h2>
      );
      continue;
    }

    // 4. Horizontal Rule
    if (/^(?:---|\*\*\*|___)\s*$/.test(line)) {
      elements.push(<hr key={`hr-${i}`} className="my-2.5 border-slate-700/60" />);
      continue;
    }

    // 5. Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote
          key={`quote-${i}`}
          className="my-1.5 pl-2.5 border-l-2 border-sky-400 text-slate-300 italic text-[11px] bg-slate-950/30 py-1 rounded-r"
        >
          {formatInlineMarkdown(line.slice(2))}
        </blockquote>
      );
      continue;
    }

    // 6. Task List (- [ ] or - [x])
    const taskMatch = line.match(/^[\*\-]\s+\[([ xX])\]\s+(.*)/);
    if (taskMatch) {
      const isChecked = taskMatch[1].toLowerCase() === 'x';
      elements.push(
        <div key={`task-${i}`} className="flex items-center gap-2 my-1 text-slate-200">
          <input
            type="checkbox"
            checked={isChecked}
            readOnly
            className="w-3.5 h-3.5 rounded accent-sky-500 bg-slate-800 border-slate-600 shrink-0 cursor-default"
          />
          <span className={isChecked ? 'line-through text-slate-400' : ''}>
            {formatInlineMarkdown(taskMatch[2])}
          </span>
        </div>
      );
      continue;
    }

    // 7. Bullet lists (* or -)
    if (line.match(/^[\*\-]\s+/)) {
      elements.push(
        <div key={`bullet-${i}`} className="flex items-start gap-1.5 my-0.5">
          <span className="text-sky-400 mt-1 text-[8px] leading-none shrink-0">&#9679;</span>
          <div className="flex-1 text-slate-200 leading-relaxed">
            {formatInlineMarkdown(line.replace(/^[\*\-]\s+/, ''))}
          </div>
        </div>
      );
      continue;
    }

    // 8. Numbered lists (1. 2. 3.)
    if (line.match(/^\d+\.\s+/)) {
      const numMatch = line.match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        elements.push(
          <div key={`num-${i}`} className="flex items-start gap-1.5 my-0.5">
            <span className="text-sky-400 font-bold text-[10px] min-w-[14px] shrink-0">
              {numMatch[1]}.
            </span>
            <div className="flex-1 text-slate-200 leading-relaxed">
              {formatInlineMarkdown(numMatch[2])}
            </div>
          </div>
        );
        continue;
      }
    }

    // 9. Empty line
    if (!line.trim()) {
      elements.push(<div key={`empty-${i}`} className="h-1.5" />);
      continue;
    }

    // 10. Standard paragraph line
    elements.push(
      <p key={`p-${i}`} className="my-0.5 leading-relaxed text-slate-200">
        {formatInlineMarkdown(line)}
      </p>
    );
  }

  if (inTable) {
    flushTable(lines.length);
  }

  // Handle unclosed code block during active streaming
  if (inCodeBlock && codeBlockLines.length > 0) {
    const codeText = codeBlockLines.join('\n');
    elements.push(
      <div
        key="streaming-code"
        className="my-2 rounded-lg bg-slate-950 border border-slate-700 p-2.5 text-[11px] font-mono text-sky-300 overflow-x-auto whitespace-pre shadow-md"
      >
        {highlightCodeTokens(codeText)}
      </div>
    );
  }

  return (
    <div className={`space-y-0.5 text-xs text-slate-100 ${className}`}>
      {elements}
      {isStreaming && (
        <span
          className="inline-block w-1.5 h-3 ml-1 bg-sky-400 animate-pulse align-middle rounded-sm shadow-sm"
          aria-label="Streaming..."
        />
      )}
    </div>
  );
};

