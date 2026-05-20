/**
 * Auth0 Configuration & Authentication Module
 *
 * SETUP: Replace these values with your Auth0 application credentials.
 *
 * Steps:
 * 1. Go to https://manage.auth0.com → Applications → Create Application
 * 2. Choose "Single Page Application"
 * 3. In Settings, add your app URL to:
 *    - Allowed Callback URLs
 *    - Allowed Logout URLs
 *    - Allowed Web Origins
 * 4. Replace the values below with your credentials
 */

const AUTH0_CONFIG = {
  domain: "dev-7gkybsc2455c87y6.us.auth0.com", // e.g. "your-tenant.auth0.com"
  clientId: "foLjTCGRSlJlR2s3i8sPjRDVRdgD6FBd", // From Auth0 Application Settings
  authorizationParams: {
    redirect_uri: window.location.origin,
    /**
     * IMPORTANT FOR QLIK SSO:
     * Add your Qlik audience here so Auth0 includes Qlik in the token scope.
     * This enables automatic Qlik authorization via JWT/OIDC.
     *
     * For Qlik Cloud (SaaS):
     *   audience: 'https://your-tenant.us.qlikcloud.com'
     *
     * For Qlik Sense Enterprise (on-prem with Virtual Proxy):
     *   audience: 'https://your-qlik-server/jwt'
     */
    audience: "https://3nyq77e2zsd7w6i.sg.qlikcloud.com",
    scope: "openid profile email",
  },
};

/**
 * AuthManager — wraps Auth0 SPA SDK
 * Provides:
 *  - login()
 *  - logout()
 *  - getUser()
 *  - getAccessToken()   ← used to authenticate Qlik silently
 *  - isAuthenticated()
 */
class AuthManager {
  constructor() {
    this.client = null;
    this.user = null;
    this.accessToken = null;
  }

  async init() {
    try {
      this.client = await auth0.createAuth0Client(AUTH0_CONFIG);

      // Handle redirect callback after Auth0 login
      if (
        window.location.search.includes("code=") &&
        window.location.search.includes("state=")
      ) {
        await this.client.handleRedirectCallback();
        // Clean up URL
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname,
        );
      }

      const authenticated = await this.client.isAuthenticated();

      if (authenticated) {
        this.user = await this.client.getUser();
        this.accessToken = await this.client.getTokenSilently();
      }

      return authenticated;
    } catch (err) {
      console.error("[Auth0] Initialization error:", err);
      return false;
    }
  }

  async login() {
    try {
      await this.client.loginWithRedirect();
    } catch (err) {
      console.error("[Auth0] Login error:", err);
    }
  }

  async logout() {
    try {
      await this.client.logout({
        logoutParams: {
          returnTo: window.location.origin,
        },
      });
    } catch (err) {
      console.error("[Auth0] Logout error:", err);
    }
  }

  getUser() {
    return this.user;
  }

  getAccessToken() {
    return this.accessToken;
  }

  async refreshToken() {
    try {
      this.accessToken = await this.client.getTokenSilently({
        ignoreCache: true,
      });
      return this.accessToken;
    } catch (err) {
      console.error("[Auth0] Token refresh error:", err);
      return null;
    }
  }
}

// Export singleton
window.authManager = new AuthManager();
