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
import { notifySubscriptionUpgrade, subscriptionNotificationService } from "../Services/SubscriptionNotificationService";
import { findApplicableCoupon, markCouponUsed } from "./CouponController";

// Grace period in days
const GRACE_PERIOD_DAYS = 3;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});

const getPlanTier = (plan: any, tierId: string) => {
  return plan?.tiers?.find((tier: any) => tier.id === tierId) || null;
};

const calculateProration = (subscription: any) => {
  const now = new Date();
  const startDate = subscription.startDate ? new Date(subscription.startDate) : now;
  const endDate = subscription.endDate ? new Date(subscription.endDate) : now;
  const totalMs = Math.max(1, endDate.getTime() - startDate.getTime());
  const remainingMs = Math.max(0, endDate.getTime() - now.getTime());
  const totalDays = Math.max(1, Math.ceil(totalMs / DAY_IN_MS));
  const remainingDays = Math.max(0, Math.ceil(remainingMs / DAY_IN_MS));
  const credit = Number(((subscription.amount || 0) * (remainingMs / totalMs)).toFixed(2));

  return {
    credit,
    remainingDays,
    totalDays,
  };
};

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
    const plans = await SubscriptionPlanModel.find({
      isActive: true,
    });

    if (!plans || plans.length === 0) {
      resStatusData(res, "error", "Subscription plans not found", {});
      return;
    }

    resStatusData(res, "success", "Subscription plans retrieved", {
      plans: plans,
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
      status: { $in: ["active", "expiring_soon", "grace_period"] },
      endDate: { $gt: new Date() },
    }).populate("planId");

    const currentPlan = existingSubscription ? (existingSubscription.planId as any) : null;
    const currentTier = existingSubscription ? getPlanTier(currentPlan, existingSubscription.tier) : null;
    const currentPrice = existingSubscription ? Number(currentTier?.price ?? existingSubscription.amount ?? 0) : 0;
    const selectedPrice = Number(selectedTier.price);

    if (existingSubscription) {
      const currentPlanId = currentPlan?._id ? String((currentPlan as any)._id) : existingSubscription.planId ? String(existingSubscription.planId) : null;
      const selectedPlanId = String((plan as any)._id);

      if (currentPlanId === selectedPlanId && existingSubscription.tier === tier) {
        resStatusData(res, "error", "You are already subscribed to this plan.", {
          currentSubscription: {
            tier: existingSubscription.tier,
            endDate: existingSubscription.endDate,
            daysRemaining: Math.ceil((existingSubscription.endDate.getTime() - Date.now()) / DAY_IN_MS),
          },
        });
        return;
      }

      if (selectedPrice > currentPrice) {
        const proration = calculateProration(existingSubscription);
        const adjustedAmount = Math.max(0, Number((selectedPrice - proration.credit).toFixed(2)));

        if (adjustedAmount <= 0) {
          const upgradedSubscription = await SubscriptionModel.create({
            userId,
            planId,
            tier,
            duration: selectedTier.duration,
            status: "pending",
            paymentStatus: "completed",
            amount: 0,
            baseAmount: selectedPrice,
            prorationCredit: proration.credit,
            prorationDaysRemaining: proration.remainingDays,
            prorationTotalDays: proration.totalDays,
            changeType: "upgrade",
            replacesSubscriptionId: existingSubscription._id as any,
            currency: "INR",
            razorpayOrderId: `FREE-${Date.now()}`.slice(0, 40),
            metadata: {
              userAgent: req.get("user-agent"),
              ipAddress: req.ip,
              source: "web",
            },
          });

          resStatusData(res, "success", "Upgrade completed successfully", {
            paymentRequired: false,
            amount: 0,
            prorationCredit: proration.credit,
            adjustedAmount: 0,
            subscriptionId: upgradedSubscription._id,
            message: "Your upgrade was covered by remaining subscription value and is active immediately.",
          });
          return;
        }

        const razorpayOrder = await razorpay.orders.create({
          amount: Math.round(adjustedAmount * 1.18 * 100),
          currency: "INR",
          receipt: `SUB-UP-${Date.now()}`.slice(0, 40),
          notes: {
            userId: userId,
            planId: planId,
            tier: tier,
            duration: selectedTier.duration,
            changeType: "upgrade",
            replacesSubscriptionId: String(existingSubscription._id),
            baseAmount: String(selectedPrice),
            prorationCredit: String(proration.credit),
          },
        });

        let subscription = await SubscriptionModel.findOne({
          userId,
          status: "pending",
          paymentStatus: "pending",
          changeType: "upgrade",
          replacesSubscriptionId: existingSubscription._id,
        });

        if (subscription) {
          subscription.planId = planId as any;
          subscription.tier = tier;
          subscription.duration = selectedTier.duration;
          subscription.amount = adjustedAmount;
          subscription.baseAmount = selectedPrice;
          subscription.prorationCredit = proration.credit;
          subscription.prorationDaysRemaining = proration.remainingDays;
          subscription.prorationTotalDays = proration.totalDays;
          subscription.changeType = "upgrade";
          subscription.replacesSubscriptionId = existingSubscription._id as any;
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
            amount: adjustedAmount,
            baseAmount: selectedPrice,
            prorationCredit: proration.credit,
            prorationDaysRemaining: proration.remainingDays,
            prorationTotalDays: proration.totalDays,
            changeType: "upgrade",
            replacesSubscriptionId: existingSubscription._id,
            currency: "INR",
            razorpayOrderId: razorpayOrder.id,
            metadata: {
              userAgent: req.get("user-agent"),
              ipAddress: req.ip,
              source: "web",
            },
          });
        }

        resStatusData(res, "success", "Upgrade order created successfully", {
          orderId: razorpayOrder.id,
          subscriptionId: subscription._id,
          amount: adjustedAmount,
          prorationCredit: proration.credit,
          baseAmount: selectedPrice,
          adjustedAmount,
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
        return;
      }

      if (selectedPrice < currentPrice) {
        existingSubscription.changeType = "downgrade";
        existingSubscription.scheduledPlanId = planId as any;
        existingSubscription.scheduledTier = tier;
        existingSubscription.scheduledAmount = selectedPrice;
        existingSubscription.scheduledEffectiveDate = existingSubscription.endDate;
        existingSubscription.scheduledAt = new Date();
        await existingSubscription.save();

        resStatusData(res, "success", "Downgrade scheduled successfully", {
          paymentRequired: false,
          message: "Your downgrade will apply on the next renewal after the current billing cycle ends.",
          currentSubscription: {
            tier: existingSubscription.tier,
            endDate: existingSubscription.endDate,
            daysRemaining: Math.ceil((existingSubscription.endDate.getTime() - Date.now()) / DAY_IN_MS),
          },
          scheduledChange: {
            planId,
            tier,
            amount: selectedPrice,
            effectiveDate: existingSubscription.endDate,
          },
        });
        return;
      }

      resStatusData(res, "error", "This plan change cannot be processed.", {
        currentSubscription: {
          tier: existingSubscription.tier,
          amount: currentPrice,
          endDate: existingSubscription.endDate,
        },
      });
      return;
    }

    // ── Coupon auto-lookup ──────────────────────────────────────────────────
    const couponCode = req.body.couponCode || null;
    const applicableCoupon = await findApplicableCoupon(String(userId), couponCode);

    let finalPrice = selectedPrice;
    let discountAmount = 0;
    let discountPercent = 0;
    let couponId: any = null;
    let appliedCouponCode: string | null = null;

    if (applicableCoupon) {
      discountPercent = applicableCoupon.discountPercent;
      discountAmount = Math.round((selectedPrice * discountPercent) / 100);
      finalPrice = Math.max(0, selectedPrice - discountAmount);
      couponId = applicableCoupon._id;
      appliedCouponCode = applicableCoupon.code;
    }

    // ── Free order (100% coupon) — skip Razorpay, activate immediately ──────
    if (finalPrice <= 0) {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + selectedTier.duration);
      const graceEndDate = new Date(endDate);
      graceEndDate.setDate(graceEndDate.getDate() + GRACE_PERIOD_DAYS);

      const subscription = await SubscriptionModel.create({
        userId,
        planId,
        tier,
        duration: selectedTier.duration,
        status: "active",
        paymentStatus: "completed",
        amount: 0,
        baseAmount: selectedPrice,
        changeType: "new",
        currency: "INR",
        razorpayOrderId: `FREE-${Date.now()}`.slice(0, 40),
        startDate,
        endDate,
        graceEndDate,
        isInGracePeriod: false,
        ...(couponId ? {
          couponId,
          couponCode: appliedCouponCode,
          discountPercent,
          discountAmount,
          originalAmount: selectedPrice,
        } : {}),
        metadata: {
          userAgent: req.get("user-agent"),
          ipAddress: req.ip,
          source: "web",
        },
      });

      // Activate atomically: expire old subs + update user record
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
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
        console.error("[Subscription] Free-order transaction failed, rolling back:", txError);
        throw txError;
      } finally {
        session.endSession();
      }

      // Mark coupon used only after successful activation
      if (couponId) {
        markCouponUsed(String(couponId), String(userId)).catch((err) =>
          console.error("[Coupon] Failed to mark coupon used:", err)
        );
      }

      resStatusData(res, "success", "Order created successfully", {
        paymentRequired: false,
        subscriptionId: subscription._id,
        amount: 0,
        currency: "INR",
        userEmail: user.email,
        coupon: applicableCoupon ? {
          code: appliedCouponCode,
          name: applicableCoupon.name,
          discountPercent,
          discountAmount,
          originalAmount: selectedPrice,
          finalAmount: 0,
        } : null,
        planDetails: {
          name: plan.name,
          tier: selectedTier.id,
          duration: `${selectedTier.duration} month(s)`,
          price: selectedPrice,
        },
      });
      return;
    }

    // ── Paid order — create Razorpay order with 18% GST ────────────────────
    // Razorpay minimum is ₹1 (100 paise). Enforce it to prevent BAD_REQUEST_ERROR.
    const razorpayAmount = Math.max(100, Math.round(finalPrice * 1.18 * 100));
    const razorpayOrder = await razorpay.orders.create({
      amount: razorpayAmount,
      currency: "INR",
      receipt: `SUB-${Date.now()}`.slice(0, 40),
      notes: {
        userId: userId,
        planId: planId,
        tier: tier,
        duration: selectedTier.duration,
        changeType: "new",
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
      subscription.amount = finalPrice;
      subscription.razorpayOrderId = razorpayOrder.id;
      subscription.razorpayPaymentId = undefined;
      subscription.razorpaySignature = undefined;
      if (couponId) {
        subscription.couponId = couponId;
        subscription.couponCode = appliedCouponCode!;
        subscription.discountPercent = discountPercent;
        subscription.discountAmount = discountAmount;
        subscription.originalAmount = selectedPrice;
      }
      await subscription.save();
    } else {
      subscription = await SubscriptionModel.create({
        userId,
        planId,
        tier,
        duration: selectedTier.duration,
        status: "pending",
        paymentStatus: "pending",
        amount: finalPrice,
        baseAmount: selectedPrice,
        changeType: "new",
        currency: "INR",
        razorpayOrderId: razorpayOrder.id,
        ...(couponId ? {
          couponId,
          couponCode: appliedCouponCode,
          discountPercent,
          discountAmount,
          originalAmount: selectedPrice,
        } : {}),
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
      amount: finalPrice,
      currency: "INR",
      userEmail: user.email,
      coupon: applicableCoupon ? {
        code: appliedCouponCode,
        name: applicableCoupon.name,
        discountPercent,
        discountAmount,
        originalAmount: selectedPrice,
        finalAmount: finalPrice,
      } : null,
      planDetails: {
        name: plan.name,
        tier: selectedTier.id,
        duration: `${selectedTier.duration} month(s)`,
        price: selectedPrice,
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

    // Mark coupon as used (non-blocking)
    if (subscription.couponId) {
      markCouponUsed(String(subscription.couponId), String(userId)).catch((err) =>
        console.error("[Coupon] Failed to mark coupon used:", err)
      );
    }

    if (subscription.changeType === "upgrade" && subscription.replacesSubscriptionId) {
      try {
        const previousSubscription = await SubscriptionModel.findById(subscription.replacesSubscriptionId);
        await notifySubscriptionUpgrade(
          userId.toString(),
          previousSubscription?.tier || "current",
          subscription.tier
        );
      } catch (notifErr) {
        console.error("[Notification] Failed to send upgrade notification:", notifErr);
      }
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
      const plan = await SubscriptionPlanModel.findById(subscription.planId);

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
        baseAmount: subscription.baseAmount,
        prorationCredit: subscription.prorationCredit,
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
      status: { $in: ["active", "expiring_soon", "grace_period"] },
    }).populate("planId");

    if (!subscription) {
      resStatusData(res, "success", "No active subscription", {
        subscription: null,
        message: "User has no active subscription",
      });
      return;
    }

    // Safely coerce to Date objects regardless of how MongoDB stored them
    const endDateObj = subscription.endDate ? new Date(subscription.endDate as any) : null;
    const graceEndDateObj = subscription.graceEndDate
      ? new Date(subscription.graceEndDate as any)
      : null;
    const now = new Date();

    // Only hard-expire if BOTH endDate AND graceEndDate have passed.
    // Leave the actual status transitions (active → grace_period → expired) to the cron job.
    if (endDateObj && endDateObj < now) {
      if (graceEndDateObj && graceEndDateObj >= now) {
        // Still within grace period — allow access, update status if stale
        if (subscription.status !== "grace_period") {
          subscription.status = "grace_period";
          subscription.isInGracePeriod = true;
          await subscription.save();
        }
      } else if (!graceEndDateObj) {
        // No grace end date set — compute it (3 days after endDate) for legacy records
        const computedGraceEnd = new Date(endDateObj);
        computedGraceEnd.setDate(computedGraceEnd.getDate() + 3);
        if (computedGraceEnd >= now) {
          subscription.status = "grace_period";
          subscription.isInGracePeriod = true;
          subscription.graceEndDate = computedGraceEnd;
          await subscription.save();
        } else {
          // Truly expired — just report no active subscription; let cron clean up
          resStatusData(res, "success", "No active subscription", {
            subscription: null,
            message: "User has no active subscription",
          });
          return;
        }
      } else {
        // Grace period also passed — truly expired
        resStatusData(res, "success", "No active subscription", {
          subscription: null,
          message: "User has no active subscription",
        });
        return;
      }
    }

    // Calculate days remaining
    const daysRemaining = endDateObj
      ? Math.max(0, Math.ceil((endDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    // Calculate grace days remaining if applicable
    const updatedGraceEndDateObj = subscription.graceEndDate
      ? new Date(subscription.graceEndDate as any)
      : null;
    const graceDaysRemaining = updatedGraceEndDateObj && !isNaN(updatedGraceEndDateObj.getTime())
      ? Math.max(0, Math.ceil((updatedGraceEndDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
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
        baseAmount: subscription.baseAmount,
        prorationCredit: subscription.prorationCredit,
        currency: subscription.currency,
        isExpiring: daysRemaining <= 7, // Flag if expiring in 7 days
        scheduledChange: subscription.scheduledPlanId ? {
          planId: subscription.scheduledPlanId,
          tier: subscription.scheduledTier,
          amount: subscription.scheduledAmount,
          effectiveDate: subscription.scheduledEffectiveDate,
          requestedAt: subscription.scheduledAt,
          changeType: subscription.changeType,
        } : null,
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
/**
 * POST /api/subscription/upgrade
 * Upgrade active subscription to a higher-priced plan
 * Calculates remaining credit: credit = amount - (amount / totalDays * daysElapsed)
 * Charges: newPlanPrice - remainingCredit
 * Protected endpoint (auth + business required)
 */
export const upgradeSubscription = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;
    const { planId, tier } = req.body;

    if (!userId) {
      resStatusData(res, "error", "User not authenticated", {});
      return;
    }

    if (!planId || !tier) {
      resStatusData(res, "error", "planId and tier are required", {});
      return;
    }

    // Find current active subscription
    const currentSubscription = await SubscriptionModel.findOne({
      userId,
      status: { $in: ["active", "expiring_soon"] },
      endDate: { $gt: new Date() },
    }).populate("planId");

    if (!currentSubscription) {
      resStatusData(res, "error", "No active subscription found to upgrade", {});
      return;
    }

    // Fetch the target plan
    const targetPlan = await SubscriptionPlanModel.findById(planId);
    if (!targetPlan || !targetPlan.isActive) {
      resStatusData(res, "error", "Target subscription plan not found or inactive", {});
      return;
    }

    const targetTier = targetPlan.tiers.find((t) => t.id === tier);
    if (!targetTier) {
      resStatusData(res, "error", "Selected tier not available in the target plan", {});
      return;
    }

    const currentPlan = currentSubscription.planId as any;
    const currentTier = getPlanTier(currentPlan, currentSubscription.tier);
    const currentPrice = Number(currentTier?.price ?? currentSubscription.amount ?? 0);
    const newPrice = Number(targetTier.price);

    // Enforce that this is indeed an upgrade (new price must be higher)
    if (newPrice <= currentPrice) {
      resStatusData(res, "error", "Target plan must be more expensive than current plan for an upgrade. Use /downgrade for plan reductions.", {
        currentPlanPrice: currentPrice,
        targetPlanPrice: newPrice,
      });
      return;
    }

    // Check if same plan + tier
    const currentPlanId = currentPlan?._id ? String(currentPlan._id) : String(currentSubscription.planId);
    if (currentPlanId === String(planId) && currentSubscription.tier === tier) {
      resStatusData(res, "error", "You are already subscribed to this plan and tier.", {});
      return;
    }

    // --- Proration Calculation ---
    // Formula: remainingCredit = paidAmount - (paidAmount / totalDays * daysElapsed)
    const now = new Date();
    const startDate = new Date(currentSubscription.startDate);
    const endDate = new Date(currentSubscription.endDate);

    const totalMs = Math.max(1, endDate.getTime() - startDate.getTime());
    const elapsedMs = Math.max(0, now.getTime() - startDate.getTime());
    const remainingMs = Math.max(0, endDate.getTime() - now.getTime());

    const totalDays = Math.ceil(totalMs / DAY_IN_MS);
    const elapsedDays = Math.floor(elapsedMs / DAY_IN_MS);
    const remainingDays = Math.ceil(remainingMs / DAY_IN_MS);

    const paidAmount = Number(currentSubscription.amount);
    const dailyRate = paidAmount / totalDays;
    const consumedValue = Number((dailyRate * elapsedDays).toFixed(2));
    const remainingCredit = Number((paidAmount - consumedValue).toFixed(2));

    const amountToPay = Number(Math.max(0, newPrice - remainingCredit).toFixed(2));

    const user = await User.findById(userId);
    if (!user) {
      resStatusData(res, "error", "User not found", {});
      return;
    }

    // If credit fully covers the upgrade cost
    if (amountToPay <= 0) {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        // Mark old subscription as expired/replaced
        currentSubscription.status = "expired";
        currentSubscription.cancellationReason = "Upgraded to higher plan";
        currentSubscription.cancellationDate = now;
        await currentSubscription.save({ session });

        // Create new upgraded subscription immediately (free)
        const newEndDate = new Date(now);
        newEndDate.setMonth(newEndDate.getMonth() + targetTier.duration);
        const newGraceEndDate = new Date(newEndDate);
        newGraceEndDate.setDate(newGraceEndDate.getDate() + GRACE_PERIOD_DAYS);

        const newSubscription = await SubscriptionModel.create([{
          userId,
          planId,
          tier,
          duration: targetTier.duration,
          status: "active",
          paymentStatus: "completed",
          startDate: now,
          endDate: newEndDate,
          graceEndDate: newGraceEndDate,
          isInGracePeriod: false,
          amount: 0,
          baseAmount: newPrice,
          prorationCredit: remainingCredit,
          prorationDaysRemaining: remainingDays,
          prorationTotalDays: totalDays,
          changeType: "upgrade",
          replacesSubscriptionId: currentSubscription._id as any,
          currency: "INR",
          razorpayOrderId: `FREE-UP-${Date.now()}`.slice(0, 40),
          metadata: {
            userAgent: req.get("user-agent"),
            ipAddress: req.ip,
            source: "web",
          },
        }], { session });

        await User.findByIdAndUpdate(
          userId,
          {
            currentSubscriptionId: newSubscription[0]._id,
            hasActiveSubscription: true,
            subscriptionExpiryDate: newEndDate,
          },
          { session }
        );

        await session.commitTransaction();

        try {
          await notifySubscriptionUpgrade(userId.toString(), currentSubscription.tier, tier);
        } catch (_) {}

        resStatusData(res, "success", "Upgrade completed — fully covered by remaining credit", {
          paymentRequired: false,
          subscriptionId: newSubscription[0]._id,
          previousPlan: {
            tier: currentSubscription.tier,
            amountPaid: paidAmount,
          },
          prorationDetails: {
            totalDays,
            elapsedDays,
            remainingDays,
            dailyRate: Number(dailyRate.toFixed(2)),
            consumedValue,
            remainingCredit,
          },
          newPlan: {
            planId,
            tier,
            basePrice: newPrice,
            amountCharged: 0,
            startDate: now,
            endDate: newEndDate,
          },
        });
        return;
      } catch (txError) {
        await session.abortTransaction();
        throw txError;
      } finally {
        session.endSession();
      }
    }

    // Payment is required — create Razorpay order for the difference (include 18% GST)
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amountToPay * 1.18 * 100), // paise
      currency: "INR",
      receipt: `UP-${Date.now()}`.slice(0, 40),
      notes: {
        userId: String(userId),
        planId: String(planId),
        tier,
        duration: String(targetTier.duration),
        changeType: "upgrade",
        replacesSubscriptionId: String(currentSubscription._id),
        baseAmount: String(newPrice),
        prorationCredit: String(remainingCredit),
        elapsedDays: String(elapsedDays),
        remainingDays: String(remainingDays),
        totalDays: String(totalDays),
      },
    });

    // Upsert pending upgrade subscription record
    let pendingUpgrade = await SubscriptionModel.findOne({
      userId,
      status: "pending",
      paymentStatus: "pending",
      changeType: "upgrade",
      replacesSubscriptionId: currentSubscription._id,
    });

    if (pendingUpgrade) {
      pendingUpgrade.planId = planId as any;
      pendingUpgrade.tier = tier;
      pendingUpgrade.duration = targetTier.duration;
      pendingUpgrade.amount = amountToPay;
      pendingUpgrade.baseAmount = newPrice;
      pendingUpgrade.prorationCredit = remainingCredit;
      pendingUpgrade.prorationDaysRemaining = remainingDays;
      pendingUpgrade.prorationTotalDays = totalDays;
      pendingUpgrade.razorpayOrderId = razorpayOrder.id;
      pendingUpgrade.razorpayPaymentId = undefined;
      pendingUpgrade.razorpaySignature = undefined;
      await pendingUpgrade.save();
    } else {
      pendingUpgrade = await SubscriptionModel.create({
        userId,
        planId,
        tier,
        duration: targetTier.duration,
        status: "pending",
        paymentStatus: "pending",
        amount: amountToPay,
        baseAmount: newPrice,
        prorationCredit: remainingCredit,
        prorationDaysRemaining: remainingDays,
        prorationTotalDays: totalDays,
        changeType: "upgrade",
        replacesSubscriptionId: currentSubscription._id,
        currency: "INR",
        razorpayOrderId: razorpayOrder.id,
        metadata: {
          userAgent: req.get("user-agent"),
          ipAddress: req.ip,
          source: "web",
        },
      });
    }

    resStatusData(res, "success", "Upgrade order created — proceed with payment", {
      paymentRequired: true,
      orderId: razorpayOrder.id,
      subscriptionId: pendingUpgrade._id,
      currency: "INR",
      userEmail: user.email,
      prorationDetails: {
        totalDays,
        elapsedDays,
        remainingDays,
        dailyRate: Number(dailyRate.toFixed(2)),
        consumedValue,
        remainingCredit,
        formula: `${paidAmount} - (${paidAmount}/${totalDays} × ${elapsedDays}) = ${remainingCredit} credit`,
      },
      pricing: {
        currentPlanPrice: currentPrice,
        newPlanPrice: newPrice,
        remainingCredit,
        amountToPay,
        gstRate: 18,
        gstAmount: Number((amountToPay * 0.18).toFixed(2)),
        totalWithGst: Number((amountToPay * 1.18).toFixed(2)),
        breakdown: `₹${newPrice} - ₹${remainingCredit} credit = ₹${amountToPay} + 18% GST = ₹${Number((amountToPay * 1.18).toFixed(2))}`,
      },
      currentPlan: {
        tier: currentSubscription.tier,
        endDate: currentSubscription.endDate,
        daysRemaining: remainingDays,
      },
      newPlan: {
        planId,
        tier,
        duration: `${targetTier.duration} month(s)`,
        basePrice: newPrice,
        discount: targetTier.discount,
        description: targetTier.description,
      },
    });
  } catch (error: any) {
    console.error("[Upgrade] Error:", error);
    resStatusData(res, "error", "Failed to process upgrade", {
      error: error.message,
    });
  }
};

/**
 * POST /api/subscription/downgrade
 * Downgrade active subscription to a lower-priced plan
 * Calculates remaining credit: credit = amount - (amount / totalDays * daysElapsed)
 * The downgrade is scheduled at the END of the current billing cycle.
 * Remaining credit is stored and applied to the next billing cycle automatically.
 * Protected endpoint (auth + business required)
 */
export const downgradeSubscription = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;
    const { planId, tier } = req.body;

    if (!userId) {
      resStatusData(res, "error", "User not authenticated", {});
      return;
    }

    if (!planId || !tier) {
      resStatusData(res, "error", "planId and tier are required", {});
      return;
    }

    // Find current active subscription
    const currentSubscription = await SubscriptionModel.findOne({
      userId,
      status: { $in: ["active", "expiring_soon"] },
      endDate: { $gt: new Date() },
    }).populate("planId");

    if (!currentSubscription) {
      resStatusData(res, "error", "No active subscription found to downgrade", {});
      return;
    }

    // Fetch the target plan
    const targetPlan = await SubscriptionPlanModel.findById(planId);
    if (!targetPlan || !targetPlan.isActive) {
      resStatusData(res, "error", "Target subscription plan not found or inactive", {});
      return;
    }

    const targetTier = targetPlan.tiers.find((t) => t.id === tier);
    if (!targetTier) {
      resStatusData(res, "error", "Selected tier not available in the target plan", {});
      return;
    }

    const currentPlan = currentSubscription.planId as any;
    const currentTier = getPlanTier(currentPlan, currentSubscription.tier);
    const currentPrice = Number(currentTier?.price ?? currentSubscription.amount ?? 0);
    const newPrice = Number(targetTier.price);

    // Enforce that this is indeed a downgrade
    if (newPrice >= currentPrice) {
      resStatusData(res, "error", "Target plan must be cheaper than current plan for a downgrade. Use /upgrade for plan increases.", {
        currentPlanPrice: currentPrice,
        targetPlanPrice: newPrice,
      });
      return;
    }

    // Check if same plan + tier
    const currentPlanId = currentPlan?._id ? String(currentPlan._id) : String(currentSubscription.planId);
    if (currentPlanId === String(planId) && currentSubscription.tier === tier) {
      resStatusData(res, "error", "You are already on this plan and tier.", {});
      return;
    }

    // --- Proration Calculation ---
    // Formula: remainingCredit = paidAmount - (paidAmount / totalDays * daysElapsed)
    const now = new Date();
    const startDate = new Date(currentSubscription.startDate);
    const endDate = new Date(currentSubscription.endDate);

    const totalMs = Math.max(1, endDate.getTime() - startDate.getTime());
    const elapsedMs = Math.max(0, now.getTime() - startDate.getTime());
    const remainingMs = Math.max(0, endDate.getTime() - now.getTime());

    const totalDays = Math.ceil(totalMs / DAY_IN_MS);
    const elapsedDays = Math.floor(elapsedMs / DAY_IN_MS);
    const remainingDays = Math.ceil(remainingMs / DAY_IN_MS);

    const paidAmount = Number(currentSubscription.amount);
    const dailyRate = paidAmount / totalDays;
    const consumedValue = Number((dailyRate * elapsedDays).toFixed(2));
    const remainingCredit = Number((paidAmount - consumedValue).toFixed(2));

    // For downgrade: keep using the current plan until it expires,
    // then start the new cheaper plan with the remaining credit applied.
    // The credit reduces the cost of the next (downgraded) billing cycle.
    const creditAppliedToNewPlan = Number(Math.min(remainingCredit, newPrice).toFixed(2));
    const amountDueAtRenewal = Number(Math.max(0, newPrice - creditAppliedToNewPlan).toFixed(2));

    // Check if a downgrade is already scheduled and cancel it first
    if (currentSubscription.scheduledPlanId) {
      currentSubscription.scheduledPlanId = undefined as any;
      currentSubscription.scheduledTier = undefined;
      currentSubscription.scheduledAmount = undefined;
      currentSubscription.scheduledEffectiveDate = undefined;
      currentSubscription.scheduledAt = undefined;
    }

    // Schedule the downgrade to take effect at end of current billing cycle
    currentSubscription.changeType = "downgrade";
    currentSubscription.scheduledPlanId = planId as any;
    currentSubscription.scheduledTier = tier;
    currentSubscription.scheduledAmount = amountDueAtRenewal; // what user pays at renewal
    currentSubscription.scheduledEffectiveDate = endDate;
    currentSubscription.scheduledAt = now;
    // Store the remaining credit in prorationCredit for use at renewal
    currentSubscription.prorationCredit = remainingCredit;
    currentSubscription.prorationDaysRemaining = remainingDays;
    currentSubscription.prorationTotalDays = totalDays;

    await currentSubscription.save();

    resStatusData(res, "success", "Downgrade scheduled successfully", {
      paymentRequired: false,
      message: `Your current ${currentSubscription.tier} plan remains active until ${endDate.toDateString()}. The downgrade to ${tier} will apply automatically at renewal.`,
      prorationDetails: {
        totalDays,
        elapsedDays,
        remainingDays,
        dailyRate: Number(dailyRate.toFixed(2)),
        consumedValue,
        remainingCredit,
        formula: `${paidAmount} - (${paidAmount}/${totalDays} × ${elapsedDays}) = ${remainingCredit} credit`,
      },
      currentPlan: {
        tier: currentSubscription.tier,
        endDate,
        daysRemaining: remainingDays,
        amountPaid: paidAmount,
      },
      scheduledDowngrade: {
        planId,
        tier,
        newPlanBasePrice: newPrice,
        remainingCreditApplied: creditAppliedToNewPlan,
        amountDueAtRenewal,
        effectiveDate: endDate,
        breakdown: `₹${newPrice} - ₹${creditAppliedToNewPlan} credit = ₹${amountDueAtRenewal} due at renewal`,
      },
    });
  } catch (error: any) {
    console.error("[Downgrade] Error:", error);
    resStatusData(res, "error", "Failed to process downgrade", {
      error: error.message,
    });
  }
};

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
        features: (subscription.planId as any)?.features || [],
      },
    });
  } catch (error: any) {
    console.error("Get subscription status error:", error);
    resStatusData(res, "error", "Failed to get subscription status", {
      error: error.message,
    });
  }
};

/**
 * POST /api/subscription/auto-renewal/toggle
 * Enable or disable auto-renewal for the active subscription
 * Protected endpoint (auth required)
 */
export const toggleAutoRenewal = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;
    const { enabled } = req.body;

    if (!userId) {
      resStatusData(res, "error", "User not authenticated", {});
      return;
    }

    if (typeof enabled !== "boolean") {
      resStatusData(res, "error", "enabled (boolean) is required", {});
      return;
    }

    // Find active subscription
    const subscription = await SubscriptionModel.findOne({
      userId,
      status: { $in: ["active", "expiring_soon", "grace_period"] },
    });

    if (!subscription) {
      resStatusData(res, "error", "No active subscription found", {});
      return;
    }

    // Update auto-renewal preference
    subscription.autoRenewalEnabled = enabled;
    if (enabled) {
      subscription.autoRenewalOptedInAt = new Date();
      // Set nextBillingDate to endDate (so cron can pick it up)
      subscription.nextBillingDate = subscription.endDate;
    }
    await subscription.save();

    // Send push notification about the preference change
    try {
      const user = await User.findById(userId);
      if (user && user.playerId && user.playerId.length > 0) {
        const { sendNotification } = await import("./NotificationController");
        await sendNotification(
          user.playerId,
          enabled ? "✅ Auto-Renewal Enabled" : "🔕 Auto-Renewal Disabled",
          enabled
            ? `Your subscription will automatically renew on ${subscription.endDate.toDateString()}.`
            : "Auto-renewal has been disabled. Remember to renew manually before your subscription expires.",
          "",
          enabled ? "auto_renewal_enabled" : "auto_renewal_disabled"
        );
      }
    } catch (notifErr) {
      console.error("[AutoRenewal] Notification error:", notifErr);
    }

    resStatusData(res, "success", `Auto-renewal ${enabled ? "enabled" : "disabled"} successfully`, {
      autoRenewalEnabled: enabled,
      nextBillingDate: enabled ? subscription.endDate : null,
      message: enabled
        ? `Auto-renewal is ON. You will be notified before your next billing date.`
        : "Auto-renewal is OFF. Your subscription will not renew automatically.",
    });
  } catch (error: any) {
    console.error("Toggle auto-renewal error:", error);
    resStatusData(res, "error", "Failed to update auto-renewal preference", {
      error: error.message,
    });
  }
};

/**
 * GET /api/subscription/auto-renewal/status
 * Get auto-renewal status and next billing details
 * Protected endpoint (auth required)
 */
export const getAutoRenewalStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;

    if (!userId) {
      resStatusData(res, "error", "User not authenticated", {});
      return;
    }

    const subscription = await SubscriptionModel.findOne({
      userId,
      status: { $in: ["active", "expiring_soon", "grace_period"] },
    }).populate("planId");

    if (!subscription) {
      resStatusData(res, "success", "No active subscription", {
        autoRenewalEnabled: false,
        hasActiveSubscription: false,
      });
      return;
    }

    const daysUntilRenewal = subscription.endDate
      ? Math.max(0, Math.ceil((subscription.endDate.getTime() - Date.now()) / DAY_IN_MS))
      : 0;

    resStatusData(res, "success", "Auto-renewal status retrieved", {
      autoRenewalEnabled: subscription.autoRenewalEnabled || false,
      autoRenewalOptedInAt: subscription.autoRenewalOptedInAt || null,
      nextBillingDate: subscription.endDate,
      daysUntilRenewal,
      amount: subscription.amount,
      currency: subscription.currency || "INR",
      tier: subscription.tier,
      duration: subscription.duration,
      planName: (subscription.planId as any)?.name || "Business Plan",
      // Failure tracking
      renewalFailureCount: subscription.renewalFailureCount || 0,
      renewalFailureReason: subscription.renewalFailureReason || null,
      paymentFailedAt: subscription.paymentFailedAt || null,
      accessRestrictedAt: subscription.accessRestrictedAt || null,
      isAccessRestricted: !!subscription.accessRestrictedAt,
    });
  } catch (error: any) {
    console.error("Get auto-renewal status error:", error);
    resStatusData(res, "error", "Failed to get auto-renewal status", {
      error: error.message,
    });
  }
};

/**
 * POST /api/subscription/renewal/verify
 * Verify payment for auto-renewal and activate the renewed subscription
 * Same flow as verifySubscription but creates a new record with changeType "renewal"
 * Protected endpoint (auth required)
 */
export const handleRenewalPaymentCallback = async (
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

    if (!userId) {
      resStatusData(res, "error", "User not authenticated", {});
      return;
    }

    if (!razorpay_payment_id || !razorpay_order_id || !subscriptionId) {
      resStatusData(res, "error", "Missing payment details", {});
      return;
    }

    const isTestMode = !razorpay_signature || razorpay_signature === "undefined";

    if (!process.env.RAZORPAY_KEY_SECRET) {
      resStatusData(res, "error", "Razorpay configuration error", {});
      return;
    }

    // Verify signature (production) or API (test mode)
    if (!isTestMode && razorpay_signature) {
      const body = `${razorpay_order_id}|${razorpay_payment_id}`;
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        resStatusData(res, "error", "Invalid payment signature", {});
        return;
      }
    } else if (isTestMode) {
      const paymentResponse = await razorpay.payments.fetch(razorpay_payment_id);
      if (paymentResponse.status !== "captured") {
        resStatusData(res, "error", "Payment not successfully captured", {});
        return;
      }
      if (paymentResponse.order_id !== razorpay_order_id) {
        resStatusData(res, "error", "Order ID mismatch", {});
        return;
      }
    }

    // Find the pending renewal subscription record
    const pendingRenewal = await SubscriptionModel.findById(subscriptionId);
    if (!pendingRenewal) {
      resStatusData(res, "error", "Renewal subscription record not found", {});
      return;
    }

    if (pendingRenewal.userId.toString() !== userId) {
      resStatusData(res, "error", "Subscription does not belong to this user", {});
      return;
    }

    if (pendingRenewal.razorpayOrderId !== razorpay_order_id) {
      resStatusData(res, "error", "Order ID mismatch", {});
      return;
    }

    // Activate the renewal
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + pendingRenewal.duration);

    const graceEndDate = new Date(endDate);
    graceEndDate.setDate(graceEndDate.getDate() + GRACE_PERIOD_DAYS);

    pendingRenewal.razorpayPaymentId = razorpay_payment_id;
    pendingRenewal.razorpaySignature = razorpay_signature;
    pendingRenewal.paymentStatus = "completed";
    pendingRenewal.status = "active";
    pendingRenewal.startDate = startDate;
    pendingRenewal.endDate = endDate;
    pendingRenewal.graceEndDate = graceEndDate;
    pendingRenewal.isInGracePeriod = false;
    pendingRenewal.nextBillingDate = endDate;
    // Reset failure tracking
    pendingRenewal.renewalFailureCount = 0;
    pendingRenewal.renewalFailureReason = undefined;
    pendingRenewal.paymentFailedAt = undefined;
    pendingRenewal.accessRestrictedAt = undefined;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await pendingRenewal.save({ session });

      // Expire the old subscription(s) for this user
      await SubscriptionModel.updateMany(
        {
          userId,
          _id: { $ne: pendingRenewal._id },
          status: { $in: ["active", "expiring_soon", "grace_period"] },
        },
        {
          $set: {
            status: "expired",
            cancellationReason: "Replaced by renewal subscription",
            cancellationDate: new Date(),
          },
        },
        { session }
      );

      await User.findByIdAndUpdate(
        userId,
        {
          currentSubscriptionId: pendingRenewal._id,
          hasActiveSubscription: true,
          subscriptionExpiryDate: endDate,
        },
        { session, new: true }
      );

      await session.commitTransaction();
    } catch (txError) {
      await session.abortTransaction();
      console.error("[Renewal] Transaction failed:", txError);
      throw txError;
    } finally {
      session.endSession();
    }

    // Send renewal success notification (non-blocking)
    try {
      const user = await User.findById(userId);
      if (user && user.playerId && user.playerId.length > 0) {
        const { sendNotification } = await import("./NotificationController");
        await sendNotification(
          user.playerId,
          "🎉 Subscription Renewed!",
          `Your ${pendingRenewal.tier.toUpperCase()} subscription has been renewed successfully. Valid until ${endDate.toDateString()}.`,
          "",
          "subscription_renewed"
        );
      }
    } catch (notifErr) {
      console.error("[Renewal] Notification error:", notifErr);
    }

    // Create invoice for renewal (non-blocking)
    try {
      const user = await User.findById(userId);
      const plan = await SubscriptionPlanModel.findById(pendingRenewal.planId);
      if (user) {
        const planName = plan?.name || "Business Plan";
        const invoice = await InvoiceModel.create({
          userId,
          subscriptionId: pendingRenewal._id,
          type: "subscription",
          amount: pendingRenewal.amount,
          currency: pendingRenewal.currency || "INR",
          razorpayPaymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id,
          planName,
          billingEmail: user.email || "noreply@lynkup.com",
          invoiceDate: new Date(),
        });

        const invoiceDetails = {
          invoiceId: invoice.invoiceNumber,
          userName: `${(user as any).firstName || ""} ${(user as any).lastName || ""}`.trim() || "User",
          userEmail: user.email || "noreply@lynkup.com",
          subscriptionId: (pendingRenewal._id as any).toString(),
          planName,
          tier: pendingRenewal.tier,
          amount: pendingRenewal.amount,
          currency: pendingRenewal.currency || "INR",
          startDate: pendingRenewal.startDate,
          endDate: pendingRenewal.endDate,
          duration: pendingRenewal.duration,
          discount: 0,
          features: plan?.features || [],
          company: "LYNKUP",
        };

        Promise.all([
          invoiceService.sendInvoiceToUser(invoiceDetails),
          invoiceService.sendAdminNotification(invoiceDetails),
        ]).catch(err => console.error("[Renewal] Invoice email error:", err));
      }
    } catch (invoiceErr) {
      console.error("[Renewal] Invoice creation error:", invoiceErr);
    }

    resStatusData(res, "success", "Subscription renewed successfully", {
      subscription: {
        _id: pendingRenewal._id,
        status: pendingRenewal.status,
        tier: pendingRenewal.tier,
        startDate: pendingRenewal.startDate,
        endDate: pendingRenewal.endDate,
        autoRenewalEnabled: pendingRenewal.autoRenewalEnabled,
      },
      message: "Your subscription has been renewed. Enjoy uninterrupted access!",
    });
  } catch (error: any) {
    console.error("Renewal payment callback error:", error);
    resStatusData(res, "error", "Failed to verify renewal payment", {
      error: error.message,
    });
  }
};
