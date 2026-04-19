import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import SubscriptionModel from "../Models/SubscriptionModel";
import User from "../Models/UserModel";
import { resStatusData } from "../Responses/Response";

// Grace period in days
const GRACE_PERIOD_DAYS = 3;

/**
 * Middleware to check if user has an active subscription
 * Handles grace period - users can still access during grace period with warnings
 * Automatically updates expired subscriptions using transactions
 * Attaches subscription details to request object
 */
export const requireActiveSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;

    if (!userId) {
      resStatusData(res, "error", "User not authenticated", {});
      return;
    }

    // Skip subscription check for admin users
    const user = await User.findById(userId).select("userType documentVerified");
    if (user && user.userType === "admin") {
      next();
      return;
    }

    // Check if user is a business and if documents are verified
    if (user && user.userType === "business" && !user.documentVerified) {
      resStatusData(
        res,
        "error",
        "Your business documents are under review. You cannot subscribe until your documents are verified.",
        {
          code: "DOCUMENTS_NOT_VERIFIED",
          action: "DOCUMENTS_PENDING_APPROVAL",
          documentVerified: false,
        }
      );
      return;
    }

    // Find active or grace period subscription for user
    const subscription = await SubscriptionModel.findOne({
      userId,
      status: { $in: ["active", "expiring_soon", "grace_period"] },
    }).populate("planId");

    // If no subscription found
    if (!subscription) {
      resStatusData(
        res,
        "error",
        "Active subscription required to access this feature",
        {
          code: "NO_ACTIVE_SUBSCRIPTION",
          action: "REDIRECT_TO_SUBSCRIPTION_PAGE",
        }
      );
      return;
    }

    const now = new Date();

    // Check if grace period has also expired
    if (subscription.graceEndDate && subscription.graceEndDate < now) {
      // Grace period expired - use transaction to update both
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        subscription.status = "expired";
        subscription.isInGracePeriod = false;
        await subscription.save({ session });

        await User.findByIdAndUpdate(
          userId,
          {
            hasActiveSubscription: false,
            currentSubscriptionId: null,
          },
          { session }
        );

        await session.commitTransaction();
      } catch (txError) {
        await session.abortTransaction();
        console.error("Middleware transaction failed:", txError);
      } finally {
        session.endSession();
      }

      resStatusData(
        res,
        "error",
        "Your subscription and grace period have expired. Please renew to continue.",
        {
          code: "SUBSCRIPTION_EXPIRED",
          action: "REDIRECT_TO_SUBSCRIPTION_PAGE",
          expiryDate: subscription.endDate,
          graceEndDate: subscription.graceEndDate,
        }
      );
      return;
    }

    // Check if subscription has expired but still in grace period
    if (subscription.endDate < now && subscription.graceEndDate && subscription.graceEndDate >= now) {
      // In grace period - allow access but warn user
      const graceDaysRemaining = Math.ceil(
        (subscription.graceEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Update status if not already in grace_period
      if (subscription.status !== "grace_period") {
        subscription.status = "grace_period";
        subscription.isInGracePeriod = true;
        await subscription.save();
      }

      // Set warning header
      res.setHeader(
        "X-Subscription-Warning",
        `Grace period: ${graceDaysRemaining} days remaining to renew`
      );
      res.setHeader("X-Subscription-Grace-Period", "true");

      // Attach subscription details with grace period info
      (req as any).subscription = {
        id: subscription._id,
        userId: subscription.userId,
        planId: subscription.planId,
        tier: subscription.tier,
        duration: subscription.duration,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        graceEndDate: subscription.graceEndDate,
        amount: subscription.amount,
        daysRemaining: 0,
        graceDaysRemaining,
        isInGracePeriod: true,
        isExpiringSoon: false,
      };

      next();
      return;
    }

    // Normal active subscription
    const daysRemaining = Math.ceil(
      (subscription.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Attach subscription details to request for use in controllers
    (req as any).subscription = {
      id: subscription._id,
      userId: subscription.userId,
      planId: subscription.planId,
      tier: subscription.tier,
      duration: subscription.duration,
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      graceEndDate: subscription.graceEndDate,
      amount: subscription.amount,
      daysRemaining,
      graceDaysRemaining: 0,
      isInGracePeriod: false,
      isExpiringSoon: daysRemaining <= 7,
    };

    // If expiring soon, attach warning to headers
    if (daysRemaining <= 7) {
      res.setHeader(
        "X-Subscription-Warning",
        `Your subscription expires in ${daysRemaining} days`
      );
    }

    next();
  } catch (error: any) {
    console.error("Subscription middleware error:", error);
    resStatusData(
      res,
      "error",
      "Failed to verify subscription status",
      {
        error: error.message,
      }
    );
    return;
  }
};

/**
 * Middleware to check subscription status without blocking
 * Attaches subscription details to request if available
 * Handles grace period status
 * Always calls next() (doesn't block)
 */
export const attachSubscriptionDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;

    if (!userId) {
      return next();
    }

    // Find active or grace period subscription for user
    const subscription = await SubscriptionModel.findOne({
      userId,
      status: { $in: ["active", "expiring_soon", "grace_period"] },
    }).populate("planId");

    const now = new Date();

    if (subscription) {
      const isInGracePeriod = subscription.status === "grace_period" || 
        (subscription.endDate < now && subscription.graceEndDate && subscription.graceEndDate >= now);
      
      const isExpired = subscription.graceEndDate 
        ? subscription.graceEndDate < now 
        : subscription.endDate < now;

      if (!isExpired) {
        const daysRemaining = subscription.endDate > now 
          ? Math.ceil((subscription.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        
        const graceDaysRemaining = subscription.graceEndDate && subscription.graceEndDate > now
          ? Math.ceil((subscription.graceEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        // Attach subscription details to request
        (req as any).subscription = {
          id: subscription._id,
          userId: subscription.userId,
          planId: subscription.planId,
          tier: subscription.tier,
          duration: subscription.duration,
          status: subscription.status,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          graceEndDate: subscription.graceEndDate,
          amount: subscription.amount,
          daysRemaining,
          graceDaysRemaining,
          isInGracePeriod,
          isExpiringSoon: daysRemaining <= 7 && daysRemaining > 0,
        };

        (req as any).hasActiveSubscription = true;
      } else {
        (req as any).hasActiveSubscription = false;
      }
    } else {
      (req as any).hasActiveSubscription = false;
    }

    next();
  } catch (error) {
    console.error("Attach subscription details error:", error);
    next(); // Continue even if there's an error
  }
};

/**
 * Middleware to log subscription-related activities
 * For audit trail and debugging
 */
export const logSubscriptionActivity = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  next();
};
