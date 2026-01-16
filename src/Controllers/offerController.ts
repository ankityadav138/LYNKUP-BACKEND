import { Request, Response } from "express";
import { resStatus, resStatusData } from "../Responses/Response";
import OfferModel from "../Models/offerModal";
import mongoose from "mongoose";
import UserModel from "../Models/UserModel";
import influencerRating from "../Models/influencerRating";
import BookingModel from "../Models/Booking";
import { sendBookingCancellationEmailMailgun, sendBookingCompleteEmailMailgun } from "../utils/errorCatch";
import { sendNotification } from "./NotificationController";
import Wallet from "../Models/Wallet";
import WalletTransaction from "../Models/WalletTransaction";

const MINIMUM_OFFER_AMOUNT = 20000;
export const createOffer = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  const adminId = req.user._id;
  const {
    name,
    details,
    min_reach,
    max_booking,
    offering,
    offer_type,
    offDays,
    restro_type,
    valid,
    business_id,
    instagram_reel,
    timeId,
    tags,
    address,
    min_follower,
    hashtags,
    content_delivery,
    content_guidelines,
    ending_type,
    creator_requirement,
  } = req.body;
  const files = req.files;
  const mediaFiles = files ? files.map((file: any) => file.location) : [];
  // const parsedLocation =
  //   typeof address === "string" ? JSON.parse(address) : address;
  const parsedvalid = typeof valid === "string" ? JSON.parse(valid) : valid;
  const parsedLocations = typeof address === "string" ? JSON.parse(address) : address;

if (!Array.isArray(parsedLocations) || parsedLocations.length === 0) {
  resStatus(res, "false", "At least one address/location is required.");
  return;
}

const locations = parsedLocations.map((loc: any) => ({
  type: loc.type || "Point",
  coordinates: loc.coordinates,
  address: loc.address || "",
}));
  if (!name || !offer_type || !business_id) {
    resStatus(res, "false", "Name, offer_type, and business_id are required.");
    return;
  }
  if (!["visite", "delivery"].includes(offer_type)) {
    resStatus(res, "false", "offer_type must be 'visite' or 'delivery'.");
    return
  }
  const startDate = new Date(parsedvalid.start);
  const endDate = new Date(parsedvalid.end);
  if (ending_type === "days") {
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      resStatus(
        res,
        "false",
        "Invalid date format for 'valid'.start or 'valid'.end. Use YYYY-MM-DD."
      );
      return;
    }
    if (startDate > endDate) {
      resStatus(res, "false", "Start date cannot be after end date.");
      return;
    }
    const offer = await OfferModel.create({
      adminId,
      name,
      business_id,
      instagram_reel,
      timeId,
      tags,
      // address:{
      //   type: parsedLocation.type,
      //   coordinates: parsedLocation.coordinates,
      //   address: parsedLocation.address,
      // },
      address:locations,
      min_follower,
      restro_type,
      hashtags,
      content_delivery,
      content_guidelines,
      media: mediaFiles,
      details: details || "",
      offering: offering || "",
      creator_requirement:creator_requirement || "",
      offer_type,
      offDays: typeof offDays === "string" ? JSON.parse(offDays) : offDays,
      max_booking,
      min_reach,
      valid: {
        start: startDate,
        end: endDate,
      },
      ending_type,
    });
    resStatusData(res, "success", "Offer created successfully", offer);
  }else{
  const offer = await OfferModel.create({
    adminId,
    name,
    business_id,
    instagram_reel,
    timeId,
    tags,
    restro_type,
    hashtags,
    // address:{
    //   type: parsedLocation.type,
    //   coordinates: parsedLocation.coordinates,
    //   address: parsedLocation.address,
    // },
    address:locations,
    content_delivery,
    content_guidelines,
    media: mediaFiles,
    details: details || "",
    creator_requirement:creator_requirement || "",
    offering: offering || "",
    offer_type,
    offDays: typeof offDays === "string" ? JSON.parse(offDays) : offDays,
    max_booking,
    min_follower,
    min_reach,
    ending_type,
  });
  resStatusData(res, "success", "Offer created successfully", offer);
}
};
export const createOfferByBusiness = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  const business_id = req.user._id;
  const {
    name,
    details,
    min_reach,
    max_booking,
    offering,
    offer_type,
    offDays,
    // restro_type,
    creator_requirement,
    valid,
    // business_id,
    instagram_reel,
    timeId,
    tags,
    address,
    min_follower,
    hashtags,
    content_delivery,
    content_guidelines,
    ending_type,
  } = req.body;

  // Check wallet balance FIRST
  let wallet = await Wallet.findOne({ user_id: business_id });
  
  // Create wallet if doesn't exist
  if (!wallet) {
    wallet = await Wallet.create({
      user_id: business_id,
      total_balance: 0,
      locked_balance: 0,
      available_balance: 0,
    });
  }

  // Check if sufficient balance
  if (wallet.available_balance < MINIMUM_OFFER_AMOUNT) {
    resStatusData(
      res,
      "error",
      "Insufficient wallet balance",
      {
        available_balance: wallet.available_balance,
        required_balance: MINIMUM_OFFER_AMOUNT,
        shortage: MINIMUM_OFFER_AMOUNT - wallet.available_balance,
      }
    );
    return;
  }

  const files = req.files;
  const mediaFiles = files ? files.map((file: any) => file.location) : [];
  const parsedvalid = typeof valid === "string" ? JSON.parse(valid) : valid;
  // const parsedLocation =
  //   typeof address === "string" ? JSON.parse(address) : address;
  const parsedLocations = typeof address === "string" ? JSON.parse(address) : address;

if (!Array.isArray(parsedLocations) || parsedLocations.length === 0) {
  resStatus(res, "false", "At least one address/location is required.");
  return;
}

const locations = parsedLocations.map((loc: any) => ({
  type: loc.type || "Point",
  coordinates: loc.coordinates,
  address: loc.address || "",
}));
  if (!name || !offer_type ) {
    resStatus(res, "false", "Name, offer_type, and business_id are required.");
    return;
  }
  if (!["visite", "delivery"].includes(offer_type)) {
    resStatus(res, "false", "offer_type must be 'visite' or 'delivery'.");
    return;
  }
  const startDate = new Date(parsedvalid.start);
  const endDate = new Date(parsedvalid.end);
  if (ending_type === "days") {
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      resStatus(
        res,
        "false",
        "Invalid date format for 'valid'.start or 'valid'.end. Use YYYY-MM-DD."
      );
      return;
    }
    if (startDate > endDate) {
      resStatus(res, "false", "Start date cannot be after end date.");
      return;
    }

    // Lock wallet balance BEFORE creating offer
    try {
      await wallet.lockAmount(MINIMUM_OFFER_AMOUNT);

      // Calculate withdrawal eligibility date (30 days from now)
      const withdrawalDate = new Date();
      withdrawalDate.setDate(withdrawalDate.getDate() + 30);

      const offer = await OfferModel.create({
        // adminId,
        name,
        business_id,
        instagram_reel,
        timeId,
        tags,
        // address:{
        //   type: parsedLocation.type,
        //   coordinates: parsedLocation.coordinates,
        //   address: parsedLocation.address,
        // },
        address:locations,
        min_follower,
        // restro_type,
        hashtags,
        content_delivery,
        content_guidelines,
        media: mediaFiles,
        details: details || "",
        offering: offering || "",
        creator_requirement:creator_requirement || "",
        offer_type,
        offDays: typeof offDays === "string" ? JSON.parse(offDays) : offDays,
        max_booking,
        min_reach,
        valid: {
          start: startDate,
          end: endDate,
        },
        ending_type,
        locked_amount: MINIMUM_OFFER_AMOUNT,
        withdrawal_eligibility_date: withdrawalDate,
        is_eligible_for_withdrawal: false,
        withdrawal_requested: false,
      });

      // Create wallet transaction record
      await WalletTransaction.create({
        wallet_id: wallet._id,
        user_id: business_id,
        type: "lock",
        amount: MINIMUM_OFFER_AMOUNT,
        status: "completed",
        description: `Amount locked for offer: ${name}`,
        reference_type: "offer",
        reference_id: offer._id,
        balance_before: wallet.available_balance + MINIMUM_OFFER_AMOUNT,
        balance_after: wallet.available_balance,
      });

      resStatusData(res, "success", "Offer created successfully by business", {
        offer,
        wallet_balance: {
          total_balance: wallet.total_balance,
          available_balance: wallet.available_balance,
          locked_balance: wallet.locked_balance,
        },
      });
    } catch (error: any) {
      resStatusData(res, "error", error.message, null);
      return;
    }
  }else{
    // Lock wallet balance BEFORE creating offer
    try {
      await wallet.lockAmount(MINIMUM_OFFER_AMOUNT);

      // Calculate withdrawal eligibility date (30 days from now)
      const withdrawalDate = new Date();
      withdrawalDate.setDate(withdrawalDate.getDate() + 30);

      const offer = await OfferModel.create({
        // adminId,
        name,
        business_id,
        instagram_reel,
        timeId,
        tags,
        // restro_type,
        // address:{
        //   type: parsedLocation.type,
        //   coordinates: parsedLocation.coordinates,
        //   address: parsedLocation.address,
        // },
        address:locations,
        hashtags,
        content_delivery,
        content_guidelines,
        media: mediaFiles,
        details: details || "",
        offering: offering || "",
        creator_requirement:creator_requirement || "",
        offer_type,
        offDays: typeof offDays === "string" ? JSON.parse(offDays) : offDays,
        max_booking,
        min_follower,
        min_reach,
        ending_type,
        locked_amount: MINIMUM_OFFER_AMOUNT,
        withdrawal_eligibility_date: withdrawalDate,
        is_eligible_for_withdrawal: false,
        withdrawal_requested: false,
      });

      // Create wallet transaction record
      await WalletTransaction.create({
        wallet_id: wallet._id,
        user_id: business_id,
        type: "lock",
        amount: MINIMUM_OFFER_AMOUNT,
        status: "completed",
        description: `Amount locked for offer: ${name}`,
        reference_type: "offer",
        reference_id: offer._id,
        balance_before: wallet.available_balance + MINIMUM_OFFER_AMOUNT,
        balance_after: wallet.available_balance,
      });

      resStatusData(res, "success", "Offer created successfully by business", {
        offer,
        wallet_balance: {
          total_balance: wallet.total_balance,
          available_balance: wallet.available_balance,
          locked_balance: wallet.locked_balance,
        },
      });
    } catch (error: any) {
      resStatusData(res, "error", error.message, null);
      return;
    }
  }
};
export const showOfferAdmin = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  const { page = 1, limit = 10, search } = req.query;
  const userId = req.user._id;
  const userType = req.user.userType;
  try {
    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const matchCondition: any = {
      "userDetails.userType" : "business",
      isdeleted: false,
      ...(userType === "business" && { business_id: userId }),
    };

    if (search) {
      matchCondition.$or = [
        { name: { $regex: new RegExp(search as string, "i") } },
        { offer_type: { $regex: new RegExp(search as string, "i") } },
      ];
    }

    const offers = await OfferModel.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "business_id",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      {
        $unwind: "$userDetails",
      },
      {
        $match: matchCondition,
      },
      {
        $lookup: {
          from: "foodtimings",
          localField: "timeId",
          foreignField: "_id",
          as: "foodTimings",
        },
      },
      {
        $lookup: {
          from: "bookings",
          localField: "_id",
          foreignField: "offerId",
          as: "bookings",
        },
      },
      {
        $addFields: {
          noOfBookings: { $size: "$bookings" }, // Count number of bookings per offer
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      { $skip: (pageNumber - 1) * limitNumber },
      { $limit: limitNumber },
      {
        $project: {
          _id: 1,
          name: 1,
          offer_type: 1,
          timeId: 1,
          media: 1,
          creator_requirement: 1,
          instagram_reel: 1,
          offDays: 1,
          hashtags: 1,
          tags: 1,
          content_delivery: 1,
          content_guidelines: 1,
          address: 1,
          createdAt: 1,
          updatedAt: 1,
          offering: 1,
          noOfBookings: 1,
          details: 1,
          isdeleted: 1,
          max_booking: 1,
          ending_type: 1,
          status:1,
          min_reach: 1,
          valid: 1,
          restro_type: 1,
          min_follower: 1 ,
          foodTimings: 1,
          userDetails: {
            _id: 1,
            location: 1,
            name: 1,
            userType: 1,
            email: 1,
            firstName: 1,
            lastName: 1,
            profileImage: 1,
          },
        },
      },
    ]);

    const totalOffers = await OfferModel.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "business_id",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      {
        $unwind: "$userDetails",
      },
      {
        $match: matchCondition,
      },
      { $count: "totalOffers" },
    ]);

    const response = {
      totalOffers: totalOffers.length > 0 ? totalOffers[0].totalOffers : 0,
      currentPage: pageNumber,
      totalPages: Math.ceil(
        (totalOffers.length > 0 ? totalOffers[0].totalOffers : 0) / limitNumber
      ),
      offers,
    };

    resStatusData(res, "success", "Offers retrieved successfully", response);
  } catch (error) {
    console.error("Error fetching offers for admin/business:", error);
    resStatus(res, "false", "Failed to fetch offers");
  }
};
// export const showOfferUser = async (
//   req: Request | any,
//   res: Response
// ): Promise<void> => {
//   const userId = req.user._id;
//   // const { page = 1, limit = 10, search,startDate, endDate} = req.query;
//   const { page = 1, limit = 10, search, selectedDate } = req.query;
//   const { latitude, longitude } = req.body;
// console.log("============",latitude,longitude)
//   if (!latitude || !longitude) {
//     resStatus(
//       res,
//       "false",
//       "Coordinates (latitude and longitude) are required"
//     );
//     return
//   }
//   try {
//     function normalizeAddress(rawAddress: any): object {
//       if (Array.isArray(rawAddress)) {
//         return rawAddress[0] || {};
//       } else if (typeof rawAddress === "string") {
//         try {
//           const parsed = JSON.parse(rawAddress);
//           return typeof parsed === "object" && parsed !== null ? parsed : { full: rawAddress };
//         } catch {
//           return { full: rawAddress };
//         }
//       } else if (typeof rawAddress === "object" && rawAddress !== null) {
//         return rawAddress;
//       }
//       return {};
//     }
    
//     const pageNumber = parseInt(page as string, 10);
//     const limitNumber = parseInt(limit as string, 10);

//     const currentUser = await UserModel.findById(userId).select("businessDiscovery insights");
//     const userFollowers = currentUser?.businessDiscovery?.followers_count || 0;
//     const userReach = currentUser?.insights?.reach || 0;
//     // Find nearby businesses
//     const nearbyBusinesses = await UserModel.find({
//       userType: "business",
//       "location.coordinates": {
//         $near: {
//           $geometry: { type: "Point", coordinates: [longitude, latitude] },
//           $maxDistance: 100000,
//         },
//       },
//     }).select("_id");

//     const businessIds = nearbyBusinesses.map((business) => business._id);
//     const bookedOffers = await BookingModel.find({ userId }).select("offerId");
//     const bookedOfferIds = bookedOffers.map((booking) => booking.offerId);
//     let dateFilter: any = {};
// if (selectedDate) {
//   const selected = new Date(new Date(selectedDate as string).toDateString());
//   dateFilter = {
//     "valid.start": { $lte: selected },
//     "valid.end": { $gte: selected },
//   };
// }

//     const offers = await OfferModel.aggregate([
//       {
//         $match: {
//           business_id: { $in: businessIds },
//           _id: { $nin: bookedOfferIds },
//           isdeleted: false,
//           status: "live",
//           ...dateFilter,
//           ...(search
//             ? {
//                 $or: [
//                   { name: { $regex: new RegExp(search as string, "i") } },
//                   { offer_type: { $regex: new RegExp(search as string, "i") } },
//                 ],
//               }
//             : {}),
//         },
//       },
     
      
//       {
//         $lookup: {
//           from: "bookings",
//           localField: "_id",
//           foreignField: "offerId",
//           as: "bookings",
//         },
//       },
//       {
//         $addFields: {
//           acceptedBookings: {
//             $size: {
//               $filter: {
//                 input: { $ifNull: ["$bookings", []] }, // 👈 this avoids null input
//                 as: "booking",
//                 cond: { $eq: ["$$booking.status", "accepted"] },
//               },
//             },
//           },
//         },
//       },
      
//       // {
//       //   $match: {
//       //     $expr: { $lt: ["$acceptedBookings", "$max_booking"] },
//       //   },
//       // },
//       {
//         $match: {
//           $expr: {
//             $or: [
//               {
//                 $and: [
//                   { $ne: ["$max_booking", null] },
//                   { $lt: ["$acceptedBookings", "$max_booking"] }
//                 ]
//               },
//               {
//                 $or: [
//                   { $eq: ["$max_booking", null] },
//                   { $not: ["$max_booking"] }
//                 ]
//               }
//             ]
//           }
//         }
//       }
      
//       ,
         
//       {
//         $lookup: {
//           from: "foodtimings",
//           localField: "timeId",
//           foreignField: "_id",
//           as: "foodTimings",
//         },
//       },
//       {
//         $lookup: {
//           from: "users",
//           localField: "business_id",
//           foreignField: "_id",
//           as: "userDetails",
//         },
//       },
//       { $unwind: "$userDetails" },
//       { $sort: { createdAt: -1 } },
//     ]);
//     // if (selectedDate) {
//     //   const selectedDay = new Date(selectedDate).toLocaleString('en-US', { weekday: 'long' });
    
//     //   const filteredOffers = offers.filter((offer: any) => {
//     //     const minFollower = offer.min_follower || 0;
//     //     const minReach = offer.min_reach || 0;
    
//     //     const isOffDay = offer.offDays?.includes(selectedDay);
    
//     //     return (
//     //       userFollowers >= minFollower &&
//     //       userReach >= minReach &&
//     //       !isOffDay
//     //     );
//     //   });
    
//     //   // Pagination after filtering
//     //   const paginatedOffers = filteredOffers.slice(
//     //     (pageNumber - 1) * limitNumber,
//     //     pageNumber * limitNumber
//     //   );
    
//     //   const response = {
//     //     totalOffers: filteredOffers.length,
//     //     currentPage: pageNumber,
//     //     totalPages: Math.ceil(filteredOffers.length / limitNumber),
//     //     offers: paginatedOffers,
//     //   };
    
//     //   resStatusData(res, "success", "Offers retrieved successfully", response);
//     //   return; // ✅ Now safe to return after sending response
//     // }
//     if (selectedDate) {
//       const selectedDay = new Date(selectedDate).toLocaleString('en-US', { weekday: 'long' });
    
//       // Filter offers based on follower/reach/offDay
//       const filteredOffers = offers.filter((offer: any) => {
//         const minFollower = offer.min_follower || 0;
//         const minReach = offer.min_reach || 0;
    
//         const isOffDay = offer.offDays?.includes(selectedDay);
    
//         return (
//           userFollowers >= minFollower &&
//           userReach >= minReach &&
//           !isOffDay
//         );
//       });
    
//       const normalizedOffers = filteredOffers.map((offer: any) => {
//         // Normalize userDetails.address
//         const rawUserAddress = offer?.userDetails?.address;
//         if (Array.isArray(rawUserAddress)) {
//           offer.userDetails.address = rawUserAddress[0] || {};
//         } else if (typeof rawUserAddress === "string") {
//           try {
//             const parsed = JSON.parse(rawUserAddress);
//             offer.userDetails.address = (typeof parsed === "object" && parsed !== null) ? parsed : { full: rawUserAddress };
//           } catch {
//             offer.userDetails.address = { full: rawUserAddress };
//           }
//         } else if (typeof rawUserAddress === "object" && rawUserAddress !== null) {
//           offer.userDetails.address = rawUserAddress;
//         } else {
//           offer.userDetails.address = {};
//         }
      
//         // ✅ Normalize offer-level address
//         const rawOfferAddress = offer?.address;
//         if (Array.isArray(rawOfferAddress)) {
//           offer.address = rawOfferAddress[0] || {};
//         } else if (typeof rawOfferAddress === "string") {
//           try {
//             const parsed = JSON.parse(rawOfferAddress);
//             offer.address = (typeof parsed === "object" && parsed !== null) ? parsed : { full: rawOfferAddress };
//           } catch {
//             offer.address = { full: rawOfferAddress };
//           }
//         } else if (typeof rawOfferAddress === "object" && rawOfferAddress !== null) {
//           offer.address = rawOfferAddress;
//         } else {
//           offer.address = {};
//         }
      
//         return offer;
//       });
      
//     }
    
    
//     // const filteredOffers = offers.filter((offer: any) => {
//     //   const minFollower = offer.min_follower || 0;
//     //   const minReach = offer.min_reach || 0;
//     //   return userFollowers >= minFollower && userReach >= minReach;
//     // });
  
//     // // Pagination after filtering
//     // const paginatedOffers = filteredOffers.slice(
//     //   (pageNumber - 1) * limitNumber,
//     //   pageNumber * limitNumber
//     // );

//     // const response = {
//     //   totalOffers: filteredOffers.length,
//     //   currentPage: pageNumber,
//     //   totalPages: Math.ceil(filteredOffers.length / limitNumber),
//     //   offers: paginatedOffers,
//     // };

//     // resStatusData(res, "success", "Offers retrieved successfully", response);
//     const filteredOffers = offers.filter((offer: any) => {
//       const minFollower = offer.min_follower || 0;
//       const minReach = offer.min_reach || 0;
//       return userFollowers >= minFollower && userReach >= minReach;
//     });
    
//     // ✅ Normalize `offer.address` and `userDetails.address`
//     const normalizedOffers = filteredOffers.map((offer: any) => {
//       // Normalize userDetails.address
//       const rawUserAddress = offer?.userDetails?.address;
//       if (Array.isArray(rawUserAddress)) {
//         offer.userDetails.address = rawUserAddress[0] || {};
//       } else if (typeof rawUserAddress === "string") {
//         try {
//           const parsed = JSON.parse(rawUserAddress);
//           offer.userDetails.address =
//             typeof parsed === "object" && parsed !== null ? parsed : { full: rawUserAddress };
//         } catch {
//           offer.userDetails.address = { full: rawUserAddress };
//         }
//       } else if (typeof rawUserAddress === "object" && rawUserAddress !== null) {
//         offer.userDetails.address = rawUserAddress;
//       } else {
//         offer.userDetails.address = {};
//       }
    
//       // Normalize offer.address
//       const rawOfferAddress = offer?.address;
//       if (Array.isArray(rawOfferAddress)) {
//         offer.address = rawOfferAddress[0] || {};
//       } else if (typeof rawOfferAddress === "string") {
//         try {
//           const parsed = JSON.parse(rawOfferAddress);
//           offer.address =
//             typeof parsed === "object" && parsed !== null ? parsed : { full: rawOfferAddress };
//         } catch {
//           offer.address = { full: rawOfferAddress };
//         }
//       } else if (typeof rawOfferAddress === "object" && rawOfferAddress !== null) {
//         offer.address = rawOfferAddress;
//       } else {
//         offer.address = {};
//       }
    
//       return offer;
//     });
    
//     // Pagination
//     const paginatedOffers = normalizedOffers.slice(
//       (pageNumber - 1) * limitNumber,
//       pageNumber * limitNumber
//     );
    
//     // Response
//     const response = {
//       totalOffers: normalizedOffers.length,
//       currentPage: pageNumber,
//       totalPages: Math.ceil(normalizedOffers.length / limitNumber),
//       offers: paginatedOffers,
//     };
    
//     resStatusData(res, "success", "Offers retrieved successfully", response);
    
    
//   } catch (error) {
//     console.error("Error fetching offers:", error);
//     resStatus(res, "false", "Failed to fetch offers");
//   }
// };
function formatIndianNumber(x:any) {
  return Number(x).toLocaleString('en-US');
}


export const showOfferUser = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  const userId = req.user._id;
  // const { page = 1, limit = 10, search,startDate, endDate} = req.query;
  const { page = 1, limit = 10, search, selectedDate } = req.query;
  const { latitude, longitude } = req.body;
     console.log("============",latitude,longitude)
  if (!latitude || !longitude) {
    resStatus(
      res,
      "false",
      "Coordinates (latitude and longitude) are required"
    );
    return
  }
  try {
    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);

    const currentUser = await UserModel.findById(userId).select("businessDiscovery insights");
    const userFollowers = currentUser?.businessDiscovery?.followers_count || 0;
    const userReach = currentUser?.insights?.reach || 0;
    // Find nearby businesses
    const nearbyBusinesses = await UserModel.find({
      userType: "business",
      "location.coordinates": {
        $near: {
          $geometry: { type: "Point", coordinates: [longitude, latitude] },
          $maxDistance: 100000,
        },
      },
    }).select("_id");

    const businessIds = nearbyBusinesses.map((business) => business._id);
    const bookedOffers = await BookingModel.find({ userId }).select("offerId");
    const bookedOfferIds = bookedOffers.map((booking) => booking.offerId);
    let dateFilter: any = {};
if (selectedDate) {
  const selected = new Date(new Date(selectedDate as string).toDateString());
  dateFilter = {
    "valid.start": { $lte: selected },
    "valid.end": { $gte: selected },
  };
}

    const offers = await OfferModel.aggregate([
      {
        $match: {
          business_id: { $in: businessIds },
          _id: { $nin: bookedOfferIds },
          isdeleted: false,
          status: "live",
          ...dateFilter,
          ...(search
            ? {
                $or: [
                  { name: { $regex: new RegExp(search as string, "i") } },
                  { offer_type: { $regex: new RegExp(search as string, "i") } },
                ],
              }
            : {}),
        },
      },
     
      
      {
        $lookup: {
          from: "bookings",
          localField: "_id",
          foreignField: "offerId",
          as: "bookings",
        },
      },
      {
        $addFields: {
          acceptedBookings: {
            $size: {
              $filter: {
                input: { $ifNull: ["$bookings", []] }, // 👈 this avoids null input
                as: "booking",
                cond: { $eq: ["$$booking.status", "accepted"] },
              },
            },
          },
        },
      },
      
      // {
      //   $match: {
      //     $expr: { $lt: ["$acceptedBookings", "$max_booking"] },
      //   },
      // },
      {
        $match: {
          $expr: {
            $or: [
              {
                $and: [
                  { $ne: ["$max_booking", null] },
                  { $lt: ["$acceptedBookings", "$max_booking"] }
                ]
              },
              {
                $or: [
                  { $eq: ["$max_booking", null] },
                  { $not: ["$max_booking"] }
                ]
              }
            ]
          }
        }
      }
      
      ,
         
      {
        $lookup: {
          from: "foodtimings",
          localField: "timeId",
          foreignField: "_id",
          as: "foodTimings",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "business_id",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      { $unwind: "$userDetails" },
      { $sort: { createdAt: -1 } },
    ]);
    if (selectedDate) {
      const selectedDay = new Date(selectedDate).toLocaleString('en-US', { weekday: 'long' });
      const offersWithLock = offers.map((offer: any) => {
        const minFollower = offer.min_follower || 0;
        const minReach = offer.min_reach || 0;
        const isOffDay = selectedDay ? offer.offDays?.includes(selectedDay) : false;
  
        const meetsFollower = userFollowers >= minFollower;
        const meetsReach = userReach >= minReach;
  const formattedMinFollower = minFollower > 900 ? formatIndianNumber(minFollower) : minFollower;
const formattedMinReach = minReach > 900 ? formatIndianNumber(minReach) : minReach;
        const locked = !(meetsFollower && meetsReach && !isOffDay);
        let lock_reason = null;
        if (locked) {
          if (!meetsFollower && !meetsReach) {
            lock_reason = `You need at least ${formattedMinFollower} followers and ${formattedMinReach} reach to unlock the offer`;
          } else if (!meetsFollower) {
            lock_reason = `You need at least ${formattedMinFollower} followers to unlock the offer`;
          } else if (!meetsReach) {
            lock_reason = `You need at least ${formattedMinReach} reach to unlock the offer`;
          }
        }
      
        return {
          ...offer,
          lock: locked,
          lock_reason,
        };
      });
      const allOffersLocked = offersWithLock.length > 0 && offersWithLock.every((offer: any) => offer.lock);
      const paginatedOffers = offersWithLock.slice(
        (pageNumber - 1) * limitNumber,
        pageNumber * limitNumber
      );
  
      const response = {
        totalOffers: offersWithLock.length,
        currentPage: pageNumber,
        totalPages: Math.ceil(offersWithLock.length / limitNumber),
        offers: paginatedOffers,
      };
  
      if (allOffersLocked) {
        resStatusData(res, "success", "All nearby offers are locked. You need more followers or reach to unlock them.", response);
      } else {
        resStatusData(res, "success", "Offers retrieved successfully", response);
      }
      return; 
    }
    
     const offersWithLock = offers.map((offer: any) => {
      const minFollower = offer.min_follower || 0;
      const minReach = offer.min_reach || 0;
      // const isOffDay = selectedDay ? offer.offDays?.includes(selectedDay) : false;

      const meetsFollower = userFollowers >= minFollower;
      const meetsReach = userReach >= minReach;
      const formattedMinFollower = minFollower > 900 ? formatIndianNumber(minFollower) : minFollower;
      const formattedMinReach = minReach > 900 ? formatIndianNumber(minReach) : minReach;

      const locked = !(meetsFollower && meetsReach );
      let lock_reason = null;
      if (locked) {
        if (!meetsFollower && !meetsReach) {
          lock_reason = `You need at least ${formattedMinFollower} followers and ${formattedMinReach} reach to unlock the offer`;
        } else if (!meetsFollower) {
          lock_reason = `You need at least ${formattedMinFollower} followers to unlock the offer`;
        } else if (!meetsReach) {
          lock_reason = `You need at least ${formattedMinReach} reach to unlock the offer`;
        }
      }
    
      return {
        ...offer,
        lock: locked,
        lock_reason,
      };
    });
    const allOffersLocked = offersWithLock.length > 0 && offersWithLock.every((offer: any) => offer.lock);
    // Pagination after setting lock flag
    const paginatedOffers = offersWithLock.slice(
      (pageNumber - 1) * limitNumber,
      pageNumber * limitNumber
    );

    const response = {
      totalOffers: offersWithLock.length,
      currentPage: pageNumber,
      totalPages: Math.ceil(offersWithLock.length / limitNumber),
      offers: paginatedOffers,
    };

    if (allOffersLocked) {
      resStatusData(res, "success", "All nearby offers are locked. You need more followers or reach to unlock them.", response);
    } else {
      resStatusData(res, "success", "Offers retrieved successfully", response);
    }
  } catch (error) {
    console.error("Error fetching offers:", error);
    resStatus(res, "false", "Failed to fetch offers");
  }
};

export const editOffer = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  const { offerId } = req.query;
  const {
    name,
    details,
    min_reach,
    max_booking,
    restro_type,
    offering,
    address,
    offer_type,
    creator_requirement,
    offDays,
    valid,
    min_follower,
    business_id,
    instagram_reel,
    timeId,
    tags,
    hashtags,
    content_delivery,
    content_guidelines,
    ending_type,
    status,
  } = req.body;

  const files = req.files;
  const mediaFiles = files ? files.map((file: any) => file.location) : [];
  const parsedvalid = typeof valid === "string" ? JSON.parse(valid) : valid;
  // const parsedLocation =
  //   typeof address === "string" ? JSON.parse(address) : address;
  const parsedLocations = typeof address === "string" ? JSON.parse(address) : address;

// if (!Array.isArray(parsedLocations) || parsedLocations.length === 0) {
//   resStatus(res, "false", "At least one address/location is required.");
//   return;
// }

const locations = parsedLocations.map((loc: any) => ({
  type: loc.type || "Point",
  coordinates: loc.coordinates,
  address: loc.address || "",
}));
  if (!offerId) {
    resStatus(res, "false", "Offer ID is required.");
    return;
  }

 else if (!["visite", "delivery"].includes(offer_type)) {
    resStatus(res, "false", "offer_type must be 'visite' or 'delivery'.");
    return;
  }
else{
  const existingOffer = await OfferModel.findById(offerId);
  if (!existingOffer) {
    resStatus(res, "false", "Offer not found.");
    return;
  }
  const startDate = new Date(parsedvalid.start);
  const endDate = new Date(parsedvalid.end);
  const combinedMedia = [...(existingOffer.media || []), ...mediaFiles];
  const updatedOffer = await OfferModel.findByIdAndUpdate(
    offerId,
    {
      name,
      details,
      min_reach,
      max_booking,
      offering,
      restro_type,
      offer_type,
      creator_requirement,
      offDays: typeof offDays === "string" ? JSON.parse(offDays) : offDays,
      // address:{
      //   type: parsedLocation.type,
      //   coordinates: parsedLocation.coordinates,
      //   address: parsedLocation.address,
      // },
      address:locations,
      valid: {
        start: startDate,
        end: endDate,
      },
      min_follower,
      business_id,
      instagram_reel,
      timeId,
      tags,
      hashtags,
      content_delivery,
      content_guidelines,
      ending_type,
      status,
      ...(mediaFiles.length > 0 && { media: combinedMedia }),
    },
    { new: true }
  );

  if (!updatedOffer) {
    resStatus(res, "false", "Offer not found.");
    return;
  }
else{
  resStatusData(res, "success", "Offer updated successfully", updatedOffer);
}
}
};
export const editOfferByBusiness = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  const business_id = req.user._id;
  const { offerId } = req.query;
  const {
    name,
    details,
    min_reach,
    max_booking,
    // restro_type,
    offering,
    address,
    offer_type,
    offDays,
    valid,
    min_follower,
    // business_id,
    instagram_reel,
    creator_requirement,
    timeId,
    tags,
    hashtags,
    content_delivery,
    content_guidelines,
    ending_type,
    status,
  } = req.body;

  const files = req.files;
  const mediaFiles = files ? files.map((file: any) => file.location) : [];
  const parsedvalid = typeof valid === "string" ? JSON.parse(valid) : valid;
  // const parsedLocation =
  //   typeof address === "string" ? JSON.parse(address) : address;
  const parsedLocations = typeof address === "string" ? JSON.parse(address) : address;

// if (!Array.isArray(parsedLocations) || parsedLocations.length === 0) {
//   resStatus(res, "false", "At least one address/location is required.");
//   return;
// }

const locations = parsedLocations.map((loc: any) => ({
  type: loc.type || "Point",
  coordinates: loc.coordinates,
  address: loc.address || "",
}));
  if (!offerId) {
    resStatus(res, "false", "Offer ID is required.");
    return;
  }
 else if (!["visite", "delivery"].includes(offer_type)) {
    resStatus(res, "false", "offer_type must be 'visite' or 'delivery'.");
    return;
  }
else{
  const startDate = new Date(parsedvalid.start);
  const endDate = new Date(parsedvalid.end);
  const updatedOffer = await OfferModel.findByIdAndUpdate(
    offerId,
    {
      name,
      details,
      min_reach,
      max_booking,
      offering,
      // restro_type,
      offer_type,
      creator_requirement,
      offDays: typeof offDays === "string" ? JSON.parse(offDays) : offDays,
      // address:{
      //   type: parsedLocation.type,
      //   coordinates: parsedLocation.coordinates,
      //   address: parsedLocation.address,
      // },
      address:locations,
      valid: {
        start: startDate,
        end: endDate,
      },
      min_follower,
      business_id,
      instagram_reel,
      timeId,
      tags,
      hashtags,
      content_delivery,
      content_guidelines,
      ending_type,
      status,
      ...(mediaFiles.length > 0 && { media: mediaFiles }),
    },
    { new: true }
  );

  if (!updatedOffer) {
    resStatus(res, "false", "Offer not found.");
    return;
  }
else{
  resStatusData(res, "success", "Offer updated successfully", updatedOffer);
}
}
};
export const deleteOffer = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  const { offerId } = req.query;
  if (!offerId) {
    resStatus(res, "false", "Offer ID is required.");
  } else {
    const updatedOffer = await OfferModel.findByIdAndUpdate(
      offerId,
      {
        isdeleted: true,
      },
      { new: true }
    );
    if (!updatedOffer) {
      resStatus(res, "false", "Offer not found.");
    }
    resStatusData(res, "success", "Offer deleted successfully", updatedOffer);
  }
};
export const showOfferByID = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.query;
    if (!id) {
      resStatus(res, "false", "Offer ID is required.");
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      resStatus(res, "false", "Invalid Offer ID format.");
    }
    const offerData = await OfferModel.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(id) },
      },
      {
        $lookup: {
          from: "users",
          localField: "adminId",
          foreignField: "_id",
          as: "adminDetails",
        },
      },
      {
        $unwind: {
          path: "$adminDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "foodtimings",
          localField: "adminId",
          foreignField: "userId",
          as: "foodTimings",
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          media: 1,
          offDays: 1,
          offering: 1,
          details: 1,
          offer_type: 1,
          business_id: 1,
          instagram_reel: 1,
          tags: 1,
          hashtags: 1,
          content_delivery: 1,
          content_guidelines: 1,
          foodTimings: 1,
        },
      },
    ]);
    if (!offerData.length) {
      resStatus(res, "false", "No offer found with the provided ID.");
    }
    const response = {
      offer: offerData[0],
    };
    resStatusData(res, "success", "Offer retrieved successfully.", response);
  } catch (error) {
    console.error("Error fetching offer:", error);
    resStatus(res, "false", "An error occurred while fetching data.");
  }
};
export const Feedback = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  const userId = req.user._id;
  const { bookingId, appFeedback, restroFeedback } = req.body;
  if (!bookingId) {
    resStatus(res, "false", "Booking ID is required.");
    return;
  } else {
    const bookingExists = await BookingModel.findById(bookingId);
    if (!bookingExists) {
      resStatus(res, "false", "Booking not found.");
      return;
    } else if (!appFeedback && !restroFeedback) {
      resStatus(
        res,
        "false",
        "At least one feedback field (app or restaurant) is required."
      );
      return;
    } else {
      const newFeedback = new influencerRating({
        influencerId: userId,
        bookingId,
        appFeedback,
        restroFeedback,
        feedbackStatus:true,
        feedbackType:'admin',
      });
      await newFeedback.save();
     const updatedBooking = await BookingModel.findByIdAndUpdate(
        bookingId,
        { review: true,
          status:"past"
         },
        { new: true }
      );
      const resId = updatedBooking?.restoId;
      const offId = updatedBooking?.offerId;
      const offer = await UserModel.findById(offId);
      const restoUser = await UserModel.findById(resId);
      const playerIDs: string[] = restoUser?.playerId || ["d4f36cc6-f7bb-4b0f-bc01-c04c7509a247"];
      const title = "Booking Completed";
      const notificationMessage = "Booking has been Completed by the creator.";
      const imageUrl = "image/download.png";
      if (restoUser?.email) {
        const username = `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim();
        await sendBookingCompleteEmailMailgun(
          restoUser.email,
          offer?.name || "Offer",
          username,
         "Booking Completed"
        );
      }
      for (const playerID of playerIDs) {
        await sendNotification(playerID, title, notificationMessage, imageUrl, "user");
      }
      resStatusData(
        res,
        "success",
        "Feedback submitted successfully.",
        newFeedback
      );
    }
  }
};
export const adminFeedback = async (req: Request | any, res: Response) => {
  const adminId = req.user._id;
  const adminType = req.user.userType;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  let matchCondition: any = { feedbackType: "admin" };

  if (adminType === "business") {
    const bookings = await BookingModel.find({ restoId: adminId }).select("_id");
    const bookingIds = bookings.map((b) => b._id);
    matchCondition.bookingId = { $in: bookingIds };
  }

  try {
    const totalCount = await influencerRating.countDocuments(matchCondition);

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

      {
        $lookup: {
          from: "bookings",
          localField: "bookingId",
          foreignField: "_id",
          as: "booking",
        },
      },
      { $unwind: { path: "$booking", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "offers",
          localField: "booking.offerId",
          foreignField: "_id",
          as: "offer",
        },
      },
      { $unwind: { path: "$offer", preserveNullAndEmptyArrays: true } },

      {
        $project: {
          _id: 1,
          status: 1,
          bookingId: 1,
          restroFeedback: 1,
          appFeedback: 1,
          createdAt: 1,
          "user.firstName": 1,
          "user.lastName": 1,
          "user.name": 1,
          "user.instagram": 1,
          offer: 1, // <-- includes all fields from the offer document
        },
      },

      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    if (!feedbacks.length) {
      resStatus(res, "false", "No feedback");
      return;
    }

    resStatusData(res, "success", "Users feedback retrieved successfully.", {
      feedbacks,
      totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    console.error("Error fetching admin feedback:", error);
    resStatus(res, "false", "An error occurred while retrieving feedback");
  }
};

// export const adminFeedback = async (req: Request | any, res: Response) => {
//   const adminId = req.user._id;
//   const adminType = req.user.userType;
//   const page = parseInt(req.query.page) || 1;
//   const limit = parseInt(req.query.limit) || 10;
//   const skip = (page - 1) * limit;
//   let matchCondition: any = { feedbackType: "admin" };
//   if (adminType === "business") {
//     const bookings = await BookingModel.find({ restoId: adminId }).select("_id");
//     const bookingIds = bookings.map((b) => b._id);
//     matchCondition.bookingId = { $in: bookingIds };
//   }

//   try {
//     // Count total feedbacks for pagination metadata
//     const totalCount = await influencerRating.countDocuments(matchCondition);

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
//         $project: {
//           _id: 1,
//           status: 1,
//           bookingId: 1,
//           restroFeedback: 1,
//           appFeedback: 1,
//           createdAt: 1,
//           "user.name": 1,
//           'user.firstName': 1,
//           "user.lastName": 1,
//           "user.instagram": 1,
//         },
//       },
//       { $sort: { createdAt: -1 } },
//       { $skip: skip },
//       { $limit: limit },
//     ]);

//     if (!feedbacks.length) {
//       resStatus(res, "false", "No feedback");
//       return;
//     }

//     resStatusData(res, "success", "Users feedback retrieved successfully.", {
//       feedbacks,
//       totalCount,
//       currentPage: page,
//       totalPages: Math.ceil(totalCount / limit),
//     });
//   } catch (error) {
//     console.error("Error fetching admin feedback:", error);
//     resStatus(res, "false", "An error occurred while retrieving feedback");
//   }
// };
export const deleteOfferImage = async (req: Request, res: Response) => {
  try {
    const { offerId, imageUrl } = req.body;
    if (!offerId || !imageUrl) {
      return res
        .status(400)
        .json({
          success: false,
          message: "offerId and imageUrl are required.",
        });
    }
    const offer = await OfferModel.findById(offerId);
    if (!offer) {
      return res
        .status(404)
        .json({ success: false, message: "Offer not found." });
    }
    if (!offer.media.includes(imageUrl)) {
      return res
        .status(400)
        .json({ success: false, message: "Image not found in offer media." });
    }
    offer.media = offer.media.filter((url: string) => url !== imageUrl);
    await offer.save();
    const imageKey = imageUrl.split(`${process.env.AWS_S3_BUCKET_NAME}/`)[1];
    return res
      .status(200)
      .json({ success: true, message: "Image deleted successfully." });
  } catch (error) {
    console.error("Error deleting image:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error." });
  }
};
