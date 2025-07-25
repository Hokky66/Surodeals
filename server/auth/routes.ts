import { Router } from 'express';
import { z } from 'zod';

// Extend Express Session interface
declare module 'express-session' {
  interface SessionData {
    userId: string;
    isEmailVerified: boolean;
    twoFactorVerified: boolean;
    loginAttempts: number;
    lastFailedLogin: Date;
    tempTwoFactorCode: string;
    tempTwoFactorExpires: Date;
  }
}
import { storage } from '../storage';
import { loginLimiter } from './security';
import { hashPassword, comparePassword, validatePassword, generateSecureToken, generateVerificationCode } from './password';
import { validateRegistrationData, validateLoginData, sanitizeInput } from './validation';
import { sendVerificationEmail, send2FACode, sendTestEmail, sendPasswordResetEmail } from './email';
import { sendSimpleVerificationEmail } from './email-simple';
import { isAccountLocked, updateLoginAttempts, resetLoginAttempts } from './security';

const router = Router();

// Test route om te controleren of auth routes werken
router.get('/test', (req, res) => {
  res.json({ message: 'Auth routes are working!', timestamp: new Date().toISOString() });
});

// Registratie schema
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  phone: z.string().optional(),
  location: z.string().optional(),
});

// Login schema
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Login endpoint for all verified users
router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    
    // Look up user in database
    const user = await storage.getUserByEmail(email.toLowerCase());
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Onjuist e-mailadres of wachtwoord'
      });
    }
    
    // Check if account is verified
    if (!user.isEmailVerified) {
      return res.status(401).json({
        success: false,
        message: 'Account is nog niet geverifieerd. Controleer je e-mail voor de verificatielink.'
      });
    }
    
    // Verify password
    const isPasswordValid = await comparePassword(password, user.password || '');
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Onjuist e-mailadres of wachtwoord'
      });
    }
    
    // Create session token
    const sessionToken = Buffer.from(JSON.stringify({
      sub: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      exp: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
    })).toString('base64');
    
    // Set session
    (req.session as any).demoUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName
    };
    
    // Update last login
    try {
      await storage.updateUser(user.id, { lastLoginAt: new Date() });
    } catch (updateError) {
      console.warn('Could not update last login time:', updateError);
    }
    
    console.log(`User ${user.email} logged in successfully`);
    
    return res.json({ 
      success: true, 
      message: 'Login successful',
      demoToken: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Er is een probleem opgetreden bij het inloggen'
    });
  }
});

// Original login schema with twoFactorCode
const originalLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  twoFactorCode: z.string().optional(),
});

/**
 * POST /api/auth/register
 * Registreer nieuwe gebruiker
 */
router.post('/register', async (req, res) => {
  try {
    // Valideer input data
    const validationResult = registerSchema.safeParse(req.body);
    if (!validationResult.success) {
      console.log('Validation failed:', validationResult.error.issues);
      return res.status(400).json({
        error: 'Ongeldige invoer',
        details: validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
      });
    }

    const { email, password, firstName, lastName, phone, location } = validationResult.data;

    // Sanitize input
    const cleanData = {
      email: sanitizeInput(email.toLowerCase()),
      password,
      firstName: sanitizeInput(firstName),
      lastName: sanitizeInput(lastName),
      phone: phone ? sanitizeInput(phone) : undefined,
      location: location ? sanitizeInput(location) : undefined,
    };

    // Extra validatie
    const dataValidation = validateRegistrationData(cleanData);
    if (!dataValidation.isValid) {
      return res.status(400).json({
        error: 'Validatie gefaald',
        details: dataValidation.errors
      });
    }

    // Valideer wachtwoordsterkte
    const passwordValidation = validatePassword(cleanData.password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: 'Wachtwoord voldoet niet aan eisen',
        details: passwordValidation.errors
      });
    }

    // Controleer of gebruiker al bestaat
    const existingUser = await storage.getUserByEmail(cleanData.email);
    if (existingUser) {
      if (existingUser.isEmailVerified) {
        return res.status(409).json({
          error: 'Er bestaat al een geverifieerd account met dit e-mailadres. Probeer in te loggen.'
        });
      } else {
        // Account bestaat maar is niet geverifieerd - verstuur nieuwe verificatie e-mail
        const verificationToken = generateSecureToken();
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        
        await storage.updateUserAuth(existingUser.id, {
          emailVerificationToken: verificationToken,
          emailVerificationExpires: verificationExpires,
        });
        
        try {
          const baseUrl = `${req.protocol}://${req.get('host')}`;
          await sendVerificationEmail(cleanData.email, verificationToken, baseUrl);
          console.log(`Nieuwe verificatie e-mail verzonden naar bestaand ongeverifieerd account: ${cleanData.email}`);
        } catch (emailError) {
          console.error('Kon nieuwe verificatie e-mail niet verzenden:', emailError);
        }
        
        return res.status(200).json({
          message: 'Je account bestaat al maar is nog niet geverifieerd. We hebben een nieuwe verificatie e-mail verstuurd.',
          needsVerification: true
        });
      }
    }

    // Hash wachtwoord
    const hashedPassword = await hashPassword(cleanData.password);

    // Genereer verificatie token
    const verificationToken = generateSecureToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 uur

    // Maak gebruiker aan en markeer als geverifieerd voor auto-login
    const user = await storage.createLocalUser({
      email: cleanData.email,
      password: hashedPassword,
      firstName: cleanData.firstName,
      lastName: cleanData.lastName,
      phone: cleanData.phone,
      location: cleanData.location,
      isEmailVerified: true, // Auto-verify for immediate login
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires,
    });

    // Automatisch inloggen na registratie
    const sessionToken = Buffer.from(JSON.stringify({
      sub: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      exp: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
    })).toString('base64');
    
    // Set session
    (req.session as any).demoUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName
    };

    // Stuur verificatie e-mail (optioneel, maar niet vereist voor login)
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      console.log(`Sending welcome email to: ${cleanData.email}`);
      
      await sendVerificationEmail(cleanData.email, verificationToken, baseUrl);
      console.log(`Welcome email sent to: ${cleanData.email}`);
    } catch (emailError) {
      console.error('Could not send welcome email:', emailError);
      // User is still created and logged in
    }

    console.log(`User ${user.email} registered and auto-logged in`);

    res.status(201).json({
      message: 'Account succesvol aangemaakt en ingelogd!',
      autoLogin: true,
      sessionToken: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isEmailVerified: user.isEmailVerified
      }
    });

  } catch (error) {
    console.error('Registratie fout:', error);
    const errorMessage = error instanceof Error ? error.message : 'Onbekende fout';
    res.status(500).json({
      error: 'Er is een fout opgetreden bij het aanmaken van je account',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    });
  }
});

// Wachtwoord vergeten endpoint
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'E-mailadres is verplicht'
      });
    }
    
    // Zoek gebruiker op e-mailadres
    const user = await storage.getUserByEmail(email.toLowerCase());
    
    // Altijd succesvol antwoorden, ongeacht of gebruiker bestaat (security)
    if (!user) {
      console.log(`Password reset requested for non-existent email: ${email}`);
      return res.json({
        success: true,
        message: 'Als dit e-mailadres bestaat, ontvang je een reset link.'
      });
    }
    
    // Genereer reset token (geldig voor 1 uur)
    const resetToken = generateSecureToken();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 uur
    
    // Sla reset token op in database
    await storage.updateUserAuth(user.id, {
      emailVerificationToken: resetToken, // Hergebruik dit veld voor password reset
      emailVerificationExpires: resetExpires
    });
    
    // Verstuur password reset e-mail
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      await sendPasswordResetEmail(user.email, resetToken, baseUrl, user.firstName);
      console.log(`Password reset email sent to: ${user.email}`);
    } catch (emailError) {
      console.error('Could not send password reset email:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Er ging iets mis bij het verzenden van de reset e-mail'
      });
    }
    
    res.json({
      success: true,
      message: 'Als dit e-mailadres bestaat, ontvang je een reset link.'
    });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Er is een fout opgetreden'
    });
  }
});

// Wachtwoord reset endpoint
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token en nieuw wachtwoord zijn verplicht'
      });
    }
    
    // Zoek gebruiker met reset token
    const users = await storage.getAllUsers();
    const user = users.find(u => 
      u.emailVerificationToken === token && 
      u.emailVerificationExpires && 
      u.emailVerificationExpires > new Date()
    );
    
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Ongeldig of verlopen reset token'
      });
    }
    
    // Valideer nieuw wachtwoord
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Wachtwoord voldoet niet aan de eisen: ' + passwordValidation.errors.join(', ')
      });
    }
    
    // Hash nieuw wachtwoord
    const hashedPassword = await hashPassword(newPassword);
    
    // Update wachtwoord en verwijder reset token
    await storage.updateUserAuth(user.id, {
      password: hashedPassword,
      emailVerificationToken: null,
      emailVerificationExpires: null
    });
    
    console.log(`Password reset completed for user: ${user.email}`);
    
    res.json({
      success: true,
      message: 'Wachtwoord succesvol gewijzigd. Je kunt nu inloggen.'
    });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Er is een fout opgetreden bij het wijzigen van het wachtwoord'
    });
  }
});

// Export the router
export default router;