import { Express, Request, Response } from 'express';
import { z } from 'zod';
import { storage } from './storage';
import { isAuthenticated } from './replitAuth';
import { sendContactEmail } from './email';

// Chat message schema
const createMessageSchema = z.object({
  adId: z.number(),
  receiverId: z.string(),
  messageText: z.string().min(1).max(1000),
});

const reportMessageSchema = z.object({
  messageId: z.string(),
  reason: z.string().min(1).max(500),
});

export function setupChatRoutes(app: Express) {
  
  // Get user's conversations
  app.get("/api/chat/conversations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      const conversations = await storage.getUserConversations(userId);
      
      res.json({ conversations });
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Kon gesprekken niet ophalen" });
    }
  });

  // Get messages for a conversation
  app.get("/api/chat/conversations/:conversationId/messages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { conversationId } = req.params;
      const userId = req.session.userId;

      // Verify user is participant in this conversation
      const conversation = await storage.getConversation(conversationId);
      if (!conversation || (conversation.participant1Id !== userId && conversation.participant2Id !== userId)) {
        return res.status(403).json({ error: "Geen toegang tot dit gesprek" });
      }

      const messages = await storage.getConversationMessages(conversationId);
      
      // Mark messages as read for this user
      await storage.markMessagesAsRead(conversationId, userId);
      
      res.json({ messages });
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Kon berichten niet ophalen" });
    }
  });

  // Start or continue conversation
  app.post("/api/chat/conversations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const validationResult = createMessageSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Ongeldige gegevens",
          details: validationResult.error.issues
        });
      }

      const { adId, receiverId, messageText } = validationResult.data;
      const senderId = req.session.userId;

      if (senderId === receiverId) {
        return res.status(400).json({ error: "Je kunt geen bericht naar jezelf sturen" });
      }

      // Check if conversation already exists
      let conversation = await storage.getConversationByParticipants(adId, senderId, receiverId);
      
      // Create new conversation if doesn't exist
      if (!conversation) {
        conversation = await storage.createConversation({
          id: crypto.randomUUID(),
          adId,
          participant1Id: senderId,
          participant2Id: receiverId,
          isActive: true,
        });
      }

      // Create the message
      const message = await storage.createChatMessage({
        id: crypto.randomUUID(),
        conversationId: conversation.id,
        adId,
        senderId,
        receiverId,
        messageText,
        isRead: false,
        isReported: false,
      });

      res.status(201).json({ 
        message: "Bericht verzonden",
        conversationId: conversation.id,
        messageId: message.id
      });

    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).json({ error: "Kon bericht niet verzenden" });
    }
  });

  // Send message to existing conversation
  app.post("/api/chat/conversations/:conversationId/messages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { conversationId } = req.params;
      const { messageText } = req.body;
      const senderId = req.session.userId;

      if (!messageText || messageText.trim().length === 0) {
        return res.status(400).json({ error: "Bericht mag niet leeg zijn" });
      }

      if (messageText.length > 1000) {
        return res.status(400).json({ error: "Bericht is te lang (max 1000 karakters)" });
      }

      // Verify conversation exists and user is participant
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: "Gesprek niet gevonden" });
      }

      if (conversation.participant1Id !== senderId && conversation.participant2Id !== senderId) {
        return res.status(403).json({ error: "Geen toegang tot dit gesprek" });
      }

      if (!conversation.isActive) {
        return res.status(403).json({ error: "Dit gesprek is gesloten door een beheerder" });
      }

      const receiverId = conversation.participant1Id === senderId 
        ? conversation.participant2Id 
        : conversation.participant1Id;

      // Create the message
      const message = await storage.createChatMessage({
        id: crypto.randomUUID(),
        conversationId,
        adId: conversation.adId,
        senderId,
        receiverId,
        messageText: messageText.trim(),
        isRead: false,
        isReported: false,
      });

      res.status(201).json({ 
        message: "Bericht verzonden",
        messageId: message.id
      });

    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Kon bericht niet verzenden" });
    }
  });

  // Report a message
  app.post("/api/chat/messages/:messageId/report", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { messageId } = req.params;
      const validationResult = reportMessageSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Ongeldige gegevens",
          details: validationResult.error.issues
        });
      }

      const { reason } = validationResult.data;
      const userId = req.session.userId;

      // Get message to verify user can report it
      const messages = await storage.getConversationMessages("");
      // Note: This is simplified - in real implementation, get specific message first
      
      await storage.reportMessage(messageId, reason);

      // Check if email notifications are enabled
      const emailNotificationsEnabled = await storage.getAdminSetting("chat_report_notifications");
      
      if (emailNotificationsEnabled === "true") {
        try {
          // Send notification email to admin
          await sendContactEmail({
            to: "info@surodeals.com",
            adTitle: "Gerapporteerd chatbericht",
            senderName: "SuroDeals Systeem",
            senderEmail: "no-reply@surodeals.com",
            subject: "Nieuw gerapporteerd chatbericht",
            message: `Een chatbericht is gerapporteerd:\n\nReden: ${reason}\nBericht ID: ${messageId}\n\nControleer het admin dashboard voor meer details.`,
            adUrl: `${req.protocol}://${req.get('host')}/admin`,
          });
        } catch (emailError) {
          console.error("Kon rapport email niet verzenden:", emailError);
        }
      }

      res.json({ message: "Bericht gerapporteerd" });

    } catch (error) {
      console.error("Error reporting message:", error);
      res.status(500).json({ error: "Kon bericht niet rapporteren" });
    }
  });

  // Admin: Get all conversations
  app.get("/api/admin/chat/conversations", async (req: Request, res: Response) => {
    try {
      // Simple admin check - in production, use proper admin middleware
      const { password } = req.query;
      if (password !== "admin123") {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const conversations = await storage.getAllConversations();
      res.json({ conversations });
    } catch (error) {
      console.error("Error fetching admin conversations:", error);
      res.status(500).json({ error: "Kon gesprekken niet ophalen" });
    }
  });

  // Admin: Get reported messages
  app.get("/api/admin/chat/reported-messages", async (req: Request, res: Response) => {
    try {
      const { password } = req.query;
      if (password !== "admin123") {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const reportedMessages = await storage.getReportedMessages();
      res.json({ reportedMessages });
    } catch (error) {
      console.error("Error fetching reported messages:", error);
      res.status(500).json({ error: "Kon gerapporteerde berichten niet ophalen" });
    }
  });

  // Admin: Toggle conversation status
  app.patch("/api/admin/chat/conversations/:conversationId/status", async (req: Request, res: Response) => {
    try {
      const { password } = req.body;
      if (password !== "admin123") {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { conversationId } = req.params;
      const { isActive } = req.body;

      await storage.toggleConversationStatus(conversationId, isActive);
      
      res.json({ message: isActive ? "Gesprek geopend" : "Gesprek gesloten" });
    } catch (error) {
      console.error("Error toggling conversation status:", error);
      res.status(500).json({ error: "Kon gespreksstatus niet wijzigen" });
    }
  });

  // Admin: Get/Set chat settings
  app.get("/api/admin/chat/settings", async (req: Request, res: Response) => {
    try {
      const { password } = req.query;
      if (password !== "admin123") {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const chatEnabled = await storage.getAdminSetting("chat_enabled") || "true";
      const reportNotifications = await storage.getAdminSetting("chat_report_notifications") || "true";

      res.json({
        chatEnabled: chatEnabled === "true",
        reportNotifications: reportNotifications === "true",
      });
    } catch (error) {
      console.error("Error fetching chat settings:", error);
      res.status(500).json({ error: "Kon instellingen niet ophalen" });
    }
  });

  app.post("/api/admin/chat/settings", async (req: Request, res: Response) => {
    try {
      const { password, chatEnabled, reportNotifications } = req.body;
      if (password !== "admin123") {
        return res.status(401).json({ error: "Unauthorized" });
      }

      await storage.setAdminSetting("chat_enabled", chatEnabled ? "true" : "false");
      await storage.setAdminSetting("chat_report_notifications", reportNotifications ? "true" : "false");

      res.json({ message: "Instellingen opgeslagen" });
    } catch (error) {
      console.error("Error saving chat settings:", error);
      res.status(500).json({ error: "Kon instellingen niet opslaan" });
    }
  });
}