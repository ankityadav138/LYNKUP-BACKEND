import { Request, Response, NextFunction } from "express";
import UserModel from "../Models/UserModel";
import OfferModel from "../Models/offerModal";
import { resStatus, resStatusData, resStatusTryCatch } from "../Responses/Response";
import mongoose from "mongoose";
import BookingModel from "../Models/Booking";
export const dashboard = async (req: Request | any, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userType = req.user?.userType;
    const userId = req.user?._id;

    if (!userType) {
      resStatus(res, "false", "User type is required.");
      return;
    }

    let dashboardData: any = {};

    let matchBookingQuery = {};

    if (userType === "admin") {
      const totalUsers = await UserModel.countDocuments({ userType: "user", isDeleted: false });
      const totalBusinesses = await UserModel.countDocuments({ userType: "business", documentVerified: true });
      const Businessesunverified = await UserModel.countDocuments({ userType: "business", documentVerified: false });
      const totalOffers = await OfferModel.countDocuments({ isdeleted: false });
      const totalBookings = await BookingModel.countDocuments();

      matchBookingQuery = {}; // Match all bookings

      dashboardData.totalUsers = totalUsers;
      dashboardData.totalBusinesses = totalBusinesses;
      dashboardData.Businessesunverified = Businessesunverified;
      dashboardData.totalOffers = totalOffers;
      dashboardData.totalBookings = totalBookings;

    } else if (userType === "business") {
      const user = await UserModel.findById(userId);
      const totalOffers = await OfferModel.countDocuments({ business_id: userId, isdeleted: false });
      const totalBookings = await BookingModel.countDocuments({ restoId: userId });

      matchBookingQuery = { restoId: userId }; // Match only this business's bookings

      dashboardData.totalOffers = totalOffers;
      dashboardData.totalBookings = totalBookings;
      // Add verification status
      dashboardData.documentVerified = user?.documentVerified || false;
      dashboardData.profileStatus = user?.profile_status || "under_review";
    } else {
      resStatus(res, "false", "Unauthorized access.");
      return;
    }

    // Count booking statuses
    const [pendingBookings, acceptedBookings, rejectedBookings, pastBookings] = await Promise.all([
      BookingModel.countDocuments({ ...matchBookingQuery, status: "pending" }),
      BookingModel.countDocuments({ ...matchBookingQuery, status: "accepted" }),
      BookingModel.countDocuments({ ...matchBookingQuery, status: "rejected" }),
      BookingModel.countDocuments({ ...matchBookingQuery, status: "past" }),
    ]);

    dashboardData.pendingBookings = pendingBookings;
    dashboardData.acceptedBookings = acceptedBookings;
    dashboardData.rejectedBookings = rejectedBookings;
    dashboardData.pastBookings = pastBookings;

    resStatusData(res, "success", "Dashboard data retrieved successfully.", dashboardData);
  } catch (error) {
    next(error);
  }
};

// export const dashboard = async (req: Request | any, res: Response, next: NextFunction): Promise<void> => {
//   try {
//     const userType = req.user?.userType;
//     const userId = req.user?._id; 
//     if (!userType) {
//       resStatus(res, "false", "User type is required.");
//       return;
//     }
//     let dashboardData: any = {};
//     if (userType === "admin") {
//       // Admin: Show all users, businesses, offers, and bookings
//       const totalUsers = await UserModel.countDocuments({ userType: "user", isDeleted:false });
//       const totalBusinesses = await UserModel.countDocuments({ userType: "business", documentVerified:true});
//       const Businessesunverified = await UserModel.countDocuments({ userType: "business", documentVerified:false});
//       const totalOffers = await OfferModel.countDocuments({isdeleted: false});
//       const totalBookings = await BookingModel.countDocuments();

//       dashboardData = {
//         totalUsers,
//         totalBusinesses,
//         Businessesunverified,
//         totalOffers,
//         totalBookings,
//       };
//     } else if (userType === "business") {
//       // Business: Show only their offers and bookings
//       const totalOffers = await OfferModel.countDocuments({ business_id:userId,isdeleted: false});
//       const totalBookings = await BookingModel.countDocuments({ restoId:userId});

//       dashboardData = {
//         totalOffers,
//         totalBookings,
//       };
//     } else {
//       resStatus(res, "false", "Unauthorized access.");
//       return;
//     }
//     resStatusData(res, "success", "Dashboard data retrieved successfully.", dashboardData);
//   } catch (error) {
//     next(error);
//   }
// };
