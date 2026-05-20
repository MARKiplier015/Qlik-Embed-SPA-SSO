/**
 * QlikPortal — Main Application
 * Orchestrates Auth0 SSO + Qlik Sense embedding
 */

// ─── DOM References ─────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const loadingScreen   = $('loading-screen');
const loginPage       = $('login-page');
const appShell        = $('app-shell');
const loginBtn        = $('login-btn');
const logoutBtn       = $('logout-btn');
const userNameEl      = $('user-name');
const userEmailEl     = $('user-email');
const userAvatarEl    = $('user-avatar');
const qlikLoading     = $('qlik-loading');
const qlikFrameWrapper = $('qlik-frame-wrapper');
const configRequired  = $('config-required');
const qlikIframe      = $('qlik-iframe');
const progressFill    = $('progress-fill');
const sidebarEl       = $('sidebar');
const sidebarToggle   = $('sidebar-toggle');
const connectBtn      = $('connect-btn');
const breadcrumbCurrent = $('breadcrumb-current');
const qlikStatusEl    = $('qlik-status');

// ─── App State ──────────────────────────────────────────────────────────────
const state = {
  authenticated: false,
  user: null,
  accessToken: null,
  qlikConnected: false,
  currentDashboard: 'overview',
};

// Dashboard label map
const DASHBOARD_LABELS = {
  overview:   'Overview',
  sales:      'Sales Analytics',
  operations: 'Operations',
  finance:    'Finance',
  custom:     'Custom Report',
};

// ─── Boot ───────────────────────────────────────────────────────────────────
async function boot() {
  try {
    const authenticated = await window.authManager.init();

    if (authenticated) {
      state.authenticated = true;
      state.user = authManager.getUser();
      state.accessToken = authManager.getAccessToken();
      showApp();
    } else {
      showLogin();
    }
  } catch (err) {
    console.error('[App] Boot error:', err);
    showLogin();
  } finally {
    hideLoadingScreen();
  }
}

// ─── UI State Transitions ────────────────────────────────────────────────────
function hideLoadingScreen() {
  loadingScreen.style.opacity = '0';
  setTimeout(() => loadingScreen.classList.add('hidden'), 400);
}

function showLogin() {
  loginPage.classList.remove('hidden');
  loginPage.classList.add('fade-in');
}

function showApp() {
  loginPage.classList.add('hidden');
  appShell.classList.remove('hidden');
  appShell.classList.add('fade-in');

  populateUserInfo();
  initQlikDashboard();
}

function populateUserInfo() {
  const user = state.user;
  if (!user) return;

  userNameEl.textContent = user.name || user.nickname || 'User';
  userEmailEl.textContent = user.email || '';

  // Avatar: initials or picture
  if (user.picture) {
    userAvatarEl.style.background = 'none';
    userAvatarEl.innerHTML = `<img src="${user.picture}" alt="avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
  } else {
    const initials = (user.name || user.email || 'U')
      .split(' ')
      .map(w => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    userAvatarEl.textContent = initials;
  }
}

// ─── Qlik Dashboard ─────────────────────────────────────────────────────────
function initQlikDashboard() {
  // Try to load saved Qlik config from session
  const hasSavedConfig = window.qlikEmbedManager.loadSavedConfig();

  if (hasSavedConfig) {
    loadQlikDashboard();
  } else {
    showConfigRequired();
  }
}

function showConfigRequired() {
  qlikLoading.classList.add('hidden');
  qlikFrameWrapper.classList.add('hidden');
  configRequired.classList.remove('hidden');

  updateQlikStatus('disconnected');
}

function showQlikLoading() {
  configRequired.classList.add('hidden');
  qlikFrameWrapper.classList.add('hidden');
  qlikLoading.classList.remove('hidden');

  animateProgressBar();
}

function showQlikFrame() {
  qlikLoading.classList.add('hidden');
  configRequired.classList.add('hidden');
  qlikFrameWrapper.classList.remove('hidden');

  state.qlikConnected = true;
  updateQlikStatus('connected');
}

function updateQlikStatus(status) {
  const dot = qlikStatusEl.querySelector('.status-dot');
  const text = qlikStatusEl.querySelector('.status-text');

  if (status === 'connected') {
    dot.classList.remove('error');
    dot.classList.add('qlik');
    text.textContent = 'Qlik Connected';
  } else {
    dot.classList.remove('qlik');
    dot.classList.add('error');
    text.textContent = 'Qlik Disconnected';
  }
}

function animateProgressBar() {
  let progress = 0;
  progressFill.style.width = '0%';

  const interval = setInterval(() => {
    // Simulate realistic loading: fast then slow
    const increment = progress < 60 ? 8 : progress < 85 ? 3 : 0.5;
    progress = Math.min(progress + increment, 92);
    progressFill.style.width = `${progress}%`;

    if (progress >= 92) clearInterval(interval);
  }, 200);

  return () => {
    clearInterval(interval);
    progressFill.style.width = '100%';
  };
}

async function loadQlikDashboard() {
  showQlikLoading();

  try {
    // Get a fresh access token (in case it expired)
    const token = await authManager.refreshToken() || state.accessToken;

    // Small delay to show the loading animation
    await new Promise(resolve => setTimeout(resolve, 1200));

    await qlikEmbedManager.embed(qlikIframe, token, () => {
      showQlikFrame();
    });

    // Fallback: show frame after 3s even if onload doesn't fire
    setTimeout(() => {
      if (!state.qlikConnected) showQlikFrame();
    }, 3000);

  } catch (err) {
    console.error('[Qlik] Load error:', err);
    showConfigRequired();
  }
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
sidebarToggle.addEventListener('click', () => {
  sidebarEl.classList.toggle('collapsed');
});

// Nav item clicks
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();

    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');

    const dashboard = item.dataset.dashboard;
    state.currentDashboard = dashboard;
    breadcrumbCurrent.textContent = DASHBOARD_LABELS[dashboard] || dashboard;

    // If Qlik is connected, reload with the new sheet context
    // (In production, each nav item would map to a different Qlik App/Sheet ID)
    if (state.qlikConnected) {
      handleDashboardSwitch(dashboard);
    }
  });
});

function handleDashboardSwitch(dashboard) {
  // Map dashboard names to sheet IDs if needed
  // In a real app, you'd store a mapping: { overview: 'sheet-id-1', sales: 'sheet-id-2', ... }
  const sheetMap = {
    overview:   null,   // default sheet
    sales:      null,
    operations: null,
    finance:    null,
    custom:     null,
  };

  const newSheetId = sheetMap[dashboard];

  // Update config and reload
  const currentConfig = JSON.parse(sessionStorage.getItem('qlik_config') || '{}');
  currentConfig.sheetId = newSheetId;
  qlikEmbedManager.configure(currentConfig);

  state.qlikConnected = false;
  loadQlikDashboard();
}

// ─── Connect Button ──────────────────────────────────────────────────────────
connectBtn.addEventListener('click', () => {
  const host = $('qlik-host').value.trim();
  const appId = $('qlik-app-id').value.trim();
  const sheetId = $('qlik-sheet-id').value.trim() || null;

  if (!host || !appId) {
    showInputError('qlik-host', !host);
    showInputError('qlik-app-id', !appId);
    return;
  }

  // Detect mode: if host has .qlikcloud.com, it's SaaS
  const mode = host.includes('qlikcloud.com') ? 'cloud' : 'enterprise';

  qlikEmbedManager.configure({ host, appId, sheetId, mode });

  console.log(`[Qlik] Configured: ${mode} mode | ${host} | App: ${appId}`);

  loadQlikDashboard();
});

function showInputError(inputId, show) {
  const input = $(inputId);
  if (show) {
    input.style.borderColor = '#ff6b6b';
    input.style.boxShadow = '0 0 0 3px rgba(255,107,107,0.15)';
    setTimeout(() => {
      input.style.borderColor = '';
      input.style.boxShadow = '';
    }, 2000);
  }
}

// ─── Auth Actions ─────────────────────────────────────────────────────────────
loginBtn.addEventListener('click', () => authManager.login());
logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('qlik_config');
  authManager.logout();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
boot();
