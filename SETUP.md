# QlikPortal — Auth0 SSO + Qlik Sense Integration Guide

## Architecture Overview

```
Browser
  │
  ├─► Auth0 (SSO Login)
  │     └─► Issues JWT access_token (with Qlik audience)
  │
  └─► QlikPortal Web App
        ├─► Validates session via Auth0 SDK
        └─► Embeds Qlik dashboard (no re-auth)
              └─► Qlik validates JWT via Auth0 JWKS
```

---

## Quick Start

### 1. Clone and serve locally

```bash
# Any static file server works
npx serve .
# or
python3 -m http.server 3000
```

Open `http://localhost:3000`

---

## Auth0 Setup

### Step 1 — Create Auth0 Application

1. Go to https://manage.auth0.com
2. Applications → **Create Application**
3. Name: `QlikPortal`, Type: **Single Page Application**
4. Go to **Settings** tab

### Step 2 — Configure Allowed URLs

| Field | Value |
|-------|-------|
| Allowed Callback URLs | `http://localhost:3000` |
| Allowed Logout URLs | `http://localhost:3000` |
| Allowed Web Origins | `http://localhost:3000` |

For production, replace with your actual domain.

### Step 3 — Update `src/auth/auth0-config.js`

```javascript
const AUTH0_CONFIG = {
  domain: 'your-tenant.auth0.com',      // ← Your Auth0 domain
  clientId: 'YOUR_CLIENT_ID',           // ← From Settings tab
  authorizationParams: {
    redirect_uri: window.location.origin,
    audience: 'https://your-tenant.us.qlikcloud.com',  // ← Qlik tenant URL
    scope: 'openid profile email',
  },
};
```

---

## Qlik Sense SSO Setup

### Option A: Qlik Cloud (SaaS) — Recommended

#### Step 1 — Configure Auth0 as Identity Provider

1. In Qlik Cloud Management Console → **Identity Providers** → **Add New**
2. Select **Generic OIDC**
3. Fill in:
   - **Discovery URL**: `https://YOUR_AUTH0_DOMAIN/.well-known/openid-configuration`
   - **Client ID**: Your Auth0 Application Client ID
   - **Client Secret**: Your Auth0 Application Client Secret
   - **Realm**: `auth0` (or any identifier)

#### Step 2 — Map User Claims

| Qlik Attribute | Auth0 Claim |
|----------------|-------------|
| Subject | `sub` |
| Email | `email` |
| Name | `name` |
| Groups | `https://your-app/groups` (custom claim) |

#### Step 3 — Set Audience in Auth0

Create an **API** in Auth0:
1. Auth0 → **APIs** → **Create API**
2. Name: `Qlik Cloud`, Identifier: `https://your-tenant.us.qlikcloud.com`
3. Copy the identifier to `AUTH0_CONFIG.authorizationParams.audience`

---

### Option B: Qlik Sense Enterprise (On-Premises)

#### Step 1 — Create JWT Virtual Proxy

1. Qlik Management Console → **Proxies** → **Virtual Proxies** → **Create New**
2. Set:
   - **Prefix**: `jwt`
   - **Authentication module redirect**: JWT
3. Under **JWT** settings:
   - **JWT public key certificate**: Get from Auth0 → **Applications** → **Advanced** → **Certificates** (download PEM)
   - **JWT attribute for user ID**: `sub` or `email`
   - **JWT attribute for user directory**: `YOUR_DIRECTORY_NAME`

#### Step 2 — Update Embed Mode

In the app's connect form, enter your on-premise server hostname.
The code auto-detects `qlikcloud.com` for cloud; all other hosts use enterprise JWT mode.

---

## How SSO Flow Works (Step by Step)

```
1. User clicks "Continue with SSO"
   → Auth0 login page (branded)

2. User authenticates (username/password, Google, SAML, etc.)
   → Auth0 redirects back with authorization code

3. Auth0 SDK exchanges code for tokens:
   - id_token    (user identity)
   - access_token (scoped to Qlik audience)

4. App calls getTokenSilently() → gets access_token

5. App builds Qlik URL:
   - Qlik Cloud: session established via OIDC cookie (IDP configured)
   - On-prem:    JWT appended as ?qlik_auth_token=<token>

6. Qlik validates the JWT:
   - Fetches Auth0 public keys from JWKS endpoint
   - Verifies signature, expiry, audience
   - Maps claims to Qlik user

7. Dashboard renders — NO Qlik login prompt shown
```

---

## Production Checklist

- [ ] Replace `YOUR_AUTH0_DOMAIN` and `YOUR_AUTH0_CLIENT_ID` in `auth0-config.js`
- [ ] Set `audience` to your Qlik tenant URL
- [ ] Configure Auth0 as IDP in Qlik Cloud Management Console
- [ ] Create Auth0 API with Qlik tenant as identifier
- [ ] Set allowed URLs in Auth0 to your production domain
- [ ] Enable HTTPS (required for Auth0 in production)
- [ ] Consider using Auth0 Organizations for multi-tenant setups
- [ ] Map Qlik groups/roles from Auth0 custom claims for access control
- [ ] Store `qlik_host` and `qlik_app_id` in your backend config (not hardcoded)

---

## Adding Multiple Dashboards

In `src/app.js`, update `handleDashboardSwitch()`:

```javascript
const sheetMap = {
  overview:   'aaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  sales:      'bbbbbb-cccc-dddd-eeee-ffffffffffff',
  operations: 'cccccc-dddd-eeee-ffff-000000000000',
  finance:    'dddddd-eeee-ffff-0000-111111111111',
};
```

Each Sheet ID corresponds to a sheet within your Qlik app.
You can also point different nav items to entirely different Qlik Apps by changing `appId`.

---

## Token Refresh

Auth0 handles silent token refresh automatically. The app calls `getTokenSilently()` before each Qlik embed, so tokens are always fresh. For long-running sessions, configure **Refresh Token Rotation** in Auth0 Application settings.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Login required" in Qlik iframe | Auth0 IDP not configured in Qlik; check Step 1 of Qlik Cloud setup |
| Blank iframe | Check browser console for CORS or CSP errors; whitelist your app domain in Qlik |
| Token missing `aud` claim | Add `audience` to `AUTH0_CONFIG.authorizationParams` |
| On-prem JWT rejected | Verify the PEM certificate matches Auth0 signing key; check clock skew |
| Redirect loop | Ensure Callback URL in Auth0 exactly matches `window.location.origin` |
