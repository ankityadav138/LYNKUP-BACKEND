import mongoose from "mongoose";

const withdrawalRequestSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    offer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "offers",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reason: {
      type: String,
      required: true,
    },
    requested_at: {
      type: Date,
      default: Date.now,
    },
    processed_at: {
      type: Date,
    },
    processed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    admin_notes: {
      type: String,
    },
    bank_details: {
      account_holder_name: {
        type: String,
        required: true,
      },
      account_number: {
        type: String,
        required: true,
      },
      ifsc_code: {
        type: String,
        required: true,
      },
      bank_name: {
        type: String,
        required: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
withdrawalRequestSchema.index({ user_id: 1, status: 1 });
withdrawalRequestSchema.index({ offer_id: 1 });
withdrawalRequestSchema.index({ status: 1, requested_at: -1 });

const WithdrawalRequest = mongoose.model(
  "WithdrawalRequest",
  withdrawalRequestSchema
);

export default WithdrawalRequest;
