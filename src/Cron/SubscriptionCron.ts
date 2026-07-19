import cron from "node-cron";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import SubscriptionModel from "../Models/SubscriptionModel";
import User from "../Models/UserModel";
import OfferModel from "../Models/offerModal";
import { invoiceService } from "../Services/InvoiceService";
import { sendNotification } from "../Controllers/NotificationController";
import { subscriptionNotificationService } from "../Services/SubscriptionNotificationService";

// Grace period in days
const GRACE_PERIOD_DAYS = 3;

// Initialize Razorpay for renewal order creation
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});

/**
 * Check for expired subscriptions and update their status
 * Handles grace period transitions:
 * - active → grace_period (when endDate passes)
 * - grace_period → expired (when graceEndDate passes)
 * Runs daily at 00:00 UTC
 */
export const checkExpiredSubscriptions = async () => {
  try {
    console.log(
      "[Subscription Cron] Checking for expired subscriptions at",
      new Date()
    );

    const now = new Date();
    let totalProcessed = 0;

    // Step 1: Move active subscriptions past endDate into grace_period
    const subscriptionsEnteringGrace = await SubscriptionModel.find({
      status: { $in: ["active", "expiring_soon"] },
      endDate: { $lt: now },
      $or: [
        { graceEndDate: { $gte: now } },
        { graceEndDate: { $exists: false } }
      ]
    });

    for (const subscription of subscriptionsEnteringGrace) {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // If no graceEndDate set, calculate it now (for legacy records)
        if (!subscription.graceEndDate) {
          const graceEnd = new Date(subscription.endDate);
          graceEnd.setDate(graceEnd.getDate() + GRACE_PERIOD_DAYS);
          subscription.graceEndDate = graceEnd;
        }

        subscription.status = "grace_period";
        subscription.isInGracePeriod = true;
        await subscription.save({ session });

        // User can still access during grace period, just warn them
        await session.commitTransaction();

        // Send grace period notification
        const user = await User.findById(subscription.userId);
        if (user && user.playerId && user.playerId.length > 0) {
          await sendNotification(
            user.playerId,
            "⚠️ Subscription Grace Period",
            `Your subscription has ended. You have ${GRACE_PERIOD_DAYS} days to renew before losing access.`,
            "",
            "subscription_grace_period"
          );
        }

        console.log(
          `[Subscription Cron] Moved to grace period: user ${subscription.userId}`
        );
        totalProcessed++;
      } catch (txError) {
        await session.abortTransaction();
        console.error("[Subscription Cron] Grace period transaction failed:", txError);
      } finally {
        session.endSession();
      }
    }

    // Step 2: Expire subscriptions past graceEndDate
    const subscriptionsToExpire = await SubscriptionModel.find({
      status: "grace_period",
      graceEndDate: { $lt: now },
    });

    for (const subscription of subscriptionsToExpire) {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        subscription.status = "expired";
        subscription.isInGracePeriod = false;
        await subscription.save({ session });

        // Update user atomically
        await User.findByIdAndUpdate(
          subscription.userId,
          {
            hasActiveSubscription: false,
            currentSubscriptionId: null,
          },
          { session }
        );

        await session.commitTransaction();

        // Send expiration notification
        const user = await User.findById(subscription.userId);
        if (user && user.playerId && user.playerId.length > 0) {
          await sendNotification(
            user.playerId,
            "Subscription Expired",
            "Your subscription and grace period have ended. Renew now to continue enjoying premium features!",
            "",
            "subscription_expired"
          );
        }

        console.log(
          `[Subscription Cron] Expired subscription for user ${subscription.userId}`
        );
        totalProcessed++;
      } catch (txError) {
        await session.abortTransaction();
        console.error("[Subscription Cron] Expiration transaction failed:", txError);
      } finally {
        session.endSession();
      }
    }

    // Step 3: Also handle legacy expired subscriptions (no grace period set)
    const legacyExpired = await SubscriptionModel.find({
      status: "active",
      endDate: { $lt: now },
      graceEndDate: { $exists: false },
    });

    for (const subscription of legacyExpired) {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        subscription.status = "expired";
        await subscription.save({ session });

        await User.findByIdAndUpdate(
          subscription.userId,
          {
            hasActiveSubscription: false,
            currentSubscriptionId: null,
          },
          { session }
        );

        await session.commitTransaction();
        totalProcessed++;
      } catch (txError) {
        await session.abortTransaction();
      } finally {
        session.endSession();
      }
    }

    console.log(
      `[Subscription Cron] Processed ${totalProcessed} subscription status changes`
    );

    return { count: totalProcessed };
  } catch (error) {
    console.error("[Subscription Cron] Error checking expired subscriptions:", error);
    return { count: 0, error };
  }
};

/**
 * Mark subscriptions as expiring_soon when within 7 days of endDate
 * Runs daily at 06:00 UTC
 */
export const markExpiringSoonSubscriptions = async () => {
  try {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const result = await SubscriptionModel.updateMany(
      {
        status: "active",
        endDate: { $gt: now, $lte: sevenDaysFromNow },
      },
      { $set: { status: "expiring_soon" } }
    );

    console.log(`[Subscription Cron] Marked ${result.modifiedCount} subscriptions as expiring_soon`);
    return { count: result.modifiedCount };
  } catch (error) {
    console.error("[Subscription Cron] Error marking expiring soon:", error);
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
      console.log("[Subscription Cron] No subscriptions expiring soon found");
      return { count: 0 };
    }

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

        const user = await User.findById(userId);
        if (user && user.playerId && user.playerId.length > 0) {
          await sendNotification(
            user.playerId,
            "Subscription Expiring Soon",
            `Your ${subscription.tier} subscription expires in ${daysRemaining} days. Renew now to avoid interruption!`,
            "",
            "subscription_expiring_soon"
          );
        }

        console.log(`[Subscription Cron] Expiry reminder sent for user ${userId}`);
      } catch (error: any) {
        console.error(`[Subscription Cron] Failed to send expiry reminder:`, error.message);
      }
    }

    console.log(`[Subscription Cron] Processed ${expiringSubscriptions.length} expiry reminders`);
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
    console.log("[Subscription Cron] Cleaning up pending subscriptions at", new Date());

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const pendingSubscriptions = await SubscriptionModel.find({
      status: "pending",
      paymentStatus: "pending",
      createdAt: { $lt: oneDayAgo },
    });

    if (pendingSubscriptions.length === 0) {
      console.log("[Subscription Cron] No old pending subscriptions found");
      return { count: 0 };
    }

    for (const subscription of pendingSubscriptions) {
      subscription.status = "cancelled";
      subscription.cancellationReason = "Automatic cleanup - payment not completed within 24 hours";
      subscription.cancellationDate = new Date();
      await subscription.save();
      console.log(`[Subscription Cron] Cleaned up pending subscription ${subscription._id}`);
    }

    console.log(`[Subscription Cron] Cleaned up ${pendingSubscriptions.length} pending subscriptions`);
    return { count: pendingSubscriptions.length };
  } catch (error) {
    console.error("[Subscription Cron] Error cleaning up pending subscriptions:", error);
    return { count: 0, error };
  }
};

/**
 * Update withdrawal eligibility for offers that are 30+ days old
 * Runs daily at 01:00 UTC
 */
export const updateWithdrawalEligibility = async () => {
  try {
    console.log("[Withdrawal Cron] Checking for offers eligible for withdrawal at", new Date());

    const now = new Date();

    const eligibleOffers = await OfferModel.find({
      is_eligible_for_withdrawal: false,
      withdrawal_eligibility_date: { $lte: now },
      locked_amount: { $gt: 0 },
      isdeleted: false,
    });

    if (eligibleOffers.length === 0) {
      console.log("[Withdrawal Cron] No offers became eligible for withdrawal");
      return { count: 0 };
    }

    const result = await OfferModel.updateMany(
      {
        is_eligible_for_withdrawal: false,
        withdrawal_eligibility_date: { $lte: now },
        locked_amount: { $gt: 0 },
        isdeleted: false,
      },
      { $set: { is_eligible_for_withdrawal: true } }
    );

    console.log(`[Withdrawal Cron] ✓ Marked ${result.modifiedCount} offers as eligible for withdrawal`);

    for (const offer of eligibleOffers) {
      try {
        const user = await User.findById(offer.business_id);
        if (user && user.playerId && user.playerId.length > 0) {
          await sendNotification(
            user.playerId,
            "Withdrawal Available",
            `Your offer "${offer.name}" is now eligible for withdrawal. Locked amount: ₹${offer.locked_amount?.toLocaleString()}`,
            "",
            "withdrawal_eligible"
          );
        }
      } catch (notifError) {
        console.error("[Withdrawal Cron] Failed to send notification:", notifError);
      }
    }

    return { count: result.modifiedCount, offers: eligibleOffers };
  } catch (error) {
    console.error("[Withdrawal Cron] Error updating withdrawal eligibility:", error);
    throw error;
  }
};

/**
 * Process auto-renewals: for subscriptions expiring within 3 days with auto-renewal ON,
 * create a Razorpay order and send a one-tap renewal notification.
 * Runs daily at 02:00 UTC
 */
export const processAutoRenewals = async () => {
  try {
    console.log("[AutoRenewal Cron] Processing auto-renewals at", new Date());

    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const renewalCandidates = await SubscriptionModel.find({
      autoRenewalEnabled: true,
      status: { $in: ["active", "expiring_soon"] },
      endDate: { $lte: threeDaysFromNow, $gte: now },
      $or: [
        { lastRenewalAttemptAt: { $exists: false } },
        { lastRenewalAttemptAt: { $lt: new Date(now.getTime() - 23 * 60 * 60 * 1000) } },
      ],
    }).populate("planId");

    if (renewalCandidates.length === 0) {
      console.log("[AutoRenewal Cron] No auto-renewal candidates found");
      return { count: 0 };
    }

    let processed = 0;
    let failed = 0;

    for (const subscription of renewalCandidates) {
      try {
        const user = await User.findById(subscription.userId);
        if (!user) continue;

        const daysUntilExpiry = Math.ceil(
          (subscription.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        );

        // Create Razorpay order for the renewal (with 18% GST)
        let razorpayOrder;
        try {
          razorpayOrder = await razorpay.orders.create({
            amount: Math.round(subscription.amount * 1.18 * 100),
            currency: "INR",
            receipt: `RNW-${Date.now()}`.slice(0, 40),
            notes: {
              userId: String(subscription.userId),
              planId: String(subscription.planId),
              tier: subscription.tier,
              duration: String(subscription.duration),
              changeType: "renewal",
              previousSubscriptionId: String(subscription._id),
            },
          });
        } catch (razorpayErr: any) {
          console.error(`[AutoRenewal Cron] Razorpay order failed for user ${subscription.userId}:`, razorpayErr.message);
          subscription.renewalFailureCount = (subscription.renewalFailureCount || 0) + 1;
          subscription.renewalFailureReason = `Order creation failed: ${razorpayErr.message}`;
          subscription.paymentFailedAt = now;
          subscription.lastRenewalAttemptAt = now;
          await subscription.save();
          if (user.playerId && user.playerId.length > 0) {
            await sendNotification(
              user.playerId,
              "⚠️ Auto-Renewal Issue",
              "We couldn't initiate your subscription renewal. Please renew manually from the app.",
              "",
              "auto_renewal_failed"
            );
          }
          failed++;
          continue;
        }

        // Upsert a pending renewal subscription record
        const existingPending = await SubscriptionModel.findOne({
          userId: subscription.userId,
          changeType: "renewal",
          status: "pending",
          paymentStatus: "pending",
        });

        let renewalRecord;
        if (existingPending) {
          existingPending.razorpayOrderId = razorpayOrder.id;
          existingPending.planId = subscription.planId as any;
          existingPending.tier = subscription.tier;
          existingPending.duration = subscription.duration;
          existingPending.amount = subscription.amount;
          existingPending.autoRenewalEnabled = true;
          await existingPending.save();
          renewalRecord = existingPending;
        } else {
          renewalRecord = await SubscriptionModel.create({
            userId: subscription.userId,
            planId: subscription.planId,
            tier: subscription.tier,
            duration: subscription.duration,
            status: "pending",
            paymentStatus: "pending",
            amount: subscription.amount,
            baseAmount: subscription.amount,
            changeType: "renewal",
            replacesSubscriptionId: subscription._id as any,
            currency: "INR",
            autoRenewalEnabled: true,
            razorpayOrderId: razorpayOrder.id,
            metadata: { source: "auto_renewal_cron" },
          });
        }

        subscription.lastRenewalAttemptAt = now;
        await subscription.save();

        // Push notification: tap to pay
        if (user.playerId && user.playerId.length > 0) {
          await sendNotification(
            user.playerId,
            "🔄 Subscription Renewal Due",
            `Your ${subscription.tier.toUpperCase()} plan expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? "s" : ""}. Open the app to complete renewal for ₹${Math.round(subscription.amount * 1.18).toLocaleString("en-IN")}.`,
            "",
            "auto_renewal_reminder"
          );
        }

        // Email reminder
        try {
          const reminderDetails = {
            invoiceId: `RNW-${Date.now()}-${String(subscription.userId).slice(-6).toUpperCase()}`,
            userName: `${(user as any).firstName || ""} ${(user as any).lastName || ""}`.trim() || "User",
            userEmail: user.email || "noreply@lynkup.com",
            subscriptionId: (renewalRecord._id as any).toString(),
            planName: (subscription.planId as any)?.name || "Business Plan",
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
        } catch (emailErr) {
          console.error("[AutoRenewal Cron] Email reminder failed:", emailErr);
        }

        console.log(`[AutoRenewal Cron] ✓ Renewal order ${razorpayOrder.id} created for user ${subscription.userId}`);
        processed++;
      } catch (err: any) {
        console.error(`[AutoRenewal Cron] Error for subscription ${subscription._id}:`, err.message);
        failed++;
      }
    }

    console.log(`[AutoRenewal Cron] Done — ${processed} processed, ${failed} failed`);
    return { processed, failed };
  } catch (error) {
    console.error("[AutoRenewal Cron] Fatal error:", error);
    return { processed: 0, failed: 0, error };
  }
};

/**
 * Handle renewal failures: after grace period ends, mark access as restricted
 * for users who have auto-renewal enabled but haven't paid yet.
 * Runs daily at 03:00 UTC
 */
export const handleRenewalFailures = async () => {
  try {
    console.log("[AutoRenewal Cron] Handling renewal failures at", new Date());

    const now = new Date();

    const failedRenewals = await SubscriptionModel.find({
      autoRenewalEnabled: true,
      status: "grace_period",
      graceEndDate: { $lt: now },
      accessRestrictedAt: { $exists: false },
    });

    let restricted = 0;

    for (const subscription of failedRenewals) {
      try {
        const user = await User.findById(subscription.userId);
        if (!user) continue;

        subscription.accessRestrictedAt = now;
        await subscription.save();

        if (user.playerId && user.playerId.length > 0) {
          await sendNotification(
            user.playerId,
            "🚫 Access Restricted",
            "Your subscription has expired and the grace period has ended. Renew now to restore full access.",
            "",
            "access_restricted"
          );
        }

        console.log(`[AutoRenewal Cron] Access restricted for user ${subscription.userId}`);
        restricted++;
      } catch (err: any) {
        console.error(`[AutoRenewal Cron] Error restricting access for ${subscription._id}:`, err.message);
      }
    }

    console.log(`[AutoRenewal Cron] Restricted access for ${restricted} users`);
    return { restricted };
  } catch (error) {
    console.error("[AutoRenewal Cron] Error handling renewal failures:", error);
    return { restricted: 0, error };
  }
};

/**
 * Initialize all subscription cron jobs
 * Call this in your main server file (index.ts) after database connection
 */
export const startSubscriptionCronJobs = () => {
  console.log("[Subscription Cron] Initializing cron jobs...");

  // Check for expired subscriptions daily at 00:00 UTC
  cron.schedule("0 0 * * *", () => { checkExpiredSubscriptions(); });
  console.log("[Subscription Cron] ✓ Scheduled: Check expired subscriptions (00:00 UTC)");

  // Update withdrawal eligibility daily at 01:00 UTC
  cron.schedule("0 1 * * *", () => { updateWithdrawalEligibility(); });
  console.log("[Withdrawal Cron] ✓ Scheduled: Update withdrawal eligibility (01:00 UTC)");

  // Process auto-renewals: create orders + notify 3 days before expiry (02:00 UTC)
  cron.schedule("0 2 * * *", () => { processAutoRenewals(); });
  console.log("[AutoRenewal Cron] ✓ Scheduled: Process auto-renewals (02:00 UTC)");

  // Handle renewal failures: restrict access after grace period ends (03:00 UTC)
  cron.schedule("0 3 * * *", () => { handleRenewalFailures(); });
  console.log("[AutoRenewal Cron] ✓ Scheduled: Handle renewal failures (03:00 UTC)");

  // Mark subscriptions as expiring_soon daily at 06:00 UTC
  cron.schedule("0 6 * * *", () => { markExpiringSoonSubscriptions(); });
  console.log("[Subscription Cron] ✓ Scheduled: Mark expiring soon subscriptions (06:00 UTC)");

  // Send expiry reminders daily at 08:00 UTC
  cron.schedule("0 8 * * *", () => { sendExpiryReminders(); });
  console.log("[Subscription Cron] ✓ Scheduled: Send expiry reminders (08:00 UTC)");

  // Clean up pending subscriptions daily at 12:00 UTC
  cron.schedule("0 12 * * *", () => { cleanupPendingSubscriptions(); });
  console.log("[Subscription Cron] ✓ Scheduled: Cleanup pending subscriptions (12:00 UTC)");

  // Notify unsubscribed business users every Monday at 10:00 UTC
  cron.schedule("0 10 * * 1", () => { subscriptionNotificationService.notifyUnsubscribedBusinessUsers(); });
  console.log("[Subscription Cron] ✓ Scheduled: Notify unsubscribed business users (Mon 10:00 UTC)");

  console.log("[Subscription Cron] All cron jobs initialized successfully");
};

// ─── Manual trigger helpers (for testing/admin) ──────────────────────────────

export const triggerExpiryCheck = async () => checkExpiredSubscriptions();
export const triggerExpiringSoonCheck = async () => markExpiringSoonSubscriptions();
export const triggerReminderCheck = async () => sendExpiryReminders();
export const triggerPendingCleanup = async () => cleanupPendingSubscriptions();
export const triggerWithdrawalEligibilityUpdate = async () => updateWithdrawalEligibility();
export const triggerAutoRenewalProcessing = async () => processAutoRenewals();
export const triggerRenewalFailureHandling = async () => handleRenewalFailures();
