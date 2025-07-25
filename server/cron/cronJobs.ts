import { schedule } from 'node-cron';
import { db } from '../db';
import { sendEmailVerification, sendNewAdNotification } from '../email';
import { ads, users, subscriptions } from '../../shared/schema';
import { eq, lt, lte, gte, and, ne, sql } from 'drizzle-orm';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

// 1. BACKUP LOGICA
async function backupDatabase() {
  try {
    const date = new Date().toISOString().split('T')[0];
    const backupName = `backup-${date}.sql`;
    
    // Maak backups directory aan als deze niet bestaat
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const backupPath = path.join(backupDir, backupName);
    
    console.log(`🔄 Starting database backup: ${backupName}`);
    
    // Voor PostgreSQL databases - maak echte backup
    if (db) {
      const [adCount] = await db.select({ count: sql`count(*)` }).from(ads);
      const [userCount] = await db.select({ count: sql`count(*)` }).from(users);
      
      console.log(`📊 Backup stats: ${adCount.count} ads, ${userCount.count} users`);
      
      // Haal database URL op (lokaal of Supabase)
      const localDbUrl = process.env.DATABASE_URL;
      const supabaseDbUrl = process.env.SUPABASE_DATABASE_URL;
      const dbUrl = localDbUrl || supabaseDbUrl;
      
      if (dbUrl) {
        try {
          // Gebruik pg_dump voor PostgreSQL backup
          const dbType = supabaseDbUrl && !localDbUrl ? 'Supabase' : 'Lokaal';
          console.log(`📊 Creating ${dbType} database backup...`);
          
          const command = `pg_dump "${dbUrl}" > "${backupPath}"`;
          await execAsync(command);
          
          console.log(`✅ ${dbType} database backup completed: ${backupPath}`);
          console.log(`📁 Backup opgeslagen in: ${backupPath}`);
        } catch (execError) {
          console.log('⚠️  pg_dump niet beschikbaar, maak JSON backup...');
          
          // Fallback: maak JSON backup van belangrijke data
          const allAds = await db.select().from(ads);
          const allUsers = await db.select().from(users);
          const allSubscriptions = await db.select().from(subscriptions);
          
          const backupData = {
            timestamp: new Date().toISOString(),
            databaseType: supabaseDbUrl && !localDbUrl ? 'Supabase' : 'Lokaal',
            ads: allAds,
            users: allUsers,
            subscriptions: allSubscriptions,
            metadata: {
              totalAds: adCount.count,
              totalUsers: userCount.count,
              backupType: 'JSON',
              supabaseConfigured: !!supabaseDbUrl,
              localConfigured: !!localDbUrl
            }
          };
          
          const jsonBackupPath = backupPath.replace('.sql', '.json');
          fs.writeFileSync(jsonBackupPath, JSON.stringify(backupData, null, 2));
          
          console.log(`✅ JSON backup completed: ${jsonBackupPath}`);
          console.log(`📁 Backup opgeslagen in: ${jsonBackupPath}`);
        }
      } else {
        console.log('⚠️  Geen database URL beschikbaar, maak lokale JSON backup...');
        
        const allAds = await db.select().from(ads);
        const allUsers = await db.select().from(users);
        const allSubscriptions = await db.select().from(subscriptions);
        
        const backupData = {
          timestamp: new Date().toISOString(),
          databaseType: 'Geen connectie',
          ads: allAds,
          users: allUsers,
          subscriptions: allSubscriptions,
          metadata: {
            totalAds: adCount.count,
            totalUsers: userCount.count,
            backupType: 'JSON',
            supabaseConfigured: false,
            localConfigured: false
          }
        };
        
        const jsonBackupPath = backupPath.replace('.sql', '.json');
        fs.writeFileSync(jsonBackupPath, JSON.stringify(backupData, null, 2));
        
        console.log(`✅ JSON backup completed: ${jsonBackupPath}`);
        console.log(`📁 Backup opgeslagen in: ${jsonBackupPath}`);
      }
      
      // Houd alleen de laatste 7 backups
      cleanupOldBackups(backupDir);
    }
    
    return backupName;
  } catch (error) {
    console.error('❌ Backup failed:', error);
  }
}

// Helper functie om oude backups op te ruimen
function cleanupOldBackups(backupDir: string) {
  try {
    const files = fs.readdirSync(backupDir)
      .filter(file => file.startsWith('backup-') && (file.endsWith('.sql') || file.endsWith('.json')))
      .map(file => ({
        name: file,
        path: path.join(backupDir, file),
        mtime: fs.statSync(path.join(backupDir, file)).mtime
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    
    // Verwijder oude backups (houd alleen de laatste 7)
    if (files.length > 7) {
      const filesToDelete = files.slice(7);
      filesToDelete.forEach(file => {
        fs.unlinkSync(file.path);
        console.log(`🗑️  Oude backup verwijderd: ${file.name}`);
      });
    }
  } catch (error) {
    console.error('❌ Error cleaning up old backups:', error);
  }
}

// 2. VERLOPEN ADVERTENTIES
async function checkExpiredAds() {
  if (!db) {
    console.error('❌ Database not available for expired ads check');
    return;
  }

  try {
    // Zoek advertenties die ouder zijn dan 60 dagen
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    
    const expiredAds = await db
      .select()
      .from(ads)
      .where(
        and(
          lt(ads.createdAt, sixtyDaysAgo),
          ne(ads.status, 'expired')
        )
      );

    if (expiredAds.length > 0) {
      // Update status naar 'expired'
      await db
        .update(ads)
        .set({ status: 'expired' })
        .where(
          and(
            lt(ads.createdAt, sixtyDaysAgo),
            ne(ads.status, 'expired')
          )
        );
      
      console.log(`⏰ ${expiredAds.length} advertenties verlopen en gemarkeerd`);
    } else {
      console.log('✅ Geen verlopen advertenties gevonden');
    }
  } catch (error) {
    console.error('❌ Error checking expired ads:', error);
  }
}

// 3. ABONNEMENTSHERINNERINGEN
async function sendSubscriptionReminders() {
  if (!db) {
    console.error('❌ Database not available for subscription reminders');
    return;
  }

  try {
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const now = new Date();
    
    // Zoek subscriptions die over 3 dagen aflopen
    const expiringSubscriptions = await db
      .select({
        userId: subscriptions.userId,
        email: users.email,
        name: users.name,
        endDate: subscriptions.endDate,
        packageName: subscriptions.packageName
      })
      .from(subscriptions)
      .innerJoin(users, eq(subscriptions.userId, users.id))
      .where(
        and(
          lte(subscriptions.endDate, threeDaysFromNow),
          gte(subscriptions.endDate, now),
          eq(subscriptions.status, 'active')
        )
      );

    for (const subscription of expiringSubscriptions) {
      const daysLeft = Math.ceil((subscription.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      const emailSent = await sendNewAdNotification({
        to: subscription.email,
        adTitle: `Abonnement herinnering - ${subscription.packageName}`,
        adDescription: `Je ${subscription.packageName} abonnement loopt over ${daysLeft} dag(en) af. Verleng nu om je premium features te behouden.`,
        adLocation: 'SuroDeals',
        adPrice: 'Variabel',
        posterEmail: 'info@surodeals.com',
        adminUrl: 'https://surodeals.com/business',
        adId: 0
      });

      if (emailSent) {
        console.log(`📧 Herinnering verstuurd naar ${subscription.email}`);
      }
    }
    
    console.log(`✅ ${expiringSubscriptions.length} abonnements herinneringen verwerkt`);
  } catch (error) {
    console.error('❌ Error sending subscription reminders:', error);
  }
}

// 4. OUDE ANALYTICS DATA CLEANUP
async function cleanupOldAnalytics() {
  if (!db) {
    console.error('❌ Database not available for analytics cleanup');
    return;
  }

  try {
    // Verwijder analytics data ouder dan 90 dagen
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    
    // Hier zou je analytics tabel cleanup doen als je die hebt
    console.log('🧹 Analytics cleanup completed (placeholder)');
  } catch (error) {
    console.error('❌ Error cleaning analytics:', error);
  }
}

// 5. STATISTIEKEN LOGGING
async function logDailyStats() {
  if (!db) {
    console.error('❌ Database not available for daily stats');
    return;
  }

  try {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    
    // Tel nieuwe advertenties van gisteren
    const newAdsYesterday = await db
      .select()
      .from(ads)
      .where(
        and(
          gte(ads.createdAt, yesterday),
          lt(ads.createdAt, today)
        )
      );

    // Tel totaal actieve advertenties
    const totalActiveAds = await db
      .select()
      .from(ads)
      .where(eq(ads.status, 'approved'));

    console.log(`📈 Dagelijkse stats: ${newAdsYesterday.length} nieuwe ads gisteren, ${totalActiveAds.length} totaal actief`);
  } catch (error) {
    console.error('❌ Error logging daily stats:', error);
  }
}

// CRON SCHEDULER
export function startCronJobs() {
  console.log('🚀 Initializing cron jobs...');

  // Elke dag om 3:00 (backup)
  schedule('0 3 * * *', async () => {
    console.log('🔄 Running daily backup...');
    await backupDatabase();
  });

  // Elke dag om 4:00 (verlopen advertenties)
  schedule('0 4 * * *', async () => {
    console.log('⏰ Checking expired ads...');
    await checkExpiredAds();
  });

  // Elke dag om 9:00 (abonnementen herinneringen)
  schedule('0 9 * * *', async () => {
    console.log('📧 Sending subscription reminders...');
    await sendSubscriptionReminders();
  });

  // Elke zondag om 2:00 (analytics cleanup)
  schedule('0 2 * * 0', async () => {
    console.log('🧹 Cleaning old analytics data...');
    await cleanupOldAnalytics();
  });

  // Elke dag om 23:55 (dagelijkse statistieken)
  schedule('55 23 * * *', async () => {
    console.log('📈 Logging daily statistics...');
    await logDailyStats();
  });

  console.log('✅ Cron jobs geactiveerd!');
  console.log('📋 Scheduled tasks:');
  console.log('  - 03:00 daily: Database backup');
  console.log('  - 04:00 daily: Check expired ads');
  console.log('  - 09:00 daily: Subscription reminders');
  console.log('  - 02:00 Sunday: Analytics cleanup');
  console.log('  - 23:55 daily: Daily statistics');
  
  // Run initial stats to test
  setTimeout(async () => {
    console.log('🔄 Running initial daily stats...');
    await logDailyStats();
  }, 5000);
}

// Export functions for manual testing
export {
  backupDatabase,
  checkExpiredAds,
  sendSubscriptionReminders,
  cleanupOldAnalytics,
  logDailyStats
};