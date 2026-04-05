import mongoose, { Schema, Document } from "mongoose";

export interface IInvoice extends Document {
  invoiceNumber: string;
  userId: mongoose.Types.ObjectId;
  subscriptionId: mongoose.Types.ObjectId;
  type: "subscription" | "renewal" | "refund";
  amount: number;
  currency: string;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  planName: string;
  billingEmail: string;
  pdfPath?: string;
  invoiceDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: { 
      type: String, 
      required: true, 
      unique: true, 
      index: true 
    },
    userId: { 
      type: Schema.Types.ObjectId, 
      ref: "User", 
      required: true, 
      index: true 
    },
    subscriptionId: { 
      type: Schema.Types.ObjectId, 
      ref: "Subscription", 
      required: true 
    },
    type: { 
      type: String, 
      enum: ["subscription", "renewal", "refund"], 
      default: "subscription" 
    },
    amount: { 
      type: Number, 
      required: true 
    },
    currency: { 
      type: String, 
      default: "INR" 
    },
    razorpayPaymentId: { 
      type: String,
      sparse: true,
      index: true
    },
    razorpayOrderId: { 
      type: String,
      sparse: true
    },
    planName: { 
      type: String, 
      required: true 
    },
    billingEmail: { 
      type: String, 
      required: true 
    },
    pdfPath: { 
      type: String 
    },
    invoiceDate: { 
      type: Date, 
      default: Date.now 
    },
  },
  { timestamps: true }
);

// Auto-generate sequential invoice number
InvoiceSchema.pre("save", async function (next) {
  if (this.isNew && !this.invoiceNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model("Invoice").countDocuments({
      invoiceNumber: new RegExp(`^LYNK-${year}-`)
    });
    this.invoiceNumber = `LYNK-${year}-${String(count + 1).padStart(6, "0")}`;
  }
  next();
});

export default mongoose.model<IInvoice>("Invoice", InvoiceSchema);
