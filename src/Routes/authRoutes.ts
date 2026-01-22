import { Express } from "express";
import { errCatch } from "../utils/errorCatch";
import { addPlayerId, deleteUser, influencerAccount, InstagramMobileLogin, permanentlyDeleteUser, privacyPolicy, userLogin, userLogout } from "../Controllers/AuthLoginController"; 
import { canceledBookings, contentUpload, createBooking, reUpload, showBookingForRestro, showBookings ,filterUserFeedback, rescheduleBooking} from "../Controllers/BookingController";
import { adminMiddleware, businessMiddleware, userMiddleware } from "../Middelware/Auth";
import { Feedback, showOfferAdmin, showOfferByID, showOfferUser, universalSearch, getPaidCollaborations } from "../Controllers/offerController";
import upload from "../Middelware/Multer";
import { getUserByToken } from "../Controllers/AdminLoginController";
import { changeStatus, sendNotification, sendNotificationToAll, showNotifications } from "../Controllers/NotificationController";
import { showProfileHealth } from "../Controllers/ratingController";
import {changeRating, editProfile} from "../Controllers/ProfileController";
import { verifySubscription, getSubscriptionDetails } from "../Controllers/SubscriptionController";
import { 
  getOrCreateWallet, 
  getWalletBalance, 
  createRechargeOrder, 
  verifyRecharge, 
  getWalletTransactions,
  checkOfferEligibility
} from "../Controllers/WalletController";
import {
  getEligibleOffers,
  createWithdrawalRequest,
  getUserWithdrawalRequests,
  cancelWithdrawalRequest,
  getAllWithdrawalRequests,
  approveWithdrawal,
  rejectWithdrawal
} from "../Controllers/WithdrawalController";
export const userRoutes = (app: Express): void => {
  // Wrap the route handler with errCatch
  app.get("/auth/instagram", errCatch(InstagramMobileLogin));
  app.post("/user/login", errCatch(userLogin));
  app.get("/user/showBookings",userMiddleware,errCatch(showBookings));
  app.post("/user/cancelBooking",userMiddleware,errCatch(canceledBookings));
  app.post("/user/createBooking",userMiddleware,upload.single('profileImage'),errCatch(createBooking));
  app.get("/user/showBookingaccepted",userMiddleware,errCatch(showBookingForRestro));
  app.post("/user/showOfferUser",userMiddleware,errCatch(showOfferUser));
  app.get("/user/showOfferByID",userMiddleware,errCatch(showOfferByID)); 
  app.post("/user/contentUpload",userMiddleware,upload.single('profileImage'),errCatch(contentUpload));
  app.post("/user/reUpload",userMiddleware,upload.single('profileImage'),errCatch(reUpload));
  app.post("/user/feedback",userMiddleware,errCatch(Feedback));
  app.get("/user/bookingFeedback",userMiddleware,errCatch(filterUserFeedback));
  app.post("/user/influencerAccount",userMiddleware,errCatch(influencerAccount));
  app.get("/user/getUserByToken",userMiddleware,errCatch(getUserByToken));
  app.get("/sendToAll",errCatch(sendNotificationToAll));
  app.get('/privacy-policy',errCatch(privacyPolicy));
  app.post('/changeRating',userMiddleware,errCatch(changeRating));
  app.get('/showProfileHealth',errCatch(showProfileHealth));
  app.post('/editProfile',userMiddleware,upload.single('profileImage'),errCatch(editProfile));
  app.post("/user/addPlayerId",userMiddleware,errCatch(addPlayerId));
  app.post("/user/Logout",userMiddleware,errCatch(userLogout));
  app.post("/user/deleteUser",userMiddleware,errCatch(deleteUser));
  app.post("/user/permanentdeleteUser",userMiddleware,errCatch(permanentlyDeleteUser));
  app.get("/user/showNotifications",userMiddleware,errCatch(showNotifications));
  app.get("/user/read",userMiddleware,errCatch(changeStatus));
  
  // PHASE 5: Influencer App Enhancements
  app.post("/user/rescheduleBooking", userMiddleware, errCatch(rescheduleBooking));
  app.get("/offers/search", errCatch(universalSearch));
  app.get("/offers/paid-collaborations", errCatch(getPaidCollaborations));
  
  // Subscription routes
  app.post("/subscription/verify", businessMiddleware, errCatch(verifySubscription));
  app.get("/subscription/details", businessMiddleware, errCatch(getSubscriptionDetails));

  // Wallet routes
  app.get("/wallet/balance", businessMiddleware, errCatch(getWalletBalance));
  app.get("/wallet/get-or-create", businessMiddleware, errCatch(getOrCreateWallet));
  app.post("/wallet/recharge", businessMiddleware, errCatch(createRechargeOrder));
  app.post("/wallet/verify-recharge", businessMiddleware, errCatch(verifyRecharge));
  app.get("/wallet/transactions", businessMiddleware, errCatch(getWalletTransactions));
  app.get("/wallet/check-eligibility", businessMiddleware, errCatch(checkOfferEligibility));

  // Withdrawal routes
  app.get("/wallet/withdrawal/eligible-offers", businessMiddleware, errCatch(getEligibleOffers));
  app.post("/wallet/withdrawal/request", businessMiddleware, errCatch(createWithdrawalRequest));
  app.get("/wallet/withdrawal/requests", businessMiddleware, errCatch(getUserWithdrawalRequests));
  app.delete("/wallet/withdrawal/request/:request_id", businessMiddleware, errCatch(cancelWithdrawalRequest));

  // Admin withdrawal routes
  app.get("/admin/wallet/withdrawal-requests", adminMiddleware, errCatch(getAllWithdrawalRequests));
  app.post("/admin/wallet/approve-withdrawal/:request_id", adminMiddleware, errCatch(approveWithdrawal));
  app.post("/admin/wallet/reject-withdrawal/:request_id", adminMiddleware, errCatch(rejectWithdrawal));
};

