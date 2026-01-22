import cron from "node-cron";
import SubscriptionModel from "../Models/SubscriptionModel";
import User from "../Models/UserModel";
import { invoiceService } from "../Services/InvoiceService";

/**
 * Check for expired subscriptions and update their status
 * Runs daily at 00:00 UTC
 */
export const checkExpiredSubscriptions = async () => {
  try {
    console.log(
      "[Subscription Cron] Checking for expired subscriptions at",
      new Date()
    );

    // Find all active subscriptions where endDate is past
    const expiredSubscriptions = await SubscriptionModel.find({
      status: "active",
      endDate: { $lt: new Date() },
    });

    if (expiredSubscriptions.length === 0) {
      console.log("[Subscription Cron] No expired subscriptions found");
      return { count: 0 };
    }

    // Update each expired subscription
    for (const subscription of expiredSubscriptions) {
      subscription.status = "expired";
      await subscription.save();

      // Update user
      await User.findByIdAndUpdate(subscription.userId, {
        hasActiveSubscription: false,
        currentSubscriptionId: null,
      });

      console.log(
        `[Subscription Cron] Expired subscription for user ${subscription.userId}`
      );
    }

    console.log(
      `[Subscription Cron] Processed ${expiredSubscriptions.length} expired subscriptions`
    );

    return { count: expiredSubscriptions.length };
  } catch (error) {
    console.error("[Subscription Cron] Error checking expired subscriptions:", error);
    return { count: 0, error };
  }
};

/**
 * Send expiry reminder emails to users with subscriptions expiring soon
 * Runs daily at 08:00 UTC
 */
export const sendExpiryReminders = async () => {
  try {
    console.log(
      "[Subscription Cron] Checking for subscriptions expiring soon at",
      new Date()
    );

    // Find subscriptions expiring in 7 days
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const expiringSubscriptions = await SubscriptionModel.find({
      status: "active",
      endDate: {
        $gte: now,
        $lte: sevenDaysFromNow,
      },
    })
      .populate("userId", "email name username")
      .populate("planId");

    if (expiringSubscriptions.length === 0) {
      console.log(
        "[Subscription Cron] No subscriptions expiring soon found"
      );
      return { count: 0 };
    }

    // Send expiry reminder emails
    for (const subscription of expiringSubscriptions) {
      const daysRemaining = Math.ceil(
        (subscription.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      try {
        const userId = (subscription.userId as any)._id || subscription.userId;
        const userEmail = (subscription.userId as any).email;
        const userName = (subscription.userId as any).username || (subscription.userId as any).name || "User";

        const reminderDetails = {
          invoiceId: `REM-${Date.now()}-${userId.toString().slice(-6).toUpperCase()}`,
          userName: userName,
          userEmail: userEmail || "noreply@lynkup.com",
          subscriptionId: (subscription._id as any).toString(),
          planName: (subscription as any).planName || "Premium Plan",
          tier: subscription.tier,
          amount: subscription.amount,
          currency: subscription.currency || "INR",
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          duration: subscription.duration,
          discount: 0,
          features: [],
          company: "Lynkup",
        };

        await invoiceService.sendExpiryReminder(reminderDetails);

        console.log(
          `[Subscription Cron] Expiry reminder sent for user ${userId}`
        );
      } catch (error: any) {
        console.error(
          `[Subscription Cron] Failed to send expiry reminder:`,
          error.message
        );
      }
    }

    console.log(
      `[Subscription Cron] Processed ${expiringSubscriptions.length} expiry reminders`
    );

    return { count: expiringSubscriptions.length };
  } catch (error) {
    console.error("[Subscription Cron] Error sending expiry reminders:", error);
    return { count: 0, error };
  }
};

/**
 * Clean up pending subscriptions that haven't been completed in 24 hours
 * Runs daily at 12:00 UTC
 */
export const cleanupPendingSubscriptions = async () => {
  try {
    console.log(
      "[Subscription Cron] Cleaning up pending subscriptions at",
      new Date()
    );

    // Find pending subscriptions older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const pendingSubscriptions = await SubscriptionModel.find({
      status: "pending",
      paymentStatus: "pending",
      createdAt: { $lt: oneDayAgo },
    });

    if (pendingSubscriptions.length === 0) {
      console.log(
        "[Subscription Cron] No old pending subscriptions found"
      );
      return { count: 0 };
    }

    // Mark them as cancelled
    for (const subscription of pendingSubscriptions) {
      subscription.status = "cancelled";
      subscription.cancellationReason = "Automatic cleanup - payment not completed within 24 hours";
      subscription.cancellationDate = new Date();
      await subscription.save();

      console.log(
        `[Subscription Cron] Cleaned up pending subscription ${subscription._id}`
      );
    }

    console.log(
      `[Subscription Cron] Cleaned up ${pendingSubscriptions.length} pending subscriptions`
    );

    return { count: pendingSubscriptions.length };
  } catch (error) {
    console.error("[Subscription Cron] Error cleaning up pending subscriptions:", error);
    return { count: 0, error };
  }
};

/**
 * Initialize all subscription cron jobs
 * Call this in your main server file (index.ts) after database connection
 */
export const startSubscriptionCronJobs = () => {
  console.log("[Subscription Cron] Initializing cron jobs...");

  // Check for expired subscriptions daily at 00:00 UTC
  cron.schedule("0 0 * * *", () => {
    checkExpiredSubscriptions();
  });
  console.log("[Subscription Cron] ✓ Scheduled: Check expired subscriptions (00:00 UTC)");

  // Send expiry reminders daily at 08:00 UTC
  cron.schedule("0 8 * * *", () => {
    sendExpiryReminders();
  });
  console.log("[Subscription Cron] ✓ Scheduled: Send expiry reminders (08:00 UTC)");

  // Clean up pending subscriptions daily at 12:00 UTC
  cron.schedule("0 12 * * *", () => {
    cleanupPendingSubscriptions();
  });
  console.log("[Subscription Cron] ✓ Scheduled: Cleanup pending subscriptions (12:00 UTC)");

  console.log("[Subscription Cron] All cron jobs initialized successfully");
};

/**
 * Manual trigger functions for testing
 */
export const triggerExpiryCheck = async () => {
  return await checkExpiredSubscriptions();
};

export const triggerReminderCheck = async () => {
  return await sendExpiryReminders();
};

export const triggerPendingCleanup = async () => {
  return await cleanupPendingSubscriptions();
};
