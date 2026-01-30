export function gujaratiRomanization(text: string) {
  const normalizedText = text.normalize('NFC');
  const words = normalizedText.split(' ');
  const result: string[] = [];

  for (const word of words) {
    result.push(_gujaratiToRoman(word));
  }

  return result.join(' ');
}

const GUJARATI_MAP: Record<string, string> = {
  // Vowels
  અ: 'a',
  આ: 'aa',
  ઇ: 'i',
  ઈ: 'ee',
  ઉ: 'u',
  ઊ: 'oo',
  ઋ: 'ru',
  એ: 'e',
  ઐ: 'ai',
  ઓ: 'o',
  ઔ: 'au',

  // Consonants
  ક: 'k',
  ખ: 'kh',
  ગ: 'g',
  ઘ: 'gh',
  ઙ: 'ng',
  ચ: 'ch',
  છ: 'chh',
  જ: 'j',
  ઝ: 'zh',
  ટ: 't',
  ઠ: 'th',
  ડ: 'd',
  ઢ: 'dh',
  ણ: 'n',
  ત: 't',
  થ: 'th',
  દ: 'd',
  ધ: 'dh',
  ન: 'n',
  પ: 'p',
  ફ: 'f',
  બ: 'b',
  ભ: 'bh',
  મ: 'm',
  ય: 'y',
  ર: 'r',
  લ: 'l',
  વ: 'v',
  શ: 'sh',
  ષ: 'sh',
  સ: 's',
  હ: 'h',
  ળ: 'l',

  // Vowel Signs
  'ા': 'aa',
  'િ': 'i',
  'ી': 'ee',
  'ુ': 'u',
  'ૂ': 'oo',
  'ૃ': 'ru',
  'ે': 'e',
  'ૈ': 'ai',
  'ો': 'o',
  'ૌ': 'au',
  'ં': 'n',
  'ઃ': 'h',
  '્': '',
};

const CONSONANTS = new Set([
  'ક',
  'ખ',
  'ગ',
  'ઘ',
  'ઙ',
  'ચ',
  'છ',
  'જ',
  'ઝ',
  'ટ',
  'ઠ',
  'ડ',
  'ઢ',
  'ણ',
  'ત',
  'થ',
  'દ',
  'ધ',
  'ન',
  'પ',
  'ફ',
  'બ',
  'ભ',
  'મ',
  'ય',
  'ર',
  'લ',
  'વ',
  'શ',
  'ષ',
  'સ',
  'હ',
  'ળ',
]);

const VOWEL_SIGNS = new Set(['ા', 'િ', 'ી', 'ુ', 'ૂ', 'ૃ', 'ે', 'ૈ', 'ો', 'ૌ', 'ં']);

function _gujaratiToRoman(text: string): string {
  let result = '';
  let i = 0;

  while (i < text.length) {
    const currentChar = text[i];
    const nextChar = text[i + 1] || '';

    if (currentChar === '્') {
      i++;
      continue;
    }

    const mappedChar = GUJARATI_MAP[currentChar];

    if (mappedChar !== undefined) {
      const isConsonant = CONSONANTS.has(currentChar);
      const isFollowedByVowel = VOWEL_SIGNS.has(nextChar);
      const isFollowedByHalant = nextChar === '્';

      if (isConsonant) {
        const isEndOfWord = nextChar === '' || /[\s.,?!'"]/.test(nextChar);

        if (!isEndOfWord && !isFollowedByVowel && !isFollowedByHalant) {
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
