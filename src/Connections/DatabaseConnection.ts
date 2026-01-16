import mongoose from "mongoose";
import * as dotenv from "dotenv";
dotenv.config();
export const mongodbConnection = () => {
  const databaseUrl = process.env.Database_URL;
  if (!databaseUrl) {
    console.error("Database URL not found in environment variables.");
    return;
  }
  mongoose
    .connect(databaseUrl)
    .then(() => {
      console.log("MongoDB connection successful");
    })
    .catch((err) => {
      console.error("MongoDB connection failed:", err);
      mongodbConnection();
    });
};
