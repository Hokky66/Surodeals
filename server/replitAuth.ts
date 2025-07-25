import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "passport-openidconnect";
import passport from "passport";
import session from "express-session";
import type { Express, Request, Response, NextFunction } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage"; // jouw db logic

const memoizedIssuerDiscovery = memoize(async (issuerUrl: string) => {
  try {
    return await client.Issuer.discover(issuerUrl);
  } catch (err) {
    console.error("Issuer discovery failed, using fallback issuer config:", err);

    // Fallback issuer config — pas URLs aan naar jouw setup
    return new client.Issuer({
      issuer: issuerUrl,
      authorization_endpoint: `${issuerUrl}/authorize`,
      token_endpoint: `${issuerUrl}/token`,
      userinfo_endpoint: `${issuerUrl}/userinfo`,
      end_session_endpoint: `${issuerUrl}/logout`,
    });
  }
}, { maxAge: 60 * 60 * 1000, promise: true });

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenSet
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const issuerUrl = process.env.ISSUER_URL!;
  const issuer = await memoizedIssuerDiscovery(issuerUrl);

  const oidcClient = new issuer.Client({
    client_id: process.env.REPL_ID!,
    client_secret: process.env.REPL_SECRET!,
    redirect_uris: [`${process.env.APP_URL}/api/callback`],
    response_types: ["code"],
  });

  const verify: VerifyFunction = async (
    tokens: client.TokenSet,
    verified: passport.AuthenticateCallback
  ) => {
    const user: any = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  for (const domain of process.env.REPLIT_DOMAINS!.split(",")) {
    const strategy = new Strategy(
      {
        issuer: issuer.issuer,
        authorizationURL: issuer.metadata.authorization_endpoint,
        tokenURL: issuer.metadata.token_endpoint,
        userInfoURL: issuer.metadata.userinfo_endpoint,
        clientID: process.env.REPL_ID!,
        clientSecret: process.env.REPL_SECRET!,
        callbackURL: `https://${domain}/api/callback`,
        scope: "openid email profile offline_access",
      },
      verify
    );
    passport.use(`replitauth:${domain}`, strategy);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.Issuer.Url.buildEndSessionUrl(issuer, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

// Middleware om routes te beschermen
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  } else {
    res.status(401).json({ error: "Niet ingelogd" });
  }
}


