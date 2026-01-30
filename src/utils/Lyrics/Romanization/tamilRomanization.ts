export function tamilRomanization(text: string) {
  const normalizedText = text.normalize('NFC');
  const words = normalizedText.split(' ');
  const result: string[] = [];

  for (const word of words) {
    result.push(_tamilToRoman(word));
  }

  return result.join(' ');
}

const TAMIL_MAP: Record<string, string> = {
  // Vowels
  அ: 'a',
  ஆ: 'aa',
  இ: 'i',
  ஈ: 'ii',
  உ: 'u',
  ஊ: 'uu',
  எ: 'e',
  ஏ: 'ee',
  ஐ: 'ai',
  ஒ: 'o',
  ஓ: 'oo',
  ஔ: 'au',
  ஃ: 'akh',

  // Consonants
  க: 'k',
  ங: 'ng',
  ச: 's',
  ஞ: 'nj',
  ட: 't',
  ண: 'n',
  த: 'th',
  ந: 'n',
  ன: 'n',
  ப: 'p',
  ம: 'm',
  ய: 'y',
  ர: 'r',
  ல: 'l',
  வ: 'v',
  ழ: 'zh',
  ள: 'l',
  ற: 'r',

  // Grantha
  ஜ: 'j',
  ஷ: 'sh',
  ஸ: 's',
  ஹ: 'h',
  க்ஷ: 'ksh',

  // Vowel Signs
  'ா': 'aa',
  'ி': 'i',
  'ீ': 'ii',
  'ு': 'u',
  'ூ': 'uu',
  'ெ': 'e',
  'ே': 'ee',
  'ை': 'ai',
  'ொ': 'o',
  'ோ': 'oo',
  'ௌ': 'au',

  // Modifiers
  '்': '', // Pulli
};

const TAMIL_CONSONANTS = new Set([
  'க',
  'ங',
  'ச',
  'ஞ',
  'ட',
  'ண',
  'த',
  'ந',
  'ன',
  'ப',
  'ம',
  'ய',
  'ர',
  'ல',
  'வ',
  'ழ',
  'ள',
  'ற',
  'ஜ',
  'ஷ',
  'ஸ',
  'ஹ',
]);

const TAMIL_VOWEL_SIGNS = new Set(['ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ']);

function _tamilToRoman(text: string): string {
  let result = '';
  let i = 0;

  while (i < text.length) {
    const currentChar = text[i];
    const nextChar = text[i + 1] || '';

    if (currentChar === 'க' && nextChar === '்' && text[i + 2] === 'ஷ') {
      result += 'ksh';
      i += 3;
      continue;
    }

    const mappedChar = TAMIL_MAP[currentChar];

    if (mappedChar !== undefined) {
      const isConsonant = TAMIL_CONSONANTS.has(currentChar);
      const isFollowedByVowel = TAMIL_VOWEL_SIGNS.has(nextChar);
      const isFollowedByPulli = nextChar === '்';

      if (isConsonant) {
        if (!isFollowedByVowel && !isFollowedByPulli) {
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
