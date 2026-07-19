import { Request, Response } from "express";
import axios from "axios";

const APP_ID = process.env.INSTAGRAM_APP_ID || "1333143208929187";
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET || "01c51f9f1d28cf16d8798f94ceafc653";

const REDIRECT_URI =
    "https://testing.lynkup.co.in/auth/instagram/callback";

interface InstagramTokenResponse {
    access_token: string;
    user_id: string;
}

export const instagramCallback = async (req: Request, res: Response): Promise<void> => {

    try {

        const { code } = req.query;
        console.log("codessss", code);

        if (!code) {
            res.status(400).json({ error: "Authorization code is missing" });
            return;
        }

        const tokenResponse = await axios.post<InstagramTokenResponse>(
            "https://api.instagram.com/oauth/access_token",
            new URLSearchParams({
                client_id: APP_ID,
                client_secret: APP_SECRET,
                grant_type: "authorization_code",
                redirect_uri: REDIRECT_URI,
                code: code as string,
            }).toString(),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        );

        console.log("tokenresponsesss", tokenResponse.data);
        const accessToken: string = tokenResponse.data.access_token;
        console.log("accesstokenn==>", accessToken);
        const userId: string = tokenResponse.data.user_id;

        res.redirect(
            `com.lynkupapplication.android://instagram-auth?access_token=${accessToken}&user_id=${userId}`
        );

    } catch (err: any) {

        console.error(err.response?.data || err);
        res.status(500).json(err.response?.data || err.message);

    }

};