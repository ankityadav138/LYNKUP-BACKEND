import bcrypt from "bcrypt";
import { NextFunction, Request, Response } from "express";
import axios from "axios";
import UserModel from "../Models/UserModel";
import {
  responsestatusmessage,
  resStatus,
  resStatus401,
  resStatusData,
  resStatusDataToken,
  resStatusDataToken201,
} from "../Responses/Response";
import { genToken } from "../utils/errorCatch";
import path from "path";
import { createNotification, sendNotification } from "./NotificationController";
import mongoose from "mongoose";
import { FollowerModel } from "../Models/follower";
import qs from "qs";
import BookingModel from "../Models/Booking";

export const InstagramMobileLogin = async (
  req: Request,
  res: Response
): Promise<Response |void> => {
  // const { access_token = "", user_id = "" } = req.query;
  const access_token = req.query.access_token as string | undefined;
  console.log(access_token, "access_token received from Instagram");
  if (!access_token) {
    res
      .status(400)
      .json({
        success: false,
        message: "Missing required parameters (access_token).",
      });
  }
else{
  const hasPermission = await checkInsightsPermission(access_token);
  if (!hasPermission) {
    resStatus(res, "false", "Access token does not have insights permission.");
    return;
  }
  try {
    // Exchange the code for an access token
    // const tokenResponse:any = await axios.post(
    //   'https://api.instagram.com/oauth/access_token',
    //   qs.stringify({
    //     client_id: '1015452860015692',
    //     client_secret: '76a8b193787892f6bf2459abeb935d7b',
    //     grant_type: 'authorization_code',
    //     redirect_uri: 'https://socialmeapi.testenvapp.com/auth/instagram/callback',
    //     code: code,
    //   }),
    //   { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    // );

    // console.log("Token response:", tokenResponse.data);

    // const access_token = access_token;
    // const user_id = user_id;
    // Fetch user profile information
    const userProfileResponse: any = await axios.get(
      "https://graph.instagram.com/me",
      {
        params: {
          fields: "id,username,account_type,profile_picture_url,media_count,follows_count,followers_count",
          access_token,
        },
      }
    );
    const userProfile = userProfileResponse.data;
    if(!userProfile){
     resStatus(res,'false',"user not having instagram ")
    }else{
     userProfile.instagramlink = `https://www.instagram.com/${userProfile.username}`;
     userProfile.username = userProfile.username;
     const targetUsername = userProfile.username;
    
    const userInsights = await fetchUserInsights(userProfile.id, access_token,res);
    const insightsData = (userInsights as { data?: any[] })?.data || [];

        if (!userInsights) {
         return res.status(403).json({
           success: false,
           message: "You do not have permission to access insights data. Please ensure your account is a business or creator account with required permissions.",
         });
        }
     // Function to sum last 30 days' values for each metric
     const sumMetric = (metricName: string): number => {
       return insightsData.find((m) => m.name === metricName)?.total_value?.value || 0;
     };
    //  function formatNumber(x: number): string {
    //   return x.toLocaleString('en-US'); 
    // }
    
     let reach = sumMetric("reach");
     let accountsEngaged = sumMetric("accounts_engaged");
     let views = sumMetric("views");
     let profileViews = sumMetric("profile_views");
     let contentViews = sumMetric("content_views");
    let engagementRate = reach > 0 ? (accountsEngaged / reach) : 0;
    engagementRate = parseFloat(engagementRate.toFixed(2));
    
   let instagramInsights = {
       reach,
       accounts_engaged: accountsEngaged,
       views,
       profile_views: profileViews,
       content_views: contentViews,
       engagementRate,
     };
     const allFollowers = await FollowerModel.find({});
     const staticFollowers = allFollowers.map((f) => f.staticFollowers || 0);
 
     const followersCount = userProfile?.followers_count || 0;
     const minRequiredFollowers = Math.max(...staticFollowers, 0);
     const followersWhoEngaged =  Math.round(((instagramInsights?.accounts_engaged ||0) * followersCount) / (instagramInsights?.reach ||0));
     const nonFollowersWhoEngaged = Math.max((instagramInsights?.accounts_engaged ||0)- followersWhoEngaged, 0);
 
     let nonFollowers = Math.max(((instagramInsights?.reach || 0) - (followersCount || 0)/100), 0);
     // Check if the user's followers meet the minimum required followers
if (followersCount < minRequiredFollowers) {
  const remainingFollowers = minRequiredFollowers - followersCount;
  res.status(403).json({
    success: false,
    message: `You need ${remainingFollowers} more followers to log in.`,
    required_followers: minRequiredFollowers,
    current_followers: followersCount,
    remaining_followers: remainingFollowers,
  });
  return;
}

    let user = await UserModel.findOne({ instagramId: userProfile.id });
    if (user) {
      if (user.blocked || user.isDeleted) {
        return res.status(403).json({
          success: false,
          message: "Your account has been blocked or deleted. Please contact support.",
        });
      }else{
      user.instagram = userProfile;
      // user.email = `no-email-${userProfile.id}@instagram.com`;
      user.profileImage = userProfile.profile_picture_url;
      user.accessToken = access_token;
      user.profile_status= "verified";
      user.userType = "user";
      user.insights = instagramInsights;
      user.businessDiscovery={
       followers_count :userProfile?.followers_count|0,
       media_count : userProfile?.media_count|0,
       nonfollowers:nonFollowers|0,
        followersWhoEngaged:followersWhoEngaged|0,
        nonFollowersWhoEngaged:nonFollowersWhoEngaged|0,
      } 
      await user.save();
      }
    } 
    else {
      user = await UserModel.create({
        email:`no-email-${userProfile.id}@instagram.com`,
        instagramId: userProfile.id,
        profile_status :"verified",
       instagram: userProfile,
        profileImage: userProfile.profile_picture_url,
        accessToken: access_token,
        userType : "user",
        insights: instagramInsights,
        businessDiscovery:{
          followers_count :userProfile?.followers_count,
          media_count : userProfile?.media_count,
          nonfollowers:nonFollowers|0,
        followersWhoEngaged:followersWhoEngaged|0,
        nonFollowersWhoEngaged:nonFollowersWhoEngaged|0,
                } 
      });
    }
    // await user.save();
    const token = genToken(user.id);
    resStatusDataToken(
      res,
      "success",
      "Instagram login successful",
      user,
      token
    );
    }
  } catch (error: any) {
    console.error(
      "Instagram Login Error:",
      error.response ? error.response.data : error.message
    );
    if (error.response && error.response.status === 400) {
      res
        .status(400)
        .json({
          success: false,
          message: "Invalid code or authorization failure",
          error: error.response.data,
        });
    } else {
      res
        .status(500)
        .json({
          success: false,
          message: "Instagram login failed",
          error: error.message,
        });
    }
  }
}
};
//  export const InstagramMobileLogin = async (req: Request, res: Response): Promise<Response | void> => {
//   const shortLivedToken = req.query.access_token as string | undefined;
//   console.log(shortLivedToken, "access_token received from Instagram");

//   if (!shortLivedToken) {
//     return res.status(400).json({
//       success: false,
//       message: "Missing required parameters (access_token).",
//     });
//   }

//   // Exchange short-lived token for long-lived token
//   const exchangeForLongLivedToken = async (token: string): Promise<string | null> => {
//     try {
//       const response: any = await axios.get('https://graph.instagram.com/access_token', {
//         params: {
//           grant_type: 'ig_exchange_token',
//           client_secret: process.env.FACEBOOK_APP_SECRET,
//           access_token: token,
//         },
//       });
//       return response.data.access_token;
//     } catch (error: any) {
//       console.error("Token exchange failed:", error.response?.data || error.message);
//       return null;
//     }
//   };

//   const longLivedToken = await exchangeForLongLivedToken(shortLivedToken);
//   if (!longLivedToken) {
//     return res.status(500).json({ success: false, message: "Failed to upgrade to long-lived token" });
//   }

//   const hasPermission = await checkInsightsPermission(longLivedToken);
//   if (!hasPermission) {
//     return resStatus(res, "false", "Access token does not have insights permission.");
//   }

//   try {
//     const userProfileResponse: any = await axios.get("https://graph.instagram.com/me", {
//       params: {
//         fields: "id,username,account_type,profile_picture_url,media_count,follows_count,followers_count",
//         access_token: longLivedToken,
//       },
//     });

//     const userProfile: any = userProfileResponse.data;
//     if (!userProfile) {
//       return resStatus(res, 'false', "User not found on Instagram");
//     }

//     userProfile.instagramlink = `https://www.instagram.com/${userProfile.username}`;

//     const insightResp: any = await fetchUserInsights(userProfile.id, longLivedToken, res);
//     const insightsData: any[] = insightResp?.data || [];

//     const sumMetric = (metricName: string): number => {
//       return insightsData.find((m: any) => m.name === metricName)?.total_value?.value || 0;
//     };

//     let reach = sumMetric("reach");
//     let accountsEngaged = sumMetric("accounts_engaged");
//     let views = sumMetric("views");
//     let profileViews = sumMetric("profile_views");
//     let contentViews = sumMetric("content_views");
//     let engagementRate = reach > 0 ? parseFloat((accountsEngaged / reach).toFixed(2)) : 0;

//     const instagramInsights = {
//       reach,
//       accounts_engaged: accountsEngaged,
//       views,
//       profile_views: profileViews,
//       content_views: contentViews,
//       engagementRate,
//     };

//     const allFollowers = await FollowerModel.find({});
//     const staticFollowers = allFollowers.map((f: any) => f.staticFollowers || 0);
//     const followersCount = userProfile.followers_count || 0;
//     const minRequiredFollowers = Math.max(...staticFollowers, 0);
//     const followersWhoEngaged = Math.round(((instagramInsights.accounts_engaged || 0) * followersCount) / (instagramInsights.reach || 1));
//     const nonFollowersWhoEngaged = Math.max(instagramInsights.accounts_engaged - followersWhoEngaged, 0);
//     const nonFollowers = Math.max(((instagramInsights.reach || 0) - (followersCount || 0) / 100), 0);

//     if (followersCount < minRequiredFollowers) {
//       const remainingFollowers = minRequiredFollowers - followersCount;
//       return res.status(403).json({
//         success: false,
//         message: `You need ${remainingFollowers} more followers to log in.`,
//         required_followers: minRequiredFollowers,
//         current_followers: followersCount,
//         remaining_followers: remainingFollowers,
//       });
//     }

//     let user = await UserModel.findOne({ instagramId: userProfile.id });

//     if (user) {
//       if (user.blocked || user.isDeleted) {
//         return res.status(403).json({
//           success: false,
//           message: "Your account has been blocked or deleted. Please contact support.",
//         });
//       } else {
//         user.instagram = userProfile;
//         user.profileImage = userProfile.profile_picture_url;
//         user.accessToken = longLivedToken;
//         user.profile_status = "verified";
//         user.userType = "user";
//         user.insights = instagramInsights;
//         user.businessDiscovery = {
//           followers_count: userProfile.followers_count,
//           media_count: userProfile.media_count,
//           nonfollowers: nonFollowers,
//           followersWhoEngaged,
//           nonFollowersWhoEngaged,
//         };
//         await user.save();
//       }
//     } else {
//       user = await UserModel.create({
//         email: `no-email-${userProfile.id}@instagram.com`,
//         instagramId: userProfile.id,
//         profile_status: "verified",
//         instagram: userProfile,
//         profileImage: userProfile.profile_picture_url,
//         accessToken: longLivedToken,
//         userType: "user",
//         insights: instagramInsights,
//         businessDiscovery: {
//           followers_count: userProfile.followers_count,
//           media_count: userProfile.media_count,
//           nonfollowers: nonFollowers,
//           followersWhoEngaged,
//           nonFollowersWhoEngaged,
//         },
//       });
//     }

//     const token = genToken(user.id);
//     return resStatusDataToken(res, "success", "Instagram login successful", user, token);
//   } catch (error: any) {
//     console.error("Instagram Login Error:", error.response?.data || error.message);
//     return res.status(500).json({
//       success: false,
//       message: "Instagram login failed",
//       error: error.message,
//     });
//   }
// };



export const fetchUserInsights = async (
  user_id: string,
  access_token: string,
  res: Response
) => {
  try {
    const response = await axios.get(
      `https://graph.instagram.com/${user_id}/insights`,
      {
        params: {
          metric: "reach,views,follower_count,accounts_engaged,follows_and_unfollows",
          period: "day",
          metric_type: "total_value",
          since: Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60,
          until: Math.floor(Date.now() / 1000),
          access_token,
        },
      }
    );

    return response.data;
  } catch (error: any) {
    console.error("Error fetching user insights:", error.response?.data || error.message);
    if (
      error.response?.status === 400 
            //   && error.response?.data?.error?.message?.includes("permissions")
    ) {
      resStatus(res, "false", "You have no insights permission");
    } else {
      resStatus(res, "false", "Failed to fetch user insights");
    }
    return null;
  }
};
const checkInsightsPermission = async (access_token: string): Promise<boolean> => {
  try {
    await axios.get("https://graph.instagram.com/me/insights", {
      params: {
        metric: "reach",
        period: "day",
        access_token,
      },
    });
    return true;
  } catch (error: any) {
    const msg = error?.response?.data?.error?.message || error.message;
    console.error("Permission Check Error:", msg);
    return false;
  }
};
export const userLogin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  console.log("USER IS LOGGING IN",req)
  const { email, password } = req.body;
  const user = await UserModel.findOne({ email });
  if (!user || user.userType !== "user") {
    resStatus(res, "false", "Invalid Credientials");
  } else {
    console.log(user);
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      resStatus(res, "false", "Invalid Password");
    } else {
      const token = genToken(user.id);
      resStatusDataToken(res, "success", "Login successful", user, token);
    }
  }
};
export const influencerAccount = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  const userId = req.user?._id;
  const {
    firstName,
    lastName,
    phone,
    dietary_prefernces,
    allergy,
    app_notification,
    email_notification,
    upi_Id,
    email,
  } = req.body;
  if (!firstName || !lastName || !phone) {
    resStatus(res, "false", "First name, last name, and phone are required.");
    return;
  }
  const user = await UserModel.findById(userId);
  if (!user) {
    resStatus(res, "false", "User not found.");
    return;
  }
  const followerData = await FollowerModel.findOne();
  const staticFollowers = Number(followerData?.staticFollowers ?? 0);
  const followersCount = Number(user?.businessDiscovery?.followers_count ?? 0);
  const profile_status = "verified";
    // followersCount > staticFollowers ? "verified" : "under_review";
  // const updatedUser = await UserModel.findByIdAndUpdate(userId, {
  //   $set: {
  //     firstName,
  //     lastName,
  //     phone,
  //     app_notification,
  //     email_notification,
  //     dietary_prefernces,
  //     profile_status: profile_status,
  //     allergy,
  //     upi_Id,
  //     email,
  //     profile_step: false,
  //   },
  // });
  const updatedUser = await UserModel.findByIdAndUpdate(
    userId,
    {
      $set: {
        firstName,
        lastName,
        phone,
        app_notification,
        email_notification,
        dietary_prefernces,
        profile_status: profile_status,
        allergy,
        upi_Id,
        email:email.toLowerCase(),
        profile_step: false,
      },
    },
    { new: true } 
  );
  
  if (!updatedUser) {
    resStatus(res, "false", "User not found.");
  }
  resStatusData(
    res,
    "success",
    "User details updated successfully",
    updatedUser
  );
};
export const privacyPolicy = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  res.sendFile(path.join(__dirname, "../../views/privacyPolicy.html"));
};
export const AcceptedProfileRequest = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const adminId = req.user._id;
  const { userId, status } = req.body;
  if (!userId || !status) {
    resStatus(res, "false", "User ID and Status are required.");
  } else {
    const existingUser = await UserModel.findById(userId);
    if (!existingUser) {
      resStatus(res, "false", "User not found.");
    } else {
      const updatedprofile = await UserModel.findByIdAndUpdate(
        userId,
        { profile_status: status },
        { new: true }
      );
      if (!updatedprofile) {
        resStatus(res, "false", "Failed to update user status.");
      } else {
        const user = await UserModel.findById(updatedprofile.id);
        // const playerID = user?.playerId[] || "d4f36cc6-f7bb-4b0f-bc01-c04c7509a247";
        let playerIDs: string[] = user?.playerId || [
          "a91b270e-e75c-4e05-b31c-24ff470f7781",
        ];
        const title = `Profile ${status.toLowerCase()}`;
        const imageUrl = "image/download.png";
        const notificationMessage = `Your profile has been ${status.toLowerCase()}.`;
        // Send OneSignal notification
        for (const playerID of playerIDs) {
          await sendNotification(
            playerID,
            title,
            notificationMessage,
            imageUrl,
            "user"
          );
        }
        // await sendNotification(playerId, title, notificationMessage, imageUrl);
        await createNotification(
          new mongoose.Types.ObjectId(updatedprofile.id.toString()),
          new mongoose.Types.ObjectId(adminId.toString()),
          title,
          notificationMessage,
          imageUrl,
          "user"
        );
        resStatusData(
          res,
          "success",
          "User status updated successfully",
          updatedprofile
        );
      }
    }
  }
};
export const addPlayerId = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { playerId } = req.body;
  const userId = req.user?._id;
  if (!playerId) {
    resStatus(res, "false", "Player ID is required");
    return;
  }
  const user = await UserModel.findById(userId);
  if (!user) {
    resStatus(res, "false", "User not found");
    return;
  }
  const playerIds = Array.isArray(playerId) ? playerId : [playerId];
  const updatedUser = await UserModel.findByIdAndUpdate(
    userId,
    { $addToSet: { playerId: { $each: playerIds } } },
    { new: true }
  );
  resStatusData(res, "success", "Player ID updated successfully", {
    userId,
    playerId: updatedUser?.playerId,
  });
};
export const userLogout = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = req.user?._id;
  const { playerId } = req.body;
  if (!playerId) {
    resStatus(res, "false", "Player ID is required.");
  } else {
    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $pull: { playerId: playerId } },
      { new: true }
    );
    if (!updatedUser) {
      resStatus(res, "false", "Failed to log out.");
      return;
    }
    resStatus(res, "success", "Logged out successfully");
  }
};
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  const userId = req.query.userId;
  const user = await UserModel.findById(userId);
  if (!user) {
    resStatus(res, "false", "User not found");
    return;
  }
  if (user.isDeleted) {
    resStatus(res, "false", "User is already marked as deleted");
    return;
  }
  const updatedUser = await UserModel.findByIdAndUpdate(
    userId,
    { isDeleted: true },
    { new: true }
  );
  resStatusData(res, "success", "User marked as deleted", updatedUser);
};
export const permanentlyDeleteUser = async (req: Request |any, res: Response): Promise<void> => {
  try {
    const userId = req.user._id;
    if (!userId) {
      resStatus(res, "false", "User ID is required");
      return;
    }
    const user = await UserModel.findById(userId);
    if (!user) {
      resStatus(res, "false", "User not found");
      return;
    }
    await BookingModel.deleteMany({ userId: userId, status: "pending" });
    await UserModel.findByIdAndDelete(userId);
    resStatus(res, "success", "User and their pending bookings deleted permanently");
  } catch (error) {
    console.error("Error deleting user:", error);
    resStatus(res, "false", "An error occurred while deleting the user");
  }
};

