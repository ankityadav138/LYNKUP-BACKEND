import { Request, Response, NextFunction } from "express";
import UserModel from "../Models/UserModel";
import { resStatus, resStatusData, resStatusTryCatch } from "../Responses/Response";
import FoodTimingModel from "../Models/time";

export const createMealTiming = async (req: Request |any, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user._id;
    const { name, slots } = req.body;
    if (!userId) {
       resStatus(res, "false", "User ID is required.");
    }
    else if (!name) {
       resStatus(res, "false", "Name of the meal is required.");
    }
    else if (!slots || !Array.isArray(slots) || slots.length === 0) {
       resStatus(res, "false", "Slots are required. Please provide at least one time slot.");
    }
    FoodTimingModel.create({
      userId,
      name,
      slots,
    })
      .then((savedMealTiming) => {
        resStatusData(res, "success", "Meal timing created successfully.", savedMealTiming);
      })
      .catch((error) => {
        resStatus(res, "false", error.message);
      });
  };
  export const DeleteTimings = async (req: Request | any, res: Response, next: NextFunction): Promise<void> => {
    const { timeId } = req.body;
    if (!timeId) {
      resStatus(res, "false", "Time ID is required.");
    } else {
      const existingTiming = await FoodTimingModel.findById(timeId);
      if (!existingTiming) {
        resStatus(res, "false", "Booking not found.");
      } else {
        const updated = await FoodTimingModel.findByIdAndUpdate(
          timeId,
          {
            isDeleted: true,
          },
          { new: true }
        );if (!updated) {
            resStatus(res, "false", "falid to Delete.");
          }
          resStatusData(res, "success", "Deleted successfully.", updated);
        }
    }
  };
  export const getAllTimings = async (req: Request | any, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user._id;
    const timings = await FoodTimingModel.find({isDeleted:false,userId:userId});
    if (timings) {
      resStatusData(res, "success", "user Details", timings)
    } else {
      resStatus(res, "false", "no timing found")
    }
  }