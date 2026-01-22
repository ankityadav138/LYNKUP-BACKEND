import { Request, Response, NextFunction } from "express";
import Wallet from "../Models/Wallet";
import WalletTransaction from "../Models/WalletTransaction";
import { resStatusData } from "../Responses/Response";

/**
 * Middleware to check if business has sufficient wallet balance for offer creation
 * Locks ₹20,000 as security deposit
 */
export const requireWalletBalance = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;
    const SECURITY_DEPOSIT = 20000; // ₹20,000

    if (!userId) {
      resStatusData(res, "error", "User not authenticated", {});
      return;
    }

    // Find user's wallet
    const wallet = await Wallet.findOne({ user_id: userId });

    if (!wallet) {
      resStatusData(res, "error", "Wallet not found. Please contact support.", {
        code: "WALLET_NOT_FOUND",
      });
      return;
    }

    // Check if sufficient balance available
    if (wallet.available_balance < SECURITY_DEPOSIT) {
      resStatusData(
        res,
        "error",
        `Insufficient wallet balance. You need ₹${SECURITY_DEPOSIT.toLocaleString()} to create an offer.`,
        {
          code: "INSUFFICIENT_WALLET_BALANCE",
          required: SECURITY_DEPOSIT,
          available: wallet.available_balance,
          shortfall: SECURITY_DEPOSIT - wallet.available_balance,
          action: "ADD_FUNDS",
        }
      );
      return;
    }

    // ⚠️ DO NOT lock funds here - let the controller lock after validation passes
    // Just pass wallet info to controller
    (req as any).walletInfo = {
      wallet: wallet,
      securityDeposit: SECURITY_DEPOSIT,
      walletId: wallet._id,
    };

    next();
  } catch (error: any) {
    console.error("Wallet middleware error:", error);
    resStatusData(res, "error", "Failed to process wallet balance check", {
      error: error.message,
    });
    return;
  }
};

/**
 * Middleware to unlock funds if offer creation fails
 * Should be used in error handler
 */
export const unlockWalletOnError = async (
  req: Request,
  walletId: string,
  amount: number
): Promise<void> => {
  try {
    const wallet = await Wallet.findById(walletId);
    if (wallet) {
      await wallet.unlockAmount(amount);
      console.log(`✓ Unlocked ₹${amount} due to offer creation failure`);
    }
  } catch (error) {
    console.error("Error unlocking funds on failure:", error);
  }
};

/**
 * Helper function to create wallet transaction record
 */
export const createWalletTransaction = async (
  walletId: string,
  userId: string,
  type: string,
  amount: number,
  description: string,
  metadata?: any
) => {
  try {
    const transaction = await WalletTransaction.create({
      wallet_id: walletId,
      user_id: userId,
      type,
      amount,
      description,
      status: "completed",
      metadata,
    });
    return transaction;
  } catch (error) {
    console.error("Error creating wallet transaction:", error);
    throw error;
  }
};
