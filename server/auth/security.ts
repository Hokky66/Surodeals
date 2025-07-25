import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import csrf from 'csurf';
import type { Express } from 'express';

// Rate limiting voor login pogingen - strenger voor betere beveiliging
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuten
  max: 5, // maximaal 5 pogingen per IP
  message: {
    error: 'Te veel loginpogingen. Voor je veiligheid is je IP-adres tijdelijk geblokkeerd. Probeer het over 15 minuten opnieuw.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // Blokkeer ook als er te veel mislukte pogingen zijn
  skip: (req) => {
    // Log verdachte activiteit
    if (req.ip) {
      console.log(`Verdachte login activiteit van IP: ${req.ip} op ${new Date().toISOString()}`);
    }
    return false;
  }
});

// Rate limiting voor registratie
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 uur
  max: 3, // maximaal 3 registraties per IP per uur
  message: {
    error: 'Te veel registratiepogingen. Probeer het over een uur opnieuw.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting voor advertentie aanmaken
export const createAdLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 uur
  max: 10, // maximaal 10 advertenties per IP per uur
  message: {
    error: 'Te veel advertenties geplaatst. Probeer het over een uur opnieuw.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting voor contact berichten
export const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuten
  max: 5, // maximaal 5 berichten per 15 minuten
  message: {
    error: 'Te veel berichten verzonden. Probeer het over 15 minuten opnieuw.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Algemene rate limiting
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuten
  max: 100, // maximaal 100 requests per IP
  message: {
    error: 'Te veel requests. Probeer het later opnieuw.'
  }
});

// CSRF bescherming
export const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
});

// Helmet configuratie voor beveiligingsheaders
export function setupSecurity(app: Express) {
  // Helmet voor beveiligingsheaders - aangepast voor ontwikkeling
  if (process.env.NODE_ENV === 'production') {
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"]
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // CSRF protectie alleen in productie (om ontwikkeling niet te verstoren)
    app.use('/api/', csrfProtection);
  } else {
    // Ontwikkeling: minder restrictieve CSP
    app.use(helmet({
      contentSecurityPolicy: false, // Disable CSP in development
      crossOriginEmbedderPolicy: false,
    }));
    
    console.log('⚠️  CSRF protectie is uitgeschakeld in ontwikkelingsmodus');
  }

  // Algemene rate limiting
  app.use('/api/', generalLimiter);
  
  console.log('🔒 Beveiligingsmaatregelen zijn geactiveerd');
}

// Functie om te controleren of een gebruiker vergrendeld is
export function isAccountLocked(user: any): boolean {
  return !!(user.lockUntil && user.lockUntil > new Date());
}

// Functie om loginpogingen bij te houden
export function updateLoginAttempts(user: any): Partial<any> {
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000; // 2 uur

  // Als account niet vergrendeld is
  if (!user.lockUntil || user.lockUntil < new Date()) {
    return {
      loginAttempts: (user.loginAttempts || 0) + 1,
      lockUntil: (user.loginAttempts || 0) + 1 >= maxAttempts 
        ? new Date(Date.now() + lockTime) 
        : null
    };
  }
  
  return {};
}

// Reset loginpogingen na succesvolle login
export function resetLoginAttempts() {
  return {
    loginAttempts: 0,
    lockUntil: null
  };
}