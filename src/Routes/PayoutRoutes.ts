import { Express } from "express";
import { errCatch } from "../utils/errorCatch";
import { businessMiddleware, userMiddleware } from "../Middelware/Auth";
import {
  getBookingsForPayout,
  getPayoutHistory,
  getInfluencerEarnings,
  getPayoutDetails,
} from "../Controllers/PayoutController";

export const payoutRoutes = (app: Express): void => {
  // Business Routes - VIEW ONLY (Payout History & Pending)
  // Note: Only ADMIN can record payouts, business can only view
  app.get(
    "/business/payouts/pending",
    businessMiddleware,
    errCatch(getBookingsForPayout)
  );

  app.get(
    "/business/payouts/history",
    businessMiddleware,
    errCatch(getPayoutHistory)
  );

  app.get(
    "/business/payouts/:booking_id",
    businessMiddleware,
    errCatch(getPayoutDetails)
  );

  // Influencer Routes - Earnings Tracking
  app.get(
    "/influencer/earnings",
    userMiddleware,
    errCatch(getInfluencerEarnings)
  );

  app.get(
    "/influencer/earnings/:booking_id",
    userMiddleware,
    errCatch(getPayoutDetails)
  );
};
