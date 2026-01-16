import mongoose, { Schema, model, Document } from "mongoose";

export interface SubscriptionTier {
  id: string; // "silver", "gold", "platinum", "diamond"
  duration: number; // 1, 3, 6, 12 (in months)
  price: number; // amount in INR
  discount: number; // percentage discount (0, 17, 25, 30)
  description: string; // e.g., "1 Month Subscription"
  monthlyEquivalent: number; // calculated price per month
}

export interface SubscriptionPlanData extends Document {
  name: string; // "Business Subscription Plan"
  description: string;
  tiers: SubscriptionTier[];
  features: string[]; // list of features included
  category: string; // "business", "professional", etc.
  isActive: boolean;
  currency: string; // "INR"
  createdAt?: Date;
  updatedAt?: Date;
}

// Schema for subscription plan
const subscriptionPlanSchema = new Schema<SubscriptionPlanData>(
  {
    name: {
      type: String,
      required: true,
      default: "Business Subscription Plan",
    },
    description: {
      type: String,
      required: false,
      default: "Unlock premium features to grow your business on Lynkup",
    },
    tiers: [
      {
        id: {
          type: String,
          required: true,
          enum: ["silver", "gold", "platinum", "diamond"],
        },
        duration: {
          type: Number,
          required: true,
          enum: [1, 3, 6, 12],
        },
        price: {
          type: Number,
          required: true,
        },
        discount: {
          type: Number,
          required: true,
          default: 0,
        },
        description: {
          type: String,
          required: true,
        },
        monthlyEquivalent: {
          type: Number,
          required: true,
        },
      },
    ],
    features: [
      {
        type: String,
        default: [
          "Create unlimited offers",
          "View detailed analytics",
          "Access customer insights",
          "Priority support",
          "Featured business listing",
          "Unlimited portfolio items",
          "Advanced reporting tools",
          "Social media integration",
        ],
      },
    ],
    category: {
      type: String,
      default: "business",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    currency: {
      type: String,
      default: "INR",
    },
  },
  {
    timestamps: true,
  }
);

const SubscriptionPlanModel = model<SubscriptionPlanData>(
  "SubscriptionPlan",
  subscriptionPlanSchema
);

export default SubscriptionPlanModel;
