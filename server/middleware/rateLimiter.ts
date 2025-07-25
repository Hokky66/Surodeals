import rateLimit from 'express-rate-limit';

/**
 * Rate limiting middleware voor advertentie-aanmaak
 * Voorkomt spam door maximum 5 advertenties per 10 minuten per IP toe te staan
 */
export const createAdLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minuten in milliseconden 
  max: 5, // Maximum 5 advertenties per tijdvenster per IP
  
  // Standaard configuratie voor productie
  standardHeaders: true,
  legacyHeaders: false,
  
  // Handler voor rate limit overschrijding
  handler: (req, res) => {
    console.log(`🚫 Rate limit overschreden voor IP: ${req.ip}`);
    res.status(429).json({
      error: "Rate limit overschreden",
      message: "Je hebt te vaak geprobeerd te adverteren. Probeer het later opnieuw.",
      retryAfter: "10 minuten"
    });
  }
});

/**
 * Rate limiting voor contact berichten
 * Voorkomt spam bij contact formulieren
 */
export const contactLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minuten
  max: 3, // Maximum 3 berichten per 5 minuten per IP
  
  message: {
    error: "Te veel berichten verzonden",
    message: "Je hebt te veel berichten verzonden. Wacht even voordat je opnieuw probeert.",
    retryAfter: "5 minuten"
  },
  
  standardHeaders: true,
  legacyHeaders: false,
  
  handler: (req, res) => {
    res.status(429).json({
      error: "Te veel berichten verzonden", 
      message: "Je hebt te veel berichten verzonden. Wacht even voordat je opnieuw probeert.",
      retryAfter: "5 minuten",
      limit: 3,
      windowMs: 5 * 60 * 1000
    });
  }
});

/**
 * Algemene API rate limiter voor alle endpoints
 * Basisbeveiliging tegen DDoS en API misbruik
 */
export const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuut
  max: 100, // Maximum 100 requests per minuut per IP
  
  message: {
    error: "Te veel verzoeken",
    message: "Te veel verzoeken vanuit dit IP-adres. Probeer het later opnieuw.",
    retryAfter: "1 minuut"
  },
  
  standardHeaders: true,
  legacyHeaders: false
});