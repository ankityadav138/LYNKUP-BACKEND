import { Request, Response } from "express";
import InvoiceModel from "../Models/InvoiceModel";
import { resStatusData } from "../Responses/Response";

/**
 * GET /admin/invoices
 * List all invoices with pagination and filters
 */
export const getAllInvoices = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 20, type, search } = req.query;
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const query: any = {};
    if (type && type !== "all") query.type = type;
    if (search) {
      query.$or = [
        { invoiceNumber: new RegExp(search as string, "i") },
        { billingEmail: new RegExp(search as string, "i") },
        { razorpayPaymentId: new RegExp(search as string, "i") },
      ];
    }

    const [invoices, totalCount] = await Promise.all([
      InvoiceModel.find(query)
        .populate("userId", "name firstName lastName email")
        .populate("subscriptionId", "tier status startDate endDate")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      InvoiceModel.countDocuments(query),
    ]);

    // Stats
    const stats = await InvoiceModel.aggregate([
      { $group: { _id: "$type", count: { $sum: 1 }, total: { $sum: "$amount" } } },
    ]);

    resStatusData(res, "success", "Invoices fetched", {
      invoices,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalCount,
      },
      stats: stats.reduce((acc: any, s: any) => ({ ...acc, [s._id]: s }), {}),
    });
  } catch (error: any) {
    resStatusData(res, "error", "Failed to fetch invoices", { error: error.message });
  }
};

/**
 * GET /admin/invoices/:invoiceId
 * Get single invoice details
 */
export const getInvoiceById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { invoiceId } = req.params;

    const invoice = await InvoiceModel.findById(invoiceId)
      .populate("userId", "name firstName lastName email phone address")
      .populate("subscriptionId")
      .lean();

    if (!invoice) {
      resStatusData(res, "error", "Invoice not found", {});
      return;
    }

    resStatusData(res, "success", "Invoice fetched", { invoice });
  } catch (error: any) {
    resStatusData(res, "error", "Failed to fetch invoice", { error: error.message });
  }
};

/**
 * GET /admin/invoices/user/:userId
 * Get all invoices for a specific user
 */
export const getInvoicesByUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const invoices = await InvoiceModel.find({ userId })
      .populate("subscriptionId", "tier status startDate endDate")
      .sort({ createdAt: -1 })
      .lean();

    resStatusData(res, "success", "User invoices fetched", {
      invoices,
      count: invoices.length,
    });
  } catch (error: any) {
    resStatusData(res, "error", "Failed to fetch user invoices", { error: error.message });
  }
};

/**
 * GET /admin/invoices/export
 * Export invoices as CSV (for accounting)
 */
export const exportInvoices = async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, type } = req.query;

    const query: any = {};
    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate as string);
      if (endDate) query.invoiceDate.$lte = new Date(endDate as string);
    }
    if (type && type !== "all") query.type = type;

    const invoices = await InvoiceModel.find(query)
      .populate("userId", "name firstName lastName email")
      .sort({ invoiceDate: -1 })
      .lean();

    const headers = ["Invoice Number", "Date", "Type", "Customer", "Email", "Plan", "Amount", "Currency", "Payment ID", "Order ID"];
    const rows = invoices.map((inv: any) => [
      inv.invoiceNumber,
      new Date(inv.invoiceDate).toISOString().split("T")[0],
      inv.type,
      inv.userId?.firstName ? `${inv.userId.firstName} ${inv.userId.lastName || ""}` : inv.userId?.name || "N/A",
      inv.billingEmail,
      inv.planName,
      inv.amount,
      inv.currency,
      inv.razorpayPaymentId || "N/A",
      inv.razorpayOrderId || "N/A",
    ]);

    const csv = [headers.join(","), ...rows.map((r: any) => r.map((c: any) => `"${c}"`).join(","))].join("\n");
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=invoices_${Date.now()}.csv`);
    res.send(csv);
  } catch (error: any) {
    console.error("Export invoices error:", error);
    resStatusData(res, "error", "Export failed", { error: error.message });
  }
};
