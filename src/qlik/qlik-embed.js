/**
 * Qlik Sense SSO Embed Module
 *
 * This module handles:
 * 1. Generating a JWT-authenticated Qlik URL using the Auth0 access token
 * 2. Embedding the Qlik app/sheet in an iframe without prompting for login
 * 3. Supporting both Qlik Cloud (SaaS) and Qlik Sense Enterprise (on-prem)
 *
 * ─── HOW THE SSO FLOW WORKS ─────────────────────────────────────────────────
 *
 * [User logs in via Auth0]
 *       ↓
 * [Auth0 issues access_token with Qlik audience]
 *       ↓
 * [This module appends token to Qlik URL as ?qlik_auth_token=<token>]
 *  — OR — calls /qps/user/jwt endpoint (on-prem) to pre-authenticate
 *       ↓
 * [Qlik validates JWT against Auth0 JWKS endpoint]
 *       ↓
 * [User sees dashboard — no separate Qlik login required]
 *
 * ─── QLIK CLOUD SETUP ────────────────────────────────────────────────────────
 * 1. In Qlik Cloud Management Console → Identity Providers → Add IdP
 * 2. Choose "Auth0" (or Generic OIDC)
 * 3. Set Discovery URL: https://YOUR_AUTH0_DOMAIN/.well-known/openid-configuration
 * 4. Set Client ID + Secret from Auth0
 * 5. Map claims: sub, email, name
 *
 * ─── QLIK SENSE ENTERPRISE (ON-PREM) SETUP ──────────────────────────────────
 * 1. Create a Virtual Proxy with JWT authentication
 * 2. Set JWT Public Key Certificate (from Auth0 signing key)
 * 3. Set header name: Authorization  |  prefix: Bearer
 * 4. Map user attributes from JWT claims
 */

class QlikEmbedManager {
  constructor() {
    this.host = "3nyq77e2zsd7w6i.sg.qlikcloud.com";
    this.appId = "2b7654d7-2d56-47c4-b1bb-2f88aebaa377";
    this.sheetId = "FCFWtf";
    this.mode = "cloud"; // 'cloud' | 'enterprise'
  }

  /**
   * Configure the Qlik connection
   */
  configure({ host, appId, sheetId = null, mode = "cloud" }) {
    this.host = host.replace(/\/$/, ""); // strip trailing slash
    this.appId = appId;
    this.sheetId = sheetId;
    this.mode = mode;

    // Persist config to sessionStorage
    sessionStorage.setItem(
      "qlik_config",
      JSON.stringify({ host, appId, sheetId, mode }),
    );
  }

  loadSavedConfig() {
    const saved = sessionStorage.getItem("qlik_config");
    if (saved) {
      const config = JSON.parse(saved);
      this.configure(config);
      return true;
    }
    return false;
  }

  /**
   * Build the authenticated Qlik URL
   *
   * For Qlik Cloud: Uses OIDC via the /sense/app/ endpoint.
   * The Auth0 session is forwarded via cookie after the IDP is configured.
   *
   * For Qlik Sense Enterprise: Builds a JWT virtual proxy URL.
   */
  buildEmbedUrl(accessToken) {
    if (!this.host || !this.appId) {
      throw new Error("Qlik host and appId are required");
    }

    if (this.mode === "cloud") {
      return this.buildCloudUrl(accessToken);
    } else {
      return this.buildEnterpriseUrl(accessToken);
    }
  }

  buildCloudUrl(accessToken) {
    /**
     * Qlik Cloud SSO URL format:
     * Single sheet:   https://<tenant>/sense/app/<appId>/sheet/<sheetId>/state/analysis
     * Full app:       https://<tenant>/sense/app/<appId>
     *
     * Auth is handled via OIDC/cookie established when Auth0 IDP is configured.
     * The access token can also be passed as a Bearer token in the request header
     * using the Nebula.js / qlik-embed approach.
     */
    const base = `https://${this.host}/sense/app/${encodeURIComponent(this.appId)}`;
    const path = this.sheetId
      ? `/sheet/${encodeURIComponent(this.sheetId)}/state/analysis`
      : "";

    // Embed options: opt=currsheetid removes toolbar for clean embed
    const params = new URLSearchParams({
      opt: "currsheetid",
    });

    return `${base}${path}?${params.toString()}`;
  }

  buildEnterpriseUrl(accessToken) {
    /**
     * Qlik Sense Enterprise JWT Virtual Proxy URL format:
     * https://<server>/<virtualProxyPrefix>/sense/app/<appId>/sheet/<sheetId>
     *
     * The JWT is passed via URL parameter for the initial handshake,
     * then Qlik establishes a session cookie.
     */
    const virtualProxyPrefix = "jwt"; // Change to match your virtual proxy prefix
    const base = `https://${this.host}/${virtualProxyPrefix}/sense/app/${encodeURIComponent(this.appId)}`;
    const path = this.sheetId
      ? `/sheet/${encodeURIComponent(this.sheetId)}/state/analysis`
      : "";

    const params = new URLSearchParams({
      qlik_auth_token: accessToken, // Virtual proxy reads this for initial auth
    });

    return `${base}${path}?${params.toString()}`;
  }

  /**
   * Load Qlik into the iframe with authenticated URL
   */
  async embed(iframeElement, accessToken, onLoad) {
    if (!iframeElement) throw new Error("iframe element is required");

    const url = this.buildEmbedUrl(accessToken);

    console.log("[Qlik] Embedding URL:", url.split("?")[0] + "?[params]");

    iframeElement.onload = () => {
      console.log("[Qlik] Dashboard loaded successfully");
      if (onLoad) onLoad();
    };

    iframeElement.onerror = (err) => {
      console.error("[Qlik] iframe load error:", err);
    };

    iframeElement.src = url;
  }

  /**
   * For Qlik Cloud with Nebula.js / qlik-embed web component approach.
   * This is the modern, preferred method for Qlik Cloud.
   *
   * Usage (in HTML):
   *   <script type="module" src="https://cdn.jsdelivr.net/npm/@qlik/embed-web-components"></script>
   *   <qlik-embed ui="analytics/app" app-id="..." sheet-id="..."></qlik-embed>
   *
   * Then configure the host with your access token:
   *   embed(host, { authStrategy: ... })
   */
  buildNebulaConfig(accessToken) {
    return {
      host: this.host,
      authStrategy: {
        type: "oauth2",
        // Auth0 issues the token; Qlik Cloud accepts it via OIDC IDP config
        getAccessToken: () => Promise.resolve(accessToken),
      },
    };
  }
}

window.qlikEmbedManager = new QlikEmbedManager();
