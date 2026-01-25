import { Request, Response, NextFunction } from "express";
import SubscriptionModel from "../Models/SubscriptionModel";
import User from "../Models/UserModel";
import { resStatusData } from "../Responses/Response";

/**
 * Middleware to check if user has an active subscription
 * Automatically updates expired subscriptions
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

    // Check if user is a business and if documents are verified
    const user = await User.findById(userId);
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

    // Find active subscription for user
    const subscription = await SubscriptionModel.findOne({
      userId,
      status: "active",
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

    // Check if subscription has expired
    if (subscription.endDate < new Date()) {
      // Mark subscription as expired
      subscription.status = "expired";
      await subscription.save();

      // Update user
      await User.findByIdAndUpdate(userId, {
        hasActiveSubscription: false,
        currentSubscriptionId: null,
      });

      resStatusData(
        res,
        "error",
        "Your subscription has expired. Please renew to continue.",
        {
          code: "SUBSCRIPTION_EXPIRED",
          action: "REDIRECT_TO_SUBSCRIPTION_PAGE",
          expiryDate: subscription.endDate,
        }
      );
      return;
    }

    // Calculate days remaining
    const daysRemaining = Math.ceil(
      (subscription.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
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
      amount: subscription.amount,
      daysRemaining,
      isExpiringsoon: daysRemaining <= 7, // Flag if expiring in 7 days
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

    // Find active subscription for user
    const subscription = await SubscriptionModel.findOne({
      userId,
      status: "active",
    }).populate("planId");

    if (subscription && subscription.endDate > new Date()) {
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
        amount: subscription.amount,
        daysRemaining: Math.ceil(
          (subscription.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        ),
      };

      (req as any).hasActiveSubscription = true;
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
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;

    if (userId) {
      console.log(`[Subscription Activity] ${req.method} ${req.path}`, {
        userId,
        timestamp: new Date(),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
    }

    next();
  } catch (error) {
    next();
  }
};
