import mongoose, { Schema, Document, ObjectId } from 'mongoose';

export interface IEarning extends Document {
  userId: ObjectId;
  amount: number;
  method: string;
  date: Date;
  brandName?: string;
  offerName?: string;
  description?: string;
  offerId?: ObjectId;
  bookingId?: ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const EarningSchema = new Schema<IEarning>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'users',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  method: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  brandName: {
    type: String,
  },
  offerName: {
    type: String,
  },
  description: {
    type: String,
  },
  offerId: {
    type: Schema.Types.ObjectId,
    ref: 'offers',
  },
  bookingId: {
    type: Schema.Types.ObjectId,
    ref: 'Booking',
  },
}, {
  timestamps: true,
});

const EarningModel = mongoose.model<IEarning>('Earning', EarningSchema);
export default EarningModel;
