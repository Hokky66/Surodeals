// Blacklist woorden voor content moderatie
export const blacklistWords: string[] = [
  "seks", "porno", "gokken", "drugs", "wapen", "nep", "scam", "escort", "nude", "fake",
  "sex", "porn", "gambling", "weapon", "fraud", "cocaine", "heroin", "marihuana", "weed",
  "prostitutie", "hoer", "bordeel", "illegaal", "gestolen", "namaak", "oplichting",
  "bitcoin scam", "pyramid scheme", "ponzi", "money laundering", "witwassen"
];

interface ContentCheckResult {
  allowed: boolean;
  blockedWords: string[];
  reason?: string;
}

/**
 * Controleert of advertentie-inhoud verboden woorden bevat
 */
export function checkAdContent(title: string = "", description: string = ""): ContentCheckResult {
  const content = `${title} ${description}`.toLowerCase();
  const foundWords = [];
  
  for (const word of blacklistWords) {
    // Check voor exacte woorden en variaties
    const regex = new RegExp(`\\b${word.toLowerCase()}\\b`, 'i');
    if (regex.test(content)) {
      foundWords.push(word);
    }
  }
  
  if (foundWords.length > 0) {
    return {
      allowed: false,
      blockedWords: foundWords,
      reason: `Advertentie bevat verboden woorden: ${foundWords.join(', ')}`
    };
  }
  
  return {
    allowed: true,
    blockedWords: []
  };
}

/**
 * Voegt nieuwe woorden toe aan de blacklist
 */
export function addToBlacklist(words: string[]): void {
  blacklistWords.push(...words.map(word => word.toLowerCase()));
}

/**
 * Verwijdert woorden van de blacklist
 */
export function removeFromBlacklist(words: string[]): void {
  words.forEach(word => {
    const index = blacklistWords.indexOf(word.toLowerCase());
    if (index > -1) {
      blacklistWords.splice(index, 1);
    }
  });
}

/**
 * Geeft de huidige blacklist terug
 */
export function getBlacklist(): string[] {
  return [...blacklistWords];
}