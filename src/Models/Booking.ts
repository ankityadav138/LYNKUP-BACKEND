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
  | "past";
  status:
    | "pending"
    | "rejected"
    | "canceled"
    | "reupload"
    | "accepted"
    | "visited"
    | "past";
  reason: string;
  content_feedback:string;
  review: Boolean;
  content_media: string;
  creator_post_seen:Boolean;
}
const BookingSchema = new Schema<BookingInterface>(
  {
    offerId: {
      type: mongoose.Types.ObjectId,
      ref: "offers",
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
      enum: ["pending", "rejected", "canceled", "reupload", "accepted"],
      required: false,
    },
    content_status: {
      type: String,
      enum: ["notUploaded", "pending", "canceled", "reupload", "accepted","uploaded"],
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

  },
  {
    timestamps: true,
  }
);
const BookingModel = model<BookingInterface>("booking", BookingSchema);
export default BookingModel;
