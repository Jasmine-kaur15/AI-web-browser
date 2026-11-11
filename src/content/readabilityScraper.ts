// In-Browser Readability & DOM Article Extractor for Sahayak AI Browser Agent
import { PageContentExtraction } from '../shared/types';

// Selectors for elements that should always be stripped
const UNWANTED_SELECTORS = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
  'object',
  'embed',
  'video',
  'audio',
  'nav',
  'footer',
  'aside',
  'header',
  '.nav',
  '.navbar',
  '.navigation',
  '.menu',
  '.sidebar',
  '.ad',
  '.ads',
  '.advertisement',
  '.banner',
  '.social',
  '.share',
  '.comments',
  '#comments',
  '.cookie-banner',
  '.cc-window',
  '#onetrust-banner-sdk',
  '#CybotCookiebotDialog',
  '[id*="consent"]',
  '[class*="paywall"]',
  '[class*="cookie"]',
  '.modal-backdrop',
  '[aria-hidden="true"]',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  'input[type="password"]',
  'input[autocomplete*="password"]',
  'input[autocomplete*="cc-"]',
  'input[autocomplete*="one-time-code"]',
  '.sensitive-box',
];

// High-confidence article container selectors
const PRIMARY_ARTICLE_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '#mw-content-text', // Wikipedia main text container
  '.article-content',
  '.post-content',
  '.entry-content',
  '.story-content',
  '.story-body',
  '.main-content',
  '#content',
];

const MAX_WORD_LIMIT = 12000;

/**
 * Checks if an element is hidden via inline or computed style
 */
function isElementHidden(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hidden || el.style.display === 'none' || el.style.visibility === 'hidden') {
    return true;
  }
  // Check common zero-size or opacity tricks often used for prompt injection
  if (el.style.opacity === '0' || el.style.fontSize === '0px' || el.style.fontSize === '0') {
    return true;
  }
  return false;
}

/**
 * Extracts meta description from head tags
 */
function extractMetaDescription(): string {
  const metaDesc =
    document.querySelector('meta[name="description"]')?.getAttribute('content') ||
    document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
    document.querySelector('meta[name="twitter:description"]')?.getAttribute('content') ||
    '';
  return metaDesc.trim();
}

/**
 * Extracts byline/author from meta tags or page DOM
 */
function extractByline(): string {
  const authorMeta =
    document.querySelector('meta[name="author"]')?.getAttribute('content') ||
    document.querySelector('meta[property="article:author"]')?.getAttribute('content') ||
    document.querySelector('[rel="author"]')?.textContent ||
    document.querySelector('.author, .byline')?.textContent ||
    '';
  return authorMeta.trim().slice(0, 100);
}

/**
 * Finds the best content container on the page using semantic selectors
 * and paragraph density scoring.
 */
function findPrimaryContainer(): HTMLElement {
  // 1. Check known high-confidence semantic selectors (Fast path, <2ms)
  for (const selector of PRIMARY_ARTICLE_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      const text = el.textContent || '';
      // Ensure the container has meaningful text (at least 60 words)
      if (text.split(/\s+/).length > 60) {
        return el;
      }
    }
  }

  // 2. Paragraph density scoring across high-level candidate containers
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'main, article, section, [role="main"], body > div, #content, #main, .content, .main'
    )
  ).slice(0, 30);

  let bestContainer: HTMLElement = (document.body ||
    document.documentElement ||
    document.createElement('div')) as HTMLElement;
  let highestScore = -1;

  for (const candidate of candidates) {
    // Skip if hidden
    if (isElementHidden(candidate)) continue;

    const paragraphs = candidate.querySelectorAll('p');
    if (paragraphs.length < 2) continue;

    let paragraphTextLength = 0;
    paragraphs.forEach((p) => {
      paragraphTextLength += (p.textContent || '').trim().length;
    });

    if (paragraphTextLength < 200) continue;

    // Calculate link density (ratio of text inside links vs total container text)
    const totalLength = (candidate.textContent || '').trim().length;
    if (totalLength === 0) continue;

    let linkTextLength = 0;
    candidate.querySelectorAll('a').forEach((a) => {
      linkTextLength += (a.textContent || '').trim().length;
    });

    const linkDensity = linkTextLength / totalLength;
    // Reject containers where > 55% of the content is navigational links
    if (linkDensity > 0.55) continue;

    // Score based on paragraph count and density, heavily penalizing link-heavy blocks
    const score = paragraphTextLength * (1 - linkDensity) * Math.sqrt(paragraphs.length);

    if (score > highestScore) {
      highestScore = score;
      bestContainer = candidate;
    }
  }

  return bestContainer;
}

/**
 * Recursively converts a sanitized DOM node into clean Markdown.
 */
function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    // Collapse multiple internal whitespaces to a single space
    return text.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as HTMLElement;
  const tagName = el.tagName.toLowerCase();

  // Child nodes processed in order
  const getChildrenMarkdown = (): string => {
    let result = '';
    for (let i = 0; i < el.childNodes.length; i++) {
      result += nodeToMarkdown(el.childNodes[i]);
    }
    return result;
  };

  switch (tagName) {
    case 'h1': {
      const text = getChildrenMarkdown().trim();
      return text ? `\n\n# ${text}\n\n` : '';
    }
    case 'h2': {
      const text = getChildrenMarkdown().trim();
      return text ? `\n\n## ${text}\n\n` : '';
    }
    case 'h3': {
      const text = getChildrenMarkdown().trim();
      return text ? `\n\n### ${text}\n\n` : '';
    }
    case 'h4':
    case 'h5':
    case 'h6': {
      const text = getChildrenMarkdown().trim();
      return text ? `\n\n#### ${text}\n\n` : '';
    }
    case 'p': {
      const text = getChildrenMarkdown().trim();
      return text ? `\n\n${text}\n\n` : '';
    }
    case 'blockquote': {
      const text = getChildrenMarkdown().trim();
      return text
        ? `\n\n> ${text.split('\n').join('\n> ')}\n\n`
        : '';
    }
    case 'pre': {
      const text = el.textContent || '';
      return `\n\n\`\`\`\n${text.trim()}\n\`\`\`\n\n`;
    }
    case 'code': {
      // Check if inside pre (already handled)
      if (el.parentElement?.tagName.toLowerCase() === 'pre') {
        return el.textContent || '';
      }
      const text = el.textContent || '';
      return text ? ` \`${text.trim()}\` ` : '';
    }
    case 'ul': {
      let listMd = '\n\n';
      el.querySelectorAll(':scope > li').forEach((li) => {
        const itemText = nodeToMarkdown(li).trim();
        if (itemText) {
          listMd += `- ${itemText}\n`;
        }
      });
      return listMd + '\n';
    }
    case 'ol': {
      let listMd = '\n\n';
      let idx = 1;
      el.querySelectorAll(':scope > li').forEach((li) => {
        const itemText = nodeToMarkdown(li).trim();
        if (itemText) {
          listMd += `${idx}. ${itemText}\n`;
          idx++;
        }
      });
      return listMd + '\n';
    }
    case 'li': {
      return getChildrenMarkdown().trim();
    }
    case 'table': {
      return renderTableToMarkdown(el);
    }
    case 'strong':
    case 'b': {
      const text = getChildrenMarkdown().trim();
      return text ? `**${text}**` : '';
    }
    case 'em':
    case 'i': {
      const text = getChildrenMarkdown().trim();
      return text ? `*${text}*` : '';
    }
    case 'br': {
      return '\n';
    }
    case 'hr': {
      return '\n\n---\n\n';
    }
    default: {
      return getChildrenMarkdown();
    }
  }
}

/**
 * Converts HTML table into clean Markdown table format.
 */
function renderTableToMarkdown(table: HTMLElement): string {
  const rows = table.querySelectorAll('tr');
  if (rows.length === 0) return '';

  let markdown = '\n\n';
  let hasHeader = false;

  rows.forEach((row, rowIndex) => {
    const cells = row.querySelectorAll('th, td');
    if (cells.length === 0) return;

    const rowValues = Array.from(cells).map((cell) =>
      (cell.textContent || '').trim().replace(/\|/g, '\\|').replace(/\s+/g, ' ')
    );

    markdown += `| ${rowValues.join(' | ')} |\n`;

    // Render separator after first row if header cells exist or for row 0
    if (rowIndex === 0) {
      const isHeaderRow = row.querySelector('th') !== null || rows.length > 1;
      if (isHeaderRow && !hasHeader) {
        hasHeader = true;
        const separators = rowValues.map(() => '---');
        markdown += `| ${separators.join(' | ')} |\n`;
      }
    }
  });

  return markdown + '\n\n';
}

/**
 * Primary Readability Content Extractor.
 * Clones the primary content container, strips noisy and hidden elements,
 * normalizes whitespace, formats markdown, and caps token limits.
 */
export function extractPageContent(): PageContentExtraction {
  const startTime = performance.now();

  const title = (document.title || '').trim();
  const url = window.location.href;
  const description = extractMetaDescription();
  const byline = extractByline();

  // 1. Locate primary container
  const container = (findPrimaryContainer() ||
    document.body ||
    document.documentElement ||
    document.createElement('div')) as HTMLElement;

  // 2. Clone the container to avoid mutating live DOM
  const clone = container.cloneNode(true) as HTMLElement;

  // Milestone 4.3: Credential sanitization - Strip password & sensitive payment inputs from cloned DOM
  clone.querySelectorAll('input[type="password"], input[autocomplete*="password"], input[autocomplete*="cc-"], input[autocomplete*="one-time-code"], .sensitive-box').forEach((el) => {
    el.remove();
  });

  // 3. Remove unwanted clutter selectors
  UNWANTED_SELECTORS.forEach((sel) => {
    clone.querySelectorAll(sel).forEach((node) => node.remove());
  });

  // 4. Strip hidden elements (anti prompt-injection safeguard)
  clone.querySelectorAll('*').forEach((el) => {
    if (isElementHidden(el)) {
      el.remove();
    }
  });

  // 5. Convert clean DOM tree to markdown
  let rawMarkdown = nodeToMarkdown(clone);

  // 6. Clean and normalize markdown whitespace
  rawMarkdown = rawMarkdown
    .replace(/[ \t]+/g, ' ')               // Collapse consecutive horizontal whitespace
    .replace(/\n\s+\n/g, '\n\n')           // Clean whitespace-only lines
    .replace(/\n{3,}/g, '\n\n')            // Max 2 consecutive newlines
    .trim();

  // 7. Calculate words and enforce token budget
  const words = rawMarkdown.split(/\s+/).filter(Boolean);
  let wordCount = words.length;
  let isTruncated = false;

  let cleanText = rawMarkdown;
  if (wordCount > MAX_WORD_LIMIT) {
    cleanText = words.slice(0, MAX_WORD_LIMIT).join(' ');
    cleanText += `\n\n[Note: Page content truncated after ${MAX_WORD_LIMIT} words for optimal processing.]`;
    wordCount = MAX_WORD_LIMIT;
    isTruncated = true;
  }

  const durationMs = Math.round(performance.now() - startTime);
  console.log(
    `[Sahayak Scraper] Extracted ${wordCount} words from "${title}" in ${durationMs}ms.`
  );

  return {
    title,
    cleanText,
    url,
    wordCount,
    description,
    byline,
    isTruncated,
  };
}

