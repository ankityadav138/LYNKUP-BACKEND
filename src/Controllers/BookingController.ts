import { Request, Response, NextFunction } from "express";
import BookingModel from "../Models/Booking";
import OfferModel from "../Models/offerModal";
import UserModel from "../Models/UserModel";
import NotificationModel from "../Models/notification";
import influencerRating from "../Models/influencerRating";
import {
  createNotification,
  sendNotification,
} from "../Controllers/NotificationController";
import { ObjectId } from "mongodb";
import {
  resStatus,
  resStatusData,
  resStatusTryCatch,
} from "../Responses/Response";
import mongoose from "mongoose";
import { sendBookingCancellationEmailMailgun, sendBookingEmailMailgun } from "../utils/errorCatch";
export const createBooking = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user._id;
    const { offerId, selected_date, selected_time, address,offer_address,booking_dietry_preference,booking_dish_preference,booking_allergy} = req.body;
    if (!offerId || !selected_date || !selected_time) {
      resStatus(res, "false", "All fields are required.");
      return;
    }
    const offerDetails = await OfferModel.findById(offerId);
    if (!offerDetails) {
      resStatus(res, "false", "Offer not found.");
      return;
    }
    const existingUserBooking = await BookingModel.findOne({
      offerId,
      userId, 
    });
    if (existingUserBooking) {
      resStatus(res, "false", "You have already booked this offer.");
      return;
    }
    if (offerDetails.ending_type === "booking") {
      const totalAcceptedBookings = await BookingModel.countDocuments({
        offerId,
        status: "accepted",
      });
      const maxBookingLimit = offerDetails?.max_booking || 1;
      if (totalAcceptedBookings >= maxBookingLimit) {
        resStatus(res, "false", "Booking limit reached for this offer.");
        return;
      }
    } else if (offerDetails.ending_type === "days") {
      const currentDate = new Date();
const endDate = new Date(offerDetails.valid.end);

// Strip time from dates for clean comparison
const today = new Date(currentDate.toDateString());
const offerEnd = new Date(endDate.toDateString());

if (today > offerEnd) {
  resStatus(res, "false", "This offer has expired.");
  return;
}

    }
    const userDetails = await UserModel.findById(userId);
    const adminDetails = await UserModel.findOne({ _id: offerDetails.business_id });
    
    // const userReach: number = userDetails?.insights?.reach ?? 0;
    // if (userReach < (offerDetails.min_reach || 0)) {
    //   resStatus(res, "false", "Insufficient reach to book this offer.");
    //   return;
    // }
    const userReach:number = userDetails?.insights?.reach ?? 0;
    const userFollowers: number = Number(userDetails?.businessDiscovery?.followers_count ?? 0);

    
    const minReach = offerDetails?.min_reach || 0;
    const minFollowers = offerDetails?.min_follower || 0;
    
    if (userReach < minReach || userFollowers < minFollowers) {
      const errors = [];
      if (userReach < minReach) errors.push(`Minimum reach required: ${minReach}`);
      if (userFollowers < minFollowers) errors.push(`Minimum followers required: ${minFollowers}`);
      
      resStatus(res, "false", errors.join(" | "));
      return;
    }
    
    const booking = await BookingModel.create({
      offerId,
      userId,
      offer_address,
      selected_date,
      selected_time,
      booking_dietry_preference,
      booking_dish_preference,
      booking_allergy,
      address,
      restoId: offerDetails.business_id,
      status: "pending",
    });
    const username = `${userDetails?.firstName || ''} ${userDetails?.lastName || ''}`.trim();
    if (adminDetails?.email) {
      await sendBookingEmailMailgun(
        adminDetails.email,
        offerDetails?.name || "Offer",
        selected_date,
        selected_time,
        username
      );
    }
    

    // Send notification
    const playerIDs: string[] = adminDetails?.playerId || ["d4f36cc6-f7bb-4b0f-bc01-c04c7509a247"];
    console.log("==============",playerIDs)
    const title = "Booking Created";
    const notificationMessage = `Booking of ${offerDetails?.name?.toUpperCase() || 'OFFER'} made by the Creator`;
    const imageUrl = "image/download.png";

    // Optionally use playerID loop here
    for (const playerID of playerIDs) {
      await sendNotification(playerID, title, notificationMessage, imageUrl, "user");
    }

    await createNotification(
      new mongoose.Types.ObjectId(booking.userId.toString()),
      new mongoose.Types.ObjectId(offerDetails.business_id.toString()),
      title,
      notificationMessage,
      imageUrl,
      "admin"
    );

    resStatusData(res, "success", "Booking created successfully.", booking);
  } catch (error) {
    console.error("Booking error:", error);
    next(error);
  }
};
export const showBookings = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  const { status, page = 1, limit = 10 } = req.query;
  // const userId = req.user._id;
  const userId = new mongoose.Types.ObjectId(req.user._id);
  console.log(userId);
  if (
    status &&
    ![
      "accepted",
      "interest_shown",
      "visited",
      "past",
      "pending",
      "canceled",
    ].includes(status)
  ) {
    resStatus(
      res,
      "false",
      "Invalid status value. Use 'accepted', 'interest_shown', or 'visited'."
    );
  } else {
    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    let matchFilter: any = { userId };

    if (status === "past") {
      matchFilter = {
        userId,
        $or: [
          { status: { $in: ["past", "rejected", "canceled"] } },
          { review: true },
        ],
      };
    } else if (status === "interest_shown") {
      matchFilter.status = "pending";
      matchFilter.review = false;
    } else if (status) {
      matchFilter.status = status;
      matchFilter.review = false;
    } else {
      matchFilter.status = "pending";
      matchFilter.review = false;
    }
    const bookings = await BookingModel.aggregate([
      { $match: matchFilter },
      {
        $lookup: {
          from: "users",
          localField: "restoId",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "offers",
          localField: "offerId",
          foreignField: "_id",
          as: "offerDetails",
        },
      },
      { $unwind: { path: "$offerDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          status: 1,
          content_status: 1,
          content_feedback: 1,
          selected_date: 1,
          offer_address: 1,
          selected_time: 1,
          booking_dietry_preference: 1,
          booking_dish_preference: 1,
          booking_allergy: 1,
          userId: 1,
          offerId: 1,
          review: 1,
          content_media: 1,
          userDetails: 1,
          offerDetails: 1,
          createdAt: 1,
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: (pageNumber - 1) * limitNumber },
      { $limit: limitNumber },
    ]);
    const totalBookings = await BookingModel.countDocuments({
      userId,
      ...matchFilter,
    });
    const totalPages = Math.ceil(totalBookings / limitNumber);
    if (!bookings || bookings.length === 0) {
      resStatus(res, "false", "No bookings found.");
      return;
    }
    const response = {
      totalBookings,
      currentPage: pageNumber,
      totalPages,
      bookings,
    };
    resStatusData(res, "success", "Bookings retrieved successfully.", response);
  }
};
export const filterUserFeedback = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const influencerId = req.user?._id;

    if (!influencerId) {
      resStatus(res, "false", "User ID is missing from request.");
      return;
    }

    const { page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const matchCondition = {
      feedbackType: "user",
      influencerId: new mongoose.Types.ObjectId(influencerId),
    };

    const feedbacks = await influencerRating.aggregate([
      { $match: matchCondition },
      {
        $lookup: {
          from: "users",
          localField: "influencerId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },

      // Get booking details
      {
        $lookup: {
          from: "bookings",
          localField: "bookingId",
          foreignField: "_id",
          as: "booking",
        },
      },
      { $unwind: { path: "$booking", preserveNullAndEmptyArrays: true } },

      // Get offer details
      {
        $lookup: {
          from: "offers",
          localField: "booking.offerId",
          foreignField: "_id",
          as: "offer",
        },
      },
      { $unwind: { path: "$offer", preserveNullAndEmptyArrays: true } },

      // Get restaurant name from users collection
      {
        $lookup: {
          from: "users",
          localField: "restaurantId",
          foreignField: "_id",
          as: "restaurant",
        },
      },
      { $unwind: { path: "$restaurant", preserveNullAndEmptyArrays: true } },

      {
        
  $project: {
    _id: 1,
    userFeedback: 1,
    status: 1,
    bookingId: 1,
    restaurantId: "$booking.restaurantId",
    createdAt: 1,
    user: {
      firstName: "$user.firstName",
      email: "$user.email"
    },
    restaurant: {
     brand: { $ifNull: ["$restaurant.name", "LynkUp"] }, 
      email: "$restaurant.email"
    },
    offer: {
      name: "$offer.name",
      description: "$offer.description"
    }
  }


      },

      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: Number(limit) },
    ]);

    if (feedbacks.length === 0) {
      resStatus(res, "false", "No user feedback found.");
      return;
    }

    resStatusData(
      res,
      "success",
      "Filtered user feedbacks fetched successfully.",
      feedbacks
    );
  } catch (err: any) {
    console.error("Error fetching user feedbacks:", err);
    resStatus(res, "false", `Server error: ${err.message}`);
  }
};

// export const filterUserFeedback = async (
//   req: Request | any,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const influencerId = req.user?._id;

//     if (!influencerId) {
//       resStatus(res, "false", "User ID is missing from request.");
//       return;
//     }

//     const { page = 1, limit = 10 } = req.query;
//     const skip = (Number(page) - 1) * Number(limit);

//     const matchCondition = {
//       feedbackType: "user",
//       influencerId: new mongoose.Types.ObjectId(influencerId),
//     };

//     const feedbacks = await influencerRating.aggregate([
//       { $match: matchCondition },

//       {
//         $lookup: {
//           from: "users",
//           localField: "influencerId",
//           foreignField: "_id",
//           as: "user",
//         },
//       },
//       { $unwind: "$user" },

//       {
//         $lookup: {
//           from: "bookings",
//           localField: "bookingId",
//           foreignField: "_id",
//           as: "booking",
//         },
//       },
//       { $unwind: { path: "$booking", preserveNullAndEmptyArrays: true } },

//       {
//         $lookup: {
//           from: "offers",
//           localField: "booking.offerId",
//           foreignField: "_id",
//           as: "offer",
//         },
//       },
//       { $unwind: { path: "$offer", preserveNullAndEmptyArrays: true } },

//       {
//         $project: {
//           _id: 1,
//           userFeedback: 1,
//           status: 1,
//           bookingId: 1,
//           restaurantId: 1,
//           createdAt: 1,
//           "user.username": 1,
//           "user.email": 1,
//           "offer.name": 1,
//           "offer.description": 1,
//         },
//       },

//       { $sort: { createdAt: -1 } },
//       { $skip: skip },
//       { $limit: Number(limit) },
//     ]);

//     if (feedbacks.length === 0) {
//       resStatus(res, "false", "No user feedback found.");
//       return;
//     }

//     resStatusData(res, "success", "Filtered user feedbacks fetched successfully.", feedbacks);
//   } catch (err: any) {
//     console.error("Error fetching user feedbacks:", err);
//     resStatus(res, "false", `Server error: ${err.message}`);
//   }
// };
export const canceledBookings = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user._id;
    const { bookingId, reason } = req.body;
    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      resStatus(res, "false", "Invalid or missing Booking ID.");
      return;
    }
    const existingBooking = await BookingModel.findById(bookingId);
    if (!existingBooking) {
      resStatus(res, "false", "Booking not found.");
      return;
    }
    const updatedBooking = await BookingModel.findByIdAndUpdate(
      bookingId,
      {
        status: "canceled",
        reason: reason || "No reason provided",
      },
      { new: true }
    );
    if (!updatedBooking) {
      resStatus(res, "false", "Failed to update booking.");
      return;
    }
    const offer = await OfferModel.findById(existingBooking.offerId);
    if (!offer) {
      resStatus(res, "false", "Offer not found.");
      return;
    }
    const restoUser = await UserModel.findById(updatedBooking.restoId);
    const playerIDs: string[] = restoUser?.playerId || ["d4f36cc6-f7bb-4b0f-bc01-c04c7509a247"];
    const title = "Booking cancelled";
    const notificationMessage = "Booking has been cancelled by the creator.";
    const imageUrl = "image/download.png";
    if (restoUser?.email) {
      const username = `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim();
      await sendBookingCancellationEmailMailgun(
        restoUser.email,
        offer.name || "Offer",
        username,
        updatedBooking.reason || "No reason provided"
      );
    }
    for (const playerID of playerIDs) {
      await sendNotification(playerID, title, notificationMessage, imageUrl, "user");
    }
    await createNotification(
      new mongoose.Types.ObjectId(updatedBooking.userId.toString()),
      new mongoose.Types.ObjectId(offer.business_id.toString()),
      title,
      notificationMessage,
      imageUrl,
      "admin"
    );
    resStatusData(res, "success", "Booking canceled successfully.", updatedBooking);
  } catch (error) {
    next(error); 
  }
};
export const AcceptedBookingByAdmin = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { bookingId, status } = req.body;

    if (!bookingId || !status) {
      resStatus(res, "false", "Booking ID and Status are required.");
      return;
    }
    const existingBooking = await BookingModel.findById(bookingId);
    if (!existingBooking) {
      resStatus(res, "false", "Booking not found.");
      return;
    }
    const updatedBooking = await BookingModel.findByIdAndUpdate(
      bookingId,
      { status: status },
      { new: true }
    );
    if (!updatedBooking) {
      resStatus(res, "false", "Failed to update booking.");
      return;
    }
    const offer = await OfferModel.findById(existingBooking.offerId);
    if (!offer) {
      resStatus(res, "false", "Offer not found.");
      return;
    }
    if (offer.noOfBookings > 0) {
      await OfferModel.findByIdAndUpdate(
        offer._id,
        { $inc: { noOfBookings: -1 } },
        { new: true }
      );
    }
    const user = await UserModel.findById(updatedBooking.userId);
    let playerIDs: string[] = user?.playerId || ["d4f36cc6-f7bb-4b0f-bc01-c04c7509a247"];
    // Send notification
    // let messageStatus = status.toLowerCase() === "past" ? "completed" : status.toLowerCase();
    let messageStatus = status.toLowerCase() === "past"
  ? "completed"
  : status.toLowerCase() === "canceled"
    ? "cancelled"
    : status.toLowerCase();

    const title = `Request ${messageStatus}`;
    const notificationMessage = `Your booking of ${offer?.name?.toUpperCase() || 'OFFER'} has been ${messageStatus} by LynkUp.`;
    const imageUrl = "image/download.png";
    for (const playerID of playerIDs) {
      await sendNotification(playerID, title, notificationMessage, imageUrl,"user");
    }
    // await sendNotification(playerID, title, notificationMessage, imageUrl);
    await createNotification(
      new mongoose.Types.ObjectId(updatedBooking.userId.toString()),
      new mongoose.Types.ObjectId(updatedBooking._id.toString()),
      title,
      notificationMessage,
      imageUrl,
      "user"
    );

    resStatusData(
      res,
      "success",
      "Booking status updated successfully and notification sent.",
      updatedBooking
    );
  } catch (error) {
    console.error("Error updating booking status:", error);
    resStatus(res, "false", "An error occurred while updating the booking status.");
  }
};
export const showBookingForRestro = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { bookingId } = req.query;
  if (!bookingId || typeof bookingId !== "string") {
    resStatus(res, "false", "Booking ID is required and must be a string.");
  } else {
    try {
      const bookings = await BookingModel.aggregate([
        {
          $match: { _id: new mongoose.Types.ObjectId(bookingId) },
        },
        {
          $lookup: {
            from: "users",
            localField: "restoId",
            foreignField: "_id",
            as: "businessDetails",
          },
        },
        {
          $unwind: "$businessDetails",
        },

        {
          $lookup: {
            from: "offers",
            localField: "offerId",
            foreignField: "_id",
            as: "offerDetails",
          },
        },
        {
          $unwind: {
            path: "$offerDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            businessId: 1,
            offer_address:1,
            status: 1,
             booking_dietry_preference: 1,
          booking_dish_preference: 1,
          booking_allergy: 1,
            content_status: 1,
            content_media: 1,
            restro_type: "$businessDetails.restro_type",
            createdAt: 1,
            offerDetails: 1,
          },
        },
      ]);
      if (!bookings || bookings.length === 0) {
        resStatus(
          res,
          "true",
          "No bookings found for A+ restaurants with accepted status."
        );
        return;
      }
      resStatusData(
        res,
        "success",
        "Accepted bookings for A+ restaurants retrieved successfully.",
        bookings
      );
    } catch (error) {
      console.error("Error fetching bookings:", error);
      resStatus(res, "false", "Failed to fetch bookings.");
    }
  }
};
export const contentUpload = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  const { bookingId } = req.body;
  const profileImage = req.file ? ((req.file as any).location || req.file.filename) : undefined;
  const booking = await BookingModel.findById(bookingId);
  if (!booking) {
    resStatus(res, "false", "Booking not found");
  } else {
    const updatedBooking = await BookingModel.findByIdAndUpdate(
      bookingId,
      { content_media: profileImage ? `image/${profileImage}` : undefined ,
      content_status:"uploaded",
      },
      { new: true }
    );
    if (!updatedBooking) {
      resStatus(res, "false", "Content not uploaded");
    }
    resStatusData(
      res,
      "success",
      "Content uploaded successfully",
      updatedBooking
    );
  }
};
export const contentStatus = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try { 
    const { bookingId, content_status } = req.body;
    if (!bookingId || !content_status) {
      resStatus(res, "false", "Booking ID and contentStatus are required.");
      return;
    }
    const existingBooking = await BookingModel.findById(bookingId);
    if (!existingBooking) {
      resStatus(res, "false", "Booking not found.");
      return;
    }
    
    // Prepare update object
    const updateData: any = { content_status: content_status };
    
    // If content is marked as accepted/completed, also update booking status
    // This makes the booking eligible for payout
    if (content_status === "accepted" || content_status === "completed") {
      updateData.status = "accepted"; // Set status to accepted for payout eligibility
      updateData.content_status = "accepted"; // Normalize to 'accepted' for payout queries
    }
    
    // Update booking status
    const updatedBooking = await BookingModel.findByIdAndUpdate(
      bookingId,
      updateData,
      { new: true }
    );

    if (!updatedBooking) {
      resStatus(res, "false", "Failed to update booking.");
      return;
    }
    
    // If content is approved, send notification to influencer
    if (content_status === "accepted" || content_status === "completed") {
      const user = await UserModel.findById(existingBooking.userId);
      const offer = await OfferModel.findById(existingBooking.offerId);
      
      if (user && offer) {
        const playerIDs: string[] = user.playerId || [];
        const title = "Content Approved";
        const notificationMessage = `Your content for ${offer.name} has been approved! Payout will be processed soon.`;
        const imageUrl = "image/download.png";
        
        for (const playerID of playerIDs) {
          await sendNotification(playerID, title, notificationMessage, imageUrl, "user");
        }
        
        await createNotification(
          new mongoose.Types.ObjectId(existingBooking.userId.toString()),
          new mongoose.Types.ObjectId(existingBooking.restoId.toString()),
          title,
          notificationMessage,
          imageUrl,
          "user"
        );
      }
    }
    
    resStatusData(
      res,
      "success",
      "Booking status updated successfully and notification sent.",
      updatedBooking
    );
  } catch (error) {
    console.error("Error updating booking status:", error);
    resStatus(res, "false", "An error occurred while updating the booking status.");
  }
} 
export const reUpload = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  const { bookingId } = req.body;
  const profileImage = req.file ? ((req.file as any).location || req.file.filename) : undefined;
  const booking = await BookingModel.findById(bookingId);
  if (!booking) {
    resStatus(res, "false", "Booking not found");
  } else {
    const updatedBooking = await BookingModel.findByIdAndUpdate(
      bookingId,
      { content_media: profileImage ? `image/${profileImage}` : undefined,
      content_status:"uploaded",
    },
      { new: true }
    );
    if (!updatedBooking) {
      resStatus(res, "false", "Content not uploaded");
    }
    resStatusData(
      res,
      "success",
      "Content uploaded successfully",
      updatedBooking
    );
  }
};
export const getAllRequestForPanel = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  const { userType, _id } = req.user;
  const matchCondition: any = {};
  if (userType === "business" || userType === "admin") {
    if (!_id) {
      resStatus(res, "false", "restoId is required for business users.");
      return;
    }

    try {
      matchCondition.restoId = new ObjectId(_id);
    } catch (error) {
      resStatus(res, "false", "Invalid restoId format.");
      return;
    }
    try {
      const bookings = await BookingModel.aggregate([
        {
          $match: matchCondition,
        },
        {
          $lookup: {
            from: "users",
            localField: "restoId",
            foreignField: "_id",
            as: "userDetails",
          },
        },
        {
          $unwind: {
            path: "$userDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "offers",
            localField: "offerId",
            foreignField: "_id",
            as: "offerDetails",
          },
        },
        {
          $unwind: {
            path: "$offerDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            status: 1,
            content_status: 1,
            userId: 1,
            offer_address: 1,
            offerId: 1,
            restoId: 1,
            review: 1,
             booking_dietry_preference: 1,
          booking_dish_preference: 1,
          booking_allergy: 1,
            selected_date: 1,
            selected_time: 1,
            address: 1,
            reason: 1,
            userDetails: 1,
            offerDetails: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ]);
      if (!bookings || bookings.length === 0) {
        resStatus(res, "true", "No bookings found.");
        return;
      }
      resStatusData(
        res,
        "success",
        "Bookings retrieved successfully.",
        bookings
      );
    } catch (error) {
      console.error("Error fetching bookings:", error);
      resStatus(res, "false", "An error occurred while retrieving bookings.");
    }
  } else {
    resStatus(res, "false", "not for nonbusiness users");
  }
};
export const getRequestDetailForPanel = async (req: Request | any, res: Response): Promise<void> => {
  try {
    const { businessId } = req.query;

    // Validate businessId
    if (!businessId) {
      resStatus(res, "false", "restoId is required for business users.");
      return
    }
    if (!mongoose.Types.ObjectId.isValid(businessId)) {
      resStatus(res, "false", "Invalid restoId format.");
      return 
    }
    // Find business user
    const business = await UserModel.findById(businessId);
    if (!business) {
      resStatus(res, "false", "Business not found.");
      return 
    }
    const matchCondition: any = { restoId: new mongoose.Types.ObjectId(businessId) };
    // Fetch bookings
    const bookings = await BookingModel.aggregate([
      { $match: matchCondition },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "offers",
          localField: "offerId",
          foreignField: "_id",
          as: "offerDetails",
        },
      },
      { $unwind: { path: "$offerDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          status: 1,
          content_status: 1,
          userId: 1,
          offerId: 1,
          restoId: 1,
          offer_address:1,
          review: 1,
          selected_date: 1,
          selected_time: 1,
          address: 1,
           booking_dietry_preference: 1,
          booking_dish_preference: 1,
          booking_allergy: 1,
          reason: 1,
          userDetails: 1,
          offerDetails: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);

    // Check if bookings exist
    if (!bookings || bookings.length === 0) {
      resStatus(res, "true", "No bookings found.");
      return 
    }

    resStatusData(res, "success", "Bookings retrieved successfully.", bookings);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    resStatus(res, "false", "An error occurred while retrieving bookings.");
  }
};
export const getAllBookings = async (req: any, res: Response): Promise<void> => {
  try {
    const { userType, _id } = req.user; 
    const { status, page = 1, limit = 10,search } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);

    let statusFilter: any = {};
    if (status && status !== "all") {
      statusFilter.status = status;
    }
    if (userType === "business") {
      statusFilter["restoId"] = _id;
    }
    const searchRegex = search
  ? new RegExp(search.toString().trim(), "i") 
  : null;

    const bookings = await BookingModel.aggregate([
      { $match: { ...statusFilter } },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "offers",
          localField: "offerId",
          foreignField: "_id",
          as: "offerDetails",
        },
      },
      { $unwind: { path: "$offerDetails", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "offerDetails.business_id",
          foreignField: "_id",
          as: "businessDetails",
        },
      },
      { $unwind: { path: "$businessDetails", preserveNullAndEmptyArrays: true } },
{
  $addFields: {
    "businessDetails.fullName": {
      $concat: [
        { $ifNull: ["$businessDetails.firstName", ""] },
        " ",
        { $ifNull: ["$businessDetails.lastName", ""] }
      ]
    }
  }
},
// Search filter using $regex
...(searchRegex
  ? [{
      $match: {
        $or: [
          { "userDetails.firstName": { $regex: searchRegex } },
          { "businessDetails.fullName": { $regex: searchRegex } },
          { "businessDetails.email": { $regex: searchRegex } }
        ]
      }
    }]
  : []),
      {
        $lookup: {
          from: "ratings",
          let: { influencerId: { $toObjectId: "$userDetails._id" } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$influencerId", "$$influencerId"] },
                profileType: "ProfileHealth",
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 }
          ],
          as: "ratings"
        }
      },
      { $unwind: { path: "$ratings", preserveNullAndEmptyArrays: true } },

      {
        $project: {
          _id: 1,
          status: 1,
          content_status: 1,
          userId: 1,
          restoId: 1,
          offer_address:1,
          offerId: 1,
          creator_post_seen: 1,
          selected_date: 1,
          selected_time: 1,
           booking_dietry_preference: 1,
          booking_dish_preference: 1,
          booking_allergy: 1,
          address: 1,
          reason:1,
          createdAt: 1,
          userDetails:1,
          offerDetails: {
            name: 1,
            business_id: 1, 
          },
          businessDetails: {
            firstName: 1,
            lastName: 1,
            email: 1,
          },
          ratings: 1,
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: (pageNumber - 1) * limitNumber },
      { $limit: limitNumber },
    ]);

    // Count total bookings with filtering
    const totalBookings = await BookingModel.countDocuments({ ...statusFilter });
    const totalPages = Math.ceil(totalBookings / limitNumber);

    if (!bookings || bookings.length === 0) {
      res.status(200).json({ status: "false", message: "No bookings found." });
      return;
    }

    res.status(200).json({
      status: "success",
      message: "Bookings retrieved successfully.",
      data: {
        totalBookings,
        currentPage: pageNumber,
        totalPages,
        bookings,
      },
    });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({ status: "false", message: "Failed to fetch bookings." });
  }
};
export const creator_post_seen = async (req: any, res:Response): Promise<void> => {
  const adminId = req.user._id;
  try { 
    const { bookingId, creator_post_status } = req.body;
    if (!bookingId || !creator_post_status) {
      resStatus(res, "false", "Booking ID and creatorPostStatus are required.");
      return;
    }
    const existingBooking = await BookingModel.findById(bookingId);
    if (!existingBooking) {
      resStatus(res, "false", "Booking not found.");
      return;
    }
    const updatedBooking = await BookingModel.findByIdAndUpdate(
      bookingId,
      { creator_post_seen: creator_post_status },
      { new: true }
    );
    if (!updatedBooking) {
      resStatus(res, "false", "Failed to update booking.");
      return;
    }
    else{
      const title = "Creator Post Seen";
      const notificationMessage = `Booking  has been seen by the Restaurant`;
      const imageUrl = "image/download.png";
     await createNotification(
        new mongoose.Types.ObjectId(updatedBooking.userId.toString()),
        new mongoose.Types.ObjectId(adminId.toString()),
        title,
        notificationMessage,
        imageUrl,
        "superadmin"
      );
    resStatusData(
      res,
      "success",
      "Booking  updated successfully",
      updatedBooking
    );
  } }catch (error) {
    console.error("Error updating booking status:", error);
    resStatus(res, "false", "An error occurred while updating the booking status.");
  }
}

/**
 * PHASE 5: Reschedule Booking
 * Allow influencer to request new date/time for accepted booking
 */
export const rescheduleBooking = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user._id;
    const { booking_id, new_date, new_time, reschedule_reason } = req.body;

    // Validate
    if (!booking_id || !new_date || !new_time) {
      resStatus(res, "false", "Booking ID, new date, and new time are required");
      return;
    }

    // Get booking
    const booking = await BookingModel.findById(booking_id)
      .populate("userId")
      .populate("restoId")
      .populate("offerId");

    if (!booking) {
      resStatus(res, "false", "Booking not found");
      return;
    }

    // Check if user owns booking
    if ((booking.userId as any)._id.toString() !== userId.toString()) {
      resStatus(res, "false", "Unauthorized - You don't own this booking");
      return;
    }

    // Check if can reschedule
    if (booking.status === "canceled" || booking.status === "past") {
      resStatus(res, "false", "Cannot reschedule canceled or past bookings");
      return;
    }

    if (booking.status === "rejected") {
      resStatus(res, "false", "Cannot reschedule rejected bookings");
      return;
    }

    // Save old dates for reference
    const old_date = booking.selected_date;
    const old_time = booking.selected_time;

    // Update booking
    booking.selected_date = new Date(new_date);
    booking.selected_time = new_time;
    booking.status = "pending"; // Reset to pending for business approval
    booking.reschedule_reason = reschedule_reason || "Requested reschedule";
    booking.reschedule_requested_at = new Date();
    booking.previous_date = old_date;
    booking.previous_time = old_time;
    await booking.save();

    // Send notification to business
    const user = booking.userId as any;
    const business = booking.restoId as any;
    const offer = booking.offerId as any;

    await createNotification(
      new mongoose.Types.ObjectId(business._id.toString()),
      new mongoose.Types.ObjectId(userId.toString()),
      "Reschedule Request",
      `${user.firstName || "Creator"} requested to reschedule booking for "${offer.name}" from ${old_time} to ${new_time}`,
      user.profileImage || "image/default.png",
      "booking_reschedule"
    );

    resStatusData(res, "success", "Reschedule request sent to business", {
      booking,
      old_date,
      old_time,
      new_date,
      new_time,
    });
  } catch (error: any) {
    console.error("Reschedule booking error:", error);
    resStatus(res, "false", error.message || "Failed to reschedule booking");
  }
};
