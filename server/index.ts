import dotenv from 'dotenv';
dotenv.config();


import path from "path";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { createServer } from "http";
import { setupRoutes } from "./routes";
import { setupChatRoutes } from "./chat-routes";
import { setupPackageRoutes } from "./package-routes";
import { setupSEORoutes } from "./seo/routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupSecurity } from "./auth/security";
import { setupAuth } from "./replitAuth";
import authRoutes from "./auth/routes";
import { startCronJobs } from "./cron/cronJobs";
import cronRoutes from "./cron/cronRoutes";

const app = express();

// Activeer blocked ads logging (standaard uit voor development)
if (!process.env.LOG_BLOCKED_ADS) {
  process.env.LOG_BLOCKED_ADS = 'true';
}

// Trust proxy for rate limiting in production
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const server = createServer(app);

// Trust proxy configuratie voor rate limiting
app.set('trust proxy', 1);

// Beveiliging setup
setupSecurity(app);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Session configuratie
const PostgresStore = connectPg(session);
app.use(session({
  store: new PostgresStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    tableName: 'sessions'
  }),
  secret: process.env.SESSION_SECRET || 'fallback-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Geen HTTPS vereist in development
    httpOnly: false, // Toegankelijk voor JavaScript in development
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dagen
    sameSite: 'none', // Geen same-site restrictie voor development
    domain: process.env.NODE_ENV === 'production' ? undefined : undefined // Geen domain restrictie
    },
  name: 'surimarkt.sid' // Aangepaste cookie naam
}));


// Serve static files from client build
// app.use(express.static(path.join(process.cwd(), 'client/dist')));
app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));
app.use('/images', express.static(path.join(process.cwd(), 'public/images')));
app.use('/demo-images', express.static(path.join(process.cwd(), 'public/demo-images')));


// Auth routes - ensure they're mounted before other routes
app.use('/api/auth', authRoutes);

// Cron job management routes
app.use('/api/cron', cronRoutes);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Setup authentication before routes
  await setupAuth(app);
  
  setupRoutes(app);
  setupChatRoutes(app);
  setupPackageRoutes(app);
  setupSEORoutes(app);
  
  // Start cron jobs
  startCronJobs();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Browser caching voor statische bestanden
  app.use('/public', express.static('public', {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dagen
    setHeaders: (res, path) => {
      if (path.endsWith('.css') || path.endsWith('.js') || path.endsWith('.png') || 
          path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.gif') || 
          path.endsWith('.webp') || path.endsWith('.svg')) {
        res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 dagen
      }
    }
  }));

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Use port 5000 as required by Replit
  // this serves both the API and the client.
  const port = process.env.PORT || 5000;
  
  // Graceful shutdown handler
  const shutdown = (signal: string) => {
    log(`\nReceived ${signal}. Graceful shutdown...`);
    server.close(() => {
      log("HTTP server closed.");
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      log("Forcing shutdown...");
      process.exit(1);
    }, 10000);
  };

  // Listen for termination signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      log(`Port ${port} is busy. Killing existing processes and restarting...`);
      // Force close existing connections
      server.close(() => {
        setTimeout(() => {
          server.listen({
            port,
            host: "0.0.0.0",
            reusePort: true,
          });
        }, 1000);
      });
    } else {
      throw err;
    }
  });

  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();