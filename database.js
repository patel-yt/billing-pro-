const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'database.db');
let db;

// Initialize Database
function initializeDatabase() {
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ Database connection error:', err);
    } else {
      console.log('✅ Database connected successfully');
    }
  });

  // Create tables
  db.serialize(() => {
    // Users Table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        role TEXT DEFAULT 'user',
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // User Profiles Table (for Firebase/Google users as well)
    db.run(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT,
        phone TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        pincode TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Categories Table
    db.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);
    db.run(`ALTER TABLE categories ADD COLUMN user_id TEXT`, () => {});

    // Coupons Table
    db.run(`
      CREATE TABLE IF NOT EXISTS coupons (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        coupon_code TEXT UNIQUE NOT NULL,
        discount_percent REAL NOT NULL,
        status TEXT DEFAULT 'valid',
        min_purchase REAL DEFAULT 0,
        max_uses INTEGER DEFAULT -1,
        used_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        qr_data TEXT,
        barcode_data TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);
    // Add new columns for existing databases (ignore errors if already added)
    db.run(`ALTER TABLE coupons ADD COLUMN user_id TEXT`, () => {});
    db.run(`ALTER TABLE coupons ADD COLUMN qr_data TEXT`, () => {});
    db.run(`ALTER TABLE coupons ADD COLUMN barcode_data TEXT`, () => {});
    db.run(`UPDATE coupons SET used_count = 0 WHERE used_count IS NULL`, () => {});

    // Items Table
    db.run(`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        item_name TEXT NOT NULL,
        item_price REAL NOT NULL,
        item_code TEXT UNIQUE,
        category_id TEXT,
        stock_quantity INTEGER DEFAULT 100,
        low_stock_alert INTEGER DEFAULT 10,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        qr_data TEXT,
        barcode_data TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(category_id) REFERENCES categories(id)
      )
    `);
    db.run(`ALTER TABLE items ADD COLUMN user_id TEXT`, () => {});
    db.run(`ALTER TABLE items ADD COLUMN qr_data TEXT`, () => {});
    db.run(`ALTER TABLE items ADD COLUMN barcode_data TEXT`, () => {});

    // Bills Table
    db.run(`
      CREATE TABLE IF NOT EXISTS bills (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        customer_name TEXT,
        customer_mobile TEXT,
        bike_number TEXT,
        bill_date DATETIME,
        attachment_name TEXT,
        attachment_type TEXT,
        attachment_data TEXT,
        items_json TEXT NOT NULL,
        coupon_code TEXT,
        total_price REAL NOT NULL,
        discount_amount REAL DEFAULT 0,
        final_price REAL NOT NULL,
        payment_method TEXT DEFAULT 'cash',
        status TEXT DEFAULT 'completed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);
    db.run(`ALTER TABLE bills ADD COLUMN customer_name TEXT`, () => {});
    db.run(`ALTER TABLE bills ADD COLUMN customer_mobile TEXT`, () => {});
    db.run(`ALTER TABLE bills ADD COLUMN bike_number TEXT`, () => {});
    db.run(`ALTER TABLE bills ADD COLUMN bill_date DATETIME`, () => {});
    db.run(`ALTER TABLE bills ADD COLUMN attachment_name TEXT`, () => {});
    db.run(`ALTER TABLE bills ADD COLUMN attachment_type TEXT`, () => {});
    db.run(`ALTER TABLE bills ADD COLUMN attachment_data TEXT`, () => {});

    // Activity Log Table
    db.run(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    // Settings Table
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create default admin user
    db.run(
      `INSERT OR IGNORE INTO users (id, username, password, email, role) VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), 'admin', hashPassword('admin123'), 'admin@couponmanager.com', 'admin']
    );

    // Create default category
    db.run(
      `INSERT OR IGNORE INTO categories (id, name, description) VALUES (?, ?, ?)`,
      [uuidv4(), 'General', 'General products']
    );

    // Create default settings
    const defaultSettings = [
      { key: 'app_name', value: 'Bill management' },
      { key: 'currency', value: 'Rs' },
      { key: 'tax_percent', value: '0' },
      { key: 'company_name', value: 'Bill management' }
    ];

    defaultSettings.forEach(setting => {
      db.run(
        `INSERT OR IGNORE INTO settings (id, key, value) VALUES (?, ?, ?)`,
        [uuidv4(), setting.key, setting.value]
      );
    });
    // Migrate old defaults to new branding without overriding custom user settings.
    db.run(`UPDATE settings SET value = 'Bill management' WHERE key = 'app_name' AND value = 'Discount Coupon Manager'`);
    db.run(`UPDATE settings SET value = 'Bill management' WHERE key = 'company_name' AND value = 'Your Company'`);
  });
}

// Password hashing
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// ============ COUPON FUNCTIONS ============

function addCoupon(couponCode, discountPercent, status, minPurchase = 0, maxUses = -1, expiresAt = null, qrData = null, barcodeData = null, userId = null) {
  return new Promise((resolve, reject) => {
    const id = uuidv4();
    db.run(
      `INSERT INTO coupons (id, user_id, coupon_code, discount_percent, status, min_purchase, max_uses, expires_at, qr_data, barcode_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, couponCode, discountPercent, status, minPurchase, maxUses, expiresAt, qrData, barcodeData],
      function(err) {
        if (err) reject(err);
        else resolve(id);
      }
    );
  });
}

function cleanupInvalidCoupons(userId = null) {
  return new Promise((resolve, reject) => {
    const sql = userId
      ? `DELETE FROM coupons
         WHERE user_id = ?
           AND ((expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now'))
             OR (max_uses > 0 AND COALESCE(used_count, 0) >= max_uses))`
      : `DELETE FROM coupons
         WHERE (expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now'))
            OR (max_uses > 0 AND COALESCE(used_count, 0) >= max_uses)`;
    const params = userId ? [userId] : [];
    db.run(
      sql,
      params,
      function(err) {
        if (err) reject(err);
        else resolve(this.changes || 0);
      }
    );
  });
}

function validateCoupon(couponCode, userId = null) {
  return new Promise((resolve, reject) => {
    const sql = userId
      ? `SELECT * FROM coupons WHERE coupon_code = ? AND user_id = ?`
      : `SELECT * FROM coupons WHERE coupon_code = ?`;
    const params = userId ? [couponCode, userId] : [couponCode];
    db.get(
      sql,
      params,
      (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve({
            found: false,
            status: 'invalid',
            message: 'Coupon not found',
            couponCode: couponCode
          });
        } else {
          // Calculate actual status based on expiry and uses
          const now = new Date();
          const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
          const usedCount = row.used_count || 0;
          let status = 'valid';
          let message = '';
          
          if (expiresAt && expiresAt < now) {
            status = 'expired';
            message = 'Coupon has expired';
            db.run(`DELETE FROM coupons WHERE id = ?`, [row.id], () => {});
          } else if (row.max_uses > 0 && usedCount >= row.max_uses) {
            status = 'maxed_out';
            message = 'Coupon has reached maximum uses';
            db.run(`DELETE FROM coupons WHERE id = ?`, [row.id], () => {});
          }
          
          resolve({
            found: true,
            id: row.id,
            couponCode: row.coupon_code,
            discountPercent: row.discount_percent,
            minPurchase: row.min_purchase,
            maxUses: row.max_uses,
            usedCount: usedCount,
            status: status,
            message: message,
            expiresAt: row.expires_at,
            createdAt: row.created_at
          });
        }
      }
    );
  });
}

function getAllCoupons(userId = null) {
  return new Promise((resolve, reject) => {
    cleanupInvalidCoupons(userId)
      .then(() => {
        const sql = userId
          ? `SELECT * FROM coupons WHERE user_id = ? ORDER BY created_at DESC`
          : `SELECT * FROM coupons ORDER BY created_at DESC`;
        const params = userId ? [userId] : [];
        db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else {
            const now = new Date();
            const normalized = (rows || []).map((row) => {
              const usedCount = row.used_count || 0;
              const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
              let status = row.status || 'valid';
              if (expiresAt && expiresAt < now) {
                status = 'expired';
              } else if (row.max_uses > 0 && usedCount >= row.max_uses) {
                status = 'maxed_out';
              }
              return { ...row, used_count: usedCount, status };
            });
            resolve(normalized);
          }
        });
      })
      .catch(reject);
  });
}

function deleteCoupon(couponId, userId = null) {
  return new Promise((resolve, reject) => {
    const sql = userId
      ? `DELETE FROM coupons WHERE id = ? AND user_id = ?`
      : `DELETE FROM coupons WHERE id = ?`;
    const params = userId ? [couponId, userId] : [couponId];
    db.run(
      sql,
      params,
      function(err) {
        if (err) reject(err);
        else resolve(this.changes || 0);
      }
    );
  });
}

function deleteAllCoupons(userId = null) {
  return new Promise((resolve, reject) => {
    const sql = userId ? `DELETE FROM coupons WHERE user_id = ?` : `DELETE FROM coupons`;
    const params = userId ? [userId] : [];
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this.changes || 0);
    });
  });
}

function incrementCouponUsage(couponCode) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE coupons SET used_count = COALESCE(used_count, 0) + 1 WHERE coupon_code = ?`,
      [couponCode],
      function(err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function consumeCoupon(couponCode, userId = null) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const updateSql = userId
        ? `UPDATE coupons
           SET used_count = COALESCE(used_count, 0) + 1
           WHERE coupon_code = ?
             AND user_id = ?
             AND (max_uses <= 0 OR COALESCE(used_count, 0) < max_uses)`
        : `UPDATE coupons
           SET used_count = COALESCE(used_count, 0) + 1
           WHERE coupon_code = ?
             AND (max_uses <= 0 OR COALESCE(used_count, 0) < max_uses)`;
      const updateParams = userId ? [couponCode, userId] : [couponCode];
      db.run(
        updateSql,
        updateParams,
        function(err) {
          if (err) return reject(err);
          if (this.changes === 0) return resolve({ applied: false });

          const selectSql = userId
            ? `SELECT id, used_count, max_uses FROM coupons WHERE coupon_code = ? AND user_id = ?`
            : `SELECT id, used_count, max_uses FROM coupons WHERE coupon_code = ?`;
          const selectParams = userId ? [couponCode, userId] : [couponCode];
          db.get(
            selectSql,
            selectParams,
            (err2, row) => {
              if (err2) return reject(err2);
              if (!row) return resolve({ applied: false });

              if (row.max_uses > 0 && row.used_count >= row.max_uses) {
                db.run(
                  `DELETE FROM coupons WHERE id = ?`,
                  [row.id],
                  (err3) => {
                    if (err3) return reject(err3);
                    resolve({ applied: true, usedCount: row.used_count, maxUses: row.max_uses, deleted: true });
                  }
                );
              } else {
                resolve({ applied: true, usedCount: row.used_count, maxUses: row.max_uses, deleted: false });
              }
            }
          );
        }
      );
    });
  });
}

function updateCouponMedia(couponId, qrData, barcodeData, userId = null) {
  return new Promise((resolve, reject) => {
    const sql = userId
      ? `UPDATE coupons SET qr_data = ?, barcode_data = ? WHERE id = ? AND user_id = ?`
      : `UPDATE coupons SET qr_data = ?, barcode_data = ? WHERE id = ?`;
    const params = userId ? [qrData, barcodeData, couponId, userId] : [qrData, barcodeData, couponId];
    db.run(
      sql,
      params,
      function(err) {
        if (err) reject(err);
        else resolve(this.changes || 0);
      }
    );
  });
}

// ============ ITEM FUNCTIONS ============

function addItem(itemName, itemPrice, itemCode, categoryId = null, stockQuantity = 100, description = '', qrData = null, barcodeData = null, userId = null) {
  return new Promise((resolve, reject) => {
    const id = uuidv4();
    db.run(
      `INSERT INTO items (id, user_id, item_name, item_price, item_code, category_id, stock_quantity, description, qr_data, barcode_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, itemName, itemPrice, itemCode, categoryId, stockQuantity, description, qrData, barcodeData],
      function(err) {
        if (err) reject(err);
        else resolve(id);
      }
    );
  });
}

function getItem(itemCode, userId = null) {
  return new Promise((resolve, reject) => {
    const sql = userId
      ? `SELECT * FROM items WHERE (id = ? OR item_code = ?) AND user_id = ?`
      : `SELECT * FROM items WHERE id = ? OR item_code = ?`;
    const params = userId ? [itemCode, itemCode, userId] : [itemCode, itemCode];
    db.get(
      sql,
      params,
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}

function getAllItems(userId = null) {
  return new Promise((resolve, reject) => {
    const sql = userId
      ? `SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC`
      : `SELECT * FROM items ORDER BY created_at DESC`;
    const params = userId ? [userId] : [];
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function deleteItem(itemId, userId = null) {
  return new Promise((resolve, reject) => {
    const sql = userId
      ? `DELETE FROM items WHERE id = ? AND user_id = ?`
      : `DELETE FROM items WHERE id = ?`;
    const params = userId ? [itemId, userId] : [itemId];
    db.run(
      sql,
      params,
      function(err) {
        if (err) reject(err);
        else resolve(this.changes || 0);
      }
    );
  });
}

function updateItemMedia(itemId, qrData, barcodeData, userId = null) {
  return new Promise((resolve, reject) => {
    const sql = userId
      ? `UPDATE items SET qr_data = ?, barcode_data = ? WHERE id = ? AND user_id = ?`
      : `UPDATE items SET qr_data = ?, barcode_data = ? WHERE id = ?`;
    const params = userId ? [qrData, barcodeData, itemId, userId] : [qrData, barcodeData, itemId];
    db.run(
      sql,
      params,
      function(err) {
        if (err) reject(err);
        else resolve(this.changes || 0);
      }
    );
  });
}

// ============ BILL FUNCTIONS ============

function addBill(itemsJson, couponCode, totalPrice, discountAmount, finalPrice, userId = null, paymentMethod = 'cash', customerName = null, customerMobile = null, bikeNumber = null, billDate = null, attachmentName = null, attachmentType = null, attachmentData = null) {
  return new Promise((resolve, reject) => {
    const id = uuidv4();
    db.run(
      `INSERT INTO bills (id, user_id, customer_name, customer_mobile, bike_number, bill_date, attachment_name, attachment_type, attachment_data, items_json, coupon_code, total_price, discount_amount, final_price, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, customerName, customerMobile, bikeNumber, billDate, attachmentName, attachmentType, attachmentData, itemsJson, couponCode, totalPrice, discountAmount, finalPrice, paymentMethod],
      function(err) {
        if (err) reject(err);
        else resolve(id);
      }
    );
  });
}

function deleteBill(billId, userId = null) {
  return new Promise((resolve, reject) => {
    if (userId) {
      db.run(
        `DELETE FROM bills WHERE id = ? AND user_id = ?`,
        [billId, userId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes || 0);
        }
      );
      return;
    }
    db.run(
      `DELETE FROM bills WHERE id = ?`,
      [billId],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes || 0);
      }
    );
  });
}

function deleteAllBills(userId = null) {
  return new Promise((resolve, reject) => {
    if (userId) {
      db.run(`DELETE FROM bills WHERE user_id = ?`, [userId], function(err) {
        if (err) reject(err);
        else resolve(this.changes || 0);
      });
      return;
    }
    db.run(`DELETE FROM bills`, function(err) {
      if (err) reject(err);
      else resolve(this.changes || 0);
    });
  });
}

function getBills(userId = null) {
  return new Promise((resolve, reject) => {
    if (userId) {
      db.all(
        `SELECT * FROM bills
         WHERE user_id = ?
         ORDER BY COALESCE(bill_date, created_at) DESC`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
      return;
    }
    db.all(`SELECT * FROM bills ORDER BY COALESCE(bill_date, created_at) DESC`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// ============ USER FUNCTIONS ============

function loginUser(username, password) {
  return new Promise((resolve, reject) => {
    const hashedPassword = hashPassword(password);
    db.get(
      `SELECT * FROM users WHERE username = ? AND password = ? AND is_active = 1`,
      [username, hashedPassword],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}

function registerUser(username, email, password, role = 'user') {
  return new Promise((resolve, reject) => {
    const id = uuidv4();
    const hashedPassword = hashPassword(password);
    db.run(
      `INSERT INTO users (id, username, email, password, role) VALUES (?, ?, ?, ?, ?)`,
      [id, username, email, hashedPassword, role],
      function(err) {
        if (err) reject(err);
        else resolve(id);
      }
    );
  });
}

function getAllUsers() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, username, email, role, is_active, created_at FROM users ORDER BY created_at DESC`,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

function ensureUserProfilesTable() {
  return new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS user_profiles (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT,
        phone TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        pincode TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function getUserProfileByEmail(email) {
  return new Promise((resolve, reject) => {
    ensureUserProfilesTable()
      .then(() => {
        db.get(
          `SELECT email, full_name, phone, address, city, state, pincode, created_at, updated_at
           FROM user_profiles
           WHERE email = ?`,
          [email],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      })
      .catch(reject);
  });
}

function upsertUserProfile(email, profile) {
  return new Promise((resolve, reject) => {
    const newId = uuidv4();
    const fullName = profile?.fullName || null;
    const phone = profile?.phone || null;
    const address = profile?.address || null;
    const city = profile?.city || null;
    const state = profile?.state || null;
    const pincode = profile?.pincode || null;

    ensureUserProfilesTable()
      .then(() => {
        db.run(
          `UPDATE user_profiles
           SET full_name = ?, phone = ?, address = ?, city = ?, state = ?, pincode = ?, updated_at = CURRENT_TIMESTAMP
           WHERE email = ?`,
          [fullName, phone, address, city, state, pincode, email],
          function(updateErr) {
            if (updateErr) return reject(updateErr);
            if (this.changes > 0) return resolve();

            db.run(
              `INSERT INTO user_profiles (id, email, full_name, phone, address, city, state, pincode, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
              [newId, email, fullName, phone, address, city, state, pincode],
              function(insertErr) {
                if (insertErr) reject(insertErr);
                else resolve();
              }
            );
          }
        );
      })
      .catch(reject);
  });
}

// ============ CATEGORY FUNCTIONS ============

function addCategory(name, description, userId = null) {
  return new Promise((resolve, reject) => {
    const id = uuidv4();
    db.run(
      `INSERT INTO categories (id, user_id, name, description) VALUES (?, ?, ?, ?)`,
      [id, userId, name, description],
      function(err) {
        if (err) reject(err);
        else resolve(id);
      }
    );
  });
}

function getAllCategories(userId = null) {
  return new Promise((resolve, reject) => {
    const sql = userId
      ? `SELECT * FROM categories WHERE user_id = ? ORDER BY name`
      : `SELECT * FROM categories ORDER BY name`;
    const params = userId ? [userId] : [];
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// ============ ACTIVITY LOG FUNCTIONS ============

function logActivity(userId, action, entityType, entityId, details) {
  return new Promise((resolve, reject) => {
    const id = uuidv4();
    db.run(
      `INSERT INTO activity_logs (id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, userId, action, entityType, entityId, details],
      function(err) {
        if (err) reject(err);
        else resolve(id);
      }
    );
  });
}

function getActivityLogs(limit = 100) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

// ============ SETTINGS FUNCTIONS ============

function getSetting(key) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT value FROM settings WHERE key = ?`,
      [key],
      (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.value : null);
      }
    );
  });
}

function updateSetting(key, value) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO settings (id, key, value) VALUES (coalesce((SELECT id FROM settings WHERE key = ?), ?), ?, ?)`,
      [key, uuidv4(), key, value],
      function(err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function getAllSettings() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT key, value FROM settings`, (err, rows) => {
      if (err) reject(err);
      else {
        const settings = {};
        rows?.forEach(row => {
          settings[row.key] = row.value;
        });
        resolve(settings);
      }
    });
  });
}

// ============ ANALYTICS FUNCTIONS ============

function getAnalytics(userId = null) {
  return new Promise((resolve, reject) => {
    if (userId) {
      db.all(
        `SELECT
          DATE(created_at) as date,
          COUNT(*) as total_bills,
          SUM(final_price) as total_revenue
         FROM bills
         WHERE user_id = ?
         GROUP BY DATE(created_at)
         ORDER BY date DESC
         LIMIT 30`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
      return;
    }
    db.all(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_bills,
        SUM(final_price) as total_revenue
       FROM bills 
       GROUP BY DATE(created_at) 
       ORDER BY date DESC 
       LIMIT 30`,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

function getInventoryStatus(userId = null) {
  return new Promise((resolve, reject) => {
    const sql = userId
      ? `SELECT * FROM items WHERE user_id = ? AND stock_quantity <= low_stock_alert ORDER BY stock_quantity ASC`
      : `SELECT * FROM items WHERE stock_quantity <= low_stock_alert ORDER BY stock_quantity ASC`;
    const params = userId ? [userId] : [];
    db.all(
      sql,
      params,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

// ============ EXPORT FUNCTIONS ============

function getItemsForExport(userId = null) {
  return new Promise((resolve, reject) => {
    const sql = userId
      ? `SELECT i.item_name, i.item_price, i.item_code, c.name as category, i.stock_quantity, i.created_at
         FROM items i
         LEFT JOIN categories c ON i.category_id = c.id
         WHERE i.user_id = ?
         ORDER BY i.created_at DESC`
      : `SELECT i.item_name, i.item_price, i.item_code, c.name as category, i.stock_quantity, i.created_at
         FROM items i
         LEFT JOIN categories c ON i.category_id = c.id
         ORDER BY i.created_at DESC`;
    const params = userId ? [userId] : [];
    db.all(
      sql,
      params,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

function getCouponsForExport(userId = null) {
  return new Promise((resolve, reject) => {
    const sql = userId
      ? `SELECT coupon_code, discount_percent, status, min_purchase, max_uses, used_count, created_at, expires_at
         FROM coupons
         WHERE user_id = ?
         ORDER BY created_at DESC`
      : `SELECT coupon_code, discount_percent, status, min_purchase, max_uses, used_count, created_at, expires_at
         FROM coupons
         ORDER BY created_at DESC`;
    const params = userId ? [userId] : [];
    db.all(
      sql,
      params,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

function getBillsForExport(userId = null) {
  return new Promise((resolve, reject) => {
    const sql = userId
      ? `SELECT id, customer_name, customer_mobile, bike_number, bill_date, attachment_name, attachment_type, total_price, discount_amount, final_price, coupon_code, payment_method, created_at
         FROM bills
         WHERE user_id = ?
         ORDER BY created_at DESC`
      : `SELECT id, customer_name, customer_mobile, bike_number, bill_date, attachment_name, attachment_type, total_price, discount_amount, final_price, coupon_code, payment_method, created_at
         FROM bills
         ORDER BY created_at DESC`;
    const params = userId ? [userId] : [];
    db.all(
      sql,
      params,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

module.exports = {
  initializeDatabase,
  hashPassword,
  loginUser,
  registerUser,
  getAllUsers,
  getUserProfileByEmail,
  upsertUserProfile,
  addCategory,
  getAllCategories,
  addCoupon,
  validateCoupon,
  getAllCoupons,
  deleteCoupon,
  deleteAllCoupons,
  incrementCouponUsage,
  consumeCoupon,
  updateCouponMedia,
  addItem,
  getItem,
  getAllItems,
  deleteItem,
  updateItemMedia,
  addBill,
  deleteBill,
  deleteAllBills,
  getBills,
  cleanupInvalidCoupons,
  logActivity,
  getActivityLogs,
  getSetting,
  updateSetting,
  getAllSettings,
  getAnalytics,
  getInventoryStatus,
  getItemsForExport,
  getCouponsForExport,
  getBillsForExport
};
