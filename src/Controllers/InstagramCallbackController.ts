import { Request, Response } from "express";
import axios from "axios";

const APP_ID = process.env.INSTAGRAM_APP_ID || "1015452860015692";
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET || "76a8b193787892f6bf2459abeb935d7b";

const REDIRECT_URI =
    "https://unprofane-fluxionally-annalise.ngrok-free.dev/auth/instagram/callback";

interface InstagramTokenResponse {
    access_token: string;
    user_id: string;
}

export const instagramCallback = async (req: Request, res: Response): Promise<void> => {

    try {

        const { code, state, } = req.query;
        console.log("state--", state);

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

        if (state === 'android') {
            res.redirect(
                `com.lynkupapplication.android://instagram-auth?access_token=${accessToken}&user_id=${userId}`
            );
        } else {
            res.redirect(`com.ios.socialme://instagram-auth?access_token=${accessToken}&user_id=${userId}`)
        }

        // res.redirect(`com.ios.socialme://instagram-auth?access_token=${accessToken}&user_id=${userId}`)

    } catch (err: any) {

        console.error(err.response?.data || err);
        res.status(500).json(err.response?.data || err.message);

    }

};