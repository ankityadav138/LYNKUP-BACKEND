import nodemailer from "nodemailer";
import { format, addDays } from "date-fns";
import mg from "nodemailer-mailgun-transport";
import PDFDocument from "pdfkit";

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
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const invoiceDate = format(new Date(), "dd MMM yyyy");
        const expiryDate = format(details.endDate, "dd MMM yyyy");
        const originalPrice = Math.round((details.amount / (100 - details.discount)) * 100);
        const discountAmount = originalPrice - details.amount;

        // Header with gradient effect (simulated with rectangles)
        doc.rect(0, 0, doc.page.width, 120).fill('#667eea');
        
        // Company logo/name
        doc.fontSize(28).fillColor('#ffffff').font('Helvetica-Bold')
           .text(details.company.toUpperCase(), 50, 40, { align: 'left' });
        doc.fontSize(12).fillColor('#ffffff').font('Helvetica')
           .text('SUBSCRIPTION INVOICE', 50, 75);
        
        // Invoice number and date (right side)
        doc.fontSize(10).fillColor('#ffffff')
           .text(`Invoice #${details.invoiceId}`, 400, 50, { align: 'right' })
           .text(invoiceDate, 400, 70, { align: 'right' });

        // Reset to black text
        doc.fillColor('#333333');

        // Bill To Section
        let yPos = 160;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#667eea')
           .text('BILL TO', 50, yPos);
        yPos += 20;
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#333333')
           .text(details.userName, 50, yPos);
        yPos += 18;
        doc.fontSize(10).font('Helvetica').fillColor('#666666')
           .text(details.userEmail, 50, yPos);

        // Plan Details Box
        yPos += 40;
        doc.roundedRect(50, yPos, 495, 100, 5).fillAndStroke('#f8f9fa', '#667eea');
        
        yPos += 20;
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#333333')
           .text(`${details.planName} Subscription`, 70, yPos);
        yPos += 25;
        doc.fontSize(10).font('Helvetica').fillColor('#666666')
           .text(`Tier: ${details.tier.toUpperCase()}`, 70, yPos)
           .text(`Duration: ${details.duration} month(s)`, 250, yPos)
           .text(`Valid Until: ${expiryDate}`, 400, yPos);

        // Pricing Table
        yPos += 60;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333');
        doc.text('Description', 50, yPos)
           .text('Amount', 450, yPos, { align: 'right' });
        
        yPos += 5;
        doc.moveTo(50, yPos).lineTo(545, yPos).stroke('#e0e0e0');
        yPos += 20;

        // Line items
        doc.fontSize(10).font('Helvetica').fillColor('#666666');
        doc.text(`${details.planName} - ${details.tier} (${details.duration} month${details.duration > 1 ? 's' : ''})`, 50, yPos)
           .text(`₹${originalPrice.toLocaleString('en-IN')}`, 450, yPos, { align: 'right' });
        
        yPos += 25;
        doc.text(`Discount (${details.discount}%)`, 50, yPos)
           .text(`-₹${discountAmount.toLocaleString('en-IN')}`, 450, yPos, { align: 'right' });

        yPos += 5;
        doc.moveTo(50, yPos).lineTo(545, yPos).stroke('#e0e0e0');
        yPos += 20;

        // Total
        doc.rect(50, yPos - 10, 495, 35).fill('#f8f9fa');
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#333333');
        doc.text('Total Amount', 50, yPos)
           .text(`₹${details.amount.toLocaleString('en-IN')}`, 450, yPos, { align: 'right' });

        // Features Section
        yPos += 50;
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#667eea')
           .text('INCLUDED FEATURES', 50, yPos);
        yPos += 25;
        doc.fontSize(10).font('Helvetica').fillColor('#666666');
        details.features.forEach((feature) => {
          doc.circle(60, yPos + 5, 2).fill('#667eea');
          doc.text(feature, 75, yPos);
          yPos += 20;
        });

        // Footer
        const footerY = doc.page.height - 100;
        doc.moveTo(50, footerY).lineTo(545, footerY).stroke('#e0e0e0');
        doc.fontSize(8).font('Helvetica').fillColor('#999999')
           .text('Thank you for your subscription!', 50, footerY + 15, { align: 'center', width: 495 })
           .text('This is an automated invoice. Please keep it for your records.', 50, footerY + 30, { align: 'center', width: 495 })
           .text(`Generated on ${invoiceDate}`, 50, footerY + 45, { align: 'center', width: 495 });

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
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const invoiceDate = format(new Date(), "dd MMM yyyy, hh:mm a");

        // Header with success color
        doc.rect(0, 0, doc.page.width, 120).fill('#28a745');
        
        // Title
        doc.fontSize(28).fillColor('#ffffff').font('Helvetica-Bold')
           .text('PAYMENT RECEIPT', 50, 40, { align: 'center', width: 495 });
        doc.fontSize(14).fillColor('#ffffff').font('Helvetica')
           .text('✓ Wallet Recharged Successfully', 50, 80, { align: 'center', width: 495 });

        // Reset to black text
        doc.fillColor('#333333');

        // Success Badge
        let yPos = 160;
        doc.roundedRect(50, yPos, 495, 60, 5).fill('#d4edda');
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#155724')
           .text(`🎉 ₹${details.amount.toLocaleString('en-IN')} Added to Your Wallet`, 50, yPos + 22, { align: 'center', width: 495 });

        // Customer Details
        yPos += 90;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#667eea')
           .text('CUSTOMER DETAILS', 50, yPos);
        yPos += 20;
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#333333')
           .text(details.userName, 50, yPos);
        yPos += 18;
        doc.fontSize(10).font('Helvetica').fillColor('#666666')
           .text(details.userEmail, 50, yPos);

        // Transaction Details Box
        yPos += 40;
        doc.roundedRect(50, yPos, 495, 140, 5).fillAndStroke('#f8f9fa', '#dee2e6');
        yPos += 20;

        const leftCol = 70;
        const rightCol = 320;

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#495057');
        doc.text('Transaction Date:', leftCol, yPos);
        doc.font('Helvetica').fillColor('#212529')
           .text(invoiceDate, rightCol, yPos);

        yPos += 25;
        doc.font('Helvetica-Bold').fillColor('#495057');
        doc.text('Transaction ID:', leftCol, yPos);
        doc.font('Helvetica').fillColor('#212529')
           .text(details.transactionId, rightCol, yPos);

        if (details.razorpayPaymentId) {
          yPos += 25;
          doc.font('Helvetica-Bold').fillColor('#495057');
          doc.text('Payment ID:', leftCol, yPos);
          doc.font('Helvetica').fillColor('#212529')
             .text(details.razorpayPaymentId, rightCol, yPos);
        }

        yPos += 25;
        doc.font('Helvetica-Bold').fillColor('#495057');
        doc.text('Payment Method:', leftCol, yPos);
        doc.font('Helvetica').fillColor('#212529')
           .text(details.paymentMethod, rightCol, yPos);

        yPos += 35;
        doc.moveTo(70, yPos).lineTo(525, yPos).stroke('#667eea');
        yPos += 15;

        doc.fontSize(12).font('Helvetica-Bold').fillColor('#495057');
        doc.text('Amount Credited:', leftCol, yPos);
        doc.fontSize(18).fillColor('#667eea')
           .text(`₹${details.amount.toLocaleString('en-IN')}`, rightCol, yPos);

        // New Balance
        yPos += 50;
        doc.roundedRect(50, yPos, 495, 50, 5).fill('#d1ecf1');
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#0c5460')
           .text('New Wallet Balance:', 70, yPos + 18);
        doc.fontSize(16).fillColor('#28a745')
           .text(`₹${details.currentBalance.toLocaleString('en-IN')}`, 320, yPos + 16);

        // What's Next Section
        yPos += 80;
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#667eea')
           .text("📌 WHAT'S NEXT?", 50, yPos);
        yPos += 25;
        doc.fontSize(9).font('Helvetica').fillColor('#666666');
        
        const nextSteps = [
          'Your wallet is ready to use',
          'Create offers (minimum ₹20,000 per offer)',
          'View transaction history in your dashboard',
          'Track your spending and balance'
        ];

        nextSteps.forEach(step => {
          doc.circle(60, yPos + 5, 2).fill('#667eea');
          doc.text(step, 75, yPos);
          yPos += 18;
        });

        // Footer
        const footerY = doc.page.height - 80;
        doc.moveTo(50, footerY).lineTo(545, footerY).stroke('#e0e0e0');
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333')
           .text(`Thank you for choosing ${details.company}`, 50, footerY + 15, { align: 'center', width: 495 });
        doc.fontSize(8).font('Helvetica').fillColor('#999999')
           .text('This is an automated receipt. Please do not reply to this message.', 50, footerY + 35, { align: 'center', width: 495 });

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
      const gstAmount = Math.round((details.amount * 18) / 100);
      const totalWithGST = details.amount + gstAmount;

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
        .gst-breakdown {
            font-size: 14px;
            color: #666;
            margin-top: 10px;
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
            <p>This is to confirm that ₹${details.amount.toLocaleString("en-IN")} has been deducted from your ${details.company} wallet.</p>

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
                    <span class="detail-label">Base Amount:</span>
                    <span class="detail-value">${formattedAmount}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">GST (18%):</span>
                    <span class="detail-value">₹${gstAmount.toLocaleString("en-IN")}</span>
                </div>
                <div class="detail-row" style="border-top: 2px solid #0277bd; padding-top: 15px; margin-top: 10px;">
                    <span class="detail-label" style="font-size: 18px;">Total Deducted:</span>
                    <span class="detail-value amount-highlight">₹${totalWithGST.toLocaleString("en-IN")}</span>
                </div>
                <div class="gst-breakdown">
                    <small>* GST breakdown: CGST 9% + SGST 9% = 18%</small>
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
                <li>This is a system-generated invoice</li>
                <li>Keep this invoice for your records</li>
                <li>You can view all transactions in your dashboard</li>
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

      const mailOptions = {
        from: this.emailFrom,
        to: details.userEmail,
        subject: `Wallet Deduction Invoice - ${details.purpose}`,
        html: htmlContent,
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
    payoutDate: Date
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
            .footer {
              background: #f8f9fa;
              padding: 20px;
              text-align: center;
              color: #6c757d;
              font-size: 14px;
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
                <strong>GST Breakdown:</strong><br>
                CGST (9%): ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(gstAmount / 2)}<br>
                SGST (9%): ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(gstAmount / 2)}
              </div>

              <p><strong>Note:</strong> This amount has been deducted from your locked wallet balance. The creator has been paid outside the platform as per your manual payout record.</p>

              <p style="margin-top: 30px;">If you have any questions regarding this transaction, please contact our support team.</p>
            </div>

            <div class="footer">
              <p style="margin: 0;">Thank you for using LYNKUP</p>
              <p style="margin: 5px 0 0 0;">This is an automated invoice. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const mailOptions = {
        from: this.emailFrom,
        to: businessEmail,
        subject: `Payout Invoice - ${formattedTotal} Deducted for ${creatorName}`,
        html: htmlContent,
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
}

// Export singleton instance
export const invoiceService = new InvoiceService();
