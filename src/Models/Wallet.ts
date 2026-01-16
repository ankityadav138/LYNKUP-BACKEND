import mongoose from "mongoose";

// Interface for Wallet document
interface IWallet extends mongoose.Document {
  user_id: mongoose.Types.ObjectId;
  total_balance: number;
  locked_balance: number;
  available_balance: number;
  hasSufficientBalance(amount: number): boolean;
  lockAmount(amount: number): Promise<IWallet>;
  unlockAmount(amount: number): Promise<IWallet>;
  credit(amount: number): Promise<IWallet>;
  debit(amount: number): Promise<IWallet>;
}

const walletSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      unique: true,
    },
    total_balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    locked_balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    available_balance: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
walletSchema.index({ user_id: 1 });

// Method to check if sufficient balance is available
walletSchema.methods.hasSufficientBalance = function (amount: number) {
  return this.available_balance >= amount;
};

// Method to lock amount
walletSchema.methods.lockAmount = async function (amount: number) {
  if (!this.hasSufficientBalance(amount)) {
    throw new Error("Insufficient balance");
  }
  this.available_balance -= amount;
  this.locked_balance += amount;
  return await this.save();
};

// Method to unlock amount
walletSchema.methods.unlockAmount = async function (amount: number) {
  if (this.locked_balance < amount) {
    throw new Error("Insufficient locked balance");
  }
  this.locked_balance -= amount;
  this.available_balance += amount;
  return await this.save();
};

// Method to credit wallet
walletSchema.methods.credit = async function (amount: number) {
  this.total_balance += amount;
  this.available_balance += amount;
  return await this.save();
};

// Method to debit wallet
walletSchema.methods.debit = async function (amount: number) {
  if (this.total_balance < amount) {
    throw new Error("Insufficient total balance");
  }
  this.total_balance -= amount;
  this.locked_balance -= amount;
  return await this.save();
};

const Wallet = mongoose.model<IWallet>("Wallet", walletSchema);

export default Wallet;
