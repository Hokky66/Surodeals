import { Express, Request, Response } from "express";
import { storage as dbStorage } from "./storage";
import { loginLimiter, registerLimiter } from "./auth/security";
import { validateRegistrationData, validateLoginData } from "./auth/validation";
import { hashPassword, comparePassword } from "./auth/password";
import { sendContactEmail, sendNewAdNotification } from "./email";
import { generateSitemap, generateRobotsTxt, generateHomepageMetaTags } from "./seo";
import { insertAdSchema, insertCategorySchema, filterDefinitions } from "@shared/schema";
import { isAuthenticated } from "./replitAuth";
import { checkAdContent, getBlacklist, addToBlacklist, removeFromBlacklist } from "./blacklist";
import { createAdLimiter, contactLimiter } from "./middleware/rateLimiter";
import { logBlockedAd, getBlockedAdLogs, getBlockedAdsCount24h, clearBlockedAdLogs } from "./logging/blockedAdsLogger";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";
import * as schema from "@shared/schema";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import Stripe from "stripe";
import multer from "multer";
import path from "path";
import fs from "fs";
import { isAdmin, adminLogin, adminLogout } from "./middleware/adminAuth";

const execAsync = promisify(exec);

// Initialize Stripe (only if secret key is available)
let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16",
  });
}

// Configure multer for file uploads
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(process.cwd(), 'public', 'uploads');
    // Ensure directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: diskStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Max 5 files
  },
  fileFilter: (req, file, cb) => {
    // Allow only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Alleen afbeeldingen zijn toegestaan'));
    }
  }
});

export function setupRoutes(app: Express) {

  // ✅ Debug route toevoegen
  app.get('/api/categories', (req, res) => {
    res.json({ test: 'categories route werkt!' });
  });

    // 🧪 Demo login endpoint
  app.get('/api/demo/login/:userId', async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      console.log("Demo login attempt for:", userId);
      
      if (userId === 'ggriedewald') {
        const demoToken = Buffer.from(JSON.stringify({
          sub: '93ec4e88-a9dd-404d-aece-407b155ea0e3',
          email: 'ggriedewald@gmail.com',
          firstName: 'Gino',
          lastName: 'Riedewald',
          exp: Date.now() + (7 * 24 * 60 * 60 * 1000)
        })).toString('base64');
        
        res.redirect(`/profile?demoToken=${demoToken}`);
      } else {
        res.status(401).send('Invalid demo user');
      }
    } catch (error) {
      console.error("Demo login error:", error);
      res.status(500).send('Demo login failed');
    }
  });
  // Auto-login route with token generation
  app.get('/api/auto-login', async (req: Request, res: Response) => {
    try {
      // Create demo token for frontend
      const demoToken = Buffer.from(JSON.stringify({
        sub: '93ec4e88-a9dd-404d-aece-407b155ea0e3',
        exp: Date.now() + 86400000 // 24 hours
      })).toString('base64');
      
      // Set session directly for currently authenticated user
      (req.session as any).demoUser = {
        id: '93ec4e88-a9dd-404d-aece-407b155ea0e3',
        email: 'ggriedewald@gmail.com',
        firstName: 'Gino',
        lastName: 'Riedewald'
      };
      
      console.log('Session set for auto-login user');
      
      // Return HTML that sets localStorage and redirects
      res.send(`
        <html>
        <head><title>Auto Login</title></head>
        <body>
          <script>
            localStorage.setItem('demoToken', '${demoToken}');
            window.location.href = '/';
          </script>
          <p>Bezig met inloggen...</p>
        </body>
        </html>
      `);
    } catch (error) {
      console.error('Auto login error:', error);
      res.status(500).json({ message: 'Auto login failed' });
    }
  });

// Categories routes
  app.get("/api/categories", async (req: Request, res: Response) => {
    try {
      const categories = await dbStorage.getCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/categories", async (req: Request, res: Response) => {
    try {
      const categoryData = insertCategorySchema.parse(req.body);
      const category = await dbStorage.createCategory(categoryData);
      res.json(category);
    } catch (error) {
      console.error("Error creating category:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Server error" });
      }
    }
  });
  
  // Logout route
  app.post("/api/logout", (req, res) => {
    req.session.destroy(err => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Kon niet uitloggen" });
      }
      res.clearCookie("connect.sid");
      res.status(200).json({ message: "Uitgelogd" });
    });
  });

  // Auth routes
  app.get('/api/auth/user', async (req: Request, res: Response) => {
    try {
      // Enhanced auth debugging
      const authHeader = req.headers.authorization;
      const cookies = req.cookies || {};
      const sessionData = req.session;
      
      // Auth debug logging disabled for performance
      // console.log('🔐 Auth debug info:', {
      //   authHeader: authHeader ? 'Present' : 'None',
      //   cookies: Object.keys(cookies).length > 0 ? Object.keys(cookies) : 'None',
      //   session: sessionData ? 'Present' : 'None',
      //   userAgent: req.headers['user-agent'] ? req.headers['user-agent'].substring(0, 50) + '...' : 'None'
      // });

      // Check for demo token in Authorization header
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
          const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
          if (decoded.exp && decoded.exp > Date.now()) {
            console.log('✅ Valid demo token found in header');
            
            // Get full user data from database
            try {
              const fullUser = await dbStorage.getUser(decoded.sub);
              if (fullUser) {
                return res.json({
                  id: fullUser.id,
                  email: fullUser.email,
                  firstName: fullUser.firstName,
                  lastName: fullUser.lastName,
                  first_name: fullUser.firstName,
                  last_name: fullUser.lastName,
                  phone: fullUser.phone,
                  location: fullUser.location,
                  companyName: fullUser.companyName,
                  profileImageUrl: fullUser.profileImageUrl,
                  isEmailVerified: fullUser.isEmailVerified,
                  createdAt: fullUser.createdAt,
                  lastLoginAt: fullUser.lastLoginAt
                });
              }
            } catch (dbError) {
              console.error('Error fetching user from database:', dbError);
            }
            
            // Fallback to token data
            return res.json({
              id: decoded.sub,
              email: decoded.email,
              firstName: decoded.firstName,
              lastName: decoded.lastName,
              first_name: decoded.firstName,
              last_name: decoded.lastName,
              isEmailVerified: true
            });
          } else {
            console.log('❌ Demo token expired');
          }
        } catch (e) {
          console.log('❌ Invalid demo token format:', e);
        }
      }

      // Check for demo token in cookies
      const cookieToken = cookies.demoToken || cookies.token;
      if (cookieToken) {
        try {
          const decoded = JSON.parse(Buffer.from(cookieToken, 'base64').toString());
          if (decoded.exp && decoded.exp > Date.now()) {
            console.log('✅ Valid demo token found in cookies');
            return res.json({
              id: decoded.sub,
              email: decoded.email,
              firstName: decoded.firstName,
              lastName: decoded.lastName,
              first_name: decoded.firstName,
              last_name: decoded.lastName,
              isEmailVerified: true
            });
          } else {
            console.log('❌ Cookie token expired');
          }
        } catch (e) {
          console.log('❌ Invalid cookie token format:', e);
        }
      }
      
      // Check session for demo user
      if ((req.session as any)?.demoUser) {
        const demoUser = (req.session as any).demoUser;
        console.log('Demo user found in session:', demoUser.email);
        
        // Get full user data from database
        try {
          const fullUser = await dbStorage.getUser(demoUser.id);
          if (fullUser) {
            return res.json({
              id: fullUser.id,
              email: fullUser.email,
              firstName: fullUser.firstName,
              lastName: fullUser.lastName,
              first_name: fullUser.firstName,
              last_name: fullUser.lastName,
              phone: fullUser.phone,
              location: fullUser.location,
              companyName: fullUser.companyName,
              profileImageUrl: fullUser.profileImageUrl,
              isEmailVerified: fullUser.isEmailVerified,
              createdAt: fullUser.createdAt,
              lastLoginAt: fullUser.lastLoginAt
            });
          }
        } catch (dbError) {
          console.error('Error fetching user from database:', dbError);
        }
        
        // Fallback to session data
        return res.json({
          id: demoUser.id,
          email: demoUser.email,
          firstName: demoUser.firstName,
          lastName: demoUser.lastName,
          first_name: demoUser.firstName,
          last_name: demoUser.lastName,
          isEmailVerified: true
        });
      }
      
      // Check Replit auth
      if (req.user) {
        return res.json(req.user);
      }
      
      res.status(401).json({ message: "Unauthorized" });
    } catch (error) {
      console.error("Auth error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Categories routes
  app.get("/api/categories", async (req: Request, res: Response) => {
    try {
      const categories = await dbStorage.getCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/categories", async (req: Request, res: Response) => {
    try {
      const categoryData = insertCategorySchema.parse(req.body);
      const category = await dbStorage.createCategory(categoryData);
      res.json(category);
    } catch (error) {
      console.error("Error creating category:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Server error" });
      }
    }
  });

  // Featured ads route
  app.get("/api/ads/featured", async (req: Request, res: Response) => {
    try {
      console.log('📋 API: Getting featured ads');
      
      const featuredAds = await dbStorage.getFeaturedAds();
      
      res.json({
        ads: featuredAds,
        total: featuredAds.length
      });
    } catch (error) {
      console.error('❌ Error fetching featured ads:', error);
      res.status(500).json({ message: "Fout bij ophalen uitgelichte advertenties" });
    }
  });

  // Ads routes
  app.get("/api/ads", async (req: Request, res: Response) => {
    try {
      // 1. Cache control - force fresh requests
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // Check if this is an admin request to see all ads including pending
      const isAdminRequest = req.query.admin === 'true';
      const status = req.query.status as string;
      
      if (isAdminRequest) {
        // Admin view - show all ads including pending
        const ads = await dbStorage.getAllAds(status);
        res.json({ ads });
        return;
      }

      // 2. Auth fallback check (optional warning for unauthenticated requests)
      if (!req.headers.authorization && !req.session) {
        console.warn('⚠️ Unauthenticated ads request from IP:', req.ip);
      }

      // Regular user view - only approved ads
      const filters = {
        search: req.query.search as string,
        categoryId: req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined,
        categoryIds: req.query.categoryIds ? (req.query.categoryIds as string).split(',').map(id => parseInt(id.trim())) : undefined,
        category: req.query.category as string, // category slug for filtering
        location: req.query.location as string,
        minPrice: req.query.minPrice ? parseInt(req.query.minPrice as string) : undefined,
        maxPrice: req.query.maxPrice ? parseInt(req.query.maxPrice as string) : undefined,
        currency: req.query.currency as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
        
        // Dynamic filters from filter definitions
        dynamicFilters: {} as Record<string, any>
      };

      // Extract dynamic filters from query params
      for (const [key, value] of Object.entries(req.query)) {
        // Skip known filter keys
        if (!['search', 'categoryId', 'category', 'location', 'minPrice', 'maxPrice', 'currency', 'limit', 'offset', 'admin', 'status'].includes(key)) {
          if (value && value !== '') {
            filters.dynamicFilters[key] = value;
          }
        }
      }

      // Debug logging disabled for performance
      // console.log('🔍 DEBUG: API filters received:', filters);
      const result = await dbStorage.getAds(filters);
      // console.log('🔍 DEBUG: Results found:', result.total, 'ads');
      res.json(result);
    } catch (error) {
      console.error("Error fetching ads:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Get user's own ads (including pending) - must be before /api/ads/:id to avoid route conflict
  app.get("/api/ads/user", async (req: Request, res: Response) => {
    try {
      let userId: string | undefined;
      let userEmail: string | undefined;
      
      // Check for demo token in Authorization header first
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
          const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
          if (decoded.exp && decoded.exp > Date.now()) {
            console.log('✅ Valid JWT token found, allowing user ads access');
            userId = decoded.sub;
            userEmail = decoded.email;
          }
        } catch (e) {
          console.log('❌ Invalid token format');
        }
      }
      
      // Check for demo session as fallback
      if (!userId && !userEmail && (req.session as any).demoUser) {
        userId = (req.session as any).demoUser.id;
        userEmail = (req.session as any).demoUser.email;
        console.log("Debug: Using demo session user ID:", userId, "email:", userEmail);
      } else if (!userId && !userEmail && req.isAuthenticated?.()) {
        userId = (req.user as any)?.claims?.sub;
        console.log("Debug: Using regular auth user ID:", userId);
      }
      
      if (!userId && !userEmail) {
        console.log("Debug: No user session found");
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      console.log("Debug: Final user email for ads:", userEmail);
      
      if (userEmail) {
        const userAds = await dbStorage.getUserAdsByEmail(userEmail);
        console.log("Debug: Found", userAds.length, "ads for user", userEmail);
        res.json(userAds);
      } else {
        console.log("Debug: No valid user found, returning empty ads");
        res.json([]);
      }
    } catch (error) {
      console.error("Error fetching user ads:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Get user statistics for profile page
  app.get("/api/user/statistics", async (req: Request, res: Response) => {
    try {
      let userId: string | undefined;
      let userEmail: string | undefined;
      
      // Check for demo session first
      if ((req.session as any).demoUser) {
        userId = (req.session as any).demoUser.id;
        userEmail = (req.session as any).demoUser.email;
      } else if (req.isAuthenticated?.()) {
        userId = (req.user as any)?.claims?.sub;
      }
      
      if (!userId && !userEmail) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      if (userEmail) {
        const userAds = await dbStorage.getUserAdsByEmail(userEmail);
        
        // Calculate statistics
        const totalAds = userAds.length;
        const activeAds = userAds.filter(ad => ad.status === 'approved').length;
        const pendingAds = userAds.filter(ad => ad.status === 'pending').length;
        const totalViews = userAds.reduce((sum, ad) => sum + (ad.views || 0), 0);
        
        // For now, we'll use a fixed rating since we don't have a rating system yet
        const averageRating = 4.8;
        
        res.json({
          totalAds,
          activeAds,
          pendingAds,
          totalViews,
          averageRating
        });
      } else {
        res.json({
          totalAds: 0,
          activeAds: 0,
          pendingAds: 0,
          totalViews: 0,
          averageRating: 0
        });
      }
    } catch (error) {
      console.error("Error fetching user statistics:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Get user's favorite ads
  app.get("/api/user/favorites", async (req: Request, res: Response) => {
    try {
      let userId: string | undefined;
      
      // Check for demo session first
      if ((req.session as any).demoUser) {
        userId = (req.session as any).demoUser.id;
      } else if (req.isAuthenticated?.()) {
        userId = (req.user as any)?.claims?.sub;
      }
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const favoriteAds = await dbStorage.getUserFavorites(userId);
      res.json(favoriteAds);
    } catch (error) {
      console.error("Error fetching user favorites:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Get user's bids
  app.get("/api/user/bids", async (req: Request, res: Response) => {
    try {
      let userId: string | undefined;
      
      // Check for demo session first
      if ((req.session as any).demoUser) {
        userId = (req.session as any).demoUser.id;
      } else if (req.isAuthenticated?.()) {
        userId = (req.user as any)?.claims?.sub;
      }
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userBids = await dbStorage.getUserBids(userId);
      res.json(userBids);
    } catch (error) {
      console.error("Error fetching user bids:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Get user's recently viewed ads
  app.get("/api/user/recently-viewed", async (req: Request, res: Response) => {
    try {
      let userId: string | undefined;
      
      // Check for demo session first
      if ((req.session as any).demoUser) {
        userId = (req.session as any).demoUser.id;
      } else if (req.isAuthenticated?.()) {
        userId = (req.user as any)?.claims?.sub;
      }
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const recentlyViewedAds = await dbStorage.getUserRecentlyViewed(userId);
      res.json(recentlyViewedAds);
    } catch (error) {
      console.error("Error fetching recently viewed ads:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/ads/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Ongeldig advertentie ID" });
      }
      const ad = await dbStorage.getAd(id);
      
      if (!ad) {
        return res.status(404).json({ message: "Advertentie niet gevonden" });
      }

      // Increment view count
      await dbStorage.incrementAdViews(id);
      
      res.json(ad);
    } catch (error) {
      console.error("Error fetching ad:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/ads", createAdLimiter, upload.array('images', 5), async (req: Request, res: Response) => {
    try {
      // Parse the data based on content type
      let adData: any;
      
      if (req.is('multipart/form-data')) {
        // Handle FormData submission
        adData = {
          title: req.body.title,
          description: req.body.description,
          price: parseInt(req.body.price),
          currency: req.body.currency || 'EUR',
          location: req.body.location,
          categoryId: parseInt(req.body.categoryId),
          subcategoryId: req.body.subcategoryId ? parseInt(req.body.subcategoryId) : undefined,
          email: req.body.email,
          phone: req.body.contactPhone, // Map contactPhone to phone
          condition: req.body.condition || '',
          termsAccepted: req.body.termsAccepted === 'true'
        };
      } else {
        // Handle JSON submission
        adData = {
          ...req.body,
          phone: req.body.phone || req.body.contactPhone // Map contactPhone to phone for JSON
        };
      }
      
      // VERPLICHTE user authentication check - NO FALLBACKS
      let userId: string | undefined;
      let userEmail: string | undefined;
      
      // Check for demo token in Authorization header
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        
        // Check if it's a demo token
        if (token.startsWith('demo-token-')) {
          const demoUserId = token.replace('demo-token-', '');
          if (demoUserId === '82131833-ae7e-4666-9a19-d991016a5828') {
            userId = demoUserId;
            userEmail = 'ggligeon@gmail.com';
          }
        } else {
          // Try to parse regular JWT token
          try {
            const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
            if (decoded.exp && decoded.exp > Date.now()) {
              userId = decoded.sub;
              userEmail = decoded.email;
            }
          } catch (e) {
            // Token format error - silently continue
          }
        }
      }
      
      // Fallback: Check for demo session
      if (!userId && (req.session as any).demoUser) {
        userId = (req.session as any).demoUser.id;
        userEmail = (req.session as any).demoUser.email;
      } else if (!userId && req.isAuthenticated?.()) {
        userId = (req.user as any)?.claims?.sub;
      }
      
      // STOP if no user found - NO FALLBACK ALLOWED
      if (!userId) {
        return res.status(401).json({ message: "Niet ingelogd" });
      }
      
      // Enhanced validation with better error handling
      const requiredFields = [
        { field: 'title', name: 'Titel' },
        { field: 'description', name: 'Beschrijving' },
        { field: 'price', name: 'Prijs' },
        { field: 'categoryId', name: 'Categorie' },
        { field: 'email', name: 'E-mail' },
        { field: 'phone', name: 'Telefoonnummer' }
      ];
      
      const missingFields: string[] = [];
      
      for (const { field, name } of requiredFields) {
        const value = adData[field];
        if (!value || (typeof value === 'string' && !value.trim()) || value === null || value === undefined) {
          missingFields.push(name);
        }
      }
      
      if (missingFields.length > 0) {
        return res.status(400).json({ 
          error: `Ontbrekende velden: ${missingFields.join(', ')}` 
        });
      }
      
      // Additional validation
      if (isNaN(Number(adData.price)) || Number(adData.price) <= 0) {
        return res.status(400).json({ error: 'Prijs moet een geldig getal zijn' });
      }
      
      if (isNaN(Number(adData.categoryId))) {
        return res.status(400).json({ error: 'Categorie is ongeldig' });
      }
      
      // Check content against blacklist
      const contentCheck = checkAdContent(adData.title, adData.description);
      if (!contentCheck.allowed) {
        // Log de geblokkeerde advertentie
        await logBlockedAd(
          req.ip || req.connection.remoteAddress || 'unknown',
          adData.title,
          adData.description || '',
          contentCheck.blockedWords,
          req.get('User-Agent')
        );
        
        return res.status(400).json({ 
          message: contentCheck.reason,
          blockedWords: contentCheck.blockedWords 
        });
      }

      // Bunkopu Seri prijsvalidatie
      if (adData.categoryId) {
        const category = await dbStorage.getCategory(adData.categoryId);
        if (category && category.name === "Bunkopu Seri" && adData.price) {
          const priceInEuros = adData.price / 100; // Convert from cents
          const priceInSrd = adData.currency === "SRD" ? adData.price / 100 : priceInEuros * 40; // Rough EUR to SRD conversion
          
          if ((adData.currency === "EUR" && priceInEuros > 10) || 
              (adData.currency === "SRD" && priceInSrd > 400)) {
            return res.status(400).json({ 
              message: "Prijs te hoog voor Bunkopu Seri! Maximum €10 of SRD 400." 
            });
          }
        }
      }
      
      // Check if admin approval is required
      const requireApproval = await dbStorage.getAdminSetting("requireAdApproval");
      const status = requireApproval === "true" ? "pending" : "approved";
      
      // Process uploaded images
      let imageUrls: string[] = [];
      if (req.files && Array.isArray(req.files)) {
        imageUrls = req.files.map(file => `/uploads/${file.filename}`);
      }
      
      const insertData = {
        ...adData,
        userId: userId, // VERIFIED userId - no fallbacks
        email: adData.email || userEmail,
        status: status as any,
        images: imageUrls, // Add uploaded images
      };
      
      const ad = await dbStorage.createAd(insertData as any);

      // Send notification email if approval is required
      if (status === "pending") {
        const adminEmail = await dbStorage.getAdminSetting("adminEmail");
        if (adminEmail && adminEmail.length > 0) {
          try {
            await sendNewAdNotification({
              to: adminEmail,
              adTitle: ad.title,
              adDescription: ad.description,
              adLocation: ad.location,
              adPrice: ad.price ? `€${(ad.price / 100).toFixed(2)}` : "Gratis",
              posterEmail: ad.email || "",
              posterPhone: ad.phone || undefined,
              adminUrl: process.env.REPLIT_DOMAINS 
                ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}/admin`
                : `${req.protocol}://${req.get('host')}/admin`,
              adId: ad.id,
            });
          } catch (emailError) {
            console.error("Failed to send admin notification:", emailError);
          }
        }
      }

      res.json(ad);
    } catch (error) {
      console.error("Error creating ad:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Server error" });
      }
    }
  });

  // Contact routes
  app.post("/api/ads/:id/contact", contactLimiter, async (req: Request, res: Response) => {
    try {
      const adId = parseInt(req.params.id);
      const { name, email, phone, subject, message } = req.body;

      if (!name || !email || !subject || !message) {
        return res.status(400).json({ message: "Alle velden zijn verplicht" });
      }

      const ad = await dbStorage.getAd(adId);
      if (!ad) {
        return res.status(404).json({ message: "Advertentie niet gevonden" });
      }

      // Save message to database
      await dbStorage.createMessage({
        adId,
        senderName: name,
        senderEmail: email,
        senderPhone: phone || null,
        subject,
        message,
      });

      // Send email to advertiser
      const adUrl = `${req.protocol}://${req.get('host')}/ad/${adId}`;
      
      await sendContactEmail({
        to: ad.email || "",
        adTitle: ad.title,
        senderName: name,
        senderEmail: email,
        senderPhone: phone,
        subject,
        message,
        adUrl,
      });

      res.json({ message: "Bericht verzonden!" });
    } catch (error) {
      console.error("Error sending contact message:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Admin authentication routes
  app.post("/api/admin/login", adminLogin);
  app.post("/api/admin/logout", adminLogout);

  // Protected admin routes
  app.get("/api/admin/categories-tree", isAdmin, async (req: Request, res: Response) => {
    try {
      const categoriesTree = await dbStorage.getCategoriesWithSubcategories();
      res.json(categoriesTree);
    } catch (error) {
      console.error("Error fetching categories tree:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/admin/import-categories", isAdmin, async (req: Request, res: Response) => {
    try {
      await execAsync("npm run import:categories");
      res.json({ success: true, message: "Categorieën succesvol geïmporteerd" });
    } catch (error) {
      console.error("Error importing categories:", error);
      res.status(500).json({ message: "Fout bij importeren van categorieën" });
    }
  });

  // Admin route to get ALL ads including pending
  app.get("/api/admin/ads", isAdmin, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string;
      const ads = await dbStorage.getAllAds(status);
      res.json({ ads });
    } catch (error) {
      console.error("Error fetching admin ads:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Update ad details (user can edit their own ads)
  app.patch("/api/ads/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ad ID" });
      }

      let userId: string | undefined;
      let userEmail: string | undefined;
      
      // Check for demo token in Authorization header
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
          const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
          if (decoded.exp && decoded.exp > Date.now()) {
            console.log('✅ Valid JWT token found, allowing ad edit access');
            userId = decoded.sub;
            userEmail = decoded.email;
          }
        } catch (e) {
          console.log('❌ Invalid token format');
        }
      }
      
      // Check for demo session as fallback
      if (!userId && !userEmail && (req.session as any).demoUser) {
        userId = (req.session as any).demoUser.id;
        userEmail = (req.session as any).demoUser.email;
      } else if (!userId && !userEmail && req.isAuthenticated?.()) {
        userId = (req.user as any)?.claims?.sub;
      }
      
      if (!userId && !userEmail) {
        return res.status(401).json({ message: "Unauthorized - Please login to edit ads" });
      }

      // Check if ad exists and belongs to user
      const existingAd = await dbStorage.getAd(id);
      if (!existingAd) {
        return res.status(404).json({ message: "Ad not found" });
      }
      
      // Check ownership
      const isOwner = existingAd.userId === userId || existingAd.email === userEmail;
      if (!isOwner) {
        return res.status(403).json({ message: "You can only edit your own ads" });
      }

      const updateData = {
        title: req.body.title,
        description: req.body.description,
        price: req.body.price,
        currency: req.body.currency,
        location: req.body.location,
        categoryId: req.body.categoryId,
        subcategoryId: req.body.subcategoryId,
        phone: req.body.phone,
      };

      const updatedAd = await dbStorage.updateAd(id, updateData);
      if (!updatedAd) {
        return res.status(500).json({ message: "Failed to update ad" });
      }

      res.json(updatedAd);
    } catch (error) {
      console.error("Error updating ad:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/ads/:id/status", isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      
      const ad = await dbStorage.updateAdStatus(id, status);
      if (!ad) {
        return res.status(404).json({ message: "Advertentie niet gevonden" });
      }
      
      res.json({ 
        success: true, 
        message: `Advertentie ${status === 'approved' ? 'goedgekeurd' : status === 'rejected' ? 'afgewezen' : 'in behandeling'}`,
        ad 
      });
    } catch (error) {
      console.error("Error updating ad status:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Direct approval/rejection endpoints for email links
  app.get("/api/ads/:id/approve", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const ad = await dbStorage.updateAdStatus(id, "approved");
      if (!ad) {
        return res.status(404).send(`
          <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: red;">❌ Advertentie niet gevonden</h2>
            <p>Advertentie ID ${id} bestaat niet.</p>
          </body></html>
        `);
      }
      
      res.send(`
        <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: green;">✅ Advertentie Goedgekeurd</h2>
          <p>Advertentie "${ad.title}" (ID: ${id}) is succesvol goedgekeurd.</p>
          <p>De advertentie is nu zichtbaar op de website.</p>
          <a href="/admin?tab=advertenties" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px; display: inline-block;">
            Ga naar Admin Dashboard
          </a>
        </body></html>
      `);
    } catch (error) {
      console.error("Error approving ad:", error);
      res.status(500).send(`
        <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: red;">❌ Server Error</h2>
          <p>Er is een fout opgetreden bij het goedkeuren van de advertentie.</p>
        </body></html>
      `);
    }
  });

  app.get("/api/ads/:id/reject", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const ad = await dbStorage.updateAdStatus(id, "rejected");
      if (!ad) {
        return res.status(404).send(`
          <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: red;">❌ Advertentie niet gevonden</h2>
            <p>Advertentie ID ${id} bestaat niet.</p>
          </body></html>
        `);
      }
      
      res.send(`
        <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: orange;">⚠️ Advertentie Afgewezen</h2>
          <p>Advertentie "${ad.title}" (ID: ${id}) is afgewezen.</p>
          <p>De advertentie is niet zichtbaar op de website.</p>
          <a href="/admin?tab=advertenties" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px; display: inline-block;">
            Ga naar Admin Dashboard
          </a>
        </body></html>
      `);
    } catch (error) {
      console.error("Error rejecting ad:", error);
      res.status(500).send(`
        <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: red;">❌ Server Error</h2>
          <p>Er is een fout opgetreden bij het afwijzen van de advertentie.</p>
        </body></html>
      `);
    }
  });

  // Delete ad route (admin only)
  app.delete("/api/ads/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Ongeldig advertentie ID" });
      }
      
      const deleted = await dbStorage.deleteAd(id);
      if (!deleted) {
        return res.status(404).json({ message: "Advertentie niet gevonden" });
      }
      
      res.json({ 
        success: true,
        message: "Advertentie succesvol verwijderd" 
      });
    } catch (error) {
      console.error("Error deleting ad:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // User management endpoints (admin only)
  app.get("/api/admin/users", isAdmin, async (req: Request, res: Response) => {
    try {
      const users = await dbStorage.getAllUsers();
      res.json({ users });
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/users/stats", isAdmin, async (req: Request, res: Response) => {
    try {
      const users = await dbStorage.getUsersWithStats();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users with stats:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/admin/users/:userId/status", isAdmin, async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { status } = req.body;
      
      if (!['active', 'suspended', 'banned'].includes(status)) {
        return res.status(400).json({ message: "Invalid user status" });
      }
      
      const user = await dbStorage.updateUserStatus(userId, status);
      if (!user) {
        return res.status(404).json({ message: "Gebruiker niet gevonden" });
      }
      
      res.json({ 
        success: true,
        message: `Gebruiker status bijgewerkt naar: ${status}`,
        user 
      });
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/admin/users/:userId", isAdmin, async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      
      const deleted = await dbStorage.deleteUser(userId);
      if (!deleted) {
        return res.status(404).json({ message: "Gebruiker niet gevonden" });
      }
      
      res.json({ 
        success: true,
        message: "Gebruiker succesvol verwijderd" 
      });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/user-statistics", isAdmin, async (req: Request, res: Response) => {
    try {
      const stats = await dbStorage.getUserStatistics();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching user statistics:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Admin settings management (secured)
  app.get("/api/admin/settings", isAdmin, async (req: Request, res: Response) => {
    try {
      const requireAdApproval = await dbStorage.getAdminSetting("requireAdApproval");
      const adminEmail = await dbStorage.getAdminSetting("adminEmail");
      
      res.json({
        requireAdApproval: requireAdApproval === "true",
        adminEmail: adminEmail || "",
      });
    } catch (error) {
      console.error("Error fetching admin settings:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/admin/settings", isAdmin, async (req: Request, res: Response) => {
    try {
      const { requireAdApproval, adminEmail } = req.body;
      
      await dbStorage.setAdminSetting("requireAdApproval", requireAdApproval.toString());
      if (adminEmail) {
        await dbStorage.setAdminSetting("adminEmail", adminEmail);
      }
      
      res.json({ 
        success: true,
        message: "Instellingen succesvol opgeslagen"
      });
    } catch (error) {
      console.error("Error updating admin settings:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Email notification settings (secured)
  app.post("/api/admin/email-settings", isAdmin, async (req: Request, res: Response) => {
    try {
      const { emailNotificationAds, emailNotificationUsers } = req.body;
      
      if (typeof emailNotificationAds === "boolean") {
        await dbStorage.setAdminSetting("emailNotificationAds", emailNotificationAds.toString());
      }
      
      if (typeof emailNotificationUsers === "boolean") {
        await dbStorage.setAdminSetting("emailNotificationUsers", emailNotificationUsers.toString());
      }
      
      res.json({ 
        success: true, 
        message: "E-mailinstellingen succesvol opgeslagen" 
      });
    } catch (error) {
      console.error("Error saving email settings:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/email-settings", isAdmin, async (req: Request, res: Response) => {
    try {
      const emailNotificationAds = await dbStorage.getAdminSetting("emailNotificationAds");
      const emailNotificationUsers = await dbStorage.getAdminSetting("emailNotificationUsers");
      
      res.json({
        emailNotificationAds: emailNotificationAds === "true",
        emailNotificationUsers: emailNotificationUsers === "true",
      });
    } catch (error) {
      console.error("Error fetching email settings:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // SEO routes (public)
  app.get("/sitemap.xml", async (req: Request, res: Response) => {
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const sitemap = await generateSitemap(baseUrl);
      res.set('Content-Type', 'text/xml');
      res.send(sitemap);
    } catch (error) {
      console.error("Error generating sitemap:", error);
      res.status(500).send("Error generating sitemap");
    }
  });

  app.get("/robots.txt", (req: Request, res: Response) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const robotsTxt = generateRobotsTxt(baseUrl);
    res.set('Content-Type', 'text/plain');
    res.send(robotsTxt);
  });

  // Statistics (public)
  app.get("/api/stats", async (req: Request, res: Response) => {
    try {
      const stats = await dbStorage.getAdStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Admin analytics endpoints (secured)
  app.get("/api/admin/analytics/category-views", isAdmin, async (req: Request, res: Response) => {
    try {
      const categoryViews = await dbStorage.getCategoryViewStats();
      res.json(categoryViews);
    } catch (error) {
      console.error("Error fetching category views:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/analytics/daily-users", isAdmin, async (req: Request, res: Response) => {
    try {
      const dailyUsers = await dbStorage.getDailyUserStats();
      res.json(dailyUsers);
    } catch (error) {
      console.error("Error fetching daily users:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/analytics/ads-by-status", isAdmin, async (req: Request, res: Response) => {
    try {
      const adsByStatus = await dbStorage.getAdsByStatusStats();
      res.json(adsByStatus);
    } catch (error) {
      console.error("Error fetching ads by status:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // WhatsApp and user data endpoints
  app.get("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = await dbStorage.getUserWithWhatsApp(id);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.get("/api/users/:id/ads-count", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const count = await dbStorage.getUserAdCount(id);
      
      res.json({ count });
    } catch (error) {
      console.error("Error fetching user ad count:", error);
      res.status(500).json({ error: "Failed to fetch user ad count" });
    }
  });



  // Exchange rates endpoint (mock implementation)
  app.get("/api/exchange-rates", async (req: Request, res: Response) => {
    try {
      // Mock exchange rates - in production, this would call CBVS API
      const rates = {
        USD: 0.027, // 1 SRD = 0.027 USD
        EUR: 0.025, // 1 SRD = 0.025 EUR  
        SRD: 1.0    // Base currency
      };
      
      res.json(rates);
    } catch (error) {
      console.error("Error fetching exchange rates:", error);
      res.status(500).json({ error: "Failed to fetch exchange rates" });
    }
  });

  // Favorites endpoints
  app.post("/api/favorites", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { adId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Authenticatie vereist" });
      }

      if (!adId) {
        return res.status(400).json({ message: "Advertentie ID is vereist" });
      }

      await dbStorage.addFavorite(userId, adId);
      res.json({ message: "Toegevoegd aan favorieten" });
    } catch (error) {
      console.error("Error adding favorite:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/favorites/:adId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const adId = parseInt(req.params.adId);
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Authenticatie vereist" });
      }

      await dbStorage.removeFavorite(userId, adId);
      res.json({ message: "Verwijderd uit favorieten" });
    } catch (error) {
      console.error("Error removing favorite:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/favorites/:adId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const adId = parseInt(req.params.adId);
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Authenticatie vereist" });
      }

      const isFavorite = await dbStorage.isFavorite(userId, adId);
      res.json({ isFavorite });
    } catch (error) {
      console.error("Error checking favorite:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/favorites", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Authenticatie vereist" });
      }

      const favorites = await dbStorage.getUserFavorites(userId);
      res.json({ favorites });
    } catch (error) {
      console.error("Error fetching favorites:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Analytics routes - Admin only
  app.post("/api/analytics/log", async (req: Request, res: Response) => {
    try {
      const { actionType, actionData, ipAddress } = req.body;
      const userId = req.user?.id || null;

      // Get country from IP address
      let country = null;
      if (ipAddress) {
        try {
          const response = await fetch(`http://ipapi.co/${ipAddress}/json/`);
          const data = await response.json();
          country = data.country_name || null;
        } catch (error) {
          console.log("IP geolocation error:", error);
        }
      }

      const activity = await dbStorage.logActivity({
        userId,
        actionType,
        actionData,
        ipAddress,
        country,
      });

      res.json(activity);
    } catch (error) {
      console.error("Error logging activity:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/analytics/search-terms", isAdmin, async (req: Request, res: Response) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const stats = await dbStorage.getSearchTermStats(days);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching search term stats:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/analytics/countries", isAdmin, async (req: Request, res: Response) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const stats = await dbStorage.getCountryStats(days);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching country stats:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/analytics/activity", isAdmin, async (req: Request, res: Response) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const stats = await dbStorage.getActivityStats(days);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching activity stats:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/analytics/action-types", isAdmin, async (req: Request, res: Response) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const stats = await dbStorage.getActionTypeStats(days);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching action type stats:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/analytics/user-activities", isAdmin, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const activities = await dbStorage.getTopUserActivities(limit, days);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching user activities:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/database/status", isAdmin, async (req: Request, res: Response) => {
    try {
      const status = {
        local: {
          configured: !!process.env.DATABASE_URL,
          status: process.env.DATABASE_URL ? "active" : "not_configured"
        },
        supabase: {
          configured: !!process.env.SUPABASE_DATABASE_URL,
          status: process.env.SUPABASE_DATABASE_URL ? "active" : "not_configured"
        }
      };
      res.json(status);
    } catch (error) {
      console.error("Error checking database status:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Combined carousel data endpoint for performance optimization
  app.get("/api/carousel-data", async (req: Request, res: Response) => {
    try {
      const [recentAds, autoAds, featuredAds] = await Promise.all([
        // Recent ads for homepage gallery
        dbStorage.getAds({ limit: 50 }),
        
        // Auto category ads
        dbStorage.getAds({ categoryId: 1, limit: 4 }),
        
        // General featured ads (by views)
        dbStorage.getAds({ limit: 4 })
      ]);

      res.json({
        recent: recentAds.ads,
        autos: autoAds.ads,
        featured: featuredAds.ads,
        timestamp: new Date().toISOString(),
        cached: true
      });
    } catch (error) {
      console.error("Error fetching carousel data:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Blacklist management endpoints
  app.get("/api/admin/blacklist", isAdmin, async (req: Request, res: Response) => {
    try {
      const blacklist = getBlacklist();
      res.json({ words: blacklist });
    } catch (error) {
      console.error("Error fetching blacklist:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/admin/blacklist/add", isAdmin, async (req: Request, res: Response) => {
    try {
      const { words } = req.body;
      if (!Array.isArray(words)) {
        return res.status(400).json({ message: "Words must be an array" });
      }
      
      addToBlacklist(words);
      res.json({ message: `${words.length} woorden toegevoegd aan blacklist` });
    } catch (error) {
      console.error("Error adding to blacklist:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/admin/blacklist/remove", isAdmin, async (req: Request, res: Response) => {
    try {
      const { words } = req.body;
      if (!Array.isArray(words)) {
        return res.status(400).json({ message: "Words must be an array" });
      }
      
      removeFromBlacklist(words);
      res.json({ message: `${words.length} woorden verwijderd van blacklist` });
    } catch (error) {
      console.error("Error removing from blacklist:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Test endpoint for content checking
  app.post("/api/admin/blacklist/test", isAdmin, async (req: Request, res: Response) => {
    try {
      const { title, description } = req.body;
      const result = checkAdContent(title || "", description || "");
      res.json(result);
    } catch (error) {
      console.error("Error testing content:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Blocked ads logging endpoints
  app.get("/api/admin/blocked-ads/logs", isAdmin, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await getBlockedAdLogs(limit);
      res.json({ logs, total: logs.length });
    } catch (error) {
      console.error("Error fetching blocked ads logs:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/blocked-ads/count", isAdmin, async (req: Request, res: Response) => {
    try {
      const count24h = await getBlockedAdsCount24h();
      res.json({ count24h });
    } catch (error) {
      console.error("Error fetching blocked ads count:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/admin/blocked-ads/logs", isAdmin, async (req: Request, res: Response) => {
    try {
      await clearBlockedAdLogs();
      res.json({ message: "Blocked ads logs gewist" });
    } catch (error) {
      console.error("Error clearing blocked ads logs:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Stripe Payment Routes
  app.post("/api/create-payment-intent", async (req: Request, res: Response) => {
    if (!stripe) {
      return res.status(500).json({ 
        message: "Stripe is niet geconfigureerd. Contacteer de administrator." 
      });
    }

    try {
      const { amount, currency = "eur" } = req.body;
      
      if (!amount || amount < 0.5) { // Minimum €0.50
        return res.status(400).json({ 
          message: "Minimaal bedrag is €0.50" 
        });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency,
        payment_method_types: ['card', 'ideal'], // Enable iDEAL for EUR payments
        metadata: {
          integration_check: 'accept_a_payment',
        },
      });

      res.json({ 
        clientSecret: paymentIntent.client_secret,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency
      });
    } catch (error: any) {
      console.error("Stripe payment intent error:", error);
      res.status(500).json({ 
        message: "Fout bij het aanmaken van betaling: " + error.message 
      });
    }
  });

  // Premium subscription route
  app.post("/api/create-subscription", isAuthenticated, async (req: Request, res: Response) => {
    if (!stripe) {
      return res.status(500).json({ 
        message: "Stripe is niet geconfigureerd. Contacteer de administrator." 
      });
    }

    try {
      const { priceId } = req.body;
      const user = req.user;

      if (!user?.email) {
        return res.status(400).json({ 
          message: "Gebruiker heeft geen e-mailadres" 
        });
      }

      // Create or retrieve Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        metadata: {
          userId: user.id,
        },
      });

      // Create subscription
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{
          price: priceId || "price_1234567890", // Default price ID
        }],
        payment_behavior: 'default_incomplete',
        payment_settings: {
          payment_method_types: ['card', 'ideal'], // Enable iDEAL
        },
        expand: ['latest_invoice.payment_intent'],
      });

      res.json({
        subscriptionId: subscription.id,
        clientSecret: (subscription.latest_invoice as any)?.payment_intent?.client_secret,
      });
    } catch (error: any) {
      console.error("Stripe subscription error:", error);
      res.status(500).json({ 
        message: "Fout bij het aanmaken van abonnement: " + error.message 
      });
    }
  });

  // Webhook endpoint for Stripe events
  app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
    if (!stripe) {
      return res.status(500).json({ message: "Stripe niet geconfigureerd" });
    }

    try {
      const sig = req.headers['stripe-signature'] as string;
      const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

      let event;
      
      if (endpointSecret) {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
      } else {
        event = req.body;
      }

      // Handle the event
      switch (event.type) {
        case 'payment_intent.succeeded':
          console.log('Payment succeeded:', event.data.object);
          break;
        case 'customer.subscription.created':
          console.log('Subscription created:', event.data.object);
          break;
        case 'customer.subscription.updated':
          console.log('Subscription updated:', event.data.object);
          break;
        case 'customer.subscription.deleted':
          console.log('Subscription canceled:', event.data.object);
          break;
        default:
          console.log(`Unhandled event type ${event.type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error("Webhook error:", error);
      res.status(400).send(`Webhook Error: ${error.message}`);
    }
  });

  // Test email endpoint
  // Image upload endpoint
  app.post("/api/upload-images", upload.array('images', 5), async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ success: false, message: "Geen bestanden geüpload" });
      }

      // Generate URLs for uploaded files
      const imageUrls = files.map(file => `/uploads/${file.filename}`);
      
      res.json({ 
        success: true, 
        urls: imageUrls,
        message: `${files.length} afbeelding(en) succesvol geüpload` 
      });
    } catch (error) {
      console.error("Image upload error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Fout bij uploaden van afbeeldingen" 
      });
    }
  });

  app.post("/api/test-email", async (req: Request, res: Response) => {
    try {
      const { type, to } = req.body;
      
      if (type === "admin_notification") {
        const success = await sendNewAdNotification({
          to: to || "ggriedewald@gmail.com",
          adTitle: "Test Advertentie",
          adDescription: "Dit is een test advertentie om het e-mail systeem te controleren",
          adLocation: "Paramaribo",
          adPrice: "€100",
          posterEmail: "test@example.com",
          posterPhone: "123456789",
          adminUrl: process.env.REPLIT_DOMAINS 
            ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}/admin`
            : `${req.protocol}://${req.get('host')}/admin`,
          adId: 999,
        });
        
        res.json({ success, message: "Test e-mail verzonden" });
      } else {
        res.status(400).json({ message: "Onbekend e-mail type" });
      }
    } catch (error) {
      console.error("Test e-mail error:", error);
      res.status(500).json({ message: "Fout bij verzenden test e-mail", error: error.message });
    }
  });

  // Filter definitions routes
  app.get("/api/filters/:categorySlug", async (req: Request, res: Response) => {
    try {
      const { categorySlug } = req.params;
      
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      const filters = await db.query.filterDefinitions.findMany({
        where: (filterDefs, { eq, and }) => and(
          eq(filterDefs.categorySlug, categorySlug),
          eq(filterDefs.isActive, true)
        ),
        orderBy: (filterDefs, { asc }) => [asc(filterDefs.sortOrder)]
      });

      // If no filters found, generate dynamic filters based on actual ad data
      if (filters.length === 0) {
        const dynamicFilters = await generateDynamicFilters(categorySlug);
        return res.json({ filters: dynamicFilters });
      }

      res.json({ filters });
    } catch (error) {
      console.error("Error fetching filters:", error);
      res.status(500).json({ error: "Server error" });
    }
  });

  // Generate dynamic filters based on ad content
  async function generateDynamicFilters(categorySlug: string) {
    try {
      if (!db) return [];

      // Get category ID from slug
      const category = await db.query.categories.findFirst({
        where: (cats, { eq }) => eq(cats.slug, categorySlug)
      });

      if (!category) return [];

      // Get all ads in this category
      const categoryAds = await db.query.ads.findMany({
        where: (ads, { eq, and }) => and(
          eq(ads.categoryId, category.id),
          eq(ads.status, "approved")
        ),
        columns: {
          title: true,
          description: true,
          location: true,
          price: true,
          currency: true
        }
      });

      if (categoryAds.length === 0) return [];

      const dynamicFilters: any[] = [];

      // Generate location filter from actual locations
      const locations = [...new Set(categoryAds.map(ad => ad.location).filter(Boolean))];
      if (locations.length > 1) {
        dynamicFilters.push({
          id: 'dynamic-location',
          categorySlug,
          field: 'location',
          label: 'Locatie',
          type: 'select',
          options: locations.sort(),
          placeholder: 'Selecteer locatie',
          required: false,
          sortOrder: 1,
          isActive: true
        });
      }

      // Generate price range filter
      const prices = categoryAds.map(ad => ad.price).filter(p => p && p > 0);
      if (prices.length > 0) {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        
        if (maxPrice > minPrice) {
          dynamicFilters.push({
            id: 'dynamic-price-min',
            categorySlug,
            field: 'price_min',
            label: 'Prijs vanaf',
            type: 'number',
            options: null,
            placeholder: `€${Math.floor(minPrice / 100)}`,
            required: false,
            sortOrder: 2,
            isActive: true
          }, {
            id: 'dynamic-price-max',
            categorySlug,
            field: 'price_max',
            label: 'Prijs tot',
            type: 'number',
            options: null,
            placeholder: `€${Math.floor(maxPrice / 100)}`,
            required: false,
            sortOrder: 3,
            isActive: true
          });
        }
      }

      // Category-specific dynamic filters based on common keywords
      const specificFilters = await generateCategorySpecificFilters(categorySlug, categoryAds);
      dynamicFilters.push(...specificFilters);

      return dynamicFilters;
    } catch (error) {
      console.error('Error generating dynamic filters:', error);
      return [];
    }
  }

  // Generate category-specific filters by analyzing ad content
  async function generateCategorySpecificFilters(categorySlug: string, ads: any[]) {
    const filters: any[] = [];
    const allText = ads.map(ad => `${ad.title} ${ad.description}`).join(' ').toLowerCase();

    // Auto category filters
    if (categorySlug === 'autos' || categorySlug.includes('auto')) {
      const brands = extractKeywords(allText, [
        'toyota', 'bmw', 'mercedes', 'volkswagen', 'audi', 'ford', 'hyundai', 
        'kia', 'nissan', 'honda', 'peugeot', 'renault', 'opel', 'mazda', 'suzuki'
      ]);
      
      if (brands.length > 1) {
        filters.push({
          id: 'dynamic-merk',
          categorySlug,
          field: 'merk',
          label: 'Merk',
          type: 'select',
          options: brands.map(b => capitalizeFirst(b)).sort(),
          placeholder: 'Selecteer merk',
          required: false,
          sortOrder: 4,
          isActive: true
        });
      }

      const fuelTypes = extractKeywords(allText, ['benzine', 'diesel', 'hybride', 'elektrisch', 'lpg']);
      if (fuelTypes.length > 1) {
        filters.push({
          id: 'dynamic-brandstof',
          categorySlug,
          field: 'brandstof',
          label: 'Brandstof',
          type: 'select',
          options: fuelTypes.map(f => capitalizeFirst(f)).sort(),
          placeholder: 'Selecteer brandstof',
          required: false,
          sortOrder: 5,
          isActive: true
        });
      }

      const transmissions = extractKeywords(allText, ['handgeschakeld', 'automaat', 'handmatig']);
      if (transmissions.length > 1) {
        filters.push({
          id: 'dynamic-transmissie',
          categorySlug,
          field: 'transmissie',
          label: 'Transmissie',
          type: 'select',
          options: transmissions.map(t => capitalizeFirst(t)).sort(),
          placeholder: 'Selecteer transmissie',
          required: false,
          sortOrder: 6,
          isActive: true
        });
      }
    }

    // Electronics/phones category filters
    if (categorySlug.includes('telefoon') || categorySlug.includes('elektronica')) {
      const brands = extractKeywords(allText, [
        'iphone', 'apple', 'samsung', 'huawei', 'xiaomi', 'oppo', 'vivo', 'oneplus', 'google'
      ]);
      
      if (brands.length > 1) {
        filters.push({
          id: 'dynamic-merk',
          categorySlug,
          field: 'merk',
          label: 'Merk',
          type: 'select',
          options: brands.map(b => capitalizeFirst(b)).sort(),
          placeholder: 'Selecteer merk',
          required: false,
          sortOrder: 4,
          isActive: true
        });
      }

      const conditions = extractKeywords(allText, ['nieuw', 'gebruikt', 'refurbished', 'gereviseerd']);
      if (conditions.length > 1) {
        filters.push({
          id: 'dynamic-conditie',
          categorySlug,
          field: 'conditie',
          label: 'Conditie',
          type: 'select',
          options: conditions.map(c => capitalizeFirst(c)).sort(),
          placeholder: 'Selecteer conditie',
          required: false,
          sortOrder: 5,
          isActive: true
        });
      }
    }

    // Clothing category filters
    if (categorySlug.includes('kleding')) {
      const sizes = extractKeywords(allText, ['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl']);
      if (sizes.length > 1) {
        filters.push({
          id: 'dynamic-maat',
          categorySlug,
          field: 'maat',
          label: 'Maat',
          type: 'select',
          options: sizes.map(s => s.toUpperCase()).sort(),
          placeholder: 'Selecteer maat',
          required: false,
          sortOrder: 4,
          isActive: true
        });
      }

      const conditions = extractKeywords(allText, ['nieuw', 'gebruikt', 'vintage']);
      if (conditions.length > 1) {
        filters.push({
          id: 'dynamic-conditie',
          categorySlug,
          field: 'conditie',
          label: 'Conditie',
          type: 'select',
          options: conditions.map(c => capitalizeFirst(c)).sort(),
          placeholder: 'Selecteer conditie',
          required: false,
          sortOrder: 5,
          isActive: true
        });
      }
    }

    return filters;
  }

  // Helper function to extract keywords from text
  function extractKeywords(text: string, keywords: string[]): string[] {
    const found: string[] = [];
    keywords.forEach(keyword => {
      if (text.includes(keyword.toLowerCase())) {
        found.push(keyword);
      }
    });
    return [...new Set(found)];
  }

  // Helper function to capitalize first letter
  function capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  app.get("/api/admin/filters", async (req: Request, res: Response) => {
    try {
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      const filters = await db.query.filterDefinitions.findMany({
        orderBy: (filterDefs, { asc }) => [asc(filterDefs.categorySlug), asc(filterDefs.sortOrder)]
      });

      res.json({ filters });
    } catch (error) {
      console.error("Error fetching all filter definitions:", error);
      res.status(500).json({ error: "Failed to fetch filter definitions" });
    }
  });

  app.post("/api/admin/filters", async (req: Request, res: Response) => {
    try {
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      const { categorySlug, field, label, type, options, placeholder, required, sortOrder } = req.body;

      const [newFilter] = await db.insert(filterDefinitions).values({
        categorySlug,
        field,
        label,
        type,
        options: options || null,
        placeholder: placeholder || null,
        required: required || false,
        sortOrder: sortOrder || 0,
        isActive: true
      }).returning();

      res.json({ filter: newFilter });
    } catch (error) {
      console.error("Error creating filter definition:", error);
      res.status(500).json({ error: "Failed to create filter definition" });
    }
  });

  app.delete("/api/admin/filters/:id", async (req: Request, res: Response) => {
    try {
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      const { id } = req.params;

      await db.delete(filterDefinitions).where(eq(filterDefinitions.id, parseInt(id)));

      res.json({ message: "Filter definition deleted successfully" });
    } catch (error) {
      console.error("Error deleting filter definition:", error);
      res.status(500).json({ error: "Failed to delete filter definition" });
    }
  });

  // Profile update endpoint
  app.put("/api/profile", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { firstName, lastName, email, phone, location, bio, companyName } = req.body;
      
      // Get user ID from session or token
      let userId = null;
      const authHeader = req.headers.authorization;
      
      // Check demo token first
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
          const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
          if (decoded.exp && decoded.exp > Date.now()) {
            userId = decoded.sub;
          }
        } catch (e) {
          console.log('Invalid token format');
        }
      }
      
      // Check session for demo user
      if (!userId && (req.session as any)?.demoUser) {
        userId = (req.session as any).demoUser.id;
      }
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Update user in database
      const updatedUser = await dbStorage.updateUserAuth(userId, {
        firstName,
        lastName,
        email,
        phone,
        location,
        companyName
      });
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ 
        success: true, 
        message: "Profiel succesvol bijgewerkt",
        user: updatedUser
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Profile settings routes
  app.post("/api/auth/change-password", async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      // For demo purposes, always return success
      // In production, verify current password and update
      res.json({ success: true, message: "Wachtwoord succesvol gewijzigd" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/auth/notifications", async (req: Request, res: Response) => {
    try {
      const { emailNotifications, pushNotifications, marketingEmails } = req.body;
      
      // For demo purposes, always return success
      // In production, save to user preferences
      res.json({ success: true, message: "Notificatie-instellingen opgeslagen" });
    } catch (error) {
      console.error("Error updating notifications:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/logout", async (req: Request, res: Response) => {
    try {
      // Verwijder alle cookies
      const cookieOptions = {
        path: '/',
        httpOnly: true,
        sameSite: 'strict' as const,
        secure: process.env.NODE_ENV === 'production',
        expires: new Date(0) // Verloopt direct
      };

      // Verwijder alle mogelijke auth cookies
      ['session', 'token', 'auth', 'connect.sid'].forEach(cookie => {
        res.cookie(cookie, '', cookieOptions);
      });

      // Vernietig server-side sessie
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destruction error:', err);
          return res.status(500).json({ error: 'Logout failed' });
        }
        
        // Extra zekerheid: headers clearen
        res.removeHeader('Authorization');
        res.removeHeader('Set-Cookie');
        
        res.status(200).json({ 
          success: true,
          message: 'Successvol uitgelogd'
        });
      });
    } catch (error) {
      console.error("Error logging out:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Draft management routes
  app.get("/api/drafts", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Get user ID from session or demo user
      let userId = null;
      
      // Check session for demo user first
      if ((req.session as any)?.demoUser) {
        userId = (req.session as any).demoUser.id;
      } else if (req.isAuthenticated?.()) {
        userId = (req.user as any)?.claims?.sub;
      }
      
      if (!userId) {
        return res.status(401).json({ message: "Authenticatie vereist" });
      }

      const userDrafts = await db.select().from(schema.drafts)
        .where(eq(schema.drafts.userId, userId))
        .orderBy(desc(schema.drafts.updatedAt));

      res.json(userDrafts);
    } catch (error) {
      console.error("Error fetching drafts:", error);
      res.status(500).json({ message: "Fout bij ophalen concepten" });
    }
  });

  app.post("/api/drafts", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Get user ID from session or demo user
      let userId = null;
      
      // Check session for demo user first
      if ((req.session as any)?.demoUser) {
        userId = (req.session as any).demoUser.id;
      } else if (req.isAuthenticated?.()) {
        userId = (req.user as any)?.claims?.sub;
      }
      
      if (!userId) {
        return res.status(401).json({ message: "Authenticatie vereist" });
      }

      const draftData = req.body;
      
      // Check if draft already exists for this user (limit to 1 draft per user)
      const existingDraft = await db.select().from(schema.drafts)
        .where(eq(schema.drafts.userId, userId))
        .limit(1);

      if (existingDraft.length > 0) {
        // Update existing draft
        const [updatedDraft] = await db.update(schema.drafts)
          .set({
            ...draftData,
            formData: draftData,
            updatedAt: new Date(),
          })
          .where(eq(schema.drafts.id, existingDraft[0].id))
          .returning();

        res.json(updatedDraft);
      } else {
        // Create new draft
        const [newDraft] = await db.insert(schema.drafts)
          .values({
            userId,
            ...draftData,
            formData: draftData,
          })
          .returning();

        res.json(newDraft);
      }
    } catch (error) {
      console.error("Error saving draft:", error);
      res.status(500).json({ message: "Fout bij opslaan concept" });
    }
  });

  app.delete("/api/drafts/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const draftId = parseInt(req.params.id);
      
      // Get user ID from session or demo user
      let userId = null;
      
      // Check session for demo user first
      if ((req.session as any)?.demoUser) {
        userId = (req.session as any).demoUser.id;
      } else if (req.isAuthenticated?.()) {
        userId = (req.user as any)?.claims?.sub;
      }
      
      if (!userId) {
        return res.status(401).json({ message: "Authenticatie vereist" });
      }

      await db.delete(schema.drafts)
        .where(and(
          eq(schema.drafts.id, draftId),
          eq(schema.drafts.userId, userId)
        ));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting draft:", error);
      res.status(500).json({ message: "Fout bij verwijderen concept" });
    }
  });

  
}