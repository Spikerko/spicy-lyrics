export function teluguRomanization(text: string) {
  const normalizedText = text.normalize('NFC');
  const words = normalizedText.split(' ');
  const result: string[] = [];

  for (const word of words) {
    result.push(_teluguToRoman(word));
  }

  return result.join(' ');
}

const TELUGU_MAP: Record<string, string> = {
  // Vowels
  అ: 'a',
  ఆ: 'aa',
  ఇ: 'i',
  ఈ: 'ii',
  ఉ: 'u',
  ఊ: 'uu',
  ఋ: 'ru',
  ౠ: 'ruu',
  ఎ: 'e',
  ఏ: 'ee',
  ఐ: 'ai',
  ఒ: 'o',
  ఓ: 'oo',
  ఔ: 'au',

  // Consonants
  క: 'k',
  ఖ: 'kh',
  గ: 'g',
  ఘ: 'gh',
  ఙ: 'ng',
  చ: 'ch',
  ఛ: 'chh',
  జ: 'j',
  ఝ: 'jh',
  ఞ: 'ny',
  ట: 't',
  ఠ: 'th',
  డ: 'd',
  ఢ: 'dh',
  ణ: 'n',
  త: 'th',
  థ: 'th',
  ద: 'd',
  ధ: 'dh',
  న: 'n',
  ప: 'p',
  ఫ: 'ph',
  బ: 'b',
  భ: 'bh',
  మ: 'm',
  య: 'y',
  ర: 'r',
  ల: 'l',
  వ: 'v',
  శ: 'sh',
  ష: 'sh',
  స: 's',
  హ: 'h',
  ళ: 'l',
  క్ష: 'ksh',
  ఱ: 'r',

  // Vowel Signs
  'ా': 'aa',
  'ి': 'i',
  'ీ': 'ii',
  'ు': 'u',
  'ూ': 'uu',
  'ృ': 'ru',
  'ౄ': 'ruu',
  'ె': 'e',
  'ే': 'ee',
  'ై': 'ai',
  'ొ': 'o',
  'ో': 'oo',
  'ౌ': 'au',

  // Modifiers
  'ం': 'm', // Anusvara
  'ః': 'h', // Visarga
  '్': '', // Virama
};

const CONSONANTS = new Set([
  'క',
  'ఖ',
  'గ',
  'ఘ',
  'ఙ',
  'చ',
  'ఛ',
  'జ',
  'ఝ',
  'ఞ',
  'ట',
  'ఠ',
  'డ',
  'ఢ',
  'ణ',
  'త',
  'థ',
  'ద',
  'ధ',
  'న',
  'ప',
  'ఫ',
  'బ',
  'భ',
  'మ',
  'య',
  'ర',
  'ల',
  'వ',
  'శ',
  'ష',
  'స',
  'హ',
  'ళ',
  'ఱ',
]);

const VOWEL_SIGNS = new Set(['ా', 'ి', 'ీ', 'ు', 'ూ', 'ృ', 'ౄ', 'ె', 'ే', 'ై', 'ొ', 'ో', 'ౌ', 'ం', 'ః']);

const VIRAMA = '్';

function _teluguToRoman(text: string): string {
  let result = '';
  let i = 0;

  while (i < text.length) {
    const currentChar = text[i];
    const nextChar = text[i + 1] || '';

    const mappedChar = TELUGU_MAP[currentChar];

    if (mappedChar !== undefined) {
      const isConsonant = CONSONANTS.has(currentChar);
      const isFollowedByVowel = VOWEL_SIGNS.has(nextChar);
      const isFollowedByVirama = nextChar === VIRAMA;

      if (isConsonant) {
        if (!isFollowedByVowel && !isFollowedByVirama) {
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
