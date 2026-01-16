import { Request, Response } from "express";
import InfluencerRatingModel from "../Models/influencerRating";
import {
    responsestatusmessage,
    resStatus,
    resStatus401,
    resStatusData,
    resStatusDataToken,
    resStatusDataToken201,
  } from "../Responses/Response";
export const addInfluencerRating = async (req: Request | any, res: Response): Promise<void> => {
  const { bookingId,influencerId, restaurantId, content_presentation, joviality, punctuality } = req.body;
  if (!influencerId || !restaurantId || content_presentation == null || joviality == null || punctuality == null) {
    resStatus(res, "false", "influencerId, restaurantId, and all rating fields are required.");
    return;
  }
  const existingRating = await InfluencerRatingModel.findOne({
    bookingId,
    influencerId,
    restaurantId
  });

  if (existingRating) {
    resStatus(res, "false", "Rating already exists for this booking.");
    return;
  }
  const ratingData =  await InfluencerRatingModel.create({
    bookingId,
    influencerId,
    restaurantId,
    profileType:"ProfileHealth",
    content_presentation: Math.min(100, Math.max(0, content_presentation)),
    joviality: Math.min(100, Math.max(0, joviality)),
    punctuality: Math.min(100, Math.max(0, punctuality)),
  });
//   await ratingData.save();
  resStatusData(res, "success", "Rating added successfully.", ratingData);
};
export const showProfileHealth = async (req: Request | any, res: Response): Promise<void> => { 
    const { influencerId } = req.query;
    if (!influencerId) {
      resStatus(res, "false", "Influencer ID is required.");
      return;
    }
    const ratings = await InfluencerRatingModel.find({ influencerId });
    if (!ratings.length) {
      resStatus(res, "false", "No ratings found for this influencer.");
      return;
    }
    const totalRatings = ratings.length;
    const sumRatings = ratings.reduce(
      (acc, rating) => {
        acc.content_presentation += typeof rating.content_presentation === 'number' ? rating.content_presentation : 0;
        acc.joviality += typeof rating.joviality === 'number' ? rating.joviality : 0;
        acc.punctuality += typeof rating.punctuality === 'number' ? rating.punctuality : 0;
        return acc;
      },
      { content_presentation: 0, joviality: 0, punctuality: 0 }
    );
    const averageRatings = {
        content_presentation: `${Math.round(sumRatings.content_presentation / totalRatings)}%`,
        joviality: `${Math.round(sumRatings.joviality / totalRatings)}%`,
        punctuality: `${Math.round(sumRatings.punctuality / totalRatings)}%`,
      };
    resStatusData(res, "success", "Influencer average rating retrieved successfully.", averageRatings);
  };
