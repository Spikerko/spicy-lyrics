/**
* Converts any lyrics format to Static Lyrics format
* @param {Object} lyrics - The lyrics object in any supported format
* @return {Object} - Lyrics in Static format
*/

// --- Types ---
export type Syllable = {
  Text: string;
  IsPartOfWord?: boolean;
};

export type Lead = {
  Syllables: Syllable[];
  OppositeAligned?: boolean;
  StartTime?: number;
  EndTime?: number;
};

export type BackgroundVocal = {
  Syllables: Syllable[];
};

export type SyllableVocalContent = {
  Type: "Vocal";
  Lead?: Lead;
  Background?: BackgroundVocal[];
};

export type SyllableLyrics = {
  Type: "Syllable";
  Content: SyllableVocalContent[];
  SongWriters?: string[];
  id?: string;
};

export type LineVocalContent = {
  Type: "Vocal";
  OppositeAligned?: boolean;
  Text: string;
  StartTime?: number;
  EndTime?: number;
};

export type LineLyrics = {
  Type: "Line";
  Content: LineVocalContent[];
  SongWriters?: string[];
  id?: string;
};

export type StaticLine = {
  Text: string;
};

export type StaticLyrics = {
  Type: "Static";
  SongWriters?: string[];
  id?: string;
  Lines: StaticLine[];
  source?: string;
};

type AnyLyrics = SyllableLyrics | LineLyrics | StaticLyrics | Record<string, any>;

// --- Implementation ---

export function convertToStaticLyrics(lyrics: AnyLyrics): StaticLyrics {
  // Clone input to avoid modifying original
  const input = JSON.parse(JSON.stringify(lyrics));
  // Determine the input format
  const format = determineFormat(input);

  // Convert based on format
  const staticLyrics: StaticLyrics = {
    Type: "Static",
    ...(input.SongWriters ? { SongWriters: input.SongWriters } : {}),
    Lines: [],
    id: input.id ?? "",
  };

  switch (format) {
    case "Syllable":
      staticLyrics.Lines = convertSyllableToStatic(input as SyllableLyrics);
      break;
    case "Line":
      staticLyrics.Lines = convertLineToStatic(input as LineLyrics);
      break;
    case "Static":
      staticLyrics.Lines = (input as StaticLyrics).Lines ?? [];
      break;
    default:
      throw new Error("Unsupported lyrics format");
  }

  return staticLyrics;
}

/**
* Converts Syllable format to Static format
* @param {SyllableLyrics} syllableLyrics - Lyrics in Syllable format
* @return {StaticLine[]} - Array of Line objects for Static format
*/
function convertSyllableToStatic(syllableLyrics: SyllableLyrics): StaticLine[] {
  const lines: StaticLine[] = [];

  // Process each content item
  if (syllableLyrics.Content && Array.isArray(syllableLyrics.Content)) {
    syllableLyrics.Content.forEach((content) => {
      if (content.Type === "Vocal") {
        // Process lead vocals
        if (content.Lead && content.Lead.Syllables) {
          // Build line text with proper word spacing
          let lineText = "";
          const syllables = content.Lead.Syllables;

          for (let i = 0; i < syllables.length; i++) {
            const syllable = syllables[i];
            lineText += syllable.Text;
            if (i < syllables.length - 1 && !syllable.IsPartOfWord) {
              lineText += " ";
            }
          }

          // Add completed line if not empty
          if (lineText.trim()) {
            lines.push({ Text: lineText.trim() });
          }
        }

        // Process background vocals if present
        if (content.Background && Array.isArray(content.Background)) {
          content.Background.forEach((bgVocal) => {
            if (bgVocal.Syllables) {
              let bgLineText = "";
              const bgSyllables = bgVocal.Syllables;

              for (let i = 0; i < bgSyllables.length; i++) {
                const syllable = bgSyllables[i];
                bgLineText += syllable.Text;
                if (i < bgSyllables.length - 1 && !syllable.IsPartOfWord) {
                  bgLineText += " ";
                }
              }

              if (bgLineText.trim() && lines.length > 0) {
                lines[lines.length - 1].Text += ` (${bgLineText.trim()})`;
              }
            }
          });
        }
      }
    });
  }

  return lines;
}

/**
* Converts any lyrics format to Line Lyrics format
* @param {AnyLyrics} lyrics - The lyrics object in any supported format
* @return {LineLyrics} - Lyrics in Line format
*/
export function convertToLineLyrics(lyrics: AnyLyrics): LineLyrics {
  // Clone input to avoid modifying original
  const input = JSON.parse(JSON.stringify(lyrics));
  // Determine the input format
  const format = determineFormat(input);

  // Can't convert static to line
  if (format === "Static") {
    throw new Error("Cannot convert Static lyrics to Line lyrics format");
  }

  // Convert based on format
  const lineLyrics: LineLyrics = {
    ...(input as any), // Preserve other properties like SongWriters
    Type: "Line",
    Content: [],
    id: input.id ?? "",
  };

  switch (format) {
    case "Syllable":
      lineLyrics.Content = convertSyllableToLine(input as SyllableLyrics);
      break;
    case "Line":
      lineLyrics.Content = input.Content ?? [];
      break;
    default:
      throw new Error("Unsupported lyrics format");
  }

  return lineLyrics;
}

/**
* Converts Syllable format to Line format
* @param {SyllableLyrics} syllableLyrics - Lyrics in Syllable format
* @return {LineVocalContent[]} - Array of Line objects for Line format
*/
function convertSyllableToLine(syllableLyrics: SyllableLyrics): LineVocalContent[] {
  const content: LineVocalContent[] = [];

  // Process each content item
  if (syllableLyrics.Content && Array.isArray(syllableLyrics.Content)) {
    syllableLyrics.Content.forEach((syllableContent) => {
      if (syllableContent.Type === "Vocal") {
        // Process lead vocals
        if (syllableContent.Lead && syllableContent.Lead.Syllables) {
          let lineText = "";
          const syllables = syllableContent.Lead.Syllables;

          for (let i = 0; i < syllables.length; i++) {
            const syllable = syllables[i];
            lineText += syllable.Text;
            if (i < syllables.length - 1 && !syllable.IsPartOfWord) {
              lineText += " ";
            }
          }

          if (lineText.trim()) {
            content.push({
              Type: "Vocal",
              OppositeAligned: syllableContent.Lead.OppositeAligned ?? false,
              Text: lineText.trim(),
              StartTime: syllableContent.Lead.StartTime,
              EndTime: syllableContent.Lead.EndTime,
            });
          }
        }

        // Process background vocals if present
        if (syllableContent.Background && Array.isArray(syllableContent.Background)) {
          syllableContent.Background.forEach((bgVocal) => {
            if (bgVocal.Syllables) {
              let bgLineText = "";
              const bgSyllables = bgVocal.Syllables;

              for (let i = 0; i < bgSyllables.length; i++) {
                const syllable = bgSyllables[i];
                bgLineText += syllable.Text;
                if (i < bgSyllables.length - 1 && !syllable.IsPartOfWord) {
                  bgLineText += " ";
                }
              }

              if (bgLineText.trim() && content.length > 0) {
                content[content.length - 1].Text += ` (${bgLineText.trim()})`;
              }
            }
          });
        }
      }
    });
  }

  return content;
}

/**
* Converts Line format to Static format
* @param {LineLyrics} lineLyrics - Lyrics in Line format
* @return {StaticLine[]} - Array of Line objects for Static format
*/
function convertLineToStatic(lineLyrics: LineLyrics): StaticLine[] {
  const lines: StaticLine[] = [];

  // Process each content item
  if (lineLyrics.Content && Array.isArray(lineLyrics.Content)) {
    lineLyrics.Content.forEach((content) => {
      if (content.Type === "Vocal" && content.Text) {
        lines.push({ Text: content.Text });
      }
    });
  }

  return lines;
}

// Helper functions (unchanged)
export function determineFormat(lyrics: any): "Syllable" | "Line" | "Static" | "Unknown" {
  if (lyrics.Type === "Syllable") return "Syllable";
  if (lyrics.Type === "Line") return "Line";
  if (lyrics.Type === "Static") return "Static";

  if (lyrics.Content && lyrics.Content[0]?.Type === "Vocal" &&
    lyrics.Content[0]?.Lead?.Syllables) {
    return "Syllable";
  }

  if (lyrics.Content && lyrics.Content[0]?.Type === "Vocal" &&
    lyrics.Content[0]?.Text) {
    return "Line";
  }

  if (lyrics.Lines && Array.isArray(lyrics.Lines)) {
    return "Static";
  }

  return "Unknown";
}


export function processStaticLyricsToClassicFormat(sourceLyrics: StaticLyrics) {
  const lyrics = { ...sourceLyrics };

  const obj: {
    content: { text: string }[];
    type: string;
    id: string;
    source: string;
    songwriters: string[];
  } = {
    content: [],
    type: lyrics.Type ?? "",
    id: lyrics.id ?? "",
    source: lyrics.source ?? "",
    songwriters: Array.isArray(lyrics.SongWriters) ? lyrics.SongWriters : [],
  };

  if (Array.isArray(lyrics.Lines)) {
    obj.content = lyrics.Lines.map((line) => ({
      text: line.Text,
    }));
  }

  return obj;
}