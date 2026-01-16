import { Request, Response } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import User from "../Models/UserModel";
import SubscriptionModel from "../Models/SubscriptionModel";
import SubscriptionPlanModel from "../Models/SubscriptionPlanModel";
import { resStatusData } from "../Responses/Response";
import { invoiceService } from "../Services/InvoiceService";

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
    console.log(req);
    const { planId, tier } = req.body;

    console.log("planid and tier", planId, tier);

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
    if (!["silver", "gold", "platinum", "diamond"].includes(tier)) {
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

    // Create Subscription record with "pending" status
    const subscription = await SubscriptionModel.create({
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
    
    console.log("PAYMENT INFORMATION",  razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      subscriptionId,)

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
      console.log("Test mode detected - verifying payment via Razorpay API");
      
      // Fetch payment details from Razorpay API
      const paymentResponse = await razorpay.payments.fetch(razorpay_payment_id);
      console.log("Payment details from Razorpay:", paymentResponse);
      
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

    subscription.startDate = startDate;
    subscription.endDate = endDate;

    await subscription.save();

    // Get user for invoice details
    const user = await User.findById(userId);
    const plan = await SubscriptionPlanModel.findOne({ isActive: true });

    // Send invoice emails
    // if (user && plan) {
    //   const invoiceDetails = {
    //     invoiceId: `INV-${Date.now()}-${userId.toString().slice(-6).toUpperCase()}`,
    //     userName: (user as any).username || (user as any).name || "User",
    //     userEmail: user.email || "noreply@lynkup.com",
    //     subscriptionId: (subscription._id as any).toString(),
    //     planName: plan.name,
    //     tier: subscription.tier,
    //     amount: subscription.amount,
    //     currency: subscription.currency || "INR",
    //     startDate: subscription.startDate,
    //     endDate: subscription.endDate,
    //     duration: subscription.duration,
    //     discount: 0,
    //     features: plan.features,
    //     company: "Lynkup",
    //   };

      // Promise.all([
      //   invoiceService.sendInvoiceToUser(invoiceDetails),
      //   invoiceService.sendAdminNotification(invoiceDetails),
      // ]).catch(err => console.error('[Invoice] Error sending invoice:', err));
    // }

    // Update user with subscription details
    const userUpdate = {
      currentSubscriptionId: subscription._id,
      hasActiveSubscription: true,
      subscriptionExpiryDate: endDate,
      // Backward compatibility fields
      activesubscription: true,
      subscriptionPlanDuration: `${subscription.duration} months`,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate,
      razorpayPaymentId: razorpay_payment_id,
      subscriptionAmount: subscription.amount,
    };

    console.log("Updating user with subscription details:", userUpdate);
    const updatedUser = await User.findByIdAndUpdate(userId, userUpdate, { new: true });
    console.log("User updated successfully:", {
      userId: updatedUser?._id,
      hasActiveSubscription: updatedUser?.hasActiveSubscription,
      currentSubscriptionId: updatedUser?.currentSubscriptionId,
    });

    // Prepare response
    resStatusData(res, "success", "Subscription activated successfully", {
      subscription: {
        _id: subscription._id,
        userId: subscription.userId,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
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
        activesubscription: false,
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

    resStatusData(res, "success", "Subscription details retrieved", {
      subscription: {
        _id: subscription._id,
        userId: subscription.userId,
        planId: subscription.planId,
        tier: subscription.tier,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        daysRemaining: daysRemaining,
        duration: subscription.duration,
        amount: subscription.amount,
        currency: subscription.currency,
        isExpiring: daysRemaining <= 7, // Flag if expiring in 7 days
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
      activesubscription: false,
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
