import { Request, Response } from "express";
import SubscriptionModel from "../Models/SubscriptionModel";
import UserModel from "../Models/UserModel";
import Wallet from "../Models/Wallet";
import WalletTransaction from "../Models/WalletTransaction";
import BookingModel from "../Models/Booking";
import OfferModel from "../Models/offerModal";
import WithdrawalRequest from "../Models/WithdrawalRequest";
import { resStatusData, resStatus } from "../Responses/Response";

/**
 * PHASE 6: Admin Panel Analytics & Monitoring
 */

/**
 * Get Subscription Analytics Dashboard
 */
export const getSubscriptionAnalytics = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    // Total subscriptions by status
    const statusBreakdown = await SubscriptionModel.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          total_revenue: { $sum: "$amount" },
        },
      },
    ]);

    // Active subscriptions
    const activeCount = await SubscriptionModel.countDocuments({
      status: "active",
    });

    // Expiring soon (next 7 days)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const expiringSoon = await SubscriptionModel.find({
      status: "active",
      end_date: { $lte: sevenDaysFromNow, $gte: new Date() },
    })
      .populate("user_id", "firstName lastName email")
      .sort({ end_date: 1 });

    // Subscription tier distribution
    const tierDistribution = await SubscriptionModel.aggregate([
      { $match: { status: "active" } },
      {
        $group: {
          _id: "$tier",
          count: { $sum: 1 },
          total_revenue: { $sum: "$amount" },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Revenue by month (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyRevenue = await SubscriptionModel.aggregate([
      {
        $match: {
          payment_status: "completed",
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          revenue: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Total revenue
    const totalRevenue = await SubscriptionModel.aggregate([
      { $match: { payment_status: "completed" } },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    resStatusData(
      res,
      "success",
      "Subscription analytics fetched successfully",
      {
        active_subscriptions: activeCount,
        status_breakdown: statusBreakdown,
        expiring_soon: {
          count: expiringSoon.length,
          subscriptions: expiringSoon,
        },
        tier_distribution: tierDistribution,
        monthly_revenue: monthlyRevenue,
        total_revenue: totalRevenue[0]?.total || 0,
      }
    );
  } catch (error: any) {
    console.error("Get subscription analytics error:", error);
    resStatus(res, "false", error.message);
  }
};

/**
 * Get Wallet Monitoring Dashboard
 */
export const getWalletMonitoring = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    // Total balances across all wallets
    const totalBalances = await Wallet.aggregate([
      {
        $group: {
          _id: null,
          total_balance: { $sum: "$total_balance" },
          total_locked: { $sum: "$locked_balance" },
          total_available: { $sum: "$available_balance" },
        },
      },
    ]);

    // Wallet count
    const walletCount = await Wallet.countDocuments();

    // Wallets with high balance (top 10)
    const topWallets = await Wallet.find()
      .sort({ total_balance: -1 })
      .limit(10)
      .populate("user_id", "firstName lastName email userType");

    // Recent transactions (last 50)
    const recentTransactions = await WalletTransaction.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("user_id", "firstName lastName email");

    // Transaction statistics
    const transactionStats = await WalletTransaction.aggregate([
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          total_amount: { $sum: "$amount" },
        },
      },
    ]);

    // Locked funds by business
    const lockedFunds = await Wallet.find({
      locked_balance: { $gt: 0 },
    })
      .sort({ locked_balance: -1 })
      .populate("user_id", "firstName lastName email");

    resStatusData(res, "success", "Wallet monitoring data fetched", {
      summary: {
        total_wallets: walletCount,
        total_balance: totalBalances[0]?.total_balance || 0,
        total_locked: totalBalances[0]?.total_locked || 0,
        total_available: totalBalances[0]?.total_available || 0,
      },
      top_wallets: topWallets,
      recent_transactions: recentTransactions,
      transaction_stats: transactionStats,
      locked_funds: lockedFunds,
    });
  } catch (error: any) {
    console.error("Get wallet monitoring error:", error);
    resStatus(res, "false", error.message);
  }
};

/**
 * Get Creator Management Analytics
 */
export const getCreatorAnalytics = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    const { page = 1, limit = 20 } = req.query;

    // Total creators
    const totalCreators = await UserModel.countDocuments({
      userType: "user",
    });

    // Creators with bookings
    const creatorsWithBookings = await BookingModel.aggregate([
      {
        $group: {
          _id: "$userId",
          total_bookings: { $sum: 1 },
          accepted_bookings: {
            $sum: { $cond: [{ $eq: ["$status", "accepted"] }, 1, 0] },
          },
          total_earnings: { $sum: "$payout_amount" },
        },
      },
      { $sort: { total_bookings: -1 } },
      { $limit: Number(limit) },
      { $skip: (Number(page) - 1) * Number(limit) },
    ]);

    // Populate creator details
    const creatorIds = creatorsWithBookings.map((c) => c._id);
    const creators = await UserModel.find({
      _id: { $in: creatorIds },
    }).select("firstName lastName email profileImage instagram");

    // Merge creator details with statistics
    const creatorAnalytics = creatorsWithBookings.map((stat) => {
      const creator = creators.find(
        (c) => (c as any)._id.toString() === stat._id.toString()
      );
      return {
        ...stat,
        creator_details: creator,
      };
    });

    // Top earners (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const topEarners = await BookingModel.aggregate([
      {
        $match: {
          payout_status: "paid",
          payout_date: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: "$userId",
          earnings_30d: { $sum: "$payout_amount" },
          collaborations_30d: { $sum: 1 },
        },
      },
      { $sort: { earnings_30d: -1 } },
      { $limit: 10 },
    ]);

    // Populate top earners
    const topEarnerIds = topEarners.map((e) => e._id);
    const topEarnerDetails = await UserModel.find({
      _id: { $in: topEarnerIds },
    }).select("firstName lastName email profileImage instagram");

    const topEarnersWithDetails = topEarners.map((stat) => {
      const creator = topEarnerDetails.find(
        (c) => (c as any)._id.toString() === stat._id.toString()
      );
      return {
        ...stat,
        creator: creator,
      };
    });

    resStatusData(res, "success", "Creator analytics fetched", {
      total_creators: totalCreators,
      creators_with_activity: creatorAnalytics.length,
      creator_analytics: creatorAnalytics,
      top_earners_30d: topEarnersWithDetails,
      pagination: {
        page: Number(page),
        limit: Number(limit),
      },
    });
  } catch (error: any) {
    console.error("Get creator analytics error:", error);
    resStatus(res, "false", error.message);
  }
};

/**
 * Get Business Analytics
 */
export const getBusinessAnalytics = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    const { business_id } = req.query;
    const { page = 1, limit = 20 } = req.query;

    let query: any = { userType: "business" };
    if (business_id) {
      query._id = business_id;
    }

    const businesses = await UserModel.find(query)
      .select(
        "firstName lastName email profileImage city hasActiveSubscription subscriptionExpiryDate"
      )
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const businessAnalytics = await Promise.all(
      businesses.map(async (business) => {
        // Get subscription
        const subscription = await SubscriptionModel.findOne({
          user_id: business._id,
          status: "active",
        });

        // Get wallet
        const wallet = await Wallet.findOne({ user_id: business._id });

        // Get offers count
        const offersCount = await OfferModel.countDocuments({
          business_id: business._id,
          isdeleted: false,
        });

        // Get bookings count
        const bookingsCount = await BookingModel.countDocuments({
          restoId: business._id,
        });

        // Get accepted bookings
        const acceptedBookings = await BookingModel.countDocuments({
          restoId: business._id,
          status: "accepted",
        });

        // Get total payouts made
        const totalPayouts = await BookingModel.aggregate([
          {
            $match: {
              restoId: business._id,
              payout_status: "paid",
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$payout_amount" },
            },
          },
        ]);

        return {
          business: business,
          subscription: subscription
            ? {
                tier: (subscription as any).tier,
                status: (subscription as any).status,
                expires_at: (subscription as any).endDate,
              }
            : null,
          wallet: wallet
            ? {
                total_balance: wallet.total_balance,
                locked_balance: wallet.locked_balance,
                available_balance: wallet.available_balance,
              }
            : null,
          offers_count: offersCount,
          bookings_count: bookingsCount,
          accepted_bookings: acceptedBookings,
          total_payouts: totalPayouts[0]?.total || 0,
        };
      })
    );

    const totalBusinesses = await UserModel.countDocuments({
      userType: "business",
    });

    resStatusData(res, "success", "Business analytics fetched", {
      total_businesses: totalBusinesses,
      businesses: businessAnalytics,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalBusinesses,
        pages: Math.ceil(totalBusinesses / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error("Get business analytics error:", error);
    resStatus(res, "false", error.message);
  }
};

/**
 * Get Platform Overview
 */
export const getPlatformOverview = async (
  req: Request | any,
  res: Response
): Promise<void> => {
  try {
    // User counts
    const totalUsers = await UserModel.countDocuments();
    const businessCount = await UserModel.countDocuments({
      userType: "business",
    });
    const creatorCount = await UserModel.countDocuments({ userType: "user" });

    // Active subscriptions
    const activeSubscriptions = await SubscriptionModel.countDocuments({
      status: "active",
    });

    // Total subscription revenue
    const subscriptionRevenue = await SubscriptionModel.aggregate([
      { $match: { payment_status: "completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Wallet totals
    const walletTotals = await Wallet.aggregate([
      {
        $group: {
          _id: null,
          total_balance: { $sum: "$total_balance" },
          total_locked: { $sum: "$locked_balance" },
        },
      },
    ]);

    // Offers
    const totalOffers = await OfferModel.countDocuments({ isdeleted: false });
    const liveOffers = await OfferModel.countDocuments({
      status: "live",
      isdeleted: false,
    });

    // Bookings
    const totalBookings = await BookingModel.countDocuments();
    const acceptedBookings = await BookingModel.countDocuments({
      status: "accepted",
    });

    // Payouts
    const totalPayouts = await BookingModel.aggregate([
      { $match: { payout_status: "paid" } },
      {
        $group: {
          _id: null,
          total_amount: { $sum: "$payout_amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Pending withdrawals
    const pendingWithdrawals = await WithdrawalRequest.countDocuments({
      status: "pending",
    });

    resStatusData(res, "success", "Platform overview fetched", {
      users: {
        total: totalUsers,
        businesses: businessCount,
        creators: creatorCount,
      },
      subscriptions: {
        active: activeSubscriptions,
        total_revenue: subscriptionRevenue[0]?.total || 0,
      },
      wallets: {
        total_balance: walletTotals[0]?.total_balance || 0,
        total_locked: walletTotals[0]?.total_locked || 0,
      },
      offers: {
        total: totalOffers,
        live: liveOffers,
      },
      bookings: {
        total: totalBookings,
        accepted: acceptedBookings,
      },
      payouts: {
        total_amount: totalPayouts[0]?.total_amount || 0,
        count: totalPayouts[0]?.count || 0,
      },
      withdrawals: {
        pending: pendingWithdrawals,
      },
    });
  } catch (error: any) {
    console.error("Get platform overview error:", error);
    resStatus(res, "false", error.message);
  }
};
