import { Request, Response, NextFunction } from 'express';
import { storage as dbStorage } from '../storage';

// Admin authentication middleware
export const isAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Enhanced logging for debugging
    let userId: string | undefined;
    let userEmail: string | undefined;

    // Check for demo session first
    if ((req.session as any)?.demoUser) {
      const demoUser = (req.session as any).demoUser;
      userId = demoUser.id;
      userEmail = demoUser.email;
      console.log('Admin middleware - Session user:', demoUser);

      // Demo user gets automatic admin access
      if (userId === '93ec4e88-a9dd-404d-aece-407b155ea0e3' || userEmail === 'ggriedewald@gmail.com') {
        console.log('Admin middleware - Demo user granted admin access');
        return next();
      }

      // Get user from database to check admin status
      try {
        const dbUser = await dbStorage.getUser(userId);
        console.log('Admin middleware - DB user:', { 
          id: dbUser?.id, 
          email: dbUser?.email, 
          is_admin: dbUser?.isAdmin 
        });

        if (dbUser?.isAdmin) {
          return next();
        }
      } catch (dbError) {
        console.error('Admin middleware - DB error:', dbError);
      }
    }

    // Check Replit auth
    if (req.isAuthenticated?.()) {
      userId = (req.user as any)?.claims?.sub;
      console.log('Admin middleware - Replit auth user ID:', userId);

      if (userId) {
        try {
          const dbUser = await dbStorage.getUser(userId);
          if (dbUser?.isAdmin) {
            return next();
          }
        } catch (dbError) {
          console.error('Admin middleware - DB error for Replit user:', dbError);
        }
      }
    }

    // No valid admin found
    console.log('Admin middleware - Access denied for user:', userId || 'unknown');
    res.status(403).json({ 
      message: "Admin toegang vereist",
      code: "ADMIN_ACCESS_REQUIRED",
      userId: userId || null
    });
  } catch (error) {
    console.error("Admin middleware error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Admin login handler
export const adminLogin = async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

    if (password === adminPassword) {
      // Set admin session
      (req.session as any).isAdmin = true;
      res.json({ 
        success: true, 
        message: "Succesvol ingelogd als admin",
        token: adminPassword 
      });
    } else {
      res.status(401).json({ 
        success: false, 
        message: "Onjuist admin wachtwoord" 
      });
    }
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Admin logout handler
export const adminLogout = async (req: Request, res: Response) => {
  try {
    // Clear admin session
    delete (req.session as any).isAdmin;
    res.json({ 
      success: true, 
      message: "Admin uitgelogd" 
    });
  } catch (error) {
    console.error("Admin logout error:", error);
    res.status(500).json({ message: "Server error" });
  }
};