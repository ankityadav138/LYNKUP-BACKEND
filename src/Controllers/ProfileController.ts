import UserModel from "../Models/UserModel";
import { NextFunction, Request, Response } from "express";
import { responsestatusmessage, resStatus, resStatusData, resStatusTryCatch } from "../Responses/Response";
import BookingModel from "../Models/Booking";
import influencerRating from "../Models/influencerRating";
export const showProfile = async (req: Request | any, res: Response): Promise<void> => {
    const userId = req.user._id;
  const user = await UserModel.findById(userId).select("-password -__v");
  if (!user) {
    resStatus(res, "false", "User not found.");
  }
  resStatusData(res, "success", "User fetched successfully", user);
}
export const editProfile = async (req: Request | any, res: Response, next: NextFunction): Promise<void> => {
  const userId = req.user?._id;
  try {
    const { firstName, lastName, dietary_prefernces, email, allergy, app_notification, email_notification } = req.body;

    const user = await UserModel.findById(userId);
    if (!user) {
      responsestatusmessage(res, "false", "User not found.");
      return;
    }

    if (user.blocked) {
      responsestatusmessage(res, "false", "User is blocked.");
      return;
    }

    const updateData: any = {};

    if (email && email.toLowerCase() !== user.email?.toLowerCase()) {
      // Check if email exists for another user
      const emailExists = await UserModel.findOne({ email: email.toLowerCase(), _id: { $ne: userId } });
      if (emailExists) {
        responsestatusmessage(res, "false", "Email is already in use.");
        return;
      }
      updateData.email = email.toLowerCase();
    }

    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (dietary_prefernces) updateData.dietary_prefernces = dietary_prefernces;
    if (allergy) updateData.allergy = allergy;
    if (app_notification) updateData.app_notification = app_notification;
    if (email_notification) updateData.email_notification = email_notification;
    if (req.file) {
      updateData.profileImage = (req.file as any).location || `image/${req.file.filename}`;
    }

    const updatedUser = await UserModel.findByIdAndUpdate(userId, updateData, { new: true });

    if (req.file && Object.keys(updateData).length === 1) {
      resStatusData(res, "success", "Profile image updated successfully.", { profileImage: updatedUser?.profileImage });
    } else {
      resStatusData(res, "success", "Profile updated successfully.", updatedUser);
    }
  } catch (error) {
    next(error);
  }
};

// export const editProfile = async (req: Request |any, res: Response, next: NextFunction): Promise<void> => {
//   const userId = req.user?._id;
//   try {
//     const { firstName, lastName,dietary_prefernces,email, allergy, app_notification, email_notification } = req.body;

//     const user = await UserModel.findById(userId);
//     if (!user) {
//       responsestatusmessage(res, "false", "User not found.");
//       return;
//     }
//     if (user.blocked) {
//       responsestatusmessage(res, "false", "User is blocked.");
//       return;
//     }
//     const updateData: any = {};
//     if (firstName) updateData.firstName = firstName;
//     if (lastName) updateData.lastName = lastName;
//     if (email) updateData.email = email.toLowerCase();
//     if (dietary_prefernces) updateData.dietary_prefernces = dietary_prefernces;
//     if (allergy) updateData.allergy = allergy;
//     if (app_notification) updateData.app_notification = app_notification;
//     if (email_notification) updateData.email_notification = email_notification;
//     if (req.file) {
//       updateData.profileImage = `image/${req.file.filename}`;
//     }
//     const updatedUser = await UserModel.findByIdAndUpdate(userId, updateData, { new: true });
//     if (req.file && Object.keys(updateData).length === 1) {
//       resStatusData(res, "success", "Profile image updated successfully.", { profileImage: updatedUser?.profileImage });
//     } else {
//       resStatusData(res, "success", "Profile updated successfully.", updatedUser);
//     }
//   } catch (error) {
//     next(error);
//   }
// };  
export const editProfileForAdmin = async (req: Request | any, res: Response, next: NextFunction): Promise<void> => {
  const userId = req.user?._id;
  console.log("adminId:",userId);
  try {
    const { firstName, lastName, name, email, address, location } = req.body;
    if(!(firstName ||lastName||name||email||location)){
      resStatus(res,"false",'atleast one field required');
    }else{
    const user = await UserModel.findById(userId);
    const files = req.files;
    const mediaFiles = files ? files.map((file: any) => file.location) : [];
    if (!user) {
      responsestatusmessage(res, "false", "User not found.");
    }
    else if (user.blocked) {
      responsestatusmessage(res, "false", "User is blocked.");
    }else{
    const updateData: any = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (name) updateData.name = name;
    if (email) updateData.email = email.toLowerCase();
    if (address) updateData.address = address;
    if (location) {
      const parsedLocation = typeof location === "string" ? JSON.parse(location) : location;
      if (parsedLocation?.coordinates?.length === 2) {
        updateData.location = {
          type: "Point",
          coordinates: [
            parseFloat(parsedLocation.coordinates[0]),
            parseFloat(parsedLocation.coordinates[1])
          ],
          address: parsedLocation.address || ""
        };
      }
    }
    if (mediaFiles.length) {
      updateData.document = mediaFiles;
    }
    const updatedUser = await UserModel.findByIdAndUpdate(userId, updateData, { new: true });
      console.log(updatedUser)
    if (mediaFiles.length && Object.keys(updateData).length === 1) {
      resStatusData(res, "success", "Document updated successfully.", { profileImage: updatedUser?.profileImage });
    } else {
      resStatusData(res, "success", "Profile updated successfully.", updatedUser);
    }
  }
  }} catch (error) {
    next(error);
  }
};

// export const editProfileForAdmin = async (req: Request |any, res: Response, next: NextFunction): Promise<void> => {
//   const userId = req.user?._id;
//   try {
//     const { firstName, lastName, name, email, address, location  } = req.body;
//     const user = await UserModel.findById(userId);
//     const files = req.files;
//     const mediaFiles = files ? files.map((file: any) => file.location) : [];
//     const parsedLocation =
//       typeof location === "string" ? JSON.parse(location) : location;
//     if (!user) {
//       responsestatusmessage(res, "false", "User not found.");
//       return;
//     }
//     if (user.blocked) {
//       responsestatusmessage(res, "false", "User is blocked.");
//       return;
//     }
//     const updateData: any = {};
//     if (firstName) updateData.firstName = firstName;
//     if (lastName) updateData.lastName = lastName;
//     if (name) updateData.name = name;
//     if (email) updateData.email = email;
//     if (address) updateData.address = address;
//     if (location) updateData.location = parsedLocation;
//     if (mediaFiles) {
//       updateData.document = mediaFiles;
//     }
//     const updatedUser = await UserModel.findByIdAndUpdate(userId, updateData, { new: true });
//     if (mediaFiles && Object.keys(updateData).length === 1) {
//       resStatusData(res, "success", "document updated successfully.", { profileImage: updatedUser?.profileImage });
//     } else {
//       resStatusData(res, "success", "document updated successfully.", updatedUser);
//     }
//   } catch (error) {
//     next(error);
//   }
// };  
export const changeRating = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = req.user._id;
  try {
    const { bookingId } = req.body;

    const booking = await BookingModel.findById(bookingId);
    if (!booking) {
      resStatus(res, "false", "Booking not found");
      return;
    }

    const rating = await influencerRating.findOne({
      bookingId: bookingId,
      influencerId: userId
    });
    if (rating) {
      const updatedBooking = await BookingModel.findByIdAndUpdate(
        bookingId,
        { review: !booking.review },
        { new: true }
      );

      if (!updatedBooking) {
        resStatus(res, "false", "Failed to update review status");
        return;
      }

      resStatusData(res, "success", "Review status updated", updatedBooking);
    } else {
      resStatus(res, "false", "Please give feedback first");
    }
  } catch (error) {
    next(error);
  }
};

