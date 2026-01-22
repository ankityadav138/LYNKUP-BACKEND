import { Request, Response } from "express";
import BookingModel from "../Models/Booking";
import OfferModel from "../Models/offerModal";
import UserModel from "../Models/UserModel";
import Wallet from "../Models/Wallet";
import WalletTransaction from "../Models/WalletTransaction";
import { resStatusData, resStatus } from "../Responses/Response";
import { invoiceService } from "../Services/InvoiceService";

/**
 * PHASE 3: Manual Payout System
 * Businesses manually record payouts to influencers after collaboration completion
 */

/**
 * Get all completed bookings that need payout
 * For businesses to see which collaborations need payment
 */
export const getBookingsForPayout = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    const business_id = req.user._id;

    // Get all bookings where:
    // - Business owns the offer
    // - Booking is accepted/completed
    // - Content is accepted
    // - Payout not yet recorded OR status is pending
    const bookings = await BookingModel.find({
      restoId: business_id,
      status: "accepted",
      content_status: "accepted",
      $or: [
        { payout_status: { $exists: false } },
        { payout_status: "pending" },
      ],
    })
      .populate({
        path: "userId",
        select: "firstName lastName email number instagram upi_Id profileImage",
      })
      .populate({
        path: "offerId",
        select: "name collaboration_type fixed_amount milestone_slabs offering",
      })
      .sort({ createdAt: -1 });

    // Calculate payout amounts based on collaboration type
    const bookingsWithAmounts = bookings.map((booking: any) => {
      const offer = booking.offerId;
      let calculatedAmount = 0;

      if (offer.collaboration_type === "paid") {
        calculatedAmount = offer.fixed_amount || 0;
      } else if (offer.collaboration_type === "milestone") {
        // For milestone, business will manually enter based on performance
        calculatedAmount = 0; // Will be determined manually
      }

      return {
        ...booking.toObject(),
        suggested_amount: calculatedAmount,
      };
    });

    resStatusData(
      res,
      "success",
      "Bookings for payout fetched successfully",
      {
        bookings: bookingsWithAmounts,
        total_count: bookings.length,
      }
    );
  } catch (error: any) {
    console.error("Error fetching bookings for payout:", error);
    resStatusData(res, "error", error.message, null);
  }
};

/**
 * Get payout history for business
 * Shows all completed payouts
 */
export const getPayoutHistory = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    const business_id = req.user._id;
    const { page = 1, limit = 20, status } = req.query;

    const query: any = {
      restoId: business_id,
      payout_status: { $exists: true },
    };

    // Filter by status if provided
    if (status && ["pending", "paid", "failed"].includes(status)) {
      query.payout_status = status;
    }

    const bookings = await BookingModel.find(query)
      .populate({
        path: "userId",
        select: "firstName lastName email number instagram profileImage",
      })
      .populate({
        path: "offerId",
        select: "name collaboration_type fixed_amount offering",
      })
      .sort({ payout_date: -1, createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await BookingModel.countDocuments(query);

    // Calculate summary stats
    const stats = await BookingModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$payout_status",
          count: { $sum: 1 },
          total_amount: { $sum: "$payout_amount" },
        },
      },
    ]);

    resStatusData(res, "success", "Payout history fetched successfully", {
      bookings,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
      stats,
    });
  } catch (error: any) {
    console.error("Error fetching payout history:", error);
    resStatusData(res, "error", error.message, null);
  }
};

/**
 * Record manual payout
 * Business confirms they've paid the influencer
 */
export const recordManualPayout = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    const business_id = req.user._id;
    const {
      booking_id,
      amount,
      payout_mode, // UPI | Bank Transfer | Cash
      remarks,
      milestone_achieved, // Optional: for milestone-based
    } = req.body;

    // Validate input
    if (!booking_id || !amount || !payout_mode) {
      resStatus(
        res,
        "false",
        "Booking ID, amount, and payout mode are required"
      );
      return;
    }

    if (!["UPI", "Bank Transfer", "Cash"].includes(payout_mode)) {
      resStatus(
        res,
        "false",
        "Invalid payout mode. Must be UPI, Bank Transfer, or Cash"
      );
      return;
    }

    if (amount <= 0) {
      resStatus(res, "false", "Amount must be greater than 0");
      return;
    }

    // Get booking
    const booking = await BookingModel.findOne({
      _id: booking_id,
      restoId: business_id,
    })
      .populate("userId")
      .populate("offerId");

    if (!booking) {
      resStatus(res, "false", "Booking not found or unauthorized");
      return;
    }

    // Check if booking is completed
    if (booking.status !== "accepted") {
      resStatus(
        res,
        "false",
        "Cannot record payout for incomplete collaboration"
      );
      return;
    }

    // Check if content is accepted
    if (booking.content_status !== "accepted") {
      resStatus(res, "false", "Content must be accepted before payout");
      return;
    }

    // Check if payout already recorded
    if (booking.payout_status === "paid") {
      resStatus(res, "false", "Payout already recorded for this booking");
      return;
    }

    const influencer = booking.userId as any;
    const offer = booking.offerId as any;

    // Get business wallet and deduct from locked balance
    const wallet = await Wallet.findOne({ userId: business_id });
    if (!wallet) {
      resStatus(res, "false", "Business wallet not found");
      return;
    }

    // Check if sufficient locked balance
    if (wallet.locked_balance < amount) {
      resStatus(
        res,
        "false",
        `Insufficient locked balance. Available: ₹${wallet.locked_balance}, Required: ₹${amount}`
      );
      return;
    }

    // Deduct from locked balance
    wallet.locked_balance -= amount;
    await wallet.save();

    // Update booking with payout details
    booking.payout_amount = amount;
    booking.payout_date = new Date();
    booking.payout_status = "paid";
    booking.payout_mode = payout_mode as "UPI" | "Bank Transfer" | "Cash";
    booking.payout_remarks = remarks || "";
    if (milestone_achieved) {
      booking.milestone_achieved = milestone_achieved;
    }
    await booking.save();

    // Create wallet transaction for payout deduction
    await WalletTransaction.create({
      wallet_id: wallet._id,
      user_id: business_id,
      type: "unlock",
      amount: amount,
      status: "completed",
      description: `Payout to ${influencer.firstName} ${influencer.lastName} for "${offer.name}" - Deducted from locked funds`,
      reference_type: "booking",
      reference_id: booking._id,
      balance_before: wallet.locked_balance + amount,
      balance_after: wallet.locked_balance,
      metadata: {
        influencer_id: influencer._id,
        payout_mode,
        milestone_achieved,
      },
    });

    // Get business details for invoice
    const business = await UserModel.findById(business_id);

    // Send GST invoice to business email
    if (business && business.email) {
      await invoiceService.sendPayoutGSTInvoice(
        business.email,
        business.firstName + (business.lastName ? ` ${business.lastName}` : ""),
        amount,
        `${influencer.firstName} ${influencer.lastName || ""}`,
        offer.name,
        booking._id.toString(),
        new Date()
      );
    }

    resStatusData(res, "success", "Payout recorded successfully", {
      booking: {
        _id: booking._id,
        payout_amount: booking.payout_amount,
        payout_date: booking.payout_date,
        payout_status: booking.payout_status,
        payout_mode: booking.payout_mode,
        influencer: {
          name: `${influencer.firstName} ${influencer.lastName}`,
          email: influencer.email,
          upi_id: influencer.upi_Id,
        },
        offer: {
          name: offer.name,
          collaboration_type: offer.collaboration_type,
        },
      },
    });
  } catch (error: any) {
    console.error("Error recording payout:", error);
    resStatusData(res, "error", error.message, null);
  }
};

/**
 * Update payout details
 * If business needs to correct payout information
 */
export const updatePayoutDetails = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    const business_id = req.user._id;
    const { booking_id } = req.params;
    const { amount, payout_mode, remarks, milestone_achieved } = req.body;

    const booking = await BookingModel.findOne({
      _id: booking_id,
      restoId: business_id,
    });

    if (!booking) {
      resStatus(res, "false", "Booking not found or unauthorized");
      return;
    }

    // Update only provided fields
    if (amount && amount > 0) {
      booking.payout_amount = amount;
    }
    if (payout_mode && ["UPI", "Bank Transfer", "Cash"].includes(payout_mode)) {
      booking.payout_mode = payout_mode as "UPI" | "Bank Transfer" | "Cash";
    }
    if (remarks !== undefined) {
      booking.payout_remarks = remarks;
    }
    if (milestone_achieved !== undefined) {
      booking.milestone_achieved = milestone_achieved;
    }

    await booking.save();

    resStatusData(res, "success", "Payout details updated successfully", {
      booking,
    });
  } catch (error: any) {
    console.error("Error updating payout:", error);
    resStatusData(res, "error", error.message, null);
  }
};

/**
 * Get influencer's earnings
 * For influencers to see their payment history
 */
export const getInfluencerEarnings = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    const influencer_id = req.user._id;
    const { page = 1, limit = 20, status } = req.query;

    const query: any = {
      userId: influencer_id,
      status: "accepted",
      content_status: "accepted",
    };

    // Filter by payout status if provided
    if (status) {
      if (status === "pending") {
        query.$or = [
          { payout_status: { $exists: false } },
          { payout_status: "pending" },
        ];
      } else if (["paid", "failed"].includes(status)) {
        query.payout_status = status;
      }
    }

    const bookings = await BookingModel.find(query)
      .populate({
        path: "restoId",
        select: "firstName lastName email number profileImage",
      })
      .populate({
        path: "offerId",
        select: "name collaboration_type fixed_amount offering",
      })
      .sort({ payout_date: -1, createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await BookingModel.countDocuments(query);

    // Calculate earnings summary
    const earnings = await BookingModel.aggregate([
      { $match: { userId: influencer_id, payout_status: "paid" } },
      {
        $group: {
          _id: null,
          total_earned: { $sum: "$payout_amount" },
          total_collaborations: { $sum: 1 },
        },
      },
    ]);

    const pending = await BookingModel.aggregate([
      {
        $match: {
          userId: influencer_id,
          status: "accepted",
          content_status: "accepted",
          $or: [
            { payout_status: { $exists: false } },
            { payout_status: "pending" },
          ],
        },
      },
      {
        $lookup: {
          from: "offers",
          localField: "offerId",
          foreignField: "_id",
          as: "offer",
        },
      },
      { $unwind: "$offer" },
      {
        $group: {
          _id: null,
          pending_amount: { $sum: "$offer.fixed_amount" },
          pending_count: { $sum: 1 },
        },
      },
    ]);

    resStatusData(res, "success", "Earnings fetched successfully", {
      bookings,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
      summary: {
        total_earned: earnings[0]?.total_earned || 0,
        total_collaborations: earnings[0]?.total_collaborations || 0,
        pending_amount: pending[0]?.pending_amount || 0,
        pending_count: pending[0]?.pending_count || 0,
      },
    });
  } catch (error: any) {
    console.error("Error fetching earnings:", error);
    resStatusData(res, "error", error.message, null);
  }
};

/**
 * Get booking payout details by ID
 */
export const getPayoutDetails = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    const user_id = req.user._id;
    const { booking_id } = req.params;

    const booking = await BookingModel.findOne({
      _id: booking_id,
      $or: [{ restoId: user_id }, { userId: user_id }],
    })
      .populate({
        path: "userId",
        select: "firstName lastName email number instagram upi_Id profileImage",
      })
      .populate({
        path: "restoId",
        select: "firstName lastName email number profileImage",
      })
      .populate({
        path: "offerId",
        select:
          "name collaboration_type fixed_amount milestone_slabs offering details",
      });

    if (!booking) {
      resStatus(res, "false", "Booking not found or unauthorized");
      return;
    }

    resStatusData(res, "success", "Payout details fetched successfully", {
      booking,
    });
  } catch (error: any) {
    console.error("Error fetching payout details:", error);
    resStatusData(res, "error", error.message, null);
  }
};
