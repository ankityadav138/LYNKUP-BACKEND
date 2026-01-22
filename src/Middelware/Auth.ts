import { NextFunction, Request, Response } from "express";
import jwt from 'jsonwebtoken';
import { resStatus } from "../Responses/Response";
import dotenv from "dotenv";
dotenv.config();
import UserModel from "../Models/UserModel";

// Admin middleware
export const adminMiddleware = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const authHeader = req.header("Authorization");
    console.log("Auth Header:", authHeader);
    if (!authHeader) return resStatus(res, "false", "Token not found");
    
    // Extract token by removing "Bearer " prefix
    const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;

    jwt.verify(token, process.env.JWT_SECRET || "JWT_SECRET", async (err: any, decoded: any) => {
      if (err) {
        if (err.name === "TokenExpiredError") {
          return resStatus(res, "false", "Session expired. Please log in again.");
        } else {
          return resStatus(res, "false", "Invalid token.");
        }
      }

      const userId = decoded.id;
      if (typeof userId !== "string" || userId.length !== 24) {
        return resStatus(res, "false", "Invalid user ID format.");
      }

      const user = await UserModel.findById(userId).select("passwordChangedAt userType"); // or add fields you need;
      if (!user) {
        return resStatus(res, "false", "Admin not found.");
      }

      if (user.userType !== "admin") {
        return resStatus(res, "false", "Access denied. Admin only.");
      }

      if (user.passwordChangedAt) {
        const passwordChangedAt = new Date(user.passwordChangedAt).getTime();
        const tokenIssuedAt = decoded.iat * 1000;
        if (tokenIssuedAt < passwordChangedAt) {
          return resStatus(res, "false", "Session expired due to password change. Please log in again.");
        }
      }

      req.user = user;
      next();
    });
  } catch (error) {
    resStatus(res, "false", "Something went wrong.");
  }
};

// Business middleware
export const businessMiddleware = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const authHeader = req.header("Authorization");
    if (!authHeader) return resStatus(res, "false", "Token not found");
    
    // Extract token by removing "Bearer " prefix
    const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;

    jwt.verify(token, process.env.JWT_SECRET || "JWT_SECRET", async (err: any, decoded: any) => {
      if (err) {
        if (err.name === "TokenExpiredError") {
          return resStatus(res, "false", "Session expired. Please log in again.");
        } else {
          return resStatus(res, "false", "Invalid token.");
        }
      }

      const userId = decoded.id;
      if (typeof userId !== "string" || userId.length !== 24) {
        return resStatus(res, "false", "Invalid user ID format.");
      }

      const user = await UserModel.findById(userId).select("passwordChangedAt userType"); 
      if (!user) {
        return resStatus(res, "false", "User not found.");
      }

      if (user.userType !== "admin" && user.userType !== "business") {
        return resStatus(res, "false", "Access denied. Admin and businesses only.");
      }

      if (user.passwordChangedAt) {
        const passwordChangedAt = new Date(user.passwordChangedAt).getTime();
        const tokenIssuedAt = decoded.iat * 1000;
        if (tokenIssuedAt < passwordChangedAt) {
          return resStatus(res, "false", "Session expired due to password change. Please log in again.");
        }
      }

      req.user = user;
      next();
    });
  } catch (error) {
    resStatus(res, "false", "Something went wrong.");
  }
};

// General auth middleware (for any authenticated user - users, admins, businesses)
export const authMiddleware = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.header("Authorization");
    if (!authHeader) {
      return resStatus(res, "false", "Token not found") as any;
    }
    
    // Extract token by removing "Bearer " prefix
    const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;

    jwt.verify(token, process.env.JWT_SECRET || "JWT_SECRET", async (err: any, decoded: any) => {
      if (err) {
        if (err.name === "TokenExpiredError") {
          return resStatus(res, "false", "Session expired. Please log in again.") as any;
        } else {
          return resStatus(res, "false", "Invalid token.") as any;
        }
      }

      const userId = decoded.id;
      if (typeof userId !== "string" || userId.length !== 24) {
        return resStatus(res, "false", "Invalid user ID format.") as any;
      }

      const user = await UserModel.findById(userId).select("-otp -__v");
      if (!user) {
        return resStatus(res, "false", "User not found.") as any;
      }

      req.user = user;
      req.userId = userId;
      next();
    });
  } catch (error) {
    resStatus(res, "false", "Something went wrong.");
  }
};

// Middleware for Users
export const userMiddleware = async (
  req: Request | any,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const authHeader = req.header("Authorization");
    console.log("Auth Header:", authHeader);
    if (!authHeader) {
       resStatus(res, "false", "Token not found");
    } else {
    // Extract token by removing "Bearer " prefix
    const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;
    jwt.verify(token, process.env.JWT_SECRET || "JWT_SECRET", async (err: any, decoded: any) => {
      if (err) {
        if (err.name === "TokenExpiredError") {
           resStatus(res, "false", "Session expired. Please log in again.");
        }else{
         resStatus(res, "false", "Invalid token.");
      }}else{
        console.log("Decoded",decoded)
      const userId = decoded.id;
      if (typeof userId !== "string" || userId.length !== 24) {
         resStatus(res, "false", "Invalid user ID format.");
      }
      else{
      const user = await UserModel.findById(userId).select("-otp -__v");
      if (!user) {
         resStatus(res, "false", "User not found.");
      } else if (user.userType !== "user") {
         resStatus(res, "false", "Access denied. User only.");
      }else if (user.blocked ){
          resStatus(res, "false", "Access denied. User is blocked.");
       }else{
      req.user = user;
            next();
       }
    }}});
  }
  } catch (error) {
    resStatus(res, "false", "Something went wrong.");
  }
};
