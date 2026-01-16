
// ⚠️ Redis temporarily disabled - Uncomment when Redis is installed
import { createClient } from "redis";
// const client = createClient();
const client: any = null;  // Temporarily disabled
let isConnected = false;
const connectRedis = async () => {
    if (!isConnected) {
      try {
        await client.connect();
        console.log("⚠️ Redis is disabled - OTP storage will not work");
        isConnected = true; 
      } catch (error) {
        console.error("❌ Redis Connection Error:", error);
      }
    }
  };
// client.on("error", (err) => {
//   console.error("Redis Client Error:", err);
// });
export const storeOtp = async (storeKey: string, otp: string): Promise<void> => {
  try {
    if (!client) {
      console.warn("⚠️ Redis disabled - OTP not stored:", storeKey);
      return;
    }
    const key = `otp:${storeKey}`;
    await client.set(key, otp, { EX: 300 }); // 5 min expiration
    console.log(`🔐 OTP stored: ${storeKey}`);
  } catch (error) {
    console.error("❌ Failed to store OTP:", error);
  }
};
export const retrieveOtp = async (storeKey: string): Promise<string | null> => {
  try {
    if (!client) {
      console.warn("⚠️ Redis disabled - Cannot retrieve OTP:", storeKey);
      return null;
    }
    const key = `otp:${storeKey}`;
    return await client.get(key);
  } catch (error) {
    console.error("❌ Failed to retrieve OTP:", error);
    return null;
  }
};
export const storeDetails = async (storeKey: string, details: object): Promise<void> => {
  try {
    if (!client) {
      console.warn("⚠️ Redis disabled - Details not stored:", storeKey);
      return;
    }
    const key = `details:${storeKey}`;
    console.log("Key",key)
    await client.set(key, JSON.stringify(details));
    console.log(`💾 User details stored: ${storeKey}`);
  } catch (error) {
    console.error("❌ Failed to store details:", error);
  }
};
export const retrieveDetails = async (storeKey: string): Promise<object | null> => {
  try {
    if (!client) {
      console.warn("⚠️ Redis disabled - Cannot retrieve details:", storeKey);
      return null;
    }
    const key = `details:${storeKey}`;
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error("❌ Failed to retrieve details:", error);
    return null;
  }
};

// ⚠️ Redis disabled - No auto-connection
// When you enable Redis, uncomment the lines above and remove the null assignment
export { client };
