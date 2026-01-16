import mongoose from 'mongoose';
import dotenv from "dotenv";
dotenv.config();
import { Request, Response, NextFunction } from "express";
import NotificationModel from '../Models/notification'; 
import { resStatus, resStatusData } from '../Responses/Response';
import axios from "axios";
import UserModel from '../Models/UserModel';
export const sendNotification = async (
  playerId: string | string[],
  title: string,
  message: string,
  image: string,
  notificationType: string ,
) => {
  try {
    const appId = process.env.ONESIGNAL_APP_ID;
    const apiKey = process.env.ONESIGNAL_API_KEY;
    if (!appId || !apiKey) {
      console.error("OneSignal App ID or API Key is missing");
    }

   else if (!playerId || (Array.isArray(playerId) && playerId.length === 0)) {
      console.error("Invalid playerId: Notification not sent");
    }
else{
  const payload = {
    app_id: appId,
    include_player_ids: Array.isArray(playerId) ? playerId : [playerId], 
    headings: { en: title },
    contents: { en: message },
    big_picture: image,
    data: { notificationType },
    priority: 10,  // High priority to make it pop on top
    ios_sound: "default", 
    android_sound: "default", 
    content_available: true, 
    mutable_content: true,
    android_priority: 10,  
    android_visibility: 1,  
    android_channel_id: '74390965-86bb-4a7e-a5d8-290651977212',
    ios_alert: "true",
    ios_badgeType: "Increase", 
    ios_badgeCount: 1,
  };
    // const payload = {
    //   app_id: appId,
    //   include_player_ids: Array.isArray(playerId) ? playerId : [playerId], 
    //   headings: { en: title },
    //   contents: { en: message },
    //   big_picture: image,
    //   data: { notificationType },
    //   priority: 10, 
    //   ios_sound: "default",
    //   android_sound: "default",
    //   content_available: true, 
    //   mutable_content: true,

    // };

    console.log("Sending Notification with Payload:", JSON.stringify(payload, null, 2));
    const response = await axios.post("https://onesignal.com/api/v1/notifications", payload, {
      headers: {
        Authorization: `Basic ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    // console.log("Notification Response:", response.data);
    console.log("Notification sent successfully");

  } }catch (error: any) {
    console.error("Error sending notification:", error.response?.data || error.message);
  }
};

 export const sendNotificationToAll = async (title: string, message:string, image: null) => {
    const appId = process.env.ONESIGNAL_APP_ID;
    const apiKey = process.env.ONESIGNAL_API_KEY;
    const payload = {
      app_id: appId,
      included_segments: ['All'],
      headings: { en: "test" },
      contents: { en: "testing" },
      big_picture: "image/download.png",
    };
    try {
      const response = await axios.post('https://onesignal.com/api/v1/notifications', payload, {
        headers: {
          Authorization: `Basic os_v2_app_ztmgvfvcmjhdrjm57bkru7acqae5cxic2d2etturfxyfkxnrjblqzmazwhk3nysmall4cokexrbphl222xto24gl7bmw7krwvfsnkvy`,
          'Content-Type': 'application/json',
        },
      });
      console.log('Notification sent successfully:', response.data);
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  };
 export const createNotification = async (userId: mongoose.Types.ObjectId,restaurantId:mongoose.Types.ObjectId, message: string,title:string,image: string,notificationType: string ) => {
    const notification = new NotificationModel({
      userId,
      restaurantId,
      title,
      message,
      image,
      notificationType,
    });
    try {
      await notification.save();
      console.log('Notification saved to database');
    } catch (error) {
      console.error('Error saving notification:', error);
    }
  };
  export const showNotifications = async (req: Request | any, res: Response): Promise<void> => {
    const userId = req.user._id;
    const user = await UserModel.findById(userId);
    // console.log("fghjk",user)
    let filter: any = {}; 

    if (user?.userType === "admin") {
      // filter = { notificationType: "admin"};
      filter = { notificationType: { $in: ["admin", "superadmin"] } };
    } else if (user?.userType === "business") {
        filter = { notificationType: "admin" ,restaurantId: userId};
    }
    else if (user?.userType === "user") {
      filter = { notificationType: "user" ,userId: userId};

      // console.log("fghjk:",filter);
    } else {
        filter = { userId };
    }
    // const notifications = await NotificationModel.find(filter);
    const notifications = await NotificationModel.find(filter)
    .sort({ createdAt: -1 });
    // console.log(notifications);
    const unreadCount = notifications.filter(notification => notification.status === "unread").length;

    if (notifications.length === 0) {
      resStatus(res, "false", "No notifications found.");
        return 
    }

    resStatusData(res, "success", `You have ${unreadCount} unread notifications.`, {
        total: notifications.length,
        unread: unreadCount,
        notifications
    });
};  
export const changeStatus = async (req: Request | any, res: Response): Promise<void> => {
  const userId = req.user._id;
  const { notificationId } = req.body; 
  if (!notificationId) {
    resStatus(res, "false", "Notification ID is required.");
      return 
  }
  const notification = await NotificationModel.findOne({ _id: notificationId, userId });
  if (!notification) {
    resStatus(res, "false", "Notification not found or does not belong to the user.");
      return 
  }
  const update = await NotificationModel.findByIdAndUpdate(
    notificationId,
    { status:'read' },
    { new: true }
  );
  resStatusData(res, "success", "Notification marked as read.", update);
};

export const markAllNotificationsAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await NotificationModel.updateMany(
      { status: { $ne: 'read' } },
      { $set: { status: 'read' } }
    );

    if (result.modifiedCount > 0) {
      resStatusData(res, "success", "All notifications marked as read.", result);
    } else {
      resStatus(res, "false", "No unread notifications found to update.");
    }
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    resStatus(res, "false", "Failed to mark notifications as read.");
  }
};


