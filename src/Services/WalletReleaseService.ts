import Wallet from "../Models/Wallet";
import WalletTransaction from "../Models/WalletTransaction";
import OfferModel from "../Models/offerModal";

export type ReleaseReason = "ended" | "one_month_completed" | "deleted";

interface ReleaseResult {
  success: boolean;
  offerId?: any;
  offerName?: string;
  businessId?: any;
  amountUnlocked: number;
  reason?: string;
  error?: string;
}

/**
 * Release the locked security deposit/payment for a specific offer back to the business's wallet.
 */
export const releaseLockedAmountForOffer = async (
  offer: any,
  reason: ReleaseReason
): Promise<ReleaseResult> => {
  try {
    if (!offer.business_id) {
      return { success: false, amountUnlocked: 0, reason: "Offer has no business_id" };
    }

    const amountToUnlock =
      offer.locked_amount !== undefined && offer.locked_amount > 0
        ? offer.locked_amount
        : offer.collaboration_type === "paid"
        ? 20000 + (offer.original_fixed_amount || offer.fixed_amount || 0)
        : 20000;

    if (amountToUnlock <= 0) {
      return { success: false, amountUnlocked: 0, reason: "No locked amount on offer" };
    }

    const wallet = await Wallet.findOne({ user_id: offer.business_id });
    if (!wallet) {
      return { success: false, amountUnlocked: 0, reason: "Wallet not found for business" };
    }

    let actualUnlocked = 0;
    if (wallet.locked_balance > 0) {
      actualUnlocked = Math.min(wallet.locked_balance, amountToUnlock);
      if (actualUnlocked > 0) {
        await wallet.unlockAmount(actualUnlocked);

        let desc = "";
        if (reason === "ended") {
          desc = `Release of ₹${actualUnlocked.toLocaleString("en-IN")} locked security deposit/payment for ended offer: ${offer.name || ""}`;
        } else if (reason === "one_month_completed") {
          desc = `Release of ₹${actualUnlocked.toLocaleString("en-IN")} locked security deposit/payment (1 month completed) for offer: ${offer.name || ""}`;
        } else if (reason === "deleted") {
          desc = `Refund of ₹${actualUnlocked.toLocaleString("en-IN")} locked security deposit/payment for deleted offer: ${offer.name || ""}`;
        }

        await WalletTransaction.create({
          wallet_id: wallet._id,
          user_id: offer.business_id,
          type: "unlock",
          amount: actualUnlocked,
          status: "completed",
          description: desc,
          reference_type: "offer",
          reference_id: offer._id,
          balance_before: wallet.available_balance - actualUnlocked,
          balance_after: wallet.available_balance,
          metadata: {
            reason,
            offer_name: offer.name,
            collaboration_type: offer.collaboration_type,
          },
        });

        console.log(
          `✓ [WalletReleaseService] Released ₹${actualUnlocked} to business ${offer.business_id} (${reason}) for offer "${offer.name || offer._id}"`
        );
      }
    }

    // Always clear the offer's locked_amount so it cannot be released again
    offer.locked_amount = 0;
    offer.is_eligible_for_withdrawal = true;

    if (reason === "ended" && offer.status !== "ended") {
      offer.status = "ended";
    }

    await offer.save();

    return {
      success: true,
      offerId: offer._id,
      offerName: offer.name,
      businessId: offer.business_id,
      amountUnlocked: actualUnlocked,
      reason,
    };
  } catch (err: any) {
    console.error(`[WalletReleaseService] Error releasing offer ${offer._id}:`, err);
    return {
      success: false,
      offerId: offer._id,
      offerName: offer.name,
      businessId: offer.business_id,
      amountUnlocked: 0,
      error: err.message,
    };
  }
};

/**
 * Scan for offers that have ended or completed 1 month (30 days), and release their locked funds.
 * Optionally filter by businessId or offerId.
 */
export const processAllWalletReleases = async (options?: {
  businessId?: any;
  offerId?: any;
}) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const baseQuery: any = {
    locked_amount: { $gt: 0 },
    business_id: { $exists: true, $ne: null },
  };

  if (options?.businessId) {
    baseQuery.business_id = options.businessId;
  }
  if (options?.offerId) {
    baseQuery._id = options.offerId;
  }

  // Find offers meeting either:
  // 1. Offer is ended: status is "ended", OR (ending_type is "days" and valid.end < now)
  // 2. 1 Month is completed: withdrawal_eligibility_date <= now, OR createdAt <= 30 days ago
  const filter = {
    ...baseQuery,
    $or: [
      { status: "ended" },
      { ending_type: "days", "valid.end": { $lt: now } },
      { withdrawal_eligibility_date: { $lte: now } },
      { createdAt: { $lte: thirtyDaysAgo } },
      { isdeleted: true }, // if an offer was deleted but somehow still had locked_amount
    ],
  };

  const candidateOffers = await OfferModel.find(filter);

  let totalReleased = 0;
  let totalAmountUnlocked = 0;
  const results: ReleaseResult[] = [];

  for (const offer of candidateOffers) {
    let reason: ReleaseReason = "ended";

    const isEnded =
      offer.status === "ended" ||
      (offer.ending_type === "days" && offer.valid?.end && new Date(offer.valid.end) < now);

    const isMonthCompleted =
      (offer.withdrawal_eligibility_date && new Date(offer.withdrawal_eligibility_date) <= now) ||
      (offer.createdAt && new Date(offer.createdAt) <= thirtyDaysAgo);

    if (offer.isdeleted) {
      reason = "deleted";
    } else if (isEnded) {
      reason = "ended";
    } else if (isMonthCompleted) {
      reason = "one_month_completed";
    }

    const res = await releaseLockedAmountForOffer(offer, reason);
    results.push(res);

    if (res.success && res.amountUnlocked > 0) {
      totalReleased++;
      totalAmountUnlocked += res.amountUnlocked;
    }
  }

  return {
    totalChecked: candidateOffers.length,
    totalReleased,
    totalAmountUnlocked,
    results,
  };
};
