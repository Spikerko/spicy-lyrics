// Furigana Converter for Japanese Lyrics
// Uses Kuromoji tokenizer to add furigana (reading annotations) to kanji characters

import { init as initKuromoji, parse as parseKuromoji } from "./KuromojiAnalyzer.ts";

let isInitialized = false;

/**
 * Initialize the Kuromoji analyzer for furigana conversion
 */
export async function initFurigana(): Promise<void> {
  if (isInitialized) return;
  
  try {
    await initKuromoji();
    isInitialized = true;
  } catch (error) {
    console.error("SpicyLyrics [FuriganaConverter] Failed to initialize:", error);
    throw error;
  }
}

/**
 * Check if a character is a kanji character
 */
function isKanji(char: string): boolean {
  const code = char.charCodeAt(0);
  // Kanji Unicode ranges
  return (
    (code >= 0x4e00 && code <= 0x9faf) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
    (code >= 0x3005 && code <= 0x3007)    // Kanji iteration marks
  );
}

/**
 * Check if a character is a hiragana character
 */
function isHiragana(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x3040 && code <= 0x309f;
}

/**
 * Check if a character is a katakana character
 */
function isKatakana(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x30a0 && code <= 0x30ff;
}

/**
 * Convert katakana to hiragana
 */
function katakanaToHiragana(text: string): string {
  return text
    .split("")
    .map((char) => {
      if (isKatakana(char)) {
        const code = char.charCodeAt(0);
        return String.fromCharCode(code - 0x60);
      }
      return char;
    })
    .join("");
}

/**
 * Convert text to furigana HTML using ruby tags
 * @param text - The Japanese text to convert
 * @param mode - Conversion mode: "furigana" (default) or "okurigana"
 * @returns HTML string with ruby tags for furigana
 */
export async function convertToFurigana(
  text: string,
  mode: "furigana" | "okurigana" = "furigana"
): Promise<string> {
  if (!text || text.trim() === "") {
    return text;
  }

  // Initialize if not already done
  if (!isInitialized) {
    await initFurigana();
  }

  try {
    // Parse the text using Kuromoji
    const tokens = await parseKuromoji(text);
    
    if (!tokens || tokens.length === 0) {
      return text;
    }

    let result = "";

    for (const token of tokens) {
      const surface = token.surface_form || token.word_position;
      const reading = token.reading;
      const baseForm = token.basic_form;

      // If there's no reading or the surface is already in hiragana/katakana only, just append it
      if (!reading || !surface) {
        result += surface || "";
        continue;
      }

      // Convert reading to hiragana
      const hiraganaReading = katakanaToHiragana(reading);

      // Check if the surface contains kanji
      const hasKanji = Array.from(surface as string).some((char: string) => isKanji(char));

      if (!hasKanji) {
        // No kanji, just append the surface
        result += surface;
        continue;
      }

      // If surface and reading are the same (in hiragana), no furigana needed
      if (surface === hiraganaReading) {
        result += surface;
        continue;
      }

      // Mode: furigana - add furigana to the entire word
      if (mode === "furigana") {
        // Check if all characters are the same as reading (no furigana needed)
        const allHiragana = Array.from(surface as string).every(
          (char: string) => isHiragana(char) || isKatakana(char)
        );
        
        if (allHiragana) {
          result += surface;
        } else {
          // Add ruby tag for furigana
          result += `<ruby>${surface}<rt>${hiraganaReading}</rt></ruby>`;
        }
      } else {
        // Mode: okurigana - more complex mode that tries to only add furigana to kanji parts
        // For now, we'll use a simpler approach similar to furigana mode
        // This can be enhanced later to handle okurigana more precisely
        result += `<ruby>${surface}<rt>${hiraganaReading}</rt></ruby>`;
      }
    }

    return result;
  } catch (error) {
    console.error("SpicyLyrics [FuriganaConverter] Conversion error:", error);
    // Return original text if conversion fails
    return text;
  }
}

/**
 * Convert text to furigana and return as plain text (hiragana reading)
 * Useful for romanization pipelines
 */
export async function convertToHiragana(text: string): Promise<string> {
  if (!text || text.trim() === "") {
    return text;
  }

  if (!isInitialized) {
    await initFurigana();
  }

  try {
    const tokens = await parseKuromoji(text);
    
    if (!tokens || tokens.length === 0) {
      return text;
    }

    return tokens
      .map((token: any) => {
        const reading = token.reading;
        if (!reading) {
          return token.surface_form || "";
        }
        return katakanaToHiragana(reading);
      })
      .join("");
  } catch (error) {
    console.error("SpicyLyrics [FuriganaConverter] Hiragana conversion error:", error);
    return text;
  }
}

/**
 * Check if furigana conversion is available and initialized
 */
export function isFuriganaAvailable(): boolean {
  return isInitialized;
}
