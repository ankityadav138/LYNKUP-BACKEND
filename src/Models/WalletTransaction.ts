import mongoose from "mongoose";

const walletTransactionSchema = new mongoose.Schema(
  {
    wallet_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    type: {
      type: String,
      enum: ["credit", "debit", "lock", "unlock", "refund", "withdrawal"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    description: {
      type: String,
      required: true,
    },
    reference_type: {
      type: String,
      enum: ["offer", "recharge", "withdrawal", "subscription", "refund"],
    },
    reference_id: {
      type: mongoose.Schema.Types.ObjectId,
    },
    razorpay_payment_id: {
      type: String,
    },
    razorpay_order_id: {
      type: String,
    },
    balance_before: {
      type: Number,
      required: true,
    },
    balance_after: {
      type: Number,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
walletTransactionSchema.index({ user_id: 1, createdAt: -1 });
walletTransactionSchema.index({ wallet_id: 1 });
walletTransactionSchema.index({ razorpay_payment_id: 1 });

const WalletTransaction = mongoose.model(
  "WalletTransaction",
  walletTransactionSchema
);

export default WalletTransaction;
