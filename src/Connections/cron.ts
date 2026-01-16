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

    const offers = await OfferModel.find({ ending_type: "booking" }).select("max_booking noOfBookings");
    const updatedByBookings = await OfferModel.updateMany(
      {
        ending_type: "booking",
        $expr: { $gte: ["$noOfBookings", "$max_booking"] },
        status: { $ne: "ended" },
      },
      { $set: { status: "ended" } }
    );
    const updatedToLive = await OfferModel.updateMany(
      {
        ending_type: "days",
        "valid.end": { $gte: currentDate },
        status: { $ne: "live" },
      },
      { $set: { status: "live" } }
    );

    console.log(`✅ Updated ${updatedByDays.modifiedCount} offers to 'ended' by 'days'.`);
    console.log(`✅ Updated ${updatedByBookings.modifiedCount} offers to 'ended' by 'booking'.`);
    console.log(`✅ Updated ${updatedToLive.modifiedCount} offers to 'live'.`);

  } catch (error) {
    console.error("❌ Error updating offers:", error);
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
      `✅ Marked ${eligibleOffers.modifiedCount} offers as eligible for withdrawal.`
    );
  } catch (error) {
    console.error("❌ Error marking offers eligible for withdrawal:", error);
  }
};

// Run every day at midnight
cron.schedule("0 0 * * *", () => {
  console.log("🕐 Running daily cron jobs...");
  updateOfferStatus();
  markOffersEligibleForWithdrawal();
});
