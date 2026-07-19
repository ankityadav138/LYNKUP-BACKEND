import express from "express";
import {
  getSubscriptionPlans,
  createSubscriptionOrder,
  verifySubscription,
  getSubscriptionDetails,
  getSubscriptionHistory,
  cancelSubscription,
  getInvoice,
  getSubscriptionStatus,
  upgradeSubscription,
  downgradeSubscription,
  toggleAutoRenewal,
  getAutoRenewalStatus,
  handleRenewalPaymentCallback,
} from "../Controllers/SubscriptionController";
import { authMiddleware, businessMiddleware } from "../Middelware/Auth";
import { requireDocumentVerification } from "../Middelware/DocumentVerificationMiddleware";

const router = express.Router();

// Public routes (no authentication required)
router.get("/plans", getSubscriptionPlans);

// Protected routes (authentication + document verification required for business users)
router.post("/create-order", businessMiddleware, requireDocumentVerification, createSubscriptionOrder);
router.post("/verify", businessMiddleware, requireDocumentVerification, verifySubscription);
router.get("/details", businessMiddleware, getSubscriptionDetails);
router.get("/status", businessMiddleware, getSubscriptionStatus);
router.get("/history", businessMiddleware, getSubscriptionHistory);
router.post("/cancel", businessMiddleware, cancelSubscription);
router.get("/invoice/:subscriptionId", businessMiddleware, getInvoice);

// Upgrade & Downgrade routes
router.post("/upgrade", businessMiddleware, requireDocumentVerification, upgradeSubscription);
router.post("/downgrade", businessMiddleware, requireDocumentVerification, downgradeSubscription);

// Auto-renewal routes
router.post("/auto-renewal/toggle", businessMiddleware, toggleAutoRenewal);
router.get("/auto-renewal/status", businessMiddleware, getAutoRenewalStatus);
router.post("/renewal/verify", businessMiddleware, handleRenewalPaymentCallback);

export default router;

