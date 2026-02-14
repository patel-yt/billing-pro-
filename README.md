# 💳 Discount Coupon Management System

A professional, full-featured web application for managing discount coupons and items with QR code scanning capability. Perfect for retail businesses, supermarkets, and e-commerce platforms.

## ✨ Features

### 🎟️ Coupon Management
- Add and manage discount coupons
- Validate coupons with unique codes
- Track coupon status (valid/invalid)
- View discount percentages
- Set custom discount amounts

### 📦 Item Management
- Add products/items to the database
- Assign prices to items
- Generate unique item codes
- View all items in inventory
- Delete items from database

### ✅ Coupon Validation
- **Scan QR Code** - Use device camera to scan coupon QR codes
- **Manual Entry** - Type coupon code manually
- Instant validation response (Valid/Invalid)
- Display discount details

### 🔍 Item Lookup
- **Scan QR Code** - Scan item QR codes to get details
- **Manual Entry** - Enter item code manually
- View complete item information and price
- Real-time database lookup

### 💰 Billing & Checkout
- **Scan Items** - Add items to bill using QR codes
- **Manual Selection** - Select items from dropdown
- Shopping cart with quantity management
- Apply coupons at checkout
- Calculate totals with automatic discounts
- Generate bills with unique IDs

### 📊 History & Reports
- View all bills created
- Track sales history
- See discount amounts per bill
- Date and time tracking

### 🎨 Professional UI
- Clean, modern interface
- Fully responsive design (Mobile, Tablet, Desktop)
- Professional color scheme
- Smooth animations
- Intuitive navigation

## 🛠️ Technology Stack

- **Backend:** Node.js + Express.js
- **Database:** SQLite3
- **Frontend:** HTML5, CSS3, JavaScript
- **QR Code:** jsQR (scanning) + QRCode.js (generation)
- **APIs:** RESTful API

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)
- Modern web browser with camera access (for QR scanning)

## ⚡ Installation & Setup

1. **Navigate to project folder:**
   ```bash
   cd c:\Users\ashus\OneDrive\Desktop\manage
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open in browser:**
   ```
   http://localhost:3000
   ```

The application will create a `database.db` file automatically on first run.

## 🚀 Usage Guide

### Adding a Coupon
1. Go to **Coupon Manager** tab
2. Enter coupon code (e.g., "SAVE20")
3. Enter discount percentage (e.g., "20")
4. Select status (Valid/Invalid)
5. Click "Add Coupon"

### Adding an Item
1. Go to **Item Manager** tab
2. Enter item name (e.g., "Notebook")
3. Enter price in ₹ (e.g., "20")
4. Item code auto-generates or enter custom code
5. Click "Add Item"

### Validating a Coupon
1. Go to **Check Coupon** tab
2. Either:
   - **Scan QR:** Click "Start Scanner" and scan coupon QR code
   - **Manual:** Enter coupon code and click "Check Validity"
3. View validation result (Valid/Invalid)

### Checking Item Details
1. Go to **Check Item** tab
2. Either:
   - **Scan QR:** Click "Start Scanner" and scan item QR code
   - **Manual:** Enter item code and click "Check Item"
3. View complete item information

### Creating Bills
1. Go to **Billing** tab
2. Add items using:
   - **Scan:** Start scanner and scan item QR codes
   - **Manual:** Select item from dropdown, enter quantity
3. View shopping cart in real-time
4. (Optional) Apply coupon code
5. Click "Checkout" to create bill
6. View new bill in **History** tab

## 📱 API Endpoints

### Coupons
- `POST /api/coupons` - Add new coupon
- `GET /api/coupons` - Get all coupons
- `POST /api/coupons/validate` - Validate coupon

### Items
- `POST /api/items` - Add new item
- `GET /api/items` - Get all items
- `GET /api/items/:id` - Get specific item
- `DELETE /api/items/:id` - Delete item

### Bills
- `POST /api/bills` - Create bill/checkout
- `GET /api/bills` - Get all bills

## 📂 Project Structure

```
manage/
├── public/
│   ├── index.html          # Main HTML file
│   ├── style.css           # Styling
│   └── app.js              # Frontend JavaScript
├── database.js             # Database functions
├── server.js               # Express server
├── package.json            # Dependencies
├── database.db             # SQLite database (auto-created)
└── README.md               # This file
```

## 🎯 Example Workflow

```
1. Admin adds coupons:
   - SAVE20 (20% discount)
   - SAVE30 (30% discount)

2. Admin adds items:
   - Notebook: ₹20
   - Pen: ₹5
   - Book: ₹50

3. Customer/Sales person:
   - Scans/enters item QR codes
   - Adds items to cart
   - Enters coupon code (SAVE20)
   - Total: ₹75 → ₹60 (with 20% discount)
   - Checkout

4. Bill is created and stored
```

## 🔧 Troubleshooting

### Camera/QR Scanner not working?
- Ensure browser has camera permission
- Try using HTTPS (some browsers require it)
- Try a different browser
- Check if camera is already in use

### Database not found?
- Delete `database.db` file
- Restart the server
- Database will recreate automatically

### Port 3000 already in use?
- Change PORT in server.js
- Or kill the process using port 3000

### Items not showing in dropdown?
- Ensure items are added first in Item Manager
- Refresh the Billing page

## 🔐 Security Notes

- This is a local application (runs on localhost)
- No authentication implemented (add if needed for production)
- Database is SQLite (fine for small to medium usage)
- Consider using a proper database for large-scale deployment

## 🎨 Customization

- **Colors:** Edit CSS variables in `public/style.css` (`:root` section)
- **Logo/Title:** Edit header in `public/index.html`
- **Company Name:** Update in HTML header
- **Currency:** Change ₹ symbol to your currency in HTML/JS

## 📈 Future Enhancements

- User authentication & roles
- Payment gateway integration
- Email/SMS notifications
- Analytics & reports
- Barcode scanning (in addition to QR)
- Multi-language support
- Inventory management
- Customer loyalty program

## 💡 Tips

- **Generate QR Codes:** Use online QR code generators (qr-server.com)
- **Best Form:** Use unique item codes in QR codes (e.g., ITEM-123)
- **Security:** For production, add user authentication
- **Backup:** Regularly backup your `database.db` file

## 📞 Support

For issues or questions, check the following:
1. Ensure Node.js is installed: `node --version`
2. Ensure dependencies are installed: `npm install`
3. Check console for error messages
4. Ensure port 3000 is not in use
5. Try restarting the server

## 📄 License

Created for Professional Business Use

---

**Enjoy your Discount Coupon Management System!** 🎉
