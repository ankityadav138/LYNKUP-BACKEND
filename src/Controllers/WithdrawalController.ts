import { Request, Response } from "express";
import Wallet from "../Models/Wallet";
import WalletTransaction from "../Models/WalletTransaction";
import WithdrawalRequest from "../Models/WithdrawalRequest";
import OfferModel from "../Models/offerModal";
import { resStatusData } from "../Responses/Response";

const MINIMUM_OFFER_AMOUNT = 20000;

/**
 * Get offers eligible for withdrawal
 */
export const getEligibleOffers = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;

    const eligibleOffers = await OfferModel.find({
      business_id: userId,
      is_eligible_for_withdrawal: true,
      withdrawal_requested: false,
      locked_amount: { $gt: 0 },
      isdeleted: false,
    })
      .select(
        "name locked_amount withdrawal_eligibility_date createdAt noOfBookings status"
      )
      .sort({ withdrawal_eligibility_date: -1 });

    return resStatusData(
      res,
      "success",
      "Eligible offers fetched successfully",
      {
        offers: eligibleOffers,
        total_eligible: eligibleOffers.length,
        total_amount: eligibleOffers.reduce(
          (sum, offer) => sum + (offer.locked_amount || 0),
          0
        ),
      }
    );
  } catch (error: any) {
    console.error("Get eligible offers error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * Create withdrawal request
 */
export const createWithdrawalRequest = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { offer_id, reason, bank_details } = req.body;

    // Validate bank details
    if (
      !bank_details?.account_holder_name ||
      !bank_details?.account_number ||
      !bank_details?.ifsc_code ||
      !bank_details?.bank_name
    ) {
      return resStatusData(
        res,
        "error",
        "Complete bank details required",
        null
      );
    }

    // Check if offer exists and is eligible
    const offer = await OfferModel.findOne({
      _id: offer_id,
      business_id: userId,
      is_eligible_for_withdrawal: true,
      withdrawal_requested: false,
    });

    if (!offer) {
      return resStatusData(
        res,
        "error",
        "Offer not found or not eligible for withdrawal",
        null
      );
    }

    // Check if there's already a pending request for this offer
    const existingRequest = await WithdrawalRequest.findOne({
      offer_id,
      status: "pending",
    });

    if (existingRequest) {
      return resStatusData(
        res,
        "error",
        "Withdrawal request already pending for this offer",
        null
      );
    }

    // Create withdrawal request
    const withdrawalRequest = await WithdrawalRequest.create({
      user_id: userId,
      offer_id,
      amount: offer.locked_amount || MINIMUM_OFFER_AMOUNT,
      reason: reason || "Offer criteria not met after 30 days",
      bank_details,
      status: "pending",
    });

    // Mark offer as withdrawal requested
    offer.withdrawal_requested = true;
    offer.withdrawal_request_id = withdrawalRequest._id as any;
    await offer.save();

    return resStatusData(
      res,
      "success",
      "Withdrawal request created successfully",
      withdrawalRequest
    );
  } catch (error: any) {
    console.error("Create withdrawal request error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * Get user's withdrawal requests
 */
export const getUserWithdrawalRequests = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = (req as any).user._id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const requests = await WithdrawalRequest.find({ user_id: userId })
      .populate("offer_id", "name createdAt noOfBookings")
      .sort({ requested_at: -1 })
      .skip(skip)
      .limit(limit);

    const total = await WithdrawalRequest.countDocuments({ user_id: userId });

    return resStatusData(
      res,
      "success",
      "Withdrawal requests fetched successfully",
      {
        requests,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(total / limit),
          total_records: total,
          per_page: limit,
        },
      }
    );
  } catch (error: any) {
    console.error("Get withdrawal requests error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * Cancel withdrawal request (user can cancel pending requests)
 */
export const cancelWithdrawalRequest = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { request_id } = req.params;

    const withdrawalRequest = await WithdrawalRequest.findOne({
      _id: request_id,
      user_id: userId,
      status: "pending",
    });

    if (!withdrawalRequest) {
      return resStatusData(
        res,
        "error",
        "Withdrawal request not found or cannot be cancelled",
        null
      );
    }

    // Update offer
    await OfferModel.updateOne(
      { _id: withdrawalRequest.offer_id },
      {
        $set: {
          withdrawal_requested: false,
          withdrawal_request_id: null,
        },
      }
    );

    // Delete the request
    await WithdrawalRequest.deleteOne({ _id: request_id });

    return resStatusData(
      res,
      "success",
      "Withdrawal request cancelled successfully",
      null
    );
  } catch (error: any) {
    console.error("Cancel withdrawal request error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * ADMIN: Get all withdrawal requests
 */
export const getAllWithdrawalRequests = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
    }

    const requests = await WithdrawalRequest.find(filter)
      .populate("user_id", "name email phone")
      .populate("offer_id", "name createdAt noOfBookings")
      .populate("processed_by", "name email")
      .sort({ requested_at: -1 })
      .skip(skip)
      .limit(limit);

    const total = await WithdrawalRequest.countDocuments(filter);

    return resStatusData(
      res,
      "success",
      "Withdrawal requests fetched successfully",
      {
        requests,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(total / limit),
          total_records: total,
          per_page: limit,
        },
      }
    );
  } catch (error: any) {
    console.error("Get all withdrawal requests error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * ADMIN: Approve withdrawal request
 */
export const approveWithdrawal = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).user._id;
    const { request_id } = req.params;
    const { admin_notes } = req.body;

    const withdrawalRequest = await WithdrawalRequest.findOne({
      _id: request_id,
      status: "pending",
    });

    if (!withdrawalRequest) {
      return resStatusData(
        res,
        "error",
        "Withdrawal request not found or already processed",
        null
      );
    }

    // Get wallet
    const wallet = await Wallet.findOne({
      user_id: withdrawalRequest.user_id,
    });
    if (!wallet) {
      return resStatusData(res, "error", "User wallet not found", null);
    }

    // Check if sufficient locked balance
    if (wallet.locked_balance < withdrawalRequest.amount) {
      return resStatusData(
        res,
        "error",
        "Insufficient locked balance",
        null
      );
    }

    // Debit from wallet (unlock and remove)
    await wallet.debit(withdrawalRequest.amount);

    // Create withdrawal transaction
    await WalletTransaction.create({
      wallet_id: wallet._id,
      user_id: withdrawalRequest.user_id,
      type: "withdrawal",
      amount: withdrawalRequest.amount,
      status: "completed",
      description: `Withdrawal approved for offer`,
      reference_type: "withdrawal",
      reference_id: withdrawalRequest._id,
      balance_before: wallet.total_balance + withdrawalRequest.amount,
      balance_after: wallet.total_balance,
      metadata: {
        bank_details: withdrawalRequest.bank_details,
      },
    });

    // Update withdrawal request
    withdrawalRequest.status = "approved";
    withdrawalRequest.processed_at = new Date();
    withdrawalRequest.processed_by = adminId;
    withdrawalRequest.admin_notes = admin_notes || "Approved";
    await withdrawalRequest.save();

    // Update offer
    await OfferModel.updateOne(
      { _id: withdrawalRequest.offer_id },
      {
        $set: {
          locked_amount: 0,
        },
      }
    );

    return resStatusData(
      res,
      "success",
      "Withdrawal request approved successfully",
      {
        withdrawal: withdrawalRequest,
        wallet_balance: {
          total_balance: wallet.total_balance,
          available_balance: wallet.available_balance,
          locked_balance: wallet.locked_balance,
        },
      }
    );
  } catch (error: any) {
    console.error("Approve withdrawal error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * ADMIN: Reject withdrawal request
 */
export const rejectWithdrawal = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).user._id;
    const { request_id } = req.params;
    const { admin_notes } = req.body;

    if (!admin_notes) {
      return resStatusData(
        res,
        "error",
        "Rejection reason is required",
        null
      );
    }

    const withdrawalRequest = await WithdrawalRequest.findOne({
      _id: request_id,
      status: "pending",
    });

    if (!withdrawalRequest) {
      return resStatusData(
        res,
        "error",
        "Withdrawal request not found or already processed",
        null
      );
    }

    // Update withdrawal request
    withdrawalRequest.status = "rejected";
    withdrawalRequest.processed_at = new Date();
    withdrawalRequest.processed_by = adminId;
    withdrawalRequest.admin_notes = admin_notes;
    await withdrawalRequest.save();

    // Update offer (make it available for another withdrawal request)
    await OfferModel.updateOne(
      { _id: withdrawalRequest.offer_id },
      {
        $set: {
          withdrawal_requested: false,
          withdrawal_request_id: null,
        },
      }
    );

    return resStatusData(
      res,
      "success",
      "Withdrawal request rejected successfully",
      withdrawalRequest
    );
  } catch (error: any) {
    console.error("Reject withdrawal error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};
