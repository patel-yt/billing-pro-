const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initializeDatabase, loginUser, registerUser, getAllUsers, getUserProfileByEmail, upsertUserProfile, addCategory, getAllCategories, addCoupon, validateCoupon, getAllCoupons, deleteCoupon, deleteAllCoupons, addItem, getItem, getAllItems, deleteItem, addBill, deleteBill, deleteAllBills, getBills, logActivity, getActivityLogs, getSetting, updateSetting, getAllSettings, getAnalytics, getInventoryStatus, getItemsForExport, getCouponsForExport, getBillsForExport, consumeCoupon, updateCouponMedia, updateItemMedia, cleanupInvalidCoupons } = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) return;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    });
  } catch (e) {
    console.warn('Could not parse .env file');
  }
}

function getEnv(primaryKey, fallbackKey) {
  return process.env[primaryKey] || process.env[fallbackKey] || '';
}

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Database
initializeDatabase();
loadEnvFile();

function getFirebaseDbBaseUrl() {
  const raw = getEnv('FIREBASE_DATABASE_URL', 'VITE_FIREBASE_DATABASE_URL');
  return String(raw || '').replace(/\/+$/, '');
}

function getFirebaseDbSecret() {
  return String(getEnv('FIREBASE_DB_SECRET', 'VITE_FIREBASE_DB_SECRET') || '').trim();
}

function firebaseEnabled() {
  return Boolean(getFirebaseDbBaseUrl()) && typeof fetch === 'function';
}

function toFirebaseKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.#$/\[\]]/g, '_');
}

function buildFirebaseUrl(dbPath) {
  const base = getFirebaseDbBaseUrl();
  if (!base) return null;
  const safePath = String(dbPath || '').replace(/^\/+/, '');
  const secret = getFirebaseDbSecret();
  const authQuery = secret ? `?auth=${encodeURIComponent(secret)}` : '';
  return `${base}/${safePath}.json${authQuery}`;
}

async function firebasePut(dbPath, payload) {
  const url = buildFirebaseUrl(dbPath);
  if (!url) return false;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Firebase PUT failed (${response.status})`);
  return true;
}

async function firebasePatch(dbPath, payload) {
  const url = buildFirebaseUrl(dbPath);
  if (!url) return false;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Firebase PATCH failed (${response.status})`);
  return true;
}

async function firebaseDeleteNode(dbPath) {
  const url = buildFirebaseUrl(dbPath);
  if (!url) return false;
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Firebase DELETE failed (${response.status})`);
  return true;
}

function syncToFirebase(taskLabel, promiseFactory) {
  if (!firebaseEnabled()) return;
  Promise.resolve()
    .then(() => promiseFactory())
    .catch((err) => {
      console.error(`[firebase-sync] ${taskLabel}:`, err.message || err);
    });
}

function requiredUserIdFromQuery(req, res) {
  const userId = String(req.query.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return null;
  }
  return userId;
}

function requiredUserIdFromBody(req, res) {
  const userId = String(req.body.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return null;
  }
  return userId;
}

// CSV Export Helper
function arrayToCSV(array) {
  if (!array || array.length === 0) return '';
  const headers = Object.keys(array[0]);
  const csv = [headers.join(',')];
  array.forEach(row => {
    csv.push(headers.map(header => {
      const value = row[header];
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(','));
  });
  return csv.join('\n');
}

// ============ USER ROUTES ============

app.get('/api/config/firebase', (req, res) => {
  const firebaseConfig = {
    apiKey: getEnv('FIREBASE_API_KEY', 'VITE_FIREBASE_API_KEY'),
    authDomain: getEnv('FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_AUTH_DOMAIN'),
    databaseURL: getEnv('FIREBASE_DATABASE_URL', 'VITE_FIREBASE_DATABASE_URL'),
    projectId: getEnv('FIREBASE_PROJECT_ID', 'VITE_FIREBASE_PROJECT_ID'),
    storageBucket: getEnv('FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getEnv('FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getEnv('FIREBASE_APP_ID', 'VITE_FIREBASE_APP_ID'),
    measurementId: getEnv('FIREBASE_MEASUREMENT_ID', 'VITE_FIREBASE_MEASUREMENT_ID')
  };

  const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
  const missing = required.filter((key) => !firebaseConfig[key]);
  if (missing.length > 0) {
    return res.status(503).json({ error: `Firebase config missing: ${missing.join(', ')}` });
  }

  res.json(firebaseConfig);
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const user = await loginUser(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/register', (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    
    registerUser(username, email, password, 'user').then(userId => {
      syncToFirebase(`user/${userId}`, () => firebasePut(`users/${userId}`, {
        id: userId,
        username,
        email,
        role: 'user',
        is_active: 1,
        source: 'sqlite-sync'
      }));
      res.json({ success: true, userId, message: 'User registered successfully' });
    }).catch(error => {
      res.status(400).json({ error: 'Username already exists' });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users', (req, res) => {
  try {
    getAllUsers().then(users => {
      res.json(users);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/profile', async (req, res) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const profile = await getUserProfileByEmail(email);
    res.json(profile || { email, full_name: null, phone: null, address: null, city: null, state: null, pincode: null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/profile', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const fullName = String(req.body.fullName || '').trim();
    const isGoogleLogin = Boolean(req.body.isGoogleLogin);

    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (isGoogleLogin && !fullName) {
      return res.status(400).json({ error: 'Name is required for Google users' });
    }

    await upsertUserProfile(email, {
      fullName,
      phone: String(req.body.phone || '').trim(),
      address: String(req.body.address || '').trim(),
      city: String(req.body.city || '').trim(),
      state: String(req.body.state || '').trim(),
      pincode: String(req.body.pincode || '').trim()
    });

    const updated = await getUserProfileByEmail(email);
    const profileKey = toFirebaseKey(email);
    syncToFirebase(`profile/${profileKey}`, () => firebasePut(`profiles/${profileKey}`, updated || {
      email,
      full_name: fullName || null
    }));
    res.json({ success: true, profile: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ CATEGORY ROUTES ============

app.post('/api/categories', (req, res) => {
  try {
    const userId = requiredUserIdFromBody(req, res);
    if (!userId) return;
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Category name required' });
    }
    
    addCategory(name, description || '', userId || null).then(categoryId => {
      syncToFirebase(`category/${categoryId}`, () => firebasePut(`categories/${categoryId}`, {
        id: categoryId,
        user_id: userId || null,
        name,
        description: description || ''
      }));
      res.json({ success: true, categoryId });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/categories', (req, res) => {
  try {
    const userId = requiredUserIdFromQuery(req, res);
    if (!userId) return;
    getAllCategories(userId).then(categories => {
      res.json(categories);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ COUPON ROUTES ============

app.post('/api/coupons', (req, res) => {
  try {
    const userId = requiredUserIdFromBody(req, res);
    if (!userId) return;
    const { couponCode, discountPercent, status, minPurchase, maxUses, expiresAt, qrData, barcodeData } = req.body;
    
    if (!couponCode || !discountPercent) {
      return res.status(400).json({ error: 'Coupon code and discount percent are required' });
    }
    
    addCoupon(couponCode, discountPercent, status || 'valid', minPurchase, maxUses, expiresAt, qrData || null, barcodeData || null, userId || null).then(result => {
      syncToFirebase(`coupon/${result}`, () => firebasePut(`coupons/${result}`, {
        id: result,
        user_id: userId || null,
        coupon_code: couponCode,
        discount_percent: discountPercent,
        status: status || 'valid',
        min_purchase: minPurchase || 0,
        max_uses: typeof maxUses === 'number' ? maxUses : -1,
        used_count: 0,
        expires_at: expiresAt || null,
        qr_data: qrData || null,
        barcode_data: barcodeData || null,
        source: 'sqlite-sync'
      }));
      res.json({ success: true, couponId: result, message: 'Coupon added successfully' });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/coupons', (req, res) => {
  try {
    const userId = requiredUserIdFromQuery(req, res);
    if (!userId) return;
    cleanupInvalidCoupons(userId).then(() => getAllCoupons(userId)).then(coupons => {
      res.json(coupons);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/coupons/validate', (req, res) => {
  try {
    const userId = requiredUserIdFromBody(req, res);
    if (!userId) return;
    const { couponCode } = req.body;
    
    if (!couponCode) {
      console.log('⚠️ Coupon validation: No code provided');
      return res.status(400).json({ error: 'Coupon code is required' });
    }
    
    console.log('🔍 Validating coupon:', couponCode);
    validateCoupon(couponCode, userId || null).then(coupon => {
      console.log('✅ Coupon validation result:', coupon);
      res.json(coupon);
    }).catch(error => {
      console.error('❌ Coupon validation error:', error);
      res.status(500).json({ error: error.message });
    });
  } catch (error) {
    console.error('❌ Validation endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ ITEM ROUTES ============

app.post('/api/items', (req, res) => {
  try {
    const userId = requiredUserIdFromBody(req, res);
    if (!userId) return;
    const { itemName, itemPrice, itemCode, categoryId, stockQuantity, description, qrData } = req.body;
    
    if (!itemName || !itemPrice) {
      return res.status(400).json({ error: 'Item name and price are required' });
    }
    
    const finalItemCode = itemCode || `ITEM-${Date.now()}`;
    addItem(itemName, itemPrice, finalItemCode, categoryId, stockQuantity, description, qrData || null, userId || null).then(result => {
      syncToFirebase(`item/${result}`, () => firebasePut(`items/${result}`, {
        id: result,
        user_id: userId || null,
        item_name: itemName,
        item_price: itemPrice,
        item_code: finalItemCode,
        category_id: categoryId || null,
        stock_quantity: typeof stockQuantity === 'number' ? stockQuantity : 100,
        description: description || '',
        qr_data: qrData || null,
        source: 'sqlite-sync'
      }));
      res.json({ success: true, itemId: result, message: 'Item added successfully' });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/items', (req, res) => {
  try {
    const userId = requiredUserIdFromQuery(req, res);
    if (!userId) return;
    getAllItems(userId).then(items => {
      res.json(items);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/items/:id', (req, res) => {
  try {
    const userId = requiredUserIdFromQuery(req, res);
    if (!userId) return;
    getItem(req.params.id, userId).then(item => {
      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }
      res.json(item);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/items/:id', (req, res) => {
  try {
    const userId = requiredUserIdFromQuery(req, res);
    if (!userId) return;
    deleteItem(req.params.id, userId).then((changes) => {
      if (userId && !changes) {
        return res.status(404).json({ error: 'Item not found for this user' });
      }
      syncToFirebase(`item-delete/${req.params.id}`, () => firebaseDeleteNode(`items/${req.params.id}`));
      res.json({ success: true, message: 'Item deleted successfully' });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/items/:id/media', (req, res) => {
  try {
    const { id } = req.params;
    const userId = requiredUserIdFromBody(req, res);
    if (!userId) return;
    const { qrData } = req.body;
    if (!qrData) {
      return res.status(400).json({ error: 'qrData is required' });
    }
    updateItemMedia(id, qrData, userId || null).then(() => {
      syncToFirebase(`item-media/${id}`, () => firebasePatch(`items/${id}`, { qr_data: qrData || null }));
      res.json({ success: true });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ COUPON DELETE ROUTE ============

app.delete('/api/coupons', async (req, res) => {
  try {
    const userId = requiredUserIdFromQuery(req, res);
    if (!userId) return;
    await deleteAllCoupons(userId);
    syncToFirebase('coupons-delete-all', () => firebaseDeleteNode('coupons'));
    res.json({ success: true, message: 'All coupons deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to delete all coupons' });
  }
});

app.delete('/api/coupons/:id', async (req, res) => {
  try {
    const userId = requiredUserIdFromQuery(req, res);
    if (!userId) return;
    const changes = await deleteCoupon(req.params.id, userId);
    if (userId && !changes) {
      return res.status(404).json({ error: 'Coupon not found for this user' });
    }
    syncToFirebase(`coupon-delete/${req.params.id}`, () => firebaseDeleteNode(`coupons/${req.params.id}`));
    res.json({ success: true, message: 'Coupon deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to delete coupon' });
  }
});

// ============ BILL ROUTES ============

app.post('/api/bills', async (req, res) => {
  try {
    const userId = requiredUserIdFromBody(req, res);
    if (!userId) return;
    const { items, couponCode, paymentMethod, customerName, customerMobile, bikeNumber, billDate, attachment } = req.body;
    
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No items in bill' });
    }
    
    let totalPrice = 0;
    let discountAmount = 0;
    let appliedCoupon = null;
    
    items.forEach(item => {
      totalPrice += item.price * item.quantity;
    });
    
    if (couponCode) {
      const coupon = await validateCoupon(couponCode, userId || null);
      if (coupon.found && coupon.status === 'valid') {
        // Enforce minimum purchase if set
        if (!coupon.minPurchase || totalPrice >= coupon.minPurchase) {
          discountAmount = (totalPrice * coupon.discountPercent) / 100;
          appliedCoupon = coupon.couponCode;
        }
      }
    }

    if (appliedCoupon) {
      const consumeResult = await consumeCoupon(appliedCoupon, userId || null);
      if (!consumeResult.applied) {
        discountAmount = 0;
        appliedCoupon = null;
      }
    }

    const finalPrice = totalPrice - discountAmount;
    const billId = await addBill(
      JSON.stringify(items),
      appliedCoupon || null,
      totalPrice,
      discountAmount,
      finalPrice,
      userId,
      paymentMethod,
      customerName || null,
      customerMobile || null,
      bikeNumber || null,
      billDate || null,
      attachment?.name || null,
      attachment?.type || null,
      attachment?.data || null
    );

    if (userId) logActivity(userId, 'CREATE', 'bill', billId, JSON.stringify({ items: items.length, total: finalPrice }));
    syncToFirebase(`bill/${billId}`, () => firebasePut(`bills/${billId}`, {
      id: billId,
      user_id: userId || null,
      customer_name: customerName || null,
      customer_mobile: customerMobile || null,
      bike_number: bikeNumber || null,
      bill_date: billDate || null,
      attachment_name: attachment?.name || null,
      attachment_type: attachment?.type || null,
      attachment_data: attachment?.data || null,
      items_json: JSON.stringify(items),
      coupon_code: appliedCoupon || null,
      total_price: totalPrice,
      discount_amount: discountAmount,
      final_price: finalPrice,
      payment_method: paymentMethod || 'cash',
      source: 'sqlite-sync'
    }));
    res.json({
      success: true,
      billId,
      totalPrice,
      discountAmount,
      finalPrice,
      customerName: customerName || null,
      customerMobile: customerMobile || null,
      bikeNumber: bikeNumber || null,
      billDate: billDate || null,
      attachmentName: attachment?.name || null,
      attachmentType: attachment?.type || null,
      hasAttachment: Boolean(attachment?.data)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/coupons/:id/media', (req, res) => {
  try {
    const { id } = req.params;
    const userId = requiredUserIdFromBody(req, res);
    if (!userId) return;
    const { qrData, barcodeData } = req.body;
    if (!qrData || !barcodeData) {
      return res.status(400).json({ error: 'qrData and barcodeData are required' });
    }
    updateCouponMedia(id, qrData, barcodeData, userId || null).then(() => {
      syncToFirebase(`coupon-media/${id}`, () => firebasePatch(`coupons/${id}`, {
        qr_data: qrData || null,
        barcode_data: barcodeData || null
      }));
      res.json({ success: true });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills', (req, res) => {
  try {
    const userId = requiredUserIdFromQuery(req, res);
    if (!userId) return;
    getBills(userId).then(bills => {
      res.json(bills);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/bills/:id', (req, res) => {
  try {
    const userId = requiredUserIdFromQuery(req, res);
    if (!userId) return;
    deleteBill(req.params.id, userId).then((changes) => {
      if (userId && !changes) {
        return res.status(404).json({ error: 'Bill not found for this user' });
      }
      syncToFirebase(`bill-delete/${req.params.id}`, () => firebaseDeleteNode(`bills/${req.params.id}`));
      res.json({ success: true, message: 'Bill deleted successfully' });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/bills', async (req, res) => {
  try {
    const userId = requiredUserIdFromQuery(req, res);
    if (!userId) return;
    await deleteAllBills(userId);
    syncToFirebase('bills-delete-all', () => firebaseDeleteNode('bills'));
    res.json({ success: true, message: 'All bills deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to delete all bills' });
  }
});

// ============ ACTIVITY LOG ROUTES ============

app.get('/api/logs', (req, res) => {
  try {
    getActivityLogs().then(logs => {
      res.json(logs);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ SETTINGS ROUTES ============

app.get('/api/settings', (req, res) => {
  try {
    getAllSettings().then(settings => {
      res.json(settings);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings/:key', (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    updateSetting(key, value).then(() => {
      syncToFirebase(`setting/${key}`, () => firebasePut(`settings/${toFirebaseKey(key)}`, { key, value }));
      res.json({ success: true, message: 'Setting updated' });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ANALYTICS ROUTES ============

app.get('/api/analytics', (req, res) => {
  try {
    const userId = requiredUserIdFromQuery(req, res);
    if (!userId) return;
    getAnalytics(userId).then(analytics => {
      res.json(analytics);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/inventory-status', (req, res) => {
  try {
    const userId = requiredUserIdFromQuery(req, res);
    if (!userId) return;
    getInventoryStatus(userId).then(items => {
      res.json(items);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ EXPORT ROUTES ============

app.get('/api/export/items', (req, res) => {
  try {
    const userId = requiredUserIdFromQuery(req, res);
    if (!userId) return;
    getItemsForExport(userId).then(items => {
      const csv = arrayToCSV(items);
      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', 'attachment; filename="items.csv"');
      res.send(csv);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/export/coupons', (req, res) => {
  try {
    const userId = requiredUserIdFromQuery(req, res);
    if (!userId) return;
    getCouponsForExport(userId).then(coupons => {
      const csv = arrayToCSV(coupons);
      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', 'attachment; filename="coupons.csv"');
      res.send(csv);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/export/bills', (req, res) => {
  try {
    const userId = requiredUserIdFromQuery(req, res);
    if (!userId) return;
    getBillsForExport(userId).then(bills => {
      const csv = arrayToCSV(bills);
      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', 'attachment; filename="bills.csv"');
      res.send(csv);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/firebase/sync-all', async (req, res) => {
  try {
    if (!firebaseEnabled()) {
      return res.status(400).json({ error: 'Firebase database URL is not configured' });
    }

    const [categories, coupons, items, bills, users, settings] = await Promise.all([
      getAllCategories(),
      getAllCoupons(),
      getAllItems(),
      getBills(),
      getAllUsers(),
      getAllSettings()
    ]);

    const categoriesMap = {};
    (categories || []).forEach((x) => { if (x?.id) categoriesMap[x.id] = x; });

    const couponsMap = {};
    (coupons || []).forEach((x) => { if (x?.id) couponsMap[x.id] = x; });

    const itemsMap = {};
    (items || []).forEach((x) => { if (x?.id) itemsMap[x.id] = x; });

    const billsMap = {};
    (bills || []).forEach((x) => { if (x?.id) billsMap[x.id] = x; });

    const usersMap = {};
    (users || []).forEach((x) => { if (x?.id) usersMap[x.id] = x; });

    await Promise.all([
      firebasePut('categories', categoriesMap),
      firebasePut('coupons', couponsMap),
      firebasePut('items', itemsMap),
      firebasePut('bills', billsMap),
      firebasePut('users', usersMap),
      firebasePut('settings', settings || {})
    ]);

    res.json({
      success: true,
      message: 'Synced SQLite data to Firebase',
      counts: {
        categories: categories.length,
        coupons: coupons.length,
        items: items.length,
        bills: bills.length,
        users: users.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ SERVE HTML ============

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
