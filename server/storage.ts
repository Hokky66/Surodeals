import { 
  users, 
  categories, 
  ads,
  messages,
  conversations,
  chatMessages,
  adminSettings,
  favorites,
  bids,
  recentlyViewed,
  analytics,
  type User, 
  type InsertUser,
  type UpsertUser,
  type Category,
  type InsertCategory,
  type Ad,
  type InsertAd,
  type Message,
  type InsertMessage,
  type Conversation,
  type InsertConversation,
  type ChatMessage,
  type InsertChatMessage,
  type AdminSetting,
  type InsertAdminSetting,
  type Analytics,
  type InsertAnalytics
} from "../shared/schema";
import { db } from "./db";
import { eq, and, or, asc, gte, lte, ilike, desc, sql, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { isNull, isNotNull } from "drizzle-orm";
import type { AdFilters } from "@/lib/types";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserWithWhatsApp(id: string): Promise<User | undefined>;
  getUserAdCount(userId: string): Promise<number>;
  createUser(insertUser: InsertUser): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Local auth operations
  createLocalUser(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    emailVerificationToken?: string;
    emailVerificationExpires?: Date;
  }): Promise<User>;
  getUserByEmail(email: string): Promise<User | undefined>;
  updateUserAuth(id: string, updates: Partial<User>): Promise<User | undefined>;
  verifyEmailToken(token: string): Promise<User | undefined>;

  // Category operations
  getCategories(): Promise<Category[]>;
  getCategory(id: number): Promise<Category | undefined>;
  getCategoriesWithSubcategories(): Promise<Array<Category & { subcategories?: Category[] }>>;
  createCategory(insertCategory: InsertCategory): Promise<Category>;

  // Ad operations
  getAds(filters: AdFilters): Promise<{ ads: Ad[]; total: number }>;
  getFeaturedAds(): Promise<Ad[]>;
  getAd(id: number): Promise<Ad | undefined>;
  createAd(insertAd: InsertAd): Promise<Ad>;
  updateAdStatus(id: number, status: string): Promise<Ad | undefined>;
  updateAd(id: number, data: Partial<Ad>): Promise<Ad | undefined>;
  deleteAd(id: number): Promise<boolean>;
  incrementAdViews(id: number): Promise<void>;
  getAdStats(): Promise<any>;
  getUserAds(userId: string): Promise<Ad[]>;
  getUserAdsByEmail(email: string): Promise<Ad[]>;

  // Favorites operations
  getUserFavorites(userId: string): Promise<Ad[]>;
  addToFavorites(userId: string, adId: number): Promise<void>;
  removeFromFavorites(userId: string, adId: number): Promise<void>;
  
  // Bids operations
  getUserBids(userId: string): Promise<Array<{ id: number; amount: number; currency: string; message?: string; status: string; createdAt: Date; ad: Ad }>>;
  createBid(userId: string, adId: number, amount: number, currency: string, message?: string): Promise<void>;
  
  // Recently viewed operations
  getUserRecentlyViewed(userId: string): Promise<Ad[]>;
  addToRecentlyViewed(userId: string, adId: number): Promise<void>;

  // Message operations
  createMessage(insertMessage: InsertMessage): Promise<Message>;
  getMessagesForAd(adId: number): Promise<Message[]>;

  // Admin operations
  getAllAds(status?: string): Promise<Ad[]>;
  getPendingAdsCount(): Promise<number>;
  getAllUsers(): Promise<User[]>;
  getUsersWithStats(): Promise<Array<User & { adCount: number; lastAdDate?: string }>>;
  updateUserStatus(userId: string, status: string): Promise<User | undefined>;
  getUserStatistics(): Promise<{
    totalUsers: number;
    activeUsers: number;
    suspendedUsers: number;
    newUsersToday: number;
  }>;

  // Admin settings
  getAdminSetting(key: string): Promise<string | null>;
  setAdminSetting(key: string, value: string): Promise<void>;

  // Analytics operations
  getCategoryViewStats(): Promise<Array<{ name: string; views: number }>>;
  getDailyUserStats(): Promise<Array<{ date: string; users: number }>>;
  getAdsByStatusStats(): Promise<Array<{ status: string; count: number }>>;

  // Chat operations
  createConversation(data: InsertConversation): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversationByParticipants(adId: number, participant1Id: string, participant2Id: string): Promise<Conversation | undefined>;
  getUserConversations(userId: string): Promise<Array<Conversation & { 
    ad: Ad; 
    otherParticipant: User; 
    lastMessage?: ChatMessage;
    unreadCount: number;
  }>>;

  createChatMessage(data: InsertChatMessage): Promise<ChatMessage>;
  getConversationMessages(conversationId: string): Promise<Array<ChatMessage & { sender: User; receiver: User }>>;
  markMessagesAsRead(conversationId: string, userId: string): Promise<void>;
  reportMessage(messageId: string, reason: string): Promise<void>;

  // Admin chat operations
  getAllConversations(): Promise<Array<Conversation & { ad: Ad; participant1: User; participant2: User; messageCount: number }>>;
  getReportedMessages(): Promise<Array<ChatMessage & { sender: User; receiver: User; conversation: Conversation }>>;
  toggleConversationStatus(conversationId: string, isActive: boolean): Promise<void>;
  deleteUser(userId: string): Promise<boolean>;

  // Favorites operations
  addFavorite(userId: string, adId: number): Promise<void>;
  removeFavorite(userId: string, adId: number): Promise<void>;
  isFavorite(userId: string, adId: number): Promise<boolean>;
  getUserFavorites(userId: string): Promise<Array<Ad & { category?: Category }>>;

  // Analytics operations
  logActivity(data: InsertAnalytics): Promise<Analytics>;
  getSearchTermStats(days?: number): Promise<Array<{ term: string; count: number }>>;
  getCountryStats(days?: number): Promise<Array<{ country: string; count: number }>>;
  getActivityStats(days?: number): Promise<Array<{ date: string; count: number }>>;
  getActionTypeStats(days?: number): Promise<Array<{ actionType: string; count: number }>>;
  getTopUserActivities(limit?: number, days?: number): Promise<Array<Analytics & { user?: User }>>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserWithWhatsApp(id: string): Promise<User | undefined> {
    const [user] = await db
      .select({
        id: users.id,
        whatsappNumber: users.whatsappNumber,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(eq(users.id, id));
    return user as User | undefined;
  }

  async getUserAdCount(userId: string): Promise<number> {
    // First get user email from userId
    const user = await this.getUser(userId);
    if (!user?.email) return 0;
    
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(ads)
      .where(eq(ads.email, user.email));
    return result[0]?.count || 0;
  }

  async getUserAds(userId: string): Promise<Ad[]> {
    return await db
      .select()
      .from(ads)
      .where(eq(ads.userId, userId))
      .orderBy(desc(ads.createdAt));
  }

  async getUserAdsByEmail(email: string): Promise<Ad[]> {
    console.log('🔍 DEBUG: Looking for ads with email:', email);
    const userAds = await db
      .select()
      .from(ads)
      .where(eq(ads.email, email))
      .orderBy(desc(ads.createdAt));
    console.log('🔍 DEBUG: Found', userAds.length, 'ads for email:', email);
    return userAds;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Local auth methods
  async createLocalUser(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    location?: string;
    emailVerificationToken?: string;
    emailVerificationExpires?: Date;
  }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        ...userData,
      })
      .returning();
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async updateUserAuth(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async verifyEmailToken(token: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.emailVerificationToken, token),
          gte(users.emailVerificationExpires, new Date())
        )
      );
    return user;
  }

  // Category operations
  async getCategories(): Promise<Category[]> {
    return await db
      .select()
      .from(categories)
      .orderBy(categories.name);
  }

  async getCategory(id: number): Promise<Category | undefined> {
    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, id));
    return category;
  }

  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const [category] = await db
      .insert(categories)
      .values(insertCategory)
      .returning();
    return category;
  }

  async getCategoriesWithSubcategories(): Promise<Array<Category & { subcategories?: Category[] }>> {
    // Get all categories
    const allCategories = await db
      .select()
      .from(categories)
      .orderBy(categories.name);

    // Separate main categories and subcategories
    const mainCategories = allCategories.filter(cat => !cat.parentId);
    const subcategoriesMap = new Map<number, Category[]>();

    // Group subcategories by parent ID
    allCategories
      .filter(cat => cat.parentId)
      .forEach(subcat => {
        if (!subcategoriesMap.has(subcat.parentId!)) {
          subcategoriesMap.set(subcat.parentId!, []);
        }
        subcategoriesMap.get(subcat.parentId!)!.push(subcat);
      });

    // Attach subcategories to main categories
    return mainCategories.map(mainCat => ({
      ...mainCat,
      subcategories: subcategoriesMap.get(mainCat.id) || []
    }));
  }

  // Ad operations
  async getAds(filters: AdFilters): Promise<{ ads: Ad[]; total: number }> {
    const conditions = [eq(ads.status, "approved")]; // Only show approved ads by default

    if (filters.categoryId) {
      conditions.push(eq(ads.categoryId, filters.categoryId));
    }

    if (filters.categoryIds && filters.categoryIds.length > 0) {
      conditions.push(inArray(ads.categoryId, filters.categoryIds));
    }

    // Filter by category slug if provided
    if (filters.category) {
      // Join with categories table to filter by slug
      const categoryResult = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, filters.category))
        .limit(1);
      
      if (categoryResult.length > 0) {
        conditions.push(eq(ads.categoryId, categoryResult[0].id));
      } else {
        // If category slug doesn't exist, return empty results
        return { ads: [], total: 0 };
      }
    }

    if (filters.location) {
      conditions.push(eq(ads.location, filters.location));
    }

    if (filters.minPrice) {
      conditions.push(gte(ads.price, filters.minPrice * 100)); // Convert to cents
    }

    if (filters.maxPrice) {
      conditions.push(lte(ads.price, filters.maxPrice * 100)); // Convert to cents
    }

    if (filters.search) {
      console.log('🔍 DEBUG: Search filter applied:', filters.search);
      // Search in both title and description
      conditions.push(
        or(
          ilike(ads.title, `%${filters.search}%`),
          ilike(ads.description, `%${filters.search}%`)
        )
      );
    }

    // Apply dynamic filters from filter definitions
    if (filters.dynamicFilters && Object.keys(filters.dynamicFilters).length > 0) {
      console.log('🔍 DEBUG: Applying dynamic filters:', filters.dynamicFilters);
      for (const [field, value] of Object.entries(filters.dynamicFilters)) {
        if (value && value !== '' && value !== 'alle') {
          console.log(`🔍 DEBUG: Processing filter ${field}:`, value);
          
          // Handle specific filter types
          if (field === 'location') {
            conditions.push(eq(ads.location, value as string));
            console.log(`🔍 DEBUG: Added location filter: ${value}`);
          } else if (field === 'prijs_min' || field === 'price_min') {
            const minPrice = parseInt(value as string) * 100; // Convert euros to cents
            conditions.push(gte(ads.price, minPrice));
            console.log(`🔍 DEBUG: Added price_min filter: €${value} (${minPrice} cents)`);
          } else if (field === 'prijs_max' || field === 'price_max') {
            const maxPrice = parseInt(value as string) * 100; // Convert euros to cents
            conditions.push(lte(ads.price, maxPrice));
            console.log(`🔍 DEBUG: Added price_max filter: €${value} (${maxPrice} cents)`);
          } else if (field === 'bouwjaar_min') {
            // Handle year range filters for cars
            conditions.push(
              or(
                ilike(ads.description, `%${value}%`),
                ilike(ads.title, `%${value}%`)
              )
            );
            console.log(`🔍 DEBUG: Added year min filter: ${value}`);
          } else if (field === 'bouwjaar_max') {
            // Handle year range filters for cars
            conditions.push(
              or(
                ilike(ads.description, `%${value}%`),
                ilike(ads.title, `%${value}%`)
              )
            );
            console.log(`🔍 DEBUG: Added year max filter: ${value}`);
          } else if (field === 'slaapkamers') {
            // Handle bedrooms filter
            conditions.push(
              or(
                ilike(ads.description, `%${value} slaapkamer%`),
                ilike(ads.title, `%${value} slaapkamer%`),
                ilike(ads.description, `%${value}sk%`),
                ilike(ads.title, `%${value}sk%`)
              )
            );
            console.log(`🔍 DEBUG: Added slaapkamers filter: ${value}`);
          } else {
            // For other filters (merk, brandstof, transmissie, etc.), search in content
            if (Array.isArray(value)) {
              // Handle multi-select filters
              const orConditions = value.map((v: string) => 
                or(
                  ilike(ads.description, `%${v}%`),
                  ilike(ads.title, `%${v}%`)
                )
              );
              if (orConditions.length > 0) {
                conditions.push(or(...orConditions));
                console.log(`🔍 DEBUG: Added array filter for ${field} with ${orConditions.length} conditions`);
              }
            } else {
              // Handle single value filters - search in both title and description
              conditions.push(
                or(
                  ilike(ads.description, `%${value}%`),
                  ilike(ads.title, `%${value}%`)
                )
              );
              console.log(`🔍 DEBUG: Added content search filter for ${field}: ${value}`);
            }
          }
        }
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ads)
      .where(whereClause);

    // Get ads with pagination
    const adResults = await db
      .select()
      .from(ads)
      .where(whereClause)
      .orderBy(desc(ads.createdAt))
      .limit(filters.limit || 20)
      .offset(filters.offset || 0);

    return {
      ads: adResults,
      total: count
    };
  }

  async getAd(id: number): Promise<Ad | undefined> {
    const [result] = await db
      .select({
        id: ads.id,
        title: ads.title,
        description: ads.description,
        price: ads.price,
        currency: ads.currency,
        categoryId: ads.categoryId,
        subcategoryId: ads.subcategoryId,
        location: ads.location,
        phone: ads.phone,
        email: ads.email,
        images: ads.images,
        primaryImageIndex: ads.primaryImageIndex,
        status: ads.status,
        views: ads.views,
        userId: ads.userId,
        createdAt: ads.createdAt,
        updatedAt: ads.updatedAt,
        category: categories.name
      })
      .from(ads)
      .leftJoin(categories, eq(ads.categoryId, categories.id))
      .where(eq(ads.id, id));
    
    return result;
  }

  async createAd(insertAd: InsertAd): Promise<Ad> {
    const [ad] = await db
      .insert(ads)
      .values(insertAd)
      .returning();
    return ad;
  }

  async updateAdStatus(id: number, status: string): Promise<Ad | undefined> {
    const [ad] = await db
      .update(ads)
      .set({ status, updatedAt: new Date() })
      .where(eq(ads.id, id))
      .returning();
    return ad;
  }

  async getFeaturedAds(): Promise<Ad[]> {
    // Get top 20 approved ads with highest views or newest
    const featuredAds = await db
      .select()
      .from(ads)
      .where(eq(ads.status, 'approved'))
      .orderBy(desc(ads.views), desc(ads.createdAt))
      .limit(20);
    
    return featuredAds;
  }

  async updateAd(id: number, data: Partial<Ad>): Promise<Ad | undefined> {
    const [ad] = await db
      .update(ads)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(ads.id, id))
      .returning();
    return ad;
  }

  async deleteAd(id: number): Promise<boolean> {
    const result = await db.delete(ads).where(eq(ads.id, id));
    return (result.rowCount || 0) > 0;
  }

  async incrementAdViews(id: number): Promise<void> {
    await db
      .update(ads)
      .set({ views: sql`${ads.views} + 1` })
      .where(eq(ads.id, id));
  }

  async getAdStats(): Promise<any> {
    // Get category counts (hardcoded for now based on category IDs)
    const [stats] = await db
      .select({
        total: sql<number>`count(*)`,
        autos: sql<number>`count(*) filter (where category_id = 1)`,
        houses: sql<number>`count(*) filter (where category_id = 2)`,
        electronics: sql<number>`count(*) filter (where category_id = 3)`,
        services: sql<number>`count(*) filter (where category_id = 4)`
      })
      .from(ads)
      .where(eq(ads.status, "approved"));

    return stats;
  }

  // Message operations
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db
      .insert(messages)
      .values(insertMessage)
      .returning();
    return message;
  }

  async getMessagesForAd(adId: number): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.adId, adId))
      .orderBy(desc(messages.createdAt));
  }

  // Admin operations
  async getAllAds(status?: string): Promise<Ad[]> {
    if (!db) {
      console.error("Database connection is null in getAllAds");
      return [];
    }

    if (status) {
      return await db
        .select()
        .from(ads)
        .where(eq(ads.status, status))
        .orderBy(desc(ads.createdAt));
    }

    return await db
      .select()
      .from(ads)
      .orderBy(desc(ads.createdAt));
  }

  async getPendingAdsCount(): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ads)
      .where(eq(ads.status, "pending"));

    return result?.count || 0;
  }

  async getAllUsers(): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt));
  }

  async getUsersWithStats(): Promise<Array<User & { adCount: number; lastAdDate?: string }>> {
    const usersWithStats = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        location: users.location,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        profileImageUrl: users.profileImageUrl,
        adCount: sql<number>`count(${ads.id})::int`,
        lastAdDate: sql<string>`max(${ads.createdAt})`,
      })
      .from(users)
      .leftJoin(ads, eq(users.id, ads.userId))
      .groupBy(users.id)
      .orderBy(desc(users.createdAt));

    return usersWithStats;
  }

  async updateUserStatus(userId: string, status: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ 
        status,
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId))
      .returning();

    return user;
  }

  async deleteUser(userId: string): Promise<boolean> {
    try {
      // First, delete all ads by this user
      await db.delete(ads).where(eq(ads.userId, userId));

      // Then delete the user
      const result = await db
        .delete(users)
        .where(eq(users.id, userId))
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error("Error deleting user:", error);
      return false;
    }
  }

  async getUserStatistics(): Promise<{
    totalUsers: number;
    activeUsers: number;
    suspendedUsers: number;
    newUsersToday: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [stats] = await db
      .select({
        totalUsers: sql<number>`count(*)::int`,
        activeUsers: sql<number>`count(*) filter (where status = 'active')::int`,
        suspendedUsers: sql<number>`count(*) filter (where status = 'suspended')::int`,
        newUsersToday: sql<number>`count(*) filter (where created_at >= ${today.toISOString()})::int`,
      })
      .from(users);

    return stats;
  }

  // Admin settings
  async getAdminSetting(key: string): Promise<string | null> {
    const [setting] = await db
      .select()
      .from(adminSettings)
      .where(eq(adminSettings.key, key));

    return setting?.value || null;
  }

  async setAdminSetting(key: string, value: string): Promise<void> {
    await db
      .insert(adminSettings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: adminSettings.key,
        set: { value, updatedAt: new Date() },
      });
  }

  // Analytics operations
  async getCategoryViewStats(): Promise<Array<{ name: string; views: number }>> {
    const result = await db
      .select({
        name: categories.name,
        views: sql<number>`coalesce(sum(${ads.views}), 0)::int`,
      })
      .from(categories)
      .leftJoin(ads, eq(categories.id, ads.categoryId))
      .where(isNull(categories.parentId)) // Only main categories
      .groupBy(categories.id, categories.name)
      .orderBy(sql`coalesce(sum(${ads.views}), 0) desc`)
      .limit(6);

    return result;
  }

  async getDailyUserStats(): Promise<Array<{ date: string; users: number }>> {
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const result = await db
      .select({
        date: sql<string>`DATE(created_at)`,
        users: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(gte(users.createdAt, sevenDaysAgo))
      .groupBy(sql`DATE(created_at)`)
      .orderBy(sql`DATE(created_at)`);

    // Fill in missing dates with 0 users
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const found = result.find(r => r.date === dateStr);
      dates.push({
        date: dateStr,
        users: found ? found.users : 0
      });
    }

    return dates;
  }

  async getAdsByStatusStats(): Promise<Array<{ status: string; count: number }>> {
    const result = await db
      .select({
        status: ads.status,
        count: sql<number>`count(*)::int`,
      })
      .from(ads)
      .where(isNotNull(ads.status))
      .groupBy(ads.status);

    return result.map(r => ({
      status: r.status || 'pending',
      count: r.count
    }));
  }

  // Chat operations
  async createConversation(data: InsertConversation): Promise<Conversation> {
    const id = crypto.randomUUID();
    const [conversation] = await db
      .insert(conversations)
      .values({ ...data, id })
      .returning();
    return conversation;
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    return conversation;
  }

  async getConversationByParticipants(
    adId: number, 
    participant1Id: string, 
    participant2Id: string
  ): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.adId, adId),
          or(
            and(
              eq(conversations.participant1Id, participant1Id),
              eq(conversations.participant2Id, participant2Id)
            ),
            and(
              eq(conversations.participant1Id, participant2Id),
              eq(conversations.participant2Id, participant1Id)
            )
          )
        )
      );
    return conversation;
  }

  async getUserConversations(userId: string): Promise<Array<Conversation & { 
    ad: Ad; 
    otherParticipant: User; 
    lastMessage?: ChatMessage;
    unreadCount: number;
  }>> {
    const result = await db
      .select({
        conversation: conversations,
        ad: ads,
        participant1: users,
        participant2: {
          id: sql<string>`p2.id`,
          email: sql<string>`p2.email`,
          firstName: sql<string>`p2.first_name`,
          lastName: sql<string>`p2.last_name`,
          profileImageUrl: sql<string>`p2.profile_image_url`,
        },
      })
      .from(conversations)
      .innerJoin(ads, eq(conversations.adId, ads.id))
      .innerJoin(users, eq(conversations.participant1Id, users.id))
      .innerJoin(
        alias(users, 'p2'), 
        eq(conversations.participant2Id, sql`p2.id`)
      )
      .where(
        or(
          eq(conversations.participant1Id, userId),
          eq(conversations.participant2Id, userId)
        )
      )
      .orderBy(desc(conversations.lastMessageAt));

    const conversationsWithDetails = await Promise.all(
      result.map(async (row) => {
        const otherParticipant = row.conversation.participant1Id === userId 
          ? row.participant2 
          : row.participant1;

        // Get last message
        const [lastMessage] = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.conversationId, row.conversation.id))
          .orderBy(desc(chatMessages.createdAt))
          .limit(1);

        // Get unread count
        const [unreadResult] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(chatMessages)
          .where(
            and(
              eq(chatMessages.conversationId, row.conversation.id),
              eq(chatMessages.receiverId, userId),
              eq(chatMessages.isRead, false)
            )
          );

        return {
          ...row.conversation,
          ad: row.ad,
          otherParticipant,
          lastMessage,
          unreadCount: unreadResult?.count || 0,
        };
      })
    );

    return conversationsWithDetails;
  }

  async createChatMessage(data: InsertChatMessage): Promise<ChatMessage> {
    const id = crypto.randomUUID();
    const [message] = await db
      .insert(chatMessages)
      .values({ ...data, id })
      .returning();

    // Update conversation last message time
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, data.conversationId));

    return message;
  }

  async getConversationMessages(conversationId: string): Promise<Array<ChatMessage & { sender: User; receiver: User }>> {
    const result = await db
      .select({
        message: chatMessages,
        sender: {
          id: sql<string>`sender.id`,
          email: sql<string>`sender.email`,
          firstName: sql<string>`sender.first_name`,
          lastName: sql<string>`sender.last_name`,
          profileImageUrl: sql<string>`sender.profile_image_url`,
        },
        receiver: {
          id: sql<string>`receiver.id`,
          email: sql<string>`receiver.email`,
          firstName: sql<string>`receiver.first_name`,
          lastName: sql<string>`receiver.last_name`,
          profileImageUrl: sql<string>`receiver.profile_image_url`,
        },
      })
      .from(chatMessages)
      .innerJoin(
        alias(users, 'sender'),
        eq(chatMessages.senderId, sql`sender.id`)
      )
      .innerJoin(
        alias(users, 'receiver'),
        eq(chatMessages.receiverId, sql`receiver.id`)
      )
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(asc(chatMessages.createdAt));

    return result.map(row => ({
      ...row.message,
      sender: row.sender,
      receiver: row.receiver,
    }));
  }

  async markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
    await db
      .update(chatMessages)
      .set({ isRead: true })
      .where(
        and(
          eq(chatMessages.conversationId, conversationId),
          eq(chatMessages.receiverId, userId),
          eq(chatMessages.isRead, false)
        )
      );
  }

  async reportMessage(messageId: string, reason: string): Promise<void> {
    await db
      .update(chatMessages)
      .set({ 
        isReported: true, 
        reportReason: reason 
      })
      .where(eq(chatMessages.id, messageId));
  }

  // Admin chat operations
  async getAllConversations(): Promise<Array<Conversation & { ad: Ad; participant1: User; participant2: User; messageCount: number }>> {
    const result = await db
      .select({
        conversation: conversations,
        ad: ads,
        participant1: {
          id: sql<string>`p1.id`,
          email: sql<string>`p1.email`,
          firstName: sql<string>`p1.first_name`,
          lastName: sql<string>`p1.last_name`,
        },
        participant2: {
          id: sql<string>`p2.id`,
          email: sql<string>`p2.email`,
          firstName: sql<string>`p2.first_name`,
          lastName: sql<string>`p2.last_name`,
        },
        messageCount: sql<number>`count(cm.id)::int`,
      })
      .from(conversations)
      .innerJoin(ads, eq(conversations.adId, ads.id))
      .innerJoin(
        alias(users, 'p1'),
        eq(conversations.participant1Id, sql`p1.id`)
      )
      .innerJoin(
        alias(users, 'p2'),
        eq(conversations.participant2Id, sql`p2.id`)
      )
      .leftJoin(
        alias(chatMessages, 'cm'),
        eq(conversations.id, sql`cm.conversation_id`)
      )
      .groupBy(
        conversations.id,
        ads.id,
        sql`p1.id`,
        sql`p1.email`,
        sql`p1.first_name`,
        sql`p1.last_name`,
        sql`p2.id`,
        sql`p2.email`,
        sql`p2.first_name`,
        sql`p2.last_name`
      )
      .orderBy(desc(conversations.lastMessageAt));

    return result.map(row => ({
      ...row.conversation,
      ad: row.ad,
      participant1: row.participant1,
      participant2: row.participant2,
      messageCount: row.messageCount,
    }));
  }

  async getReportedMessages(): Promise<Array<ChatMessage & { sender: User; receiver: User; conversation: Conversation }>> {
    const result = await db
      .select({
        message: chatMessages,
        sender: {
          id: sql<string>`sender.id`,
          email: sql<string>`sender.email`,
          firstName: sql<string>`sender.first_name`,
          lastName: sql<string>`sender.last_name`,
        },
        receiver: {
          id: sql<string>`receiver.id`,
          email: sql<string>`receiver.email`,
          firstName: sql<string>`receiver.first_name`,
          lastName: sql<string>`receiver.last_name`,
        },
        conversation: conversations,
      })
      .from(chatMessages)
      .innerJoin(conversations, eq(chatMessages.conversationId, conversations.id))
      .innerJoin(
        alias(users, 'sender'),
        eq(chatMessages.senderId, sql`sender.id`)
      )
      .innerJoin(
        alias(users, 'receiver'),
        eq(chatMessages.receiverId, sql`receiver.id`)
      )
      .where(eq(chatMessages.isReported, true))
      .orderBy(desc(chatMessages.createdAt));

    return result.map(row => ({
      ...row.message,
      sender: row.sender,
      receiver: row.receiver,
      conversation: row.conversation,
    }));
  }

  async toggleConversationStatus(conversationId: string, isActive: boolean): Promise<void> {
    await db
      .update(conversations)
      .set({ isActive })
      .where(eq(conversations.id, conversationId));
  }

  // Favorites operations
  async addFavorite(userId: string, adId: number): Promise<void> {
    await db.insert(favorites).values({
      userId,
      adId,
    });
  }

  async removeFavorite(userId: string, adId: number): Promise<void> {
    await db
      .delete(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.adId, adId)));
  }

  async isFavorite(userId: string, adId: number): Promise<boolean> {
    const [favorite] = await db
      .select()
      .from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.adId, adId)));
    
    return !!favorite;
  }

  async getUserFavorites(userId: string): Promise<Array<Ad & { category?: Category }>> {
    const result = await db
      .select({
        ad: ads,
        category: categories,
      })
      .from(favorites)
      .innerJoin(ads, eq(favorites.adId, ads.id))
      .leftJoin(categories, eq(ads.categoryId, categories.id))
      .where(eq(favorites.userId, userId))
      .orderBy(desc(favorites.createdAt));

    return result.map(row => ({
      ...row.ad,
      category: row.category || undefined,
    }));
  }

  // Analytics operations
  async logActivity(data: InsertAnalytics): Promise<Analytics> {
    const [activity] = await db.insert(analytics).values(data).returning();
    return activity;
  }

  async getSearchTermStats(days: number = 30): Promise<Array<{ term: string; count: number }>> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);

    const result = await db
      .select({
        term: sql<string>`COALESCE(action_data->>'searchQuery', action_data->>'query')`,
        count: sql<number>`count(*)::int`,
      })
      .from(analytics)
      .where(
        and(
          eq(analytics.actionType, 'search'),
          gte(analytics.createdAt, dateThreshold),
          sql`(action_data->>'searchQuery' IS NOT NULL OR action_data->>'query' IS NOT NULL)`
        )
      )
      .groupBy(sql`COALESCE(action_data->>'searchQuery', action_data->>'query')`)
      .orderBy(desc(sql`count(*)`))
      .limit(20);

    return result.filter(row => row.term && row.term.trim().length > 0).map(row => ({
      term: row.term || '',
      count: row.count || 0,
    }));
  }

  async getCountryStats(days: number = 30): Promise<Array<{ country: string; count: number }>> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);

    const result = await db
      .select({
        country: analytics.country,
        count: sql<number>`count(*)::int`,
      })
      .from(analytics)
      .where(
        and(
          gte(analytics.createdAt, dateThreshold),
          isNotNull(analytics.country)
        )
      )
      .groupBy(analytics.country)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    return result.map(row => ({
      country: row.country || 'Unknown',
      count: row.count || 0,
    }));
  }

  async getActivityStats(days: number = 30): Promise<Array<{ date: string; count: number }>> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);

    const result = await db
      .select({
        date: sql<string>`DATE(created_at)`,
        count: sql<number>`count(*)::int`,
      })
      .from(analytics)
      .where(gte(analytics.createdAt, dateThreshold))
      .groupBy(sql`DATE(created_at)`)
      .orderBy(asc(sql`DATE(created_at)`));

    return result.map(row => ({
      date: row.date || '',
      count: row.count || 0,
    }));
  }

  async getActionTypeStats(days: number = 30): Promise<Array<{ actionType: string; count: number }>> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);

    const result = await db
      .select({
        actionType: analytics.actionType,
        count: sql<number>`count(*)::int`,
      })
      .from(analytics)
      .where(gte(analytics.createdAt, dateThreshold))
      .groupBy(analytics.actionType)
      .orderBy(desc(sql`count(*)`));

    return result.map(row => ({
      actionType: row.actionType || '',
      count: row.count || 0,
    }));
  }

  async getTopUserActivities(limit: number = 100, days: number = 30): Promise<Array<Analytics & { user?: User }>> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);
    
    const result = await db
      .select({
        analytics: analytics,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        },
      })
      .from(analytics)
      .leftJoin(users, eq(analytics.userId, users.id))
      .where(gte(analytics.createdAt, dateThreshold))
      .orderBy(desc(analytics.createdAt))
      .limit(limit);

    return result.map(row => ({
      ...row.analytics,
      user: row.user ? {
        ...row.user,
        profileImageUrl: null,
        phone: null,
        whatsappNumber: null,
        location: null,
        status: null,
        lastLoginAt: null,
        isAdmin: false,
        password: null,
        isEmailVerified: false,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        twoFactorSecret: null,
        twoFactorEnabled: false,
        loginAttempts: 0,
        lockUntil: null,
        createdAt: null,
        updatedAt: null,
      } : undefined,
    }));
  }

  // Favorites operations
  async getUserFavoritesDetailed(userId: string): Promise<Ad[]> {
    const result = await db
      .select({
        ad: ads,
      })
      .from(favorites)
      .innerJoin(ads, eq(favorites.adId, ads.id))
      .where(eq(favorites.userId, userId))
      .orderBy(desc(favorites.createdAt));

    return result.map(row => row.ad);
  }

  async addToFavorites(userId: string, adId: number): Promise<void> {
    await db.insert(favorites).values({ userId, adId });
  }

  async removeFromFavorites(userId: string, adId: number): Promise<void> {
    await db.delete(favorites).where(
      and(eq(favorites.userId, userId), eq(favorites.adId, adId))
    );
  }

  // Bids operations
  async getUserBids(userId: string): Promise<Array<{ id: number; amount: number; currency: string; message?: string; status: string; createdAt: Date; ad: Ad }>> {
    try {
      const result = await db
        .select({
          bid: bids,
          ad: ads,
        })
        .from(bids)
        .innerJoin(ads, eq(bids.adId, ads.id))
        .where(eq(bids.userId, userId))
        .orderBy(desc(bids.createdAt));

      return result.map(row => ({
        id: row.bid.id,
        amount: row.bid.amount,
        currency: row.bid.currency,
        message: row.bid.message || undefined,
        status: row.bid.status,
        createdAt: row.bid.createdAt,
        ad: row.ad
      }));
    } catch (error) {
      console.error('Error fetching user bids:', error);
      return [];
    }
  }

  async createBid(userId: string, adId: number, amount: number, currency: string, message?: string): Promise<void> {
    try {
      await db.insert(bids).values({
        userId,
        adId,
        amount,
        currency,
        message,
        status: 'pending'
      });
    } catch (error) {
      console.error('Error creating bid:', error);
      throw error;
    }
  }

  // Recently viewed operations
  async getUserRecentlyViewed(userId: string): Promise<Ad[]> {
    try {
      const result = await db
        .select({
          ad: ads,
        })
        .from(recentlyViewed)
        .innerJoin(ads, eq(recentlyViewed.adId, ads.id))
        .where(eq(recentlyViewed.userId, userId))
        .orderBy(desc(recentlyViewed.viewedAt))
        .limit(20);

      return result.map(row => row.ad);
    } catch (error) {
      console.error('Error fetching recently viewed ads:', error);
      return [];
    }
  }

  async addToRecentlyViewed(userId: string, adId: number): Promise<void> {
    try {
      // First, check if this combination already exists
      const existing = await db
        .select()
        .from(recentlyViewed)
        .where(and(eq(recentlyViewed.userId, userId), eq(recentlyViewed.adId, adId)))
        .limit(1);

      if (existing.length > 0) {
        // Update the viewed time
        await db
          .update(recentlyViewed)
          .set({ viewedAt: new Date() })
          .where(and(eq(recentlyViewed.userId, userId), eq(recentlyViewed.adId, adId)));
      } else {
        // Insert new record
        await db.insert(recentlyViewed).values({ userId, adId });
      }

      // Keep only the most recent 50 entries per user
      const allUserViews = await db
        .select({ id: recentlyViewed.id })
        .from(recentlyViewed)
        .where(eq(recentlyViewed.userId, userId))
        .orderBy(desc(recentlyViewed.viewedAt));

      if (allUserViews.length > 50) {
        const idsToDelete = allUserViews.slice(50).map(v => v.id);
        await db.delete(recentlyViewed).where(
          and(
            eq(recentlyViewed.userId, userId),
            sql`id IN (${idsToDelete.join(',')})`
          )
        );
      }
    } catch (error) {
      console.error('Error adding to recently viewed:', error);
    }
  }
}

export const storage = new DatabaseStorage();