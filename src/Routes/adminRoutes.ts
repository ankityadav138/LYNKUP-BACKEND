import { Express } from "express";
import { errCatch, giveStrike } from "../utils/errorCatch";
import {  addStaticFollower, adminLogin, adminSignup, businessSignup, contentFeedback, deleteBusiness, editBusiness, forgotPassword, getAllFollower, getAlluser, getUserByID, getUserByToken, getUserForAdmin, giveStrikeUser, listOfAllBusinessUser, listOfBusinessUser,getUserByTokenPanel, profileVerified, resetPassword, restroGrade, updateStaticFollower, uploadDocumentverify, userFeedbackByAdmin, verifyOtp, changePassword, permanentlyDeletebusiness} from "../Controllers/AdminLoginController";
import { adminFeedback, createOffer, createOfferByBusiness, deleteOffer, deleteOfferImage, editOffer, editOfferByBusiness, Feedback, showOfferAdmin, showOfferByID } from "../Controllers/offerController";
import { AcceptedBookingByAdmin, canceledBookings, contentUpload, createBooking, getAllRequestForPanel, getRequestDetailForPanel, showBookingForRestro, showBookings , getAllBookings, contentStatus, creator_post_seen } from "../Controllers/BookingController";
import { dashboard } from "../Controllers/dashboardController";
import { createMealTiming, DeleteTimings, getAllTimings } from "../Controllers/FoodTimingController";
import { adminMiddleware, businessMiddleware } from "../Middelware/Auth"
import { requireActiveSubscription } from "../Middelware/SubscriptionMiddleware";
import { requireWalletBalance } from "../Middelware/WalletMiddleware";
import upload from "../Middelware/Multer";
import { AcceptedProfileRequest,addPlayerId,userLogout } from "../Controllers/AuthLoginController";
import { addInfluencerRating}from"../Controllers/ratingController";
import { editProfileForAdmin}from"../Controllers/ProfileController";
import { markAllNotificationsAsRead, showNotifications } from "../Controllers/NotificationController";
import { getSubscriptionAnalytics, getWalletMonitoring, getCreatorAnalytics, getBusinessAnalytics, getPlatformOverview } from "../Controllers/AdminAnalyticsController";
import {
  getAllPendingPayouts,
  getAllPayoutHistory,
  recordPayoutAsAdmin,
  getPayoutDashboard,
  generateGSTInvoice,
} from "../Controllers/AdminPayoutController";
import { recordEarning, getUserEarnings } from '../Controllers/EarningController';
import { triggerWithdrawalEligibilityUpdate } from "../Cron/SubscriptionCron";
export const adminRoutes = (app: Express): void => {
  // ⚠️ AWS S3 disabled - Image upload temporarily removed
  app.post("/admin/signup", /* upload.single('profileImage'), */ errCatch(adminSignup));
  app.post("/admin/login", errCatch(adminLogin));
  app.post("/admin/verifyOtp", errCatch(verifyOtp));
  app.post("/admin/forgot", errCatch(forgotPassword));
  app.post("/admin/reset", errCatch(resetPassword));
  app.post("/admin/Logout",businessMiddleware,errCatch(userLogout));
  app.post("/admin/changePassword",businessMiddleware, errCatch(changePassword));
  // ⚠️ AWS S3 disabled - But multer still needed to parse multipart/form-data from frontend
  app.post("/admin/businessSignup", upload.array('profileImage'), errCatch(businessSignup));
  app.post("/admin/editAdmin", upload.array('profileImage'), businessMiddleware ,errCatch(editProfileForAdmin));
  app.post("/admin/uploadDocumentVerify",errCatch(uploadDocumentverify));
  app.post("/admin/editBusiness", businessMiddleware, errCatch(editBusiness));
  app.get("/admin/showOfferAdmin", businessMiddleware, errCatch(showOfferAdmin));
  app.post("/admin/deleteOfferImage", businessMiddleware, errCatch(deleteOfferImage));
  app.get("/admin/showOfferByID", businessMiddleware, errCatch(showOfferByID));
  app.get("/admin/getUserByToken", businessMiddleware, errCatch(getUserByTokenPanel));
  app.get("/admin/getUserForAdmin",businessMiddleware,errCatch(getUserForAdmin));
  // app.post("/admin/createBooking",businessMiddleware,errCatch(createBooking));
  app.get("/admin/showBookings", businessMiddleware, errCatch(showBookings));
  app.post("/admin/cancelBooking", businessMiddleware, errCatch(canceledBookings));
  app.get("/admin/showBookingaccepted", adminMiddleware, errCatch(showBookingForRestro));
  // ⚠️ AWS S3 disabled - Image upload temporarily removed
  app.post("/admin/contentUpload", businessMiddleware, /* upload.single('profileImage'), */ errCatch(contentUpload));
  //superadmin
  // OFFER CREATION - Admin: subscription only | Business: subscription + ₹20k wallet balance
  app.post("/admin/createOffer", upload.array('profileImage'), adminMiddleware, requireActiveSubscription, errCatch(createOffer));
  app.post("/admin/editOffer", upload.array('profileImage'), adminMiddleware, requireActiveSubscription, errCatch(editOffer));
  app.post("/admin/createOfferBusiness", upload.array('profileImage'), businessMiddleware, requireActiveSubscription, requireWalletBalance, errCatch(createOfferByBusiness));
  app.post("/admin/editOfferBusiness", upload.array('profileImage'), businessMiddleware, requireActiveSubscription, errCatch(editOfferByBusiness));
  app.post("/admin/deleteOffer", businessMiddleware, requireActiveSubscription, errCatch(deleteOffer));
  app.post("/superadmin/documentVerify", adminMiddleware, errCatch(uploadDocumentverify));
  app.post("/superadmin/acceptBooking", businessMiddleware, errCatch(AcceptedBookingByAdmin));
  app.post("/superadmin/acceptProfile", adminMiddleware, errCatch(AcceptedProfileRequest));
  app.post("/superadmin/restroGrade", adminMiddleware, errCatch(restroGrade));
  app.post("/superadmin/profileVerified", adminMiddleware, errCatch(profileVerified));
  app.get("/superadmin/businessList", adminMiddleware, errCatch(listOfBusinessUser));
  app.get("/superadmin/allBusinessList", adminMiddleware, errCatch(listOfAllBusinessUser));
  app.get("/admin/dashboard", businessMiddleware, errCatch(dashboard));
  app.get("/getallusers", adminMiddleware, errCatch(getAlluser));
  app.get("/getUserByID", businessMiddleware, errCatch(getUserByID));
  app.get("/getAllRequestForPannel", businessMiddleware, errCatch(getAllRequestForPanel));
  app.get("/getRequestDetailForPanel", businessMiddleware, errCatch(getRequestDetailForPanel));
  app.post("/superadmin/createMealTiming",businessMiddleware,errCatch(createMealTiming));
  app.post("/superadmin/DeleteTiming",businessMiddleware,errCatch(DeleteTimings));
  app.get("/superadmin/getAllTimings", businessMiddleware, errCatch(getAllTimings));
  app.post("/superadmin/addStaticFollower", adminMiddleware, errCatch(addStaticFollower));
  app.post("/superadmin/updateStaticFollower", adminMiddleware, errCatch(updateStaticFollower));
  app.post("/superadmin/addInfluencerRating", businessMiddleware, errCatch(addInfluencerRating));
  app.get("/getAllBookings", businessMiddleware, errCatch(getAllBookings));
  app.get("/getfollower", businessMiddleware, errCatch(getAllFollower));
  app.post("/deleteBusiness", adminMiddleware, errCatch(deleteBusiness));
  app.post("/deleteBusinessOffer", businessMiddleware, errCatch(permanentlyDeletebusiness));
  app.post("/superadmin/strike", adminMiddleware, errCatch(giveStrikeUser));
  app.post("/superadmin/contentStatus", businessMiddleware, errCatch(contentStatus));
  app.post("/superadmin/contentFeedback", errCatch(contentFeedback));
  app.get("/superadmin/getuserFeedback",businessMiddleware,errCatch(adminFeedback));
  app.post("/superadmin/giveuserFeedback",businessMiddleware,errCatch(userFeedbackByAdmin));
 


   // Earnings
  app.post("/superadmin/payUserEarning", businessMiddleware, recordEarning);
  app.get("/superadmin/getUserEarnings", businessMiddleware, getUserEarnings);
  
 
  // notification
    app.get("/admin/showNotifications",businessMiddleware,errCatch(showNotifications));
    app.post("/admin/creator_post",businessMiddleware,errCatch(creator_post_seen));
    app.post("/admin/read",businessMiddleware,errCatch(markAllNotificationsAsRead));
    app.post("/admin/addPlayerId",businessMiddleware,errCatch(addPlayerId));



  // PHASE 6: Admin Analytics & Monitoring
  app.get("/admin/analytics/platform", adminMiddleware, errCatch(getPlatformOverview));
  app.get("/admin/analytics/subscriptions", adminMiddleware, errCatch(getSubscriptionAnalytics));
  app.get("/admin/analytics/wallets", adminMiddleware, errCatch(getWalletMonitoring));
  app.get("/admin/analytics/creators", adminMiddleware, errCatch(getCreatorAnalytics));
  app.get("/admin/analytics/businesses", adminMiddleware, errCatch(getBusinessAnalytics));

  // PHASE: Admin Payout Management
  app.get("/admin/payouts/all-pending", adminMiddleware, errCatch(getAllPendingPayouts));
  app.get("/admin/payouts/all-history", adminMiddleware, errCatch(getAllPayoutHistory));
  app.post("/admin/payouts/record", adminMiddleware, errCatch(recordPayoutAsAdmin));
  app.get("/admin/payouts/dashboard", adminMiddleware, errCatch(getPayoutDashboard));
  app.post("/admin/payouts/generate-invoice/:booking_id", adminMiddleware, errCatch(generateGSTInvoice));

  // PHASE: Subscription Notifications (Admin triggers)
  app.post("/admin/notifications/unsubscribed-users", adminMiddleware, async (req, res) => {
    try {
      const { subscriptionNotificationService } = await import("../Services/SubscriptionNotificationService");
      const count = await subscriptionNotificationService.notifyUnsubscribedBusinessUsers();
      res.json({ 
        status: "success", 
        message: `Subscription promotion sent to ${count} unsubscribed business users` 
      });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.post("/admin/notifications/tier-announcement", adminMiddleware, async (req, res) => {
    try {
      const { tier, title, message } = req.body;
      if (!tier || !title || !message) {
        res.status(400).json({ status: "error", message: "tier, title, and message are required" });
        return;
      }
      const { subscriptionNotificationService } = await import("../Services/SubscriptionNotificationService");
      const count = await subscriptionNotificationService.notifyUsersBySubscriptionTier(tier, title, message);
      res.json({ 
        status: "success", 
        message: `Announcement sent to ${count} ${tier} tier users` 
      });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.post("/admin/notifications/all-subscribers", adminMiddleware, async (req, res) => {
    try {
      const { title, message } = req.body;
      if (!title || !message) {
        res.status(400).json({ status: "error", message: "title and message are required" });
        return;
      }
      const { subscriptionNotificationService } = await import("../Services/SubscriptionNotificationService");
      const count = await subscriptionNotificationService.notifyAllActiveSubscribers(title, message);
      res.json({ 
        status: "success", 
        message: `Announcement sent to ${count} active subscribers` 
      });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.post("/admin/notifications/specific-user/:userId", adminMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      const { title, message } = req.body;
      const { subscriptionNotificationService } = await import("../Services/SubscriptionNotificationService");
      const success = await subscriptionNotificationService.notifySpecificUnsubscribedUser(userId, title, message);
      
      if (success) {
        res.json({ status: "success", message: "Personal promotion sent successfully" });
      } else {
        res.status(400).json({ status: "error", message: "Failed to send notification" });
      }
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // Manual trigger for withdrawal eligibility update (for testing)
  app.post("/admin/trigger-withdrawal-eligibility", adminMiddleware, async (req, res) => {
    try {
      const result = await triggerWithdrawalEligibilityUpdate();
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

 
};
