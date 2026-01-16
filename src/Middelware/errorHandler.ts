import { Request, Response, NextFunction } from "express";
import { responsestatusmessage } from "../Responses/Response";
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  
  // if (res.headersSent) {
  //   return next(err); 
  // }
  console.error(`[${new Date().toISOString()}] Error in ${req.method} ${req.url}`);
  console.error("Global error: " + err.message);
  responsestatusmessage(res, "fail", err.message);  
  next();
};
