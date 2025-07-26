import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "passport-openidconnect";
import passport from "passport";
import session from "express-session";
import type { Express, Request, Response, NextFunction } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

// 🔐 Memoized discovery voor betere performance
const memoizedIssuerDiscovery = memoize(async (issuerUrl: string) => {
  try {
    return await client.Issuer.discover(issuerUrl);
  } catch (err) {
    console.error("Issuer discovery failed, using fallback issuer config:", err);

    return new client.Issuer({
      issuer: issuerUrl,
      authorization_endpoint: `${issuerUrl}/authorize`,
      token_endpoint: `${issuerUrl}/oauth/token`,
      userinfo_endpoint: `${issuerUrl}/userinfo`,
      end_session_endpoint: `${issuerUrl}/v2/logout`,
    });
  }
}, { maxAge: 60 * 60 * 1000, promise: true });

// 🔒 Express session middleware met PostgreSQL opslag
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

// 🔄 Gebruiker opslaan & tokens in session stoppen
function updateUserSession(user: any, tokens: client.TokenSet) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await storage.upsertUser({
    id: claims.sub,
    email: claims.email,
    firstName: claims.given_name || claims.first_name || "",
    lastName: claims.family_name || claims.last_name || "",
    profileImageUrl: claims.picture || "",
  });
}

// 🔐 Setup auth met Auth0 via passport-openidconnect
export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const issuerUrl = process.env.AUTH0_ISSUER_URL!;
  const issuer = await memoizedIssuerDiscovery(issuerUrl);

  const oidcClient = new issuer.Client({
    client_id: process.env.AUTH0_CLIENT_ID!,
    client_secret: process.env.AUTH0_CLIENT_SECRET!,
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

  const strategy = new Strategy(
    {
      issuer: issuer.issuer,
      authorizationURL: issuer.metadata.authorization_endpoint,
      tokenURL: issuer.metadata.token_endpoint,
      userInfoURL: issuer.metadata.userinfo_endpoint,
      clientID: process.env.AUTH0_CLIENT_ID!,
      clientSecret: process.env.AUTH0_CLIENT_SECRET!,
      callbackURL: `${process.env.APP_URL}/api/callback`,
      scope: "openid email profile offline_access",
    },
    verify
  );

  passport.use("auth0", strategy);

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  // Login route
  app.get("/api/login", passport.authenticate("auth0", {
    prompt: "login consent",
    scope: ["openid", "email", "profile", "offline_access"],
  }));

  // Callback route
  app.get("/api/callback", passport.authenticate("auth0", {
    successReturnToOrRedirect: "/",
    failureRedirect: "/api/login",
  }));

  // Logout route
  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      const logoutUrl = `${issuer.metadata.end_session_endpoint}?client_id=${process.env.AUTH0_CLIENT_ID}&post_logout_redirect_uri=${process.env.APP_URL}`;
      res.redirect(logoutUrl);
    });
  });
}

// 🛡️ Middleware om routes te beveiligen
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  } else {
    res.status(401).json({ error: "Niet ingelogd" });
  }
}



