import mongoose, { Schema, Document } from "mongoose";

interface IRating {
  restaurantId: mongoose.Types.ObjectId;
  influencerId: mongoose.Types.ObjectId;
  bookingId:mongoose.Types.ObjectId;
  appFeedback?: string;
  restroFeedback?: string;
  userFeedback?:string;
  profileType?:string;
  content_presentation: number;
  joviality: number;
  punctuality: number;
  status:Boolean;
  feedbackStatus:Boolean;
  feedbackType: string;
  createdAt: Date;
}
const RatingSchema = new Schema<IRating>({
  restaurantId: { type: Schema.Types.ObjectId, ref: "User", required: false},
  influencerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  bookingId: { type: Schema.Types.ObjectId, ref:"booking", required: false },
  appFeedback: { type: String },
  profileType: {type:String},
  restroFeedback: { type: String },
  content_presentation: { type: Number, required:false, min: 0, max: 100 },
  joviality: { type: Number, required:false, msn: 0, max: 100 },
  punctuality: { type: Number, required:false, min: 0, max: 100 },
  status:{type:Boolean,default:false},
  feedbackStatus:{type:Boolean,default:false},
  userFeedback:{type:String},
  feedbackType: {type: String,required:false,default:''},
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IRating>("Rating", RatingSchema);
