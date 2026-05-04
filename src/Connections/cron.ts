import cron from "node-cron";
import mongoose from "mongoose";
import OfferModel from "../Models/offerModal";

export const updateOfferStatus = async () => {
  try {
    const currentDate = new Date();
    const updatedByDays = await OfferModel.updateMany(
      {
        ending_type: "days",
        "valid.end": { $lt: currentDate },
        status: { $ne: "ended" },
      },
      { $set: { status: "ended" } }
    );

    // Booking-quota auto-end disabled: offers are no longer ended based on max_booking.
    // Offers with ending_type "booking" now allow unlimited bookings.
    const updatedToLive = await OfferModel.updateMany(
      {
        ending_type: "days",
        "valid.end": { $gte: currentDate },
        status: { $ne: "live" },
      },
      { $set: { status: "live" } }
    );

    console.log(`[Cron] Updated ${updatedByDays.modifiedCount} offers to 'ended' by 'days'`);
    console.log(`[Cron] Updated ${updatedToLive.modifiedCount} offers to 'live'`);

  } catch (error) {
    console.error("[Cron] Error updating offers:", error);
  }
};

export const markOffersEligibleForWithdrawal = async () => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find offers that are 30+ days old and have locked amount
    const eligibleOffers = await OfferModel.updateMany(
      {
        createdAt: { $lte: thirtyDaysAgo },
        is_eligible_for_withdrawal: false,
        withdrawal_requested: false,
        locked_amount: { $gt: 0 },
        isdeleted: false,
      },
      {
        $set: { is_eligible_for_withdrawal: true },
      }
    );

    console.log(
      `[Cron] Marked ${eligibleOffers.modifiedCount} offers as eligible for withdrawal`
    );
  } catch (error) {
    console.error("[Cron] Error marking offers eligible for withdrawal:", error);
  }
};

// Run every day at midnight
cron.schedule("0 0 * * *", () => {
  console.log("[Cron] Running daily cron jobs...");
  updateOfferStatus();
  markOffersEligibleForWithdrawal();
});
