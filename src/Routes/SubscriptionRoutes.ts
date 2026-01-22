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
} from "../Controllers/SubscriptionController";
import { authMiddleware, businessMiddleware } from "../Middelware/Auth";

const router = express.Router();

// Public routes (no authentication required)
router.get("/plans", getSubscriptionPlans);

// Protected routes (authentication required)
router.post("/create-order", businessMiddleware, createSubscriptionOrder);
router.post("/verify", businessMiddleware, verifySubscription);
router.get("/details", businessMiddleware, getSubscriptionDetails);
router.get("/status", businessMiddleware, getSubscriptionStatus);
router.get("/history", businessMiddleware, getSubscriptionHistory);
router.post("/cancel", businessMiddleware, cancelSubscription);
router.get("/invoice/:subscriptionId", businessMiddleware, getInvoice);

export default router;
