export function malayalamRomanization(text: string) {
  const normalizedText = text.normalize('NFC');
  const words = normalizedText.split(' ');
  const result: string[] = [];

  for (const word of words) {
    result.push(_malayalamToRoman(word));
  }

  return result.join(' ');
}

const MALAYALAM_MAP: Record<string, string> = {
  // Vowels
  അ: 'a',
  ആ: 'aa',
  ഇ: 'i',
  ഈ: 'ee',
  ഉ: 'u',
  ഊ: 'oo',
  ഋ: 'ru',
  എ: 'e',
  ഏ: 'e',
  ഐ: 'ai',
  ഒ: 'o',
  ഓ: 'o',
  ഔ: 'au',
  അം: 'am',

  // Consonants
  ക: 'k',
  ഖ: 'kh',
  ഗ: 'g',
  ഘ: 'gh',
  ങ: 'ng',
  ച: 'ch',
  ഛ: 'chh',
  ജ: 'j',
  ഝ: 'jh',
  ഞ: 'nj',
  ട: 't',
  ഠ: 'th',
  ഡ: 'd',
  ഢ: 'dh',
  ണ: 'n',
  ത: 'th',
  ഥ: 'th',
  ദ: 'd',
  ന: 'n',
  പ: 'p',
  ഫ: 'ph',
  ബ: 'b',
  ഭ: 'bh',
  മ: 'm',
  യ: 'y',
  ര: 'r',
  ല: 'l',
  വ: 'v',
  ശ: 'sh',
  ഷ: 'sh',
  സ: 's',
  ഹ: 'h',
  ള: 'l',
  ഴ: 'zh',
  റ: 'r',
  ധ: 'dh',

  // Chillu letters
  ൺ: 'n',
  ൻ: 'n',
  ർ: 'r',
  ൽ: 'l',
  ൾ: 'l',
  ക്‍: 'k',

  // Vowel Signs
  'ാ': 'aa',
  'ി': 'i',
  'ീ': 'ee',
  'ു': 'u',
  'ൂ': 'oo',
  'ൃ': 'ru',
  'െ': 'e',
  'േ': 'e',
  'ൈ': 'ai',
  'ൊ': 'o',
  'ോ': 'o',
  'ൗ': 'au',
  'ം': 'm',
  'ഃ': 'h',
  '്': '',
};

const CONSONANTS = new Set([
  'ക',
  'ഖ',
  'ഗ',
  'ഘ',
  'ങ',
  'ച',
  'ഛ',
  'ജ',
  'ഝ',
  'ഞ',
  'ട',
  'ഠ',
  'ഡ',
  'ഢ',
  'ണ',
  'ത',
  'ഥ',
  'ദ',
  'ധ',
  'ന',
  'പ',
  'ഫ',
  'ബ',
  'ഭ',
  'മ',
  'യ',
  'ര',
  'ല',
  'വ',
  'ശ',
  'ഷ',
  'സ',
  'ഹ',
  'ള',
  'ഴ',
  'റ',
]);

const VOWEL_SIGNS = new Set(['ാ', 'ി', 'ീ', 'ു', 'ൂ', 'ൃ', 'െ', 'േ', 'ൈ', 'ൊ', 'ോ', 'ൗ', 'ം', 'ഃ']);

function _malayalamToRoman(text: string): string {
  let result = '';
  let i = 0;

  while (i < text.length) {
    const currentChar = text[i];
    const nextChar = text[i + 1] || '';

    const mappedChar = MALAYALAM_MAP[currentChar];

    if (mappedChar !== undefined) {
      const isConsonant = CONSONANTS.has(currentChar);
      const isFollowedByVowel = VOWEL_SIGNS.has(nextChar);
      const isFollowedByHalant = nextChar === '്';

      if (isConsonant) {
        if (!isFollowedByVowel && !isFollowedByHalant) {
          result += `${mappedChar}a`;
        } else {
          result += mappedChar;
        }
      } else {
        result += mappedChar;
      }
    } else {
      result += currentChar;
    }

    i++;
  }

  return result;
}
