import { XMLParser } from 'fast-xml-parser';
import Logger from '../../Logger.ts';
import { HasLyricsText, HasRenderableText } from '../EmptyLines.ts';

const ttmlLogger = new Logger("TTML Parser");

type TtmlTime = string | number;
type TtmlText = string | number | boolean;

export interface TtmlSpan {
  '#text'?: TtmlText;
  begin?: TtmlTime;
  end?: TtmlTime;
  'ttm:role'?: string;
  'itunes:key'?: string;
  span?: TtmlSpanNode | TtmlSpanNode[];
}

export type TtmlSpanNode = TtmlSpan | string;

export interface TtmlP {
  '#text'?: TtmlText;
  begin?: TtmlTime;
  end?: TtmlTime;
  'ttm:agent'?: string;
  'itunes:key'?: string;
  span?: TtmlSpanNode | TtmlSpanNode[];
}

export type TtmlPNode = TtmlP | string;

export interface TtmlDiv {
  begin?: TtmlTime;
  end?: TtmlTime;
  'itunes:songPart'?: string;
  'ttm:agent'?: string;
  p?: TtmlPNode | TtmlPNode[];
}

export interface TtmlAgent {
  type?: string;
  'xml:id'?: string;
}

export interface TtmlTransliterationEntry {
  for?: string;
  span?: TtmlSpanNode | TtmlSpanNode[];
}

export interface TtmlTransliterationBlock {
  text?: TtmlTransliterationEntry | TtmlTransliterationEntry[];
}

export interface TtmlITunesMetadata {
  songwriters?: { songwriter?: string | string[] };
  transliterations?: {
    transliteration?: TtmlTransliterationBlock | TtmlTransliterationBlock[];
  };
}

export interface TtmlDocument {
  tt?: {
    'itunes:timing'?: string;
    head?: {
      metadata?: {
        'ttm:agent'?: TtmlAgent | TtmlAgent[];
        iTunesMetadata?: TtmlITunesMetadata | TtmlITunesMetadata[];
      };
    };
    body?: {
      'ttm:agent'?: string;
      div?: TtmlDiv | TtmlDiv[];
      p?: TtmlPNode | TtmlPNode[];
    };
  };
}

export type TTMLLyricsType = 'Static' | 'Line' | 'Syllable';

export interface ParsedStaticLine {
  Text: string;
  TransliteratedText?: string;
  TranslatedText?: string;
  HasTransliterations?: boolean;
  HasTranslations?: boolean;
}

export interface ParsedLineVocal {
  Type: 'Vocal';
  OppositeAligned: boolean;
  Text: string | undefined;
  StartTime: number | undefined;
  EndTime: number | undefined;
  TransliteratedText?: string;
  TranslatedText?: string;
  HasTransliterations?: boolean;
  HasTranslations?: boolean;
}

export interface ParsedSyllable {
  Text: string;
  TransliteratedText?: string;
  IsPartOfWord: boolean;
  /** Set (to false) only where the romanization ends a word the source text runs on. */
  TransliteratedIsPartOfWord?: boolean;
  StartTime: number | undefined;
  EndTime: number | undefined;
}

export interface ParsedVocalGroup {
  Syllables: ParsedSyllable[];
  StartTime: number | undefined;
  EndTime: number | undefined;
  TransliteratedText?: string;
  TranslatedText?: string;
  HasTransliterations?: boolean;
  HasTranslations?: boolean;
}

export interface ParsedSyllableVocal {
  Type: 'Vocal';
  OppositeAligned: boolean;
  Lead: ParsedVocalGroup;
  Background?: ParsedVocalGroup[];
  HasTransliterations?: boolean;
  HasTranslations?: boolean;
}

interface ParsedLyricsBase {
  SongWriters?: string[];
  HasTransliterations?: boolean;
  HasTranslations?: boolean;
}

export interface ParsedStaticLyrics extends ParsedLyricsBase {
  Type: 'Static';
  Lines: ParsedStaticLine[];
}

export interface ParsedLineLyrics extends ParsedLyricsBase {
  Type: 'Line';
  StartTime: number | undefined;
  EndTime: number | undefined;
  Content: ParsedLineVocal[];
}

export interface ParsedSyllableLyrics extends ParsedLyricsBase {
  Type: 'Syllable';
  StartTime: number | undefined;
  EndTime?: number | undefined;
  Content: ParsedSyllableVocal[];
}

export type ParsedTTMLLyrics =
  | ParsedStaticLyrics
  | ParsedLineLyrics
  | ParsedSyllableLyrics;

type ParsedRootItem = ParsedStaticLine | ParsedLineVocal | ParsedSyllableVocal;

interface TrackAgent {
  Type: string | undefined;
  Id: string | undefined;
  OppositeAligned: boolean;
}

interface TransliterationSpan {
  begin: TtmlTime;
  end: TtmlTime;
  beginSeconds: number | undefined;
  endSeconds: number | undefined;
  text: string;
  /** Whether a romanized word ends here; undefined when the raw scan didn't find the span. */
  endsWord?: boolean;
}

/**
 * One <text for="..."> entry, split by which vocal it transliterates: the
 * entry's own timed spans mirror the lead, and spans nested under an
 * `<span ttm:role="x-bg">` wrapper mirror that line's background vocal.
 */
interface TransliterationLine {
  spans: TransliterationSpan[];
  background: TransliterationSpan[];
}

type TransliterationMap = Map<string, TransliterationLine>;

interface RoleTexts {
  roman: string | undefined;
  translation: string | undefined;
}

const isSpanObject = (span: TtmlSpanNode | undefined): span is TtmlSpan =>
  typeof span === 'object' && span !== null;

/** A span carrying actual lyrics text — anything with a ttm:role is metadata. */
const isVocalSpan = (span: TtmlSpanNode | undefined): span is TtmlSpan =>
  isSpanObject(span) && !span['ttm:role'];

const toArray = <T>(value: T | T[] | undefined | null): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];

const isSupportedLyricsType = (value: unknown): value is TTMLLyricsType =>
  value === 'Static' || value === 'Line' || value === 'Syllable';

const decodeXmlEntities = (str: string): string => {
  if (str.indexOf("&") === -1) return str;

  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    // Not an XML entity, but HTML habits put it in hand-written TTML.
    nbsp: "\u00a0",
  };

  return str.replace(
    /&(?:#x([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([a-zA-Z][a-zA-Z0-9]{0,31}));/g,
    (
      match: string,
      hex: string | undefined,
      dec: string | undefined,
      name: string | undefined,
    ) => {
      if (name !== undefined) {
        return Object.prototype.hasOwnProperty.call(named, name)
          ? named[name]
          : match;
      }

      const digits = hex ?? dec;
      if (digits === undefined) return match;

      const code = hex !== undefined ? parseInt(hex, 16) : parseInt(digits, 10);

      if (!Number.isFinite(code)) return match;
      if (code <= 0 || code > 0x10ffff) return match;
      if (code >= 0xd800 && code <= 0xdfff) return match;
      if (code === 0x09 || code === 0x0a || code === 0x0d) {
        return String.fromCodePoint(code);
      }
      if (code < 0x20) return match;

      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    },
  );
};

/**
 * Reads a node's text content. The parser runs with processEntities: false, so
 * every text value has to be decoded here — otherwise `&amp;` and friends reach
 * the lyrics verbatim. Decoding happens at extraction, before any trimming or
 * whitespace/punctuation checks, so those see real characters.
 */
const readText = (value: TtmlText | undefined): string =>
  value === undefined || value === null ? '' : decodeXmlEntities(value.toString());

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: false,
    parseTagValue: false,
    parseAttributeValue: false,
    allowBooleanAttributes: false,
    processEntities: false,
});

/**
 * fast-xml-parser collapses every text node of an element into a single
 * `#text`, so the whitespace *between* two sibling spans is lost — and that
 * whitespace is exactly what tells "Ma"+"ma" (one word) from "Ma" + "ma" (two).
 * The only place that information survives is the raw XML, so adjacency is
 * recovered by locating each span's start tag there.
 *
 * The lookup walks a cursor forward through the document instead of searching
 * from index 0 every time: transliteration spans in <head> mirror the lyric
 * timings exactly, so a search from the start would keep matching those and
 * report adjacency for the wrong element (and cost O(n) per syllable).
 */
interface AdjacencyScanner {
  /** True when the span's closing tag is immediately followed by another tag. */
  isImmediatelyFollowedByTag(begin: TtmlTime | undefined, end: TtmlTime | undefined): boolean;
}

interface IndexedSpanTag {
  /** Where the start tag begins in the document. */
  index: number;
  /** Just past the start tag's `>`. */
  tagEnd: number;
  adjacent: boolean;
}

const createAdjacencyScanner = (xml: string): AdjacencyScanner => {
  const bodyIndex = xml.indexOf('<body');
  const searchStart = bodyIndex === -1 ? 0 : bodyIndex;
  let cursor = searchStart;

  // Every span start tag in the body, indexed once by its timing (attribute
  // order and quote style both vary between TTML producers) with its adjacency
  // already worked out, in document order. Compiling a pattern and scanning
  // forward for every syllable made parsing much slower.
  const tags = new Map<string, IndexedSpanTag[]>();
  const tagPattern = /<span\b[^>]*>/g;
  const beginPattern = /\sbegin\s*=\s*(["'])(.*?)\1/;
  const endPattern = /\send\s*=\s*(["'])(.*?)\1/;
  tagPattern.lastIndex = searchStart;
  for (let match = tagPattern.exec(xml); match !== null; match = tagPattern.exec(xml)) {
    const tag = match[0];
    const begin = tag.match(beginPattern)?.[2];
    const end = tag.match(endPattern)?.[2];
    if (begin === undefined || end === undefined) continue;

    const tagEnd = match.index + tag.length;
    let adjacent: boolean;
    // charAt() past the end returns '', so no explicit bounds check needed.
    if (tag.endsWith('/>')) {
      adjacent = xml.charAt(tagEnd) === '<';
    } else {
      const closingIndex = xml.indexOf('</span>', tagEnd);
      adjacent = closingIndex !== -1 && xml.charAt(closingIndex + '</span>'.length) === '<';
    }

    const key = `${begin}\u0000${end}`;
    const entry = { index: match.index, tagEnd, adjacent };
    const list = tags.get(key);
    if (list) list.push(entry);
    else tags.set(key, [entry]);
  }

  // The first tag in the list starting at or after `from`.
  const firstFrom = (list: IndexedSpanTag[], from: number): IndexedSpanTag | undefined => {
    let low = 0;
    let high = list.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (list[mid].index < from) low = mid + 1;
      else high = mid;
    }
    return list[low];
  };

  return {
    isImmediatelyFollowedByTag(begin, end) {
      if (begin == null || end == null || begin === '' || end === '') return false;

      const list = tags.get(`${begin}\u0000${end}`);
      if (!list) return false;

      // Forward from the cursor first; fall back to the first one in the body
      // for documents whose parsed order doesn't match document order.
      const tag = firstFrom(list, cursor) ?? list[0];
      cursor = tag.tagEnd;
      return tag.adjacent;
    },
  };
};

/** Key of one transliteration span in RawTransliterations.wordEnds. */
const transliterationSpanKey = (
  lineKey: string,
  background: boolean,
  begin: TtmlTime,
  end: TtmlTime,
): string => `${lineKey}\u0000${background ? 'bg' : 'lead'}\u0000${begin}\u0000${end}`;

interface RawTransliterations {
  /** The lead text of each `<text for="...">` entry, keyed by `for`. */
  lineTexts: Map<string, string>;
  /** Whether each timed span ends a romanized word, keyed by transliterationSpanKey. */
  wordEnds: Map<string, boolean>;
}

/**
 * Reads the `<text for="...">` entries of the `<transliterations>` blocks from
 * the raw XML. `<translations>` uses the same `<text for>` shape, so the scan
 * stays inside `<transliterations>` or a translation would be read as the
 * romanization.
 *
 * The parsed tree can't give this: fast-xml-parser merges an element's text
 * nodes into one `#text`, so the spaces *between* per-word spans are lost
 * (joining the spans gave "konnichiwasekai"), and an entry holding plain text
 * with no spans at all is dropped. Those spaces are also the only record of
 * where romanized words end, which the main text can't tell for a script
 * written without spaces.
 *
 * Lead spans and spans under an `x-bg` wrapper are tracked separately. Text
 * inside an `x-bg` wrapper is the background vocal's and is left out of the
 * line text. A span ends a romanized word when its own text ends in
 * whitespace, when whitespace sits between it and the next span of the same
 * vocal, or when that next span's text starts with whitespace.
 */
function scanTransliterations(xml: string): RawTransliterations {
  const lineTexts = new Map<string, string>();
  const wordEnds = new Map<string, boolean>();
  const bodyIndex = xml.indexOf('<body');
  const head = bodyIndex === -1 ? xml : xml.slice(0, bodyIndex);

  const blockPattern = /<transliterations\b[^>]*>([\s\S]*?)<\/transliterations>/g;
  const entryPattern = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  const forPattern = /\bfor\s*=\s*(["'])(.*?)\1/;
  const bgPattern = /\bttm:role\s*=\s*(["'])x-bg\1/;
  const rolePattern = /\bttm:role\s*=/;
  const beginPattern = /(?:^|\s)begin\s*=\s*(["'])(.*?)\1/;
  const endPattern = /(?:^|\s)end\s*=\s*(["'])(.*?)\1/;
  const tokenPattern = /<(\/?)span\b([^>]*?)(\/?)>|<[^>]*>|[^<]+/g;

  interface Frame {
    bg: boolean;
    /** Set on a timed span: its key and the text read inside it so far. */
    timed: { key: string; text: string } | null;
  }
  interface Vocal {
    /** Key of the last timed span closed in this vocal. */
    last: string | null;
    /** Whether whitespace came between that span and the next one. */
    gap: boolean;
  }

  for (const block of head.matchAll(blockPattern)) {
    for (const entry of block[1].matchAll(entryPattern)) {
      const key = entry[1].match(forPattern)?.[2];
      if (!key) continue;

      let text = '';
      const ends = new Map<string, boolean>();
      const vocals: Record<'lead' | 'bg', Vocal> = {
        lead: { last: null, gap: false },
        bg: { last: null, gap: false },
      };
      const stack: Frame[] = [];

      const openSpan = (attrs: string): Frame => {
        const top = stack[stack.length - 1];
        const bg = (top?.bg ?? false) || bgPattern.test(attrs);
        const begin = attrs.match(beginPattern)?.[2];
        const end = attrs.match(endPattern)?.[2];
        const timed =
          begin !== undefined && end !== undefined && !rolePattern.test(attrs)
            ? { key: transliterationSpanKey(key, bg, begin, end), text: '' }
            : null;
        return { bg, timed };
      };

      const closeSpan = (frame: Frame) => {
        if (!frame.timed) return;
        const spanText = decodeXmlEntities(frame.timed.text);
        const vocal = vocals[frame.bg ? 'bg' : 'lead'];
        if (vocal.last !== null && (vocal.gap || /^\s/.test(spanText))) {
          ends.set(vocal.last, true);
        }
        ends.set(frame.timed.key, /\s$/.test(spanText));
        vocal.last = frame.timed.key;
        vocal.gap = false;
      };

      for (const token of entry[2].matchAll(tokenPattern)) {
        const raw = token[0];
        const top = stack[stack.length - 1];
        if (!raw.startsWith('<')) {
          if (!top?.bg) text += raw;
          if (top?.timed) {
            top.timed.text += raw;
          } else if (/\s/.test(decodeXmlEntities(raw))) {
            vocals[top?.bg ? 'bg' : 'lead'].gap = true;
          }
        } else if (token[1] === '/') {
          const frame = stack.pop();
          if (frame) closeSpan(frame);
        } else if (raw.startsWith('<span')) {
          const frame = openSpan(token[2] ?? '');
          if (token[3] === '/') closeSpan(frame);
          else stack.push(frame);
        }
      }

      // The first entry for a span wins, the same one findTransliteratedText
      // picks when several transliteration blocks cover a line.
      for (const [spanKey, endsWord] of ends) {
        if (!wordEnds.has(spanKey)) wordEnds.set(spanKey, endsWord);
      }

      const normalized = decodeXmlEntities(text).replace(/\s+/g, ' ').trim();
      if (normalized === '') continue;
      const existing = lineTexts.get(key);
      lineTexts.set(key, existing ? `${existing} ${normalized}` : normalized);
    }
  }

  return { lineTexts, wordEnds };
}

/** Divs, tolerating documents that hang <p> straight off <body>. */
const getDivs = (ttml: TtmlDocument): TtmlDiv[] => {
  const body = ttml?.tt?.body;
  if (!body) return [];
  const divs = toArray(body.div).filter((div): div is TtmlDiv => div != null && typeof div === 'object');
  if (divs.length > 0) return divs;
  if (body.p != null) return [{ p: body.p }];
  return [];
};

interface SyllableBuildInput {
  /** Sibling nodes in document order — role spans included, they gate adjacency. */
  siblings: TtmlSpanNode[];
  transliterations: TransliterationSpan[] | null | undefined;
  stripParentheses: boolean;
  scanner: AdjacencyScanner;
}

function buildSyllables({
  siblings,
  transliterations,
  stripParentheses,
  scanner,
}: SyllableBuildInput): ParsedSyllable[] {
  const syllables: ParsedSyllable[] = [];
  const clean = (value: string): string =>
    stripParentheses ? value.trim().replace(/[()]/g, '').trim() : value.trim();

  siblings.forEach((node, index) => {
    if (!isVocalSpan(node)) return;

    // Called for every vocal span, including skipped ones, to keep the
    // scanner's cursor aligned with document order.
    const closingTagIsAdjacent = scanner.isImmediatelyFollowedByTag(node.begin, node.end);

    const rawText = readText(node['#text']);
    if (rawText === '') return;

    const text = clean(rawText);
    if (text === '') return;

    let isPartOfWord = false;
    const nextNode = siblings[index + 1];
    // Only a following *vocal* span can continue a word; a trailing x-bg or
    // x-translation sibling means this syllable ends the word.
    if (closingTagIsAdjacent && isVocalSpan(nextNode)) {
      const nextText = readText(nextNode['#text']);
      const endsWithComma = rawText.trim().endsWith(',');
      const endsWithWhitespace = /\s$/.test(rawText);
      if (!/^\s/.test(nextText) && !endsWithComma && !endsWithWhitespace) {
        isPartOfWord = true;
      }
    }

    const translit = findTransliteratedText(transliterations, node.begin, node.end);
    const translitText = translit ? clean(translit.text) : '';
    const startTime = convertTimeToSeconds(node.begin);

    syllables.push({
      Text: text,
      ...(translitText !== '' ? { TransliteratedText: translitText } : {}),
      // Left out when the span's word end is unknown, so the renderer falls
      // back to IsPartOfWord.
      ...(translitText !== '' && translit?.endsWord !== undefined
        ? { TransliteratedIsPartOfWord: !translit.endsWord }
        : {}),
      IsPartOfWord: isPartOfWord,
      StartTime: startTime,
      EndTime: endAfter(startTime, convertTimeToSeconds(node.end)),
    });
  });

  // The vocal's last syllable always ends its romanized word.
  const last = syllables[syllables.length - 1];
  if (last?.TransliteratedText !== undefined) last.TransliteratedIsPartOfWord = false;

  return syllables;
}

/** An end that comes before its begin is treated as missing. */
const endAfter = (start: number | undefined, end: number | undefined): number | undefined =>
  start !== undefined && end !== undefined && end < start ? undefined : end;

/**
 * Gives every syllable a start and an end. One missing its end runs until the
 * next timed syllable starts (or the line ends), and a run with no timing at
 * all shares that gap evenly. Left undefined, the end became NaN downstream
 * and the word stayed lit for good.
 */
function fillSyllableTimes(syllables: ParsedSyllable[], lineStart: number, lineEnd: number): void {
  const nextStart = (after: number): number => {
    for (let k = after + 1; k < syllables.length; k++) {
      const start = syllables[k].StartTime;
      if (start !== undefined) return start;
    }
    return lineEnd;
  };
  const isUntimed = (syllable: ParsedSyllable): boolean =>
    syllable.StartTime === undefined && syllable.EndTime === undefined;

  let previousEnd = lineStart;
  let i = 0;
  while (i < syllables.length) {
    if (isUntimed(syllables[i])) {
      let j = i;
      while (j < syllables.length && isUntimed(syllables[j])) j++;
      const until = Math.max(nextStart(j - 1), previousEnd);
      const step = (until - previousEnd) / (j - i);
      for (let k = i; k < j; k++) {
        syllables[k].StartTime = previousEnd + step * (k - i);
        syllables[k].EndTime = k === j - 1 ? until : previousEnd + step * (k - i + 1);
      }
      previousEnd = until;
      i = j;
      continue;
    }
    const syllable = syllables[i];
    const start = syllable.StartTime ?? previousEnd;
    syllable.StartTime = start;
    syllable.EndTime = Math.max(syllable.EndTime ?? nextStart(i), start);
    previousEnd = syllable.EndTime;
    i++;
  }
}

export function parseTTML(ttmlInput: string): ParsedTTMLLyrics | null {
  if (typeof ttmlInput !== 'string' || ttmlInput.trim() === '') {
    ttmlLogger.warn('Refusing to parse empty or non-string TTML input');
    return null;
  }

  try {
    return convertTTML(ttmlInput);
  } catch (error) {
    ttmlLogger.error(
      'Unexpected error while converting TTML',
      (error as Error)?.message ?? String(error),
    );
    return null;
  }
}

function convertTTML(ttmlInput: string): ParsedTTMLLyrics | null {
  let ttml: TtmlDocument;
  try {
    ttml = parser.parse(ttmlInput) as TtmlDocument;
  } catch (parseError) {
    ttmlLogger.error('Failed to parse TTML XML', (parseError as Error)?.message);
    return null;
  }

  if (!ttml?.tt || typeof ttml.tt !== 'object' || !ttml.tt.body || typeof ttml.tt.body !== 'object') {
    ttmlLogger.warn('Parsed XML is not a TTML document, rejecting');
    return null;
  }

  const divs = getDivs(ttml);
  if (divs.length === 0) {
    ttmlLogger.warn('TTML body contains no usable <div>/<p> content, rejecting');
    return null;
  }

  const timing = ttml.tt['itunes:timing'];

  let lyricsType: string;
  if (timing === 'None') {
    lyricsType = 'Static';
  } else if (timing === 'Word') {
    lyricsType = 'Syllable';
  } else if (timing === undefined) {
    lyricsType = inferLyricsType(ttml);
    ttmlLogger.debug('No itunes:timing attribute, inferred lyrics type from structure', { inferred: lyricsType });
  } else {
    lyricsType = timing;
  }

  if (!isSupportedLyricsType(lyricsType)) {
    ttmlLogger.warn('Unknown itunes:timing value, rejecting', { timing });
    return null;
  }

  ttmlLogger.debug(`Determined lyrics type: ${lyricsType}`);

  const SongWriters = GetSongWriters(ttml);
  const RawTransliterations = scanTransliterations(ttmlInput);
  const Transliterations = GetTransliterations(ttml, RawTransliterations.wordEnds);

  const base: ParsedLyricsBase = SongWriters ? { SongWriters } : {};

  let lyricsJSON: ParsedTTMLLyrics;

  const Agents = ttml.tt.head?.metadata?.["ttm:agent"];
  const PostAgents = toArray(Agents).filter((agent): agent is TtmlAgent => agent != null && typeof agent === 'object');

  const isOppositeAlignedAgent = (agent: TtmlAgent): boolean => {
    const agentId = agent["xml:id"];
    // v1 is always the main vocal track
    if (agentId === "v1") return false;
    // v2000 and v2 are usually OppositeAligned
    if (agentId === "v2000" || agentId === "v2") return true;
    return false;
  };

  const TrackAgents: TrackAgent[] = PostAgents.map((agent) => {
    return {
      Type: agent.type,
      Id: agent["xml:id"],
      OppositeAligned: isOppositeAlignedAgent(agent)
    }
  });

  switch (lyricsType) {
    case 'Static': {
      ttmlLogger.debug('Processing static lyrics');
      const staticLyrics: ParsedStaticLyrics = { ...base, Type: 'Static', Lines: [] };
      divs.forEach((div) => {
        if (div["itunes:songPart"] === "Instrumental" || div["itunes:songPart"] === "Outro") return;
        const divp = toArray(div.p);
        divp.forEach((p) => {
          if (p == null) return;
          const text = getLineText(p) ?? "";

          // Static never carries iTunesMetadata transliterations; only inline
          // x-roman / x-translation spans apply, placed at line level.
          const roles = getInlineRoleTexts(p);
          const roman = roles.roman?.trim() ?? "";

          // getLineText skips role spans, so a <p> holding nothing but x-roman
          // reads as empty here — keep it, the romanized view can show it.
          if (!HasLyricsText(text) && !HasLyricsText(roman)) return;

          const line: ParsedStaticLine = {
            Text: text.trim(),
          };

          if (roman !== "") {
            line.TransliteratedText = roman;
            line.HasTransliterations = true;
          }
          if (roles.translation !== undefined && roles.translation.trim() !== "") {
            line.TranslatedText = roles.translation.trim();
            line.HasTranslations = true;
          }

          staticLyrics.Lines.push(line);
        });
      });
      lyricsJSON = staticLyrics;
      break;
    }

    case 'Line': {
      ttmlLogger.debug('Processing line-synced lyrics');
      const transliterationLineTexts = RawTransliterations.lineTexts;

      const buildLine = (p: TtmlPNode): ParsedLineVocal => {
        const pSpans = p != null && typeof p === 'object' && p.span ? toArray(p.span) : [];
        const vocalSpans = pSpans.filter(isVocalSpan);
        const begin = (typeof p === 'object' ? p?.begin : undefined) ?? vocalSpans[0]?.begin;
        const end = (typeof p === 'object' ? p?.end : undefined) ?? vocalSpans[vocalSpans.length - 1]?.end;
        const startTime = convertTimeToSeconds(begin);
        const endTime = convertTimeToSeconds(end);

        const line: ParsedLineVocal = {
          Type: 'Vocal',
          OppositeAligned: false,
          Text: getLineText(p),
          StartTime: startTime,
          // A line ending before it begins ends where it begins.
          EndTime:
            startTime !== undefined && endTime !== undefined && endTime < startTime ? startTime : endTime,
        };

        const roles = getInlineRoleTexts(p);
        const lineKey = p && typeof p === 'object' ? p['itunes:key'] : undefined;
        const itmTranslit = lineKey ? Transliterations?.get(lineKey)?.spans : undefined;
        const rawTranslit = lineKey ? transliterationLineTexts.get(lineKey) : undefined;

        let translit: string | undefined;
        if (rawTranslit !== undefined && rawTranslit !== '') {
          // Read from the raw XML: keeps the spaces between spans, and covers
          // plain-text entries that have no spans at all.
          translit = rawTranslit;
        } else if (itmTranslit && itmTranslit.length > 0) {
          translit = itmTranslit.map((s) => s.text).join('');
        } else if (roles.roman !== undefined) {
          translit = roles.roman;
        }
        if (translit !== undefined && translit.trim() !== '') {
          line.TransliteratedText = translit.trim();
          line.HasTransliterations = true;
        }
        if (roles.translation !== undefined && roles.translation.trim() !== '') {
          line.TranslatedText = roles.translation.trim();
          line.HasTranslations = true;
        }
        return line;
      };

      const lineLyrics: ParsedLineLyrics = {
        ...base,
        Type: 'Line',
        StartTime: undefined,
        EndTime: undefined,
        Content: [],
      };

      const timedDivs = divs.filter((div) => div["itunes:songPart"] !== "Instrumental");
      lineLyrics.Content = timedDivs
        .flatMap((div) => toArray(div.p).filter((p) => p != null).map(buildLine))
        .filter((line) => HasRenderableText(line));

      const firstDiv = timedDivs[0] ?? divs[0];
      const lastDiv = timedDivs[timedDivs.length - 1] ?? divs[divs.length - 1];
      lineLyrics.StartTime =
        convertTimeToSeconds(firstDiv?.begin) ?? lineLyrics.Content[0]?.StartTime;
      lineLyrics.EndTime =
        convertTimeToSeconds(lastDiv?.end) ??
        lineLyrics.Content[lineLyrics.Content.length - 1]?.EndTime;

      lyricsJSON = lineLyrics;
      break;
    }

    case 'Syllable': {
      ttmlLogger.debug('Processing syllable-synced lyrics');
      const scanner = createAdjacencyScanner(ttmlInput);
      const firstDiv = divs[0];
      let skippedEmptyLines = 0;

      const syllableLyrics: ParsedSyllableLyrics = {
        ...base,
        Type: 'Syllable',
        StartTime: convertTimeToSeconds(firstDiv?.begin),
        Content: [],
      };

      divs.forEach((div) => {
        if (div["itunes:songPart"] === "Instrumental") return;

        const ps = toArray(div.p);
        ps.forEach((p) => {
          if (!p || typeof p !== 'object') return;
          const pAgentId = p["ttm:agent"] || div["ttm:agent"] || ttml.tt.body["ttm:agent"];
          const trackAgent = pAgentId ? TrackAgents.find((a) => a.Id === pAgentId) : undefined;
          const isOpposite = trackAgent ? trackAgent.OppositeAligned : false;
          const lineKey = p['itunes:key'];
          const lineTranslitEntry = lineKey ? Transliterations?.get(lineKey) : undefined;
          const lineTranslit = lineTranslitEntry?.spans;
          const pStart = convertTimeToSeconds(p.begin);
          const pEnd = endAfter(pStart, convertTimeToSeconds(p.end));

          const vocal: ParsedSyllableVocal = {
            Type: 'Vocal',
            OppositeAligned: isOpposite,
            Lead: {
              Syllables: [],
              StartTime: pStart,
              EndTime: pEnd,
            },
          };

          const pSpans = toArray(p.span);

          vocal.Lead.Syllables = buildSyllables({
            siblings: pSpans,
            transliterations: lineTranslit,
            stripParentheses: false,
            scanner,
          });

          const leadRoles = getInlineRoleTexts(p);
          const leadRoman = leadRoles.roman?.trim() ?? '';

          // A word-timed document can still contain a line-timed <p> with no
          // syllable spans — keep its text instead of emitting a blank line.
          // The romanization stands in when there is no source text at all,
          // since only syllables are ever rendered.
          if (vocal.Lead.Syllables.length === 0) {
            const fallbackText = (getLineText(p) ?? '').trim();
            if (fallbackText !== '' || leadRoman !== '') {
              vocal.Lead.Syllables.push({
                Text: fallbackText,
                ...(leadRoman !== '' ? { TransliteratedText: leadRoman, TransliteratedIsPartOfWord: false } : {}),
                IsPartOfWord: false,
                StartTime: pStart,
                EndTime: pEnd,
              });
            }
          }

          // The line's window covers its own words, whatever the <p> says. A
          // zero-length or too-short <p> would otherwise read as a gap and show
          // the interlude dots over words that are being sung.
          for (const syllable of vocal.Lead.Syllables) {
            if (
              typeof syllable.StartTime === 'number' &&
              (vocal.Lead.StartTime === undefined || syllable.StartTime < vocal.Lead.StartTime)
            ) {
              vocal.Lead.StartTime = syllable.StartTime;
            }
            if (
              typeof syllable.EndTime === 'number' &&
              (vocal.Lead.EndTime === undefined || syllable.EndTime > vocal.Lead.EndTime)
            ) {
              vocal.Lead.EndTime = syllable.EndTime;
            }
          }
          // Filled against the lead's own window, before background vocals widen it.
          if (vocal.Lead.StartTime !== undefined) {
            vocal.Lead.EndTime = Math.max(vocal.Lead.EndTime ?? vocal.Lead.StartTime, vocal.Lead.StartTime);
            fillSyllableTimes(vocal.Lead.Syllables, vocal.Lead.StartTime, vocal.Lead.EndTime);
          }

          if (leadRoman !== '') {
            vocal.Lead.TransliteratedText = leadRoman;
          }
          if (leadRoles.translation !== undefined && leadRoles.translation.trim() !== '') {
            vocal.Lead.TranslatedText = leadRoles.translation.trim();
            vocal.HasTranslations = true;
          }
          if (
            vocal.Lead.TransliteratedText !== undefined ||
            vocal.Lead.Syllables.some((s) => s.TransliteratedText !== undefined)
          ) {
            vocal.HasTransliterations = true;
          }

          const filteredBgSpans = pSpans.filter(
            (span): span is TtmlSpan => isSpanObject(span) && span['ttm:role'] === 'x-bg',
          );

          if (filteredBgSpans.length > 0) {
            const backgrounds: ParsedVocalGroup[] = [];

            filteredBgSpans.forEach((bgSpan) => {
              const bgLineKey = bgSpan['itunes:key'];
              const bgKeyTranslit = bgLineKey ? Transliterations?.get(bgLineKey) : undefined;
              const bgLineTranslit = pickBackgroundTransliterations(bgKeyTranslit, lineTranslitEntry);

              const bgSpanSpans = toArray(bgSpan.span);
              const bgVocalSpans = bgSpanSpans.filter(isVocalSpan);
              const bgRoles = extractRoleTexts(bgSpanSpans);

              const bgVocal: ParsedVocalGroup = {
                Syllables: buildSyllables({
                  siblings: bgSpanSpans,
                  transliterations: bgLineTranslit,
                  stripParentheses: true,
                  scanner,
                }),
                StartTime: undefined,
                EndTime: undefined,
              };

              bgVocal.StartTime =
                convertTimeToSeconds(bgVocalSpans[0]?.begin) ??
                convertTimeToSeconds(bgSpan.begin) ??
                bgVocal.Syllables[0]?.StartTime;
              bgVocal.EndTime =
                convertTimeToSeconds(bgVocalSpans[bgVocalSpans.length - 1]?.end) ??
                convertTimeToSeconds(bgSpan.end) ??
                bgVocal.Syllables[bgVocal.Syllables.length - 1]?.EndTime;
              if (bgVocal.StartTime !== undefined) {
                bgVocal.EndTime = Math.max(bgVocal.EndTime ?? bgVocal.StartTime, bgVocal.StartTime);
                fillSyllableTimes(bgVocal.Syllables, bgVocal.StartTime, bgVocal.EndTime);
              }

              if (bgRoles.roman !== undefined && bgRoles.roman.trim() !== '') {
                bgVocal.TransliteratedText = bgRoles.roman.trim();
              }
              if (bgRoles.translation !== undefined && bgRoles.translation.trim() !== '') {
                bgVocal.TranslatedText = bgRoles.translation.trim();
                bgVocal.HasTranslations = true;
              }

              if (
                bgVocal.TransliteratedText !== undefined ||
                bgVocal.Syllables.some((s) => s.TransliteratedText !== undefined)
              ) {
                bgVocal.HasTransliterations = true;
              }

              if (!bgVocal.Syllables.some((syllable) => HasRenderableText(syllable))) {
                return;
              }

              // Background vocals can start before, or run past, the lead line;
              // the lead's window has to cover them or they get clipped.
              if (
                typeof bgVocal.EndTime === "number" &&
                (vocal.Lead.EndTime === undefined || bgVocal.EndTime > vocal.Lead.EndTime)
              ) {
                vocal.Lead.EndTime = bgVocal.EndTime;
              }

              if (
                typeof bgVocal.StartTime === "number" &&
                (vocal.Lead.StartTime === undefined || bgVocal.StartTime < vocal.Lead.StartTime)
              ) {
                vocal.Lead.StartTime = bgVocal.StartTime;
              }

              backgrounds.push(bgVocal);
            });

            if (backgrounds.length > 0) vocal.Background = backgrounds;
          }

          const isEmpty =
            !vocal.Lead.Syllables.some((syllable) => HasRenderableText(syllable)) &&
            !(vocal.Background ?? []).some((background) =>
              background.Syllables.some((syllable) => HasRenderableText(syllable)),
            );

          if (isEmpty) {
            skippedEmptyLines++;
            return;
          }

          syllableLyrics.Content.push(vocal);
        });
      });

      if (skippedEmptyLines > 0) {
        ttmlLogger.debug(`Skipped ${skippedEmptyLines} empty syllable line(s)`);
      }

      if (syllableLyrics.StartTime === undefined) {
        syllableLyrics.StartTime = syllableLyrics.Content[0]?.Lead?.StartTime;
      }

      // The last <p> is not necessarily the one that ends last.
      let latestEnd: number | undefined;
      for (const content of syllableLyrics.Content) {
        const ends = [content.Lead?.EndTime, ...toArray(content.Background).map((bg) => bg?.EndTime)];
        for (const end of ends) {
          if (typeof end === 'number' && (latestEnd === undefined || end > latestEnd)) {
            latestEnd = end;
          }
        }
      }
      syllableLyrics.EndTime = latestEnd;

      lyricsJSON = syllableLyrics;
      break;
    }

    default:
      ttmlLogger.error(`Unsupported lyrics type: ${lyricsType}`);
      return null;
  }

  const rootItems: ParsedRootItem[] =
    lyricsJSON.Type === 'Static' ? lyricsJSON.Lines : lyricsJSON.Content;

  if (rootItems.length === 0) {
    ttmlLogger.warn('Conversion resulted in empty lyrics content');
    return null;
  }

  const getLead = (item: ParsedRootItem): ParsedVocalGroup | undefined =>
    'Lead' in item ? item.Lead : undefined;
  const getBackground = (item: ParsedRootItem): ParsedVocalGroup[] | undefined =>
    'Background' in item ? item.Background : undefined;
  const getOwnTranslit = (item: ParsedRootItem): string | undefined =>
    'TransliteratedText' in item ? item.TransliteratedText : undefined;
  const getOwnTranslation = (item: ParsedRootItem): string | undefined =>
    'TranslatedText' in item ? item.TranslatedText : undefined;

  const anyTranslit = rootItems.some(
    (item) =>
      item?.HasTransliterations === true ||
      getOwnTranslit(item) !== undefined ||
      getLead(item)?.TransliteratedText !== undefined ||
      getLead(item)?.Syllables?.some((s) => s?.TransliteratedText !== undefined) ||
      getBackground(item)?.some((bg) => bg?.HasTransliterations || bg?.TransliteratedText !== undefined),
  );
  if (anyTranslit) lyricsJSON.HasTransliterations = true;
  if (!lyricsJSON.HasTranslations) {
    const anyTranslation = rootItems.some(
      (item) =>
        item?.HasTranslations === true ||
        getOwnTranslation(item) !== undefined ||
        getLead(item)?.TranslatedText !== undefined ||
        getBackground(item)?.some((bg) => bg?.HasTranslations || bg?.TranslatedText !== undefined),
    );
    if (anyTranslation) lyricsJSON.HasTranslations = true;
  }

  ttmlLogger.info('Successfully converted lyrics');
  return lyricsJSON;
}

const toFiniteSeconds = (value: number): number | undefined =>
  Number.isFinite(value) && value >= 0 ? value : undefined;

function convertTimeToSeconds(timeValue: TtmlTime | null | undefined): number | undefined {
  if (timeValue == null) return undefined;

  if (typeof timeValue === 'number') return toFiniteSeconds(timeValue);

  const timeString = String(timeValue).trim();
  if (timeString === '') return undefined;

  // Clock time: [hh:]mm:ss[.fraction] — a 4th component is SMPTE frames, which
  // needs ttp:frameRate to interpret, so it is dropped rather than guessed at.
  if (timeString.includes(':')) {
    const parts = timeString.split(':');
    if (parts.length < 2 || parts.length > 4) {
      ttmlLogger.debug('Unparseable clock time in TTML, ignoring', { timeString });
      return undefined;
    }

    const reversed = parts.slice().reverse();
    const offset = parts.length === 4 ? 1 : 0;

    let seconds = 0;
    for (let i = offset; i < reversed.length; i++) {
      const part = parseFloat(reversed[i]);
      if (!Number.isFinite(part)) {
        ttmlLogger.debug('Unparseable clock time in TTML, ignoring', { timeString });
        return undefined;
      }
      seconds += part * Math.pow(60, i - offset);
    }

    return toFiniteSeconds(seconds);
  }

  // Offset time: 12.5s / 300ms / 2m / 1.5h (and the unitless legacy form).
  const match = /^([+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+))(ms|h|m|s|f|t)?$/.exec(timeString);
  if (!match) {
    ttmlLogger.debug('Unparseable time value in TTML, ignoring', { timeString });
    return undefined;
  }

  const value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return undefined;

  switch (match[2]) {
    case 'ms':
      return toFiniteSeconds(value / 1000);
    case 'h':
      return toFiniteSeconds(value * 3600);
    case 'm':
      return toFiniteSeconds(value * 60);
    case 's':
    case undefined:
      return toFiniteSeconds(value);
    default:
      // 'f' (frames) and 't' (ticks) need ttp:frameRate / ttp:tickRate.
      ttmlLogger.debug('Unsupported TTML time metric, ignoring', { timeString });
      return undefined;
  }
}

function inferLyricsType(ttml: TtmlDocument): TTMLLyricsType {
  const divs = getDivs(ttml);
  let sawTiming = false;

  for (const div of divs) {
    if (!div || div.p == null) continue;
    const ps = toArray(div.p);
    for (const p of ps) {
      if (!p || typeof p !== 'object') continue;
      if (p.span) {
        const spans = toArray(p.span);
        const timedVocalSpans = spans.filter(
          (s): s is TtmlSpan => isVocalSpan(s) && Boolean(s.begin),
        );
        if (timedVocalSpans.length > 1) return 'Syllable';
        if (timedVocalSpans.length === 1) sawTiming = true;
      }
      if (p.begin) sawTiming = true;
    }
  }

  return sawTiming ? 'Line' : 'Static';
}

function GetSongWriters(ttml: TtmlDocument): string[] | null {
  ttmlLogger.debug('Getting songwriters from TTML');
  const itm = ttml?.tt?.head?.metadata?.iTunesMetadata;
  const itmetadata = Array.isArray(itm) ? itm.find(i => i?.songwriters) ?? itm[0] : itm;
  const SongWriters = itmetadata?.songwriters?.songwriter;
  if (!SongWriters) {
    ttmlLogger.debug('No songwriters found in TTML');
    return null;
  }
  const ProcessedSongWriters = toArray(SongWriters);

  const SongWritersOutput = ProcessedSongWriters.map(SongWriter => {
    if (SongWriter == null) return null;
    const text = decodeXmlEntities(String(SongWriter)).trim();
    return text === '' ? null : text;
  }).filter((writer): writer is string => writer !== null);
  if (SongWritersOutput.length === 0) {
    ttmlLogger.debug("SongWriters - Not Found after mapping");
    return null;
  }
  ttmlLogger.debug('Found songwriters:', SongWritersOutput);
  return SongWritersOutput;
}

function GetTransliterations(
  ttml: TtmlDocument,
  wordEnds: Map<string, boolean>,
): TransliterationMap | null {
  ttmlLogger.debug('Getting transliterations from TTML');
  const itm = ttml?.tt?.head?.metadata?.iTunesMetadata;
  if (!itm) return null;

  const map: TransliterationMap = new Map();
  let sawTransliterationNode = false;

  // Some documents split metadata across several iTunesMetadata elements.
  toArray(itm).forEach((metadata) => {
    const transliteration = metadata?.transliterations?.transliteration;
    if (!transliteration) return;
    sawTransliterationNode = true;

    toArray(transliteration).forEach((block) => {
      toArray(block?.text).forEach((entry) => {
        const lineKey = entry?.for;
        if (!lineKey) return;

        const line: TransliterationLine = { spans: [], background: [] };
        collectTransliterationSpans(toArray(entry.span), line.spans, line.background, {
          lineKey,
          background: false,
          wordEnds,
        });

        if (line.spans.length === 0 && line.background.length === 0) return;

        const existing = map.get(lineKey);
        if (existing) {
          existing.spans.push(...line.spans);
          existing.background.push(...line.background);
        } else {
          map.set(lineKey, line);
        }
      });
    });
  });

  if (!sawTransliterationNode) {
    ttmlLogger.debug('No transliterations found in TTML');
    return null;
  }

  if (map.size === 0) {
    ttmlLogger.warn('Transliterations present but produced no usable spans');
    return null;
  }

  ttmlLogger.debug(`Found transliterations for ${map.size} line(s)`);
  return map;
}

/**
 * Flattens a transliteration entry's spans. A timed span is a leaf; a span that
 * holds children instead is a wrapper and has to be descended into — an
 * `<span ttm:role="x-bg">` wrapper is exactly that, and silently dropping it
 * (it carries no timings of its own) is what left background lines
 * untransliterated. Its children are routed to the background list so they can
 * never be mistaken for lead syllables.
 *
 * Each span takes its romanized word end from the raw scan here, keyed by the
 * entry and vocal it was read from, since a background vocal can later be
 * handed either list.
 */
function collectTransliterationSpans(
  nodes: TtmlSpanNode[],
  out: TransliterationSpan[],
  background: TransliterationSpan[],
  source: { lineKey: string; background: boolean; wordEnds: Map<string, boolean> },
): void {
  nodes.forEach((node) => {
    if (!isSpanObject(node)) return;

    const children = toArray(node.span);
    if (children.length > 0) {
      const isBg = node['ttm:role'] === 'x-bg';
      collectTransliterationSpans(
        children,
        isBg ? background : out,
        background,
        isBg ? { ...source, background: true } : source,
      );
      return;
    }

    if (node.begin == null || node.end == null) return;

    out.push({
      begin: node.begin,
      end: node.end,
      beginSeconds: convertTimeToSeconds(node.begin),
      endSeconds: convertTimeToSeconds(node.end),
      text: readText(node['#text']),
      endsWord: source.wordEnds.get(
        transliterationSpanKey(source.lineKey, source.background, node.begin, node.end),
      ),
    });
  });
}

/**
 * Background vocals are transliterated in one of two shapes: a dedicated
 * <text for="..."> entry keyed off the x-bg span's own itunes:key, or — far
 * more commonly — an x-bg wrapper nested inside the *line's* entry. Prefer
 * whichever background list exists, then fall back to the lead spans, which is
 * what legacy single-block documents rely on.
 */
function pickBackgroundTransliterations(
  bgEntry: TransliterationLine | undefined,
  lineEntry: TransliterationLine | undefined,
): TransliterationSpan[] | undefined {
  for (const entry of [bgEntry, lineEntry]) {
    if (!entry) continue;
    if (entry.background.length > 0) return entry.background;
    if (entry.spans.length > 0) return entry.spans;
  }
  return undefined;
}

/** Timings can be written differently on both sides ("10.5s" vs "00:00:10.500"). */
const TIME_MATCH_EPSILON = 0.002;

function findTransliteratedText(
  spans: TransliterationSpan[] | null | undefined,
  begin: TtmlTime | undefined,
  end: TtmlTime | undefined,
): TransliterationSpan | undefined {
  if (!Array.isArray(spans) || spans.length === 0) return undefined;
  if (begin == null || end == null || begin === '' || end === '') return undefined;

  const exact = spans.find((span) => span.begin === begin && span.end === end);
  if (exact) return exact;

  const beginSeconds = convertTimeToSeconds(begin);
  const endSeconds = convertTimeToSeconds(end);
  if (beginSeconds === undefined || endSeconds === undefined) return undefined;

  return spans.find(
    (span) =>
      span.beginSeconds !== undefined &&
      span.endSeconds !== undefined &&
      Math.abs(span.beginSeconds - beginSeconds) <= TIME_MATCH_EPSILON &&
      Math.abs(span.endSeconds - endSeconds) <= TIME_MATCH_EPSILON,
  );
}

function getLineText(p: TtmlPNode | undefined): string | undefined {
  if (p == null) return undefined;
  if (typeof p === 'string') return decodeXmlEntities(p);
  if (typeof p !== 'object') return readText(p);
  if (p.span) {
    const spans = toArray(p.span);
    const mainTexts = spans
      .filter((s) => typeof s === 'string' || isVocalSpan(s))
      .map((s) => (typeof s === 'string' ? decodeXmlEntities(s) : readText(s['#text'])))
      .filter((text) => text !== '');
    if (mainTexts.length > 0) {
      return mainTexts.reduce((acc, cur, i) => {
        if (i === 0) return cur;
        const needsSpace = !/\s$/.test(acc) && !/^\s/.test(cur);
        return acc + (needsSpace ? ' ' : '') + cur;
      }, '');
    }
  }
  if (p['#text'] != null) return readText(p['#text']);
  return undefined;
}


function extractRoleTexts(spans: TtmlSpanNode[]): RoleTexts {
  const result: RoleTexts = { roman: undefined, translation: undefined };
  if (!Array.isArray(spans)) return result;
  spans.forEach((s) => {
    if (!isSpanObject(s)) return;
    const role = s['ttm:role'];
    if (role === 'x-roman' && result.roman === undefined) {
      result.roman = readText(s['#text']);
    } else if (role === 'x-translation' && result.translation === undefined) {
      result.translation = readText(s['#text']);
    }
  });
  return result;
}

function getInlineRoleTexts(p: TtmlPNode | undefined): RoleTexts {
  if (!p || typeof p !== 'object' || !p.span) return { roman: undefined, translation: undefined };
  return extractRoleTexts(toArray(p.span));
}

export function GetLyricsType(ttmlXml: string): TTMLLyricsType | string | null {
  ttmlLogger.debug('Getting lyrics type from TTML XML');

  if (typeof ttmlXml !== 'string' || ttmlXml.trim() === '') {
    ttmlLogger.warn('Cannot determine lyrics type: empty or non-string input');
    return null;
  }

  let ttml: TtmlDocument;
  try {
    ttml = parser.parse(ttmlXml) as TtmlDocument;
  } catch (parseError) {
    ttmlLogger.error('Failed to parse TTML XML', (parseError as Error)?.message);
    return null;
  }

  if (!ttml?.tt || typeof ttml.tt !== 'object') {
    ttmlLogger.warn('Cannot determine lyrics type: parsed XML is not a TTML document');
    return null;
  }

  const timing = ttml.tt['itunes:timing'];

  if (timing === 'None') {
    ttmlLogger.debug('Determined lyrics type: Static');
    return 'Static';
  } else if (timing === 'Word') {
    ttmlLogger.debug('Determined lyrics type: Syllable');
    return 'Syllable';
  } else if (timing === undefined) {
    const inferred = inferLyricsType(ttml);
    ttmlLogger.debug(`No itunes:timing attribute, inferred lyrics type: ${inferred}`);
    return inferred;
  } else {
    ttmlLogger.debug(`Determined lyrics type: ${timing}`);
    return timing;
  }
}
