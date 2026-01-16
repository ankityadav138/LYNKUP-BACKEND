import mongoose, { Schema, Document } from 'mongoose';

interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  bookingId: mongoose.Types.ObjectId;
  restaurantId: mongoose.Types.ObjectId;
  message: string;
  title:string;
  image:string;
  date: Date;
  notificationType:string;
  status:string;
}
const NotificationSchema: Schema = new Schema(
  {
    userId: { type: mongoose.Types.ObjectId, required: true, ref: 'User' },
    restaurantId: { type: mongoose.Types.ObjectId, required: false, ref: 'User' },
    bookingId: { type: mongoose.Types.ObjectId, required: false, ref: 'Booking' },
    message: { type: String, required: true },
    image:{type:String,required:false,default:"image/download.png"},
    title:{type:String,required:true},
    date: { type: Date, default: Date.now },
    notificationType:{type:String,required:true,default:""},
    status:{type: String,required:false,default:"unread"},
  },
  { timestamps: true }
);
const NotificationModel = mongoose.model<INotification>('Notification', NotificationSchema);

export default NotificationModel;
