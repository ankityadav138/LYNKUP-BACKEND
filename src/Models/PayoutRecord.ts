import mongoose, { Schema, model, Document } from "mongoose";

export interface IPayoutRecord extends Document {
  creator_id: mongoose.Types.ObjectId;
  business_id: mongoose.Types.ObjectId;
  booking_id?: mongoose.Types.ObjectId;
  offer_id: mongoose.Types.ObjectId;
  
  amount: number;
  payout_date: Date;
  payout_mode: "UPI" | "Bank Transfer" | "Cash";
  
  milestone_type?: "followers" | "reach" | "engagement" | "fixed";
  milestone_achieved?: string;
  
  upi_transaction_id?: string;
  bank_reference_number?: string;
  
  status: "pending" | "completed" | "failed";
  remarks?: string;
  added_by: mongoose.Types.ObjectId;
  
  invoice_generated: boolean;
  invoice_url?: string;
  invoice_number?: string;
}

const payoutRecordSchema = new Schema<IPayoutRecord>(
  {
    creator_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    business_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    booking_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "booking",
    },
    offer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "offer",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    payout_date: {
      type: Date,
      required: true,
      index: true,
    },
    payout_mode: {
      type: String,
      enum: ["UPI", "Bank Transfer", "Cash"],
      required: true,
    },
    milestone_type: {
      type: String,
      enum: ["followers", "reach", "engagement", "fixed"],
    },
    milestone_achieved: {
      type: String,
    },
    upi_transaction_id: {
      type: String,
    },
    bank_reference_number: {
      type: String,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "completed",
    },
    remarks: {
      type: String,
    },
    added_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    invoice_generated: {
      type: Boolean,
      default: false,
    },
    invoice_url: {
      type: String,
    },
    invoice_number: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for faster queries
payoutRecordSchema.index({ creator_id: 1, payout_date: -1 });
payoutRecordSchema.index({ business_id: 1, payout_date: -1 });
payoutRecordSchema.index({ offer_id: 1, creator_id: 1 });

const PayoutRecord = model<IPayoutRecord>("PayoutRecord", payoutRecordSchema);

export default PayoutRecord;
