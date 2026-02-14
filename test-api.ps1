# Test Script for Complete Feature Verification
# This tests all major endpoints to ensure they work

$baseUrl = "http://localhost:3001/api"

Write-Host "🧪 COMPREHENSIVE API TEST SUITE" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Add Coupon
Write-Host "TEST 1: Add Coupon" -ForegroundColor Yellow
$couponData = @{
    couponCode = "SAVE20"
    discountPercent = 20
    minPurchase = 100
    maxUses = 50
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/coupons" -Method POST -Body $couponData -ContentType "application/json"
    Write-Host "✅ PASS: Coupon added successfully" -ForegroundColor Green
    Write-Host "   Response: " ($response.Content | ConvertFrom-Json | ConvertTo-Json)
} catch {
    Write-Host "❌ FAIL: Could not add coupon" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Get All Coupons
Write-Host "TEST 2: Get All Coupons" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/coupons" -Method GET
    $coupons = $response.Content | ConvertFrom-Json
    Write-Host "✅ PASS: Retrieved coupons" -ForegroundColor Green
    Write-Host "   Total coupons: $($coupons.Count)" -ForegroundColor Green
    if ($coupons.Count -gt 0) {
        Write-Host "   First coupon: $($coupons[0].coupon_code)" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ FAIL: Could not get coupons" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 3: Validate Coupon
Write-Host "TEST 3: Validate Coupon" -ForegroundColor Yellow
$validateData = @{
    couponCode = "SAVE20"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/coupons/validate" -Method POST -Body $validateData -ContentType "application/json"
    $result = $response.Content | ConvertFrom-Json
    Write-Host "✅ PASS: Coupon validated" -ForegroundColor Green
    Write-Host "   Status: $($result.status)" -ForegroundColor Green
    Write-Host "   Discount: $($result.discountPercent)%" -ForegroundColor Green
} catch {
    Write-Host "❌ FAIL: Could not validate coupon" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: Add Item
Write-Host "TEST 4: Add Item (Notebook)" -ForegroundColor Yellow
$itemData = @{
    itemName = "Notebook"
    itemPrice = 20
    stockQuantity = 100
    description = "Quality notebook"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/items" -Method POST -Body $itemData -ContentType "application/json"
    $item = $response.Content | ConvertFrom-Json
    Write-Host "✅ PASS: Item added successfully" -ForegroundColor Green
    Write-Host "   Item: $($item.item_name) - ₹$($item.item_price)" -ForegroundColor Green
    Write-Host "   Item ID: $($item.id)" -ForegroundColor Green
    $global:item1Id = $item.id
} catch {
    Write-Host "❌ FAIL: Could not add item" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 5: Add Second Item
Write-Host "TEST 5: Add Item (Pen)" -ForegroundColor Yellow
$itemData2 = @{
    itemName = "Pen"
    itemPrice = 5
    stockQuantity = 200
    description = "Ballpoint pen"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/items" -Method POST -Body $itemData2 -ContentType "application/json"
    $item = $response.Content | ConvertFrom-Json
    Write-Host "✅ PASS: Item added successfully" -ForegroundColor Green
    Write-Host "   Item: $($item.item_name) - ₹$($item.item_price)" -ForegroundColor Green
    $global:item2Id = $item.id
} catch {
    Write-Host "❌ FAIL: Could not add second item" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 6: Get All Items
Write-Host "TEST 6: Get All Items" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/items" -Method GET
    $items = $response.Content | ConvertFrom-Json
    Write-Host "✅ PASS: Retrieved items" -ForegroundColor Green
    Write-Host "   Total items: $($items.Count)" -ForegroundColor Green
    $items | ForEach-Object {
        Write-Host "   - $($_.item_name): ₹$($_.item_price) (Stock: $($_.stock_quantity))" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ FAIL: Could not get items" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 7: Create Bill (Checkout)
Write-Host "TEST 7: Create Bill (Checkout)" -ForegroundColor Yellow
$billData = @{
    items = @(
        @{
            id = $global:item1Id
            name = "Notebook"
            price = 20
            quantity = 2
        },
        @{
            id = $global:item2Id
            name = "Pen"
            price = 5
            quantity = 5
        }
    )
    couponCode = "SAVE20"
    userId = "test-user-1"
    paymentMethod = "cash"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/bills" -Method POST -Body $billData -ContentType "application/json"
    $bill = $response.Content | ConvertFrom-Json
    Write-Host "✅ PASS: Bill created successfully" -ForegroundColor Green
    Write-Host "   Bill ID: $($bill.billId)" -ForegroundColor Green
    Write-Host "   Subtotal: ₹$($bill.totalPrice)" -ForegroundColor Green
    Write-Host "   Discount: ₹$($bill.discountAmount)" -ForegroundColor Green
    Write-Host "   Final Price: ₹$($bill.finalPrice)" -ForegroundColor Green
} catch {
    Write-Host "❌ FAIL: Could not create bill" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 8: Get Inventory Status
Write-Host "TEST 8: Get Inventory Status" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/inventory/status" -Method GET
    $status = $response.Content | ConvertFrom-Json
    Write-Host "✅ PASS: Inventory status retrieved" -ForegroundColor Green
    Write-Host "   Total items: $($status.totalItems)" -ForegroundColor Green
    Write-Host "   Total coupons: $($status.totalCoupons)" -ForegroundColor Green
    Write-Host "   Total bills: $($status.totalBills)" -ForegroundColor Green
} catch {
    Write-Host "❌ FAIL: Could not get inventory status" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "================================" -ForegroundColor Cyan
Write-Host "✅ TEST SUITE COMPLETE!" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
