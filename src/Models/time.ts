import mongoose, { ObjectId, Schema, model } from "mongoose";
interface FoodTimingInterface {
  userId: ObjectId;
  name: string;
  isDeleted:Boolean;
 slots:string[];
}
const FoodTimingSchema = new Schema<FoodTimingInterface>(
  {
    userId: {
      type: mongoose.Types.ObjectId,
      ref: "users",
      required: true,
    },
    name:{
          type: String,
        },
        isDeleted:{
          type: Boolean,
          default:false,
        },
    slots: [
        {
          type: String,
        },
      ],
  },
  {
    timestamps: true,
  }
);
const FoodTimingModel = model<FoodTimingInterface>("foodTiming", FoodTimingSchema);
export default FoodTimingModel;
