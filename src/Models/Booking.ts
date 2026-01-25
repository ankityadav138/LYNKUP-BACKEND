import mongoose, { ObjectId, Schema, model } from "mongoose";
interface BookingInterface {
  offerId: ObjectId;
  restoId: ObjectId;
  userId: ObjectId;
  offer_address:string;
  selected_date: Date;
  selected_time: string;
   booking_allergy: string;
    booking_dish_preference: string;
     booking_dietry_preference: string;
  address: string;
  content_status: | "pending"
  | "notUploaded"
  | "canceled"
  | "reupload"
  | "accepted"
  | "uploaded"
  | "completed"
  | "past";
  status:
    | "pending"
    | "rejected"
    | "canceled"
    | "reupload"
    | "accepted"
    | "completed"
    | "visited"
    | "past";
  reason: string;
  content_feedback:string;
  review: Boolean;
  content_media: string;
  creator_post_seen:Boolean;
  
  // Payout Tracking Fields
  payout_amount?: number;
  payout_date?: Date;
  payout_status?: "pending" | "paid" | "failed";
  payout_mode?: "UPI" | "Bank Transfer" | "Cash";
  payout_remarks?: string;
  milestone_achieved?: string;
  
  // Rescheduling Fields
  reschedule_reason?: string;
  reschedule_requested_at?: Date;
  previous_date?: Date;
  previous_time?: string;
}
const BookingSchema = new Schema<BookingInterface>(
  {
    offerId: {
      type: mongoose.Types.ObjectId,
      ref: "offer",
      // required: true,
    },
    restoId: {
      type: mongoose.Types.ObjectId,
      ref: "users",
      // required: true,
    },
    userId: {
      type: mongoose.Types.ObjectId,
      ref: "users",
      required: false,
    },
    selected_date: {
      type: Date,
      required: false,
    },
    selected_time: {
      type: String,
      required: false,
    },
     booking_dietry_preference: {
      type: String,
      required: false,
    },
     booking_dish_preference: {
      type: String,
      required: false,
    },
     booking_allergy: {
      type: String,
      required: false,
    },
    offer_address: {
      type: String,
      required: false,
    },
    address: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: ["pending", "rejected", "canceled", "reupload", "accepted", "completed"],
      required: false,
    },
    content_status: {
      type: String,
      enum: ["notUploaded", "pending", "canceled", "reupload", "accepted", "uploaded", "completed"],
      default : "notUploaded"
    },
    content_feedback:{
      type:String,
      default: "",
    },
    reason: {
      type: String,
      default: "",
    },
    content_media: {
      type: String,
      default: "",
    },
    review: {
      type: Boolean,
      default: false,
    },
    creator_post_seen: {
      type: Boolean,
      default: false,
    },
    
    // Payout Tracking Fields
    payout_amount: {
      type: Number,
      required: false,
    },
    payout_date: {
      type: Date,
      required: false,
    },
    payout_status: {
      type: String,
      enum: ["pending", "paid", "failed"],
      required: false,
    },
    payout_mode: {
      type: String,
      enum: ["UPI", "Bank Transfer", "Cash"],
      required: false,
    },
    payout_remarks: {
      type: String,
      default: "",
    },
    milestone_achieved: {
      type: String,
      default: "",
    },
    
    // Rescheduling Fields
    reschedule_reason: {
      type: String,
      default: "",
    },
    reschedule_requested_at: {
      type: Date,
      required: false,
    },
    previous_date: {
      type: Date,
      required: false,
    },
    previous_time: {
      type: String,
      required: false,
    },

  },
  {
    timestamps: true,
  }
);
const BookingModel = model<BookingInterface>("booking", BookingSchema);
export default BookingModel;
