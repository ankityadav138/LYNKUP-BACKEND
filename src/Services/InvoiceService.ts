import nodemailer from "nodemailer";
import { format, addDays } from "date-fns";
import mg from "nodemailer-mailgun-transport";
import PDFDocument from "pdfkit";
import pdfMake from "pdfmake/build/pdfmake";
import * as fs from "fs";
import * as path from "path";

// Setup fonts for pdfmake
try {
  const pdfFonts = require("pdfmake/build/vfs_fonts");
  (pdfMake as any).vfs = pdfFonts.pdfMake.vfs;
} catch (error) {
  console.warn("Warning: pdfmake fonts not loaded, using default fonts");
}

interface InvoiceDetails {
  invoiceId: string;
  userName: string;
  userEmail: string;
  subscriptionId: string;
  planName: string;
  tier: string;
  amount: number;
  currency: string;
  startDate: Date;
  endDate: Date;
  duration: number;
  discount: number;
  features: string[];
  company: string;
  adminEmail?: string;
}

interface WalletInvoiceDetails {
  transactionId: string;
  userName: string;
  userEmail: string;
  amount: number;
  currentBalance: number;
  paymentMethod: string;
  razorpayPaymentId?: string;
  company: string;
}

/**
 * InvoiceService - Handles invoice generation and email delivery
 */
export class InvoiceService {
  private transporter: any;
  private mailgunDomain: string;
  private mailgunApiKey: string;
  private emailFrom: string;

  constructor() {
    // Initialize Mailgun transporter
    this.mailgunDomain = process.env.MAILGUN_DOMAIN || "sandbox.mailgun.org";
    this.mailgunApiKey = process.env.MAILGUN_API_KEY || "";
    this.emailFrom = process.env.EMAIL_FROM || "noreply@lynkup.com";

    // Only initialize transporter if valid credentials are provided
    if (this.mailgunApiKey && this.mailgunApiKey !== "key-1234567890abcdef...") {
      // Use Mailgun API transport (same as OTP emails)
      const auth = {
        auth: {
          api_key: this.mailgunApiKey,
          domain: this.mailgunDomain,
        },
      };
      this.transporter = nodemailer.createTransport(mg(auth));
      console.log("[Invoice Service] Mailgun transporter initialized successfully");
    } else {
      console.log("[Invoice Service] Email transporter not configured - emails will be skipped");
      this.transporter = null;
    }
  }

  /**
   * Generate subscription invoice PDF
   */
  private async generateSubscriptionPDF(details: InvoiceDetails): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: true });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const BLUE = '#667eea';
        const invoiceDate = format(new Date(), "dd MMM yyyy");
        const expiryDate = format(details.endDate, "dd MMM yyyy");
        const originalPrice = Math.round((details.amount / (100 - details.discount)) * 100);
        const discountAmount = originalPrice - details.amount;

        // Header
        doc.rect(0, 0, doc.page.width, 120).fill(BLUE);
        doc.fontSize(28).fillColor('#ffffff').font('Helvetica-Bold')
           .text(details.company.toUpperCase(), 50, 40, { lineBreak: false });
        doc.fontSize(12).fillColor('#ffffff').font('Helvetica')
           .text('SUBSCRIPTION INVOICE', 50, 75, { lineBreak: false });
        doc.fontSize(10).fillColor('#ffffff')
           .text(`Invoice #${details.invoiceId}`, 400, 50, { align: 'right', lineBreak: false })
           .text(invoiceDate, 400, 70, { align: 'right', lineBreak: false });

        let yPos = 148;

        // Bill From (left) / Bill To (right)
        doc.fontSize(9).font('Helvetica-Bold').fillColor(BLUE)
           .text('BILL FROM', 50, yPos, { lineBreak: false });
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#333333')
           .text('ROSE INFLUENCER MARKETING LLP', 50, yPos + 14, { lineBreak: false });
        doc.fontSize(9).font('Helvetica').fillColor('#666666')
           .text('GST Reg No: 06ABKFR6483P1Z9', 50, yPos + 29, { lineBreak: false });

        doc.fontSize(9).font('Helvetica-Bold').fillColor(BLUE)
           .text('BILL TO', 320, yPos, { lineBreak: false });
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#333333')
           .text(details.userName, 320, yPos + 14, { lineBreak: false });
        doc.fontSize(9).font('Helvetica').fillColor('#666666')
           .text(details.userEmail, 320, yPos + 29, { lineBreak: false, width: 220 });

        yPos += 50;
        doc.moveTo(50, yPos).lineTo(545, yPos).stroke('#e0e0e0');
        yPos += 12;

        // Plan Details Box
        doc.roundedRect(50, yPos, 495, 80, 5).fillAndStroke('#f8f9fa', BLUE);
        doc.fontSize(15).font('Helvetica-Bold').fillColor('#333333')
           .text(`${details.planName} Subscription`, 70, yPos + 15, { lineBreak: false });
        doc.fontSize(9).font('Helvetica').fillColor('#666666')
           .text(`Tier: ${details.tier.toUpperCase()}`, 70, yPos + 38, { lineBreak: false })
           .text(`Duration: ${details.duration} month(s)`, 220, yPos + 38, { lineBreak: false })
           .text(`Valid Until: ${expiryDate}`, 390, yPos + 38, { lineBreak: false });
        doc.fontSize(9).font('Helvetica').fillColor('#555555')
           .text(`Start: ${format(details.startDate, "dd MMM yyyy")}`, 70, yPos + 55, { lineBreak: false })
           .text(`Discount: ${details.discount}%`, 220, yPos + 55, { lineBreak: false });
        yPos += 95;

        // Pricing table header
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333')
           .text('Description', 50, yPos, { lineBreak: false })
           .text('Amount', 450, yPos, { align: 'right', width: 95, lineBreak: false });
        yPos += 5;
        doc.moveTo(50, yPos).lineTo(545, yPos).stroke('#e0e0e0');
        yPos += 14;

        // Line items
        doc.fontSize(9).font('Helvetica').fillColor('#666666')
           .text(`${details.planName} - ${details.tier} (${details.duration} month${details.duration > 1 ? 's' : ''})`, 50, yPos, { lineBreak: false })
           .text(`Rs.${originalPrice.toLocaleString('en-IN')}`, 450, yPos, { align: 'right', width: 95, lineBreak: false });
        yPos += 20;
        doc.text(`Discount (${details.discount}%)`, 50, yPos, { lineBreak: false })
           .text(`-Rs.${discountAmount.toLocaleString('en-IN')}`, 450, yPos, { align: 'right', width: 95, lineBreak: false });
        yPos += 5;
        doc.moveTo(50, yPos).lineTo(545, yPos).stroke('#e0e0e0');
        yPos += 12;

        // Total row
        doc.rect(50, yPos - 5, 495, 30).fill('#f8f9fa');
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#333333')
           .text('Total Amount', 50, yPos + 3, { lineBreak: false })
           .text(`Rs.${details.amount.toLocaleString('en-IN')}`, 450, yPos + 3, { align: 'right', width: 95, lineBreak: false });
        yPos += 38;

        // Features (capped at 8 to prevent overflow)
        const maxFeatures = 8;
        const featuresToShow = details.features.slice(0, maxFeatures);
        doc.fontSize(10).font('Helvetica-Bold').fillColor(BLUE)
           .text('INCLUDED FEATURES', 50, yPos, { lineBreak: false });
        yPos += 18;
        doc.fontSize(9).font('Helvetica').fillColor('#555555');
        featuresToShow.forEach((feature) => {
          doc.circle(58, yPos + 4, 2).fill(BLUE);
          doc.text(feature, 68, yPos, { lineBreak: false });
          yPos += 16;
        });
        if (details.features.length > maxFeatures) {
          doc.text(`...and ${details.features.length - maxFeatures} more features`, 68, yPos, { lineBreak: false });
          yPos += 16;
        }

        // Footer — relative to content, not page height
        yPos += 18;
        doc.moveTo(50, yPos).lineTo(545, yPos).stroke('#e0e0e0');
        doc.fontSize(8).font('Helvetica').fillColor('#999999')
           .text('Thank you for your subscription!', 50, yPos + 12, { align: 'center', width: 495, lineBreak: false })
           .text('This is an automated invoice. Please keep it for your records.', 50, yPos + 26, { align: 'center', width: 495, lineBreak: false })
           .text(`Generated on ${invoiceDate}`, 50, yPos + 40, { align: 'center', width: 495, lineBreak: false });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate wallet credit invoice PDF
   */
  private async generateWalletPDF(details: WalletInvoiceDetails): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: true });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const PURPLE = '#6C63FF';
        const invoiceDate = format(new Date(), "dd MMM yyyy, hh:mm a");

        // Truncate long IDs to prevent line wrapping (which triggers new pages)
        const shortTxnId = details.transactionId.length > 42
          ? details.transactionId.slice(0, 40) + '..'
          : details.transactionId;
        const shortPayId = details.razorpayPaymentId
          ? (details.razorpayPaymentId.length > 42
            ? details.razorpayPaymentId.slice(0, 40) + '..'
            : details.razorpayPaymentId)
          : null;

        // Header
        doc.rect(0, 0, doc.page.width, 100).fill(PURPLE);
        doc.fontSize(26).fillColor('#ffffff').font('Helvetica-Bold')
           .text('PAYMENT RECEIPT', 50, 28, { align: 'center', width: 495, lineBreak: false });
        doc.fontSize(12).fillColor('#e8e6ff').font('Helvetica')
           .text('Wallet Recharged Successfully', 50, 63, { align: 'center', width: 495, lineBreak: false });

        let yPos = 125;

        // Bill From (left) / Bill To (right)
        doc.fontSize(9).font('Helvetica-Bold').fillColor(PURPLE)
           .text('BILL FROM', 50, yPos, { lineBreak: false });
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#333333')
           .text('ROSE INFLUENCER MARKETING LLP', 50, yPos + 14, { lineBreak: false });
        doc.fontSize(9).font('Helvetica').fillColor('#666666')
           .text('GST Reg No: 06ABKFR6483P1Z9', 50, yPos + 29, { lineBreak: false });

        doc.fontSize(9).font('Helvetica-Bold').fillColor(PURPLE)
           .text('BILL TO', 320, yPos, { lineBreak: false });
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#333333')
           .text(details.userName, 320, yPos + 14, { lineBreak: false });
        doc.fontSize(9).font('Helvetica').fillColor('#666666')
           .text(details.userEmail, 320, yPos + 29, { lineBreak: false, width: 220 });

        yPos += 55;
        doc.moveTo(50, yPos).lineTo(545, yPos).stroke('#e0e0e0');
        yPos += 12;

        // Amount badge
        doc.roundedRect(50, yPos, 495, 44, 5).fill('#eeecff');
        doc.fontSize(14).font('Helvetica-Bold').fillColor(PURPLE)
           .text(`Rs.${details.amount.toLocaleString('en-IN')} Added to Your Wallet`, 50, yPos + 14, { align: 'center', width: 495, lineBreak: false });
        yPos += 58;

        // Transaction details
        doc.fontSize(9).font('Helvetica-Bold').fillColor(PURPLE)
           .text('TRANSACTION DETAILS', 50, yPos, { lineBreak: false });
        yPos += 14;

        const rows: [string, string][] = [
          ['Transaction Date:', invoiceDate],
          ['Transaction ID:', shortTxnId],
          ...(shortPayId ? [['Payment ID:', shortPayId] as [string, string]] : []),
          ['Payment Method:', details.paymentMethod],
        ];

        const boxHeight = rows.length * 23 + 18;
        doc.roundedRect(50, yPos, 495, boxHeight, 4).fillAndStroke('#f8f9fa', '#dee2e6');
        yPos += 12;

        rows.forEach(([label, value]) => {
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#495057')
             .text(label, 65, yPos, { lineBreak: false });
          doc.fontSize(9).font('Helvetica').fillColor('#212529')
             .text(value, 260, yPos, { lineBreak: false });
          yPos += 23;
        });

        yPos += 8;

        // Amount credited
        doc.moveTo(50, yPos).lineTo(545, yPos).stroke(PURPLE);
        yPos += 12;
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#495057')
           .text('Amount Credited:', 50, yPos, { lineBreak: false });
        doc.fontSize(16).font('Helvetica-Bold').fillColor(PURPLE)
           .text(`Rs.${details.amount.toLocaleString('en-IN')}`, 300, yPos - 2, { lineBreak: false });

        // New balance box
        yPos += 35;
        doc.roundedRect(50, yPos, 495, 44, 5).fill('#eeecff');
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#333333')
           .text('New Wallet Balance:', 65, yPos + 14, { lineBreak: false });
        doc.fontSize(15).font('Helvetica-Bold').fillColor(PURPLE)
           .text(`Rs.${details.currentBalance.toLocaleString('en-IN')}`, 300, yPos + 12, { lineBreak: false });

        // Notes
        yPos += 58;
        doc.fontSize(9).font('Helvetica').fillColor('#666666');
        [
          '- Your wallet is ready to use',
          '- You can now create offers (minimum Rs.20,000 per offer)',
          '- View transaction history in your dashboard',
        ].forEach(note => {
          doc.text(note, 50, yPos, { lineBreak: false });
          yPos += 16;
        });

        // Footer — relative to content, not page height
        yPos += 20;
        doc.moveTo(50, yPos).lineTo(545, yPos).stroke('#e0e0e0');
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333')
           .text(`Thank you for choosing ${details.company}`, 50, yPos + 12, { align: 'center', width: 495, lineBreak: false });
        doc.fontSize(8).font('Helvetica').fillColor('#999999')
           .text('This is an automated receipt. Please do not reply to this message.', 50, yPos + 28, { align: 'center', width: 495, lineBreak: false });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate invoice HTML template
   */
  private generateInvoiceHTML(details: InvoiceDetails): string {
    const invoiceDate = format(new Date(), "dd MMM yyyy");
    const expiryDate = format(details.endDate, "dd MMM yyyy");
    const formattedAmount = `₹${details.amount.toLocaleString("en-IN")}`;
    const discountAmount = Math.round((details.amount * details.discount) / 100);
    const originalPrice = Math.round(
      (details.amount / (100 - details.discount)) * 100
    );

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscription Invoice</title>
  <style>
    body { margin:0; padding:0; background-color:#f4f6f9; }
    @media only screen and (max-width:600px) {
      .bill-td { display:block !important; width:100% !important; border-right:none !important; border-bottom:1px solid #dde3ff !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f9;">
  <tr><td align="center" style="padding:30px 15px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10);">

      <!-- HEADER -->
      <tr>
        <td align="center" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:36px 30px 28px;">
          <p style="margin:0 0 6px 0;font-size:12px;color:#d4d0ff;letter-spacing:2px;font-weight:700;text-transform:uppercase;">Subscription Invoice</p>
          <h1 style="margin:0;font-size:26px;color:#ffffff;font-weight:700;line-height:1.3;">Invoice #${details.invoiceId}</h1>
          <p style="margin:10px 0 0 0;font-size:13px;color:#c4beff;">${invoiceDate}</p>
        </td>
      </tr>

      <!-- BILL FROM / BILL TO -->
      <tr>
        <td style="padding:24px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #dde3ff;border-radius:8px;overflow:hidden;">
            <tr>
              <td class="bill-td" width="50%" valign="top" style="padding:16px 18px;border-right:1px solid #dde3ff;background-color:#f7f6ff;">
                <p style="margin:0 0 6px 0;font-size:10px;font-weight:700;color:#667eea;letter-spacing:2px;text-transform:uppercase;">Bill From</p>
                <p style="margin:0 0 3px 0;font-size:14px;font-weight:700;color:#222222;">ROSE INFLUENCER MARKETING LLP</p>
                <p style="margin:0;font-size:12px;color:#666666;">GST Registration No: <strong>06ABKFR6483P1Z9</strong></p>
              </td>
              <td class="bill-td" width="50%" valign="top" style="padding:16px 18px;background-color:#f7f6ff;">
                <p style="margin:0 0 6px 0;font-size:10px;font-weight:700;color:#667eea;letter-spacing:2px;text-transform:uppercase;">Bill To</p>
                <p style="margin:0 0 3px 0;font-size:14px;font-weight:700;color:#222222;">${details.userName}</p>
                <p style="margin:0;font-size:12px;color:#666666;">${details.userEmail}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- PLAN DETAILS -->
      <tr>
        <td style="padding:22px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8f9fa;border-left:4px solid #667eea;border-radius:0 8px 8px 0;padding:0;">
            <tr>
              <td style="padding:18px 20px;">
                <p style="margin:0 0 6px 0;font-size:18px;font-weight:700;color:#333333;">${details.planName} Subscription</p>
                <span style="display:inline-block;background:#667eea;color:#ffffff;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;">${details.tier}</span>
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">
                  <tr>
                    <td style="font-size:13px;color:#666666;padding-bottom:4px;width:50%;"><strong style="color:#495057;">Duration:</strong> ${details.duration} month(s)</td>
                    <td style="font-size:13px;color:#666666;padding-bottom:4px;"><strong style="color:#495057;">Valid Until:</strong> ${expiryDate}</td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#666666;"><strong style="color:#495057;">Start Date:</strong> ${format(details.startDate, "dd MMM yyyy")}</td>
                    <td style="font-size:13px;color:#666666;"><strong style="color:#495057;">Discount:</strong> ${details.discount}%</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- PRICING TABLE -->
      <tr>
        <td style="padding:22px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e8e8e8;border-radius:8px;overflow:hidden;">
            <tr style="background-color:#f8f9fa;">
              <th style="padding:11px 16px;font-size:12px;font-weight:700;color:#333333;text-align:left;border-bottom:2px solid #e0e0e0;">Description</th>
              <th style="padding:11px 16px;font-size:12px;font-weight:700;color:#333333;text-align:right;border-bottom:2px solid #e0e0e0;">Amount</th>
            </tr>
            <tr>
              <td style="padding:11px 16px;font-size:13px;color:#555555;border-bottom:1px solid #f0f0f0;">${details.planName} - ${details.tier} (${details.duration} month${details.duration > 1 ? 's' : ''})</td>
              <td style="padding:11px 16px;font-size:13px;color:#555555;text-align:right;border-bottom:1px solid #f0f0f0;">&#8377;${originalPrice.toLocaleString("en-IN")}</td>
            </tr>
            <tr style="background-color:#f8f9fa;">
              <td style="padding:11px 16px;font-size:13px;color:#555555;border-bottom:1px solid #e0e0e0;">Discount (${details.discount}%)</td>
              <td style="padding:11px 16px;font-size:13px;color:#e53935;text-align:right;border-bottom:1px solid #e0e0e0;">-&#8377;${discountAmount.toLocaleString("en-IN")}</td>
            </tr>
            <tr style="background-color:#f0f4ff;">
              <td style="padding:14px 16px;font-size:15px;font-weight:700;color:#333333;">Total Amount</td>
              <td style="padding:14px 16px;font-size:18px;font-weight:700;color:#667eea;text-align:right;">${formattedAmount}</td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- VALIDITY -->
      <tr>
        <td style="padding:20px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f8ff;border-left:4px solid #667eea;border-radius:0 8px 8px 0;">
            <tr>
              <td style="padding:14px 18px;">
                <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#333333;">Subscription Validity</p>
                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="font-size:13px;color:#555555;padding-bottom:4px;width:50%;"><strong>Start Date:</strong> ${format(details.startDate, "dd MMM yyyy")}</td>
                    <td style="font-size:13px;color:#555555;padding-bottom:4px;"><strong>Expiry Date:</strong> ${expiryDate}</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="font-size:13px;font-weight:700;color:#667eea;">Duration: ${details.duration} month(s)</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- FEATURES -->
      <tr>
        <td style="padding:22px 30px 0;">
          <p style="margin:0 0 10px 0;font-size:12px;font-weight:700;color:#333333;letter-spacing:1px;text-transform:uppercase;">Included Features</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8f9fa;border-radius:8px;border:1px solid #e8e8e8;">
            <tr><td style="padding:14px 16px 4px;">
              <table cellpadding="0" cellspacing="0" border="0">
                ${details.features.map(f => `
                <tr>
                  <td valign="top" style="padding-right:8px;padding-bottom:10px;color:#667eea;font-size:15px;line-height:1;">&#10003;</td>
                  <td style="padding-bottom:10px;font-size:13px;color:#495057;line-height:1.5;">${f}</td>
                </tr>`).join('')}
              </table>
            </td></tr>
          </table>
        </td>
      </tr>

      <!-- PDF NOTICE -->
      <tr>
        <td style="padding:20px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:2px solid #667eea;border-radius:8px;background-color:#f7f6ff;">
            <tr>
              <td align="center" style="padding:18px 20px;">
                <p style="margin:0 0 5px 0;font-size:13px;font-weight:700;color:#667eea;">INVOICE PDF ATTACHED</p>
                <p style="margin:0;font-size:12px;color:#666666;">A detailed PDF invoice is attached to this email. Please save it for your records.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="padding:26px 30px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="border-top:1px solid #e8e8e8;padding-top:18px;text-align:center;">
                <p style="margin:0 0 4px 0;font-size:14px;font-weight:600;color:#333333;">${details.company}</p>
                <p style="margin:0 0 4px 0;font-size:13px;color:#555555;">Thank you for your subscription!</p>
                <p style="margin:0;font-size:12px;color:#999999;">This is an automated invoice. Please keep it for your records.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>
    `
  }

  /**
   * Send invoice email to user
   */
  async sendInvoiceToUser(details: InvoiceDetails): Promise<boolean> {
    try {
      if (!this.transporter) {
        console.log(`[Invoice Service] Email not configured - skipping invoice to ${details.userEmail}`);
        return false;
      }

      const html = this.generateInvoiceHTML(details);
      const pdfBuffer = await this.generateSubscriptionPDF(details);

      const mailOptions = {
        from: this.emailFrom,
        to: details.userEmail,
        subject: `Subscription Invoice #${details.invoiceId} - ${details.planName}`,
        html: html,
        attachments: [
          {
            filename: `Invoice_${details.invoiceId}_${format(new Date(), 'yyyyMMdd')}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
        bcc: process.env.ADMIN_EMAIL,
        headers: {
          "X-Invoice-ID": details.invoiceId,
          "X-Subscription-ID": details.subscriptionId,
        },
      };

      console.log(`[Invoice Service] Sending invoice with PDF to ${details.userEmail}`);
      const result = await this.transporter.sendMail(mailOptions);
      console.log(
        `[Invoice Service] Invoice email with PDF sent successfully to ${details.userEmail}`
      );
      return true;
    } catch (error: any) {
      console.error(
        `[Invoice Service] Failed to send invoice email: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Send admin notification for new subscription
   */
  async sendAdminNotification(details: InvoiceDetails): Promise<boolean> {
    try {
      if (!this.transporter) {
        console.log(`[Invoice Service] Email not configured - skipping admin notification`);
        return false;
      }

      if (!details.adminEmail) {
        console.log(
          "[Invoice Service] No admin email configured, skipping admin notification"
        );
        return true;
      }

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #667eea; color: white; padding: 20px; border-radius: 5px; }
        .content { background: #f9f9f9; padding: 20px; margin: 10px 0; border-radius: 5px; }
        .detail { margin: 10px 0; }
        .label { font-weight: bold; color: #667eea; }
      </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>New Subscription Purchased</h2>
        </div>
        <div class="content">
            <div class="detail">
                <span class="label">Invoice ID:</span> ${details.invoiceId}
            </div>
            <div class="detail">
                <span class="label">User:</span> ${details.userName} (${details.userEmail})
            </div>
            <div class="detail">
                <span class="label">Plan:</span> ${details.planName} - ${details.tier.toUpperCase()}
            </div>
            <div class="detail">
                <span class="label">Amount:</span> ₹${details.amount.toLocaleString("en-IN")}
            </div>
            <div class="detail">
                <span class="label">Duration:</span> ${details.duration} month(s)
            </div>
            <div class="detail">
                <span class="label">Discount:</span> ${details.discount}%
            </div>
            <div class="detail">
                <span class="label">Valid Until:</span> ${format(details.endDate, "dd MMM yyyy")}
            </div>
            <div class="detail">
                <span class="label">Subscription ID:</span> ${details.subscriptionId}
            </div>
        </div>
    </div>
</body>
</html>
      `;

      const mailOptions = {
        from: this.emailFrom,
        to: details.adminEmail,
        subject: `[${details.company}] New Subscription: ${details.planName} - ${details.tier}`,
        html: htmlContent,
        headers: {
          "X-Invoice-ID": details.invoiceId,
          "X-Subscription-ID": details.subscriptionId,
          "X-Notification-Type": "admin",
        },
      };

      console.log(
        `[Invoice Service] Sending admin notification to ${details.adminEmail}`
      );
      const result = await this.transporter.sendMail(mailOptions);
      console.log(`[Invoice Service] Admin notification sent successfully`);
      return true;
    } catch (error: any) {
      console.error(
        `[Invoice Service] Failed to send admin notification: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Send expiry reminder email
   */
  async sendExpiryReminder(details: InvoiceDetails): Promise<boolean> {
    try {
      if (!this.transporter) {
        console.log(`[Invoice Service] Email not configured - skipping expiry reminder`);
        return false;
      }

      const daysRemaining = Math.ceil(
        (details.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
        .content { background: white; padding: 30px; border-radius: 0 0 10px 10px; }
        .alert { background: #fff3cd; border-left: 4px solid #f39c12; padding: 15px; border-radius: 4px; margin: 20px 0; }
        .button { display: inline-block; background: #f39c12; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>⏰ Subscription Expiring Soon</h2>
        </div>
        <div class="content">
            <p>Hi ${details.userName},</p>
            <p>Your ${details.planName} subscription (${details.tier.toUpperCase()}) will expire in <strong>${daysRemaining} day(s)</strong>.</p>
            
            <div class="alert">
                <strong>Expiry Date:</strong> ${format(details.endDate, "dd MMM yyyy")}
            </div>

            <p>To continue enjoying uninterrupted access, please renew your subscription before the expiry date.</p>

            <p style="text-align: center;">
                <a href="https://lynkup.com/subscription/renew" class="button">Renew Subscription</a>
            </p>

            <p>If you have any questions, please feel free to contact us.</p>
            
            <p>Best regards,<br><strong>${details.company} Team</strong></p>
        </div>
    </div>
</body>
</html>
      `;

      const mailOptions = {
        from: this.emailFrom,
        to: details.userEmail,
        subject: `⏰ Your ${details.planName} Subscription Expires in ${daysRemaining} Day(s)`,
        html: htmlContent,
        headers: {
          "X-Subscription-ID": details.subscriptionId,
          "X-Notification-Type": "expiry-reminder",
        },
      };

      console.log(
        `[Invoice Service] Sending expiry reminder to ${details.userEmail}`
      );
      const result = await this.transporter.sendMail(mailOptions);
      console.log(
        `[Invoice Service] Expiry reminder sent successfully to ${details.userEmail}`
      );
      return true;
    } catch (error: any) {
      console.error(
        `[Invoice Service] Failed to send expiry reminder: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Send cancellation confirmation email
   */
  async sendCancellationConfirmation(details: InvoiceDetails): Promise<boolean> {
    try {
      if (!this.transporter) {
        console.log(`[Invoice Service] Email not configured - skipping cancellation confirmation`);
        return false;
      }

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #666; color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
        .content { background: white; padding: 30px; border-radius: 0 0 10px 10px; }
        .info { background: #f9f9f9; padding: 15px; border-radius: 4px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Subscription Cancelled</h2>
        </div>
        <div class="content">
            <p>Hi ${details.userName},</p>
            <p>Your subscription has been successfully cancelled.</p>
            
            <div class="info">
                <p><strong>Plan:</strong> ${details.planName}</p>
                <p><strong>Tier:</strong> ${details.tier.toUpperCase()}</p>
                <p><strong>Refund Amount:</strong> ₹${details.amount.toLocaleString("en-IN")}</p>
            </div>

            <p>Your access will continue until ${format(details.endDate, "dd MMM yyyy")}.</p>
            <p>Thank you for being our customer. We hope to see you again!</p>
            
            <p>Best regards,<br><strong>${details.company} Team</strong></p>
        </div>
    </div>
</body>
</html>
      `;

      const mailOptions = {
        from: this.emailFrom,
        to: details.userEmail,
        subject: `Subscription Cancelled - ${details.planName}`,
        html: htmlContent,
        headers: {
          "X-Subscription-ID": details.subscriptionId,
          "X-Notification-Type": "cancellation",
        },
      };

      console.log(
        `[Invoice Service] Sending cancellation confirmation to ${details.userEmail}`
      );
      const result = await this.transporter.sendMail(mailOptions);
      console.log(
        `[Invoice Service] Cancellation confirmation sent successfully`
      );
      return true;
    } catch (error: any) {
      console.error(
        `[Invoice Service] Failed to send cancellation email: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Generate and send wallet deduction invoice
   */
  async sendWalletDeductionInvoice(details: {
    transactionId: string;
    userName: string;
    userEmail: string;
    amount: number;
    purpose: string;
    description: string;
    offerId?: string;
    offerName?: string;
    remainingBalance: number;
    company: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      console.log(
        `[Invoice Service] Wallet deduction invoice skipped - no email config`
      );
      return false;
    }

    try {
      const invoiceDate = format(new Date(), "dd MMM yyyy, hh:mm a");
      const formattedAmount = `₹${details.amount.toLocaleString("en-IN")}`;
      const formattedBalance = `₹${details.remainingBalance.toLocaleString("en-IN")}`;
      const unlockDate = new Date();
      unlockDate.setDate(unlockDate.getDate() + 30);
      const formattedUnlockDate = format(unlockDate, "dd MMM yyyy");

      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wallet Deduction Invoice</title>
  <style>
    body { margin:0; padding:0; background-color:#f4f6f9; }
    @media only screen and (max-width:600px) {
      .bill-td { display:block !important; width:100% !important; border-right:none !important; border-bottom:1px solid #c8e6c9 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f9;">
  <tr><td align="center" style="padding:30px 15px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10);">

      <!-- HEADER -->
      <tr>
        <td align="center" style="background:linear-gradient(135deg,#28a745 0%,#20c997 100%);padding:36px 30px 28px;">
          <p style="margin:0 0 6px 0;font-size:12px;color:#d4f5e2;letter-spacing:2px;font-weight:700;text-transform:uppercase;">Wallet Notice</p>
          <h1 style="margin:0;font-size:26px;color:#ffffff;font-weight:700;line-height:1.3;">Wallet Deduction Invoice</h1>
          <p style="margin:10px 0 0 0;font-size:13px;color:#a8f0cc;">${invoiceDate}</p>
        </td>
      </tr>

      <!-- ALERT BADGE -->
      <tr>
        <td style="padding:24px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" style="background-color:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:14px 20px;">
                <p style="margin:0 0 4px 0;font-size:12px;font-weight:700;color:#e65100;letter-spacing:1px;text-transform:uppercase;">&#9888; Amount Locked</p>
                <p style="margin:0;font-size:20px;font-weight:700;color:#e65100;">${formattedAmount} Locked from Your Wallet</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- GREETING -->
      <tr>
        <td style="padding:22px 30px 0;">
          <p style="margin:0;font-size:15px;color:#333333;">Dear <strong>${details.userName}</strong>,</p>
          <p style="margin:10px 0 0 0;font-size:14px;color:#555555;line-height:1.7;">&#8377;${details.amount.toLocaleString("en-IN")} has been <strong>locked</strong> from your ${details.company} wallet as a security deposit for your offer. This amount will be held for <strong>30 days</strong> and automatically released on <strong>${formattedUnlockDate}</strong>.</p>
        </td>
      </tr>

      <!-- BILL FROM / BILL TO -->
      <tr>
        <td style="padding:22px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #c8e6c9;border-radius:8px;overflow:hidden;">
            <tr>
              <td class="bill-td" width="50%" valign="top" style="padding:16px 18px;border-right:1px solid #c8e6c9;background-color:#f1fdf4;">
                <p style="margin:0 0 6px 0;font-size:10px;font-weight:700;color:#28a745;letter-spacing:2px;text-transform:uppercase;">Bill From</p>
                <p style="margin:0 0 3px 0;font-size:14px;font-weight:700;color:#222222;">ROSE INFLUENCER MARKETING LLP</p>
                <p style="margin:0;font-size:12px;color:#666666;">GST Reg No: <strong>06ABKFR6483P1Z9</strong></p>
              </td>
              <td class="bill-td" width="50%" valign="top" style="padding:16px 18px;background-color:#f1fdf4;">
                <p style="margin:0 0 6px 0;font-size:10px;font-weight:700;color:#28a745;letter-spacing:2px;text-transform:uppercase;">Bill To</p>
                <p style="margin:0 0 3px 0;font-size:14px;font-weight:700;color:#222222;">${details.userName}</p>
                <p style="margin:0;font-size:12px;color:#666666;">${details.userEmail}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- TRANSACTION DETAILS -->
      <tr>
        <td style="padding:22px 30px 0;">
          <p style="margin:0 0 10px 0;font-size:10px;font-weight:700;color:#28a745;letter-spacing:2px;text-transform:uppercase;">Transaction Details</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e8e8e8;border-radius:8px;overflow:hidden;">
            <tr style="background-color:#f8f9fa;">
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;border-bottom:1px solid #e8e8e8;width:44%;">Transaction Date</td>
              <td style="padding:11px 16px;font-size:13px;color:#212529;border-bottom:1px solid #e8e8e8;">${invoiceDate}</td>
            </tr>
            <tr>
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;border-bottom:1px solid #e8e8e8;">Transaction ID</td>
              <td style="padding:11px 16px;font-size:12px;color:#212529;border-bottom:1px solid #e8e8e8;word-break:break-all;">${details.transactionId}</td>
            </tr>
            <tr style="background-color:#f8f9fa;">
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;border-bottom:1px solid #e8e8e8;">Purpose</td>
              <td style="padding:11px 16px;font-size:13px;color:#212529;border-bottom:1px solid #e8e8e8;">${details.purpose}</td>
            </tr>
            ${details.offerName ? `
            <tr>
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;border-bottom:1px solid #e8e8e8;">Offer</td>
              <td style="padding:11px 16px;font-size:13px;color:#212529;border-bottom:1px solid #e8e8e8;">${details.offerName}</td>
            </tr>
            ` : ''}
            <tr ${details.offerName ? '' : 'style="background-color:#f8f9fa;"'}>
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;">Description</td>
              <td style="padding:11px 16px;font-size:13px;color:#212529;">${details.description}</td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- LOCK DETAILS -->
      <tr>
        <td style="padding:20px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #bbdefb;border-radius:8px;overflow:hidden;background-color:#e3f2fd;">
            <tr>
              <td style="padding:13px 16px;font-size:13px;font-weight:600;color:#1565c0;border-bottom:1px solid #bbdefb;">Amount Locked</td>
              <td align="right" style="padding:13px 16px;border-bottom:1px solid #bbdefb;">
                <span style="font-size:20px;font-weight:700;color:#e65100;">${formattedAmount}</span>
              </td>
            </tr>
            <tr style="background-color:#e8f5e9;">
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;border-bottom:1px solid #c8e6c9;">Lock Period</td>
              <td align="right" style="padding:11px 16px;font-size:13px;color:#212529;border-bottom:1px solid #c8e6c9;">30 days</td>
            </tr>
            <tr>
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;border-bottom:1px solid #e8e8e8;">Unlock Date</td>
              <td align="right" style="padding:11px 16px;font-size:13px;font-weight:700;color:#28a745;border-bottom:1px solid #e8e8e8;">${formattedUnlockDate}</td>
            </tr>
            <tr style="background-color:#f8f9fa;">
              <td style="padding:13px 16px;font-size:14px;font-weight:600;color:#495057;">Remaining Wallet Balance</td>
              <td align="right" style="padding:13px 16px;">
                <span style="font-size:18px;font-weight:700;color:#28a745;">${formattedBalance}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- IMPORTANT NOTES -->
      <tr>
        <td style="padding:22px 30px 0;">
          <p style="margin:0 0 10px 0;font-size:12px;font-weight:700;color:#333333;letter-spacing:1px;text-transform:uppercase;">Important Notes</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8f9fa;border-radius:8px;border:1px solid #e8e8e8;">
            <tr><td style="padding:14px 16px 4px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="top" style="padding-right:8px;padding-bottom:10px;color:#28a745;font-size:15px;line-height:1;">&#8226;</td>
                  <td style="padding-bottom:10px;font-size:13px;color:#495057;line-height:1.5;">This amount is <strong>locked</strong>, not permanently deducted</td>
                </tr>
                <tr>
                  <td valign="top" style="padding-right:8px;padding-bottom:10px;color:#28a745;font-size:15px;line-height:1;">&#8226;</td>
                  <td style="padding-bottom:10px;font-size:13px;color:#495057;line-height:1.5;">It will be automatically released after 30 days if no disputes arise</td>
                </tr>
                <tr>
                  <td valign="top" style="padding-right:8px;padding-bottom:14px;color:#28a745;font-size:15px;line-height:1;">&#8226;</td>
                  <td style="padding-bottom:14px;font-size:13px;color:#495057;line-height:1.5;">You can view your locked balance in the wallet dashboard</td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="padding:26px 30px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="border-top:1px solid #e8e8e8;padding-top:18px;text-align:center;">
                <p style="margin:0 0 4px 0;font-size:14px;font-weight:600;color:#333333;">Thank you for using ${details.company}</p>
                <p style="margin:0;font-size:12px;color:#999999;">This is an automated email. Please do not reply to this message.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>
      `

      const mailOptions = {
        from: this.emailFrom,
        to: details.userEmail,
        subject: `Wallet Deduction Invoice - ${details.purpose}`,
        html: htmlContent,
        attachments: [],
        bcc: process.env.ADMIN_EMAIL,
        headers: {
          "X-Transaction-ID": details.transactionId,
          "X-Notification-Type": "wallet-deduction",
        },
      };

      console.log(
        `[Invoice Service] Sending wallet deduction invoice to ${details.userEmail}`
      );
      await this.transporter.sendMail(mailOptions);
      console.log(`[Invoice Service] Wallet deduction invoice sent successfully`);
      return true;
    } catch (error: any) {
      console.error(
        `[Invoice Service] Failed to send wallet deduction invoice: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Generate and send wallet credit invoice
   */
  async sendWalletCreditInvoice(details: {
    transactionId: string;
    userName: string;
    userEmail: string;
    amount: number;
    paymentMethod: string;
    razorpayPaymentId?: string;
    newBalance: number;
    company: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      console.log(
        `[Invoice Service] Wallet credit invoice skipped - no email config`
      );
      return false;
    }

    try {
      const invoiceDate = format(new Date(), "dd MMM yyyy, hh:mm a");
      const formattedAmount = `₹${details.amount.toLocaleString("en-IN")}`;
      const formattedBalance = `₹${details.newBalance.toLocaleString("en-IN")}`;

      // Prepare wallet invoice details for PDF
      const walletInvoiceDetails: WalletInvoiceDetails = {
        transactionId: details.transactionId,
        userName: details.userName,
        userEmail: details.userEmail,
        amount: details.amount,
        currentBalance: details.newBalance,
        paymentMethod: details.paymentMethod,
        razorpayPaymentId: details.razorpayPaymentId,
        company: details.company,
      };

      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wallet Recharge Receipt</title>
  <style>
    body { margin:0; padding:0; background-color:#f4f6f9; }
    @media only screen and (max-width:600px) {
      .bill-td { display:block !important; width:100% !important; border-right:none !important; border-bottom:1px solid #e0dfff !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f9;">
  <tr><td align="center" style="padding:30px 15px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10);">

      <!-- HEADER -->
      <tr>
        <td align="center" style="background:linear-gradient(135deg,#6C63FF 0%,#4f46e5 100%);padding:36px 30px 28px;">
          <p style="margin:0 0 6px 0;font-size:12px;color:#d4d0ff;letter-spacing:2px;font-weight:700;text-transform:uppercase;">Payment Receipt</p>
          <h1 style="margin:0;font-size:26px;color:#ffffff;font-weight:700;line-height:1.3;">Wallet Recharged Successfully</h1>
          <p style="margin:10px 0 0 0;font-size:13px;color:#c4beff;">${invoiceDate}</p>
        </td>
      </tr>

      <!-- SUCCESS BADGE -->
      <tr>
        <td style="padding:24px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" style="background-color:#eefbf0;border:1px solid #b7ebc5;border-radius:8px;padding:16px 20px;">
                <p style="margin:0 0 4px 0;font-size:12px;font-weight:700;color:#1a7a36;letter-spacing:1px;text-transform:uppercase;">&#10003; Payment Successful</p>
                <p style="margin:0;font-size:22px;font-weight:700;color:#1a7a36;">${formattedAmount} Added to Your Wallet</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- GREETING -->
      <tr>
        <td style="padding:22px 30px 0;">
          <p style="margin:0;font-size:15px;color:#333333;">Dear <strong>${details.userName}</strong>,</p>
          <p style="margin:10px 0 0 0;font-size:14px;color:#555555;line-height:1.7;">Thank you for recharging your <strong>${details.company}</strong> wallet. Your payment has been processed successfully and your wallet is ready to use.</p>
        </td>
      </tr>

      <!-- BILL FROM / BILL TO -->
      <tr>
        <td style="padding:22px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e0dfff;border-radius:8px;overflow:hidden;">
            <tr>
              <td class="bill-td" width="50%" valign="top" style="padding:16px 18px;border-right:1px solid #e0dfff;background-color:#f7f6ff;">
                <p style="margin:0 0 6px 0;font-size:10px;font-weight:700;color:#6C63FF;letter-spacing:2px;text-transform:uppercase;">Bill From</p>
                <p style="margin:0 0 3px 0;font-size:14px;font-weight:700;color:#222222;">ROSE INFLUENCER MARKETING LLP</p>
                <p style="margin:0;font-size:12px;color:#666666;">GST Reg No: <strong>06ABKFR6483P1Z9</strong></p>
              </td>
              <td class="bill-td" width="50%" valign="top" style="padding:16px 18px;background-color:#f7f6ff;">
                <p style="margin:0 0 6px 0;font-size:10px;font-weight:700;color:#6C63FF;letter-spacing:2px;text-transform:uppercase;">Bill To</p>
                <p style="margin:0 0 3px 0;font-size:14px;font-weight:700;color:#222222;">${details.userName}</p>
                <p style="margin:0;font-size:12px;color:#666666;">${details.userEmail}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- TRANSACTION DETAILS -->
      <tr>
        <td style="padding:22px 30px 0;">
          <p style="margin:0 0 10px 0;font-size:10px;font-weight:700;color:#6C63FF;letter-spacing:2px;text-transform:uppercase;">Transaction Details</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e8e8e8;border-radius:8px;overflow:hidden;">
            <tr style="background-color:#f8f9fa;">
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;border-bottom:1px solid #e8e8e8;width:44%;">Transaction Date</td>
              <td style="padding:11px 16px;font-size:13px;color:#212529;border-bottom:1px solid #e8e8e8;">${invoiceDate}</td>
            </tr>
            <tr>
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;border-bottom:1px solid #e8e8e8;">Transaction ID</td>
              <td style="padding:11px 16px;font-size:12px;color:#212529;border-bottom:1px solid #e8e8e8;word-break:break-all;">${details.transactionId}</td>
            </tr>
            ${details.razorpayPaymentId ? `
            <tr style="background-color:#f8f9fa;">
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;border-bottom:1px solid #e8e8e8;">Payment ID</td>
              <td style="padding:11px 16px;font-size:12px;color:#212529;border-bottom:1px solid #e8e8e8;word-break:break-all;">${details.razorpayPaymentId}</td>
            </tr>
            <tr>
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;">Payment Method</td>
              <td style="padding:11px 16px;font-size:13px;color:#212529;">${details.paymentMethod}</td>
            </tr>
            ` : `
            <tr style="background-color:#f8f9fa;">
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;">Payment Method</td>
              <td style="padding:11px 16px;font-size:13px;color:#212529;">${details.paymentMethod}</td>
            </tr>
            `}
          </table>
        </td>
      </tr>

      <!-- AMOUNT SUMMARY -->
      <tr>
        <td style="padding:20px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e0dfff;border-radius:8px;overflow:hidden;">
            <tr style="background-color:#f7f6ff;">
              <td style="padding:13px 16px;font-size:14px;font-weight:600;color:#495057;border-bottom:1px solid #e0dfff;">Amount Credited</td>
              <td align="right" style="padding:13px 16px;border-bottom:1px solid #e0dfff;">
                <span style="font-size:22px;font-weight:700;color:#6C63FF;">${formattedAmount}</span>
              </td>
            </tr>
            <tr style="background-color:#eefbf0;">
              <td style="padding:13px 16px;font-size:14px;font-weight:600;color:#495057;">New Wallet Balance</td>
              <td align="right" style="padding:13px 16px;">
                <span style="font-size:20px;font-weight:700;color:#1a7a36;">${formattedBalance}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- WHAT'S NEXT -->
      <tr>
        <td style="padding:22px 30px 0;">
          <p style="margin:0 0 10px 0;font-size:12px;font-weight:700;color:#333333;letter-spacing:1px;text-transform:uppercase;">What's Next</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8f9fa;border-radius:8px;border:1px solid #e8e8e8;">
            <tr><td style="padding:14px 16px 4px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="top" style="padding-right:8px;padding-bottom:10px;color:#6C63FF;font-size:16px;line-height:1;">&#8226;</td>
                  <td style="padding-bottom:10px;font-size:13px;color:#495057;line-height:1.5;">Your wallet is ready to use immediately</td>
                </tr>
                <tr>
                  <td valign="top" style="padding-right:8px;padding-bottom:10px;color:#6C63FF;font-size:16px;line-height:1;">&#8226;</td>
                  <td style="padding-bottom:10px;font-size:13px;color:#495057;line-height:1.5;">You can now create offers (minimum &#8377;20,000 per offer)</td>
                </tr>
                <tr>
                  <td valign="top" style="padding-right:8px;padding-bottom:14px;color:#6C63FF;font-size:16px;line-height:1;">&#8226;</td>
                  <td style="padding-bottom:14px;font-size:13px;color:#495057;line-height:1.5;">View your full transaction history in the dashboard</td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td>
      </tr>

      <!-- PDF NOTICE -->
      <tr>
        <td style="padding:20px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:2px solid #6C63FF;border-radius:8px;background-color:#f7f6ff;">
            <tr>
              <td align="center" style="padding:18px 20px;">
                <p style="margin:0 0 5px 0;font-size:13px;font-weight:700;color:#6C63FF;">RECEIPT PDF ATTACHED</p>
                <p style="margin:0;font-size:12px;color:#666666;">A detailed PDF receipt is attached to this email. Please save it for your records.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="padding:26px 30px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="border-top:1px solid #e8e8e8;padding-top:18px;text-align:center;">
                <p style="margin:0 0 4px 0;font-size:14px;font-weight:600;color:#333333;">Thank you for choosing ${details.company}</p>
                <p style="margin:0;font-size:12px;color:#999999;">This is an automated email. Please do not reply to this message.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>
      `;

      const pdfBuffer = await this.generateWalletPDF(walletInvoiceDetails);

      const mailOptions = {
        from: this.emailFrom,
        to: details.userEmail,
        subject: `Wallet Recharged - ${formattedAmount} Added`,
        html: htmlContent,
        attachments: [
          {
            filename: `Receipt_${details.transactionId}_${format(new Date(), 'yyyyMMdd')}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
        bcc: process.env.ADMIN_EMAIL,
        headers: {
          "X-Transaction-ID": details.transactionId,
          "X-Notification-Type": "wallet-credit",
        },
      };

      console.log(
        `[Invoice Service] Sending wallet credit invoice with PDF to ${details.userEmail}`
      );
      await this.transporter.sendMail(mailOptions);
      console.log(`[Invoice Service] Wallet credit invoice with PDF sent successfully`);
      return true;
    } catch (error: any) {
      console.error(
        `[Invoice Service] Failed to send wallet credit invoice: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Send GST invoice when admin records manual payout to creator
   * Money deducted from business's locked wallet balance
   */
  async sendPayoutGSTInvoice(
    businessEmail: string,
    businessName: string,
    payoutAmount: number,
    creatorName: string,
    offerName: string,
    bookingId: string,
    payoutDate: Date,
    gstNumber?: string,
    companyName?: string,
    payoutMode?: string,
    notes?: string
  ): Promise<boolean> {
    try {
      if (!this.transporter) {
        console.error("[Invoice Service] Mailgun transporter not initialized");
        return false;
      }

      // Calculate GST (18%)
      const gstAmount = (payoutAmount * 18) / 100;
      const totalAmount = payoutAmount + gstAmount;

      const formattedPayoutAmount = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(payoutAmount);

      const formattedGST = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(gstAmount);

      const formattedTotal = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(totalAmount);

      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payout GST Invoice</title>
  <style>
    body { margin:0; padding:0; background-color:#f4f6f9; }
    @media only screen and (max-width:600px) {
      .bill-td { display:block !important; width:100% !important; border-right:none !important; border-bottom:1px solid #dde3ff !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f9;">
  <tr><td align="center" style="padding:30px 15px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10);">

      <!-- HEADER -->
      <tr>
        <td align="center" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:36px 30px 28px;">
          <p style="margin:0 0 6px 0;font-size:12px;color:#d4d0ff;letter-spacing:2px;font-weight:700;text-transform:uppercase;">GST Invoice</p>
          <h1 style="margin:0;font-size:26px;color:#ffffff;font-weight:700;line-height:1.3;">Payout Deduction Invoice</h1>
          <p style="margin:10px 0 0 0;font-size:13px;color:#c4beff;">Creator Payment Confirmation</p>
        </td>
      </tr>

      <!-- COMPANY INFO (if available) -->
      ${companyName || gstNumber ? `
      <tr>
        <td align="center" style="background-color:#f8f9fa;padding:12px 20px;border-bottom:1px solid #e8e8e8;">
          ${companyName ? `<p style="margin:0 0 2px 0;font-size:14px;font-weight:700;color:#333333;">${companyName}</p>` : ''}
          ${gstNumber ? `<p style="margin:0;font-size:12px;color:#666666;">GST Number: ${gstNumber}</p>` : ''}
        </td>
      </tr>
      ` : ''}

      <!-- BADGE -->
      <tr>
        <td style="padding:24px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" style="background-color:#eefbf0;border:1px solid #b7ebc5;border-radius:8px;padding:14px 20px;">
                <p style="margin:0 0 4px 0;font-size:12px;font-weight:700;color:#1a7a36;letter-spacing:1px;text-transform:uppercase;">&#10003; Payment Processed to Creator</p>
                <p style="margin:0;font-size:14px;color:#1a7a36;">Amount deducted from locked wallet balance</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- GREETING -->
      <tr>
        <td style="padding:22px 30px 0;">
          <p style="margin:0;font-size:15px;color:#333333;">Dear <strong>${businessName}</strong>,</p>
          <p style="margin:10px 0 0 0;font-size:14px;color:#555555;line-height:1.7;">This is to confirm that a payout has been processed to the creator from your locked wallet balance. Below are the transaction details:</p>
        </td>
      </tr>

      <!-- BILL FROM / BILL TO -->
      <tr>
        <td style="padding:22px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #dde3ff;border-radius:8px;overflow:hidden;">
            <tr>
              <td class="bill-td" width="50%" valign="top" style="padding:16px 18px;border-right:1px solid #dde3ff;background-color:#f7f6ff;">
                <p style="margin:0 0 6px 0;font-size:10px;font-weight:700;color:#667eea;letter-spacing:2px;text-transform:uppercase;">Bill From</p>
                <p style="margin:0 0 3px 0;font-size:14px;font-weight:700;color:#222222;">ROSE INFLUENCER MARKETING LLP</p>
                <p style="margin:0;font-size:12px;color:#666666;">GST Reg No: <strong>06ABKFR6483P1Z9</strong></p>
              </td>
              <td class="bill-td" width="50%" valign="top" style="padding:16px 18px;background-color:#f7f6ff;">
                <p style="margin:0 0 6px 0;font-size:10px;font-weight:700;color:#667eea;letter-spacing:2px;text-transform:uppercase;">Bill To</p>
                <p style="margin:0 0 3px 0;font-size:14px;font-weight:700;color:#222222;">${businessName}</p>
                <p style="margin:0;font-size:12px;color:#666666;">${businessEmail}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- BOOKING DETAILS -->
      <tr>
        <td style="padding:22px 30px 0;">
          <p style="margin:0 0 10px 0;font-size:10px;font-weight:700;color:#667eea;letter-spacing:2px;text-transform:uppercase;">Booking Details</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e8e8e8;border-radius:8px;overflow:hidden;">
            <tr style="background-color:#f8f9fa;">
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;border-bottom:1px solid #e8e8e8;width:44%;">Creator Name</td>
              <td style="padding:11px 16px;font-size:13px;color:#212529;border-bottom:1px solid #e8e8e8;">${creatorName}</td>
            </tr>
            <tr>
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;border-bottom:1px solid #e8e8e8;">Offer / Campaign</td>
              <td style="padding:11px 16px;font-size:13px;color:#212529;border-bottom:1px solid #e8e8e8;">${offerName}</td>
            </tr>
            <tr style="background-color:#f8f9fa;">
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;border-bottom:1px solid #e8e8e8;">Booking Reference</td>
              <td style="padding:11px 16px;font-size:13px;color:#212529;border-bottom:1px solid #e8e8e8;">#${bookingId}</td>
            </tr>
            <tr>
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;border-bottom:${payoutMode ? '1px solid #e8e8e8' : 'none'};">Payout Date</td>
              <td style="padding:11px 16px;font-size:13px;color:#212529;border-bottom:${payoutMode ? '1px solid #e8e8e8' : 'none'};">${format(new Date(payoutDate), "PPP")}</td>
            </tr>
            ${payoutMode ? `
            <tr style="background-color:#f8f9fa;">
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;">Payout Mode</td>
              <td style="padding:11px 16px;font-size:13px;color:#212529;">${payoutMode}</td>
            </tr>
            ` : ''}
          </table>
        </td>
      </tr>

      <!-- AMOUNT BREAKDOWN -->
      <tr>
        <td style="padding:20px 30px 0;">
          <p style="margin:0 0 10px 0;font-size:10px;font-weight:700;color:#667eea;letter-spacing:2px;text-transform:uppercase;">Amount Breakdown</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #ffe082;border-radius:8px;overflow:hidden;background-color:#fffde7;">
            <tr>
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;border-bottom:1px solid #ffe082;">Base Payout Amount</td>
              <td align="right" style="padding:11px 16px;font-size:13px;color:#212529;border-bottom:1px solid #ffe082;">${formattedPayoutAmount}</td>
            </tr>
            <tr style="background-color:#fff8e1;">
              <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#495057;border-bottom:1px solid #ffe082;">GST (18%)</td>
              <td align="right" style="padding:11px 16px;font-size:13px;color:#212529;border-bottom:1px solid #ffe082;">${formattedGST}</td>
            </tr>
            <tr style="background-color:#fff3cd;">
              <td style="padding:8px 16px 8px 26px;font-size:12px;color:#777777;border-bottom:1px solid #ffe082;">CGST (9%)</td>
              <td align="right" style="padding:8px 16px;font-size:12px;color:#777777;border-bottom:1px solid #ffe082;">${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(gstAmount / 2)}</td>
            </tr>
            <tr style="background-color:#fff3cd;">
              <td style="padding:8px 16px 11px 26px;font-size:12px;color:#777777;border-bottom:2px solid #ffc107;">SGST (9%)</td>
              <td align="right" style="padding:8px 16px 11px;font-size:12px;color:#777777;border-bottom:2px solid #ffc107;">${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(gstAmount / 2)}</td>
            </tr>
            <tr style="background-color:#fff9c4;">
              <td style="padding:14px 16px;font-size:15px;font-weight:700;color:#c62828;">Total Deducted</td>
              <td align="right" style="padding:14px 16px;font-size:18px;font-weight:700;color:#c62828;">${formattedTotal}</td>
            </tr>
          </table>
        </td>
      </tr>

      ${notes ? `
      <!-- NOTES -->
      <tr>
        <td style="padding:20px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8f9fa;border-radius:8px;border-left:4px solid #667eea;">
            <tr><td style="padding:14px 18px;font-size:13px;color:#495057;line-height:1.6;"><strong>Additional Notes:</strong><br>${notes}</td></tr>
          </table>
        </td>
      </tr>
      ` : ''}

      <!-- IMPORTANT NOTE -->
      <tr>
        <td style="padding:20px 30px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fafafa;border-radius:8px;border:1px solid #e8e8e8;">
            <tr><td style="padding:14px 18px;font-size:13px;color:#555555;line-height:1.6;"><strong>Note:</strong> This amount has been deducted from your locked wallet balance. The creator has been paid outside the platform as per your manual payout record.</td></tr>
          </table>
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="padding:26px 30px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="border-top:1px solid #e8e8e8;padding-top:18px;text-align:center;">
                <p style="margin:0 0 4px 0;font-size:14px;font-weight:600;color:#333333;">Thank you for using ${companyName || 'LYNKUP'}</p>
                <p style="margin:0;font-size:12px;color:#999999;">This is an automated invoice. Please do not reply to this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>
      `
      const mailOptions = {
        from: this.emailFrom,
        to: businessEmail,
        subject: `Payout Invoice - ${formattedTotal} Deducted for ${creatorName}`,
        html: htmlContent,
        attachments: [],
        bcc: process.env.ADMIN_EMAIL,
        headers: {
          "X-Booking-ID": bookingId,
          "X-Notification-Type": "payout-invoice",
        },
      };

      console.log(
        `[Invoice Service] Sending payout GST invoice to ${businessEmail}`
      );
      await this.transporter.sendMail(mailOptions);
      console.log(`[Invoice Service] Payout GST invoice sent successfully`);
      return true;
    } catch (error: any) {
      console.error(
        `[Invoice Service] Failed to send payout GST invoice: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Generate payout invoice as PDF with professional formatting using PDFKit
   */
  async generatePayoutInvoicePDF(invoiceData: {
    business_name: string;
    business_email: string;
    influencer_name: string;
    offer_name: string;
    amount: number;
    payout_date: Date;
    booking_id: string;
    gst_number: string;
    company_name: string;
    payout_mode: string;
    collaboration_type?: string;
  }): Promise<string> {
    try {
      const gstRate = parseFloat(process.env.GST_RATE || "18");
      const subtotal = invoiceData.amount;
      const gstAmount = (subtotal * gstRate) / 100;
      const cgstAmount = gstAmount / 2;
      const sgstAmount = gstAmount / 2;
      const totalAmount = subtotal + gstAmount;

      const doc = new PDFDocument({ margin: 50 });
      const fileName = `Invoice_${invoiceData.booking_id}.pdf`;
      const filePath = path.join(process.cwd(), "temp", fileName);

      // Ensure temp directory exists
      const tempDir = path.join(process.cwd(), "temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // ===== HEADER with purple/blue background =====
      doc.rect(0, 0, 612, 100).fill("#667eea");
      
      // Invoice title
      doc.fontSize(32).fillColor("#ffffff").font("Helvetica-Bold")
        .text("INVOICE", 50, 35);
      
      // Company name on right
      doc.fontSize(16).fillColor("#ffffff").font("Helvetica-Bold")
        .text("LYNKUP", 400, 45, { align: "right", width: 162 });

      // ===== Invoice Details Section =====
      doc.fillColor("#333333");
      
      // Left side - Invoice info
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#666666")
        .text("Invoice No.", 50, 130);
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#333333")
        .text(`INV-${invoiceData.booking_id.slice(-6).toUpperCase()}`, 50, 145);
      
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#666666")
        .text("Invoice Date", 50, 170);
      doc.fontSize(11).font("Helvetica").fillColor("#333333")
        .text(format(new Date(invoiceData.payout_date), "dd MMM yyyy"), 50, 185);

      // Right side - Status
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#666666")
        .text("Due Date", 450, 130, { align: "right", width: 112 });
      doc.fontSize(11).font("Helvetica").fillColor("#333333")
        .text(format(new Date(invoiceData.payout_date), "dd MMM yyyy"), 450, 145, { align: "right", width: 112 });
      
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#666666")
        .text("Status", 450, 170, { align: "right", width: 112 });
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#28a745")
        .text("PAID", 450, 185, { align: "right", width: 112 });

      // ===== FROM and PAID TO Section =====
      // FROM
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#667eea")
        .text("FROM", 50, 230);
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#333333")
        .text(invoiceData.company_name || "LYNKUP", 50, 245);
      doc.fontSize(9).font("Helvetica").fillColor("#666666")
        .text(`GST IN: ${invoiceData.gst_number || process.env.ADMIN_GSTIN || "N/A"}`, 50, 262);
      doc.text("Professional Services", 50, 275);
      doc.text("Payout & Collaboration Management", 50, 288);

      // PAID TO
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#667eea")
        .text("PAID TO", 320, 230);
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#333333")
        .text(invoiceData.business_name, 320, 245);
      doc.fontSize(9).font("Helvetica").fillColor("#666666")
        .text(invoiceData.business_email, 320, 262);
      doc.fontSize(9).font("Helvetica-Oblique").fillColor("#666666")
        .text(`Creator: ${invoiceData.influencer_name}`, 320, 288);

      // ===== Items Table =====
      const tableTop = 330;
      
      // Table header
      doc.rect(50, tableTop, 512, 30).fill("#667eea");
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#ffffff");
      doc.text("Description", 60, tableTop + 10);
      doc.text("Rate", 350, tableTop + 10, { width: 70, align: "right" });
      doc.text("Qty", 420, tableTop + 10, { width: 40, align: "center" });
      doc.text("Total", 470, tableTop + 10, { width: 80, align: "right" });

      // Table row
      const rowY = tableTop + 35;
      doc.rect(50, rowY, 512, 30).fill("#ffffff");
      doc.fontSize(10).font("Helvetica").fillColor("#333333");
      doc.text(`Payout for ${invoiceData.offer_name || "Collaboration"}`, 60, rowY + 10, { width: 280 });
      doc.text(`Rs.${subtotal.toLocaleString("en-IN")}`, 350, rowY + 10, { width: 70, align: "right" });
      doc.text("1", 420, rowY + 10, { width: 40, align: "center" });
      doc.font("Helvetica-Bold").text(`Rs.${subtotal.toLocaleString("en-IN")}`, 470, rowY + 10, { width: 80, align: "right" });

      // Collaboration type row
      const typeRowY = rowY + 30;
      doc.rect(50, typeRowY, 512, 25).fill("#f8f9fa");
      doc.fontSize(9).font("Helvetica-Oblique").fillColor("#666666")
        .text(`Collaboration Type: ${invoiceData.collaboration_type || "Service"}`, 60, typeRowY + 8);

      // ===== Amount Summary =====
      const summaryTop = typeRowY + 50;
      
      // Subtotal
      doc.fontSize(10).font("Helvetica").fillColor("#333333")
        .text("Subtotal", 400, summaryTop, { width: 80, align: "right" });
      doc.text(`Rs.${subtotal.toLocaleString("en-IN")}`, 490, summaryTop, { width: 70, align: "right" });

      // GST
      doc.rect(380, summaryTop + 20, 182, 20).fill("#f8f9fa");
      doc.fillColor("#333333")
        .text(`GST @ ${gstRate}%`, 400, summaryTop + 25, { width: 80, align: "right" });
      doc.text(`Rs.${gstAmount.toLocaleString("en-IN")}`, 490, summaryTop + 25, { width: 70, align: "right" });

      // CGST
      doc.rect(380, summaryTop + 40, 182, 18).fill("#f8f9fa");
      doc.fontSize(9).fillColor("#666666")
        .text("CGST (9%)", 400, summaryTop + 44, { width: 80, align: "right" });
      doc.text(`Rs.${cgstAmount.toLocaleString("en-IN")}`, 490, summaryTop + 44, { width: 70, align: "right" });

      // SGST
      doc.rect(380, summaryTop + 58, 182, 18).fill("#f8f9fa");
      doc.fillColor("#666666")
        .text("SGST (9%)", 400, summaryTop + 62, { width: 80, align: "right" });
      doc.text(`Rs.${sgstAmount.toLocaleString("en-IN")}`, 490, summaryTop + 62, { width: 70, align: "right" });

      // Total
      doc.rect(380, summaryTop + 80, 182, 30).fill("#667eea");
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#ffffff")
        .text("TOTAL", 400, summaryTop + 88, { width: 80, align: "right" });
      doc.text(`Rs.${totalAmount.toLocaleString("en-IN")}`, 490, summaryTop + 88, { width: 70, align: "right" });

      // ===== Payment Details =====
      const paymentTop = summaryTop + 140;
      
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#667eea")
        .text("PAYMENT DETAILS", 50, paymentTop);

      const detailY = paymentTop + 20;
      doc.fontSize(10).font("Helvetica").fillColor("#333333");
      
      // Payment details table
      doc.font("Helvetica-Bold").text("Payout Mode:", 50, detailY);
      doc.font("Helvetica").text(invoiceData.payout_mode || "UPI", 150, detailY);
      
      doc.font("Helvetica-Bold").text("Booking ID:", 50, detailY + 20);
      doc.fontSize(9).font("Helvetica").text(invoiceData.booking_id, 150, detailY + 20);
      
      doc.fontSize(10).font("Helvetica-Bold").text("Payout Date:", 50, detailY + 40);
      doc.font("Helvetica").text(format(new Date(invoiceData.payout_date), "dd MMM yyyy"), 150, detailY + 40);
      
      doc.font("Helvetica-Bold").text("Generated:", 50, detailY + 60);
      doc.font("Helvetica").text(format(new Date(), "dd MMM yyyy, HH:mm a"), 150, detailY + 60);

      // ===== Terms & Conditions =====
      doc.fontSize(8).font("Helvetica-Oblique").fillColor("#999999")
        .text(
          "Terms & Conditions: This is a payout invoice from LYNKUP. Payment has been processed as per collaboration agreement. GST as per applicable rates has been calculated and included.",
          50, 700, { width: 512 }
        );

      doc.end();

      return new Promise((resolve, reject) => {
        stream.on("finish", () => {
          resolve(filePath);
        });
        stream.on("error", reject);
      });
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const invoiceService = new InvoiceService();
