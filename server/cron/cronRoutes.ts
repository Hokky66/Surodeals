import { Router } from 'express';
import { 
  backupDatabase, 
  checkExpiredAds, 
  sendSubscriptionReminders, 
  cleanupOldAnalytics, 
  logDailyStats 
} from './cronJobs';
import path from 'path';
import fs from 'fs';

const router = Router();

// Middleware voor admin authenticatie
const requireAdmin = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== 'admin-token-2024') {
    return res.status(401).json({ error: 'Admin access required' });
  }
  next();
};

// Manual cron job endpoints voor testing
router.post('/backup', requireAdmin, async (req, res) => {
  try {
    const result = await backupDatabase();
    res.json({ success: true, backup: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/check-expired', requireAdmin, async (req, res) => {
  try {
    await checkExpiredAds();
    res.json({ success: true, message: 'Expired ads check completed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/subscription-reminders', requireAdmin, async (req, res) => {
  try {
    await sendSubscriptionReminders();
    res.json({ success: true, message: 'Subscription reminders sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/cleanup-analytics', requireAdmin, async (req, res) => {
  try {
    await cleanupOldAnalytics();
    res.json({ success: true, message: 'Analytics cleanup completed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/daily-stats', requireAdmin, async (req, res) => {
  try {
    await logDailyStats();
    res.json({ success: true, message: 'Daily stats logged' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Status endpoint
router.get('/status', requireAdmin, (req, res) => {
  const backupDir = path.join(process.cwd(), 'backups');
  let backupInfo = 'Geen backups gevonden';
  
  try {
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir)
        .filter(file => file.startsWith('backup-'))
        .sort()
        .reverse();
      
      if (files.length > 0) {
        backupInfo = `${files.length} backup(s) in /backups/`;
      }
    }
  } catch (error) {
    backupInfo = 'Backup directory niet toegankelijk';
  }
  
  res.json({
    status: 'active',
    backupLocation: backupDir,
    backupInfo: backupInfo,
    jobs: [
      { name: 'Database Backup', schedule: '0 3 * * *', description: 'Daily at 3:00 AM' },
      { name: 'Check Expired Ads', schedule: '0 4 * * *', description: 'Daily at 4:00 AM' },
      { name: 'Subscription Reminders', schedule: '0 9 * * *', description: 'Daily at 9:00 AM' },
      { name: 'Analytics Cleanup', schedule: '0 2 * * 0', description: 'Sunday at 2:00 AM' },
      { name: 'Daily Statistics', schedule: '55 23 * * *', description: 'Daily at 11:55 PM' }
    ]
  });
});

export default router;