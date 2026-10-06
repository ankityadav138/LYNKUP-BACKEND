import { Request, Response } from "express";
import Wallet from "../Models/Wallet";
import WalletTransaction from "../Models/WalletTransaction";
import UserModel from "../Models/UserModel";
import OfferModel from "../Models/offerModal";
import { resStatusData } from "../Responses/Response";
import { invoiceService } from "../Services/InvoiceService";
import { processAllWalletReleases, releaseLockedAmountForOffer } from "../Services/WalletReleaseService";
import Razorpay from "razorpay";
import crypto from "crypto";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

const MINIMUM_OFFER_AMOUNT = 20000;

/**
 * Get or create wallet for user
 */
export const getOrCreateWallet = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;

    let wallet = await Wallet.findOne({ user_id: userId });

    if (!wallet) {
      wallet = await Wallet.create({
        user_id: userId,
        total_balance: 0,
        locked_balance: 0,
        available_balance: 0,
      });
    }

    return resStatusData(
      res,
      "success",
      "Wallet fetched successfully",
      wallet
    );
  } catch (error: any) {
    console.error("Get wallet error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * Get wallet balance
 * Auto-creates wallet if it doesn't exist for the user
 */
export const getWalletBalance = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;

    // Check & release any expired or 1-month-completed offers
    await processAllWalletReleases({ businessId: userId });

    // Get or create wallet if it doesn't exist
    let wallet = await Wallet.findOne({ user_id: userId });

    if (!wallet) {
      wallet = await Wallet.create({
        user_id: userId,
        total_balance: 0,
        locked_balance: 0,
        available_balance: 0,
      });
    }

    const balanceInfo = {
      total_balance: wallet.total_balance,
      available_balance: wallet.available_balance,
      locked_balance: wallet.locked_balance,
      minimum_offer_amount: MINIMUM_OFFER_AMOUNT,
      can_create_offer: wallet.available_balance >= MINIMUM_OFFER_AMOUNT,
      offers_possible: Math.floor(
        wallet.available_balance / MINIMUM_OFFER_AMOUNT
      ),
    };

    return resStatusData(
      res,
      "success",
      "Balance fetched successfully",
      balanceInfo
    );
  } catch (error: any) {
    console.error("Get balance error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * Create Razorpay order for wallet recharge
 */
export const createRechargeOrder = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { amount } = req.body;

    if (!amount || amount < 100) {
      return resStatusData(
        res,
        "error",
        "Amount must be at least ₹100",
        null
      );
    }

    // Get or create wallet
    let wallet = await Wallet.findOne({ user_id: userId });
    if (!wallet) {
      wallet = await Wallet.create({
        user_id: userId,
        total_balance: 0,
        locked_balance: 0,
        available_balance: 0,
      });
    }

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amount * 100, // Convert to paise
      currency: "INR",
      receipt: `rc_${userId.toString().slice(-6)}_${Date.now()}`,
    });

    // Create pending transaction
    const transaction = await WalletTransaction.create({
      wallet_id: wallet._id,
      user_id: userId,
      type: "credit",
      amount: amount,
      status: "pending",
      description: `Wallet recharge of ₹${amount}`,
      reference_type: "recharge",
      razorpay_order_id: razorpayOrder.id,
      balance_before: wallet.total_balance,
      balance_after: wallet.total_balance,
    });

    return resStatusData(res, "success", "Order created successfully", {
      order_id: razorpayOrder.id,
      amount: amount,
      currency: "INR",
      transaction_id: transaction._id,
    });
  } catch (error: any) {
    console.error("Create recharge order error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * Verify payment and credit wallet
 */
export const verifyRecharge = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount,
    } = req.body;

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return resStatusData(
        res,
        "error",
        "Invalid payment signature",
        null
      );
    }

    // Find transaction
    const transaction = await WalletTransaction.findOne({
      razorpay_order_id,
      user_id: userId,
      status: "pending",
    });

    if (!transaction) {
      return resStatusData(res, "error", "Transaction not found", null);
    }

    // Get wallet
    const wallet = await Wallet.findOne({ user_id: userId });
    if (!wallet) {
      return resStatusData(res, "error", "Wallet not found", null);
    }

    // Credit wallet
    await wallet.credit(transaction.amount);

    // Update transaction
    transaction.status = "completed";
    transaction.razorpay_payment_id = razorpay_payment_id;
    transaction.balance_after = wallet.total_balance;
    await transaction.save();

    // Get user details for invoice
    const user = await UserModel.findById(userId);
    if (user && user.email) {
      // Send wallet credit invoice
      invoiceService.sendWalletCreditInvoice({
        transactionId: transaction._id.toString(),
        userName: `${user.firstName} ${user.lastName || ""}`.trim(),
        userEmail: user.email,
        amount: transaction.amount,
        paymentMethod: "Razorpay",
        razorpayPaymentId: razorpay_payment_id,
        newBalance: wallet.total_balance,
        company: "LYNKUP",
      }).catch(err => console.error("Failed to send invoice:", err));
    }

    return resStatusData(res, "success", "Recharge successful", {
      wallet_balance: {
        total_balance: wallet.total_balance,
        available_balance: wallet.available_balance,
        locked_balance: wallet.locked_balance,
      },
      transaction: transaction,
    });
  } catch (error: any) {
    console.error("Verify recharge error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * Get wallet transactions
 */
export const getWalletTransactions = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const transactions = await WalletTransaction.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("reference_id");

    const total = await WalletTransaction.countDocuments({ user_id: userId });

    return resStatusData(res, "success", "Transactions fetched successfully", {
      transactions,
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total / limit),
        total_records: total,
        per_page: limit,
      },
    });
  } catch (error: any) {
    console.error("Get transactions error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * Admin: Get wallet transactions for a specific business by user_id param
 */
export const getAdminBusinessWalletTransactions = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Automatically check & release any ended or 1-month-completed offers for this business
    await processAllWalletReleases({ businessId: user_id });

    const transactions = await WalletTransaction.find({ user_id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await WalletTransaction.countDocuments({ user_id });

    // Fetch the updated wallet object so the UI can display live available/locked balances
    const wallet = await Wallet.findOne({ user_id });

    return resStatusData(res, "success", "Transactions fetched successfully", {
      transactions,
      wallet,
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total / limit),
        total_records: total,
        per_page: limit,
      },
    });
  } catch (error: any) {
    console.error("Admin get business wallet transactions error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * Admin: Trigger release of locked wallet funds (for ended offers or 1-month completed)
 * POST /admin/wallet/process-releases
 * Body: { businessId?: string, offerId?: string }
 */
export const adminProcessWalletReleases = async (req: Request, res: Response) => {
  try {
    const businessId = req.body?.businessId || req.query?.businessId;
    const offerId = req.body?.offerId || req.query?.offerId;

    const result = await processAllWalletReleases({
      businessId: businessId ? String(businessId) : undefined,
      offerId: offerId ? String(offerId) : undefined,
    });

    // Also get updated wallet if businessId was provided
    let updatedWallet = null;
    if (businessId) {
      updatedWallet = await Wallet.findOne({ user_id: businessId });
    }

    return resStatusData(res, "success", "Wallet releases processed successfully", {
      ...result,
      wallet: updatedWallet,
    });
  } catch (error: any) {
    console.error("Admin process wallet releases error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * Admin / Testing: Simulate offer date or status to test release scenarios
 * POST /admin/wallet/test-simulate-offer
 * Body: {
 *   offerId: string,
 *   scenario: "ended" | "one_month_completed"
 * }
 */
export const adminSimulateOfferDate = async (req: Request, res: Response) => {
  try {
    const { offerId, scenario } = req.body;
    if (!offerId) {
      return resStatusData(res, "error", "offerId is required", null);
    }

    const offer = await OfferModel.findById(offerId);
    if (!offer) {
      return resStatusData(res, "error", "Offer not found", null);
    }

    const now = new Date();
    if (scenario === "ended") {
      // Simulate offer end date yesterday
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      offer.ending_type = "days";
      offer.valid = {
        start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        end: yesterday,
      };
      offer.status = "ended";
      await offer.save();
    } else if (scenario === "one_month_completed") {
      // Simulate created 31 days ago and withdrawal eligibility in the past
      const past31Days = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
      offer.createdAt = past31Days;
      offer.withdrawal_eligibility_date = past31Days;
      await offer.save();
    } else {
      return resStatusData(
        res,
        "error",
        "scenario must be 'ended' or 'one_month_completed'",
        null
      );
    }

    // Now process the release!
    const releaseResult = await processAllWalletReleases({
      businessId: offer.business_id,
      offerId: offer._id,
    });

    const updatedWallet = await Wallet.findOne({ user_id: offer.business_id });
    const updatedOffer = await OfferModel.findById(offerId);

    return resStatusData(res, "success", `Simulated '${scenario}' and processed release`, {
      scenario,
      releaseResult,
      offer: updatedOffer,
      wallet: updatedWallet,
    });
  } catch (error: any) {
    console.error("Admin simulate offer date error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

/**
 * Admin: Manually deduct amount from a business wallet
 * POST /admin/wallet/deduct/:user_id
 * Body: { amount: number, reason: string }
 */
export const adminDeductWallet = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    const { amount, reason } = req.body;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return resStatusData(res, "error", "Valid amount is required", null);
    }
    if (!reason || String(reason).trim() === "") {
      return resStatusData(res, "error", "Reason is required", null);
    }

    const deductAmount = Number(amount);

    // Find the wallet
    const wallet = await Wallet.findOne({ user_id });
    if (!wallet) {
      return resStatusData(res, "error", "Wallet not found for this user", null);
    }

    // Check sufficient available balance
    if (wallet.available_balance < deductAmount) {
      return resStatusData(
        res,
        "error",
        `Insufficient available balance. Available: ₹${wallet.available_balance}`,
        null
      );
    }

    const balanceBefore = wallet.available_balance;

    // Deduct from available_balance and total_balance
    wallet.available_balance -= deductAmount;
    wallet.total_balance -= deductAmount;
    await wallet.save();

    const balanceAfter = wallet.available_balance;

    // Log the transaction
    await WalletTransaction.create({
      wallet_id: wallet._id,
      user_id,
      type: "debit",
      amount: deductAmount,
      status: "completed",
      description: `Admin deduction: ${String(reason).trim()}`,
      reference_type: "withdrawal",
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      metadata: { deductedBy: "admin", reason: String(reason).trim() },
    });

    return resStatusData(res, "success", "Amount deducted from wallet successfully", {
      deducted: deductAmount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      available_balance: wallet.available_balance,
      total_balance: wallet.total_balance,
      locked_balance: wallet.locked_balance,
    });
  } catch (error: any) {
    console.error("Admin deduct wallet error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};

export const checkOfferEligibility = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { offer_count = 1 } = req.query;

    let wallet = await Wallet.findOne({ user_id: userId });

    // Create wallet if it doesn't exist
    if (!wallet) {
      wallet = await Wallet.create({
        user_id: userId,
        total_balance: 0,
        locked_balance: 0,
        available_balance: 0,
      });
    }

    const requiredAmount = MINIMUM_OFFER_AMOUNT * Number(offer_count);
    const canCreateOffer = wallet.available_balance >= requiredAmount;

    return resStatusData(
      res,
      canCreateOffer ? "success" : "error",
      canCreateOffer ? "Eligible to create offer" : "Insufficient balance",
      {
        eligible: canCreateOffer,
        available_balance: wallet.available_balance,
        required_amount: requiredAmount,
        shortage: canCreateOffer
          ? 0
          : requiredAmount - wallet.available_balance,
        minimum_per_offer: MINIMUM_OFFER_AMOUNT,
      }
    );
  } catch (error: any) {
    console.error("Check eligibility error:", error);
    return resStatusData(res, "error", error.message, null);
  }
};
