import { Request, Response } from "express";
import axios from "axios";

const APP_ID = process.env.INSTAGRAM_APP_ID || "1015452860015692";
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET || "76a8b193787892f6bf2459abeb935d7b";

const REDIRECT_URI =
    "https://dev.thesocialme.in/auth/instagram/callback";

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

        const deepLink = state === 'android'
            ? `com.lynkupapplication.android://instagram-auth?access_token=${accessToken}&user_id=${userId}`
            : `com.ios.socialme://instagram-auth?access_token=${accessToken}&user_id=${userId}`;

        // NOTE: res.redirect() with custom schemes (com.xxx://) is blocked by Chrome on Android
        // when the server is on HTTPS. We must serve an HTML page that uses JS to trigger the deep link.
        res.send(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Redirecting to LynkUp...</title>
    <style>
      body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
      .box { text-align: center; padding: 2rem; }
      p { color: #666; margin-top: 1rem; }
    </style>
  </head>
  <body>
    <div class="box">
      <h2>Redirecting to LynkUp...</h2>
      <p>If the app doesn't open automatically, please relaunch it.</p>
    </div>
    <script>
      window.location.href = ${JSON.stringify(deepLink)};
    </script>
  </body>
</html>`);

    } catch (err: any) {

        console.error(err.response?.data || err);
        res.status(500).json(err.response?.data || err.message);

    }

};