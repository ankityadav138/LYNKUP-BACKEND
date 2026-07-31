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

        const isAndroid = state === 'android';

        // For Android: use intent:// URL — Chrome's native app-opening mechanism, never blocked.
        // Format: intent://<host>?<params>#Intent;scheme=<scheme>;package=<package>;end
        const androidIntent = `intent://instagram-auth?access_token=${accessToken}&user_id=${userId}#Intent;scheme=com.lynkupapplication.android;package=com.lynkupapplication.android;end`;

        // For iOS: use custom scheme (Safari handles this fine)
        const iosDeepLink = `com.ios.socialme://instagram-auth?access_token=${accessToken}&user_id=${userId}`;

        const deepLink = isAndroid ? androidIntent : iosDeepLink;

        res.send(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Redirecting to LynkUp...</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
      .card { background: white; border-radius: 16px; padding: 2.5rem 2rem; text-align: center; max-width: 360px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
      .logo { font-size: 2.5rem; margin-bottom: 1rem; }
      h2 { color: #1a1a2e; font-size: 1.4rem; margin-bottom: 0.75rem; }
      p { color: #666; font-size: 0.95rem; line-height: 1.5; margin-bottom: 1.5rem; }
      .btn { display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 0.85rem 2rem; border-radius: 50px; text-decoration: none; font-weight: 600; font-size: 1rem; cursor: pointer; border: none; width: 100%; }
      .btn:active { opacity: 0.85; }
      .spinner { display: inline-block; width: 20px; height: 20px; border: 3px solid rgba(102,126,234,0.3); border-top-color: #667eea; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 1rem; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="logo">✨</div>
      <div class="spinner" id="spinner"></div>
      <h2>Opening LynkUp...</h2>
      <p>You've been authenticated with Instagram. Redirecting you back to the app...</p>
      <a href="${deepLink}" class="btn" id="openBtn">Open LynkUp App</a>
    </div>
    <script>
      // Attempt automatic redirect immediately
      window.location.href = "${deepLink}";

      // Hide spinner after 2s (whether app opened or not)
      setTimeout(function() {
        document.getElementById('spinner').style.display = 'none';
      }, 2000);
    </script>
  </body>
</html>`);

    } catch (err: any) {

        console.error(err.response?.data || err);
        res.status(500).json(err.response?.data || err.message);

    }

};