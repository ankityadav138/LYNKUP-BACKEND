import mongoose, { ObjectId, Schema, model } from "mongoose";

interface OfferInterface {
  name: string;
  timeId: ObjectId;
  adminId: ObjectId;
  business_id: ObjectId;
  media: string[];
  creator_requirement:string;
  details: string;
  offering: string;
  address?: any;
  valid: { start: Date; end: Date };
  offDays: string[];
  content_guidelines: string;
  instagram_reel: string;
  tags: string;
  min_follower:number;
  hashtags: string;
  restro_type: "luxury" | "ordinary";
  noOfBookings: number;
  content_delivery: string;
  offer_type: "visite" | "delivery";
  feedback: { app?: string; restro?: string };
  isdeleted: boolean;
  max_booking: number;
  min_reach: number;
  Booked: string[];
  ending_type: "days" | "booking";
  status: "live" | "paused" | "ended";
  lock:boolean;
  locked_amount?: number;
  is_eligible_for_withdrawal?: boolean;
  withdrawal_eligibility_date?: Date;
  withdrawal_requested?: boolean;
  withdrawal_request_id?: ObjectId;
  
  // New Fields for Paid Collaborations
  collaboration_type?: "milestone" | "paid";
  fixed_amount?: number;
  milestone_slabs?: Array<{
    reach?: number;
    followers?: number;
    engagement?: number;
    reward: number;
  }>;
}

const OfferSchema = new Schema<OfferInterface>(
  {
    name: {
      type: String,
      required: false,
    },
    business_id: {
      type: mongoose.Types.ObjectId,
      ref: "users",
      required: false,
    },
    adminId: {
      type: mongoose.Types.ObjectId,
      ref: "users",
      required: false,
    },
    restro_type: {
      type: String,
      enum: ["luxury", "ordinary"],
      default: "ordinary",
    },
    timeId: {
      type: mongoose.Types.ObjectId,
      ref: "foodtimings",
      required: false,
    },
    media: [
      {
        type: String,
      },
    ],
    offDays: [
      {
        type: String,
      },
    ],
    creator_requirement: {
      type: String,
      default: "",
    },
    details: {
      type: String,
      default: "",
    },
    offering: {
      type: String,
      default: "",
    },
    // address:  {
    //   type: {
    //     type: String,
    //     enum: ["Point"],
    //     default: "Point",
    //   },
    //   coordinates: {
    //     type: [Number],
    //     default: [0, 0],
    //   },
    //   address: {
    //     type: String,
    //   },
    // },
    address: [
      {
        type: { type: String, enum: ["Point"], default: "Point" },
        coordinates: { type: [Number], required: true },
        address: { type: String },
      }
    ],    
    valid: {
      start: {
        type: Date,
        required: false,
      },
      end: {
        type: Date,
        required: false,
      },
    },
    noOfBookings: {
      type: Number,
      default: 0,
      required: false,
    },
    offer_type: {
      type: String,
      enum: ["visite", "delivery"],
      required: true,
    },
    instagram_reel: {
      type: String,
      default: "",
    },
    tags: {
      type: String,
      default: "",
    },
    min_follower:{
      type:Number,
      default: 0,
    },
    hashtags: {
      type: String,
      default: "",
    },
    content_delivery: {
      type: String,
      default: "",
    },
    content_guidelines: {
      type: String,
      default: "",
    },
    isdeleted: {
      type: Boolean,
      default: false,
    },
    feedback: {
      app: {
        type: String,
        required: false,
      },
      restro: {
        type: String,
        required: false,
      },
    },
    max_booking: {
      type: Number,
      default: 1,
    },
    min_reach: {
      type: Number,
      default: 0,
    },
    Booked: [
      {
        type: String,
      },
    ],
    ending_type: {
      type: String,
      enum: ["days", "booking"],
      default: "days",
    },
    status: {
      type: String,
      enum: ["paused", "live", "ended"],
      default: "live",
    },
    lock: {
      type: Boolean,
      default: false,
    },
    locked_amount: {
      type: Number,
      default: 0,
    },
    is_eligible_for_withdrawal: {
      type: Boolean,
      default: false,
    },
    withdrawal_eligibility_date: {
      type: Date,
    },
    withdrawal_requested: {
      type: Boolean,
      default: false,
    },
    withdrawal_request_id: {
      type: mongoose.Types.ObjectId,
      ref: "WithdrawalRequest",
    },
    collaboration_type: {
      type: String,
      enum: ["milestone", "paid"],
      default: "milestone",
    },
    fixed_amount: {
      type: Number,
      default: 0,
    },
    milestone_slabs: [
      {
        reach: { type: Number },
        followers: { type: Number },
        engagement: { type: Number },
        reward: { type: Number, required: true },
      },
    ],
  },
  {
    timestamps: true,
  }
);
OfferSchema.index({ "address.coordinates": "2dsphere" }, { background: true });
const OfferModel = model<OfferInterface>("offer", OfferSchema);
export default OfferModel;
