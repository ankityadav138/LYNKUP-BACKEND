import mongoose, { Schema, model, Document, ObjectId } from "mongoose";

export interface SubscriptionData extends Document {
  userId: ObjectId; // Reference to User
  planId: ObjectId; // Reference to SubscriptionPlan
  tier: string; // "silver", "gold", "platinum", "diamond"
  duration: number; // 1, 3, 6, 12 (months)
  status: "pending" | "active" | "expiring_soon" | "grace_period" | "expired" | "cancelled";
  paymentStatus: "pending" | "completed" | "failed";
  startDate: Date;
  endDate: Date;
  graceEndDate?: Date; // 3 days after endDate
  isInGracePeriod?: boolean;
  amount: number; // amount paid in INR
  currency: string; // "INR"
  baseAmount?: number; // original plan amount before proration or adjustment
  prorationCredit?: number; // credit applied from the previous subscription
  prorationDaysRemaining?: number;
  prorationTotalDays?: number;
  changeType?: "upgrade" | "downgrade" | "renewal" | "new";
  replacesSubscriptionId?: ObjectId;
  scheduledPlanId?: ObjectId;
  scheduledTier?: string;
  scheduledAmount?: number;
  scheduledEffectiveDate?: Date;
  scheduledAt?: Date;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  invoiceId?: string;
  invoiceUrl?: string;
  invoiceSentAt?: Date;
  cancellationReason?: string;
  cancellationDate?: Date;
  cancellationRequestedAt?: Date;
  renewalDate?: Date; // for future auto-renewal feature
  // Auto-renewal fields
  autoRenewalEnabled?: boolean; // user opt-in for auto-renewal
  autoRenewalOptedInAt?: Date; // when user opted in
  nextBillingDate?: Date; // same as endDate, stored for indexing
  lastRenewalAttemptAt?: Date; // when the renewal cron last tried
  renewalFailureCount?: number; // consecutive renewal failures
  renewalFailureReason?: string; // last failure message from Razorpay
  paymentFailedAt?: Date; // timestamp of last payment failure
  accessRestrictedAt?: Date; // when access was restricted due to non-payment
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    source?: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

// Schema for subscription transaction records
const subscriptionSchema = new Schema<SubscriptionData>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
      index: true,
    },
    tier: {
      type: String,
      required: true,
      enum: ["silver", "gold", "platinum", "diamond", "pro"],
    },
    duration: {
      type: Number,
      required: true,
      enum: [1, 3, 6, 12],
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "active", "expiring_soon", "grace_period", "expired", "cancelled"],
      default: "pending",
      index: true,
    },
    paymentStatus: {
      type: String,
      required: true,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    startDate: {
      type: Date,
      required: false,
    },
    endDate: {
      type: Date,
      required: false,
    },
    graceEndDate: {
      type: Date,
      required: false,
    },
    isInGracePeriod: {
      type: Boolean,
      default: false,
    },
    amount: {
      type: Number,
      required: true,
    },
    baseAmount: {
      type: Number,
      required: false,
    },
    prorationCredit: {
      type: Number,
      required: false,
    },
    prorationDaysRemaining: {
      type: Number,
      required: false,
    },
    prorationTotalDays: {
      type: Number,
      required: false,
    },
    changeType: {
      type: String,
      required: false,
      enum: ["upgrade", "downgrade", "renewal", "new"],
    },
    replacesSubscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      required: false,
    },
    scheduledPlanId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: false,
    },
    scheduledTier: {
      type: String,
      required: false,
    },
    scheduledAmount: {
      type: Number,
      required: false,
    },
    scheduledEffectiveDate: {
      type: Date,
      required: false,
    },
    scheduledAt: {
      type: Date,
      required: false,
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
    },
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      index: true,
    },
    razorpaySignature: {
      type: String,
      required: false,
    },
    invoiceId: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
    },
    invoiceUrl: {
      type: String,
      required: false,
    },
    invoiceSentAt: {
      type: Date,
      required: false,
    },
    cancellationReason: {
      type: String,
      required: false,
    },
    cancellationDate: {
      type: Date,
      required: false,
    },
    cancellationRequestedAt: {
      type: Date,
      required: false,
    },
    renewalDate: {
      type: Date,
      required: false,
    },
    // Auto-renewal fields
    autoRenewalEnabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    autoRenewalOptedInAt: {
      type: Date,
      required: false,
    },
    nextBillingDate: {
      type: Date,
      required: false,
      index: true,
    },
    lastRenewalAttemptAt: {
      type: Date,
      required: false,
    },
    renewalFailureCount: {
      type: Number,
      default: 0,
    },
    renewalFailureReason: {
      type: String,
      required: false,
    },
    paymentFailedAt: {
      type: Date,
      required: false,
    },
    accessRestrictedAt: {
      type: Date,
      required: false,
    },
    metadata: {
      type: {
        userAgent: { type: String, required: false },
        ipAddress: { type: String, required: false },
        source: { type: String, required: false }, // "web", "mobile", etc.
      },
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for common queries
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ userId: 1, createdAt: -1 });
subscriptionSchema.index({ endDate: 1, status: 1 }); // For expiry checks
subscriptionSchema.index({ autoRenewalEnabled: 1, nextBillingDate: 1, status: 1 }); // For renewal cron
subscriptionSchema.index({ createdAt: -1 });

const SubscriptionModel = model<SubscriptionData>(
  "Subscription",
  subscriptionSchema
);

export default SubscriptionModel;
