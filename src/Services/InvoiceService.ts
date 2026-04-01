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
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: #f9f9f9;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px 10px 0 0;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }
        .header p {
            margin: 5px 0 0 0;
            font-size: 14px;
            opacity: 0.9;
        }
        .content {
            background: white;
            padding: 30px;
            border-radius: 0 0 10px 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .invoice-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #f0f0f0;
        }
        .invoice-number {
            font-weight: 600;
            color: #667eea;
        }
        .invoice-date {
            color: #666;
            font-size: 14px;
        }
        .section {
            margin-bottom: 25px;
        }
        .section-title {
            font-weight: 600;
            color: #333;
            margin-bottom: 10px;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .user-details {
            color: #666;
            font-size: 14px;
        }
        .user-details p {
            margin: 5px 0;
        }
        .plan-details {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        .plan-name {
            font-size: 18px;
            font-weight: 600;
            color: #333;
            margin-bottom: 10px;
            text-transform: capitalize;
        }
        .plan-tier {
            display: inline-block;
            background: #667eea;
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 15px;
            text-transform: capitalize;
        }
        .plan-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            font-size: 14px;
            color: #666;
            margin-top: 10px;
        }
        .plan-info-item {
            display: flex;
            justify-content: space-between;
        }
        .plan-info-label {
            font-weight: 500;
        }
        .pricing-table {
            width: 100%;
            margin: 20px 0;
            border-collapse: collapse;
        }
        .pricing-table th {
            background: #f8f9fa;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            color: #333;
            border-bottom: 2px solid #e0e0e0;
            font-size: 13px;
        }
        .pricing-table td {
            padding: 12px;
            border-bottom: 1px solid #f0f0f0;
            color: #666;
        }
        .pricing-table tr:last-child td {
            border-bottom: none;
        }
        .amount-right {
            text-align: right;
        }
        .total-row {
            background: #f8f9fa;
            font-weight: 600;
            color: #333;
            font-size: 16px;
        }
        .total-row td {
            padding: 15px 12px;
            border: none;
        }
        .features {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .features-title {
            font-weight: 600;
            margin-bottom: 10px;
            color: #333;
        }
        .features-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .features-list li {
            padding: 5px 0;
            padding-left: 20px;
            position: relative;
            color: #666;
            font-size: 14px;
        }
        .features-list li:before {
            content: "✓";
            position: absolute;
            left: 0;
            color: #667eea;
            font-weight: bold;
        }
        .validity {
            background: #f0f8ff;
            border-left: 4px solid #667eea;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
            font-size: 14px;
            color: #333;
        }
        .validity-label {
            font-weight: 600;
            margin-bottom: 8px;
        }
        .footer {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            color: #666;
            font-size: 13px;
            margin-top: 30px;
        }
        .footer p {
            margin: 5px 0;
        }
        .company-name {
            font-weight: 600;
            color: #333;
            font-size: 16px;
        }
        .button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white !important;
            padding: 14px 35px;
            border-radius: 8px;
            text-decoration: none;
            margin: 25px auto;
            font-weight: 600;
            font-size: 15px;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            transition: all 0.3s ease;
        }
        .button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
        }
        .download-section {
            text-align: center;
            margin: 30px 0;
            padding: 25px;
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            border-radius: 10px;
            border: 2px solid #667eea;
        }
        .divider {
            border-top: 1px solid #e0e0e0;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Invoice</h1>
            <p>Subscription Purchase Receipt from ${details.company}</p>
        </div>

        <div class="content">
            <!-- Invoice Header -->
            <div class="invoice-header">
                <div>
                    <div class="invoice-number">Invoice #${details.invoiceId}</div>
                </div>
                <div style="text-align: right;">
                    <div class="invoice-date">${invoiceDate}</div>
                </div>
            </div>

            <!-- Supplier Details -->
            <div class="section" style="margin-bottom: 25px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #667eea;">
                <div class="section-title">Bill From</div>
                <div class="user-details">
                    <p><strong>ROSE INFLUENCER MARKETING LLP</strong></p>
                    <p>GST Registration No: <strong>06ABKFR6483P1Z9</strong></p>
                </div>
            </div>

            <!-- User Details -->
            <div class="section">
                <div class="section-title">Bill To</div>
                <div class="user-details">
                    <p><strong>${details.userName}</strong></p>
                    <p>${details.userEmail}</p>
                </div>
            </div>

            <!-- Plan Details -->
            <div class="plan-details">
                <div class="plan-name">${details.planName} Subscription</div>
                <span class="plan-tier">${details.tier}</span>
                
                <div class="plan-info">
                    <div class="plan-info-item">
                        <span class="plan-info-label">Duration:</span>
                        <span>${details.duration} month(s)</span>
                    </div>
                    <div class="plan-info-item">
                        <span class="plan-info-label">Valid Until:</span>
                        <span>${expiryDate}</span>
                    </div>
                    <div class="plan-info-item">
                        <span class="plan-info-label">Discount:</span>
                        <span>${details.discount}%</span>
                    </div>
                </div>
            </div>

            <!-- Pricing -->
            <table class="pricing-table">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th class="amount-right">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>${details.planName} - ${details.tier} (${details.duration} month${details.duration > 1 ? 's' : ''})</td>
                        <td class="amount-right">₹${originalPrice.toLocaleString("en-IN")}</td>
                    </tr>
                    <tr>
                        <td>Discount (${details.discount}%)</td>
                        <td class="amount-right">-₹${discountAmount.toLocaleString("en-IN")}</td>
                    </tr>
                    <tr class="total-row">
                        <td>Total Amount</td>
                        <td class="amount-right">${formattedAmount}</td>
                    </tr>
                </tbody>
            </table>

            <!-- Validity -->
            <div class="validity">
                <div class="validity-label">Subscription Validity</div>
                <div><strong>Start Date:</strong> ${format(details.startDate, "dd MMM yyyy")}</div>
                <div><strong>Expiry Date:</strong> ${expiryDate}</div>
                <div style="margin-top: 10px; color: #667eea;"><strong>Duration: ${details.duration} month(s)</strong></div>
            </div>

            <!-- Features -->
            <div class="features">
                <div class="features-title">Included Features</div>
                <ul class="features-list">
                    ${details.features.map((feature) => `<li>${feature}</li>`).join("")}
                </ul>
            </div>

            <!-- Download PDF Section -->
            <div class="download-section">
                <h3 style="margin: 0 0 10px 0; color: #667eea; font-weight: 600;">INVOICE PDF ATTACHED</h3>
                <p style="margin: 0 0 15px 0; color: #666; font-size: 14px;">
                    A detailed PDF invoice has been attached to this email for your records.
                </p>
                <p style="margin: 0; color: #999; font-size: 12px;">
                    Please check your email attachments to download and save the invoice.
                </p>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p class="company-name">${details.company}</p>
                <p>Thank you for your subscription!</p>
                <p>This is an automated invoice. Please keep it for your records.</p>
                <p style="margin-top: 15px; color: #999;">If you have any questions, please contact support</p>
            </div>
        </div>
    </div>
</body>
</html>
    `;
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

      const gstPdfPath = path.join(process.cwd(), "public", "image", "GST.pdf");
      const gstAttachment = fs.existsSync(gstPdfPath)
        ? [{ filename: "GST.pdf", content: fs.readFileSync(gstPdfPath), contentType: "application/pdf" }]
        : [];

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
          ...gstAttachment,
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
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
        }
        .container {
            max-width: 650px;
            margin: 0 auto;
            padding: 20px;
            background: #f9f9f9;
        }
        .header {
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            padding: 30px;
            border-radius: 10px 10px 0 0;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }
        .content {
            background: white;
            padding: 30px;
            border-radius: 0 0 10px 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .invoice-details {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #dee2e6;
        }
        .detail-row:last-child {
            border-bottom: none;
        }
        .detail-label {
            font-weight: 600;
            color: #495057;
        }
        .detail-value {
            color: #212529;
            text-align: right;
        }
        .amount-highlight {
            font-size: 24px;
            font-weight: bold;
            color: #28a745;
        }
        .total-section {
            background: #e7f5ff;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #0277bd;
        }
        .footer {
            text-align: center;
            color: #6c757d;
            font-size: 14px;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 2px solid #dee2e6;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>💳 Wallet Deduction Invoice</h1>
            <p>Transaction ID: ${details.transactionId}</p>
        </div>
        <div class="content">
            <p>Dear <strong>${details.userName}</strong>,</p>
            <p>₹${details.amount.toLocaleString("en-IN")} has been <strong>locked</strong> from your ${details.company} wallet as a security deposit for your offer. This amount will be held for <strong>30 days</strong> and automatically released on <strong>${formattedUnlockDate}</strong>.</p>

            <div class="invoice-details">
                <div class="detail-row">
                    <span class="detail-label">Transaction Date:</span>
                    <span class="detail-value">${invoiceDate}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Transaction ID:</span>
                    <span class="detail-value">${details.transactionId}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Purpose:</span>
                    <span class="detail-value">${details.purpose}</span>
                </div>
                ${details.offerName ? `
                <div class="detail-row">
                    <span class="detail-label">Offer:</span>
                    <span class="detail-value">${details.offerName}</span>
                </div>
                ` : ''}
                <div class="detail-row">
                    <span class="detail-label">Description:</span>
                    <span class="detail-value">${details.description}</span>
                </div>
            </div>

            <div class="total-section">
                <div class="detail-row">
                    <span class="detail-label">Amount Locked:</span>
                    <span class="detail-value amount-highlight">${formattedAmount}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Lock Period:</span>
                    <span class="detail-value">30 days</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Unlock Date:</span>
                    <span class="detail-value">${formattedUnlockDate}</span>
                </div>
            </div>

            <div class="invoice-details">
                <div class="detail-row">
                    <span class="detail-label">Remaining Wallet Balance:</span>
                    <span class="detail-value" style="font-size: 18px; font-weight: bold; color: #28a745;">
                        ${formattedBalance}
                    </span>
                </div>
            </div>

            <p style="margin-top: 20px;">
                <strong>📌 Important Notes:</strong>
            </p>
            <ul style="color: #495057;">
                <li>This amount is <strong>locked</strong>, not permanently deducted</li>
                <li>It will be automatically released after 30 days if no disputes arise</li>
                <li>You can view your locked balance in the wallet dashboard</li>
                <li>For any queries, contact support@${details.company.toLowerCase()}.com</li>
            </ul>

            <div class="footer">
                <p>Thank you for using ${details.company}</p>
                <p style="font-size: 12px; color: #868e96;">
                    This is an automated email. Please do not reply to this message.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
      `;

      const gstPdfPath = path.join(process.cwd(), "public", "image", "GST.pdf");
      const gstAttachment = fs.existsSync(gstPdfPath)
        ? [{ filename: "GST.pdf", content: fs.readFileSync(gstPdfPath), contentType: "application/pdf" }]
        : [];

      const mailOptions = {
        from: this.emailFrom,
        to: details.userEmail,
        subject: `Wallet Deduction Invoice - ${details.purpose}`,
        html: htmlContent,
        attachments: gstAttachment,
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
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
        }
        .container {
            max-width: 650px;
            margin: 0 auto;
            padding: 20px;
            background: #f9f9f9;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px 10px 0 0;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }
        .content {
            background: white;
            padding: 30px;
            border-radius: 0 0 10px 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .success-badge {
            background: #d4edda;
            color: #155724;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            margin: 20px 0;
            border: 1px solid #c3e6cb;
        }
        .invoice-details {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #dee2e6;
        }
        .detail-row:last-child {
            border-bottom: none;
        }
        .detail-label {
            font-weight: 600;
            color: #495057;
        }
        .detail-value {
            color: #212529;
            text-align: right;
        }
        .amount-highlight {
            font-size: 24px;
            font-weight: bold;
            color: #667eea;
        }
        .footer {
            text-align: center;
            color: #6c757d;
            font-size: 14px;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 2px solid #dee2e6;
        }
        .download-section {
            text-align: center;
            margin: 30px 0;
            padding: 25px;
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            border-radius: 10px;
            border: 2px solid #28a745;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Wallet Recharged Successfully</h1>
            <p>Payment Receipt</p>
        </div>
        <div class="content">
            <div class="success-badge">
                <strong>PAYMENT SUCCESSFUL</strong><br>
                Your wallet has been credited with ${formattedAmount}
            </div>

            <p>Dear <strong>${details.userName}</strong>,</p>
            <p>Thank you for recharging your ${details.company} wallet. Your payment has been processed successfully.</p>

            <div class="invoice-details">
                <div class="detail-row">
                    <span class="detail-label">Transaction Date:</span>
                    <span class="detail-value">${invoiceDate}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Transaction ID:</span>
                    <span class="detail-value">${details.transactionId}</span>
                </div>
                ${details.razorpayPaymentId ? `
                <div class="detail-row">
                    <span class="detail-label">Payment ID:</span>
                    <span class="detail-value">${details.razorpayPaymentId}</span>
                </div>
                ` : ''}
                <div class="detail-row">
                    <span class="detail-label">Payment Method:</span>
                    <span class="detail-value">${details.paymentMethod}</span>
                </div>
                <div class="detail-row" style="border-top: 2px solid #667eea; padding-top: 15px; margin-top: 10px;">
                    <span class="detail-label" style="font-size: 18px;">Amount Credited:</span>
                    <span class="detail-value amount-highlight">${formattedAmount}</span>
                </div>
            </div>

            <div class="invoice-details">
                <div class="detail-row">
                    <span class="detail-label">New Wallet Balance:</span>
                    <span class="detail-value" style="font-size: 20px; font-weight: bold; color: #28a745;">
                        ${formattedBalance}
                    </span>
                </div>
            </div>

            <p style="margin-top: 20px;">
                <strong style="color: #333; font-size: 15px;">WHAT'S NEXT</strong>
            </p>
            <ul style="color: #495057; line-height: 1.8;">
                <li>Your wallet is ready to use</li>
                <li>You can now create offers (minimum ₹20,000 per offer)</li>
                <li>View transaction history in your dashboard</li>
                <li>Download this receipt for your records</li>
            </ul>

            <!-- Download PDF Section -->
            <div class="download-section">
                <h3 style="margin: 0 0 10px 0; color: #28a745; font-weight: 600;">RECEIPT PDF ATTACHED</h3>
                <p style="margin: 0 0 15px 0; color: #666; font-size: 14px;">
                    A detailed PDF receipt has been attached to this email for your records.
                </p>
                <p style="margin: 0; color: #999; font-size: 12px;">
                    Please check your email attachments to download and save the receipt.
                </p>
            </div>

            <div class="footer">
                <p>Thank you for choosing ${details.company}</p>
                <p style="font-size: 12px; color: #868e96;">
                    This is an automated email. Please do not reply to this message.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
      `;

      const pdfBuffer = await this.generateWalletPDF(walletInvoiceDetails);

      const gstPdfPath = path.join(process.cwd(), "public", "image", "GST.pdf");
      const gstAttachment = fs.existsSync(gstPdfPath)
        ? [{ filename: "GST.pdf", content: fs.readFileSync(gstPdfPath), contentType: "application/pdf" }]
        : [];

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
          ...gstAttachment,
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
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              background: #f4f6f9;
              margin: 0;
              padding: 20px;
            }
            .email-container {
              max-width: 650px;
              margin: 0 auto;
              background: white;
              border-radius: 10px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 600;
            }
            .company-info {
              background: #f0f0f0;
              padding: 15px;
              text-align: center;
              border-bottom: 1px solid #ddd;
              font-size: 12px;
            }
            .company-info p {
              margin: 3px 0;
            }
            .content {
              padding: 30px;
            }
            .invoice-badge {
              background: #e8f5e9;
              color: #2e7d32;
              padding: 15px;
              border-radius: 8px;
              text-align: center;
              margin: 20px 0;
              border: 1px solid #c8e6c9;
            }
            .invoice-badge h2 {
              margin: 0;
              font-size: 18px;
              font-weight: 600;
            }
            .invoice-details {
              background: #f8f9fa;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .detail-row {
              display: flex;
              justify-content: space-between;
              padding: 10px 0;
              border-bottom: 1px solid #dee2e6;
            }
            .detail-row:last-child {
              border-bottom: none;
            }
            .detail-label {
              font-weight: 600;
              color: #495057;
            }
            .detail-value {
              color: #212529;
              text-align: right;
            }
            .amount-section {
              background: #fff3cd;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
              border: 2px solid #ffc107;
            }
            .amount-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              font-size: 16px;
            }
            .amount-total {
              font-size: 20px;
              font-weight: bold;
              color: #d32f2f;
              border-top: 2px solid #dc3545;
              padding-top: 12px;
              margin-top: 8px;
            }
            .gst-info {
              background: #e3f2fd;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
              border-left: 4px solid #2196f3;
            }
            .gst-info strong {
              display: block;
              margin-bottom: 8px;
            }
            .gst-row {
              display: flex;
              justify-content: space-between;
              padding: 4px 0;
              font-size: 14px;
            }
            .footer {
              background: #f8f9fa;
              padding: 20px;
              text-align: center;
              color: #6c757d;
              font-size: 12px;
              border-top: 1px solid #dee2e6;
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <h1>PAYOUT DEDUCTION INVOICE</h1>
              <p style="margin: 5px 0 0 0; opacity: 0.9;">GST Invoice for Creator Payment</p>
            </div>
            
            ${companyName || gstNumber ? `
            <div class="company-info">
              ${companyName ? `<p><strong>${companyName}</strong></p>` : ''}
              ${gstNumber ? `<p>GST Number: ${gstNumber}</p>` : ''}
            </div>
            ` : ''}
            
            <div class="content">
              <div class="invoice-badge">
                <h2>Payment Processed to Creator</h2>
                <p style="margin: 5px 0 0 0;">Amount Deducted from Locked Balance</p>
              </div>

              <p>Dear ${businessName},</p>
              <p>This is to confirm that a payout has been processed to the creator from your locked wallet balance. Below are the transaction details:</p>

              <div class="invoice-details">
                <div class="detail-row">
                  <span class="detail-label">Creator Name:</span>
                  <span class="detail-value">${creatorName}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Offer/Campaign:</span>
                  <span class="detail-value">${offerName}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Booking Reference:</span>
                  <span class="detail-value">#${bookingId}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Payout Date:</span>
                  <span class="detail-value">${format(new Date(payoutDate), "PPP")}</span>
                </div>
                ${payoutMode ? `
                <div class="detail-row">
                  <span class="detail-label">Payout Mode:</span>
                  <span class="detail-value">${payoutMode}</span>
                </div>
                ` : ''}
              </div>

              <div class="amount-section">
                <h3 style="margin: 0 0 15px 0; color: #495057;">Amount Breakdown</h3>
                <div class="amount-row">
                  <span>Base Payout Amount:</span>
                  <span>${formattedPayoutAmount}</span>
                </div>
                <div class="amount-row">
                  <span>GST (18%):</span>
                  <span>${formattedGST}</span>
                </div>
                <div class="amount-row amount-total">
                  <span>Total Deducted:</span>
                  <span>${formattedTotal}</span>
                </div>
              </div>

              <div class="gst-info">
                <strong>GST Breakdown:</strong>
                <div class="gst-row">
                  <span>CGST (9%):</span>
                  <span>${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(gstAmount / 2)}</span>
                </div>
                <div class="gst-row">
                  <span>SGST (9%):</span>
                  <span>${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(gstAmount / 2)}</span>
                </div>
              </div>

              ${notes ? `<p><strong>Additional Notes:</strong><br>${notes}</p>` : ''}
              <p><strong>Note:</strong> This amount has been deducted from your locked wallet balance. The creator has been paid outside the platform as per your manual payout record.</p>

              <p style="margin-top: 30px;">If you have any questions regarding this transaction, please contact our support team.</p>
            </div>

            <div class="footer">
              <p style="margin: 0;">Thank you for using ${companyName || 'LYNKUP'}</p>
              <p style="margin: 5px 0 0 0;">This is an automated invoice. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const gstPdfPath = path.join(process.cwd(), "public", "image", "GST.pdf");
      const gstAttachment = fs.existsSync(gstPdfPath)
        ? [{ filename: "GST.pdf", content: fs.readFileSync(gstPdfPath), contentType: "application/pdf" }]
        : [];

      const mailOptions = {
        from: this.emailFrom,
        to: businessEmail,
        subject: `Payout Invoice - ${formattedTotal} Deducted for ${creatorName}`,
        html: htmlContent,
        attachments: gstAttachment,
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
