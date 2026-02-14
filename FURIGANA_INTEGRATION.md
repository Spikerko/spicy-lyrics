# Furigana Feature Integration

## Overview
The furigana feature from `spicetify-furigana-lyrics` has been successfully integrated into `spicy-lyrics`. This feature adds Japanese reading annotations (furigana) to kanji characters in lyrics, making it easier to read Japanese songs.

## What Was Added

### 1. Core Functionality
- **FuriganaConverter.ts** (`src/utils/Lyrics/FuriganaConverter.ts`)
  - Uses the existing Kuromoji tokenizer infrastructure
  - Converts Japanese text to HTML with ruby tags for furigana display
  - Automatically detects kanji and adds hiragana readings above them
  - Includes helper functions for character type detection (kanji, hiragana, katakana)

### 2. User Settings
- **New Setting in Defaults.ts**
  - `EnableFurigana: false` - Default disabled, user can enable
  
- **Settings Menu Toggle** (`src/utils/settings.ts`)
  - "Enable Furigana (Japanese reading annotations for Kanji)"
  - Located in the general Spicy Lyrics settings
  - Requires page reload after toggling

### 3. Lyrics Integration
Modified three lyrics applyer files to support furigana:

- **Syllable.ts** (`src/utils/Lyrics/Applyer/Synced/Syllable.ts`)
  - Word-by-word karaoke-style lyrics with furigana support
  - Only applies to words that don't use letter-by-letter animation
  - Works for both lead and background vocals

- **Line.ts** (`src/utils/Lyrics/Applyer/Synced/Line.ts`)
  - Line-synced lyrics with furigana support
  - Entire lines display with furigana when enabled

- **Static.ts** (`src/utils/Lyrics/Applyer/Static.ts`)
  - Static (unsynced) lyrics with furigana support

### 4. Styling
- **furigana.css** (`src/css/Lyrics/furigana.css`)
  - Comprehensive CSS styling for ruby tags
  - Responsive sizing for different lyrics modes (Syllable, Line, Static)
  - Proper spacing and opacity adjustments
  - Compatible with existing animations and effects
  - Compact mode and RTL support

## How It Works

1. **Initialization**: When furigana is enabled and lyrics are loaded, the Kuromoji analyzer is initialized
2. **Text Analysis**: Each word/line is analyzed using Kuromoji to identify kanji and their readings
3. **HTML Generation**: Kanji are wrapped in `<ruby>` tags with `<rt>` elements containing hiragana readings
4. **Display**: The formatted HTML is rendered with custom CSS styling

## Usage

### For Users:
1. Open Spotify with Spicy Lyrics installed
2. Go to Settings
3. Find "Spicy Lyrics" settings section
4. Enable "Enable Furigana (Japanese reading annotations for Kanji)"
5. Reload the page
6. Play Japanese songs to see furigana above kanji characters

### Technical Details:
- Furigana only applies when not using romanized text mode
- Uses `innerHTML` instead of `textContent` when furigana is enabled
- Asynchronous conversion with fallback to regular text on error
- Ruby tags inherit text animations and gradient effects

## Compatibility

- ✅ Works with all three lyrics types (Syllable, Line, Static)
- ✅ Compatible with Simple Lyrics Mode
- ✅ Compatible with Minimal Lyrics Mode
- ✅ Compatible with Compact Mode
- ✅ Works with romanization (furigana disabled when romanization is active)
- ✅ Supports RTL languages
- ✅ Compatible with dynamic backgrounds and animations

## Benefits

- Helps learners read Japanese lyrics
- Maintains all existing Spicy Lyrics features and animations
- Non-intrusive - only activates when enabled
- Uses existing Kuromoji infrastructure (no additional dependencies)
- Graceful fallback if conversion fails

## Files Modified

### New Files:
- `src/utils/Lyrics/FuriganaConverter.ts`
- `src/css/Lyrics/furigana.css`

### Modified Files:
- `src/components/Global/Defaults.ts` - Added EnableFurigana default
- `src/utils/settings.ts` - Added furigana toggle
- `src/app.tsx` - Added furigana CSS import and storage initialization
- `src/utils/Lyrics/Applyer/Synced/Syllable.ts` - Integrated furigana conversion
- `src/utils/Lyrics/Applyer/Synced/Line.ts` - Integrated furigana conversion
- `src/utils/Lyrics/Applyer/Static.ts` - Integrated furigana conversion
- `src/utils/Lyrics/Global/Applyer.ts` - Added await for async applyer functions

## Notes

- The feature reuses the existing Kuromoji package that Spicy Lyrics already uses
- Conversion happens asynchronously to avoid blocking the UI
- Error handling ensures lyrics always display even if furigana conversion fails
- The implementation preserves all existing Spicy Lyrics functionality
