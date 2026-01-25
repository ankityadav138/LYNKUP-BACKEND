import UserModel from "../Models/UserModel";
import SubscriptionModel from "../Models/SubscriptionModel";
import { sendNotification } from "../Controllers/NotificationController";

/**
 * Send notification to user based on subscription status
 */
export const notifyUserBySubscriptionStatus = async (
  userId: string,
  status: "active" | "pending" | "expired" | "cancelled"
) => {
  try {
    const user = await UserModel.findById(userId);
    if (!user || !user.playerId || user.playerId.length === 0) {
      console.log(`User ${userId} has no playerId registered`);
      return;
    }

    const subscription = await SubscriptionModel.findOne({ userId, status }).populate("planId");
    if (!subscription) {
      console.log(`No ${status} subscription found for user ${userId}`);
      return;
    }

    let title = "";
    let message = "";
    let notificationType = "";

    switch (status) {
      case "active":
        title = "🎉 Subscription Activated!";
        message = `Your ${subscription.tier.toUpperCase()} plan is now active. Enjoy premium features!`;
        notificationType = "subscription_activated";
        break;

      case "pending":
        title = "⏳ Payment Pending";
        message = `Complete your payment to activate your ${subscription.tier} subscription.`;
        notificationType = "subscription_pending";
        break;

      case "expired":
        title = "⚠️ Subscription Expired";
        message = "Your subscription has expired. Renew now to continue enjoying premium features!";
        notificationType = "subscription_expired";
        break;

      case "cancelled":
        title = "Subscription Cancelled";
        message = "Your subscription has been cancelled. We hope to see you again soon!";
        notificationType = "subscription_cancelled";
        break;
    }

    await sendNotification(
      user.playerId,
      title,
      message,
      "", // No image
      notificationType
    );

    console.log(`✅ Notification sent to user ${userId} for ${status} subscription`);
  } catch (error) {
    console.error(`Error sending subscription notification to user ${userId}:`, error);
  }
};

/**
 * Send notification to all users with specific subscription tier
 */
export const notifyUsersBySubscriptionTier = async (
  tier: "silver" | "gold" | "platinum" | "diamond",
  title: string,
  message: string,
  notificationType: string = "subscription_announcement"
) => {
  try {
    const subscriptions = await SubscriptionModel.find({
      tier,
      status: "active",
    });

    const userIds = subscriptions.map((sub) => sub.userId);
    const users = await UserModel.find({
      _id: { $in: userIds },
      playerId: { $exists: true, $ne: [] },
    });

    let notificationsSent = 0;

    for (const user of users) {
      if (user.playerId && user.playerId.length > 0) {
        await sendNotification(
          user.playerId,
          title,
          message,
          "",
          notificationType
        );
        notificationsSent++;
      }
    }

    console.log(`✅ Sent ${notificationsSent} notifications to ${tier} tier users`);
    return notificationsSent;
  } catch (error) {
    console.error(`Error sending notifications to ${tier} tier users:`, error);
    return 0;
  }
};

/**
 * Send notification to all active subscribers
 */
export const notifyAllActiveSubscribers = async (
  title: string,
  message: string,
  notificationType: string = "subscription_announcement"
) => {
  try {
    const activeSubscriptions = await SubscriptionModel.find({
      status: "active",
    });

    const userIds = activeSubscriptions.map((sub) => sub.userId);
    const users = await UserModel.find({
      _id: { $in: userIds },
      playerId: { $exists: true, $ne: [] },
    });

    let notificationsSent = 0;

    for (const user of users) {
      if (user.playerId && user.playerId.length > 0) {
        await sendNotification(
          user.playerId,
          title,
          message,
          "",
          notificationType
        );
        notificationsSent++;
      }
    }

    console.log(`✅ Sent ${notificationsSent} notifications to active subscribers`);
    return notificationsSent;
  } catch (error) {
    console.error("Error sending notifications to active subscribers:", error);
    return 0;
  }
};

/**
 * Send notification when user upgrades subscription
 */
export const notifySubscriptionUpgrade = async (
  userId: string,
  oldTier: string,
  newTier: string
) => {
  try {
    const user = await UserModel.findById(userId);
    if (!user || !user.playerId || user.playerId.length === 0) {
      return;
    }

    await sendNotification(
      user.playerId,
      "🚀 Subscription Upgraded!",
      `Congratulations! Your subscription has been upgraded from ${oldTier.toUpperCase()} to ${newTier.toUpperCase()}.`,
      "",
      "subscription_upgraded"
    );

    console.log(`✅ Upgrade notification sent to user ${userId}`);
  } catch (error) {
    console.error(`Error sending upgrade notification to user ${userId}:`, error);
  }
};

/**
 * Send notification to unsubscribed business users to encourage subscription
 */
export const notifyUnsubscribedBusinessUsers = async () => {
  try {
    // Find all business users without active subscription
    const unsubscribedBusinessUsers = await UserModel.find({
      userType: "business",
      hasActiveSubscription: false,
      playerId: { $exists: true, $ne: [] },
    });

    if (unsubscribedBusinessUsers.length === 0) {
      console.log("No unsubscribed business users found");
      return 0;
    }

    let notificationsSent = 0;

    for (const user of unsubscribedBusinessUsers) {
      if (user.playerId && user.playerId.length > 0) {
        // Check if they ever had a subscription
        const hadSubscription = await SubscriptionModel.findOne({
          userId: user._id,
        });

        let title = "";
        let message = "";

        if (hadSubscription) {
          // User had subscription before (expired/cancelled)
          title = "💎 We Miss You!";
          message = "Your premium benefits are waiting. Renew your subscription and unlock exclusive features again!";
        } else {
          // User never subscribed
          title = "🚀 Unlock Premium Features";
          message = "Get more bookings with our premium subscription! Silver, Gold, Platinum & Diamond plans available.";
        }

        await sendNotification(
          user.playerId,
          title,
          message,
          "",
          "subscription_promotion"
        );

        notificationsSent++;
      }
    }

    console.log(`✅ Sent ${notificationsSent} subscription promotion notifications to unsubscribed business users`);
    return notificationsSent;
  } catch (error) {
    console.error("Error sending notifications to unsubscribed business users:", error);
    return 0;
  }
};

/**
 * Send personalized subscription promotion to specific unsubscribed business user
 */
export const notifySpecificUnsubscribedUser = async (
  userId: string,
  customTitle?: string,
  customMessage?: string
) => {
  try {
    const user = await UserModel.findById(userId);
    
    if (!user) {
      console.log(`User ${userId} not found`);
      return false;
    }

    if (user.userType !== "business") {
      console.log(`User ${userId} is not a business user`);
      return false;
    }

    if (user.hasActiveSubscription) {
      console.log(`User ${userId} already has active subscription`);
      return false;
    }

    if (!user.playerId || user.playerId.length === 0) {
      console.log(`User ${userId} has no playerId registered`);
      return false;
    }

    const title = customTitle || "🎯 Special Offer Just For You!";
    const message = customMessage || "Subscribe now and get your first month at 20% off. Limited time offer!";

    await sendNotification(
      user.playerId,
      title,
      message,
      "",
      "subscription_personal_offer"
    );

    console.log(`✅ Personal subscription promotion sent to user ${userId}`);
    return true;
  } catch (error) {
    console.error(`Error sending personal promotion to user ${userId}:`, error);
    return false;
  }
};

export const subscriptionNotificationService = {
  notifyUserBySubscriptionStatus,
  notifyUsersBySubscriptionTier,
  notifyAllActiveSubscribers,
  notifySubscriptionUpgrade,
  notifyUnsubscribedBusinessUsers,
  notifySpecificUnsubscribedUser,
};
