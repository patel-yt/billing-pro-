const API_BASE = `${window.location.origin}/api`;

let currentUser = null;
let currentCart = [];
let currentScanning = null;
let allItems = [];
let allCoupons = [];
let couponLookupByCode = new Map();
let itemLookupByCode = new Map();
let itemLookupByName = new Map();
let allCategories = [];
let appSettings = {};
let chartInstances = {};
let appliedCouponData = null;
let billingScanPurpose = null;
let billingCouponModalStream = null;
let billingCouponModalInterval = null;
let billingCouponModalTrack = null;
let billingCouponTorchEnabled = false;
let billingCouponTorchSupported = false;
let itemBarcodeModalStream = null;
let itemBarcodeModalInterval = null;
let mobileSwipeHandlersBound = false;
let barcodeSupportNoticeShown = false;
let currentProfile = null;
let isProfileEditing = false;
let dashboardErrorNoticeAt = 0;
const defaultItemNameSuggestions = [
  'Notebook',
  'A4 Notebook',
  'Spiral Notebook',
  'Pen',
  'Pencil',
  'Eraser',
  'Sharpener',
  'Marker',
  'Highlighter',
  'Stapler',
  'Paper Clips',
  'Sticky Notes',
  'A4 Paper Ream',
  'File Folder',
  'Envelope',
  'Scissors',
  'Glue Stick',
  'Calculator',
  'USB Cable',
  'Charger',
  'Power Bank',
  'Headphones',
  'Mouse',
  'Keyboard',
  'Screen Protector',
  'Phone Case',
  'Battery AA',
  'Battery AAA',
  'Light Bulb',
  'Extension Board',
  'Switch',
  'Socket',
  'Wire',
  'Pipe',
  'Bolt',
  'Nut',
  'Screw',
  'Wrench',
  'Hammer',
  'Screwdriver',
  'Wiper Blade',
  'Engine Oil 1L',
  'Brake Pad',
  'Air Filter',
  'Spark Plug',
  'Car Battery',
  'Bike Helmet',
  'Chain Lube',
  'Tyre Tube',
  'Seat Cover',
  'Car Perfume',
  'Cleaning Cloth',
  'Detergent',
  'Dish Soap',
  'Hand Soap',
  'Shampoo',
  'Toothpaste',
  'Toothbrush',
  'Sanitary Pads',
  'Tissue Box',
  'Bottle 1L',
  'Biscuits Pack',
  'Chips Packet',
  'Cookies',
  'Milk 1L',
  'Bread',
  'Rice 1kg',
  'Sugar 1kg',
  'Cooking Oil 1L'
];

function rebuildCodeLookupMaps() {
  couponLookupByCode = new Map();
  itemLookupByCode = new Map();
  itemLookupByName = new Map();

  for (const coupon of allCoupons || []) {
    const code = String(coupon?.coupon_code || '').trim().toUpperCase();
    if (code) couponLookupByCode.set(code, coupon);
  }

  for (const item of allItems || []) {
    const code = String(item?.item_code || '').trim().toUpperCase();
    if (code) itemLookupByCode.set(code, item);

    const name = String(item?.item_name || '').trim().toLowerCase();
    if (name) itemLookupByName.set(name, item);
  }
}

// ============ FIREBASE CONFIG ============
let firebaseConfig = null;
const fallbackFirebaseConfig = {
  apiKey: 'AIzaSyAxzF0TuP0PTvjveszTpRWQg3LVqkZRBZA',
  authDomain: 'billing-management-472f6.firebaseapp.com',
  databaseURL: 'https://billing-management-472f6-default-rtdb.firebaseio.com',
  projectId: 'billing-management-472f6',
  storageBucket: 'billing-management-472f6.firebasestorage.app',
  messagingSenderId: '1050417456982',
  appId: '1:1050417456982:web:e1c617557bbab9ccf558f7',
  measurementId: 'G-C0EJTLTMBK'
};

let auth = null;

async function fetchFirebaseConfig() {
  if (window.__FIREBASE_CONFIG__) return window.__FIREBASE_CONFIG__;
  if (firebaseConfig) return firebaseConfig;
  try {
    const response = await fetch(`${API_BASE}/config/firebase`);
    if (response.ok) {
      firebaseConfig = await response.json();
      return firebaseConfig;
    }
  } catch (e) {
    // fallback below
  }
  firebaseConfig = fallbackFirebaseConfig;
  return firebaseConfig;
}

// Wait for Firebase to load
async function initFirebase() {
  if (typeof firebase === 'undefined') {
    console.error(' Firebase SDK not loaded yet');
    setTimeout(initFirebase, 100);
    return;
  }

  console.log(' Firebase SDK available');

  try {
    const config = await fetchFirebaseConfig();
    // Avoid initializing app multiple times in pages that already call initializeApp.
    if (firebase.apps && firebase.apps.length > 0) {
      console.log(' Firebase app already initialized');
      auth = firebase.auth();
    } else {
      firebase.initializeApp(config);
      auth = firebase.auth();
      console.log(' Firebase initialized');
    }
    startApp();
  } catch (error) {
    console.error(' Firebase init error:', error);
    // Fallback: allow app UI to boot even if Firebase is unavailable.
    auth = null;
    startApp();
  }
}

function startApp() {
  console.log(' Starting app with Firebase...');
  console.log(' Nav buttons count:', document.querySelectorAll('.nav-btn')?.length || 0);
  console.log(' Menu buttons count:', document.querySelectorAll('.menu-btn')?.length || 0);

  // Debug: log clicks to help diagnose unresponsive UI
  if (!window.__app_click_logger_installed) {
    window.__app_click_logger_installed = true;
    document.addEventListener('click', (ev) => {
      try {
        const t = ev.target;
        console.log(' CLICK on', t.tagName, t.id ? `#${t.id}` : '', t.className || '', t.innerText?.slice(0,30));
      } catch (e) {}
    }, { capture: true });
  }
  
  if (auth && typeof auth.onAuthStateChanged === 'function') {
    // Set up auth state listener
    auth.onAuthStateChanged(user => {
      console.log(' Auth state changed:', user ? user.email : 'logged out');
      
      if (user) {
        const providers = Array.isArray(user.providerData) ? user.providerData.map((p) => p?.providerId).filter(Boolean) : [];
        currentUser = {
          id: user.uid,
          email: user.email,
          username: user.displayName || user.email.split('@')[0],
          displayName: user.displayName || '',
          providers,
          isGoogleLogin: providers.includes('google.com')
        };
        console.log(' User logged in:', currentUser.email);
        showApp();
        setupEventListeners();
        loadAllData();
      } else {
        console.log(' No user, showing login page');
        currentUser = null;
        showLogin();
      }
    });
  } else {
    console.warn(' Firebase auth unavailable; checking local session');
    try {
      const savedLocal = localStorage.getItem('localUser');
      if (savedLocal) {
        currentUser = JSON.parse(savedLocal);
      }
    } catch (e) {}
    if (!currentUser) {
      showLogin();
    } else {
      showApp();
      setupEventListeners();
      loadAllData();
    }
  }
  
  // Check theme preference
  if (localStorage.getItem('darkMode') === 'true') {
    toggleTheme();
  }
  
  attachAuthHandlers();
  // Ensure navigation/menu handlers are attached for both layouts
  const navBtns = Array.from(document.querySelectorAll('.nav-btn'));
  const menuBtns = Array.from(document.querySelectorAll('.menu-btn'));
  console.log(' Attaching handlers - nav:', navBtns.length, 'menu:', menuBtns.length);
  navBtns.forEach(btn => {
    if (!btn.__app_bound) {
      btn.addEventListener('click', (e) => switchPage(e.target.dataset.page));
      btn.__app_bound = true;
    }
  });
  menuBtns.forEach(btn => {
    if (!btn.__app_bound) {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget || e.target;
        const page = target.dataset.page || target.getAttribute('data-page') || target.dataset.section;
        // fallback to onclick inline handlers if present
        if (page && typeof switchSection === 'function') switchSection(page);
      });
      btn.__app_bound = true;
    }
  });
  console.log(' App ready');
}

// ============ INITIALIZATION ============

// Initialize Firebase after resources load (or immediately if already loaded).
// Retry quietly for a short period if SDK isn't present yet so we don't spam the console.
(function initializeWhenReady() {
  console.log(' app.js loaded  scheduling Firebase initialization');
  let attempts = 0;
  const maxAttempts = 50; // ~5 seconds (50 * 100ms)

  function tryInit() {
    if (typeof firebase === 'undefined') {
      attempts += 1;
      if (attempts >= maxAttempts) {
        console.error(' Firebase SDK not available after waiting. Check network or SDK script tags.');
        // Continue with auth fallback path instead of leaving UI on loading.
        startApp();
        return;
      }
      // retry after short delay without noisy logs
      setTimeout(tryInit, 100);
      return;
    }
    // SDK available  initialize
    initFirebase();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    tryInit();
  } else {
    window.addEventListener('load', tryInit);
  }
})();

function attachAuthHandlers() {
  console.log(' Attaching auth handlers...');
  const loginBtn = document.getElementById('login-btn');
  const signupBtn = document.getElementById('signup-btn');
  
  console.log(' Login button found:', !!loginBtn);
  console.log(' Signup button found:', !!signupBtn);
  
  if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
    console.log(' Login button ready');
  } else {
    console.error(' Login button NOT found!');
  }
  
  if (signupBtn) {
    signupBtn.addEventListener('click', handleSignup);
    console.log(' Signup button ready');
  } else {
    console.error(' Signup button NOT found!');
  }
}

function handleLogin() {
  console.log(' Login clicked');
  
  if (!auth) {
    alert(' Auth not ready yet. Please wait...');
    console.error('Auth not initialized');
    return;
  }

  const email = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const loginBtn = document.getElementById('login-btn');
  
  console.log(' Email:', email);
  
  if (!email || !password) {
    alert(' Please enter email and password');
    return;
  }

  if (loginBtn) loginBtn.disabled = true;

  auth.signInWithEmailAndPassword(email, password)
    .then(userCredential => {
      console.log(' Login success:', userCredential.user.email);
      document.getElementById('login-username').value = '';
      document.getElementById('login-password').value = '';
    })
    .catch(error => {
      console.error(' Login error:', error.code, error.message);
      alert(' ' + error.message);
      if (loginBtn) loginBtn.disabled = false;
    });
}

function handleSignup() {
  console.log(' Signup clicked');
  
  if (!auth) {
    alert(' Auth not ready yet. Please wait...');
    console.error('Auth not initialized');
    return;
  }

  const email = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const signupBtn = document.getElementById('signup-btn');
  
  console.log(' Signup email:', email);
  
  if (!email || !password) {
    alert(' Please enter email and password (min 6 characters)');
    return;
  }

  if (password.length < 6) {
    alert(' Password must be at least 6 characters');
    return;
  }

  if (signupBtn) signupBtn.disabled = true;

  auth.createUserWithEmailAndPassword(email, password)
    .then(userCredential => {
      console.log(' Signup success:', userCredential.user.email);
      alert(' Account created! You are now logged in.');
      document.getElementById('login-username').value = '';
      document.getElementById('login-password').value = '';
    })
    .catch(error => {
      console.error(' Signup error:', error.code, error.message);
      alert(' ' + error.message);
      if (signupBtn) signupBtn.disabled = false;
    });
}

function logout() {
  if (!auth || typeof auth.signOut !== 'function') {
    currentUser = null;
    currentProfile = null;
    try { localStorage.removeItem('localUser'); } catch (e) {}
    showLogin();
    return;
  }
  if (confirm('Are you sure you want to logout?')) {
    auth.signOut().then(() => {
      console.log(' Logged out');
      currentUser = null;
      currentProfile = null;
    }).catch(error => {
      console.error(' Logout error:', error);
      alert('Error logging out: ' + error.message);
    });
  }
}

function showLogin() {
  console.log(' Showing login page');
  const loginPage = document.getElementById('login-page');
  const appContainer = document.getElementById('app-container');
  
  if (loginPage) loginPage.style.display = 'flex';
  if (appContainer) appContainer.style.display = 'none';
  
  // For home.html layout, redirect to login
  if (!loginPage && !appContainer) {
    window.location.href = 'login.html';
  }
}

function showApp() {
  console.log(' Showing app');
  const loginPage = document.getElementById('login-page');
  const appContainer = document.getElementById('app-container');
  const userInfo = document.getElementById('user-info');
  const loading = document.getElementById('loading');
  
  if (loginPage) loginPage.style.display = 'none';
  if (appContainer) appContainer.style.display = 'block';
  
  // For home.html layout - hide loading, show header/nav/main
  if (!loginPage && !appContainer) {
    if (loading) loading.style.display = 'none';
    const header = document.querySelector('header');
    const main = document.querySelector('main');
    if (header) header.style.display = 'flex';
    if (main) main.style.display = 'block';
  }
  
  if (userInfo && currentUser) {
    userInfo.textContent = getProfileDisplayName() || 'User';
  }
  updateProfileButtonLabel();
  loadUserProfile();
  console.log(' App displayed');
}

// ============ THEME TOGGLE ============

function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('darkMode', isDark);
}

function ensureCurrentUserId() {
  if (!currentUser) return null;
  if (!currentUser.id) {
    currentUser.id = currentUser.uid || currentUser.email || currentUser.username || null;
  }
  return currentUser.id || null;
}

function getProfileDisplayName() {
  return String(
    currentProfile?.full_name ||
    currentProfile?.fullName ||
    currentUser?.displayName ||
    currentUser?.username ||
    currentUser?.email ||
    ''
  ).trim();
}

function getInitialFromName(text) {
  const clean = String(text || '').trim();
  if (!clean) return 'P';
  const match = clean.match(/[A-Za-z0-9]/);
  return (match ? match[0] : clean.charAt(0)).toUpperCase();
}

function updateProfileButtonLabel() {
  const btn = document.getElementById('profile-btn');
  if (!btn) return;
  const displayName = getProfileDisplayName();
  btn.title = displayName ? `Profile: ${displayName}` : 'Profile';
}

function renderProfileSummary() {
  const box = document.getElementById('profile-summary');
  if (!box) return;

  const fullName = String(currentProfile?.full_name || currentProfile?.fullName || currentUser?.displayName || '').trim() || 'Not set';
  const email = String(currentUser?.email || currentProfile?.email || '').trim() || 'Not set';
  const phone = String(currentProfile?.phone || '').trim() || 'Not set';
  const address = String(currentProfile?.address || '').trim() || 'Not set';
  const city = String(currentProfile?.city || '').trim() || 'Not set';
  const state = String(currentProfile?.state || '').trim() || 'Not set';
  const pincode = String(currentProfile?.pincode || '').trim() || 'Not set';

  box.innerHTML = `
    <h3 style="margin-bottom:8px;">Saved Details</h3>
    <p><strong>Name:</strong> ${escapeHtml(fullName)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
    <p><strong>Address:</strong> ${escapeHtml(address)}</p>
    <p><strong>City:</strong> ${escapeHtml(city)}</p>
    <p><strong>State:</strong> ${escapeHtml(state)}</p>
    <p><strong>Pincode:</strong> ${escapeHtml(pincode)}</p>
  `;
}

function setProfileEditMode(editMode) {
  isProfileEditing = Boolean(editMode);
  const formFields = document.getElementById('profile-form-fields');
  const summary = document.getElementById('profile-summary');
  const updateBtn = document.getElementById('profile-save-btn');

  if (formFields) formFields.style.display = isProfileEditing ? 'block' : 'none';
  if (summary) summary.style.display = isProfileEditing ? 'none' : 'block';
  if (updateBtn) updateBtn.textContent = isProfileEditing ? 'Save Changes' : 'Update';
}

function getLocalProfileKey(email) {
  return `userProfile:${String(email || '').trim().toLowerCase()}`;
}

function readLocalProfile(email) {
  try {
    const raw = localStorage.getItem(getLocalProfileKey(email));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeLocalProfile(email, profile) {
  try {
    localStorage.setItem(getLocalProfileKey(email), JSON.stringify(profile || {}));
  } catch (e) {}
}

async function loadUserProfile() {
  if (!currentUser?.email) return;
  try {
    const response = await fetch(`${API_BASE}/profile?email=${encodeURIComponent(currentUser.email)}`);
    if (!response.ok) {
      currentProfile = readLocalProfile(currentUser.email) || null;
    } else {
      currentProfile = await response.json();
    }

    const userInfo = document.getElementById('user-info');
    const preferredName = getProfileDisplayName();
    const explicitName = String(currentProfile?.full_name || currentProfile?.fullName || currentUser?.displayName || '').trim();
    if (userInfo) {
      userInfo.textContent = preferredName || 'User';
    }
    updateProfileButtonLabel();
    renderProfileSummary();
    if (!isProfileEditing) setProfileEditMode(false);

    const requiresName = Boolean(currentUser?.isGoogleLogin) && !explicitName;
    if (requiresName) {
      showNotification('Please complete your profile. Name is required for Google login users.', 'error');
      openProfileModal(true);
    }
  } catch (error) {
    console.error('Error loading profile:', error);
    currentProfile = readLocalProfile(currentUser.email) || null;
  }
}

function openProfileModal(force = false) {
  const modal = document.getElementById('profile-modal');
  if (!modal || !currentUser) return;

  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
  };

  setVal('profile-email', currentUser.email || '');
  setVal('profile-full-name', currentProfile?.full_name || currentUser.displayName || '');
  setVal('profile-phone', currentProfile?.phone || '');
  setVal('profile-address', currentProfile?.address || '');
  setVal('profile-city', currentProfile?.city || '');
  setVal('profile-state', currentProfile?.state || '');
  setVal('profile-pincode', currentProfile?.pincode || '');
  renderProfileSummary();
  setProfileEditMode(Boolean(force));

  modal.style.display = 'flex';
  modal.dataset.force = force ? 'true' : 'false';
}

function closeProfileModal() {
  const modal = document.getElementById('profile-modal');
  if (!modal) return;
  const forceOpen = modal.dataset.force === 'true';
  const fullName = String(document.getElementById('profile-full-name')?.value || '').trim();

  if (forceOpen && currentUser?.isGoogleLogin && !fullName) {
    showNotification('Name is required before closing profile.', 'error');
    return;
  }
  modal.style.display = 'none';
  modal.dataset.force = 'false';
  setProfileEditMode(false);
}

async function saveUserProfile() {
  if (!isProfileEditing) {
    setProfileEditMode(true);
    return;
  }
  if (!currentUser?.email) return;
  const fullName = String(document.getElementById('profile-full-name')?.value || '').trim();
  const phone = String(document.getElementById('profile-phone')?.value || '').trim();
  const address = String(document.getElementById('profile-address')?.value || '').trim();
  const city = String(document.getElementById('profile-city')?.value || '').trim();
  const state = String(document.getElementById('profile-state')?.value || '').trim();
  const pincode = String(document.getElementById('profile-pincode')?.value || '').trim();

  if (currentUser.isGoogleLogin && !fullName) {
    showNotification('Name is required for Google login users.', 'error');
    return;
  }

  try {
    const payload = {
      email: currentUser.email,
      fullName,
      phone,
      address,
      city,
      state,
      pincode,
      isGoogleLogin: Boolean(currentUser.isGoogleLogin)
    };
    const response = await fetch(`${API_BASE}/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      currentProfile = {
        email: currentUser.email,
        full_name: fullName,
        phone,
        address,
        city,
        state,
        pincode
      };
      writeLocalProfile(currentUser.email, currentProfile);
      currentUser.displayName = fullName || currentUser.displayName || '';
      const userInfoFallback = document.getElementById('user-info');
      if (userInfoFallback) userInfoFallback.textContent = getProfileDisplayName() || 'User';
      updateProfileButtonLabel();
      renderProfileSummary();
      setProfileEditMode(false);
      showNotification(result.error || 'Profile saved locally. Restart server to sync.', 'error');
      return;
    }

    currentProfile = result.profile || {
      email: currentUser.email,
      full_name: fullName,
      phone,
      address,
      city,
      state,
      pincode
    };
    writeLocalProfile(currentUser.email, currentProfile);
    currentUser.displayName = fullName || currentUser.displayName || '';
    const userInfo = document.getElementById('user-info');
    if (userInfo) userInfo.textContent = getProfileDisplayName() || 'User';
    updateProfileButtonLabel();
    renderProfileSummary();
    setProfileEditMode(false);
    showNotification('Profile saved successfully');
  } catch (error) {
    showNotification(error.message || 'Error saving profile', 'error');
  }
}

function setupMobilePageSwipeNavigation() {
  if (mobileSwipeHandlersBound) return;
  if (window.matchMedia && !window.matchMedia('(max-width: 768px)').matches) return;

  const swipeContainer = document.querySelector('.main-content') || document.body;
  if (!swipeContainer) return;

  let touchStartX = 0;
  let touchStartY = 0;
  let tracking = false;
  let startTarget = null;
  const HORIZONTAL_MIN = 70;
  const MAX_VERTICAL_DRIFT = 45;

  const shouldIgnoreSwipeTarget = (target) => {
    if (!target || !(target instanceof Element)) return false;
    return Boolean(
      target.closest(
        'input, textarea, select, button, .form-input, .nav, .nav-container, .tab-buttons, .modal-overlay, #billing-coupon-scan-modal, #profile-modal'
      )
    );
  };

  const getCurrentPageId = () => {
    const activeNav = document.querySelector('.nav-btn.active');
    const activeFromNav = activeNav?.dataset?.page;
    if (activeFromNav) return activeFromNav;

    const visiblePage = Array.from(document.querySelectorAll('.page')).find((page) => page.style.display !== 'none');
    return visiblePage?.dataset?.page || null;
  };

  const movePageBy = (direction) => {
    const navPages = Array.from(document.querySelectorAll('.nav-btn[data-page]'))
      .map((btn) => btn.dataset.page)
      .filter(Boolean);
    if (!navPages.length) return;

    const currentPage = getCurrentPageId();
    const currentIndex = navPages.indexOf(currentPage);
    if (currentIndex === -1) return;

    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= navPages.length) return;
    switchPage(navPages[nextIndex]);
  };

  swipeContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) {
      tracking = false;
      return;
    }
    startTarget = e.target;
    if (shouldIgnoreSwipeTarget(startTarget)) {
      tracking = false;
      return;
    }
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  swipeContainer.addEventListener('touchend', (e) => {
    if (!tracking || !e.changedTouches || e.changedTouches.length === 0) return;

    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - touchStartX;
    const dy = endY - touchStartY;
    tracking = false;

    if (Math.abs(dy) > MAX_VERTICAL_DRIFT) return;
    if (Math.abs(dx) < HORIZONTAL_MIN) return;
    if (shouldIgnoreSwipeTarget(startTarget)) return;

    if (dx < 0) {
      // Right to left: next tab/page
      movePageBy(1);
    } else {
      // Left to right: previous tab/page
      movePageBy(-1);
    }
  }, { passive: true });

  mobileSwipeHandlersBound = true;
}

function setupEventListeners() {
  setupMobilePageSwipeNavigation();

  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      switchPage(e.target.dataset.page);
    });
  });

  // Forms
  document.getElementById('coupon-form')?.addEventListener('submit', handleAddCoupon);
  document.getElementById('item-form')?.addEventListener('submit', handleAddItem);
  document.getElementById('generate-coupon-code')?.addEventListener('click', () => {
    const code = generateCouponCode();
    const input = document.getElementById('coupon-code');
    if (input) {
      input.value = code;
      renderQRCode('coupon-qr', code, 180);
      renderBarcode('coupon-barcode', code, 240, 80);
    }
  });
  document.getElementById('generate-item-code')?.addEventListener('click', () => {
    const code = generateItemCode();
    const input = document.getElementById('item-code');
    if (input) {
      input.value = code;
      const name = document.getElementById('item-name')?.value || '';
      const price = parseFloat(document.getElementById('item-price')?.value || '0') || 0;
      const payload = buildItemQrPayload({ code, name, price });
      renderQRCode('item-qr', payload, 180);
    }
  });
  document.getElementById('coupon-code')?.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    if (value) {
      renderQRCode('coupon-qr', value, 180);
      renderBarcode('coupon-barcode', value, 240, 80);
    }
  });
  document.getElementById('item-code')?.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    if (value) {
      const name = document.getElementById('item-name')?.value || '';
      const price = parseFloat(document.getElementById('item-price')?.value || '0') || 0;
      const payload = buildItemQrPayload({ code: value, name, price });
      renderQRCode('item-qr', payload, 180);
    }
  });

  document.getElementById('scan-item-barcode-btn')?.addEventListener('click', openItemBarcodeScannerModal);
  document.getElementById('item-barcode-scan-close')?.addEventListener('click', closeItemBarcodeScannerModal);
  document.getElementById('item-barcode-scan-modal')?.addEventListener('click', (e) => {
    if (e.target?.id === 'item-barcode-scan-modal') closeItemBarcodeScannerModal();
  });
  document.getElementById('billing-coupon-scan')?.addEventListener('click', openBillingCouponScannerModal);
  document.getElementById('billing-coupon-scan-torch')?.addEventListener('click', toggleBillingCouponTorch);
  document.getElementById('billing-coupon-scan-close')?.addEventListener('click', closeBillingCouponScannerModal);
  document.getElementById('billing-coupon-scan-modal')?.addEventListener('click', (e) => {
    if (e.target?.id === 'billing-coupon-scan-modal') closeBillingCouponScannerModal();
  });
  document.getElementById('billing-attachment')?.addEventListener('change', updateBillingAttachmentInfo);
  document.getElementById('profile-btn')?.addEventListener('click', () => openProfileModal(false));
  document.getElementById('profile-close-btn')?.addEventListener('click', closeProfileModal);
  document.getElementById('profile-save-btn')?.addEventListener('click', saveUserProfile);
  document.getElementById('profile-logout-btn')?.addEventListener('click', logout);
  document.getElementById('profile-modal')?.addEventListener('click', (e) => {
    if (e.target?.id === 'profile-modal') closeProfileModal();
  });
  document.getElementById('bill-search')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchBillsFunc();
    }
  });
  document.getElementById('bill-filter-toggle')?.addEventListener('click', toggleBillFilters);
  document.getElementById('bill-filter-payment')?.addEventListener('change', searchBillsFunc);
  document.getElementById('bill-filter-attachment')?.addEventListener('change', searchBillsFunc);
  document.getElementById('bill-filter-date')?.addEventListener('change', searchBillsFunc);
  document.getElementById('billing-item-search')?.addEventListener('input', (e) => {
    renderBillingItemSelect(e.target?.value || '');
  });
  document.getElementById('billing-item-search')?.addEventListener('focus', (e) => {
    updateBillingItemSearchSuggestions(e.target?.value || '');
  });
  document.getElementById('billing-item-search')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const select = document.getElementById('item-select');
      if (!select?.value) {
        const firstValid = Array.from(select?.options || []).find((opt) => opt.value);
        if (firstValid) select.value = firstValid.value;
      }
      addItemToCart();
    }
  });

  // QR Scanners
  document.getElementById('start-qr-scan')?.addEventListener('click', () => startScanning('coupon'));
  document.getElementById('stop-qr-scan')?.addEventListener('click', stopScanning);
  document.getElementById('start-item-scan')?.addEventListener('click', () => startScanning('item'));
  document.getElementById('stop-item-scan')?.addEventListener('click', stopScanning);
  document.getElementById('start-billing-scan')?.addEventListener('click', () => startScanning('billing'));
  document.getElementById('stop-billing-scan')?.addEventListener('click', stopScanning);
  updateReceiptActionButtonLabel();
  if (!window.__receipt_action_resize_bound) {
    window.__receipt_action_resize_bound = true;
    window.addEventListener('resize', updateReceiptActionButtonLabel);
  }

  // Tabs - Fixed version with proper selectors and debugging
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tabButtonsContainer = e.target.closest('.tab-buttons');
      const parentContainer = tabButtonsContainer?.parentElement;
      const tabName = e.target.dataset.tab;
      
      if (!parentContainer) {
        console.error(' Tab container not found');
        return;
      }
      
      // Remove active from all buttons and contents in this container
      parentContainer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      parentContainer.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      // Add active to clicked button and corresponding content
      e.target.classList.add('active');
      const activeContent = parentContainer.querySelector(`.tab-content[data-tab="${tabName}"]`);
      if (activeContent) {
        activeContent.classList.add('active');
        console.log(` Tab switched to: ${tabName}`);
      } else {
        console.error(` Tab content not found for: ${tabName}`);
      }
    });
  });
}

// ============ PAGE SWITCHING ============

function switchPage(pageId) {
  // Release any active camera stream while navigating between pages.
  stopScanning();
  closeBillingCouponScannerModal();
  closeItemBarcodeScannerModal();

  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`[data-page="${pageId}"]`).classList.add('active');

  document.querySelectorAll('.page').forEach(page => page.style.display = 'none');
  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.style.display = 'block';

  // Load page-specific data
  if (pageId === 'coupon-manager') loadCoupons();
  if (pageId === 'item-manager') loadItems();
  if (pageId === 'billing') prepareCheckout();
  if (pageId === 'check-coupon') loadCheckCouponPage();
  if (pageId === 'analytics') loadAnalytics();
  if (pageId === 'activity') loadActivityLogs();
  if (pageId === 'settings') loadSettings();
}

// ============ COUPON FUNCTIONS ============

async function handleAddCoupon(e) {
  e.preventDefault();
  
  try {
    const couponCodeValue = document.getElementById('coupon-code').value.toUpperCase();
    if (!couponCodeValue) {
      alert('Coupon code required');
      return;
    }
    const media = await generateCouponMedia(couponCodeValue);
    const userId = currentUser?.id || null;
    const response = await fetch(`${API_BASE}/coupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        couponCode: couponCodeValue,
        discountPercent: parseFloat(document.getElementById('discount-percent').value),
        minPurchase: parseFloat(document.getElementById('min-purchase').value) || 0,
        maxUses: parseInt(document.getElementById('max-uses').value) || -1,
        expiresAt: document.getElementById('expires-at').value || null,
        qrData: media.qrData,
        barcodeData: media.barcodeData
      })
    });

    if (!response.ok) throw new Error('Failed to add coupon');
    
    alert(' Coupon added successfully!');
    document.getElementById('coupon-form').reset();
    renderQRCode('coupon-qr', couponCodeValue);
    renderBarcode('coupon-barcode', couponCodeValue, 240, 80);
    loadCoupons();
  } catch (error) {
    alert(' Error: ' + error.message);
  }
}

function generateCouponCode() {
  const prefix = 'CPN';
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}${rand}`;
}

function generateItemCode() {
  const prefix = 'ITEM';
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}${rand}`;
}

function buildItemQrPayload(item) {
  const payload = {
    type: 'item',
    code: item.item_code || item.code || '',
    name: item.item_name || item.name || '',
    price: Number(item.item_price || item.price || 0)
  };
  return JSON.stringify(payload);
}

function parseItemQrPayload(raw) {
  try {
    const obj = JSON.parse(raw);
    if (obj && obj.type === 'item' && (obj.code || obj.name)) {
      return {
        code: obj.code || '',
        name: obj.name || '',
        price: Number(obj.price || 0)
      };
    }
  } catch (e) {
    // not JSON
  }
  return null;
}


function parseBarcodeProductPayload(raw) {
  const input = String(raw || '').trim();
  if (!input) return { code: '', name: '', price: null, description: '' };

  const normalizeKey = (key) => String(key || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const aliases = {
    code: ['code', 'itemcode', 'barcode', 'barcodevalue', 'upc', 'ean', 'sku', 'id', 'gtin'],
    name: ['name', 'itemname', 'productname', 'product', 'title'],
    description: ['description', 'desc', 'itemdescription', 'details', 'about'],
    price: ['price', 'itemprice', 'mrp', 'amount', 'saleprice', 'rate', 'cost']
  };

  const findValueDeep = (obj, keyList) => {
    const wanted = new Set(keyList.map(normalizeKey));
    const queue = [obj];
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) {
        queue.push(...node);
        continue;
      }
      for (const [k, v] of Object.entries(node)) {
        const nk = normalizeKey(k);
        if (wanted.has(nk) && v !== undefined && v !== null && String(v).trim() !== '') {
          return String(v).trim();
        }
        if (v && typeof v === 'object') queue.push(v);
      }
    }
    return '';
  };

  const fromObject = (obj) => {
    if (!obj || typeof obj !== 'object') return null;

    const code = findValueDeep(obj, aliases.code);
    const name = findValueDeep(obj, aliases.name);
    const description = findValueDeep(obj, aliases.description);
    const priceRaw = findValueDeep(obj, aliases.price);
    const normalizedPrice = Number(String(priceRaw || '').replace(/[^\d.]/g, ''));
    const price = Number.isFinite(normalizedPrice) && normalizedPrice > 0 ? normalizedPrice : null;

    return { code, name, price, description };
  };

  try {
    const parsedJson = JSON.parse(input);
    const parsed = fromObject(parsedJson);
    if (parsed && (parsed.code || parsed.name || parsed.price || parsed.description)) {
      return parsed;
    }
  } catch (e) {
    // not JSON payload
  }

  // URL payload support: ?name=...&price=...&description=...&code=...
  try {
    if (/^https?:\/\//i.test(input)) {
      const url = new URL(input);
      const paramsObj = {};
      url.searchParams.forEach((value, key) => {
        paramsObj[key] = value;
      });
      const fromParams = fromObject(paramsObj) || { code: '', name: '', price: null, description: '' };
      if (!fromParams.code) {
        const pathToken = url.pathname.split('/').filter(Boolean).pop();
        if (pathToken && /^[-A-Za-z0-9]{6,}$/.test(pathToken)) {
          fromParams.code = pathToken;
        }
      }
      if (fromParams.code || fromParams.name || fromParams.price || fromParams.description) {
        return fromParams;
      }
    }
  } catch (e) {
    // not URL
  }

  const result = { code: '', name: '', price: null, description: '' };
  const parts = input.split(/[\n;|,&]+/).map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    let splitIndex = part.indexOf(':');
    if (splitIndex < 0) splitIndex = part.indexOf('=');
    if (splitIndex < 0) continue;
    const key = normalizeKey(part.slice(0, splitIndex));
    const value = part.slice(splitIndex + 1).trim();
    if (!value) continue;

    if (aliases.code.includes(key)) result.code = value;
    else if (aliases.name.includes(key)) result.name = value;
    else if (aliases.price.includes(key)) {
      const parsedPrice = Number(value.replace(/[^\d.]/g, ''));
      if (Number.isFinite(parsedPrice) && parsedPrice > 0) result.price = parsedPrice;
    } else if (aliases.description.includes(key)) {
      result.description = value;
    }
  }

  if (!result.code && /^[-A-Za-z0-9]{6,}$/.test(input)) {
    result.code = input;
  }

  return result;
}

function applyScannedItemBarcodeData(scannedRaw) {
  const raw = String(scannedRaw || '').trim();
  if (!raw) return;

  const parsed = parseBarcodeProductPayload(raw);
  const itemCodeInput = document.getElementById('item-code');
  const itemNameInput = document.getElementById('item-name');
  const itemPriceInput = document.getElementById('item-price');
  const itemDescInput = document.getElementById('item-description');

  const scannedCode = String(parsed.code || '').trim();
  if (itemCodeInput && (scannedCode || (!raw.startsWith('{') && !raw.startsWith('[')))) {
    itemCodeInput.value = scannedCode || raw;
  }

  if (itemNameInput && parsed.name) itemNameInput.value = parsed.name;
  if (itemPriceInput && parsed.price) itemPriceInput.value = String(parsed.price);
  if (itemDescInput && parsed.description) itemDescInput.value = parsed.description;

  const previewName = parsed.name || itemNameInput?.value || 'Item details scanned';
  const previewPrice = parsed.price ? ` | Price: ${parsed.price}` : '';
  showNotification(`Scanned: ${previewName}${previewPrice}`);
}
function parseCouponQrPayload(raw) {
  try {
    const obj = JSON.parse(raw);
    if (obj && (obj.type === 'coupon' || obj.couponCode || obj.code)) {
      return {
        code: String(obj.couponCode || obj.code || '').trim()
      };
    }
  } catch (e) {
    // not JSON
  }
  return null;
}

async function loadCoupons() {
  try {
    const userId = encodeURIComponent(currentUser?.id || '');
    const response = await fetch(`${API_BASE}/coupons?userId=${userId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const coupons = await response.json();
    
    const couponsList = document.getElementById('coupons-list');
    couponsList.innerHTML = '';

    if (!coupons || coupons.length === 0) {
      couponsList.innerHTML = '<p style="text-align:center; color:#6b7280;">No coupons found</p>';
      allCoupons = [];
      rebuildCodeLookupMaps();
      updateCodeSuggestions();
      return;
    }

    coupons.forEach(coupon => {
      const element = document.createElement('div');
      element.className = 'list-item';
      element.innerHTML = `
        <div class="list-item-content">
          <h4> ${coupon.coupon_code}</h4>
          <p>Discount: <strong>${coupon.discount_percent}%</strong></p>
          <p>Min Purchase: ${coupon.min_purchase}</p>
          <p>Usage: ${coupon.used_count || 0}${coupon.max_uses > 0 ? ` / ${coupon.max_uses}` : ''}</p>
          <p>Status: <span class="badge ${coupon.status === 'valid' ? 'badge-valid' : 'badge-invalid'}">${coupon.status}</span></p>
        </div>
        <div class="list-item-media">
          <img id="coupon-qr-img-${coupon.id}" alt="QR" />
          <img id="coupon-barcode-img-${coupon.id}" alt="Barcode" />
        </div>
        <div class="list-item-actions">
          <button class="btn btn-danger" onclick="deleteCouponFunc('${coupon.id}')">Delete</button>
        </div>
      `;
      couponsList.appendChild(element);

      const qrImg = document.getElementById(`coupon-qr-img-${coupon.id}`);
      const barcodeImg = document.getElementById(`coupon-barcode-img-${coupon.id}`);

      if (coupon.qr_data && qrImg) qrImg.src = coupon.qr_data;
      if (coupon.barcode_data && barcodeImg) barcodeImg.src = coupon.barcode_data;

      // Backfill missing QR/Barcode
      if ((!coupon.qr_data || !coupon.barcode_data) && coupon.coupon_code) {
        generateCouponMedia(coupon.coupon_code).then((media) => {
          if (media.qrData && qrImg) qrImg.src = media.qrData;
          if (media.barcodeData && barcodeImg) barcodeImg.src = media.barcodeData;
          fetch(`${API_BASE}/coupons/${coupon.id}/media`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser?.id || null, qrData: media.qrData, barcodeData: media.barcodeData })
          }).catch(() => {});
        });
      }
    });

    allCoupons = coupons;
    rebuildCodeLookupMaps();
    updateCodeSuggestions();
  } catch (error) {
    console.error('Error loading coupons:', error);
    const couponsList = document.getElementById('coupons-list');
    if (couponsList) {
      couponsList.innerHTML = `<p style="text-align:center; color:#dc2626;">Error loading coupons: ${error.message}</p>`;
    }
  }
}

async function validateCouponManual() {
  const couponCode = document.getElementById('manual-coupon-code').value.toUpperCase().trim();
  
  if (!couponCode) {
    showNotification('Please enter coupon code', 'error');
    return;
  }

  try {
    console.log(' Validating coupon:', couponCode);
    const response = await fetch(`${API_BASE}/coupons/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ couponCode, userId: currentUser?.id || null })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log(' Coupon validation result:', result);
    showCouponResult(result);
  } catch (error) {
    console.error(' Validation error:', error);
    showNotification(`Error: ${error.message}`, 'error');
  }
}

function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  const bgColor = type === 'error' ? '#ef4444' : '#10b981';
  notification.style.cssText = `position:fixed;top:20px;right:20px;background:${bgColor};color:white;padding:15px 20px;border-radius:6px;box-shadow:0 4px 6px rgba(0,0,0,0.1);z-index:1000;animation:slideIn 0.3s ease-out;`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => notification.remove(), 3000);
}

function showCouponResult(coupon) {
  const resultDiv = document.getElementById('coupon-result');
  const isValid = coupon.status === 'valid' && coupon.found;
  
  let statusIcon = '';
  let statusText = 'INVALID';
  let statusColor = '#dc2626';
  
  if (isValid) {
    statusIcon = '';
    statusText = 'VALID COUPON';
    statusColor = '#10b981';
  } else if (coupon.status === 'expired') {
    statusIcon = '';
    statusText = 'EXPIRED';
  } else if (coupon.status === 'maxed_out') {
    statusIcon = '';
    statusText = 'MAX USES REACHED';
  }

  resultDiv.className = 'result-card ' + (isValid ? 'valid' : 'invalid');
  resultDiv.innerHTML = `
    <h3 style="color: ${statusColor}">${statusIcon} ${statusText}</h3>
    <p><strong>Coupon Code:</strong> ${coupon.couponCode || 'N/A'}</p>
    ${coupon.found ? `
      <p><strong>Discount:</strong> ${coupon.discountPercent}%</p>
      <p><strong>Min Purchase:</strong> ${coupon.minPurchase || '0'}</p>
      <p><strong>Uses Remaining:</strong> ${coupon.maxUses > 0 ? (coupon.maxUses - coupon.usedCount) : 'Unlimited'} ${coupon.maxUses > 0 ? `(${coupon.usedCount}/${coupon.maxUses})` : ''}</p>
      ${coupon.expiresAt ? `<p><strong>Expires:</strong> ${new Date(coupon.expiresAt).toLocaleDateString()}</p>` : ''}
      ${!isValid ? `<p style="color: #dc2626;"><strong>Reason:</strong> ${coupon.message}</p>` : '<p style="color: #10b981;"> This coupon can be applied</p>'}
    ` : `
      <p style="color: #dc2626;"><strong>Message:</strong> ${coupon.message}</p>
    `}
  `;
  resultDiv.style.display = 'block';
}

async function loadCheckCouponPage() {
  try {
    const userId = encodeURIComponent(currentUser?.id || '');
    const response = await fetch(`${API_BASE}/coupons?userId=${userId}`);
    const coupons = await response.json();
    
    // Populate dropdown
    const select = document.getElementById('coupon-select');
    select.innerHTML = '<option value="">-- Select a Coupon --</option>';
    coupons.forEach(coupon => {
      const option = document.createElement('option');
      option.value = coupon.id;
      option.textContent = `${coupon.coupon_code} (${coupon.discount_percent}% off)`;
      option.dataset.code = coupon.coupon_code;
      select.appendChild(option);
    });
    
    // Display coupons list
    const listDiv = document.getElementById('available-coupons-list');
    listDiv.innerHTML = '';
    
    if (coupons.length === 0) {
      listDiv.innerHTML = '<p style="text-align:center; color: #6b7280;">No coupons available</p>';
      return;
    }
    
    coupons.forEach(coupon => {
      const expiresAt = new Date(coupon.expires_at);
      const isExpired = expiresAt < new Date();
      const isMaxed = coupon.used_count >= coupon.max_uses && coupon.max_uses > 0;
      const isActive = !isExpired && !isMaxed;
      
      const element = document.createElement('div');
      element.className = 'list-item ' + (isActive ? '' : 'disabled');
      element.style.opacity = isActive ? '1' : '0.6';
      element.innerHTML = `
        <div class="list-item-content">
          <h4>${coupon.coupon_code} ${isActive ? '' : ''}</h4>
          <p><strong>Discount:</strong> ${coupon.discount_percent}%</p>
          <p><strong>Uses:</strong> ${coupon.used_count}/${coupon.max_uses > 0 ? coupon.max_uses : 'Unlimited'}</p>
          <p><strong>Expires:</strong> ${expiresAt.toLocaleDateString()}</p>
          ${!isActive ? `<p style="color:#dc2626;"><strong>Status:</strong> ${isExpired ? 'Expired' : 'Max uses reached'}</strong></p>` : ''}
          <button class="btn btn-secondary btn-small" onclick="checkCouponByCode('${coupon.coupon_code}')">Check Details</button>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-danger" onclick="deleteCouponFunc('${coupon.id}')">Delete</button>
        </div>
      `;
      listDiv.appendChild(element);
    });
  } catch (error) {
    console.error('Error loading coupons:', error);
  }
}

function checkSelectedCoupon() {
  const select = document.getElementById('coupon-select');
  const selectedOption = select.options[select.selectedIndex];
  
  if (!selectedOption.value) return;
  
  const couponCode = selectedOption.dataset.code;
  checkCouponByCode(couponCode);
}

function checkCouponByCode(couponCode) {
  document.getElementById('manual-coupon-code').value = couponCode;
  validateCouponManual();
}

// ============ ITEM FUNCTIONS ============

async function handleAddItem(e) {
  e.preventDefault();
  
  const itemName = document.getElementById('item-name').value;
  const itemPrice = parseFloat(document.getElementById('item-price').value);
  let itemCodeInput = document.getElementById('item-code').value.trim();
  if (!itemCodeInput) {
    itemCodeInput = generateItemCode();
    document.getElementById('item-code').value = itemCodeInput;
  }
  const itemCode = itemCodeInput;
  const categoryId = document.getElementById('item-category').value || null;
  const stockQuantity = parseInt(document.getElementById('item-stock').value) || 100;
  const description = document.getElementById('item-description').value || '';

  if (!itemName || !itemPrice) {
    alert('Please fill required fields');
    return;
  }

  try {
    const payload = buildItemQrPayload({ item_code: itemCode, item_name: itemName, item_price: itemPrice });
    const qrData = await generateQrDataUrl(payload);
    const userId = currentUser?.id || null;
    const response = await fetch(`${API_BASE}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId,
        itemName, 
        itemPrice, 
        itemCode,
        categoryId,
        stockQuantity,
        description,
        qrData
      })
    });

    const result = await response.json();
    
    if (!response.ok) throw new Error(result.error);
    
    alert(' Item added successfully!');
    document.getElementById('item-form').reset();
    renderQRCode('item-qr', payload);
    loadItems();
    loadItemSelect();
  } catch (error) {
    alert(' Error: ' + error.message);
  }
}

async function loadItems() {
  try {
    const userId = encodeURIComponent(currentUser?.id || '');
    const response = await fetch(`${API_BASE}/items?userId=${userId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const items = await response.json();
    
    const itemsList = document.getElementById('items-list');
    itemsList.innerHTML = '';

    if (!items || items.length === 0) {
      itemsList.innerHTML = '<p style="text-align:center; color:#6b7280;">No items found</p>';
      allItems = [];
      rebuildCodeLookupMaps();
      updateCodeSuggestions();
      return;
    }

    items.forEach(item => {
      const stockWarning = item.stock_quantity <= 10 ? ' Low Stock' : ' In Stock';
      const category = allCategories.find(c => c.id === item.category_id);
      const categoryName = category?.name || 'Uncategorized';
      
      const element = document.createElement('div');
      element.className = 'list-item';
      element.innerHTML = `
        <div class="list-item-content">
          <h4> ${item.item_name}</h4>
          <p>Price: <strong>${item.item_price}</strong></p>
          <p>Code: <strong>${item.item_code}</strong></p>
          <p>Category: <strong>${categoryName}</strong></p>
          <p>Stock: <strong>${item.stock_quantity}</strong> ${stockWarning}</p>
          ${item.description ? `<p>Description: ${item.description}</p>` : ''}
        </div>
        <div class="list-item-media">
          <img id="item-qr-img-${item.id}" alt="QR" />
        </div>
        <div class="list-item-actions">
          <button class="btn btn-danger" onclick="deleteItemFunc('${item.id}')">Delete</button>
        </div>
      `;
      itemsList.appendChild(element);

      const qrImg = document.getElementById(`item-qr-img-${item.id}`);
      if (item.qr_data && qrImg) qrImg.src = item.qr_data;
      if (!item.qr_data && item.item_code) {
        const payload = buildItemQrPayload(item);
        generateQrDataUrl(payload).then((qrData) => {
          if (qrData && qrImg) qrImg.src = qrData;
          fetch(`${API_BASE}/items/${item.id}/media`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser?.id || null, qrData })
          }).catch(() => {});
        });
      }
    });

    allItems = items;
    rebuildCodeLookupMaps();
    updateCodeSuggestions();
  } catch (error) {
    console.error('Error loading items:', error);
    const itemsList = document.getElementById('items-list');
    if (itemsList) {
      itemsList.innerHTML = `<p style="text-align:center; color:#dc2626;">Error loading items: ${error.message}</p>`;
    }
  }
}

async function loadItemSelect() {
  try {
    const userId = encodeURIComponent(currentUser?.id || '');
    const response = await fetch(`${API_BASE}/items?userId=${userId}`);
    const items = await response.json();

    allItems = Array.isArray(items) ? items : [];
    rebuildCodeLookupMaps();
    updateCodeSuggestions();
    renderBillingItemSelect(document.getElementById('billing-item-search')?.value || '');
  } catch (error) {
    console.error('Error loading items:', error);
  }
}

async function checkItemManual() {
  const itemCode = document.getElementById('manual-item-code').value;
  
  if (!itemCode) {
    alert('Please enter item code');
    return;
  }

  try {
    const userId = encodeURIComponent(currentUser?.id || '');
    const response = await fetch(`${API_BASE}/items/${itemCode}?userId=${userId}`);
    
    if (response.status === 404) {
      showItemResult({ found: false });
      return;
    }

    const item = await response.json();
    showItemResult({ found: true, ...item });
  } catch (error) {
    alert(' Error: ' + error.message);
  }
}

function showItemResult(item) {
  const resultDiv = document.getElementById('item-result');
  
  if (!item.found) {
    resultDiv.className = 'result-card invalid';
    resultDiv.innerHTML = '<h3> Item Not Found</h3><p>The item code does not exist in database.</p>';
  } else {
    resultDiv.className = 'result-card valid';
    resultDiv.innerHTML = `
      <h3> Item Found</h3>
      <p><strong>Name:</strong> ${item.item_name}</p>
      <p><strong>Price:</strong> ${item.item_price}</p>
      <p><strong>Code:</strong> ${item.item_code}</p>
      <p><strong>Added:</strong> ${new Date(item.created_at).toLocaleString()}</p>
    `;
  }
  resultDiv.style.display = 'block';
}

async function deleteItemFunc(itemId) {
  if (!confirm('Are you sure you want to delete this item?')) return;

  try {
    const userId = encodeURIComponent(currentUser?.id || '');
    const response = await fetch(`${API_BASE}/items/${itemId}?userId=${userId}`, { method: 'DELETE' });
    
    if (!response.ok) throw new Error('Failed to delete');
    
    alert(' Item deleted successfully');
    loadItems();
    loadItemSelect();
  } catch (error) {
    alert(' Error: ' + error.message);
  }
}

async function deleteCouponFunc(couponId) {
  if (!confirm('Are you sure you want to delete this coupon?')) return;

  try {
    const userId = encodeURIComponent(currentUser?.id || '');
    const response = await fetch(`${API_BASE}/coupons/${couponId}?userId=${userId}`, { method: 'DELETE' });
    
    if (!response.ok) throw new Error('Failed to delete');
    
    alert(' Coupon deleted successfully');
    loadCoupons();
    loadCheckCouponPage();
  } catch (error) {
    alert(' Error: ' + error.message);
  }
}

async function deleteAllCouponsFunc() {
  if (!confirm('Are you sure you want to delete ALL coupons? This cannot be undone.')) return;

  try {
    const userId = encodeURIComponent(currentUser?.id || '');
    const response = await fetch(`${API_BASE}/coupons?userId=${userId}`, { method: 'DELETE' });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Fallback for backends that don't support bulk delete endpoint
      if (response.status === 404 || response.status === 405) {
        const couponsRes = await fetch(`${API_BASE}/coupons?userId=${userId}`);
        if (!couponsRes.ok) {
          throw new Error(`Failed to load coupons (HTTP ${couponsRes.status})`);
        }

        const coupons = await couponsRes.json().catch(() => []);
        for (const coupon of coupons) {
          const singleDeleteRes = await fetch(`${API_BASE}/coupons/${coupon.id}?userId=${userId}`, { method: 'DELETE' });
          if (!singleDeleteRes.ok) {
            throw new Error(`Failed to delete coupon ${coupon.coupon_code || coupon.id} (HTTP ${singleDeleteRes.status})`);
          }
        }
      } else {
        throw new Error(result.error || `Failed to delete all coupons (HTTP ${response.status})`);
      }
    }

    alert(' All coupons deleted successfully');
    loadCoupons();
    loadCheckCouponPage();
  } catch (error) {
    alert(' Error: ' + error.message);
  }
}

// ============ CHECKOUT & BILLING ============

async function prepareCheckout() {
  loadCoupons();
  loadItemSelect();
  const billingSearch = document.getElementById('billing-item-search');
  if (billingSearch) billingSearch.value = '';
  updateCartDisplay();
  loadBills();
  setBillingDateDefault();
  updateBillingAttachmentInfo();
}

function getCurrentLocalDateTimeValue() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

function setBillingDateDefault(force = false) {
  const input = document.getElementById('billing-date');
  if (!input) return;
  if (force || !input.value) {
    input.value = getCurrentLocalDateTimeValue();
  }
}

function getSelectedBillingAttachment() {
  const input = document.getElementById('billing-attachment');
  if (!input || !input.files || input.files.length === 0) return null;
  return input.files[0];
}

function updateBillingAttachmentInfo() {
  const info = document.getElementById('billing-attachment-info');
  if (!info) return;
  const file = getSelectedBillingAttachment();
  if (!file) {
    info.textContent = 'No document selected';
    return;
  }
  info.textContent = `${file.name} (${Math.ceil(file.size / 1024)} KB)`;
}

function getFilteredBillingItems(queryText = '') {
  const query = String(queryText || '').trim().toLowerCase();
  if (!query) return Array.isArray(allItems) ? [...allItems] : [];

  return (allItems || []).filter((item) => {
    const name = String(item?.item_name || '').toLowerCase();
    const code = String(item?.item_code || '').toLowerCase();
    return name.includes(query) || code.includes(query);
  });
}

function updateBillingItemSearchSuggestions(queryText = '') {
  const datalist = document.getElementById('billing-item-suggestion-list');
  if (!datalist) return;

  const items = getFilteredBillingItems(queryText);
  const seen = new Set();
  datalist.innerHTML = '';

  items.slice(0, 60).forEach((item) => {
    const name = String(item?.item_name || '').trim();
    const code = String(item?.item_code || '').trim();

    if (name && !seen.has(`n:${name.toLowerCase()}`)) {
      const optName = document.createElement('option');
      optName.value = name;
      datalist.appendChild(optName);
      seen.add(`n:${name.toLowerCase()}`);
    }

    if (code && !seen.has(`c:${code.toLowerCase()}`)) {
      const optCode = document.createElement('option');
      optCode.value = code;
      datalist.appendChild(optCode);
      seen.add(`c:${code.toLowerCase()}`);
    }
  });
}

function renderBillingItemSelect(queryText = '') {
  const select = document.getElementById('item-select');
  if (!select) return;

  const items = getFilteredBillingItems(queryText);
  updateBillingItemSearchSuggestions(queryText);
  select.innerHTML = '<option value="">-- Select Item --</option>';

  if (!items.length) {
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'No matching items';
    emptyOption.disabled = true;
    select.appendChild(emptyOption);
    return;
  }

  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = `${item.item_name} (${item.item_code || 'NO-CODE'}) - ${item.item_price}`;
    select.appendChild(option);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read attachment'));
    reader.readAsDataURL(file);
  });
}

function addItemToCart() {
  const itemSelect = document.getElementById('item-select');
  const itemId = itemSelect.value;
  const quantity = parseInt(document.getElementById('item-quantity').value) || 1;

  if (!itemId || itemId === '') {
    alert('Please select an item');
    return;
  }

  const item = allItems.find(i => i.id === itemId);
  if (!item) {
    alert('Item not found');
    return;
  }

  // Check if item already in cart
  const existingItem = currentCart.find(i => i.id === itemId);
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    currentCart.push({
      id: item.id,
      name: item.item_name,
      price: item.item_price,
      quantity
    });
  }

  document.getElementById('item-quantity').value = '1';
  const searchInput = document.getElementById('billing-item-search');
  if (searchInput) searchInput.value = '';
  renderBillingItemSelect('');
  updateCartDisplay();
}

function removeFromCart(itemId) {
  currentCart = currentCart.filter(i => i.id !== itemId);
  updateCartDisplay();
}

function updateCartDisplay() {
  const cartDiv = document.getElementById('cart-items');
  const subtotalDiv = document.getElementById('subtotal');
  const discountDiv = document.getElementById('discount-amount');
  const totalDiv = document.getElementById('total-amount');
  const messageDiv = document.getElementById('coupon-message');

  cartDiv.innerHTML = '';
  let subtotal = 0;

  currentCart.forEach(item => {
    const itemTotal = item.price * item.quantity;
    subtotal += itemTotal;

    const itemElement = document.createElement('div');
    itemElement.className = 'cart-item';
    itemElement.innerHTML = `
      <div class="cart-item-info">
        <h4>${item.name}</h4>
        <p>${item.price}  ${item.quantity} = ${itemTotal.toFixed(2)}</p>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart('${item.id}')">Remove</button>
    `;
    cartDiv.appendChild(itemElement);
  });

  // Store current subtotal for discount calculation
  window.currentSubtotal = subtotal;

  let discountAmount = 0;
  let total = subtotal;

  if (appliedCouponData) {
    const minPurchase = appliedCouponData.minPurchase || 0;
    if (subtotal >= minPurchase) {
      discountAmount = (subtotal * appliedCouponData.discountPercent) / 100;
      total = subtotal - discountAmount;
    } else {
      // subtotal too low; clear applied coupon
      appliedCouponData = null;
      window.appliedCoupon = null;
      if (messageDiv) {
        messageDiv.className = 'error';
        messageDiv.textContent = ` Minimum purchase is ${minPurchase}. Coupon removed.`;
        messageDiv.style.display = 'block';
      }
    }
  }

  subtotalDiv.textContent = ` ${subtotal.toFixed(2)}`;
  discountDiv.textContent = ` ${discountAmount.toFixed(2)}`;
  totalDiv.textContent = ` ${total.toFixed(2)}`;
}

async function applyCoupon() {
  const couponCode = document.getElementById('billing-coupon').value.toUpperCase();
  const messageDiv = document.getElementById('coupon-message');

  if (!couponCode) {
    alert('Please enter coupon code');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/coupons/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ couponCode, userId: currentUser?.id || null })
    });

    const coupon = await response.json();

    if (coupon.found && coupon.status === 'valid') {
      const subtotal = window.currentSubtotal || 0;
      const minPurchase = coupon.minPurchase || 0;

      if (subtotal < minPurchase) {
        messageDiv.className = 'error';
        messageDiv.textContent = ` Minimum purchase is ${minPurchase}`;
        messageDiv.style.display = 'block';
        appliedCouponData = null;
        window.appliedCoupon = null;
        updateCartDisplay();
        return;
      }

      appliedCouponData = {
        code: couponCode,
        discountPercent: coupon.discountPercent,
        minPurchase: coupon.minPurchase || 0
      };
      window.appliedCoupon = couponCode;
      updateCartDisplay();

      messageDiv.className = 'success';
      messageDiv.textContent = ` Coupon applied! ${coupon.discountPercent}% discount`;
      messageDiv.style.display = 'block';
    } else {
      messageDiv.className = 'error';
      messageDiv.textContent = ' Invalid or expired coupon';
      messageDiv.style.display = 'block';
      appliedCouponData = null;
      window.appliedCoupon = null;
      updateCartDisplay();
    }
  } catch (error) {
    messageDiv.className = 'error';
    messageDiv.textContent = ' Error validating coupon';
    messageDiv.style.display = 'block';
    appliedCouponData = null;
    window.appliedCoupon = null;
    updateCartDisplay();
  }
}

function updateCodeSuggestions() {
  const couponList = document.getElementById('coupon-code-list');
  if (couponList) {
    couponList.innerHTML = '';
    allCoupons.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.coupon_code;
      couponList.appendChild(opt);
    });
  }

  const itemList = document.getElementById('item-code-list');
  if (itemList) {
    itemList.innerHTML = '';
    allItems.forEach(i => {
      if (i.item_code) {
        const opt = document.createElement('option');
        opt.value = i.item_code;
        itemList.appendChild(opt);
      }
    });
  }

  const nameList = document.getElementById('item-name-list');
  if (nameList) {
    nameList.innerHTML = '';
    const names = new Set(defaultItemNameSuggestions.map(n => n.trim()).filter(Boolean));
    allItems.forEach(i => {
      if (i.item_name) names.add(i.item_name.trim());
    });
    Array.from(names).sort().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      nameList.appendChild(opt);
    });
  }
}

function renderQRCode(targetId, text, size = 180) {
  const container = document.getElementById(targetId);
  if (!container || !text) return;
  if (typeof QRCode === 'undefined') {
    ensureQrLibrary().then(() => renderQRCode(targetId, text, size));
    return;
  }

  // qrcode (toCanvas) path
  if (QRCode.toCanvas) {
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    QRCode.toCanvas(canvas, text, { width: size, margin: 1 }, () => {});
    return;
  }

  // qrcodejs fallback (constructor)
  container.innerHTML = '';
  try {
    new QRCode(container, {
      text,
      width: size,
      height: size
    });
  } catch (e) {
    // ignore
  }
}

function renderBarcode(targetId, text, width = 240, height = 80) {
  const container = document.getElementById(targetId);
  if (!container || !text) return;
  if (typeof JsBarcode === 'undefined') return;

  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  try {
    JsBarcode(canvas, text, { format: 'CODE128', width: 2, height: height, displayValue: false, margin: 2 });
  } catch (e) {
    // ignore
  }
}

async function generateQrDataUrl(text) {
  if (typeof QRCode === 'undefined') {
    await ensureQrLibrary();
  }
  if (typeof QRCode === 'undefined') return null;

  if (QRCode.toDataURL) {
    return QRCode.toDataURL(text, { width: 240, margin: 1 });
  }

  // qrcodejs fallback: render to temp element and extract data URL
  const temp = document.createElement('div');
  temp.style.position = 'fixed';
  temp.style.left = '-9999px';
  document.body.appendChild(temp);
  try {
    new QRCode(temp, { text, width: 240, height: 240 });
    const canvas = temp.querySelector('canvas');
    const img = temp.querySelector('img');
    if (canvas) return canvas.toDataURL('image/png');
    if (img && img.src && img.src.startsWith('data:image')) return img.src;
    return null;
  } finally {
    temp.remove();
  }
}

function generateBarcodeDataUrl(text) {
  if (typeof JsBarcode === 'undefined') return null;
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, text, { format: 'CODE128', width: 2, height: 80, displayValue: false, margin: 2 });
  return canvas.toDataURL('image/png');
}

async function generateCouponMedia(text) {
  const [qrData, barcodeData] = await Promise.all([
    generateQrDataUrl(text),
    Promise.resolve(generateBarcodeDataUrl(text))
  ]);
  return { qrData, barcodeData };
}

function ensureQrLibrary() {
  return new Promise((resolve) => {
    if (typeof QRCode !== 'undefined') return resolve();
    const existing = document.getElementById('qr-lib-fallback');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => resolve());
      return;
    }
    const script = document.createElement('script');
    script.id = 'qr-lib-fallback';
    script.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

function clearCart() {
  if (!confirm('Are you sure you want to clear the cart?')) return;
  currentCart = [];
  document.getElementById('billing-coupon').value = '';
  const customerInput = document.getElementById('billing-customer-name');
  const customerMobileInput = document.getElementById('billing-customer-mobile');
  const bikeNumberInput = document.getElementById('billing-bike-number');
  const attachmentInput = document.getElementById('billing-attachment');
  if (customerInput) customerInput.value = '';
  if (customerMobileInput) customerMobileInput.value = '';
  if (bikeNumberInput) bikeNumberInput.value = '';
  if (attachmentInput) attachmentInput.value = '';
  updateBillingAttachmentInfo();
  setBillingDateDefault(true);
  window.appliedCoupon = null;
  appliedCouponData = null;
  document.getElementById('coupon-message').style.display = 'none';
  updateCartDisplay();
}

async function checkout() {
  if (currentCart.length === 0) {
    alert('Cart is empty');
    return;
  }

  const paymentMethod = document.getElementById('payment-method')?.value || 'cash';
  const customerName = document.getElementById('billing-customer-name')?.value?.trim() || null;
  const customerMobile = document.getElementById('billing-customer-mobile')?.value?.trim() || null;
  const bikeNumber = document.getElementById('billing-bike-number')?.value?.trim() || null;
  const billDate = document.getElementById('billing-date')?.value || null;
  const attachmentFile = getSelectedBillingAttachment();
  const billItems = currentCart.map(item => ({ ...item }));
  let attachmentPayload = null;

  try {
    if (attachmentFile) {
      const maxBytes = 8 * 1024 * 1024;
      if (attachmentFile.size > maxBytes) {
        throw new Error('Attachment is too large. Please select a file up to 8 MB.');
      }
      const dataUrl = await fileToDataUrl(attachmentFile);
      attachmentPayload = {
        name: attachmentFile.name,
        type: attachmentFile.type || 'application/octet-stream',
        data: dataUrl
      };
    }

    const response = await fetch(`${API_BASE}/bills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: currentCart,
        couponCode: window.appliedCoupon || null,
        userId: currentUser?.id || null,
        paymentMethod: paymentMethod,
        customerName: customerName,
        customerMobile: customerMobile,
        bikeNumber: bikeNumber,
        billDate: billDate,
        attachment: attachmentPayload
      })
    });

    const result = await response.json();
    
    if (!response.ok) throw new Error(result.error);

    window.lastBill = {
      billId: result.billId,
      items: billItems,
      totalPrice: result.totalPrice,
      discountAmount: result.discountAmount,
      finalPrice: result.finalPrice,
      couponCode: window.appliedCoupon || null,
      customerName: result.customerName || customerName,
      customerMobile: result.customerMobile || customerMobile,
      bikeNumber: result.bikeNumber || bikeNumber,
      billDate: result.billDate || billDate,
      attachmentName: result.attachmentName || attachmentFile?.name || null,
      attachmentType: result.attachmentType || attachmentFile?.type || null,
      attachmentData: attachmentPayload?.data || null,
      paymentMethod: paymentMethod,
      createdAt: result.billDate || new Date().toISOString()
    };
    alert(` Bill created successfully!\n\nBill ID: ${result.billId}\nTotal: ${result.finalPrice.toFixed(2)}`);
    
    clearCart();
    loadBills();
  } catch (error) {
    alert(' Error: ' + error.message);
  }
}

// ============ BILL HISTORY ============

async function loadBills() {
  try {
    const userId = encodeURIComponent(currentUser?.id || '');
    const response = await fetch(`${API_BASE}/bills?userId=${userId}`);
    const bills = await response.json();
    window.allBills = bills;
    closeBillPreview();
    searchBillsFunc();
  } catch (error) {
    console.error('Error loading bills:', error);
  }
}

function renderBillsList(bills) {
  const billsList = document.getElementById('bills-list');
  if (!billsList) return;
  billsList.innerHTML = '';

  if (!bills || bills.length === 0) {
    billsList.innerHTML = '<p style="text-align:center; color: #6b7280;">No bills found</p>';
    return;
  }

  bills.forEach(bill => {
    let items = [];
    try {
      items = JSON.parse(bill.items_json || '[]');
    } catch (e) {
      items = [];
    }

    const itemsText = items.map(i => `${i.name}`).join(', ') || 'No items';
    const customerName = bill.customer_name || 'Walk-in';
    const customerMobile = bill.customer_mobile || '-';
    const bikeNumber = bill.bike_number || '-';
    const displayDate = bill.bill_date || bill.created_at;
    const hasAttachment = Boolean(bill.attachment_data);

    const element = document.createElement('div');
    element.className = 'list-item';
    element.innerHTML = `
      <div class="list-item-content">
        <h4> Bill ID: ${bill.id.substring(0, 8)}</h4>
        <p>Customer: ${customerName}</p>
        <p>Mobile: ${customerMobile} | Bike No: ${bikeNumber}</p>
        <p>Items: ${itemsText}</p>
        <p>Total: <strong>${Number(bill.total_price || 0).toFixed(2)}</strong> | Discount: ${Number(bill.discount_amount || 0).toFixed(2)} | Final: <strong>${Number(bill.final_price || 0).toFixed(2)}</strong></p>
        <p>Date: ${displayDate ? new Date(displayDate).toLocaleString() : '-'}</p>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-secondary" onclick="viewBill('${bill.id}')">View</button>
        <button class="btn btn-secondary" onclick="printBill('${bill.id}')">Print</button>
        ${hasAttachment ? `<button class="btn btn-secondary" onclick="openBillAttachment('${bill.id}')">Attachment</button>` : ''}
        <button class="btn btn-danger" onclick="deleteBillFunc('${bill.id}')">Delete</button>
      </div>
    `;
    billsList.appendChild(element);
  });
}

function searchBillsFunc() {
  const searchQuery = (document.getElementById('bill-search')?.value || '').trim().toLowerCase();
  const paymentFilter = (document.getElementById('bill-filter-payment')?.value || 'all').toLowerCase();
  const attachmentFilter = (document.getElementById('bill-filter-attachment')?.value || 'all').toLowerCase();
  const dateFilter = (document.getElementById('bill-filter-date')?.value || 'all').toLowerCase();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last7Start = new Date(now);
  last7Start.setDate(now.getDate() - 6);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const source = Array.isArray(window.allBills) ? window.allBills : [];
  const filtered = source.filter((bill) => {
    const billName = String(bill.customer_name || '').toLowerCase();
    const billMobile = String(bill.customer_mobile || '').toLowerCase();
    const billBike = String(bill.bike_number || '').toLowerCase();
    const haystack = `${billName} ${billMobile} ${billBike}`.trim();
    const searchOk = !searchQuery || haystack.includes(searchQuery);

    const billPayment = String(bill.payment_method || '').toLowerCase();
    const paymentOk = paymentFilter === 'all' || billPayment === paymentFilter;

    const hasAttachment = Boolean(bill.attachment_data);
    const attachmentOk =
      attachmentFilter === 'all' ||
      (attachmentFilter === 'with' && hasAttachment) ||
      (attachmentFilter === 'without' && !hasAttachment);

    const rawDate = bill.bill_date || bill.created_at;
    const billDate = rawDate ? new Date(rawDate) : null;
    let dateOk = true;
    if (dateFilter === 'today') {
      dateOk = Boolean(billDate && billDate >= todayStart);
    } else if (dateFilter === 'last7') {
      dateOk = Boolean(billDate && billDate >= last7Start);
    } else if (dateFilter === 'thismonth') {
      dateOk = Boolean(billDate && billDate >= thisMonthStart);
    }

    return searchOk && paymentOk && attachmentOk && dateOk;
  });

  renderBillsList(filtered);
}

function toggleBillFilters() {
  const panel = document.getElementById('bill-filters-panel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function clearBillFilters() {
  const searchInput = document.getElementById('bill-search');
  const payment = document.getElementById('bill-filter-payment');
  const attachment = document.getElementById('bill-filter-attachment');
  const date = document.getElementById('bill-filter-date');
  if (searchInput) searchInput.value = '';
  if (payment) payment.value = 'all';
  if (attachment) attachment.value = 'all';
  if (date) date.value = 'all';
  searchBillsFunc();
}

async function deleteBillFunc(billId) {
  if (!confirm('Are you sure you want to delete this bill?')) return;

  try {
    const userId = encodeURIComponent(currentUser?.id || '');
    const response = await fetch(`${API_BASE}/bills/${billId}?userId=${userId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete bill');
    await loadBills();
    await loadDashboard();
  } catch (error) {
    alert(' Error: ' + error.message);
  }
}

async function deleteAllBillsFunc() {
  if (!confirm('Are you sure you want to delete ALL bills? This cannot be undone.')) return;

  try {
    const userId = encodeURIComponent(currentUser?.id || '');
    const response = await fetch(`${API_BASE}/bills?userId=${userId}`, { method: 'DELETE' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Failed to delete all bills (HTTP ${response.status})`);
    await loadBills();
    await loadDashboard();
    alert(' All bills deleted successfully');
  } catch (error) {
    alert(' Error: ' + error.message);
  }
}

function normalizeBillForPrint(bill) {
  let items = [];
  if (Array.isArray(bill.items)) {
    items = bill.items;
  } else {
    try {
      items = JSON.parse(bill.items_json || '[]');
    } catch (e) {
      items = [];
    }
  }
  return {
    billId: bill.billId || bill.id,
    items,
    totalPrice: bill.totalPrice ?? bill.total_price,
    discountAmount: bill.discountAmount ?? bill.discount_amount,
    finalPrice: bill.finalPrice ?? bill.final_price,
    couponCode: bill.couponCode ?? bill.coupon_code ?? null,
    customerName: bill.customerName ?? bill.customer_name,
    customerMobile: bill.customerMobile ?? bill.customer_mobile ?? null,
    bikeNumber: bill.bikeNumber ?? bill.bike_number ?? null,
    billDate: bill.billDate ?? bill.bill_date ?? null,
    attachmentName: bill.attachmentName ?? bill.attachment_name ?? null,
    attachmentType: bill.attachmentType ?? bill.attachment_type ?? null,
    attachmentData: bill.attachmentData ?? bill.attachment_data ?? null,
    paymentMethod: bill.paymentMethod ?? bill.payment_method,
    createdAt: bill.createdAt ?? bill.created_at ?? bill.bill_date
  };
}

function viewBill(billId) {
  const bill = (window.allBills || []).find(b => b.id === billId);
  const preview = document.getElementById('bill-preview');
  if (!bill || !preview) return;

  const normalized = normalizeBillForPrint(bill);
  preview.innerHTML = `
    <div class="bill-preview-header">
      <button class="bill-preview-close" type="button" onclick="closeBillPreview()" aria-label="Close Bill Preview">&times;</button>
    </div>
    ${buildInvoiceHtml(normalized, false)}
  `;
  preview.style.display = 'block';
  preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeBillPreview() {
  const preview = document.getElementById('bill-preview');
  if (!preview) return;
  preview.style.display = 'none';
  preview.innerHTML = '';
}

function printBill(billId) {
  const bill = (window.allBills || []).find(b => b.id === billId);
  if (!bill) return;
  window.lastBill = normalizeBillForPrint(bill);
  printReceipt();
}

function openBillAttachment(billId) {
  const bill = (window.allBills || []).find(b => b.id === billId);
  if (!bill || !bill.attachment_data) {
    alert('No attachment found for this bill');
    return;
  }

  const fileName = bill.attachment_name || `bill-attachment-${billId}`;
  const mime = bill.attachment_type || '';
  const dataUrl = bill.attachment_data;
  const isViewable = mime.startsWith('image/') || mime === 'application/pdf' || dataUrl.startsWith('data:image/') || dataUrl.startsWith('data:application/pdf');

  if (isViewable) {
    const w = window.open('', '_blank');
    if (!w) {
      alert('Pop-up blocked. Please allow pop-ups to view attachment.');
      return;
    }
    w.document.write(`
      <!doctype html>
      <html><head><title>${escapeHtml(fileName)}</title><style>body{margin:0;font-family:Arial,sans-serif}iframe,img{width:100vw;height:100vh;border:none;display:block;object-fit:contain;background:#111}</style></head>
      <body>${mime.startsWith('image/') || dataUrl.startsWith('data:image/') ? `<img src="${dataUrl}" alt="${escapeHtml(fileName)}" />` : `<iframe src="${dataUrl}"></iframe>`}</body>
      </html>
    `);
    w.document.close();
    return;
  }

  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ============ QR SCANNING ============

function updateBillingCouponTorchButton() {
  const torchBtn = document.getElementById('billing-coupon-scan-torch');
  if (!torchBtn) return;
  if (!billingCouponTorchSupported) {
    torchBtn.style.display = 'none';
    torchBtn.textContent = 'Torch On';
    return;
  }
  torchBtn.style.display = 'inline-block';
  torchBtn.textContent = billingCouponTorchEnabled ? 'Torch Off' : 'Torch On';
}

async function setBillingCouponTorchState(enable) {
  if (!billingCouponModalTrack || !billingCouponTorchSupported) return false;
  try {
    await billingCouponModalTrack.applyConstraints({ advanced: [{ torch: Boolean(enable) }] });
    billingCouponTorchEnabled = Boolean(enable);
    updateBillingCouponTorchButton();
    return true;
  } catch (error) {
    console.warn('Torch toggle failed:', error);
    showNotification('Torch control not available on this device.', 'error');
    return false;
  }
}

async function toggleBillingCouponTorch() {
  if (!billingCouponTorchSupported) {
    showNotification('Torch not supported on this camera.', 'error');
    return;
  }
  await setBillingCouponTorchState(!billingCouponTorchEnabled);
}

function stopBillingCouponScannerModalStream() {
  if (billingCouponModalInterval) {
    clearInterval(billingCouponModalInterval);
    billingCouponModalInterval = null;
  }

  if (billingCouponTorchEnabled) {
    setBillingCouponTorchState(false).catch(() => {});
  }

  if (billingCouponModalStream) {
    billingCouponModalStream.getTracks().forEach((track) => track.stop());
    billingCouponModalStream = null;
  }
  billingCouponModalTrack = null;
  billingCouponTorchEnabled = false;
  billingCouponTorchSupported = false;
  updateBillingCouponTorchButton();

  const video = document.getElementById('billing-coupon-modal-video');
  if (video) {
    video.pause?.();
    video.srcObject = null;
  }
}

function closeBillingCouponScannerModal() {
  stopBillingCouponScannerModalStream();
  const modal = document.getElementById('billing-coupon-scan-modal');
  if (modal) modal.style.display = 'none';
}

async function startBillingCouponScannerModal() {
  const video = document.getElementById('billing-coupon-modal-video');
  const canvas = document.getElementById('billing-coupon-modal-canvas');
  const status = document.getElementById('billing-coupon-modal-status');
  if (!video || !canvas) {
    showNotification('Coupon scanner UI not found', 'error');
    return;
  }

  const setStatus = (text) => {
    if (status) status.textContent = text;
  };

  stopBillingCouponScannerModalStream();
  setStatus('Starting camera...');

  try {
    const hostname = window.location.hostname || '';
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    const secureOk = window.isSecureContext || isLocalhost;
    if (!secureOk) {
      const secureErr = new Error('Camera requires HTTPS on mobile browsers. Open this app with HTTPS or localhost.');
      secureErr.name = 'NotSecureContextError';
      throw secureErr;
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      throw new Error('Camera API unavailable. Use latest Chrome and open app on HTTPS.');
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
    } catch (primaryError) {
      if (['OverconstrainedError', 'NotFoundError', 'NotReadableError'].includes(primaryError.name)) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } else {
        throw primaryError;
      }
    }

    billingCouponModalStream = stream;
    billingCouponModalTrack = stream.getVideoTracks()[0] || null;
    billingCouponTorchEnabled = false;
    billingCouponTorchSupported = false;
    try {
      const caps = billingCouponModalTrack?.getCapabilities?.();
      billingCouponTorchSupported = Boolean(caps && 'torch' in caps);
    } catch (e) {
      billingCouponTorchSupported = false;
    }
    updateBillingCouponTorchButton();
    video.setAttribute('playsinline', 'true');
    video.setAttribute('autoplay', 'true');
    video.muted = true;
    video.srcObject = stream;
    await video.play().catch(() => {});
    setStatus('Scanning...');

    const detector = (typeof BarcodeDetector !== 'undefined')
      ? new BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar']
        })
      : null;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let scanBusy = false;
    let lastScanAttempt = 0;
    let lastMatchedCode = '';
    const SCAN_INTERVAL_MS = 100;

    billingCouponModalInterval = setInterval(async () => {
      if (scanBusy) return;
      if (!billingCouponModalStream) return;

      const now = Date.now();
      if (now - lastScanAttempt < SCAN_INTERVAL_MS) return;
      lastScanAttempt = now;

      if (!video.videoWidth || !video.videoHeight) return;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      scanBusy = true;
      let codeData = null;

      try {
        if (detector) {
          const barcodes = await detector.detect(video);
          if (barcodes && barcodes.length > 0) {
            codeData = barcodes[0].rawValue || barcodes[0].data;
          }
        }

        if (!codeData && typeof jsQR === 'function') {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const qr = jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
          if (qr?.data) codeData = qr.data;
        }
      } catch (e) {
        // Continue scanning on transient detector errors.
      } finally {
        scanBusy = false;
      }

      if (!codeData) return;

      const normalized = String(codeData || '').trim();
      if (!normalized) return;

      const parsedCoupon = parseCouponQrPayload(normalized);
      const scannedCode = String(parsedCoupon?.code || normalized).trim().toUpperCase();
      if (!scannedCode || scannedCode === lastMatchedCode) return;

      if (!couponLookupByCode.get(scannedCode)) {
        setStatus('Coupon not found, keep scanning...');
        return;
      }

      lastMatchedCode = scannedCode;
      const billingCouponInput = document.getElementById('billing-coupon');
      if (billingCouponInput) billingCouponInput.value = scannedCode;

      setStatus(`Applying ${scannedCode}...`);
      await applyCoupon();
      closeBillingCouponScannerModal();
    }, SCAN_INTERVAL_MS);
  } catch (error) {
    console.error('Coupon modal camera error:', error);
    let errorMsg = `Camera error: ${error.message}`;
    if (error.name === 'NotAllowedError') {
      errorMsg = 'Camera permission denied. Allow camera permission in browser settings.';
    } else if (error.name === 'NotSecureContextError') {
      errorMsg = 'Camera blocked on insecure URL. Use HTTPS URL (or localhost) instead of http://IP:port.';
    } else if (error.name === 'NotFoundError') {
      errorMsg = 'No camera detected on this device.';
    }
    setStatus(errorMsg);
    showNotification(errorMsg, 'error');
  }
}

function openBillingCouponScannerModal() {
  const modal = document.getElementById('billing-coupon-scan-modal');
  if (!modal) {
    showNotification('Coupon scanner modal not found', 'error');
    return;
  }
  stopScanning();
  modal.style.display = 'flex';
  startBillingCouponScannerModal();
}


function stopItemBarcodeScannerModalStream() {
  if (itemBarcodeModalInterval) {
    clearInterval(itemBarcodeModalInterval);
    itemBarcodeModalInterval = null;
  }

  if (itemBarcodeModalStream) {
    itemBarcodeModalStream.getTracks().forEach((track) => track.stop());
    itemBarcodeModalStream = null;
  }

  const video = document.getElementById('item-barcode-modal-video');
  if (video) {
    video.pause?.();
    video.srcObject = null;
  }
}

function closeItemBarcodeScannerModal() {
  stopItemBarcodeScannerModalStream();
  const modal = document.getElementById('item-barcode-scan-modal');
  if (modal) modal.style.display = 'none';
}

async function startItemBarcodeScannerModal() {
  const video = document.getElementById('item-barcode-modal-video');
  const canvas = document.getElementById('item-barcode-modal-canvas');
  const status = document.getElementById('item-barcode-modal-status');
  if (!video || !canvas) {
    showNotification('Item barcode scanner UI not found', 'error');
    return;
  }

  const setStatus = (text) => {
    if (status) status.textContent = text;
  };

  stopItemBarcodeScannerModalStream();
  setStatus('Starting camera...');

  try {
    const hostname = window.location.hostname || '';
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    const secureOk = window.isSecureContext || isLocalhost;
    if (!secureOk) {
      const secureErr = new Error('Camera requires HTTPS on mobile browsers. Open this app with HTTPS or localhost.');
      secureErr.name = 'NotSecureContextError';
      throw secureErr;
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      throw new Error('Camera API unavailable. Use latest Chrome and open app on HTTPS.');
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
    } catch (primaryError) {
      if (['OverconstrainedError', 'NotFoundError', 'NotReadableError'].includes(primaryError.name)) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } else {
        throw primaryError;
      }
    }

    itemBarcodeModalStream = stream;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('autoplay', 'true');
    video.muted = true;
    video.srcObject = stream;
    await video.play().catch(() => {});
    setStatus('Scanning barcode...');

    const detector = (typeof BarcodeDetector !== 'undefined')
      ? new BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar']
        })
      : null;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    let scanBusy = false;
    let lastAttempt = 0;
    const SCAN_INTERVAL_MS = 100;

    itemBarcodeModalInterval = setInterval(async () => {
      if (scanBusy || !itemBarcodeModalStream) return;

      const now = Date.now();
      if (now - lastAttempt < SCAN_INTERVAL_MS) return;
      lastAttempt = now;

      if (!video.videoWidth || !video.videoHeight) return;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      scanBusy = true;
      let codeData = null;

      try {
        if (detector) {
          const barcodes = await detector.detect(video);
          if (barcodes && barcodes.length > 0) {
            codeData = barcodes[0].rawValue || barcodes[0].data;
          }
        }

        if (!codeData && typeof jsQR === 'function') {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const qr = jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
          if (qr?.data) codeData = qr.data;
        }
      } catch (e) {
        // keep scanning on transient errors
      } finally {
        scanBusy = false;
      }

      if (!codeData) return;

      const normalized = String(codeData || '').trim();
      if (!normalized) return;

      applyScannedItemBarcodeData(normalized);
      closeItemBarcodeScannerModal();
    }, SCAN_INTERVAL_MS);
  } catch (error) {
    console.error('Item barcode scanner error:', error);
    let errorMsg = `Camera error: ${error.message}`;
    if (error.name === 'NotAllowedError') {
      errorMsg = 'Camera permission denied. Allow camera permission in browser settings.';
    } else if (error.name === 'NotSecureContextError') {
      errorMsg = 'Camera blocked on insecure URL. Use HTTPS URL (or localhost) instead of http://IP:port.';
    } else if (error.name === 'NotFoundError') {
      errorMsg = 'No camera detected on this device.';
    }
    setStatus(errorMsg);
    showNotification(errorMsg, 'error');
  }
}

function openItemBarcodeScannerModal() {
  const modal = document.getElementById('item-barcode-scan-modal');
  if (!modal) {
    showNotification('Item barcode scanner modal not found', 'error');
    return;
  }

  stopScanning();
  modal.style.display = 'flex';
  startItemBarcodeScannerModal();
}
async function startScanning(type) {
  let videoElement, canvasElement, startBtn, stopBtn;

  if (type === 'coupon') {
    videoElement = document.getElementById('qr-video');
    canvasElement = document.getElementById('qr-canvas');
    startBtn = document.getElementById('start-qr-scan');
    stopBtn = document.getElementById('stop-qr-scan');
  } else if (type === 'item') {
    videoElement = document.getElementById('item-qr-video');
    canvasElement = document.getElementById('item-qr-canvas');
    startBtn = document.getElementById('start-item-scan');
    stopBtn = document.getElementById('stop-item-scan');
  } else if (type === 'billing') {
    videoElement = document.getElementById('billing-qr-video');
    canvasElement = document.getElementById('billing-qr-canvas');
    startBtn = document.getElementById('start-billing-scan');
    stopBtn = document.getElementById('stop-billing-scan');
  }

  if (!videoElement || !canvasElement || !startBtn || !stopBtn) {
    showNotification('Scanner UI not found on this page', 'error');
    return;
  }

  startBtn.style.display = 'none';
  stopBtn.style.display = 'inline-block';

  currentScanning = type;

  try {
    // Request camera with better constraints for mobile
    const constraints = {
      video: { 
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    const hostname = window.location.hostname || '';
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    const secureOk = window.isSecureContext || isLocalhost;

    // On Android Chrome, camera requires HTTPS (or localhost). http://IP:port is blocked.
    if (!secureOk) {
      const secureErr = new Error('Camera requires HTTPS on mobile browsers. Open this app with HTTPS or localhost.');
      secureErr.name = 'NotSecureContextError';
      throw secureErr;
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      throw new Error('Camera API unavailable. Use latest Chrome and open app on HTTPS.');
    }

    // iOS Safari requires playsinline for camera video rendering.
    videoElement.setAttribute('playsinline', 'true');
    videoElement.setAttribute('autoplay', 'true');
    videoElement.muted = true;

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (primaryError) {
      // Fallback for devices where the environment camera constraint fails.
      if (['OverconstrainedError', 'NotFoundError', 'NotReadableError'].includes(primaryError.name)) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } else {
        throw primaryError;
      }
    }
    videoElement.srcObject = stream;
    await videoElement.play().catch(() => {}); // Ensure video plays on mobile

    let scannedCodes = new Set(); // Track recently scanned codes to avoid duplicates
    let lastScanTime = 0;
    let scanningBusy = false;
    let lastScanAttemptTime = 0;
    const SCAN_COOLDOWN = 1000; // Prevent duplicate scans within 1 second
    const SCAN_INTERVAL_MS = 120;
    const detector = (typeof BarcodeDetector !== 'undefined')
      ? new BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar']
        })
      : null;
    if (!detector && !barcodeSupportNoticeShown) {
      barcodeSupportNoticeShown = true;
      showNotification('Barcode scanning is limited in this browser. QR scanning still works.', 'error');
    }

    const context = canvasElement.getContext('2d', { willReadFrequently: true });
    let canvasWidth = 0;
    let canvasHeight = 0;

    const scanInterval = setInterval(async () => {
      if (currentScanning !== type) {
        clearInterval(scanInterval);
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      if (scanningBusy) return;
      const now = Date.now();
      if (now - lastScanAttemptTime < SCAN_INTERVAL_MS) return;
      lastScanAttemptTime = now;

      const canvas = canvasElement;
      const video = videoElement;

      if (!video.videoWidth || !video.videoHeight) {
        return; // Video not ready yet
      }

      if (video.videoWidth !== canvasWidth || video.videoHeight !== canvasHeight) {
        canvasWidth = video.videoWidth;
        canvasHeight = video.videoHeight;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
      }

      scanningBusy = true;
      let codeData = null;
      let codeFormat = null;

      try {
        // Native detector first (usually fastest, handles QR + barcodes).
        if (detector) {
          const barcodes = await detector.detect(video);
          if (barcodes && barcodes.length > 0) {
            codeData = barcodes[0].rawValue || barcodes[0].data;
            codeFormat = barcodes[0].format || 'barcode';
          }
        }

        // jsQR fallback path.
        if (!codeData && typeof jsQR === 'function') {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
          if (code && code.data) {
            codeData = code.data;
            codeFormat = 'qr';
          }
        }
      } catch (e) {
        // ignore detection errors and keep scanning
      } finally {
        scanningBusy = false;
      }

      if (codeData) {
        const normalized = String(codeData).trim();

        // Only handle scan if cooldown has passed and not a duplicate
        if ((now - lastScanTime > SCAN_COOLDOWN) && !scannedCodes.has(normalized)) {
          console.log(' Scan result:', normalized, codeFormat || '');
          handleQRResult(normalized, type);
          lastScanTime = now;
          scannedCodes.add(normalized);
          setTimeout(() => scannedCodes.delete(normalized), 3000);
          
          // For billing, optionally continue scanning
          if (type === 'billing') {
            if (billingScanPurpose === 'coupon') {
              stopScanning();
              billingScanPurpose = null;
              return;
            }
            // Don't auto-stop, keep scanning for more items
            console.log(' Ready for next scan...');
          } else {
            // For coupon and item checks, stop after first scan
            stopScanning();
          }
        }
      }
    }, 100);
  } catch (error) {
    console.error(' Camera error:', error);
    let errorMsg = `Camera error: ${error.message}`;
    if (error.name === 'NotAllowedError') {
      errorMsg = 'Camera permission denied. Allow camera permission in browser settings.';
    } else if (error.name === 'NotSecureContextError') {
      errorMsg = 'Camera blocked on insecure URL. Use HTTPS URL (or localhost) instead of http://IP:port.';
    } else if (error.name === 'NotFoundError') {
      errorMsg = 'No camera detected on this device.';
    }
    
    // Show error as notification
    const notification = document.createElement('div');
    notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#ef4444;color:white;padding:15px 20px;border-radius:6px;box-shadow:0 4px 6px rgba(0,0,0,0.1);z-index:1000;max-width:300px;';
    notification.textContent = errorMsg;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
    
    startBtn.style.display = 'inline-block';
    stopBtn.style.display = 'none';
  }
}

function stopScanning() {
  currentScanning = null;
  billingScanPurpose = null;

  const stopScannerStream = (videoId, startBtnId, stopBtnId) => {
    const video = document.getElementById(videoId);
    const start = document.getElementById(startBtnId);
    const stop = document.getElementById(stopBtnId);

    if (video?.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
    if (start) start.style.display = 'inline-block';
    if (stop) stop.style.display = 'none';
  };

  stopScannerStream('qr-video', 'start-qr-scan', 'stop-qr-scan');
  stopScannerStream('item-qr-video', 'start-item-scan', 'stop-item-scan');
  stopScannerStream('billing-qr-video', 'start-billing-scan', 'stop-billing-scan');
  stopBillingCouponScannerModalStream();
  stopItemBarcodeScannerModalStream();
}

function handleQRResult(data, type) {
  if (type === 'coupon') {
    const parsedCoupon = parseCouponQrPayload(data);
    const scannedCode = (parsedCoupon?.code || data || '').trim().toUpperCase();
    console.log(' QR Scanned (coupon):', scannedCode);
    if (!document.getElementById('manual-coupon-code')) {
      console.error(' Manual coupon code input not found');
      showNotification('Error: Form element not found', 'error');
      return;
    }
    document.getElementById('manual-coupon-code').value = scannedCode;
    console.log(' Set coupon code to:', scannedCode);
    // Automatically validate
    validateCouponManual();
  } else if (type === 'item') {
    console.log(' QR Scanned (item):', data);
    const parsed = parseItemQrPayload(data);
    if (parsed) {
      const code = parsed.code || data;
      const input = document.getElementById('manual-item-code');
      if (!input) {
        console.error(' Manual item code input not found');
        showNotification('Error: Form element not found', 'error');
        return;
      }
      input.value = code;
      if (parsed.name && parsed.price) {
        // optional: show quick info
        showNotification(`Item: ${parsed.name} (${parsed.price})`, 'success');
      }
      checkItemManual();
      return;
    }
    if (!document.getElementById('manual-item-code')) {
      console.error(' Manual item code input not found');
      showNotification('Error: Form element not found', 'error');
      return;
    }
    document.getElementById('manual-item-code').value = data.trim();
    console.log(' Set item code to:', data.trim());
    // Automatically check
    checkItemManual();
  } else if (type === 'billing') {
    const parsed = parseItemQrPayload(data);
    const scannedValue = String(parsed?.code || data || '').trim();
    const scannedValueUpper = scannedValue.toUpperCase();

    // If scanned code matches a coupon, apply it
    const possibleCoupon = couponLookupByCode.get(scannedValueUpper);
    if (possibleCoupon) {
      const billingInput = document.getElementById('billing-coupon');
      if (billingInput) billingInput.value = scannedValueUpper;
      applyCoupon();
      // If this scan was triggered from coupon scan button, stop scanning
      if (billingScanPurpose === 'coupon') {
        stopScanning();
        billingScanPurpose = null;
      }
      return;
    }

    // Find item by code or name and add to cart
    let item = itemLookupByCode.get(scannedValueUpper);
    
    // Fallback: search by item name if code not found
    if (!item) {
      item = itemLookupByName.get(scannedValue.toLowerCase());
    }
    
    if (item) {
      // Check if item already in cart and increment quantity
      const existingItem = currentCart.find(i => i.id === item.id);
      if (existingItem) {
        existingItem.quantity += 1;
      } else {
        currentCart.push({
          id: item.id,
          name: item.item_name,
          price: item.item_price,
          quantity: 1
        });
      }
      
      updateCartDisplay();
      
      // Show success feedback
      const notification = document.createElement('div');
      notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:white;padding:15px 20px;border-radius:6px;box-shadow:0 4px 6px rgba(0,0,0,0.1);z-index:1000;animation:slideIn 0.3s ease-out;';
      notification.textContent = ` ${item.item_name} added to cart`;
      document.body.appendChild(notification);
      
      setTimeout(() => notification.remove(), 2500);
      
      // Auto-checkout if toggle is enabled
      const autoCheckout = document.getElementById('auto-checkout-toggle')?.checked;
      if (autoCheckout && currentCart.length > 0) {
        // Auto-checkout after 1.5 seconds to show the notification
        setTimeout(() => {
          checkout();
        }, 1500);
      }
    } else {
      // If QR has embedded item data, add it directly
      if (parsed && parsed.name && parsed.price) {
        const tempId = `QR-${parsed.code || parsed.name}`;
        const existingItem = currentCart.find(i => i.id === tempId);
        if (existingItem) {
          existingItem.quantity += 1;
        } else {
          currentCart.push({
            id: tempId,
            name: parsed.name,
            price: parsed.price,
            quantity: 1
          });
        }
        updateCartDisplay();
        const notification = document.createElement('div');
        notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:white;padding:15px 20px;border-radius:6px;box-shadow:0 4px 6px rgba(0,0,0,0.1);z-index:1000;animation:slideIn 0.3s ease-out;';
        notification.textContent = ` ${parsed.name} added to cart`;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2500);
        return;
      }
      // Item not found - show error
      const notification = document.createElement('div');
      notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#ef4444;color:white;padding:15px 20px;border-radius:6px;box-shadow:0 4px 6px rgba(0,0,0,0.1);z-index:1000;animation:slideIn 0.3s ease-out;';
      notification.textContent = ` Item not found (code: ${scannedValue})`;
      document.body.appendChild(notification);
      
      setTimeout(() => notification.remove(), 3000);
    }
  }
}

// ============ DASHBOARD ============

async function loadDashboard() {
  try {
    const safeUserId = ensureCurrentUserId();
    if (!safeUserId) {
      console.warn('Skipping dashboard load: userId not ready');
      return;
    }
    const userId = encodeURIComponent(currentUser?.id || '');
    const [couponsRes, itemsRes, billsRes, usersRes, inventoryRes] = await Promise.all([
      fetch(`${API_BASE}/coupons?userId=${userId}`),
      fetch(`${API_BASE}/items?userId=${userId}`),
      fetch(`${API_BASE}/bills?userId=${userId}`),
      fetch(`${API_BASE}/users`),
      fetch(`${API_BASE}/inventory-status?userId=${userId}`)
    ]);

    const coupons = await couponsRes.json();
    const items = await itemsRes.json();
    const bills = await billsRes.json();
    const users = await usersRes.json();
    const lowStock = await inventoryRes.json();

    // Count active/inactive coupons
    const today = new Date();
    let activeCoupons = 0;
    let inactiveCoupons = 0;
    
    coupons.forEach(coupon => {
      const expiresAt = new Date(coupon.expires_at);
      if (expiresAt > today && coupon.used_count < coupon.max_uses) {
        activeCoupons++;
      } else {
        inactiveCoupons++;
      }
    });

    let totalRevenue = 0;
    bills.forEach(bill => {
      totalRevenue += bill.final_price || 0;
    });

    // Update main stats
    document.getElementById('stat-coupons').textContent = coupons.length;
    document.getElementById('stat-items').textContent = items.length;
    document.getElementById('stat-bills').textContent = bills.length;
    document.getElementById('stat-revenue').textContent = '' + totalRevenue.toFixed(2);
    document.getElementById('stat-low-stock').textContent = lowStock.length;
    document.getElementById('stat-users').textContent = users.length;

    // Update status indicators
    const itemsStatus = items.length > 0 ? `OK ${items.length} items added` : 'WARN No items added';
    const couponsStatus = coupons.length > 0 ? `OK ${coupons.length} coupons (${activeCoupons} active, ${inactiveCoupons} inactive)` : 'WARN No coupons added';
    const allStatus = items.length > 0 && coupons.length > 0 && (activeCoupons > 0) ? 'OK All features active' : 'WARN Setup required';
    
    const statusElements = document.querySelectorAll('[id$="-status"]');
    if (statusElements.length > 0) {
      statusElements.forEach(el => {
        if (el.id === 'items-status') el.textContent = itemsStatus;
        if (el.id === 'coupons-status') el.textContent = couponsStatus;
        if (el.id === 'all-status') el.textContent = allStatus;
      });
    }

    allItems = items;
    allCoupons = coupons;
    rebuildCodeLookupMaps();
    
    console.log('Dashboard loaded:', { items: items.length, coupons: coupons.length, active: activeCoupons, inactive: inactiveCoupons });
  } catch (error) {
    console.error('Error loading dashboard:', error);
    const now = Date.now();
    if (now - dashboardErrorNoticeAt > 8000) {
      dashboardErrorNoticeAt = now;
      showNotification('Dashboard load failed. Retrying...', 'error');
    }
  }
}

async function loadAllData() {
  if (!ensureCurrentUserId()) return;
  await loadDashboard();
  await loadAllCategories();
  await loadCoupons();
  await loadItems();
}

// ============ ANALYTICS ============

async function loadAnalytics() {
  try {
    const userId = encodeURIComponent(currentUser?.id || '');
    const [analyticsRes, billsRes] = await Promise.all([
      fetch(`${API_BASE}/analytics?userId=${userId}`),
      fetch(`${API_BASE}/bills?userId=${userId}`)
    ]);

    const analytics = await analyticsRes.json();
    const bills = await billsRes.json();

    // Sales chart
    const dates = analytics.map(a => a.date).reverse();
    const salesData = analytics.map(a => a.total_bills).reverse();
    const revenueData = analytics.map(a => parseFloat(a.total_revenue || 0)).reverse();

    if (chartInstances.salesChart) chartInstances.salesChart.destroy();
    const salesCtx = document.getElementById('salesChart');
    chartInstances.salesChart = new Chart(salesCtx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [{
          label: 'Bills Created',
          data: salesData,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: true } }
      }
    });

    if (chartInstances.revenueChart) chartInstances.revenueChart.destroy();
    const revenueCtx = document.getElementById('revenueChart');
    chartInstances.revenueChart = new Chart(revenueCtx, {
      type: 'bar',
      data: {
        labels: dates,
        datasets: [{
          label: 'Revenue ()',
          data: revenueData,
          backgroundColor: '#10b981'
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: true } }
      }
    });
  } catch (error) {
    console.error('Error loading analytics:', error);
  }
}

async function exportCSV(type) {
  try {
    const userId = encodeURIComponent(currentUser?.id || '');
    const url = `${API_BASE}/export/${type}?userId=${userId}`;
    const response = await fetch(url);
    const csv = await response.text();
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${type}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  } catch (error) {
    alert(' Export error: ' + error.message);
  }
}

// ============ ACTIVITY LOG ============

async function loadActivityLogs() {
  try {
    const response = await fetch(`${API_BASE}/logs`);
    const logs = await response.json();
    
    const logsList = document.getElementById('activity-list');
    logsList.innerHTML = '';

    logs.slice(0, 50).forEach(log => {
      const element = document.createElement('div');
      element.className = 'list-item';
      element.innerHTML = `
        <div class="list-item-content">
          <h4>${log.action}</h4>
          <p>Type: ${log.entity_type} | Details: ${log.details}</p>
          <p class="time"> ${new Date(log.created_at).toLocaleString()}</p>
        </div>
      `;
      logsList.appendChild(element);
    });
  } catch (error) {
    console.error('Error loading logs:', error);
  }
}

// ============ SETTINGS ============

async function loadSettings() {
  try {
    const userId = encodeURIComponent(currentUser?.id || '');
    const [settingsRes, categoriesRes] = await Promise.all([
      fetch(`${API_BASE}/settings`),
      fetch(`${API_BASE}/categories?userId=${userId}`)
    ]);

    const settings = await settingsRes.json();
    allCategories = await categoriesRes.json();

    document.getElementById('setting-company').value = settings.company_name || '';
    document.getElementById('setting-currency').value = settings.currency || '';
    document.getElementById('setting-tax').value = settings.tax_percent || '0';

    loadCategoryList();
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function saveSettings() {
  try {
    const settingsToSave = {
      company_name: document.getElementById('setting-company').value,
      currency: document.getElementById('setting-currency').value,
      tax_percent: document.getElementById('setting-tax').value
    };

    for (const [key, value] of Object.entries(settingsToSave)) {
      await fetch(`${API_BASE}/settings/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      });
    }

    alert(' Settings saved');
  } catch (error) {
    alert(' Error: ' + error.message);
  }
}

async function addNewCategory() {
  const categoryName = document.getElementById('new-category').value;
  
  if (!categoryName) {
    alert('Please enter category name');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: categoryName, userId: currentUser?.id || null })
    });

    if (!response.ok) throw new Error('Failed to add');
    
    alert(' Category added');
    document.getElementById('new-category').value = '';
    loadSettings();
    loadAllCategories();
  } catch (error) {
    alert(' Error: ' + error.message);
  }
}

async function loadAllCategories() {
  try {
    const userId = encodeURIComponent(currentUser?.id || '');
    const response = await fetch(`${API_BASE}/categories?userId=${userId}`);
    allCategories = await response.json();
    
    const select = document.getElementById('item-category');
    if (select) {
      select.innerHTML = '<option>-- Select Category --</option>';
      allCategories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.name;
        select.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

function loadCategoryList() {
  const list = document.getElementById('categories-list');
  list.innerHTML = '';
  allCategories.forEach(cat => {
    const element = document.createElement('div');
    element.className = 'list-item';
    element.innerHTML = `
      <div class="list-item-content">
        <h4>${cat.name}</h4>
        <p>${cat.description || 'No description'}</p>
      </div>
    `;
    list.appendChild(element);
  });
}

// ============ PRINTING ============

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrency(value) {
  const currencySymbol = appSettings?.currency || 'Rs';
  return `${currencySymbol} ${toAmount(value).toFixed(2)}`;
}

function buildInvoiceHtml(rawBill, forPrint = false) {
  const bill = normalizeBillForPrint(rawBill);
  const displayDateValue = bill.billDate || bill.createdAt;
  const billDate = displayDateValue ? new Date(displayDateValue) : new Date();
  const companyName = appSettings?.company_name || 'Bill management';
  const customerName = bill.customerName || 'Walk-in';
  const customerMobile = bill.customerMobile || '-';
  const bikeNumber = bill.bikeNumber || '-';
  const attachmentName = bill.attachmentName || 'None';
  const cashier = currentUser?.username || currentUser?.email || 'System';
  const paymentMethod = (bill.paymentMethod || 'cash').toUpperCase();
  const items = Array.isArray(bill.items) ? bill.items : [];

  const computedSubtotal = items.reduce((sum, item) => sum + (toAmount(item.price) * toAmount(item.quantity || 1)), 0);
  const subtotal = toAmount(bill.totalPrice || computedSubtotal);
  const discount = toAmount(bill.discountAmount);
  const total = toAmount(bill.finalPrice || (subtotal - discount));
  const couponCode = bill.couponCode ? String(bill.couponCode) : 'N/A';

  const rows = items.map((item, idx) => {
    const qty = toAmount(item.quantity || 1);
    const rate = toAmount(item.price);
    const amount = qty * rate;
    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(item.name || item.item_name || 'Item')}</td>
        <td>${qty}</td>
        <td>${formatCurrency(rate)}</td>
        <td>${formatCurrency(amount)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="invoice-wrap${forPrint ? ' print' : ''}">
      <div class="invoice-head">
        <div>
          <h2>${escapeHtml(companyName)}</h2>
          <p>Tax Invoice / Retail Bill</p>
        </div>
        <div class="invoice-id">#${escapeHtml((bill.billId || `TEMP-${Date.now()}`).toString().slice(0, 12))}</div>
      </div>

      <div class="invoice-meta">
        <p><strong>Date:</strong> ${escapeHtml(billDate.toLocaleString())}</p>
        <p><strong>Customer:</strong> ${escapeHtml(customerName)}</p>
        <p><strong>Mobile:</strong> ${escapeHtml(customerMobile)}</p>
        <p><strong>Bike No:</strong> ${escapeHtml(bikeNumber)}</p>
        <p><strong>Cashier:</strong> ${escapeHtml(cashier)}</p>
        <p><strong>Payment:</strong> ${escapeHtml(paymentMethod)}</p>
        <p><strong>Coupon:</strong> ${escapeHtml(couponCode)}</p>
        <p><strong>Attachment:</strong> ${escapeHtml(attachmentName)}</p>
      </div>

      <table class="invoice-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="5" style="text-align:center;">No items</td></tr>'}
        </tbody>
      </table>

      <div class="invoice-totals">
        <p><span>Subtotal</span><strong>${formatCurrency(subtotal)}</strong></p>
        <p><span>Discount</span><strong>${formatCurrency(discount)}</strong></p>
        <p class="grand-total"><span>Net Total</span><strong>${formatCurrency(total)}</strong></p>
      </div>

      <div class="invoice-signature">
        <div class="signature-line"></div>
        <p>Authorised by Shahid</p>
      </div>

      <p class="invoice-footer">Thank you for your purchase.</p>
    </div>
  `;
}

function isMobileClient() {
  return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
}

function updateReceiptActionButtonLabel() {
  const btn = document.getElementById('billing-receipt-action-btn');
  if (!btn) return;
  btn.textContent = isMobileClient() ? 'Download' : 'Print';
}

function getCurrentBillForReceipt() {
  if (!window.lastBill && currentCart.length === 0) return null;
  return window.lastBill || {
    billId: `TEMP-${Date.now()}`,
    items: currentCart,
    totalPrice: window.currentSubtotal,
    discountAmount: 0,
    finalPrice: window.currentSubtotal,
    couponCode: window.appliedCoupon || null,
    customerName: document.getElementById('billing-customer-name')?.value?.trim() || null,
    customerMobile: document.getElementById('billing-customer-mobile')?.value?.trim() || null,
    bikeNumber: document.getElementById('billing-bike-number')?.value?.trim() || null,
    billDate: document.getElementById('billing-date')?.value || null,
    createdAt: new Date().toISOString()
  };
}

function buildInvoiceDocumentHtml(bill, invoiceHtml) {
  return `
    <!doctype html>
    <html>
      <head>
        <title>Invoice ${escapeHtml((bill.billId || 'TEMP').toString().slice(0, 12))}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
          .invoice-wrap { max-width: 820px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; }
          .invoice-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #e5e7eb; padding-bottom: 14px; margin-bottom: 14px; }
          .invoice-head h2 { margin: 0; font-size: 24px; }
          .invoice-head p { margin: 6px 0 0; color: #6b7280; font-size: 13px; }
          .invoice-id { font-weight: 700; font-size: 16px; }
          .invoice-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 24px; margin-bottom: 16px; font-size: 13px; }
          .invoice-meta p { margin: 0; }
          .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
          .invoice-table th, .invoice-table td { border: 1px solid #e5e7eb; padding: 8px; font-size: 13px; text-align: left; }
          .invoice-table th { background: #f9fafb; }
          .invoice-totals { margin-left: auto; max-width: 300px; }
          .invoice-totals p { display: flex; justify-content: space-between; margin: 4px 0; font-size: 14px; }
          .invoice-totals .grand-total { border-top: 1px solid #d1d5db; padding-top: 7px; margin-top: 7px; font-size: 16px; }
          .invoice-signature { margin-top: 20px; text-align: right; }
          .signature-line { width: 220px; margin-left: auto; border-top: 1px solid #111827; margin-bottom: 6px; }
          .invoice-signature p { margin: 0; font-size: 13px; font-weight: 600; }
          .invoice-footer { margin-top: 16px; text-align: center; color: #6b7280; font-size: 12px; }
          @media print {
            body { margin: 0; }
            .invoice-wrap { border: none; border-radius: 0; padding: 0; }
          }
        </style>
      </head>
      <body>${invoiceHtml}</body>
    </html>
  `;
}

function downloadReceipt() {
  const bill = getCurrentBillForReceipt();
  if (!bill) {
    alert('No bill to download');
    return;
  }

  const invoiceHtml = buildInvoiceHtml(bill, true);
  const fullDoc = buildInvoiceDocumentHtml(bill, invoiceHtml);
  const blob = new Blob([fullDoc], { type: 'text/html;charset=utf-8' });
  const fileName = `invoice-${(bill.billId || 'TEMP').toString().slice(0, 12)}.html`;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
}

function handleReceiptAction() {
  if (isMobileClient()) {
    downloadReceipt();
    return;
  }
  printReceipt();
}

function printReceipt() {
  if (isMobileClient()) {
    downloadReceipt();
    return;
  }

  const bill = getCurrentBillForReceipt();
  if (!bill) {
    alert('No bill to print');
    return;
  }
  const invoiceHtml = buildInvoiceHtml(bill, true);
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    alert('Pop-up blocked. Please allow pop-ups to print the bill.');
    return;
  }

  printWindow.document.write(buildInvoiceDocumentHtml(bill, invoiceHtml));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
}


