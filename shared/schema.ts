import { pgTable, text, serial, integer, boolean, timestamp, varchar, jsonb, index, uuid } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for future authentication
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table for future authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  phone: varchar("phone"),
  whatsappNumber: varchar("whatsapp_number"),
  location: varchar("location"),
  status: varchar("status").default("active"), // active, suspended, pending
  lastLoginAt: timestamp("last_login_at"),
  isAdmin: boolean("is_admin").default(false),
  // Account type and business info
  accountType: varchar("account_type").default("private"), // private, business
  companyName: varchar("company_name"),
  companyLogo: varchar("company_logo"),
  vatNumber: varchar("vat_number"),
  billingAddress: text("billing_address"),
  // Local auth fields
  password: varchar("password"), // for local registration
  isEmailVerified: boolean("is_email_verified").default(false),
  emailVerificationToken: varchar("email_verification_token"),
  emailVerificationExpires: timestamp("email_verification_expires"),
  twoFactorSecret: varchar("two_factor_secret"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  loginAttempts: integer("login_attempts").default(0),
  lockUntil: timestamp("lock_until"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Categories table
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  icon: text("icon"),
  parentId: integer("parent_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Ads table
export const ads = pgTable("ads", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: integer("price"), // Price in cents
  currency: text("currency").default("EUR"), // EUR or SRD
  categoryId: integer("category_id").references(() => categories.id),
  subcategoryId: integer("subcategory_id").references(() => categories.id),
  location: text("location").notNull(),
  phone: text("phone"),
  email: text("email"),
  images: text("images").array(), // Array of image URLs
  primaryImageIndex: integer("primary_image_index").default(0), // Index of primary image in images array
  status: text("status").default("pending"), // pending, approved, rejected
  views: integer("views").default(0),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  expiresAt: timestamp("expires_at").default(sql`NOW() + interval '60 days'`),
});

// Messages table for contact between users
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  adId: integer("ad_id").references(() => ads.id),
  senderName: varchar("sender_name", { length: 255 }).notNull(),
  senderEmail: varchar("sender_email", { length: 255 }).notNull(),
  senderPhone: varchar("sender_phone", { length: 50 }),
  subject: varchar("subject", { length: 255 }).notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const adminSettings = pgTable("admin_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 255 }).notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Chat conversations table
export const conversations = pgTable("conversations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  adId: integer("ad_id").references(() => ads.id).notNull(),
  participant1Id: varchar("participant_1_id", { length: 255 }).references(() => users.id).notNull(),
  participant2Id: varchar("participant_2_id", { length: 255 }).references(() => users.id).notNull(),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Chat messages table
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  conversationId: varchar("conversation_id", { length: 36 }).references(() => conversations.id).notNull(),
  adId: integer("ad_id").references(() => ads.id).notNull(),
  senderId: varchar("sender_id", { length: 255 }).references(() => users.id).notNull(),
  receiverId: varchar("receiver_id", { length: 255 }).references(() => users.id).notNull(),
  messageText: text("message_text").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  isReported: boolean("is_reported").default(false).notNull(),
  reportReason: text("report_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const categoriesRelations = relations(categories, ({ one, many }) => ({
  ads: many(ads),
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
  }),
  subcategories: many(categories),
}));

export const adsRelations = relations(ads, ({ one, many }) => ({
  category: one(categories, {
    fields: [ads.categoryId],
    references: [categories.id],
  }),
  user: one(users, {
    fields: [ads.userId],
    references: [users.id],
  }),
  messages: many(messages),
  favorites: many(favorites),
  bids: many(bids),
  recentlyViewed: many(recentlyViewed),
}));

export const usersRelations = relations(users, ({ many }) => ({
  ads: many(ads),
  sentMessages: many(chatMessages, { relationName: "sentMessages" }),
  receivedMessages: many(chatMessages, { relationName: "receivedMessages" }),
  conversations1: many(conversations, { relationName: "participant1" }),
  conversations2: many(conversations, { relationName: "participant2" }),
  favorites: many(favorites),
  bids: many(bids),
  recentlyViewed: many(recentlyViewed),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  ad: one(ads, {
    fields: [messages.adId],
    references: [ads.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  ad: one(ads, {
    fields: [conversations.adId],
    references: [ads.id],
  }),
  participant1: one(users, {
    fields: [conversations.participant1Id],
    references: [users.id],
    relationName: "participant1",
  }),
  participant2: one(users, {
    fields: [conversations.participant2Id],
    references: [users.id],
    relationName: "participant2",
  }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [chatMessages.conversationId],
    references: [conversations.id],
  }),
  ad: one(ads, {
    fields: [chatMessages.adId],
    references: [ads.id],
  }),
  sender: one(users, {
    fields: [chatMessages.senderId],
    references: [users.id],
    relationName: "sentMessages",
  }),
  receiver: one(users, {
    fields: [chatMessages.receiverId],
    references: [users.id],
    relationName: "receivedMessages",
  }),
}));

// Favorites table for users to save ads
export const favorites = pgTable("favorites", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  adId: integer("ad_id").references(() => ads.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Bids table for user bids on ads
export const bids = pgTable("bids", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  adId: integer("ad_id").references(() => ads.id).notNull(),
  amount: integer("amount").notNull(), // Bid amount in cents
  currency: text("currency").default("EUR"), // EUR or SRD
  message: text("message"), // Optional message with bid
  status: text("status").default("pending"), // pending, accepted, rejected, withdrawn
  createdAt: timestamp("created_at").defaultNow(),
});

// Recently viewed ads table
export const recentlyViewed = pgTable("recently_viewed", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  adId: integer("ad_id").references(() => ads.id).notNull(),
  viewedAt: timestamp("viewed_at").defaultNow(),
});

// Drafts table for saving ad drafts across devices
export const drafts = pgTable("drafts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  title: text("title"),
  description: text("description"),
  price: integer("price"), // Price in cents
  currency: text("currency").default("EUR"), // EUR or SRD
  categoryId: integer("category_id"),
  subcategoryId: integer("subcategory_id"),
  location: text("location"),
  phone: text("phone"),
  email: text("email"),
  images: text("images").array(), // Array of image URLs
  primaryImageIndex: integer("primary_image_index").default(0),
  formData: jsonb("form_data"), // Complete form data as JSON
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, {
    fields: [favorites.userId],
    references: [users.id],
  }),
  ad: one(ads, {
    fields: [favorites.adId],
    references: [ads.id],
  }),
}));

export const bidsRelations = relations(bids, ({ one }) => ({
  user: one(users, {
    fields: [bids.userId],
    references: [users.id],
  }),
  ad: one(ads, {
    fields: [bids.adId],
    references: [ads.id],
  }),
}));

export const recentlyViewedRelations = relations(recentlyViewed, ({ one }) => ({
  user: one(users, {
    fields: [recentlyViewed.userId],
    references: [users.id],
  }),
  ad: one(ads, {
    fields: [recentlyViewed.adId],
    references: [ads.id],
  }),
}));

export const draftsRelations = relations(drafts, ({ one }) => ({
  user: one(users, {
    fields: [drafts.userId],
    references: [users.id],
  }),
}));

// Analytics table for tracking user activity
export const analytics = pgTable("analytics", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id").references(() => users.id), // nullable for anonymous users
  actionType: varchar("action_type").notNull(), // search, view_ad, message_sent, etc.
  actionData: jsonb("action_data"), // JSON data like {"query": "auto", "ad_id": 12}
  ipAddress: varchar("ip_address"),
  country: varchar("country"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const analyticsRelations = relations(analytics, ({ one }) => ({
  user: one(users, {
    fields: [analytics.userId],
    references: [users.id],
  }),
}));

// Packages table for business subscription plans
export const packages = pgTable("packages", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(), // "Basis", "Premium", "Pro"
  description: text("description"),
  price: integer("price").notNull(), // price in cents (SRD or EUR)
  currency: varchar("currency").default("SRD"), // SRD, EUR
  billingInterval: varchar("billing_interval").default("monthly"), // monthly, yearly
  maxAds: integer("max_ads").default(10), // maximum ads allowed
  adDuration: integer("ad_duration").default(30), // days
  featuredAds: integer("featured_ads").default(0), // number of featured ads included
  topListings: integer("top_listings").default(0), // number of top listings included
  prioritySupport: boolean("priority_support").default(false),
  businessProfile: boolean("business_profile").default(true),
  analytics: boolean("analytics").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subscriptions table for business accounts
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  packageId: integer("package_id").references(() => packages.id).notNull(),
  status: varchar("status").default("active"), // active, paused, cancelled, expired
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  autoRenew: boolean("auto_renew").default(true),
  paymentStatus: varchar("payment_status").default("pending"), // pending, paid, failed, overdue
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  lastPaymentDate: timestamp("last_payment_date"),
  nextPaymentDate: timestamp("next_payment_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payment history table
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id),
  userId: varchar("user_id").references(() => users.id).notNull(),
  amount: integer("amount").notNull(), // amount in cents
  currency: varchar("currency").default("SRD"),
  status: varchar("status").default("pending"), // pending, completed, failed, refunded
  paymentMethod: varchar("payment_method"), // stripe, bank_transfer, cash
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  invoiceNumber: varchar("invoice_number"),
  description: text("description"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Filter definitions table for dynamic category filters
export const filterDefinitions = pgTable("filter_definitions", {
  id: serial("id").primaryKey(),
  categorySlug: varchar("category_slug").notNull(), // e.g. 'autos', 'woningen'
  field: varchar("field").notNull(), // e.g. 'bouwjaar', 'merk', 'prijs'
  label: varchar("label").notNull(), // e.g. 'Bouwjaar vanaf', 'Merk', 'Prijsklasse'
  type: varchar("type").notNull(), // 'text', 'select', 'range', 'checkbox', 'number'
  options: jsonb("options"), // for select/checkbox: ["BMW", "Toyota", "Mercedes"]
  placeholder: varchar("placeholder"), // placeholder text for inputs
  required: boolean("required").default(false),
  sortOrder: integer("sort_order").default(0), // order in sidebar
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations for new tables
export const packagesRelations = relations(packages, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  package: one(packages, {
    fields: [subscriptions.packageId],
    references: [packages.id],
  }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
  user: one(users, {
    fields: [payments.userId],
    references: [users.id],
  }),
}));

export const filterDefinitionsRelations = relations(filterDefinitions, ({ one }) => ({
  category: one(categories, {
    fields: [filterDefinitions.categorySlug],
    references: [categories.slug],
  }),
}));

// Insert schemas
export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
});

export const insertAdSchema = createInsertSchema(ads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  views: true,
  status: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  createdAt: true,
  lastMessageAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  createdAt: true,
});

export const insertFavoriteSchema = createInsertSchema(favorites).omit({
  id: true,
  createdAt: true,
});

export const insertAnalyticsSchema = createInsertSchema(analytics).omit({
  id: true,
  createdAt: true,
});

export const insertPackageSchema = createInsertSchema(packages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});

export const insertFilterDefinitionSchema = createInsertSchema(filterDefinitions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Custom form schemas
export const postAdSchema = z.object({
  title: z.string().min(1, "Titel is verplicht").max(100, "Titel mag maximaal 100 tekens zijn"),
  description: z.string().min(1, "Beschrijving is verplicht").max(1000, "Beschrijving mag maximaal 1000 tekens zijn"),
  price: z.number().optional(),
  currency: z.enum(["EUR", "SRD"]).default("EUR"),
  categoryId: z.number({ required_error: "Categorie is verplicht" }),
  location: z.string().min(1, "Locatie is verplicht"),
  phone: z.string().min(1, "Telefoonnummer is verplicht").regex(/^\+[0-9]{8,15}$/, "Voer een geldig internationaal telefoonnummer in"),
  email: z.string().email("Ongeldig e-mailadres").optional(),
  agreeToTerms: z.boolean().refine((val) => val === true, {
    message: "Je moet akkoord gaan met de voorwaarden",
  }),
});

// Types
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;

export type Ad = typeof ads.$inferSelect;
export type InsertAd = z.infer<typeof insertAdSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = typeof users.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;

export type AdminSetting = typeof adminSettings.$inferSelect;
export type InsertAdminSetting = typeof adminSettings.$inferInsert;

export type Favorite = typeof favorites.$inferSelect;
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;

export type Analytics = typeof analytics.$inferSelect;
export type InsertAnalytics = z.infer<typeof insertAnalyticsSchema>;

export type Package = typeof packages.$inferSelect;
export type InsertPackage = z.infer<typeof insertPackageSchema>;

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

export type FilterDefinition = typeof filterDefinitions.$inferSelect;
export type InsertFilterDefinition = z.infer<typeof insertFilterDefinitionSchema>;

export type PostAdFormData = z.infer<typeof postAdSchema>;