import { Request, Response } from 'express';
import UserModel from '../Models/UserModel';
import EarningModel from '../Models/Earning';

// Record manual payment — appends a new entry to EarningModel
export const recordEarning = async (req: Request, res: Response) => {
  try {
    const { userId, amount, method, date, brandName, offerName, description } = req.body;
    console.log('💰 Recording payment:', { userId, amount, method, date, brandName, offerName, description });

    if (!userId || !amount || !method || !date) {
      res.status(400).json({ status: 'false', message: 'All fields are required.' });
      return;
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({ status: 'false', message: 'User not found.' });
      return;
    }

    const earning = await EarningModel.create({
      userId,
      amount: parseFloat(amount),
      method,
      date: new Date(date),
      ...(brandName && { brandName }),
      ...(offerName && { offerName }),
      ...(description && { description }),
    });

    console.log('✅ Earning record created:', earning._id);

    res.status(201).json({ status: 'success', message: 'Payment recorded successfully.', data: earning });
  } catch (error) {
    console.error('❌ Error recording payment:', error);
    res.status(500).json({ status: 'false', message: 'Failed to record payment.', error });
  }
};

// Get all earning records for a user
export const getUserEarnings = async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      res.status(400).json({ status: 'false', message: 'User ID is required.' });
      return;
    }
    const earnings = await EarningModel.find({ userId }).sort({ createdAt: -1 });
    const total = earnings.reduce((sum, e) => sum + (e.amount || 0), 0);
    res.status(200).json({ status: 'success', data: earnings, total });
  } catch (error) {
    res.status(500).json({ status: 'false', message: 'Failed to fetch payment data.', error });
  }
};
