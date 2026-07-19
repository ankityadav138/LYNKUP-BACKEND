import bcrypt from "bcrypt";
import { Request, Response } from "express";
import UserModel from "../Models/UserModel";
import { isValidEmail, sendSubAdminCredentialsEmail } from "../utils/errorCatch";
import {
  resStatus,
  resStatusData,
} from "../Responses/Response";

// ─── Utility: generate a secure random password ─────────────────────────────
function generateRandomPassword(length = 12): string {
  const chars =
    "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// ─── Default empty permissions ───────────────────────────────────────────────
function defaultPermissions() {
  const features = [
    "dashboard","offers","users","business","requests",
    "feedback","payouts","withdrawals","invoices","settings",
    "wallet","earnings","sub_admins",
  ];
  const perms: any = {};
  features.forEach((f) => { perms[f] = { view: false, edit: false }; });
  return perms;
}

// ============================================================
//  SUPER ADMIN ENDPOINTS
// ============================================================

// POST /admin/sub-admins/create
export const createSubAdmin = async (req: Request | any, res: Response): Promise<void> => {
  try {
    const { name, email, phone, subAdminRole, permissions } = req.body;
    if (!name || !email) { resStatus(res, "false", "Name and email are required."); return; }
    if (!isValidEmail(email)) { resStatus(res, "false", "Invalid email format."); return; }
    const existing = await UserModel.findOne({ email: email.toLowerCase() });
    if (existing) { resStatus(res, "false", "A user with this email already exists."); return; }
    const mergedPermissions = { ...defaultPermissions(), ...(permissions || {}) };
    const rawPassword = generateRandomPassword(12);
    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    const subAdmin = await UserModel.create({
      name, email: email.toLowerCase(), password: hashedPassword,
      number: phone || "", userType: "sub_admin",
      subAdminRole: subAdminRole || "Support",
      isActive: true, permissions: mergedPermissions,
    });
    sendSubAdminCredentialsEmail(email.toLowerCase(), name, rawPassword).catch((err) => {
      console.error("[SubAdmin] Email send failed:", err.message);
    });
    resStatusData(res, "success", "Sub-admin created. Credentials sent via email.", {
      _id: subAdmin._id, name: subAdmin.name, email: subAdmin.email,
      number: subAdmin.number, subAdminRole: subAdmin.subAdminRole,
      isActive: subAdmin.isActive, permissions: subAdmin.permissions,
      createdAt: (subAdmin as any).createdAt,
    });
  } catch (error: any) {
    console.error("[SubAdmin] createSubAdmin error:", error);
    resStatus(res, "false", "Something went wrong.");
  }
};

// GET /admin/sub-admins
export const getAllSubAdmins = async (req: Request | any, res: Response): Promise<void> => {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const query: any = { userType: "sub_admin", isDeleted: { $ne: true } };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { subAdminRole: { $regex: search, $options: "i" } },
      ];
    }
    const [subAdmins, total] = await Promise.all([
      UserModel.find(query)
        .select("name email number subAdminRole isActive permissions createdAt")
        .sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      UserModel.countDocuments(query),
    ]);
    resStatusData(res, "success", "Sub-admins fetched successfully.", {
      subAdmins,
      pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (error: any) {
    console.error("[SubAdmin] getAllSubAdmins error:", error);
    resStatus(res, "false", "Something went wrong.");
  }
};

// GET /admin/sub-admins/:id
export const getSubAdminById = async (req: Request | any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const subAdmin = await UserModel.findOne({ _id: id, userType: "sub_admin", isDeleted: { $ne: true } })
      .select("name email number subAdminRole isActive permissions createdAt");
    if (!subAdmin) { resStatus(res, "false", "Sub-admin not found."); return; }
    resStatusData(res, "success", "Sub-admin fetched successfully.", subAdmin);
  } catch (error: any) {
    console.error("[SubAdmin] getSubAdminById error:", error);
    resStatus(res, "false", "Something went wrong.");
  }
};

// PUT /admin/sub-admins/:id
export const updateSubAdmin = async (req: Request | any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, phone, subAdminRole, permissions, isActive } = req.body;
    const subAdmin = await UserModel.findOne({ _id: id, userType: "sub_admin", isDeleted: { $ne: true } });
    if (!subAdmin) { resStatus(res, "false", "Sub-admin not found."); return; }
    if (name !== undefined) subAdmin.name = name;
    if (phone !== undefined) subAdmin.number = phone;
    if (subAdminRole !== undefined) subAdmin.subAdminRole = subAdminRole;
    if (isActive !== undefined) subAdmin.isActive = isActive;
    if (permissions !== undefined) subAdmin.permissions = { ...defaultPermissions(), ...permissions };
    await subAdmin.save();
    resStatusData(res, "success", "Sub-admin updated successfully.", {
      _id: subAdmin._id, name: subAdmin.name, email: subAdmin.email,
      number: subAdmin.number, subAdminRole: subAdmin.subAdminRole,
      isActive: subAdmin.isActive, permissions: subAdmin.permissions,
    });
  } catch (error: any) {
    console.error("[SubAdmin] updateSubAdmin error:", error);
    resStatus(res, "false", "Something went wrong.");
  }
};

// DELETE /admin/sub-admins/:id
export const deleteSubAdmin = async (req: Request | any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const subAdmin = await UserModel.findOne({ _id: id, userType: "sub_admin" });
    if (!subAdmin) { resStatus(res, "false", "Sub-admin not found."); return; }
    subAdmin.isDeleted = true;
    await subAdmin.save();
    resStatus(res, "success", "Sub-admin deleted successfully.");
  } catch (error: any) {
    console.error("[SubAdmin] deleteSubAdmin error:", error);
    resStatus(res, "false", "Something went wrong.");
  }
};

// PATCH /admin/sub-admins/:id/toggle-status
export const toggleSubAdminStatus = async (req: Request | any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const subAdmin = await UserModel.findOne({ _id: id, userType: "sub_admin", isDeleted: { $ne: true } });
    if (!subAdmin) { resStatus(res, "false", "Sub-admin not found."); return; }
    subAdmin.isActive = !subAdmin.isActive;
    await subAdmin.save();
    resStatusData(res, "success",
      `Sub-admin has been ${subAdmin.isActive ? "activated" : "deactivated"} successfully.`,
      { isActive: subAdmin.isActive }
    );
  } catch (error: any) {
    console.error("[SubAdmin] toggleSubAdminStatus error:", error);
    resStatus(res, "false", "Something went wrong.");
  }
};

// ============================================================
//  SUB-ADMIN SELF-SERVICE ENDPOINTS
// ============================================================

// GET /sub-admin/profile
export const getSubAdminProfile = async (req: Request | any, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    const subAdmin = await UserModel.findById(userId)
      .select("name email number subAdminRole isActive permissions createdAt");
    if (!subAdmin) { resStatus(res, "false", "Profile not found."); return; }
    resStatusData(res, "success", "Profile fetched successfully.", subAdmin);
  } catch (error: any) {
    console.error("[SubAdmin] getSubAdminProfile error:", error);
    resStatus(res, "false", "Something went wrong.");
  }
};

// PUT /sub-admin/profile
export const updateSubAdminProfile = async (req: Request | any, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    const { name, phone } = req.body;
    const subAdmin = await UserModel.findById(userId);
    if (!subAdmin) { resStatus(res, "false", "Profile not found."); return; }
    if (name !== undefined) subAdmin.name = name;
    if (phone !== undefined) subAdmin.number = phone;
    await subAdmin.save();
    resStatusData(res, "success", "Profile updated successfully.", {
      _id: subAdmin._id, name: subAdmin.name, email: subAdmin.email,
      number: subAdmin.number, subAdminRole: subAdmin.subAdminRole,
    });
  } catch (error: any) {
    console.error("[SubAdmin] updateSubAdminProfile error:", error);
    resStatus(res, "false", "Something went wrong.");
  }
};

// PUT /sub-admin/change-password
export const updateSubAdminPassword = async (req: Request | any, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      resStatus(res, "false", "Current password and new password are required."); return;
    }
    if (newPassword.length < 8) {
      resStatus(res, "false", "New password must be at least 8 characters."); return;
    }
    const subAdmin = await UserModel.findById(userId);
    if (!subAdmin) { resStatus(res, "false", "User not found."); return; }
    const isMatch = await bcrypt.compare(currentPassword, subAdmin.password);
    if (!isMatch) { resStatus(res, "false", "Current password is incorrect."); return; }
    subAdmin.password = await bcrypt.hash(newPassword, 10);
    subAdmin.passwordChangedAt = new Date();
    await subAdmin.save();
    resStatus(res, "success", "Password changed successfully. Please log in again.");
  } catch (error: any) {
    console.error("[SubAdmin] updateSubAdminPassword error:", error);
    resStatus(res, "false", "Something went wrong.");
  }
};
