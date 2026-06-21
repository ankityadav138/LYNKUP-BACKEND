import mongoose from "mongoose";
import SubscriptionPlanModel from "../Models/SubscriptionPlanModel";
import dotenv from "dotenv";

dotenv.config();

const seedSubscriptionPlans = async () => {
  try {
    // Connect to database
    if (!process.env.Database_URL) {
      throw new Error("Database_URL not found in .env");
    }

    await mongoose.connect(process.env.Database_URL);
    console.log("✅ Connected to MongoDB");

    // Remove any existing plans and recreate with updated config
    await SubscriptionPlanModel.deleteMany({});
    console.log("🗑️  Cleared existing subscription plans");

    // Create subscription plans
    const plans = await SubscriptionPlanModel.insertMany([
      {
        name: "Standard Plan",
        description:
          "Unlock premium features to grow your business on Lynkup.",
        category: "business",
        currency: "INR",
        isActive: true,
        tiers: [
          {
            id: "silver",
            duration: 1,
            price: 5000,
            discount: 0,
            description: "1 Month - Full access to all features",
            monthlyEquivalent: 5000,
          },
        ],
        features: [
          "Create unlimited offers",
          "View detailed analytics",
          "Access customer insights",
          "Priority customer support",
          "Featured business listing",
          "Unlimited portfolio items",
          "Advanced reporting tools",
          "Social media integration",
          "Email campaign tools",
          "Customer management system",
        ],
      },
      {
        name: "Pro Plan",
        description:
          "Advanced features for professional businesses.",
        category: "business",
        currency: "INR",
        isActive: true,
        tiers: [
          {
            id: "pro",
            duration: 1,
            price: 8000,
            discount: 0,
            description: "1 Month - Premium features and support",
            monthlyEquivalent: 8000,
          },
        ],
        features: [
          "All Business Plan features",
          "Advanced analytics dashboard",
          "Custom integrations",
          "Dedicated account manager",
          "Priority support with 24/7 availability",
          "White-label solutions",
          "API access",
          "Custom reporting",
          "Team collaboration tools",
          "Advanced security features",
        ],
      },
    ]);

    console.log("✅ Subscription plans seeded successfully!");
    plans.forEach((plan) => {
      console.log("📋 Plan Details:");
      console.log(`   Plan ID: ${plan._id}`);
      console.log(`   Name: ${plan.name}`);
      console.log(`   Tiers: ${plan.tiers.length}`);
      plan.tiers.forEach((tier) => {
        console.log(
          `     - ${tier.id}: ₹${tier.price} for ${tier.duration} month(s)`
        );
      });
    });

    await mongoose.connection.close();
    console.log("✅ Database connection closed");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
};

// Run seed
seedSubscriptionPlans();
