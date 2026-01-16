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

    // Check if plans already exist
    const existingPlans = await SubscriptionPlanModel.findOne({
      name: "Business Subscription Plan",
    });

    if (existingPlans) {
      console.log("⚠️  Subscription plans already exist. Skipping seed...");
      await mongoose.connection.close();
      return;
    }

    // Create subscription plan with tiers
    const subscriptionPlan = await SubscriptionPlanModel.create({
      name: "Business Subscription Plan",
      description:
        "Unlock premium features to grow your business on Lynkup. Choose the duration that works best for you.",
      category: "business",
      currency: "INR",
      isActive: true,
      tiers: [
        {
          id: "silver",
          duration: 1,
          price: 100,
          discount: 0,
          description: "1 Month - Best for trying out",
          monthlyEquivalent: 100,
        },
        {
          id: "gold",
          duration: 3,
          price: 250,
          discount: 17,
          description: "3 Months - Save 17%",
          monthlyEquivalent: 83.33,
        },
        {
          id: "platinum",
          duration: 6,
          price: 450,
          discount: 25,
          description: "6 Months - Save 25%",
          monthlyEquivalent: 75,
        },
        {
          id: "diamond",
          duration: 12,
          price: 750,
          discount: 30,
          description: "12 Months - Best value, Save 30%",
          monthlyEquivalent: 62.5,
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
