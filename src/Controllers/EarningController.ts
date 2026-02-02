import { Request, Response } from 'express';
import UserModel from '../Models/UserModel';

// Record manual payment directly to user document
export const recordEarning = async (req: Request, res: Response) => {
  try {
    const { userId, amount, method, date } = req.body;
    console.log('💰 Recording payment:', { userId, amount, method, date });
    
    if (!userId || !amount || !method || !date) {
      res.status(400).json({ status: 'false', message: 'All fields are required.' });
      return;
    }
    
    // Update user document with manual pay data
    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      {
        manualPay: {
          amount: parseFloat(amount),
          method,
          date: new Date(date),
        },
      },
      { new: true }
    );
    
    console.log('✅ User updated with manualPay:', updatedUser?.manualPay);
    
    if (!updatedUser) {
      res.status(404).json({ status: 'false', message: 'User not found.' });
      return;
    }
    
    res.status(201).json({ status: 'success', message: 'Payment recorded successfully.', data: updatedUser.manualPay });
  } catch (error) {
    console.error('❌ Error recording payment:', error);
    res.status(500).json({ status: 'false', message: 'Failed to record payment.', error });
  }
};

// Get manual payment data for a user
export const getUserEarnings = async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      res.status(400).json({ status: 'false', message: 'User ID is required.' });
      return;
    }
    const user = await UserModel.findById(userId).select('manualPay');
    res.status(200).json({ status: 'success', data: user?.manualPay || null });
  } catch (error) {
    res.status(500).json({ status: 'false', message: 'Failed to fetch payment data.', error });
  }
};
