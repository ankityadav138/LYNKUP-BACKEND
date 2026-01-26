import bcrypt from "bcrypt";
import { Request, Response, NextFunction } from "express";
import UserModel, { UserData } from "../Models/UserModel";
import { FollowerModel } from "../Models/follower";
import { fetchUserInsights } from "../Controllers/AuthLoginController"; // Adjust path

import axios from "axios";
import { SortOrder } from 'mongoose';
import * as dotenv from "dotenv";
dotenv.config();
import {
  storeOtp,
  storeDetails,
  retrieveOtp,
  retrieveDetails
} from "../Connections/RedisConnection";
import {
  generateOtp,
  generateToken,
  genToken,
  giveStrike,
  isValidEmail,
  sendOtpOnMail,
  sendOtpOnMailMailgun,
  sendProfileVerifiedEmail,
} from "../utils/errorCatch";
import {
  responsestatusmessage,
  resStatus,
  resStatus401,
  resStatusData,
  resStatusDataToken,
  resStatusDataToken201,
} from "../Responses/Response";
import mongoose from "mongoose";
import BookingModel from "../Models/Booking";
import influencerRating from "../Models/influencerRating";
import { createNotification, sendNotification } from "./NotificationController";
import { Types } from "mongoose";
import { Feedback } from "./offerController";
import OfferModel from "../Models/offerModal";
export const adminSignup = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { name, email, password, userType } = req.body;
  const existingUser = await UserModel.findOne({ email });
  if (existingUser) {
    resStatus(
      res,
      "false",
      "Email already exists. Please use a different email."
    );
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await UserModel.create({
      name,
      email:email.toLowerCase(),
      password: hashedPassword,
      userType,
      profileImage: req.file ? ((req.file as any).location || `image/${req.file.filename}`) : undefined,
    });
    const token = genToken(user?.id);
    resStatusData(res, "success", "User registered successfully", user);
  }
};
export const adminLogin = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { email, password } = req.body;
  try {
    console.log("request",req.body);
    const normalizedEmail = email.toLowerCase();
    const adminUser = await UserModel.findOne({ email: normalizedEmail, userType: "admin" });
    if (adminUser) {
      if (adminUser.isDeleted) {
        resStatus401(res, "false", "Admin account is deleted");
        return;
      }
      const isPasswordValid = await bcrypt.compare(password, adminUser.password);
      if (!isPasswordValid) {
        resStatus401(res, "false", "Invalid password");
        return;
      }

      const token = genToken(adminUser.id);
      resStatusDataToken(res, "success", "Admin login successful", adminUser, token);
      return;
    }
    const businessUser = await UserModel.findOne({ email: normalizedEmail, userType: "business" });
    if (businessUser) {
      if (businessUser.isDeleted) {
        resStatus401(res, "false", "Business account is deleted");
        return;
      }
    
      // Check document verification status
      if (!businessUser.documentVerified) {
        resStatusData(res, "pending_verification", "Your business documents are under review. You'll receive an email once approved.", {
          documentVerified: false,
          isVerified: businessUser.isVerified,
        });
        return;
      }

      if (!businessUser.isVerified) {
        const otp = generateOtp();
        await storeOtp(normalizedEmail, otp);
        await sendOtpOnMailMailgun(normalizedEmail, otp);

        resStatus(res, "false", "Business not verified. OTP sent to email.");
        return;
      }

      const isPasswordValid = await bcrypt.compare(password, businessUser.password);
      if (!isPasswordValid) {
        resStatus401(res, "false", "Invalid password");
        return;
      }

      const token = genToken(businessUser.id);
      resStatusDataToken(res, "success", "Business login successful", businessUser, token);
      return;
    }
    resStatus401(res, "false", "No account found with this email for admin or business");
  } catch (error) {
    console.error("Login error:", error);
    next(error);
  }
};

export const businessSignup = async (
  req: Request|any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { firstName, lastName, phone, name, email, address, password, location } =
    req.body;
    
    const files = req.files;
    // ⚠️ When AWS S3 is disabled, file.location won't exist, so allow empty array
    const mediaFiles = files && files.length > 0 ? files.map((file: any) => file.location || file.path || '') : [];
    
    if (!email) {
      responsestatusmessage(res, "false", "Email is required.");
      return;
    }
    
    const normalizedEmail = email.toLowerCase();
  const parsedLocation =
    typeof location === "string" ? JSON.parse(location) : location;
    
  // ⚠️ Set default coordinates if missing or invalid (Delhi, India as default)
  const defaultCoordinates = [77.1025, 28.7041]; // [longitude, latitude] - Delhi
  const coordinates = parsedLocation?.coordinates || [];
  const validCoordinates = [
    parseFloat(coordinates[0]) || defaultCoordinates[0],
    parseFloat(coordinates[1]) || defaultCoordinates[1]
  ];
  
  const otp = generateOtp();
  if (!name || !email || !password) {
    responsestatusmessage(res, "false", "All fields are required.");
  } else {
    if (!isValidEmail(normalizedEmail)) {
      responsestatusmessage(res, "false", "Invalid email format.");
    }
    let existingUser = await UserModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      if (!existingUser.isVerified) {
        // Update OTP in database
        existingUser.otp = otp;
        await existingUser.save();
        
        // Send OTP email
        try {
          await sendOtpOnMailMailgun(email, otp);
          console.log("✅ OTP resent successfully to:", email);
        } catch (emailError) {
          console.error("❌ Failed to resend OTP email:", emailError);
        }
        
        responsestatusmessage(
          res,
          "false",
          "User exists but is not verified. OTP has been resent to your email."
        );
      } else {
        responsestatusmessage(res, "false", "Email is already registered.");
      }
    } else {
      // ⚠️ Allow signup without documents when AWS S3 is disabled
      // if(mediaFiles){
      const hashedPassword = await bcrypt.hash(password, 10);
     
      const userDetails = {
        name,
        email:email,
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        address,
        userType: "business",
        location: {
          type: parsedLocation?.type || "Point",
          coordinates: validCoordinates, // Use validated/default coordinates
          address: parsedLocation?.address || address || "",
        },
        document: mediaFiles.filter(Boolean), // Remove empty values
        otp,
        isVerified: false,
      };
      
      const newUser = await UserModel.create(userDetails);
      console.log("New user created:", newUser);

      // Send OTP email (OTP is already stored in user document)
      try {
        await sendOtpOnMailMailgun(email, otp);
        console.log("✅ OTP email sent successfully to:", email);
      } catch (emailError) {
        console.error("❌ Failed to send OTP email:", emailError);
        // Continue even if email fails - user can request resend
      }

      resStatus(
        res,
        "success",
        "Business user created successfully. OTP has been sent to your email."
      );
    // }
    // else{
    //   resStatus(res,"false","upload document first")
    // }
    }
  }
};
export const uploadDocumentverify = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    // const {businessId} = req.query;
    const {status,businessId} = req.body
    if (!businessId) {
      resStatus(res, "false", "Business Id is required.");
      return;
    }
   else if (!status) {
      resStatus(res, "false", "Business Id is required.");
      return;
    }
    const business  = await UserModel.findOne({ _id:businessId });
    if (business) {
      const updated = await UserModel.findOneAndUpdate(
        {_id: businessId },
        { documentVerified:status },
        { new: true }
      );
      const ss = updated?.documentVerified
      const  ee = updated?.email || ''
      if (ss === true) {
        const fullName = `${business.firstName || ""} ${business.lastName || ""}`.trim();
        await sendProfileVerifiedEmail(ee, fullName);
      }
  
      resStatusData(res, "success", "document verified successfully.", updated);
      return;
    }else{
      resStatus(res,"false","business not found");
    }

  } catch (error) {
    console.error("Error adding document:", error);
    resStatus(res, "false", "Something went wrong.");
  }
};
export const verifyOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { email, otp } = req.body;
  console.log(email, otp)
  if (!email || !otp) {
    resStatus(res, "false", "Email and OTP are required.");
    return;
  }
  const normalizedEmail = email.toLowerCase();
  
  // Get OTP from database (stored in user document)
  const existingUser = await UserModel.findOne({ email: normalizedEmail });
  
  if (!existingUser) {
    resStatus(res, "false", "User not found. Please register first.");
    return;
  }
  
  const storedOtp = existingUser.otp;
  console.log("🔍 Stored OTP:", storedOtp, "| Entered OTP:", otp);
  
  if (!storedOtp) {
    resStatus(res, "false", "OTP not found. Please request a new OTP.");
    return;
  }
  
  if (otp.toString().trim() === storedOtp.toString().trim()) {
    // User already fetched above, no need to fetch again
    if (existingUser.isVerified) {
      resStatus(res, "false", "User already verified.");
      return;
    }
    
    const updatedUser = await UserModel.findOneAndUpdate(
      { email:normalizedEmail },
      { isVerified: true, otp: null },
      { new: true }
    );
    const Id = updatedUser?._id as Types.ObjectId;
    const token = genToken(Id);
    
    resStatusDataToken(
      res,
      "success",
      "OTP verified successfully. You can now login.",
      updatedUser,
      token
    );
  } else {
    resStatus(res, "false", "Wrong OTP. Please try again.");
  }
};
export const forgotPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { email } = req.body;
  if (!email) {
    resStatus(res, "false", "Email is required.");
    return;
  }
  const Email = email.toLowerCase();
  const user = await UserModel.findOne({email:Email});
  if (!user) {
    resStatus(res, "false", "User not found.");
    return;
  }
  const otp = generateOtp();
  await storeOtp(Email, otp);
  await sendOtpOnMailMailgun(email, otp);
  resStatus(res, "success", "OTP sent to your email.");
};
export const resetPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    resStatus(res, "false", "Email, OTP, and new password are required.");
    return;
  }
  const normalizedEmail = email.toLowerCase();
  const user = await UserModel.findOne({ email :normalizedEmail,userType:'business'});
  if (!user) {
    resStatus(res, "false", "User not found.");
    return;
  }
  const storedOtp = await retrieveOtp(normalizedEmail);
  if (otp !== storedOtp) {
    resStatus(res, "false", "Invalid or expired OTP.");
    return;
  }
  const hashedPassword = await bcrypt.hash(newPassword, 10);
   await UserModel.findOneAndUpdate(
    { email: email.toLowerCase(), userType: "business" },
    { $set: { password: hashedPassword, passwordChangedAt: new Date(), } },
    { new: true }
  );
  resStatus(res, "success", "Password reset successfully.");
};
export const changePassword = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  const userId = req.user?._id;
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    resStatus(res, "false", "Current and new password are required.");
  }else{
  const user = await UserModel.findById(userId);
  if (!user) {
    resStatus(res, "false", "User not found.");
  }else{
  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    resStatus(res, "false", "Current password is incorrect.");
  }else{
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  const updatedUser = await UserModel.findByIdAndUpdate(
    userId,
    { $set: { password: hashedPassword, passwordChangedAt: new Date(), } },
    { new: true }
  );
  if (!updatedUser) {
    resStatus(res, "false", "Failed to update password.");
    
  }else{
  resStatus(res, "success", "Password changed successfully.");
  }}
  }}
};

export const profileVerified = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { userId, profile_status } = req.body;
  if (!userId) {
    resStatus(res, "false", "User ID is required.");
  } else {
    const existingUser = await UserModel.findById(userId);
    if (!existingUser) {
      resStatus(res, "false", "User not found.");
    } else {
      const updatedStatus = await UserModel.findByIdAndUpdate(
        userId,
        {
          profile_status: profile_status,
        },
        { new: true }
      );
      if (!updatedStatus) {
        resStatus(res, "false", " ProfileStatus is not Updated");
      } else {
        resStatusData(
          res,
          "success",
          "ProfileStatus updated successfully.",
          updatedStatus
        );
      }
    }
  }
};
export const listOfBusinessUser = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { page, limit } = req.query;
  const query = { userType: "business", isDeleted: false, documentVerified: true };
  // const sort = { createdAt: -1 };
  const sort: { [key: string]: SortOrder } = { createdAt: -1 };


  try {
    let users, totalCount;

    if (page && limit) {
      const pageNumber = parseInt(page as string, 10) || 1;
      const pageSize = parseInt(limit as string, 10) || 10;
      const skip = (pageNumber - 1) * pageSize;

      [users, totalCount] = await Promise.all([
        UserModel.find(query).sort(sort).skip(skip).limit(pageSize),
        UserModel.countDocuments(query),
      ]);

      resStatusData(res, "success", "Business users fetched successfully", {
        users,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        currentPage: pageNumber,
      });
    } else {
      users = await UserModel.find(query).sort(sort);
      totalCount = users.length;

      resStatusData(res, "success", "All business users fetched successfully", {
        users,
        totalCount,
      });
    }
  } catch (error) {
    console.error("Error fetching business users:", error);
    resStatus(res, "false", "An error occurred while fetching business users");
  }
};
export const listOfAllBusinessUser = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { page = 1, limit = 10 } = req.query;
  const pageNumber = parseInt(page as string, 10) || 1;
  const pageSize = parseInt(limit as string, 10) || 10;
  const skip = (pageNumber - 1) * pageSize;
  const query = { userType: "business", isDeleted: false, documentVerified:false };
  const sort = { createdAt: -1 };
  try {
    const [users, totalCount] = await Promise.all([
      UserModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(pageSize),
      UserModel.countDocuments(query),
    ]);
    if (users && totalCount !== undefined) {
      resStatusData(res, "success", "Business users fetched successfully", {
        users,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        currentPage: pageNumber,
      });
    } else {
      resStatus(
        res,
        "false",
        "An error occurred while fetching business users"
      );
    }
  } catch (error) {
    resStatus(res, "false", "An error occurred while fetching business users");
  }
};
export const getUserByToken = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<any> => {
  const userId = req.user._id;
  const user = await UserModel.findOne({ _id: userId, isDeleted: false }).select("-password -__v");

  if (!user) return resStatus(res, "false", "User not found.");

  let tokenInDB = user.accessToken;
  const lastRefresh = user.lastTokenRefresh;

  if (!tokenInDB) return resStatus(res, "false", "No access token found.");

  const now = new Date();
  let longLivedToken = tokenInDB;
  let finalToken = tokenInDB;

  console.log("finalToken", finalToken);

  try {
    try {
      const exchange: any = await axios.get("https://graph.instagram.com/access_token", {
        params: {
          
          grant_type: "ig_exchange_token",
          client_secret: process.env.FACEBOOK_APP_SECRET || "76a8b193787892f6bf2459abeb935d7b",
          // client_secret:"0f31af4a8102b8bbae2e0e4d8f784d1b",
          access_token: tokenInDB,
        },
      });

      longLivedToken = exchange.data.access_token;
      finalToken = longLivedToken;

      await UserModel.findByIdAndUpdate(userId, {
        accessToken: longLivedToken,
        lastTokenRefresh: now,
      });

      console.log("Converted short-lived token to long-lived.");
    } catch (exchangeError: any) {
      console.log("Token might already be long-lived:", exchangeError.response?.data?.error?.message || exchangeError.message);
    }

    try {
      const refresh: any = await axios.get("https://graph.instagram.com/refresh_access_token", {
        params: {
          grant_type: "ig_refresh_token",
          access_token: longLivedToken,
        },
      });

      finalToken = refresh.data.access_token;

      await UserModel.findByIdAndUpdate(userId, {
        accessToken: finalToken,
        lastTokenRefresh: now,
      });

      console.log("Refreshed long-lived token.");
    } catch (refreshErr: any) {
      console.log("Token refresh skipped or failed:", refreshErr.response?.data?.error?.message || refreshErr.message);
    }
    const profileRes: any = await axios.get("https://graph.instagram.com/me", {
      params: {
        fields: "id,username,followers_count,media_count",
        access_token: finalToken,
      },
    });

    const userProfile = profileRes.data;

    const insights: any = await fetchUserInsights(userProfile.id, finalToken, res);
    const insightsData = (insights as { data?: any[] })?.data || [];

    const sum = (key: string) =>
      insightsData.find((m: any) => m.name === key)?.total_value?.value || 0;

    const reach = sum("reach");
    const accountsEngaged = sum("accounts_engaged");
    const views = sum("views");
    const profileViews = sum("profile_views");
    const contentViews = sum("content_views");

    const engagementRate = reach > 0 ? parseFloat((accountsEngaged / reach).toFixed(2)) : 0;

    const insightsUpdate = {
      reach,
      accounts_engaged: accountsEngaged,
      views,
      profile_views: profileViews,
      content_views: contentViews,
      engagementRate,
    };
    const followersCount = userProfile.followers_count || 0;
    // Safely calculate to avoid NaN from division by zero
    const followersWhoEngaged = reach > 0 ? Math.round((accountsEngaged * followersCount) / reach) : 0;
    const nonFollowersWhoEngaged = Math.max(accountsEngaged - followersWhoEngaged, 0);
    const nonFollowers = reach > 0 ? Math.max(Math.round(reach - followersCount), 0) : 0;
    console.log(userProfile, nonFollowers,reach,insightsUpdate);
    await UserModel.findByIdAndUpdate(userId, {
      insights: insightsUpdate,
      businessDiscovery: {
        followers_count: followersCount,
        media_count: userProfile.media_count || 0,
        nonfollowers: nonFollowers || 0,
        followersWhoEngaged,
        nonFollowersWhoEngaged,
      },
    });

    const updatedUser = await UserModel.findById(userId).select("-password -__v");
    if ((updatedUser?.strikeCount ?? 0) >= 3 && !updatedUser?.blocked) {
      const blocked = await UserModel.findByIdAndUpdate(
        userId,
        { blocked: true },
        { new: true }
      ).select("-password -__v");
      return resStatusData(res, "false", "User is blocked.", blocked);
    }
    return resStatusData(res, "success", "User retrieved successfully.", updatedUser);
  } catch (err: any) {
    console.error("Instagram token error:", err.response?.data || err.message);
    return resStatus(res, "false", "Failed to update Instagram token.");
  }
};





// export const getUserByToken = async (
//   req: Request | any,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   const userId = req.user._id;
//   const user = await UserModel.findOne({ _id: userId, isDeleted: false }).select(
//     "-password -__v"
//   );
//   if (!user) {
//     resStatus(res, "false", "User not found.");
//     return;
//   }
//   const instagramToken = user?.accessToken;
//   const lastRefresh = user?.lastTokenRefresh;
//   if (!instagramToken) {
//     resStatus(res, "false", "No access token found.");
//     return;
//   }
//   // Check if 3 days have passed
//   const now = new Date();
//   const nextAllowedRefresh = new Date(lastRefresh || 0);
//   nextAllowedRefresh.setDate(nextAllowedRefresh.getDate() + 30);
//   const shouldRefresh = now >= nextAllowedRefresh;
//   try {
//     let finalToken = instagramToken;
//     if (shouldRefresh) {
//       const exchangeResponse = await axios.get<{ access_token: string }>(
//         `https://graph.instagram.com/access_token`,
//         {
//           params: {
//             grant_type: "ig_exchange_token",
//             client_secret: "76a8b193787892f6bf2459abeb935d7b",
//             access_token: instagramToken,
//           },
//         }
//       );
//       const longLivedToken = exchangeResponse.data.access_token;
//       const refreshResponse = await axios.get<{ access_token: string }>(
//         `https://graph.instagram.com/refresh_access_token`,
//         {
//           params: {
//             grant_type: "ig_refresh_token",
//             access_token: longLivedToken,
//           },
//         }
//       );

//       const refreshedToken = refreshResponse.data.access_token;
//       finalToken = refreshedToken;

//       await UserModel.findByIdAndUpdate(userId, {
//         accessToken: refreshedToken,
//         lastTokenRefresh: now,
//       });

//       console.log("Refreshed long-lived token:", refreshedToken);
//     } else {
//       console.log("Token refresh skipped — not due yet.");
//     }
//     // if (instagramToken) {
//       const FACEBOOK_BASE_URL = process.env.FACEBOOK_BASE_URL;
//       try {
//         const response = await axios.get(`${FACEBOOK_BASE_URL}/auth/instagram`, {
//           params: {
//             access_token: finalToken,
//           },
//         });
//       } catch (error: any) {
//         if (error && error.response) {
//           console.error("Error calling Facebook API:", error.response.data);
//         } else {
//           console.error("Unexpected error:", error.message || error);
//         }
//       }
//       // }
//     const updatedUser = await UserModel.findById(userId).select("-password -__v");

//     // Block user if necessary
//     const strike = updatedUser?.strikeCount ?? 0;
//     if (strike >= 3 && !updatedUser?.blocked) {
//       const blockedUser = await UserModel.findByIdAndUpdate(
//         userId,
//         { blocked: true },
//         { new: true }
//       ).select("-password -__v");

//       resStatusData(res, "false", "User is blocked.", blockedUser);
//     } else {
//       resStatusData(res, "success", "User retrieved successfully.", updatedUser);
//     }
//   } catch (error: any) {
//     console.error("Instagram token error:", error?.response?.data || error.message);
//     resStatus(res, "false", "Failed to update Instagram token.");
//   }
// };
export const getUserByTokenPanel = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = req.user._id;
  let user = await UserModel.findOne({ _id: userId, isDeleted: false }).select(
    "-password -__v"
  );
  if (!user) {
    resStatus(res, "false", "User not found.");
    return;
  }
  else{
 
  const strike = user.strikeCount ?? 0;
  if (strike >= 3 && !user.blocked) {
   const User = await UserModel.findByIdAndUpdate(
      userId,
      { blocked: true },
      { new: true }
    ).select("-password -__v");
    resStatusData(res, "false", "User is blocked.", User);
  } else {
    resStatusData(res, "success", "User retrieved successfully.", user);
  }}
};
export const restroGrade = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { offerId, restro_type } = req.body;
  if (!offerId || !restro_type) {
    resStatus(res, "false", "Offer ID and RestroType is required.");
  } else {
    const existingRestro = await UserModel.findById(offerId);
    if (!existingRestro) {
      resStatus(res, "false", "restaurant not found.");
    } else {
      const updatedRestro = await UserModel.findByIdAndUpdate(
        offerId,
        {
          restro_type: restro_type,
        },
        { new: true }
      );
      if (!updatedRestro) {
        resStatus(res, "false", "falseed to update booking.");
      } else {
        resStatusData(
          res,
          "success",
          "update booking successfully.",
          updatedRestro
        );
      }
    }
  }
};
export const adminLogout = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {};
export const getAlluser = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const sort: { [key: string]: SortOrder } = { createdAt: -1 };

  const search = req.query.search || "";
  const searchRegex = new RegExp(search, "i"); // case-insensitive

  const query: any = {
    userType: "user",
    isDeleted: false,
  };
  if (search) {
    query.$or = [
      { firstName: { $regex: searchRegex } },
      { lastName: { $regex: searchRegex } },
    ];
  }

  try {
    const [users, total] = await Promise.all([
      UserModel.find(query).skip(skip).limit(limit).sort(sort).lean(),
      UserModel.countDocuments(query),
    ]);

    if (users.length > 0) {
      res.status(200).json({
        status: "success",
        message: "User details",
        data: users,
        pagination: {
          totalItems: total,
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          pageSize: limit,
        },
      });
    } else {
      return next(new Error("No users found"));
    }
  } catch (err) {
    return next(err);
  }
};



export const getAllFollower = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const follower = await FollowerModel.find();
  if (follower) {
    resStatusData(res, "success", "user Details", follower);
  } else {
    resStatus(res, "false", "not users found");
  }
};
export const addStaticFollower = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      resStatus(res, "false", "User ID is required.");
      return;
    }
    const { staticFollowers } = req.body;
    if (staticFollowers === undefined) {
      resStatus(res, "false", "staticFollowers are required.");
      return;
    }

    // Check if the user already has a static follower entry
    const existingFollower = await FollowerModel.findOne({ userId });

    if (existingFollower) {
      // Update existing follower count
      const updated = await FollowerModel.findOneAndUpdate(
        { userId },
        { staticFollowers },
        { new: true }
      );

      resStatusData(res, "success", "Followers updated successfully.", updated);
      return;
    }

    // Create a new static follower entry
    const newFollower = new FollowerModel({
      userId,
      staticFollowers,
    });

    await newFollower.save();

    resStatusData(
      res,
      "success",
      `${staticFollowers} followers added successfully.`,
      newFollower
    );
  } catch (error) {
    console.error("Error adding static follower:", error);
    resStatus(res, "false", "Something went wrong.");
  }
};
export const updateStaticFollower = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  const { id, staticFollowers } = req.query;
  if (!id) {
    resStatus(res, "false", " ID is required.");
  } else {
    const updated = await FollowerModel.findByIdAndUpdate(
      id,
      {
        staticFollowers: staticFollowers,
      },
      { new: true }
    );
    if (!updated) {
      resStatus(res, "false", "follower not found.");
    }
    resStatusData(res, "success", "follower retrieved", updated);
  }
};
export const getUserByID = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // const userId = req.user._id; 
    const Id = req.query.userId; 
    if (!mongoose.Types.ObjectId.isValid(Id)) {
      resStatus(res, "false", "Invalid user ID format.");
      return;
    }
    let user = await UserModel.findById(Id).select("-password -__v");
    if (!user) {
      resStatus(res, "false", "User not found.");
      return;
    }
    const strike = user.strikeCount ?? 0;
    if (strike >= 3 && !user.blocked) {
     const User = await UserModel.findByIdAndUpdate(
        Id, 
        { blocked: true },
        { new: true }
      ).select("-password -__v");

      resStatusData(res, "false", "User is blocked.", User);
      return;
    }
    resStatusData(res, "success", "User retrieved successfully.", user);
    return;
  } catch (error) {
    next(error); 
  }
};
export const deleteBusiness = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  const { businessId } = req.query;
  if (!businessId) {
    resStatus(res, "false", "business ID is required.");
  } else {
    const updatedUser = await UserModel.findByIdAndUpdate(
      businessId,
      {
        isDeleted: true,
      },
      { new: true }
    );
    if (!updatedUser) {
      resStatus(res, "false", "business not found.");
    }
    resStatus(res, "success", "business deleted successfully");
  }
};
export const contentFeedback = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  const { content_feedback, content_status, bookingId } = req.body;
  if (!bookingId) {
    resStatus(res, "false", "Booking ID is required.");
  } else {
    const updatedFeedback = await BookingModel.findOneAndUpdate(
      { _id: bookingId },
      { content_feedback, content_status },
      { new: true }
    );
    if (!updatedFeedback) {
      resStatus(res, "false", "Feedback not found.");
      return;
    }
    resStatusData(
      res,
      "success",
      "Feedback updated successfully",
      updatedFeedback
    );
  }
};
export const giveStrikeUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { userId, strikeCount } = req.body;
    const MAX_STRIKES = 3;
    if (!userId) {
      resStatus(res, "false", "User ID is required.");
      return;
    }
    const user = await UserModel.findById(userId);
    if (!user) {
      resStatus(res, "false", "User not found.");
      return;
    }
    user.strikeCount = strikeCount;
    // if (strikeCount >= MAX_STRIKES) {
    //   user.blocked = true;
    // }
    if (strikeCount >= MAX_STRIKES) {
      user.blocked = true;
    } else {
      user.blocked = false;
    }
    await user.save(); 

    let playerIDs: string[] = user?.playerId || ["a91b270e-e75c-4e05-b31c-24ff470f7781"];

    for (const playerID of playerIDs) {
      const notificationTitle = "Strike Alert!";
      const notificationMessage = user.blocked
        ? "You have been blocked due to multiple strikes."
        : `You have received a strike. Total strikes: ${user.strikeCount}`;
      const notificationImage = "";
      const notificationType = "user";

      await sendNotification(
        playerID,
        notificationTitle,
        notificationMessage,
        notificationImage,
        notificationType
      );
    }

    resStatusData(
      res,
      "success",
      user.blocked
        ? "User has been blocked due to excessive strikes."
        : `User has received a strike. Total strikes: ${user.strikeCount}`,
      { userId, strikeCount: user.strikeCount, blocked: user.blocked }
    );
  } catch (error) {
    console.error("Error giving strike:", error);
    resStatus(res, "false", "Something went wrong.");
  }
};

export const userFeedbackByAdmin = async (req: Request, res: Response): Promise<void> => {
  const { userFeedback, influencerId, bookingId, restaurantId } = req.body;

  if (!influencerId) {
    resStatus(res, "false", "Influencer ID is required.");
    return 
  }

  try {
    const user = await UserModel.findById(influencerId);
    if (!user) {
      resStatus(res, "false", "User not found.");
      return
    }

    const booking = await BookingModel.findById(bookingId);
    if (!booking) {
      resStatus(res, "false", "Booking not found.");
      return 
    }

    const offer = await OfferModel.findById(booking.offerId);
    const offerName = offer?.name || "an offer";

    // Check for existing feedback
    const existingFeedback = await influencerRating.findOne({
      influencerId,
      bookingId,
      restaurantId,
      userFeedback: { $exists: true, $ne: "" },
    });

    let feedbackRecord;

    if (existingFeedback) {
      existingFeedback.userFeedback = userFeedback;
      await existingFeedback.save();
      feedbackRecord = existingFeedback;
    } else {
      const newFeedback = new influencerRating({
        influencerId,
        bookingId,
        restaurantId,
        userFeedback,
        feedbackType: "user",
      });
      await newFeedback.save();
      feedbackRecord = newFeedback;
    }

    const playerIDs: string[] = user?.playerId || ["a91b270e-e75c-4e05-b31c-24ff470f7781"];
    const title = "Content Feedback";
    const imageUrl = "image/download.png";
    const formattedOfferName = offerName?.toUpperCase() || "OFFER";
    const notificationMessage = `Feedback for ${formattedOfferName}: ${feedbackRecord.userFeedback || "feedback"}`;


    for (const playerID of playerIDs) {
      await sendNotification(playerID, title, notificationMessage, imageUrl, "user");
    }

    await createNotification(
      new mongoose.Types.ObjectId(user.id),
      new mongoose.Types.ObjectId(bookingId),
      title,
      notificationMessage,
      imageUrl,
      "user"
    );

    resStatusData(res, "success", "Feedback saved and notification sent.", feedbackRecord);
    return 
  } catch (err: any) {
    console.error(err);
    resStatus(res, "false", `Server error: ${err.message}`);
    return 
  }
};


export const editBusiness = async (req: Request, res: Response): Promise<void> => {
  const { firstName, lastName, phone, name, email, address, location } = req.body;
  const { userId } = req.query; 
  console.log(req.body)
  const parsedLocation = typeof location === "string" ? JSON.parse(location) : location;
  if (!userId) {
    responsestatusmessage(res, "false", "User ID is required.");
    return;
  }else{
  const businessUser = await UserModel.findById(userId);
  if (!businessUser) {
    responsestatusmessage(res, "false", "Business user not found.");
    return;
  }
  else{
  const updatedBusinessUser = await UserModel.findByIdAndUpdate(
    userId,
    {
      firstName: firstName || businessUser.firstName,
      lastName: lastName || businessUser.lastName,
      name: name || businessUser.name,
      email: email.toLowerCase() || businessUser.email,
      phone: phone || businessUser.phone, 
      address: address || businessUser.address,
      location: parsedLocation
        ? {
            type: parsedLocation.type,
            coordinates: parsedLocation.coordinates,
            address: parsedLocation.address,
          }
        : businessUser.location,
    },
    { new: true } 
  );
   console.log(updatedBusinessUser)
   if(updatedBusinessUser){
     resStatusData(res, "success", "Business details updated successfully.", updatedBusinessUser);

   }else{
    resStatus(res,"false","user not updated")
   }
  }}
};
export const getUserForAdmin = async (req: Request |any, res: Response,next: NextFunction): Promise<void> => {
  try {
    const Id = req.query.userId; 
    if (!mongoose.Types.ObjectId.isValid(Id)) {
      resStatus(res, "false", "Invalid user ID format.");
      return;
    }
    let user = await UserModel.findById(Id).select("-password -__v");
    if (!user) {
      resStatus(res, "false", "User not found.");
      return;
    }
    resStatusData(res, "success", "User retrieved successfully.", user);
    return;
  } catch (error) {
    next(error); 
  }
}
export const permanentlyDeletebusiness = async (req: Request |any, res: Response): Promise<void> => {
  try {
    const {userId} = req.body;
    if (!userId) {
      resStatus(res, "false", "User ID is required");
      return;
    }
    const user = await UserModel.findById(userId);
    if (!user) {
      resStatus(res, "false", "User not found");
      return;
    }
    await OfferModel.updateMany(
      { userId },
      { $set: { isdeleted: true } } 
    );
    await UserModel.findByIdAndUpdate(userId, {
      $set: { isDeleted: true }
    });
    resStatus(res, "success", "User and their offers  deleted ");
  } catch (error) {
    console.error("Error deleting user:", error);
    resStatus(res, "false", "An error occurred while deleting the user");
  }
};

