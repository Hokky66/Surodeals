import fs from 'fs/promises';
import path from 'path';

interface BlockedAdEntry {
  id: string;
  timestamp: string;
  ipAddress: string;
  title: string;
  description: string;
  blockedWords: string[];
  userAgent?: string;
}

const LOG_FILE_PATH = path.join(process.cwd(), 'logs', 'blocked_ads.json');
const MAX_LOG_ENTRIES = 1000;

/**
 * Controleert of logging van geblokkeerde advertenties is ingeschakeld
 */
function isLoggingEnabled(): boolean {
  return process.env.LOG_BLOCKED_ADS === 'true';
}

/**
 * Genereert een unieke ID voor log entries
 */
function generateLogId(): string {
  return `blocked_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Leest bestaande logs uit het JSON bestand
 */
async function readExistingLogs(): Promise<BlockedAdEntry[]> {
  try {
    const data = await fs.readFile(LOG_FILE_PATH, 'utf-8');
    return JSON.parse(data) || [];
  } catch (error) {
    // Bestand bestaat nog niet of is corrupt - return lege array
    return [];
  }
}

/**
 * Schrijft logs naar het JSON bestand
 */
async function writeLogsToFile(logs: BlockedAdEntry[]): Promise<void> {
  try {
    // Zorg dat de logs directory bestaat
    await fs.mkdir(path.dirname(LOG_FILE_PATH), { recursive: true });
    
    // Schrijf logs naar bestand met mooie formatting
    await fs.writeFile(LOG_FILE_PATH, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error('Fout bij schrijven blocked ads log:', error);
  }
}

/**
 * Beperkt het aantal log entries tot MAX_LOG_ENTRIES
 * Verwijdert oudste entries als de limiet wordt overschreden
 */
function limitLogEntries(logs: BlockedAdEntry[]): BlockedAdEntry[] {
  if (logs.length <= MAX_LOG_ENTRIES) {
    return logs;
  }
  
  // Sorteer op timestamp (nieuwste eerst) en neem de eerste MAX_LOG_ENTRIES
  return logs
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MAX_LOG_ENTRIES);
}

/**
 * Logt een geblokkeerde advertentie
 * @param ipAddress - IP-adres van de gebruiker
 * @param title - Titel van de advertentie
 * @param description - Beschrijving van de advertentie  
 * @param blockedWords - Array van geblokkeerde woorden die gevonden zijn
 * @param userAgent - User-Agent string (optioneel)
 */
export async function logBlockedAd(
  ipAddress: string,
  title: string,
  description: string,
  blockedWords: string[],
  userAgent?: string
): Promise<void> {
  // Controleer of logging is ingeschakeld
  if (!isLoggingEnabled()) {
    return;
  }

  try {
    // Maak nieuwe log entry
    const logEntry: BlockedAdEntry = {
      id: generateLogId(),
      timestamp: new Date().toISOString(),
      ipAddress,
      title: title.substring(0, 200), // Limiteer title lengte
      description: description.substring(0, 500), // Limiteer description lengte
      blockedWords,
      userAgent: userAgent?.substring(0, 200) // Limiteer user-agent lengte
    };

    // Lees bestaande logs
    const existingLogs = await readExistingLogs();
    
    // Voeg nieuwe entry toe
    const updatedLogs = [logEntry, ...existingLogs];
    
    // Beperk aantal entries
    const limitedLogs = limitLogEntries(updatedLogs);
    
    // Schrijf terug naar bestand
    await writeLogsToFile(limitedLogs);
    
    // Console logging voor debugging
    console.log(`🚫 Geblokkeerde advertentie gelogd: ${blockedWords.join(', ')} - IP: ${ipAddress}`);
    
  } catch (error) {
    console.error('Fout bij loggen geblokkeerde advertentie:', error);
  }
}

/**
 * Haalt alle geblokkeerde advertentie logs op
 * @param limit - Maximum aantal entries om op te halen (default: 100)
 * @returns Array van BlockedAdEntry objecten
 */
export async function getBlockedAdLogs(limit: number = 100): Promise<BlockedAdEntry[]> {
  try {
    const logs = await readExistingLogs();
    return logs
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  } catch (error) {
    console.error('Fout bij ophalen blocked ads logs:', error);
    return [];
  }
}

/**
 * Telt het aantal geblokkeerde advertenties in de laatste 24 uur
 * @returns Aantal geblokkeerde advertenties
 */
export async function getBlockedAdsCount24h(): Promise<number> {
  try {
    const logs = await readExistingLogs();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    return logs.filter(log => new Date(log.timestamp) > yesterday).length;
  } catch (error) {
    console.error('Fout bij tellen blocked ads:', error);
    return 0;
  }
}

/**
 * Wist alle logs (admin functie)
 */
export async function clearBlockedAdLogs(): Promise<void> {
  try {
    await writeLogsToFile([]);
    console.log('Blocked ads logs gewist');
  } catch (error) {
    console.error('Fout bij wissen blocked ads logs:', error);
  }
}

export type { BlockedAdEntry };