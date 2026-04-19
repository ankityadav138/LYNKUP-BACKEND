import { Request, Response } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import User from "../Models/UserModel";
import SubscriptionModel from "../Models/SubscriptionModel";
import SubscriptionPlanModel from "../Models/SubscriptionPlanModel";
import InvoiceModel from "../Models/InvoiceModel";
import { resStatusData } from "../Responses/Response";
import { invoiceService } from "../Services/InvoiceService";
import { subscriptionNotificationService } from "../Services/SubscriptionNotificationService";

// Grace period in days
const GRACE_PERIOD_DAYS = 3;

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});

/**
 * GET /api/subscription/plans
 * Fetch all active subscription plans with tiers
 * Public endpoint (no auth required)
 */
export const getSubscriptionPlans = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const plans = await SubscriptionPlanModel.findOne({
      isActive: true,
    });

    if (!plans) {
      resStatusData(res, "error", "Subscription plans not found", {});
      return;
    }

    resStatusData(res, "success", "Subscription plans retrieved", {
      plan: plans,
    });
  } catch (error: any) {
    console.error("Get subscription plans error:", error);
    resStatusData(res, "error", "Failed to retrieve plans", {
      error: error.message,
    });
  }
};

/**
 * POST /api/subscription/create-order
 * Create Razorpay order for subscription
 * Protected endpoint (auth required)
 */
export const createSubscriptionOrder = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;
    const { planId, tier } = req.body;

    // Validate input
    if (!userId) {
      resStatusData(res, "error", "User not authenticated", {});
      return;
    }

    if (!planId || !tier) {
      resStatusData(res, "error", "Plan ID and tier are required", {});
      return;
    }

    // Validate tier format
    if (!["silver"].includes(tier)) {
      resStatusData(res, "error", "Invalid tier selected", {});
      return;
    }

    // Fetch subscription plan
    const plan = await SubscriptionPlanModel.findById(planId);
    if (!plan) {
      resStatusData(res, "error", "Subscription plan not found", {});
      return;
    }

    // Find selected tier
    const selectedTier = plan.tiers.find((t) => t.id === tier);
    if (!selectedTier) {
      resStatusData(res, "error", "Selected tier not available", {});
      return;
    }

    // Fetch user for email
    const user = await User.findById(userId);
    if (!user) {
      resStatusData(res, "error", "User not found", {});
      return;
    }

    // Check if user already has an active subscription
    const existingSubscription = await SubscriptionModel.findOne({
      userId,
      status: "active",
      endDate: { $gt: new Date() }, // Not expired
    });

    if (existingSubscription) {
      resStatusData(res, "error", "You already have an active subscription. Please wait for it to expire before purchasing a new one.", {
        currentSubscription: {
          tier: existingSubscription.tier,
          endDate: existingSubscription.endDate,
          daysRemaining: Math.ceil((existingSubscription.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        },
      });
      return;
    }

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: selectedTier.price * 100,
      currency: "INR",
      receipt: `SUB-${Date.now()}`.slice(0, 40), // Truncate to 40 chars
      notes: {
        userId: userId,
        planId: planId,
        tier: tier,
        duration: selectedTier.duration,
      },
    });

    // Reuse existing pending subscription if one exists, otherwise create new
    let subscription = await SubscriptionModel.findOne({
      userId,
      status: "pending",
      paymentStatus: "pending",
    });

    if (subscription) {
      subscription.planId = planId as any;
      subscription.tier = tier;
      subscription.duration = selectedTier.duration;
      subscription.amount = selectedTier.price;
      subscription.razorpayOrderId = razorpayOrder.id;
      subscription.razorpayPaymentId = undefined;
      subscription.razorpaySignature = undefined;
      await subscription.save();
    } else {
      subscription = await SubscriptionModel.create({
        userId,
        planId,
        tier,
        duration: selectedTier.duration,
        status: "pending",
        paymentStatus: "pending",
        amount: selectedTier.price,
        currency: "INR",
        razorpayOrderId: razorpayOrder.id,
        metadata: {
          userAgent: req.get("user-agent"),
          ipAddress: req.ip,
          source: "web",
        },
      });
    }

    resStatusData(res, "success", "Order created successfully", {
      orderId: razorpayOrder.id,
      subscriptionId: subscription._id,
      amount: selectedTier.price,
      currency: "INR",
      userEmail: user.email,
      planDetails: {
        name: plan.name,
        tier: selectedTier.id,
        duration: `${selectedTier.duration} month(s)`,
        price: selectedTier.price,
        discount: selectedTier.discount,
        monthlyEquivalent: selectedTier.monthlyEquivalent,
        description: selectedTier.description,
      },
    });
  } catch (error: any) {
    console.error("Create order error:", error);
    resStatusData(res, "error", "Failed to create order", {
      error: error.message,
    });
  }
};

/**
 * POST /api/subscription/verify
 * Verify Razorpay payment and activate subscription
 * Protected endpoint (auth required)
 */
export const verifySubscription = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      subscriptionId,
    } = req.body;

    // Validate input
    if (!userId) {
      resStatusData(res, "error", "User not authenticated", {});
      return;
    }

    // Validate required parameters
    if (!razorpay_payment_id || !razorpay_order_id) {
      resStatusData(res, "error", "Missing payment details", {});
      return;
    }

    if (!subscriptionId) {
      resStatusData(res, "error", "Subscription ID is required", {});
      return;
    }

    // In test/development mode, signature might be missing from response
    // We'll verify against Razorpay API instead
    const isTestMode = !razorpay_signature || razorpay_signature === "undefined";

    if (!process.env.RAZORPAY_KEY_SECRET) {
      resStatusData(res, "error", "Razorpay configuration error", {});
      return;
    }

    // Method 1: Verify signature if provided (Production)
    if (!isTestMode && razorpay_signature) {
      const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
      const body = `${razorpay_order_id}|${razorpay_payment_id}`;
      const expectedSignature = crypto
        .createHmac("sha256", RAZORPAY_KEY_SECRET)
        .update(body)
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        resStatusData(res, "error", "Invalid payment signature", {});
        return;
      }
    } else if (isTestMode) {
      // Method 2: Verify via Razorpay API (Test mode)
      
      // Fetch payment details from Razorpay API
      const paymentResponse = await razorpay.payments.fetch(razorpay_payment_id);
      
      if (paymentResponse.status !== "captured") {
        resStatusData(res, "error", "Payment not successfully captured", {});
        return;
      }

      // Verify order ID matches
      if (paymentResponse.order_id !== razorpay_order_id) {
        resStatusData(res, "error", "Order ID mismatch", {});
        return;
      }
    }

    // Find subscription
    const subscription = await SubscriptionModel.findById(subscriptionId);
    if (!subscription) {
      resStatusData(res, "error", "Subscription not found", {});
      return;
    }

    // Verify subscription belongs to user
    if (subscription.userId.toString() !== userId) {
      resStatusData(
        res,
        "error",
        "Subscription does not belong to this user",
        {}
      );
      return;
    }

    // Verify order ID matches
    if (subscription.razorpayOrderId !== razorpay_order_id) {
      resStatusData(res, "error", "Order ID mismatch", {});
      return;
    }

    // Update subscription with payment details
    subscription.razorpayPaymentId = razorpay_payment_id;
    subscription.razorpaySignature = razorpay_signature;
    subscription.paymentStatus = "completed";
    subscription.status = "active";

    // Set subscription dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + subscription.duration);

    // Set grace period end date (3 days after endDate)
    const graceEndDate = new Date(endDate);
    graceEndDate.setDate(graceEndDate.getDate() + GRACE_PERIOD_DAYS);

    subscription.startDate = startDate;
    subscription.endDate = endDate;
    subscription.graceEndDate = graceEndDate;
    subscription.isInGracePeriod = false;

    // Use transaction to ensure User and Subscription are updated atomically
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await subscription.save({ session });

      // Expire any old active subscriptions for this user
      await SubscriptionModel.updateMany(
        {
          userId,
          _id: { $ne: subscription._id },
          status: { $in: ["active", "expiring_soon", "grace_period"] },
        },
        {
          $set: {
            status: "expired",
            cancellationReason: "Replaced by new subscription",
            cancellationDate: new Date(),
          },
        },
        { session }
      );

      // Update user with subscription details
      await User.findByIdAndUpdate(
        userId,
        {
          currentSubscriptionId: subscription._id,
          hasActiveSubscription: true,
          subscriptionExpiryDate: endDate,
        },
        { session, new: true }
      );

      await session.commitTransaction();
    } catch (txError) {
      await session.abortTransaction();
      console.error("[Subscription] Transaction failed, rolling back:", txError);
      throw txError;
    } finally {
      session.endSession();
    }

    // Send push notification about activation (non-blocking)
    try {
      await subscriptionNotificationService.notifyUserBySubscriptionStatus(
        userId.toString(),
        "active"
      );
    } catch (notifErr) {
      console.error("[Notification] Failed to send push notification:", notifErr);
    }

    // Create Invoice record and send email (non-blocking)
    try {
      const user = await User.findById(userId);
      const plan = await SubscriptionPlanModel.findOne({ isActive: true });

      if (user) {
        const planName = plan?.name || "Business Plan";
        
        // Create invoice in database (auto-generates sequential number)
        const invoice = await InvoiceModel.create({
          userId: userId,
          subscriptionId: subscription._id,
          type: "subscription",
          amount: subscription.amount,
          currency: subscription.currency || "INR",
          razorpayPaymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id,
          planName: planName,
          billingEmail: user.email || "noreply@lynkup.com",
          invoiceDate: new Date(),
        });

        console.log(`[Invoice] Created invoice: ${invoice.invoiceNumber}`);

        const invoiceDetails = {
          invoiceId: invoice.invoiceNumber,
          userName: `${(user as any).firstName || ""} ${(user as any).lastName || ""}`.trim() || "User",
          userEmail: user.email || "noreply@lynkup.com",
          subscriptionId: (subscription._id as any).toString(),
          planName: planName,
          tier: subscription.tier,
          amount: subscription.amount,
          currency: subscription.currency || "INR",
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          duration: subscription.duration,
          discount: 0,
          features: plan?.features || [],
          company: "LYNKUP",
        };

        Promise.all([
          invoiceService.sendInvoiceToUser(invoiceDetails),
          invoiceService.sendAdminNotification(invoiceDetails),
        ]).catch(err => console.error('[Invoice] Error sending invoice emails:', err));
      }
    } catch (invoiceErr) {
      console.error("[Invoice] Failed to create invoice:", invoiceErr);
      // Don't throw - subscription is already activated
    }

    // Prepare response
    resStatusData(res, "success", "Subscription activated successfully", {
      subscription: {
        _id: subscription._id,
        userId: subscription.userId,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        graceEndDate: subscription.graceEndDate,
        tier: subscription.tier,
        duration: subscription.duration,
        amount: subscription.amount,
        currency: subscription.currency,
      },
      message:
        "Your subscription has been activated. You can now access all features!",
    });
  } catch (error: any) {
    console.error("Verify subscription error:", error);
    resStatusData(res, "error", "Failed to verify subscription", {
      error: error.message,
    });
  }
};

/**
 * GET /api/subscription/details
 * Get current active subscription details
 * Protected endpoint (auth required)
 */
export const getSubscriptionDetails = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;

    if (!userId) {
      resStatusData(res, "error", "User not authenticated", {});
      return;
    }

    // Find active subscription
    const subscription = await SubscriptionModel.findOne({
      userId,
      status: "active",
    }).populate("planId");

    if (!subscription) {
      resStatusData(res, "success", "No active subscription", {
        subscription: null,
        message: "User has no active subscription",
      });
      return;
    }

    // Check if subscription has expired
    if (subscription.endDate < new Date()) {
      subscription.status = "expired";
      await subscription.save();

      // Update user
      await User.findByIdAndUpdate(userId, {
        hasActiveSubscription: false,
        currentSubscriptionId: null,
      });

      resStatusData(res, "success", "Subscription expired", {
        subscription: null,
        message: "User subscription has expired",
      });
      return;
    }

    // Calculate days remaining
    const daysRemaining = Math.ceil(
      (subscription.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    // Calculate grace days remaining if applicable
    const graceDaysRemaining = subscription.graceEndDate 
      ? Math.max(0, Math.ceil((subscription.graceEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 0;

    resStatusData(res, "success", "Subscription details retrieved", {
      subscription: {
        _id: subscription._id,
        userId: subscription.userId,
        planId: subscription.planId,
        tier: subscription.tier,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        graceEndDate: subscription.graceEndDate,
        isInGracePeriod: subscription.isInGracePeriod,
        daysRemaining: daysRemaining,
        graceDaysRemaining: graceDaysRemaining,
        duration: subscription.duration,
        amount: subscription.amount,
        currency: subscription.currency,
        isExpiring: daysRemaining <= 7, // Flag if expiring in 7 days
        // Transaction details
        razorpayPaymentId: subscription.razorpayPaymentId,
        razorpayOrderId: subscription.razorpayOrderId,
        paymentStatus: subscription.paymentStatus,
        planName: (subscription.planId as any)?.name || "Business Plan",
      },
    });
  } catch (error: any) {
    console.error("Get subscription details error:", error);
    resStatusData(res, "error", "Failed to retrieve subscription details", {
      error: error.message,
    });
  }
};

/**
 * GET /api/subscription/history
 * Get all subscriptions (with limit)
 * Protected endpoint (auth required)
 */
export const getSubscriptionHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;

    if (!userId) {
      resStatusData(res, "error", "User not authenticated", {});
      return;
    }

    // Fetch subscriptions with limit
    const subscriptions = await SubscriptionModel.find({
      userId,
    })
      .populate("planId")
      .sort({ createdAt: -1 })
      .limit(50);

    resStatusData(res, "success", "Subscription history retrieved", {
      count: subscriptions.length,
      subscriptions: subscriptions.map((sub) => ({
        _id: sub._id,
        tier: sub.tier,
        status: sub.status,
        startDate: sub.startDate,
        endDate: sub.endDate,
        duration: sub.duration,
        amount: sub.amount,
        currency: sub.currency,
        createdAt: sub.createdAt,
        paymentStatus: sub.paymentStatus,
      })),
    });
  } catch (error: any) {
    console.error("Get subscription history error:", error);
    resStatusData(res, "error", "Failed to retrieve history", {
      error: error.message,
    });
  }
};

/**
 * POST /api/subscription/cancel
 * Cancel active subscription
 * Protected endpoint (auth required)
 */
export const cancelSubscription = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;
    const { reason } = req.body;

    if (!userId) {
      resStatusData(res, "error", "User not authenticated", {});
      return;
    }

    // Find active subscription
    const subscription = await SubscriptionModel.findOne({
      userId,
      status: "active",
    });

    if (!subscription) {
      resStatusData(res, "error", "No active subscription to cancel", {});
      return;
    }

    // Cancel subscription
    subscription.status = "cancelled";
    subscription.cancellationReason = reason || "User requested cancellation";
    subscription.cancellationDate = new Date();
    subscription.cancellationRequestedAt = new Date();

    await subscription.save();

    // Get user for cancellation email
    const user = await User.findById(userId);

    // Send cancellation confirmation email
    if (user) {
      const cancellationDetails = {
        invoiceId: `CANC-${Date.now()}-${userId.toString().slice(-6).toUpperCase()}`,
        userName: (user as any).username || (user as any).name || "User",
        userEmail: user.email || "noreply@lynkup.com",
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

      invoiceService.sendCancellationConfirmation(cancellationDetails)
        .catch(err => console.error('[Invoice] Error sending cancellation email:', err));
    }

    // Update user
    await User.findByIdAndUpdate(userId, {
      hasActiveSubscription: false,
      currentSubscriptionId: null,
    });

    resStatusData(res, "success", "Subscription cancelled successfully", {
      message: "Your subscription has been cancelled",
      cancelledAt: subscription.cancellationDate,
    });
  } catch (error: any) {
    console.error("Cancel subscription error:", error);
    resStatusData(res, "error", "Failed to cancel subscription", {
      error: error.message,
    });
  }
};

/**
 * GET /api/subscription/invoice/:subscriptionId
 * Get invoice details (placeholder for Phase 6)
 * Protected endpoint (auth required)
 */
export const getInvoice = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;
    const { subscriptionId } = req.params;

    if (!userId) {
      resStatusData(res, "error", "User not authenticated", {});
      return;
    }

    // Find subscription
    const subscription = await SubscriptionModel.findById(
      subscriptionId
    ).populate("planId");

    if (!subscription) {
      resStatusData(res, "error", "Subscription not found", {});
      return;
    }

    // Verify subscription belongs to user
    if (subscription.userId.toString() !== userId) {
      resStatusData(
        res,
        "error",
        "Subscription does not belong to this user",
        {}
      );
      return;
    }

    // Return invoice details
    resStatusData(res, "success", "Invoice details retrieved", {
      invoiceId: subscription.invoiceId,
      status: subscription.paymentStatus,
      details: {
        amount: subscription.amount,
        currency: subscription.currency,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        planName: (subscription.planId as any)?.name,
        tier: subscription.tier,
        duration: `${subscription.duration} months`,
      },
      // pdfUrl: subscription.invoiceUrl || "Generate PDF and return URL"
    });
  } catch (error: any) {
    console.error("Get invoice error:", error);
    resStatusData(res, "error", "Failed to retrieve invoice", {
      error: error.message,
    });
  }
};

/**
 * GET /api/subscription/status
 * Check subscription status for authenticated user
 * Returns detailed subscription information
 */
export const getSubscriptionStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;

    if (!userId) {
      resStatusData(res, "error", "User not authenticated", {});
      return;
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      resStatusData(res, "error", "User not found", {});
      return;
    }

    // Find active, expiring_soon, or grace_period subscription
    const subscription = await SubscriptionModel.findOne({
      userId,
      status: { $in: ["active", "expiring_soon", "grace_period"] },
    }).populate("planId");

    if (!subscription) {
      resStatusData(res, "success", "No active subscription", {
        hasActiveSubscription: false,
        requiresSubscription: user.userType === "business",
        subscriptionDetails: null,
      });
      return;
    }

    const now = new Date();

    // Check if fully expired (past grace period)
    const isFullyExpired = subscription.graceEndDate 
      ? subscription.graceEndDate < now 
      : subscription.endDate < now;

    if (isFullyExpired) {
      // Mark as expired using transaction
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
      } finally {
        session.endSession();
      }

      resStatusData(res, "success", "Subscription expired", {
        hasActiveSubscription: false,
        requiresSubscription: user.userType === "business",
        subscriptionDetails: {
          status: "expired",
          expiryDate: subscription.endDate,
          graceEndDate: subscription.graceEndDate,
          tier: subscription.tier,
        },
      });
      return;
    }

    // Check if in grace period
    const isInGracePeriod = subscription.endDate < now && 
      subscription.graceEndDate && subscription.graceEndDate >= now;

    // Calculate days remaining
    const daysRemaining = subscription.endDate > now
      ? Math.ceil((subscription.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const graceDaysRemaining = subscription.graceEndDate && subscription.graceEndDate > now
      ? Math.ceil((subscription.graceEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    resStatusData(res, "success", isInGracePeriod ? "Subscription in grace period" : "Active subscription found", {
      hasActiveSubscription: true,
      isInGracePeriod,
      subscriptionDetails: {
        id: subscription._id,
        tier: subscription.tier,
        duration: subscription.duration,
        status: isInGracePeriod ? "grace_period" : subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        graceEndDate: subscription.graceEndDate,
        expiryDate: subscription.endDate,
        daysRemaining,
        graceDaysRemaining,
        requiresRenewal: daysRemaining <= 7 || isInGracePeriod,
        amount: subscription.amount,
        planName: (subscription.planId as any)?.name || "Business Plan",
      },
    });
  } catch (error: any) {
    console.error("Get subscription status error:", error);
    resStatusData(res, "error", "Failed to get subscription status", {
      error: error.message,
    });
  }
};
