import { Request, Response, NextFunction } from "express";
import ExcelJS from "exceljs";
import UserModel from "../Models/UserModel";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a date value to a readable string, or return "N/A" */
const fmt = (d: any): string => {
  if (!d) return "N/A";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "N/A";
  }
};

/** Return value or "N/A" */
const val = (v: any): string => (v !== undefined && v !== null && v !== "" ? String(v) : "N/A");

/** Apply header styling to all cells in row 1 */
const styleHeader = (worksheet: ExcelJS.Worksheet, columns: number) => {
  const headerRow = worksheet.getRow(1);
  for (let col = 1; col <= columns; col++) {
    const cell = headerRow.getCell(col);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF7C3AED" }, // Lynkup purple
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
    };
  }
  headerRow.height = 30;
};

/** Auto-fit column widths based on header + sample data */
const autoFitColumns = (worksheet: ExcelJS.Worksheet) => {
  worksheet.columns.forEach((col) => {
    let maxLength = 12;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLength) maxLength = len;
    });
    col.width = Math.min(maxLength + 4, 45);
  });
};

/** Style every data row with alternating colours */
const styleDataRows = (worksheet: ExcelJS.Worksheet) => {
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const isEven = rowNumber % 2 === 0;
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isEven ? "FFF5F3FF" : "FFFFFFFF" },
      };
      cell.alignment = { vertical: "middle", wrapText: false };
    });
    row.height = 22;
  });
};

// ─── Export Creators (userType: "user") ───────────────────────────────────────

export const exportCreators = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const search = (req.query.search as string) || "";
    const searchRegex = new RegExp(search, "i");

    const query: any = { userType: "user", isDeleted: false };
    if (search) {
      query.$or = [
        { firstName: { $regex: searchRegex } },
        { lastName: { $regex: searchRegex } },
        { name: { $regex: searchRegex } },
        { email: { $regex: searchRegex } },
      ];
    }

    const creators = await UserModel.find(query)
      .select(
        "firstName lastName name email number phone gender city " +
          "profile_status instagram hasActiveSubscription subscriptionExpiryDate " +
          "blocked strikeCount createdAt"
      )
      .sort({ createdAt: -1 })
      .lean();

    // ── Build Workbook ──
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Lynkup Admin";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Creators", {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
    });

    worksheet.columns = [
      { header: "#", key: "index", width: 6 },
      { header: "Full Name", key: "name", width: 22 },
      { header: "Email ID", key: "email", width: 30 },
      { header: "Phone Number", key: "phone", width: 18 },
      { header: "Gender", key: "gender", width: 10 },
      { header: "City", key: "city", width: 16 },
      { header: "Profile Status", key: "profile_status", width: 16 },
      { header: "Instagram Username", key: "instagram", width: 22 },
      { header: "Active Subscription", key: "subscription", width: 20 },
      { header: "Subscription Expiry", key: "sub_expiry", width: 20 },
      { header: "Strike Count", key: "strikes", width: 14 },
      { header: "Account Status", key: "status", width: 16 },
      { header: "Joined Date", key: "joined", width: 16 },
    ];

    creators.forEach((u: any, i) => {
      const fullName =
        val(u.firstName || u.name) !== "N/A"
          ? `${val(u.firstName)} ${val(u.lastName)}`.trim()
          : val(u.name);

      worksheet.addRow({
        index: i + 1,
        name: fullName,
        email: val(u.email),
        phone: val(u.number || u.phone),
        gender: val(u.gender),
        city: val(u.city),
        profile_status: val(u.profile_status),
        instagram: u.instagram?.username ? `@${u.instagram.username}` : "N/A",
        subscription: u.hasActiveSubscription ? "Active" : "Inactive",
        sub_expiry: fmt(u.subscriptionExpiryDate),
        strikes: u.strikeCount ?? 0,
        status: u.blocked ? "Blocked" : "Active",
        joined: fmt(u.createdAt),
      });
    });

    styleHeader(worksheet, worksheet.columns.length);
    styleDataRows(worksheet);
    autoFitColumns(worksheet);

    // ── Stream Response ──
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `creators_${dateStr}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("❌ Error exporting creators:", error);
    next(error);
  }
};

// ─── Export Businesses (userType: "business") ─────────────────────────────────

export const exportBusinesses = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const search = (req.query.search as string) || "";
    const searchRegex = new RegExp(search, "i");

    const query: any = { userType: "business", isDeleted: false };
    if (search) {
      query.$or = [
        { name: { $regex: searchRegex } },
        { email: { $regex: searchRegex } },
        { city: { $regex: searchRegex } },
      ];
    }

    const businesses = await UserModel.find(query)
      .select(
        "name email phone number address city business_type restro_type " +
          "profile_status documentVerified hasActiveSubscription subscriptionExpiryDate " +
          "upi_Id blocked createdAt"
      )
      .sort({ createdAt: -1 })
      .lean();

    // ── Build Workbook ──
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Lynkup Admin";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Businesses", {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
    });

    const BUSINESS_TYPE_MAP: Record<number, string> = {
      1: "Restaurant",
      2: "Cafe",
      3: "Bar",
      4: "Cloud Kitchen",
      5: "Bakery",
    };

    worksheet.columns = [
      { header: "#", key: "index", width: 6 },
      { header: "Business Name", key: "name", width: 28 },
      { header: "Email ID", key: "email", width: 30 },
      { header: "Phone Number", key: "phone", width: 18 },
      { header: "Address", key: "address", width: 35 },
      { header: "City", key: "city", width: 16 },
      { header: "Business Type", key: "business_type", width: 18 },
      { header: "Grade", key: "grade", width: 12 },
      { header: "Profile Status", key: "profile_status", width: 16 },
      { header: "Doc Verified", key: "doc_verified", width: 14 },
      { header: "Active Subscription", key: "subscription", width: 20 },
      { header: "Subscription Expiry", key: "sub_expiry", width: 20 },
      { header: "UPI ID", key: "upi", width: 24 },
      { header: "Account Status", key: "status", width: 16 },
      { header: "Joined Date", key: "joined", width: 16 },
    ];

    businesses.forEach((b: any, i) => {
      worksheet.addRow({
        index: i + 1,
        name: val(b.name),
        email: val(b.email),
        phone: val(b.phone || b.number),
        address: val(b.address),
        city: val(b.city),
        business_type: b.business_type
          ? BUSINESS_TYPE_MAP[b.business_type] ?? `Type ${b.business_type}`
          : "N/A",
        grade: val(b.restro_type),
        profile_status: val(b.profile_status),
        doc_verified: b.documentVerified ? "Yes" : "No",
        subscription: b.hasActiveSubscription ? "Active" : "Inactive",
        sub_expiry: fmt(b.subscriptionExpiryDate),
        upi: val(b.upi_Id),
        status: b.blocked ? "Blocked" : "Active",
        joined: fmt(b.createdAt),
      });
    });

    styleHeader(worksheet, worksheet.columns.length);
    styleDataRows(worksheet);
    autoFitColumns(worksheet);

    // ── Stream Response ──
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `businesses_${dateStr}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("❌ Error exporting businesses:", error);
    next(error);
  }
};
