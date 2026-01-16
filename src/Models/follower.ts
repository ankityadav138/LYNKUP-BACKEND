import mongoose, { Schema, Document } from "mongoose";

export interface IFollower extends Document {
  userId: mongoose.Types.ObjectId;
  staticFollowers: number;
}

const FollowerSchema = new Schema<IFollower>({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  staticFollowers: { type: Number, default: 0 },
});

export const FollowerModel = mongoose.model<IFollower>("Follower", FollowerSchema);
