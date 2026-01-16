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
import { startSubscriptionCronJobs } from "./src/Cron/SubscriptionCron";
import { errorHandler } from "./src/Middelware/errorHandler";
import axios from "axios";

dotenv.config();
const app = express();

// CORS configuration - allows specific origins and all others
const allowedOrigins = [
  "https://unrefulgently-epiphragmal-abram.ngrok-free.dev", // Ngrok frontend
  "https://lynkup.co.in",
  "https://www.lynkup.co.in",
  "http://localhost:3000",
  "http://localhost:5173",
  // Add more specific origins as needed
];

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow all origins (including the specific ones listed above)
    callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // Can use credentials when using function-based origin
  optionsSuccessStatus: 200,
  maxAge: 3600, // Cache preflight requests for 1 hour
};

app.use(cors(corsOptions));

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Define routes
userRoutes(app);
adminRoutes(app);
app.use("/api/subscription", subscriptionRoutes);

mongodbConnection();

// Start subscription cron jobs after database connection
startSubscriptionCronJobs();

// updateOfferStatus()
cron.schedule("0 0 * * *", updateOfferStatus);
// cron.schedule("* * * * *", updateOfferStatus);

app.use(errorHandler);

app.get("/", (req: Request, res: Response) => {
  res.send("SocialMe Backend!");
});

// Instagram OAuth callback
app.get("/auth/instagram/callback", async (req, res) => {
  const { code } = req.query;
  console.log(code, "object");
  try {
    // Exchange code for access token
    // const tokenResponse:any = await axios.post(
    //   "https://api.instagram.com/oauth/access_token",
    //   {
    //     client_id: "1015452860015692",
    //     client_secret: "76a8b193787892f6bf2459abeb935d7b",
    //     grant_type: "authorization_code",
    //     redirect_uri: "https://lynkupapi.lynkup.co.in/auth/instagram/callback",
    //     code,
    //   }
    // );
    // console.log(tokenResponse.data);
    
    // Return token to your app
    res.redirect(`https://socialmeapi.testenvapp.com/auth/instagram/callback1?code=${code}`);
  } catch (error) {
    console.log(error);
    res.redirect("lynkup://auth?error=instagram_failed");
  }
});

const port = process.env.PORT || 8089;

// ⚠️ Redis disabled - Starting server without Redis connection
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
  console.log(`CORS enabled for:`);
  console.log(`  - https://unrefulgently-epiphragmal-abram.ngrok-free.dev`);
  console.log(`  - All other origins`);
});
