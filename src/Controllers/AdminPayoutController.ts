import { Request, Response } from "express";
import BookingModel from "../Models/Booking";
import OfferModel from "../Models/offerModal";
import UserModel from "../Models/UserModel";
import Wallet from "../Models/Wallet";
import WalletTransaction from "../Models/WalletTransaction";
import { resStatusData, resStatus } from "../Responses/Response";
import { invoiceService } from "../Services/InvoiceService";

/**
 * Admin Payout Management Controller
 * Admins can manage payouts for all businesses
 */

/**
 * Get all pending payouts across all businesses
 */
export const getAllPendingPayouts = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    const { page = 1, limit = 20, business_id, offer_id, search } = req.query;

    const query: any = {
      status: "accepted",
      content_status: "accepted",
      $or: [
        { payout_status: { $exists: false } },
        { payout_status: "pending" },
      ],
    };

    // Filter by business if provided
    if (business_id) {
      query.restoId = business_id;
    }

    // Filter by offer if provided
    if (offer_id) {
      query.offerId = offer_id;
    }

    const bookings = await BookingModel.find(query)
      .populate({
        path: "userId",
        select: "firstName lastName email number instagram upi_Id profileImage",
      })
      .populate({
        path: "restoId",
        select: "firstName lastName email number profileImage city",
      })
      .populate({
        path: "offerId",
        select: "name collaboration_type fixed_amount milestone_slabs offering locked_amount",
      })
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await BookingModel.countDocuments(query);

    // Calculate suggested amounts
    const bookingsWithAmounts = bookings.map((booking: any) => {
      const offer = booking.offerId;
      let suggestedAmount = 0;

      if (offer.collaboration_type === "paid") {
        suggestedAmount = offer.fixed_amount || 0;
      }

      return {
        ...booking.toObject(),
        suggested_amount: suggestedAmount,
      };
    });

    // Get summary stats
    const stats = await BookingModel.aggregate([
      {
        $match: {
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
          total_pending: { $sum: 1 },
          estimated_amount: { $sum: "$offer.fixed_amount" },
        },
      },
    ]);

    resStatusData(res, "success", "Pending payouts fetched successfully", {
      bookings: bookingsWithAmounts,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
      stats: stats[0] || { total_pending: 0, estimated_amount: 0 },
    });
  } catch (error: any) {
    console.error("Error fetching all pending payouts:", error);
    resStatusData(res, "error", error.message, null);
  }
};

/**
 * Get all payout history across all businesses
 */
export const getAllPayoutHistory = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      business_id,
      creator_id,
      date_from,
      date_to,
    } = req.query;

    const query: any = {
      payout_status: { $exists: true, $ne: null },
    };

    // Filter by status
    if (status && ["pending", "paid", "failed"].includes(status)) {
      query.payout_status = status;
    }

    // Filter by business
    if (business_id) {
      query.restoId = business_id;
    }

    // Filter by creator
    if (creator_id) {
      query.userId = creator_id;
    }

    // Filter by date range
    if (date_from || date_to) {
      query.payout_date = {};
      if (date_from) {
        query.payout_date.$gte = new Date(date_from);
      }
      if (date_to) {
        query.payout_date.$lte = new Date(date_to);
      }
    }

    const bookings = await BookingModel.find(query)
      .populate({
        path: "userId",
        select: "firstName lastName email number instagram profileImage",
      })
      .populate({
        path: "restoId",
        select: "firstName lastName email number profileImage city",
      })
      .populate({
        path: "offerId",
        select: "name collaboration_type fixed_amount offering",
      })
      .sort({ payout_date: -1, createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await BookingModel.countDocuments(query);

    // Get summary statistics
    const summaryStats = await BookingModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$payout_status",
          count: { $sum: 1 },
          total_amount: { $sum: "$payout_amount" },
        },
      },
    ]);

    // Get monthly breakdown
    const monthlyStats = await BookingModel.aggregate([
      { $match: { payout_status: "paid" } },
      {
        $group: {
          _id: {
            year: { $year: "$payout_date" },
            month: { $month: "$payout_date" },
          },
          count: { $sum: 1 },
          total_amount: { $sum: "$payout_amount" },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 },
    ]);

    resStatusData(res, "success", "Payout history fetched successfully", {
      bookings,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
      summary: summaryStats,
      monthly_breakdown: monthlyStats,
    });
  } catch (error: any) {
    console.error("Error fetching payout history:", error);
    resStatusData(res, "error", error.message, null);
  }
};

/**
 * Admin records payout for any business
 */
export const recordPayoutAsAdmin = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    const admin_id = req.user._id;
    const {
      booking_id,
      amount,
      payout_mode,
      remarks,
      milestone_achieved,
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
    const booking = await BookingModel.findById(booking_id)
      .populate("userId")
      .populate("offerId")
      .populate("restoId");

    if (!booking) {
      resStatus(res, "false", "Booking not found");
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
    const business = booking.restoId as any;
    const business_id = business._id;

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
    booking.payout_remarks = remarks || `Processed by admin`;
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
      description: `Admin processed payout to ${influencer.firstName} ${influencer.lastName || ""} for "${offer.name}"`,
      reference_type: "booking",
      reference_id: booking._id,
      balance_before: wallet.locked_balance + amount,
      balance_after: wallet.locked_balance,
      metadata: {
        influencer_id: influencer._id,
        payout_mode,
        milestone_achieved,
        processed_by: admin_id,
        processor_type: "admin",
      },
    });

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

    resStatusData(res, "success", "Payout recorded successfully by admin", {
      booking: {
        _id: booking._id,
        payout_amount: booking.payout_amount,
        payout_date: booking.payout_date,
        payout_status: booking.payout_status,
        payout_mode: booking.payout_mode,
        business: {
          name: `${business.firstName} ${business.lastName || ""}`,
          email: business.email,
        },
        influencer: {
          name: `${influencer.firstName} ${influencer.lastName || ""}`,
          email: influencer.email,
          upi_id: influencer.upi_Id,
        },
        offer: {
          name: offer.name,
          collaboration_type: offer.collaboration_type,
        },
      },
      wallet: {
        remaining_locked: wallet.locked_balance,
        available: wallet.available_balance,
      },
    });
  } catch (error: any) {
    console.error("Error recording payout as admin:", error);
    resStatusData(res, "error", error.message, null);
  }
};

/**
 * Get payout dashboard statistics
 */
export const getPayoutDashboard = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    // Total payouts processed
    const totalPayouts = await BookingModel.countDocuments({
      payout_status: "paid",
    });

    // Total amount paid out
    const totalAmountStats = await BookingModel.aggregate([
      { $match: { payout_status: "paid" } },
      {
        $group: {
          _id: null,
          total_amount: { $sum: "$payout_amount" },
        },
      },
    ]);

    // Pending payouts count and estimated amount
    const pendingStats = await BookingModel.aggregate([
      {
        $match: {
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
          pending_count: { $sum: 1 },
          estimated_pending: { $sum: "$offer.fixed_amount" },
        },
      },
    ]);

    // This month's payouts
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    );
    const thisMonthStats = await BookingModel.aggregate([
      {
        $match: {
          payout_status: "paid",
          payout_date: { $gte: startOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          amount: { $sum: "$payout_amount" },
        },
      },
    ]);

    // Top businesses by payout volume
    const topBusinesses = await BookingModel.aggregate([
      { $match: { payout_status: "paid" } },
      {
        $group: {
          _id: "$restoId",
          total_payouts: { $sum: 1 },
          total_amount: { $sum: "$payout_amount" },
        },
      },
      { $sort: { total_amount: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "business",
        },
      },
      { $unwind: "$business" },
      {
        $project: {
          business_name: {
            $concat: ["$business.firstName", " ", "$business.lastName"],
          },
          business_email: "$business.email",
          total_payouts: 1,
          total_amount: 1,
        },
      },
    ]);

    // Top creators by earnings
    const topCreators = await BookingModel.aggregate([
      { $match: { payout_status: "paid" } },
      {
        $group: {
          _id: "$userId",
          total_earned: { $sum: "$payout_amount" },
          collaborations: { $sum: 1 },
        },
      },
      { $sort: { total_earned: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "creator",
        },
      },
      { $unwind: "$creator" },
      {
        $project: {
          creator_name: {
            $concat: ["$creator.firstName", " ", "$creator.lastName"],
          },
          creator_email: "$creator.email",
          total_earned: 1,
          collaborations: 1,
        },
      },
    ]);

    resStatusData(res, "success", "Dashboard stats fetched successfully", {
      overview: {
        total_payouts_processed: totalPayouts,
        total_amount_paid: totalAmountStats[0]?.total_amount || 0,
        pending_payouts: pendingStats[0]?.pending_count || 0,
        estimated_pending_amount: pendingStats[0]?.estimated_pending || 0,
        this_month_count: thisMonthStats[0]?.count || 0,
        this_month_amount: thisMonthStats[0]?.amount || 0,
      },
      top_businesses: topBusinesses,
      top_creators: topCreators,
    });
  } catch (error: any) {
    console.error("Error fetching payout dashboard:", error);
    resStatusData(res, "error", error.message, null);
  }
};

/**
 * Generate GST invoice for a specific payout
 * Can be used to regenerate invoice if needed
 */
export const generateGSTInvoice = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    const { booking_id } = req.params;

    const booking = await BookingModel.findById(booking_id)
      .populate("userId")
      .populate("offerId")
      .populate("restoId");

    if (!booking) {
      resStatus(res, "false", "Booking not found");
      return;
    }

    if (booking.payout_status !== "paid") {
      resStatus(res, "false", "Invoice can only be generated for paid bookings");
      return;
    }

    const business = booking.restoId as any;
    const influencer = booking.userId as any;
    const offer = booking.offerId as any;

    if (!business || !business.email) {
      resStatus(res, "false", "Business email not found");
      return;
    }

    if (!booking.payout_amount) {
      resStatus(res, "false", "Payout amount not found");
      return;
    }

    if (!booking.payout_date) {
      resStatus(res, "false", "Payout date not found");
      return;
    }

    // Send GST invoice
    const invoiceSent = await invoiceService.sendPayoutGSTInvoice(
      business.email,
      business.firstName + (business.lastName ? ` ${business.lastName}` : ""),
      booking.payout_amount,
      `${influencer.firstName} ${influencer.lastName || ""}`,
      offer.name,
      booking._id.toString(),
      booking.payout_date
    );

    if (invoiceSent) {
      resStatusData(res, "success", "GST invoice sent successfully", {
        sent_to: business.email,
        amount: booking.payout_amount,
      });
    } else {
      resStatus(res, "false", "Failed to send invoice");
    }
  } catch (error: any) {
    console.error("Error generating GST invoice:", error);
    resStatusData(res, "error", error.message, null);
  }
};
