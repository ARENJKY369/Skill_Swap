# Social OAuth2 Setup Guide

SkillSwap implements server-side OAuth 2.0 Authorization Code flows (with cryptographic `state` validation, PKCE `S256`, and verified-email anti-takeover checks) for **Google**, **Facebook**, **X (Twitter)**, and **LinkedIn**.

All OAuth credentials live **exclusively on the backend** via environment variables or `.env`. Never add `VITE_*` prefixes or commit client secrets to Git.

---

## Architecture & Endpoints

1. **Authorization start (browser full-page redirect):**
   - `GET /oauth2/authorization/{provider}` (`google`, `facebook`, `twitter`, `linkedin`)
2. **Authorization callback (registered with the provider):**
   - Default port (`PORT=8787`, `PUBLIC_BASE_URL=http://localhost:8787`):
     - `http://localhost:8787/login/oauth2/code/google`
     - `http://localhost:8787/login/oauth2/code/facebook`
     - `http://localhost:8787/login/oauth2/code/twitter`
     - `http://localhost:8787/login/oauth2/code/linkedin`
   - If running the backend on port `8080` (`PORT=8080`, `PUBLIC_BASE_URL=http://localhost:8080`):
     - `http://localhost:8080/login/oauth2/code/google`
     - `http://localhost:8080/login/oauth2/code/facebook`
     - `http://localhost:8080/login/oauth2/code/twitter`
     - `http://localhost:8080/login/oauth2/code/linkedin`
3. **Post-login destination:**
   - Issues an `HttpOnly`, `SameSite=Lax` (`Secure` in production) session cookie and redirects to `${FRONTEND_URL}/#/app`.
   - On cancellation or provider error, redirects safely to `${FRONTEND_URL}/#/login?oauthError=...`.
4. **Account takeover protection:**
   - Existing local accounts are **never** auto-linked by email unless the OAuth provider explicitly confirms the email address is verified.

---

## 1. Google

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project, then go to **APIs & Services → OAuth consent screen**:
   - Choose **External** (or **Internal** for Google Workspace), fill in the app name (`SkillSwap`) and developer contact email.
   - Add scopes: `openid`, `email`, `profile`.
   - While in Testing mode, add your Google account under **Test users**.
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins:
     - `http://localhost:5173`
     - `http://localhost:8787` (or `http://localhost:8080` if `PORT=8080`)
   - Authorized redirect URIs:
     - `http://localhost:8787/login/oauth2/code/google` (or `http://localhost:8080/login/oauth2/code/google` if `PORT=8080`)
4. Copy the Client ID and Client Secret into `.env`:
   ```dotenv
   GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   ```
5. **Scopes requested:** `openid email profile`

---

## 2. Facebook (Meta)

1. Open [Meta for Developers](https://developers.facebook.com/apps/) and click **Create App**.
2. Choose **Authenticate and request data from users with Facebook Login** (Consumer/Web).
3. In the app dashboard, open **Use cases → Authenticate and request data → Customize**:
   - Ensure the **`email`** and **`public_profile`** permissions are enabled.
4. Open **Facebook Login → Settings**:
   - Enable **Client OAuth Login** and **Web OAuth Login**.
   - Add **Valid OAuth Redirect URIs**:
     - `http://localhost:8787/login/oauth2/code/facebook` (or `http://localhost:8080/login/oauth2/code/facebook` if `PORT=8080`)
5. Open **App settings → Basic** and copy **App ID** and **App secret** into `.env`:
   ```dotenv
   FACEBOOK_CLIENT_ID=your-facebook-app-id
   FACEBOOK_CLIENT_SECRET=your-facebook-app-secret
   ```
6. **Scopes requested:** `email public_profile`

---

## 3. X (Twitter)

1. Open the [X Developer Portal](https://developer.x.com/en/portal/dashboard) and create a Project + App.
2. Under **User authentication settings**, click **Set up**:
   - App permissions: **Read**
   - Enable **Request email from users** (requires Privacy Policy URL and Terms of Service URL; for local dev you can use `http://localhost:5173/#/legal`).
   - Type of App: **Web App, Automated App or Bot** (Confidential client — uses PKCE `S256` + client secret).
   - Callback URI / Redirect URL:
     - `http://localhost:8787/login/oauth2/code/twitter` (or `http://localhost:8080/login/oauth2/code/twitter` if `PORT=8080`)
   - Website URL: `http://localhost:5173`
3. Save and copy the **OAuth 2.0 Client ID** and **Client Secret** (not the OAuth 1.0a API Key) into `.env`:
   ```dotenv
   TWITTER_CLIENT_ID=your-x-oauth2-client-id
   TWITTER_CLIENT_SECRET=your-x-oauth2-client-secret
   ```
4. **Scopes requested:** `users.read tweet.read users.email`

---

## 4. LinkedIn

1. Open the [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps) and click **Create app**.
2. Fill in the app name, associate a LinkedIn Page, and upload an app logo.
3. Under the **Products** tab, request access to **Sign In with LinkedIn using OpenID Connect** (instant approval).
4. Under the **Auth** tab, add **Authorized redirect URLs for your app**:
   - `http://localhost:8787/login/oauth2/code/linkedin` (or `http://localhost:8080/login/oauth2/code/linkedin` if `PORT=8080`)
5. Copy **Client ID** and **Primary Client Secret** from the **Auth** tab into `.env`:
   ```dotenv
   LINKEDIN_CLIENT_ID=your-linkedin-client-id
   LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret
   ```
6. **Scopes requested:** `openid profile email`

---

## Verifying Configuration

Restart the backend after editing `.env`. You can verify which providers are active (without exposing any secrets) via:

```powershell
Invoke-RestMethod http://localhost:8787/api/auth/oauth/providers
```

Unconfigured providers remain visibly marked as unavailable on the sign-in screen and display `"<Provider> sign-in is not configured on this server"` instead of failing silently.
