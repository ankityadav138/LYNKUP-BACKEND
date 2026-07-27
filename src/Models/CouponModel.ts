import mongoose, { Schema, Document, model, ObjectId } from "mongoose";

export interface ICoupon extends Document {
  name: string;                             // Display name e.g. "Welcome Back 20%"
  code: string;                             // e.g. "LYNKUP20" – always uppercase
  discountPercent: number;                  // 1–100
  usageType: "one_time" | "multi_use";
  assignedTo?: ObjectId;                    // null = global; set = business-specific
  isActive: boolean;
  usedCount: number;
  usedBy?: ObjectId[];                      // track which users have redeemed
  expiryDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const couponSchema = new Schema<ICoupon>(
  {
    name: { type: String, required: true, trim: true },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    discountPercent: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },
    usageType: {
      type: String,
      required: true,
      enum: ["one_time", "multi_use"],
      default: "one_time",
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: false,
      default: null,
    },
    isActive: { type: Boolean, default: true, index: true },
    usedCount: { type: Number, default: 0 },
    usedBy: [{ type: Schema.Types.ObjectId, ref: "users" }],
    expiryDate: { type: Date, required: false },
  },
  { timestamps: true }
);

couponSchema.index({ assignedTo: 1, isActive: 1 });

const CouponModel = model<ICoupon>("Coupon", couponSchema);
export default CouponModel;
