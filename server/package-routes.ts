import type { Express, Request, Response } from "express";
import { db } from "./db";
import { packages, subscriptions, payments, users } from "../shared/schema";
import { eq, and, desc, gte, lte, count, sql } from "drizzle-orm";
import { isAuthenticated } from "./replitAuth";

/**
 * Package Management Routes
 * Handles all business subscription and package related operations
 */
export function setupPackageRoutes(app: Express) {
  
  // Helper function to check admin access
  const checkAdminAccess = (req: Request, res: Response): boolean => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return false;
    }
    
    if (!(req.user as any).isAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return false;
    }
    
    if (!db) {
      res.status(500).json({ error: "Database connection error" });
      return false;
    }
    
    return true;
  };

  // Helper function to check database connection
  const checkDatabase = (res: Response): boolean => {
    if (!db) {
      res.status(500).json({ error: "Database connection error" });
      return false;
    }
    return true;
  };
  
  // === ADMIN ROUTES ===
  
  /**
   * GET /api/admin/packages
   * Get all available packages for admin management
   */
  app.get("/api/admin/packages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!checkAdminAccess(req, res)) return;

      const allPackages = await db!.select().from(packages).orderBy(packages.price);
      res.json(allPackages);
    } catch (error) {
      console.error("Error fetching packages:", error);
      res.status(500).json({ error: "Failed to fetch packages" });
    }
  });

  /**
   * GET /api/admin/users/business
   * Get all business users with their subscription details
   */
  app.get("/api/admin/users/business", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!checkAdminAccess(req, res)) return;

      const businessUsers = await db!
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          companyName: users.companyName,
          status: users.status,
          createdAt: users.createdAt,
          // Subscription details
          subscriptionId: subscriptions.id,
          packageName: packages.name,
          subscriptionStatus: subscriptions.status,
          paymentStatus: subscriptions.paymentStatus,
          nextPaymentDate: subscriptions.nextPaymentDate,
          packagePrice: packages.price,
          packageCurrency: packages.currency,
        })
        .from(users)
        .leftJoin(subscriptions, eq(users.id, subscriptions.userId))
        .leftJoin(packages, eq(subscriptions.packageId, packages.id))
        .where(eq(users.accountType, "business"))
        .orderBy(users.createdAt);

      res.json(businessUsers);
    } catch (error) {
      console.error("Error fetching business users:", error);
      res.status(500).json({ error: "Failed to fetch business users" });
    }
  });

  /**
   * GET /api/admin/subscriptions
   * Get all subscriptions with user and package details
   */
  app.get("/api/admin/subscriptions", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!checkAdminAccess(req, res)) return;

      const allSubscriptions = await db!
        .select({
          id: subscriptions.id,
          status: subscriptions.status,
          paymentStatus: subscriptions.paymentStatus,
          startDate: subscriptions.startDate,
          endDate: subscriptions.endDate,
          nextPaymentDate: subscriptions.nextPaymentDate,
          autoRenew: subscriptions.autoRenew,
          // User details
          userId: users.id,
          userEmail: users.email,
          companyName: users.companyName,
          // Package details
          packageName: packages.name,
          packagePrice: packages.price,
          packageCurrency: packages.currency,
        })
        .from(subscriptions)
        .innerJoin(users, eq(subscriptions.userId, users.id))
        .innerJoin(packages, eq(subscriptions.packageId, packages.id))
        .orderBy(desc(subscriptions.createdAt));

      res.json(allSubscriptions);
    } catch (error) {
      console.error("Error fetching subscriptions:", error);
      res.status(500).json({ error: "Failed to fetch subscriptions" });
    }
  });

  /**
   * PATCH /api/admin/subscriptions/:id/status
   * Change subscription status (activate, pause, cancel)
   */
  app.patch("/api/admin/subscriptions/:id/status", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!checkAdminAccess(req, res)) return;

      const { id } = req.params;
      const { status } = req.body;

      if (!["active", "paused", "cancelled", "expired"].includes(status)) {
        return res.status(400).json({ error: "Invalid subscription status" });
      }

      const updated = await db!
        .update(subscriptions)
        .set({ 
          status,
          updatedAt: new Date()
        })
        .where(eq(subscriptions.id, parseInt(id)))
        .returning();

      if (updated.length === 0) {
        return res.status(404).json({ error: "Subscription not found" });
      }

      res.json({ message: "Subscription status updated", subscription: updated[0] });
    } catch (error) {
      console.error("Error updating subscription status:", error);
      res.status(500).json({ error: "Failed to update subscription status" });
    }
  });

  /**
   * GET /api/admin/payments/overview
   * Get financial overview for admin dashboard
   */
  app.get("/api/admin/payments/overview", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!checkAdminAccess(req, res)) return;

      // Get monthly revenue
      const currentMonth = new Date();
      currentMonth.setDate(1);
      const nextMonth = new Date(currentMonth);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const monthlyRevenue = await db!
        .select({
          total: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
          count: count()
        })
        .from(payments)
        .where(
          and(
            eq(payments.status, "completed"),
            gte(payments.paidAt, currentMonth),
            lte(payments.paidAt, nextMonth)
          )
        );

      // Get overdue payments
      const overduePayments = await db!
        .select({ count: count() })
        .from(subscriptions)
        .where(eq(subscriptions.paymentStatus, "overdue"));

      // Get total active subscriptions
      const activeSubscriptions = await db!
        .select({ count: count() })
        .from(subscriptions)
        .where(eq(subscriptions.status, "active"));

      res.json({
        monthlyRevenue: monthlyRevenue[0]?.total || 0,
        monthlyPayments: monthlyRevenue[0]?.count || 0,
        overduePayments: overduePayments[0]?.count || 0,
        activeSubscriptions: activeSubscriptions[0]?.count || 0,
      });
    } catch (error) {
      console.error("Error fetching payment overview:", error);
      res.status(500).json({ error: "Failed to fetch payment overview" });
    }
  });

  // === BUSINESS USER ROUTES ===

  /**
   * GET /api/business/subscription
   * Get current user's subscription details
   */
  app.get("/api/business/subscription", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!checkDatabase(res)) return;

      const userSubscription = await db!
        .select({
          id: subscriptions.id,
          status: subscriptions.status,
          paymentStatus: subscriptions.paymentStatus,
          startDate: subscriptions.startDate,
          endDate: subscriptions.endDate,
          nextPaymentDate: subscriptions.nextPaymentDate,
          autoRenew: subscriptions.autoRenew,
          // Package details
          packageName: packages.name,
          packagePrice: packages.price,
          packageCurrency: packages.currency,
          maxAds: packages.maxAds,
          adDuration: packages.adDuration,
          featuredAds: packages.featuredAds,
          topListings: packages.topListings,
          prioritySupport: packages.prioritySupport,
          analytics: packages.analytics,
        })
        .from(subscriptions)
        .innerJoin(packages, eq(subscriptions.packageId, packages.id))
        .where(eq(subscriptions.userId, (req.user as any).id))
        .limit(1);

      if (userSubscription.length === 0) {
        return res.status(404).json({ error: "No active subscription found" });
      }

      res.json(userSubscription[0]);
    } catch (error) {
      console.error("Error fetching user subscription:", error);
      res.status(500).json({ error: "Failed to fetch subscription" });
    }
  });

  /**
   * GET /api/business/packages
   * Get available packages for upgrade/downgrade
   */
  app.get("/api/business/packages", async (req: Request, res: Response) => {
    try {
      if (!checkDatabase(res)) return;

      const availablePackages = await db!
        .select()
        .from(packages)
        .where(eq(packages.isActive, true))
        .orderBy(packages.price);

      res.json(availablePackages);
    } catch (error) {
      console.error("Error fetching available packages:", error);
      res.status(500).json({ error: "Failed to fetch packages" });
    }
  });

  /**
   * GET /api/business/payments/history
   * Get payment history for current business user
   */
  app.get("/api/business/payments/history", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!checkDatabase(res)) return;

      const paymentHistory = await db!
        .select({
          id: payments.id,
          amount: payments.amount,
          currency: payments.currency,
          status: payments.status,
          paymentMethod: payments.paymentMethod,
          description: payments.description,
          paidAt: payments.paidAt,
          createdAt: payments.createdAt,
        })
        .from(payments)
        .where(eq(payments.userId, (req.user as any).id))
        .orderBy(desc(payments.createdAt));

      res.json(paymentHistory);
    } catch (error) {
      console.error("Error fetching payment history:", error);
      res.status(500).json({ error: "Failed to fetch payment history" });
    }
  });

  // === PUBLIC ROUTES ===

  /**
   * GET /api/packages/public
   * Get public package information for pricing page
   */
  app.get("/api/packages/public", async (req: Request, res: Response) => {
    try {
      if (!checkDatabase(res)) return;

      const publicPackages = await db!
        .select({
          id: packages.id,
          name: packages.name,
          description: packages.description,
          price: packages.price,
          currency: packages.currency,
          billingInterval: packages.billingInterval,
          maxAds: packages.maxAds,
          adDuration: packages.adDuration,
          featuredAds: packages.featuredAds,
          topListings: packages.topListings,
          prioritySupport: packages.prioritySupport,
          businessProfile: packages.businessProfile,
          analytics: packages.analytics,
        })
        .from(packages)
        .where(eq(packages.isActive, true))
        .orderBy(packages.price);

      res.json(publicPackages);
    } catch (error) {
      console.error("Error fetching public packages:", error);
      res.status(500).json({ error: "Failed to fetch packages" });
    }
  });
}