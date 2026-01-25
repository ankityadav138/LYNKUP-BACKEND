import { Request, Response, NextFunction } from "express";
import User from "../Models/UserModel";
import { resStatusData } from "../Responses/Response";

/**
 * Middleware to check if business user's documents are verified
 * Blocks access to subscription features for unverified businesses
 */
export const requireDocumentVerification = async (
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

    // Get user details
    const user = await User.findById(userId);

    if (!user) {
      resStatusData(res, "error", "User not found", {});
      return;
    }

    // Only check for business users
    if (user.userType === "business") {
      if (!user.documentVerified) {
        resStatusData(
          res,
          "error",
          "Your business documents are under review. You cannot access subscription features until your documents are verified.",
          {
            code: "DOCUMENTS_NOT_VERIFIED",
            action: "WAIT_FOR_APPROVAL",
            documentVerified: false,
            profileStatus: user.profile_status || "under_review",
          }
        );
        return;
      }
    }

    // Attach verification status to request
    (req as any).documentVerified = user.documentVerified;
    (req as any).profileStatus = user.profile_status;

    next();
  } catch (error: any) {
    console.error("Document verification middleware error:", error);
    resStatusData(res, "error", "Failed to verify document status", {
      error: error.message,
    });
  }
};

/**
 * Middleware to attach document verification status without blocking
 * Use this for dashboard and profile pages
 */
export const attachVerificationStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;

    if (userId) {
      const user = await User.findById(userId);
      if (user) {
        (req as any).documentVerified = user.documentVerified || false;
        (req as any).profileStatus = user.profile_status || "under_review";
      }
    }

    next();
  } catch (error) {
    // Don't block on error, just continue
    next();
  }
};
