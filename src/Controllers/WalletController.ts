import { Request, Response } from "express";
import Wallet from "../Models/Wallet";
import WalletTransaction from "../Models/WalletTransaction";
import { resStatusData } from "../Responses/Response";
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
 */
export const getWalletBalance = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;

    const wallet = await Wallet.findOne({ user_id: userId });

    if (!wallet) {
      return resStatusData(res, "error", "Wallet not found", null);
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

    console.log("Wallet like here",wallet)

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amount * 100, // Convert to paise
      currency: "INR",
      receipt: `rc_${userId.toString().slice(-6)}_${Date.now()}`,
    });
    
    console.log("Razorpay order created:", razorpayOrder);

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
 * Check if user can create offer
 */
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
