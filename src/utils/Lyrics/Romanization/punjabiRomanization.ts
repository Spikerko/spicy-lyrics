export function punjabiRomanization(text: string) {
  const normalizedText = text.normalize('NFC');
  const words = normalizedText.split(' ');
  const result: string[] = [];

  for (const word of words) {
    result.push(_gurmukhiToHunterian(word));
  }

  return result.join(' ');
}

const GURMUKHI_MAP: Record<string, string> = {
  ੳ: 'u',
  ਅ: 'a',
  ਆ: 'aa',
  ਇ: 'i',
  ਈ: 'ii',
  ਉ: 'u',
  ਊ: 'uu',
  ਏ: 'e',
  ਐ: 'ai',
  ਓ: 'o',
  ਔ: 'au',

  ਸ: 's',
  ਹ: 'h',
  ਕ: 'k',
  ਖ: 'kh',
  ਗ: 'g',
  ਘ: 'gh',
  ਙ: 'n',
  ਚ: 'ch',
  ਛ: 'chh',
  ਜ: 'j',
  ਝ: 'jh',
  ਞ: 'n',
  ਟ: 't',
  ਠ: 'th',
  ਡ: 'd',
  ਢ: 'dh',
  ਣ: 'n',
  ਤ: 't',
  ਥ: 'th',
  ਦ: 'd',
  ਧ: 'dh',
  ਨ: 'n',
  ਪ: 'p',
  ਫ: 'ph',
  ਬ: 'b',
  ਭ: 'bh',
  ਮ: 'm',
  ਯ: 'y',
  ਰ: 'r',
  ਲ: 'l',
  ਵ: 'v',
  ੜ: 'r',

  ਸ਼: 'sh',
  ਖ਼: 'kh',
  ਗ਼: 'gh',
  ਜ਼: 'z',
  ਫ਼: 'f',
  ਲ਼: 'l',

  'ਾ': 'aa',
  'ਿ': 'i',
  'ੀ': 'ii',
  'ੁ': 'u',
  'ੂ': 'uu',
  'ੇ': 'e',
  'ੈ': 'ai',
  'ੋ': 'o',
  'ੌ': 'au',

  'ੰ': 'n',
  'ਂ': 'n',
  '੍': '',
  '਼': '',
  ੴ: 'ik onkar',

  ਸ਼: 'sh',
  ਖ਼: 'kh',
  ਗ਼: 'gh',
  ਜ਼: 'z',
  ਫ਼: 'f',
  ਲ਼: 'l',
};

const GURMUKHI_CONSONANTS = new Set([
  'ਸ',
  'ਹ',
  'ਕ',
  'ਖ',
  'ਗ',
  'ਘ',
  'ਙ',
  'ਚ',
  'ਛ',
  'ਜ',
  'ਝ',
  'ਞ',
  'ਟ',
  'ਠ',
  'ਡ',
  'ਢ',
  'ਣ',
  'ਤ',
  'ਥ',
  'ਦ',
  'ਧ',
  'ਨ',
  'ਪ',
  'ਫ',
  'ਬ',
  'ਭ',
  'ਮ',
  'ਯ',
  'ਰ',
  'ਲ',
  'ਵ',
  'ੜ',
  'ਸ਼',
  'ਖ਼',
  'ਗ਼',
  'ਜ਼',
  'ਫ਼',
  'ਲ਼',
]);

const GURMUKHI_VOWEL_SIGNS = new Set(['ਾ', 'ਿ', 'ੀ', 'ੁ', 'ੂ', 'ੇ', 'ੈ', 'ੋ', 'ੌ']);

const ADHAK = 'ੱ';

function _gurmukhiToHunterian(text: string): string {
  let result = '';
  let i = 0;
  let doubleNext = false;

  while (i < text.length) {
    let currentChar = text[i];
    let nextChar = text[i + 1] || '';
    let isNuktaPair = false;

    if (nextChar === '਼') {
      const combined = currentChar + nextChar;
      if (GURMUKHI_MAP[combined]) {
        currentChar = combined;
        isNuktaPair = true;
        nextChar = text[i + 2] || '';
      }
    }

    if (currentChar === '੍') {
      i++;
      continue;
    }

    if (currentChar === ADHAK) {
      doubleNext = true;
      i++;
      continue;
    }

    const mappedChar = GURMUKHI_MAP[currentChar];

    if (mappedChar !== undefined) {
      const isConsonant = GURMUKHI_CONSONANTS.has(currentChar);

      const isFollowedByVowel = GURMUKHI_VOWEL_SIGNS.has(nextChar);
      const isFollowedByHalant = nextChar === '੍';

      if (doubleNext && isConsonant) {
        result += mappedChar;
        doubleNext = false;
      }

      if (isConsonant && !isFollowedByVowel && !isFollowedByHalant) {
        const isEndOfWord = nextChar === '' || /[\s.,?!'"]/.test(nextChar);

        if (!isEndOfWord) {
          result += mappedChar + 'a';
        } else {
          result += mappedChar;
        }
      } else {
        result += mappedChar;
      }
    } else {
      result += currentChar;
    }

    i += isNuktaPair ? 2 : 1;
  }

  return result;
}
