import express, { Request, Response } from "express";
import dotenv from "dotenv";
import path from "path";
import cors from "cors";
import cron from "node-cron";
import { mongodbConnection } from "./src/Connections/DatabaseConnection";
// import { client } from "./src/Connections/RedisConnection";  // Temporarily disabled
import { updateOfferStatus } from "./src/Connections/cron";
import { userRoutes } from "./src/Routes/authRoutes";
import { adminRoutes } from "./src/Routes/adminRoutes";
import subscriptionRoutes from "./src/Routes/SubscriptionRoutes";
import { payoutRoutes } from "./src/Routes/PayoutRoutes";
import { startSubscriptionCronJobs } from "./src/Cron/SubscriptionCron";
import { errorHandler } from "./src/Middelware/errorHandler";
import axios from "axios";

dotenv.config();
const app = express();

// Import all models AFTER dotenv config
import "./src/Models/UserModel";
import "./src/Models/Booking";
import "./src/Models/offerModal";
import "./src/Models/Wallet";
import "./src/Models/WalletTransaction";

// ✅ CORS - Allow all origins (DEV FRIENDLY)
// app.use(
//   cors({
//     origin: true,        // allows all origins dynamically
//     credentials: true, 
//     Headers: true   // allow cookies/auth headers
//   })
// );

app.use(
  cors({
    origin: [
      "https://jovial-sunflower-ad586a.netlify.app",
      "https://mypaaltu.com",
      "https://www.mypaaltu.com",
      "http://localhost:3000",
      "http://localhost:5173",
    ],
    credentials: true,
  })
);
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Routes
userRoutes(app);
adminRoutes(app);
app.use("/api/subscription", subscriptionRoutes);
payoutRoutes(app);

// DB Connection
mongodbConnection();

// Cron Jobs
startSubscriptionCronJobs();
cron.schedule("0 0 * * *", updateOfferStatus);
// cron.schedule("* * * * *", updateOfferStatus);

// Error Handler
app.use(errorHandler);

// Test route
app.get("/", (req: Request, res: Response) => {
  res.send("New TEST BACKEND IS WORKING");
});

// Instagram OAuth callback
// app.get("/auth/instagram/callback", async (req: Request, res: Response) => {
//   const { code } = req.query;

//   try {
//     res.redirect(
//       `https://socialmeapi.testenvapp.com/auth/instagram/callback1?code=${code}`
//     );
//   } catch (error) {
//     console.error("Instagram callback error:", error);
//     res.redirect("lynkup://auth?error=instagram_failed");
//   }
// });

// app.use(
//   "/auth/instagram",
//   require("./routes/instagramcallback.routes")
// );

const port = process.env.PORT || 8089;

// Start server
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
