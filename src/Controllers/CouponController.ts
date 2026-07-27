import { Request, Response } from "express";
import CouponModel from "../Models/CouponModel";
import UserModel from "../Models/UserModel";
import { resStatusData } from "../Responses/Response";

/**
 * POST /admin/coupons
 * Admin creates a new coupon
 */
export const createCoupon = async (req: Request, res: Response) => {
  try {
    const { name, code, discountPercent, usageType, assignedTo, expiryDate } = req.body;

    if (!name || !code || !discountPercent || !usageType) {
      return resStatusData(res, "error", "name, code, discountPercent and usageType are required", null);
    }

    if (discountPercent < 1 || discountPercent > 100) {
      return resStatusData(res, "error", "discountPercent must be between 1 and 100", null);
    }

    if (!["one_time", "multi_use"].includes(usageType)) {
      return resStatusData(res, "error", "usageType must be one_time or multi_use", null);
    }

    // Check duplicate code
    const existing = await CouponModel.findOne({ code: code.toUpperCase().trim() });
    if (existing) {
      return resStatusData(res, "error", `Coupon code '${code.toUpperCase()}' already exists`, null);
    }

    // If assignedTo provided, validate that user exists and is a business
    if (assignedTo) {
      const user = await UserModel.findById(assignedTo);
      if (!user) {
        return resStatusData(res, "error", "Assigned business user not found", null);
      }
    }

    const coupon = await CouponModel.create({
      name: name.trim(),
      code: code.toUpperCase().trim(),
      discountPercent: Number(discountPercent),
      usageType,
      assignedTo: assignedTo || null,
      expiryDate: expiryDate || null,
      isActive: true,
    });

    return resStatusData(res, "success", "Coupon created successfully", coupon);
  } catch (error: any) {
    console.error("Create coupon error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * GET /admin/coupons
 * Admin lists all coupons with usage info
 */
export const getAllCoupons = async (req: Request, res: Response) => {
  try {
    const coupons = await CouponModel.find({})
      .populate("assignedTo", "name email firstName lastName")
      .populate("usedBy", "name email firstName lastName")
      .sort({ createdAt: -1 });

    return resStatusData(res, "success", "Coupons fetched", coupons);
  } catch (error: any) {
    console.error("Get coupons error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * PATCH /admin/coupons/:id/toggle
 * Admin toggles coupon active status
 */
export const toggleCouponStatus = async (req: Request, res: Response) => {
  try {
    const coupon = await CouponModel.findById(req.params.id);
    if (!coupon) return resStatusData(res, "error", "Coupon not found", null);

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    return resStatusData(res, "success", `Coupon ${coupon.isActive ? "activated" : "deactivated"}`, coupon);
  } catch (error: any) {
    console.error("Toggle coupon error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * DELETE /admin/coupons/:id
 * Admin deletes a coupon
 */
export const deleteCoupon = async (req: Request, res: Response) => {
  try {
    const coupon = await CouponModel.findByIdAndDelete(req.params.id);
    if (!coupon) return resStatusData(res, "error", "Coupon not found", null);

    return resStatusData(res, "success", "Coupon deleted", { id: req.params.id });
  } catch (error: any) {
    console.error("Delete coupon error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * GET /subscription/coupon/validate?code=LYNKUP10
 * Business checks if a coupon is valid for them (used in checkout for display)
 */
export const validateCouponForUser = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id || (req as any).user?.id;
    const { code } = req.query;

    if (!code) return resStatusData(res, "error", "Coupon code is required", null);

    const coupon = await CouponModel.findOne({
      code: String(code).toUpperCase().trim(),
      isActive: true,
    });

    if (!coupon) return resStatusData(res, "error", "Invalid or expired coupon code", null);

    // Check expiry
    if (coupon.expiryDate && new Date() > coupon.expiryDate) {
      return resStatusData(res, "error", "Coupon has expired", null);
    }

    // Check if assigned to someone else
    if (coupon.assignedTo && String(coupon.assignedTo) !== String(userId)) {
      return resStatusData(res, "error", "This coupon is not valid for your account", null);
    }

    // Check one-time usage
    if (coupon.usageType === "one_time" && coupon.usedBy?.some((id) => String(id) === String(userId))) {
      return resStatusData(res, "error", "You have already used this coupon", null);
    }

    return resStatusData(res, "success", "Coupon is valid", {
      code: coupon.code,
      name: coupon.name,
      discountPercent: coupon.discountPercent,
      usageType: coupon.usageType,
    });
  } catch (error: any) {
    console.error("Validate coupon error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * GET /subscription/coupon/active
 * Gets the active coupon for the current business user
 */
export const getActiveCouponForUser = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id || (req as any).user?.id;

    // Find active coupon assigned to this specific business
    let coupon = await CouponModel.findOne({
      assignedTo: userId,
      isActive: true,
    });

    if (!coupon) {
      // Find global active coupon
      coupon = await CouponModel.findOne({
        assignedTo: null,
        isActive: true,
      });
    }

    if (coupon) {
      if (coupon.expiryDate && new Date() > coupon.expiryDate) {
        return resStatusData(res, "success", "No active coupon", null);
      }
      if (coupon.usageType === "one_time" && coupon.usedBy?.some((id) => String(id) === String(userId))) {
        return resStatusData(res, "success", "No active coupon", null);
      }

      return resStatusData(res, "success", "Active coupon fetched", {
        code: coupon.code,
        name: coupon.name,
        discountPercent: coupon.discountPercent,
        usageType: coupon.usageType,
      });
    }

    return resStatusData(res, "success", "No active coupon", null);
  } catch (error: any) {
    console.error("Get active coupon error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * Internal utility – find applicable coupon for a user during order creation
 * Returns the coupon or null if none applicable
 */
export const findApplicableCoupon = async (userId: string, couponCode?: string) => {
  try {
    // If a specific code is provided, look for that
    if (couponCode) {
      const coupon = await CouponModel.findOne({
        code: couponCode.toUpperCase().trim(),
        isActive: true,
      });
      if (!coupon) return null;
      if (coupon.expiryDate && new Date() > coupon.expiryDate) return null;
      if (coupon.assignedTo && String(coupon.assignedTo) !== String(userId)) return null;
      if (coupon.usageType === "one_time" && coupon.usedBy?.some((id) => String(id) === String(userId))) return null;
      return coupon;
    }

    // Auto-lookup: find any active coupon assigned to this specific business
    const assignedCoupon = await CouponModel.findOne({
      assignedTo: userId,
      isActive: true,
    });

    if (assignedCoupon) {
      if (assignedCoupon.expiryDate && new Date() > assignedCoupon.expiryDate) return null;
      if (
        assignedCoupon.usageType === "one_time" &&
        assignedCoupon.usedBy?.some((id) => String(id) === String(userId))
      )
        return null;
      return assignedCoupon;
    }

    return null;
  } catch {
    return null;
  }
};

/**
 * Internal utility – mark a coupon as used by a user after successful payment
 */
export const markCouponUsed = async (couponId: string, userId: string) => {
  try {
    await CouponModel.findByIdAndUpdate(couponId, {
      $inc: { usedCount: 1 },
      $addToSet: { usedBy: userId },
    });
  } catch (err) {
    console.error("Mark coupon used error:", err);
  }
};
