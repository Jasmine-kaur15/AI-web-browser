// YouTube Transcript Extractor for Sahayak AI Browser Agent (Manifest V3)
import { YouTubeTranscriptExtraction, TranscriptSegment } from '../shared/types';

/**
 * Validates whether a URL is a YouTube video or Shorts page.
 */
export function isYouTubeWatchUrl(rawUrl: string = window.location.href): boolean {
  try {
    const u = new URL(rawUrl);
    const isYTHost = u.hostname.includes('youtube.com') || u.hostname === 'youtu.be';
    if (!isYTHost) return false;

    if (u.pathname === '/watch' && u.searchParams.has('v')) return true;
    if (u.pathname.startsWith('/shorts/')) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Extracts YouTube 11-character Video ID from URL.
 */
export function extractYouTubeVideoId(rawUrl: string = window.location.href): string | null {
  try {
    const u = new URL(rawUrl);
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1).split('?')[0] || null;
    }
    if (u.pathname === '/watch') {
      return u.searchParams.get('v');
    }
    if (u.pathname.startsWith('/shorts/')) {
      return u.pathname.split('/')[2] || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Formats seconds into [MM:SS] or [HH:MM:SS].
 */
export function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `[${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
      secs
    ).padStart(2, '0')}]`;
  }
  return `[${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}]`;
}

/**
 * Decodes HTML entities commonly found in subtitle streams.
 */
function decodeHtmlEntities(rawText: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = rawText;
  return textarea.value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Extracts video title from YouTube DOM.
 */
function extractVideoTitle(): string {
  const titleEl =
    document.querySelector('ytd-watch-metadata #title h1 yt-formatted-string') ||
    document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
    document.querySelector('ytd-video-primary-info-renderer h1 yt-formatted-string') ||
    document.querySelector('h1.title yt-formatted-string');

  if (titleEl && titleEl.textContent) {
    return titleEl.textContent.trim();
  }

  // Fallback to document.title stripping " - YouTube"
  return document.title.replace(/\s*-\s*YouTube$/i, '').trim();
}

/**
 * Extracts video channel / creator name.
 */
function extractChannelName(): string {
  const channelEl =
    document.querySelector('ytd-watch-metadata #channel-name a') ||
    document.querySelector('#owner #channel-name yt-formatted-string a') ||
    document.querySelector('#upload-info #channel-name a') ||
    document.querySelector('ytd-channel-name a');

  return (channelEl?.textContent || '').trim();
}

/**
 * Extracts video description text.
 */
function extractDescription(): string {
  const descEl =
    document.querySelector('ytd-watch-metadata #description yt-formatted-string') ||
    document.querySelector('#description-inline-expander') ||
    document.querySelector('meta[name="description"]');

  if (descEl) {
    if (descEl.getAttribute('content')) {
      return (descEl.getAttribute('content') || '').trim();
    }
    return (descEl.textContent || '').trim();
  }
  return '';
}

/**
 * Parses chapter headings and timestamps from description text.
 */
function extractChapters(description: string): string[] {
  const chapters: string[] = [];
  const lines = description.split('\n');
  const timestampRegex = /\b(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)/;

  for (const line of lines) {
    const match = line.match(timestampRegex);
    if (match) {
      chapters.push(`${match[1]} - ${match[2].trim()}`);
    }
  }

  return chapters;
}

interface CaptionTrack {
  baseUrl: string;
  name?: { runs?: Array<{ text?: string }> };
  vssId?: string;
  languageCode?: string;
  kind?: string;
}

/**
 * Safely parses nested JSON array for a given key by matching bracket depth.
 * Avoids broken regexes when JSON objects contain inner brackets like "runs": [{"text": "..."}].
 */
function extractJsonArray(text: string, key: string): any[] | null {
  const marker = `"${key}":`;
  const idx = text.indexOf(marker);
  if (idx === -1) return null;

  const start = text.indexOf('[', idx + marker.length);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '[') depth++;
      else if (char === ']') {
        depth--;
        if (depth === 0) {
          const jsonStr = text.slice(start, i + 1);
          try {
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed) && parsed.length > 0) {
              return parsed;
            }
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Searches script tags or fetches page HTML to extract captionTracks array.
 */
async function findCaptionTracks(): Promise<CaptionTrack[]> {
  // Strategy 1: Check inline scripts in current DOM (Fastest, <1ms)
  const scripts = Array.from(document.querySelectorAll('script'));
  for (const script of scripts) {
    const content = script.textContent || '';
    if (content.includes('captionTracks')) {
      const tracks = extractJsonArray(content, 'captionTracks');
      if (tracks && tracks.length > 0) {
        return tracks as CaptionTrack[];
      }
    }
  }

  // Strategy 2: Check window ytInitialPlayerResponse if accessible
  try {
    const win = window as any;
    const playerResponse =
      win.ytInitialPlayerResponse || win.ytplayer?.config?.args?.raw_player_response;
    if (playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
      return playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    }
  } catch {}

  // Strategy 3: Fast fetch with short 2.5s timeout if DOM scripts haven't rendered yet
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(window.location.href, {
      credentials: 'same-origin',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (response.ok) {
      const html = await response.text();
      const tracks = extractJsonArray(html, 'captionTracks');
      if (tracks && tracks.length > 0) {
        return tracks as CaptionTrack[];
      }
    }
  } catch (err) {
    console.debug('[YouTubeTranscript] Page fetch for captions skipped or timed out:', err);
  }

  return [];
}

/**
 * Selects the optimal caption track matching preferred language,
 * prioritizing manual tracks over auto-generated (ASR).
 */
function selectBestTrack(tracks: CaptionTrack[], preferredLang: 'en' | 'hinglish' = 'en'): CaptionTrack | null {
  if (tracks.length === 0) return null;

  // Language priority list
  const langCodes =
    preferredLang === 'hinglish'
      ? ['hi', 'hi-IN', 'en', 'en-US', 'en-GB']
      : ['en', 'en-US', 'en-GB', 'hi', 'hi-IN'];

  // 1. Try to find a manual track matching preferred languages
  for (const code of langCodes) {
    const manualMatch = tracks.find(
      (t) => t.languageCode?.toLowerCase() === code && t.kind !== 'asr'
    );
    if (manualMatch) return manualMatch;
  }

  // 2. Try to find an auto-generated (ASR) track matching preferred languages
  for (const code of langCodes) {
    const asrMatch = tracks.find((t) => t.languageCode?.toLowerCase() === code);
    if (asrMatch) return asrMatch;
  }

  // 3. Fallback to the very first track in the list
  return tracks[0];
}

/**
 * Fetches and parses timed-text XML stream from caption track baseUrl.
 */
async function fetchAndParseXmlTranscript(baseUrl: string): Promise<TranscriptSegment[]> {
  const res = await fetch(baseUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch caption stream: HTTP ${res.status}`);
  }

  const xmlText = await res.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
  const textNodes = Array.from(xmlDoc.querySelectorAll('text'));

  const segments: TranscriptSegment[] = [];

  textNodes.forEach((node) => {
    const start = parseFloat(node.getAttribute('start') || '0');
    const dur = parseFloat(node.getAttribute('dur') || '0');
    const rawContent = node.textContent || '';
    const cleanContent = decodeHtmlEntities(rawContent);

    if (cleanContent) {
      segments.push({
        start,
        duration: dur,
        timestamp: formatTimestamp(start),
        text: cleanContent,
      });
    }
  });

  return segments;
}

/**
 * Combines fine-grained segments into structured timestamped paragraphs.
 * Groups speech every ~15-20 seconds or at natural sentence boundaries.
 */
function formatSegmentsToDialogue(segments: TranscriptSegment[]): string {
  if (segments.length === 0) return '';

  const formattedLines: string[] = [];
  let currentTimestamp = segments[0].timestamp;
  let currentGroupText: string[] = [];
  let groupStartTime = segments[0].start;

  segments.forEach((seg) => {
    // Start a new timestamp line every ~18 seconds or after 35 words
    const timeDelta = seg.start - groupStartTime;
    const wordCount = currentGroupText.join(' ').split(/\s+/).length;

    if (timeDelta >= 18 || wordCount >= 35) {
      if (currentGroupText.length > 0) {
        formattedLines.push(`${currentTimestamp} ${currentGroupText.join(' ')}`);
      }
      currentTimestamp = seg.timestamp;
      currentGroupText = [seg.text];
      groupStartTime = seg.start;
    } else {
      currentGroupText.push(seg.text);
    }
  });

  if (currentGroupText.length > 0) {
    formattedLines.push(`${currentTimestamp} ${currentGroupText.join(' ')}`);
  }

  return formattedLines.join('\n');
}

/**
 * Primary YouTube Transcript Extraction Entrypoint.
 * Extracts title, channel, caption tracks, timestamped dialogue,
 * or graceful fallback metadata if subtitles are unavailable.
 */
export async function extractYouTubeTranscript(
  preferredLang: 'en' | 'hinglish' = 'en'
): Promise<YouTubeTranscriptExtraction> {
  const url = window.location.href;
  const videoId = extractYouTubeVideoId(url) || '';
  const title = extractVideoTitle();
  const channelName = extractChannelName();
  const description = extractDescription();
  const chapters = extractChapters(description);

  if (!videoId) {
    throw new Error('Not an active YouTube video watch URL.');
  }

  // 1. Fetch available caption tracks
  const tracks = await findCaptionTracks();
  const bestTrack = selectBestTrack(tracks, preferredLang);

  if (!bestTrack || !bestTrack.baseUrl) {
    console.warn('[YouTubeTranscript] Captions unavailable. Using description & chapter fallback.');

    // Fallback: Return metadata and description summary
    const fallbackText = [
      `[Video Metadata]`,
      `Title: ${title}`,
      `Channel: ${channelName}`,
      `URL: ${url}`,
      chapters.length > 0 ? `\n[Chapters]\n${chapters.join('\n')}` : '',
      description ? `\n[Description]\n${description.slice(0, 3000)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      videoId,
      title,
      channelName,
      url,
      hasCaptions: false,
      transcript: fallbackText,
      segments: [],
      description,
      chapters,
      wordCount: fallbackText.split(/\s+/).filter(Boolean).length,
    };
  }

  // 2. Fetch and parse XML caption stream
  const segments = await fetchAndParseXmlTranscript(bestTrack.baseUrl);
  const formattedTranscript = formatSegmentsToDialogue(segments);
  const wordCount = formattedTranscript.split(/\s+/).filter(Boolean).length;

  console.log(
    `[YouTubeTranscript] Successfully extracted ${segments.length} segments (${wordCount} words) in ${bestTrack.languageCode}.`
  );

  return {
    videoId,
    title,
    channelName,
    url,
    hasCaptions: true,
    captionLanguage: bestTrack.languageCode,
    isAutoGenerated: bestTrack.kind === 'asr',
    transcript: formattedTranscript,
    segments,
    description,
    chapters,
    wordCount,
  };
}

