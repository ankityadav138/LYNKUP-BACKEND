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

    // Create subscription plan with single tier
    const subscriptionPlan = await SubscriptionPlanModel.create({
      name: "Business Subscription Plan",
      description:
        "Unlock premium features to grow your business on Lynkup.",
      category: "business",
      currency: "INR",
      isActive: true,
      tiers: [
        {
          id: "silver",
          duration: 1,
          price: 5900,
          discount: 0,
          description: "1 Month - Full access to all features",
          monthlyEquivalent: 5900,
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
    });

    console.log("✅ Subscription plans seeded successfully!");
    console.log("📋 Plan Details:");
    console.log(`   Plan ID: ${subscriptionPlan._id}`);
    console.log(`   Name: ${subscriptionPlan.name}`);
    console.log(`   Tiers: ${subscriptionPlan.tiers.length}`);
    subscriptionPlan.tiers.forEach((tier) => {
      console.log(
        `     - ${tier.id}: ₹${tier.price} for ${tier.duration} month(s)`
      );
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
