import nodemailer from "nodemailer";
import { format, addDays } from "date-fns";

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
      // Mailgun SMTP configuration
      this.transporter = nodemailer.createTransport({
        host: `smtp.mailgun.org`,
        port: 587,
        secure: false,
        auth: {
          user: `postmaster@${this.mailgunDomain}`,
          pass: this.mailgunApiKey,
        },
      });
    } else {
      console.log("[Invoice Service] Email transporter not configured - emails will be skipped");
      this.transporter = null;
    }
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
            background: #667eea;
            color: white;
            padding: 12px 30px;
            border-radius: 6px;
            text-decoration: none;
            margin: 20px 0;
            font-weight: 600;
            font-size: 14px;
        }
        .button:hover {
            background: #764ba2;
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
                <div style="margin-top: 10px; color: #667eea;"><strong>⏰ Expires in ${details.duration} month(s)</strong></div>
            </div>

            <!-- Features -->
            <div class="features">
                <div class="features-title">Included Features</div>
                <ul class="features-list">
                    ${details.features.map((feature) => `<li>${feature}</li>`).join("")}
                </ul>
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

      const mailOptions = {
        from: this.emailFrom,
        to: details.userEmail,
        subject: `Subscription Invoice #${details.invoiceId} - ${details.planName}`,
        html: html,
        headers: {
          "X-Invoice-ID": details.invoiceId,
          "X-Subscription-ID": details.subscriptionId,
        },
      };

      console.log(`[Invoice Service] Sending invoice to ${details.userEmail}`);
      const result = await this.transporter.sendMail(mailOptions);
      console.log(
        `[Invoice Service] Invoice email sent successfully to ${details.userEmail}`
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
}

// Export singleton instance
export const invoiceService = new InvoiceService();
