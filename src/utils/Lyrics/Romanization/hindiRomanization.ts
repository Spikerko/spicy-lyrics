export function hindiRomanization(text: string) {
  const normalizedText = text.normalize('NFC');
  const words = normalizedText.split(' ');
  const result: string[] = [];

  for (const word of words) {
    result.push(_devanagariToRoman(word));
  }

  return result.join(' ');
}

const HINDI_MAP: Record<string, string> = {
  // Vowels
  अ: 'a',
  आ: 'aa',
  इ: 'i',
  ई: 'ee',
  उ: 'u',
  ऊ: 'oo',
  ऋ: 'ri',
  ए: 'e',
  ऐ: 'ai',
  ओ: 'o',
  औ: 'au',

  // Consonants
  क: 'k',
  ख: 'kh',
  ग: 'g',
  घ: 'gh',
  ङ: 'ng',
  च: 'ch',
  छ: 'chh',
  ज: 'j',
  झ: 'jh',
  ञ: 'nj',
  ट: 't',
  ठ: 'th',
  ड: 'd',
  ढ: 'dh',
  ण: 'n',
  त: 't',
  थ: 'th',
  द: 'd',
  ध: 'dh',
  न: 'n',
  प: 'p',
  फ: 'ph',
  ब: 'b',
  भ: 'bh',
  म: 'm',
  य: 'y',
  र: 'r',
  ल: 'l',
  ळ: 'l',
  व: 'v',
  श: 'sh',
  ष: 'sh',
  स: 's',
  ह: 'h',

  // Conjuncts / Special
  क्ष: 'ksh',
  त्र: 'tr',
  ज्ञ: 'gy',

  // Vowel Signs
  'ा': 'aa',
  'ि': 'i',
  'ी': 'ee',
  'ु': 'u',
  'ू': 'oo',
  'ृ': 'ri',
  'े': 'e',
  'ै': 'ai',
  'ो': 'o',
  'ौ': 'au',
  'ं': 'n',
  'ः': 'h',
  'ँ': 'n',
  '्': '',
  '़': '',

  // Nukta
  क़: 'q',
  ख़: 'kh',
  ग़: 'g',
  ज़: 'z',
  ड़: 'r',
  ढ़: 'rh',
  फ़: 'f',
};

const CONSONANTS = new Set([
  'क',
  'ख',
  'ग',
  'घ',
  'ङ',
  'च',
  'छ',
  'ज',
  'झ',
  'ञ',
  'ट',
  'ठ',
  'ड',
  'ढ',
  'ण',
  'त',
  'थ',
  'द',
  'ध',
  'न',
  'प',
  'फ',
  'ब',
  'भ',
  'म',
  'य',
  'र',
  'ल',
  'ळ',
  'व',
  'श',
  'ष',
  'स',
  'ह',
  'क्ष',
  'त्र',
  'ज्ञ',
  'क़',
  'ख़',
  'ग़',
  'ज़',
  'ड़',
  'ढ़',
  'फ़',
]);

const VOWEL_SIGNS = new Set(['ा', 'ि', 'ी', 'ु', 'ू', 'ृ', 'े', 'ै', 'ो', 'ौ', 'ं', 'ँ']);

function _devanagariToRoman(text: string): string {
  let result = '';
  let i = 0;

  while (i < text.length) {
    let currentChar = text[i];
    let nextChar = text[i + 1] || '';
    let isNuktaPair = false;

    if (nextChar === '़') {
      const combined = currentChar + nextChar;
      if (HINDI_MAP[combined]) {
        currentChar = combined;
        isNuktaPair = true;
        nextChar = text[i + 2] || '';
      }
    }

    if (currentChar === '्') {
      i++;
      continue;
    }

    const mappedChar = HINDI_MAP[currentChar];

    if (mappedChar !== undefined) {
      const isConsonant = CONSONANTS.has(currentChar);
      const isFollowedByVowel = VOWEL_SIGNS.has(nextChar);
      const isFollowedByHalant = nextChar === '्';

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

    i += isNuktaPair ? 2 : 1;
  }

  return result;
}
