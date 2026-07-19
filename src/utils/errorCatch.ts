import { Request, Response, NextFunction } from "express";
import jwt from 'jsonwebtoken';
import nodemailer from "nodemailer";
import mongoose from "mongoose";
import dotenv from "dotenv";
import UserModel from "../Models/UserModel";
import mg from "nodemailer-mailgun-transport";
dotenv.config();
const auth = {
  auth: {
    api_key: process.env.MAILGUN_API_KEY as string,
    domain: process.env.MAILGUN_DOMAIN as string,
  },
};

const transporter = nodemailer.createTransport(mg(auth));

export const sendBookingEmailMailgun = async (
  to: string,
  offerName: string,
  selected_date: string,
  selected_time: string,
  username: string
) => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `LynkUp's New Booking for: ${offerName}`,
    html: `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px; }
            .container { background: white; padding: 20px; border-radius: 8px; max-width: 600px; margin: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .header { font-size: 20px; margin-bottom: 20px; }
            .details { margin: 10px 0; }
            .footer { margin-top: 20px; font-size: 0.9em; color: #888; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"> LynkUp's New Booking </div>
            <p>Hello,</p>
            <p>You have received a new booking for your offer <strong>${offerName}</strong>.</p>
            <div class="details">
              <p><strong>Booked by:</strong> ${username}</p>
              <p><strong>Date:</strong> ${selected_date}</p>
              <p><strong>Time:</strong> ${selected_time}</p>
            </div>
            <a href ="https://admin.lynkup.co.in"><p>Head over to your dashboard to review and accept (or reject) the offer.</p></a>
            <div class="footer">LynkUp</div>
          </div>
        </body>
      </html>
    `,
  });
};
export const sendBookingCancellationEmailMailgun = async (
  to: string,
  offerName: string,
  username: string,
  reason: string
) => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `LynkUp's Booking Cancelled: ${offerName}`,
    html: `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px; }
            .container { background: white; padding: 20px; border-radius: 8px; max-width: 600px; margin: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .header { font-size: 20px; margin-bottom: 20px; color: #d9534f; }
            .details { margin: 10px 0; }
            .footer { margin-top: 20px; font-size: 0.9em; color: #888; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"> LynkUp's Booking Cancelled</div>
            <p>Hello,</p>
            <p>The booking has been <strong>cancelled</strong> by the Creator:</p>
            <div class="details">
              <p><strong>Offer:</strong> ${offerName}</p>
              <p><strong>Booked by:</strong> ${username}</p>
              <p><strong>Reason:</strong> ${reason}</p>
            </div>
            <div class="footer">LynkUp</div>
          </div>
        </body>
      </html>
    `,
  });
};
export const sendBookingCompleteEmailMailgun = async (
  to: string,
  offerName: string,
  username: string,
  reason: string
) => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `LynkUp's Booking Completed: ${offerName}`,
    html: `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px; }
            .container { background: white; padding: 20px; border-radius: 8px; max-width: 600px; margin: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .header { font-size: 20px; margin-bottom: 20px; color: #d9534f; }
            .details { margin: 10px 0; }
            .footer { margin-top: 20px; font-size: 0.9em; color: #888; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"> LynkUp's Booking Completed</div>
            <p>Hello,</p>
            <p>The booking has been <strong>completed</strong> by the Creator:</p>
            <div class="details">
              <p><strong>Offer:</strong> ${offerName}</p>
              <p><strong>Booked by:</strong> ${username}</p>
              <p><strong>Reason:</strong> ${reason}</p>
            </div>
            <div class="footer">LynkUp</div>
          </div>
        </body>
      </html>
    `,
  });
};

export const sendProfileVerifiedEmail = async (
  to: string,
  username: string
) => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `LynkUp Profile Verified`,
    html: `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px; }
            .container { background: white; padding: 20px; border-radius: 8px; max-width: 600px; margin: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .header { font-size: 20px; margin-bottom: 20px; color: #5cb85c; }
            .footer { margin-top: 20px; font-size: 0.9em; color: #888; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">Your Profile Has Been Verified!</div>
            <p>Hi <strong>${username}</strong>,</p>
            <p>We're happy to inform you that your profile has been successfully <strong>verified</strong> on LynkUp.</p>
            <p>You can now enjoy full access to all creator features!</p>
            <div class="footer">— The LynkUp Team</div>
          </div>
        </body>
      </html>
    `,
  });
};


export const errCatch = (fn: any) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error("Global Error Handler:", err);
    next(err);
  });
  export const generateToken = (id:mongoose.Types.ObjectId) => {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined in the environment variables.');
    }
    const Authorization = jwt.sign({ id }, process.env.JWT_SECRET);
    return Authorization;
  };
  export function genToken(id: mongoose.Types.ObjectId) {
    return jwt.sign({ id }, process.env.JWT_SECRET || "JWT_SECRET");
  }
  
  // export function genToken(id: mongoose.Types.ObjectId) {
  //   return jwt.sign({ id }, process.env.JWT_SECRET||"JWT_SECRET", { expiresIn: "1w" });
  // }
  export const sendOtpOnMail = async (email: string, otp: string) => {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    }); 
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "Your OTP for Verification",
      html: `<p>Hi,</p><p>Your OTP is: <strong>${otp}</strong></p><p>It is valid for 3 minutes.</p>`,
    });
  };
export const sendOtpOnMailMailgun = async (email: string, otp: string) => {
  // Skip actual email sending if Mailgun not configured
  if (!process.env.MAILGUN_API_KEY || process.env.MAILGUN_API_KEY.includes('1234567890')) {
    console.error(`[Email] Mailgun not configured - OTP for ${email}: ${otp}`);
    return;
  }
  
  const auth = {
    auth: {
      api_key: process.env.MAILGUN_API_KEY as string,
      domain: process.env.MAILGUN_DOMAIN as string,
    },
  };

  const transporter = nodemailer.createTransport(mg(auth));

  await transporter.sendMail({
    from: process.env.EMAIL_FROM, 
    to: email,
    subject: "Your OTP for Email Verification",
    html: `
     <html>
             <head>
               <style>
                 body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
                 .container { max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9; }
                 .header { text-align: center; margin-bottom: 20px; }
                 .content { text-align: center; }
                 .footer { text-align: center; margin-top: 20px; font-size: 0.9em; color: #888; }
               </style>
             </head>
             <body>
               <div class="container">
                 <div class="header">
                   <h2>Email OTP Verification</h2>
                 </div>
                 <div class="content">
                   <p>Your OTP is: <strong>${otp}</strong></p>
                 </div>
                 <div class="footer">
                   <p>If you did not request this OTP, please ignore this email.</p>
                 </div>
               </div>
             </body>
           </html>
    `,
  });
};

  export const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();
  export const isValidEmail = (email: string): boolean => {
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(email);
  };
  export const giveStrike = async(userId: string)=> {
    const MAX_STRIKES = 3;
      const user = await UserModel.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }
      user.strikeCount = (user.strikeCount || 0) + 1;
      if (user.strikeCount >= MAX_STRIKES) {
        user.blocked = true;
      }
      await user.save();
      return {
        success: true,
        message: user.blocked
          ? "User has been blocked due to excessive strikes."
          : `User has received a strike. Total strikes: ${user.strikeCount}`,
      }
  }

export const sendSubAdminCredentialsEmail = async (
  to: string,
  name: string,
  password: string,
  loginUrl: string = "https://admin.lynkup.co.in"
) => {
  if (!process.env.MAILGUN_API_KEY || process.env.MAILGUN_API_KEY.includes('1234567890')) {
    console.error(`[Email] Mailgun not configured — Sub-admin credentials for ${to}: password=${password}`);
    return;
  }

  const mailAuth = {
    auth: {
      api_key: process.env.MAILGUN_API_KEY as string,
      domain: process.env.MAILGUN_DOMAIN as string,
    },
  };

  const mg2 = require("nodemailer-mailgun-transport");
  const mailTransporter = nodemailer.createTransport(mg2(mailAuth));

  await mailTransporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `Welcome to LynkUp Admin Panel — Your Login Credentials`,
    html: `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 20px; }
            .container { background: white; padding: 30px; border-radius: 10px; max-width: 600px; margin: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
            .header { font-size: 22px; font-weight: bold; color: #1a1a2e; margin-bottom: 8px; }
            .subtitle { color: #555; margin-bottom: 24px; }
            .creds-box { background: #f0f4ff; border-left: 4px solid #4f46e5; padding: 16px 20px; border-radius: 6px; margin: 20px 0; }
            .creds-row { margin: 8px 0; font-size: 15px; }
            .label { color: #888; font-size: 13px; margin-bottom: 2px; }
            .value { font-weight: bold; color: #1a1a2e; font-size: 16px; letter-spacing: 0.5px; }
            .btn { display: inline-block; background: #4f46e5; color: white !important; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 24px; }
            .warning { background: #fff8e1; border: 1px solid #ffe082; border-radius: 6px; padding: 12px 16px; margin-top: 20px; font-size: 13px; color: #856404; }
            .footer { margin-top: 30px; font-size: 12px; color: #aaa; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">Welcome to LynkUp Admin Panel! 🎉</div>
            <div class="subtitle">Hi <strong>${name}</strong>, an admin account has been created for you.</div>

            <div class="creds-box">
              <div class="creds-row">
                <div class="label">Email Address</div>
                <div class="value">${to}</div>
              </div>
              <div class="creds-row" style="margin-top:14px">
                <div class="label">Temporary Password</div>
                <div class="value">${password}</div>
              </div>
            </div>

            <a href="${loginUrl}" class="btn">Login to Dashboard →</a>

            <div class="warning">
              ⚠️ Please change your password immediately after your first login for security reasons.
            </div>

            <div class="footer">— The LynkUp Team | If you did not expect this email, please ignore it.</div>
          </div>
        </body>
      </html>
    `,
  });
};
