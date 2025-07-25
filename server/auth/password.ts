import bcrypt from 'bcrypt';
import crypto from 'crypto';

const SALT_ROUNDS = 12; // Hoger dan minimaal 10 voor extra beveiliging

/**
 * Hash een wachtwoord met bcrypt
 * @param password - Het wachtwoord om te hashen
 * @returns Gehasht wachtwoord
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    return await bcrypt.hash(password, SALT_ROUNDS);
  } catch (error) {
    throw new Error('Fout bij het hashen van wachtwoord');
  }
}

/**
 * Vergelijk een wachtwoord met een hash
 * @param password - Het plain text wachtwoord
 * @param hash - De opgeslagen hash
 * @returns True als het wachtwoord correct is
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    throw new Error('Fout bij het vergelijken van wachtwoord');
  }
}

/**
 * Valideer wachtwoordsterkte
 * @param password - Het wachtwoord om te valideren
 * @returns Object met validatie resultaat
 */
export function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Wachtwoord moet minimaal 8 karakters lang zijn');
  }

  if (!/(?=.*[a-z])/.test(password)) {
    errors.push('Wachtwoord moet minimaal één kleine letter bevatten');
  }

  if (!/(?=.*[A-Z])/.test(password)) {
    errors.push('Wachtwoord moet minimaal één hoofdletter bevatten');
  }

  if (!/(?=.*\d)/.test(password)) {
    errors.push('Wachtwoord moet minimaal één cijfer bevatten');
  }

  if (!/(?=.*[@#$%^&*!?])/.test(password)) {
    errors.push('Wachtwoord moet minimaal één speciaal teken bevatten (@#$%^&*!?)');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Genereer een veilige random token
 * @param length - Lengte van de token (default: 32)
 * @returns Hex string token
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Genereer een 6-cijferige verificatiecode
 * @returns 6-cijferige code
 */
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}