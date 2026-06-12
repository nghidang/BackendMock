const express = require("express");
const cors = require("cors");
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// --- CẤU HÌNH THỜI GIAN HẾT HẠN ---
const TOKEN_EXPIRE_TIME = 60 * 1000; // 60 giây

// --- MOCK DATA ---
const USERS = [
  { id: "1", username: "admin", password: "123456" },
  { id: "2", username: "user", password: "123456" },
  { id: "3", username: "guest", password: "123456" },
];

// --- DỮ LIỆU GIẢ LẬP MỞ RỘNG (50 PRODUCTS) ---
const categories = [
  "Điện tử",
  "Gia dụng",
  "Thời trang",
  "Thực phẩm",
  "Phụ kiện",
];
const productNames = {
  "Điện tử": [
    "iPhone 15",
    "MacBook Air M2",
    "Samsung Galaxy S24",
    "iPad Pro",
    "Tai nghe Sony",
  ],
  "Gia dụng": [
    "Máy giặt LG",
    "Tủ lạnh Samsung",
    "Nồi cơm điện",
    "Lò vi sóng",
    "Máy hút bụi",
  ],
  "Thời trang": [
    "Áo sơ mi Oxford",
    "Quần Jean",
    "Áo khoác da",
    "Giày sneaker",
    "Túi xách",
  ],
  "Thực phẩm": [
    "Hộp hạt điều rang muối",
    "Cà phê hạt",
    "Trà ô long",
    "Mật ong rừng",
    "Bánh quy",
  ],
  "Phụ kiện": [
    "Ốp lưng iPhone 15",
    "Củ sạc nhanh",
    "Cáp USB-C",
    "Sạc dự phòng",
    "Giá đỡ điện thoại",
  ],
};

const PRODUCTS = [];

// Hàm tạo 50 sản phẩm ngẫu nhiên
for (let i = 1; i <= 100; i++) {
  const category = categories[i % categories.length];
  const namesInCategory = productNames[category];
  const baseName =
    namesInCategory[Math.floor(Math.random() * namesInCategory.length)];

  PRODUCTS.push({
    id: i,
    name: `${baseName} (Sê-ri ${i + 100})`,
    price: Math.floor(Math.random() * (20000000 - 100000) + 100000),
    category: category,
    status: Math.random() > 0.15, // 85% là còn hàng
  });
}

// console.log(PRODUCTS);

// --- MIDDLEWARE KIỂM TRA TOKEN ---
const authenticate = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader)
    return res.status(401).json({ message: "Không tìm thấy token!" });

  const token = authHeader.split(" ")[1]; // Bearer <token>

  console.log("Received Token:", token);

  try {
    // Token có dạng: access_token_TIMESTAMP
    const tokenParts = token.split("_");
    const expireAt = parseInt(tokenParts[2]);

    console.log("Token expireAt:", expireAt, "Current Time:", Date.now());

    if (Date.now() > expireAt) {
      return res.status(401).json({ message: "Token đã hết hạn!" });
    }
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token không hợp lệ!" });
  }
};

// --- API ROUTES ---

// 1. Login - Tạo token có kèm timestamp hết hạn
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const user = USERS.find(
    (u) => u.username === username && u.password === password,
  );

  if (user) {
    const expireAt = Date.now() + TOKEN_EXPIRE_TIME;
    const accessToken = `access_token_${expireAt}`;
    const refreshToken = `refresh_token_${Date.now()}`;

    // Tách password ra, chỉ lấy phần còn lại
    const { password: _, ...safeUser } = user;

    res.json({
      user: safeUser,
      token: accessToken,
      refreshToken,
      expireAt, // client biết khi nào hết hạn để chủ động refresh
    });
  } else {
    res.status(401).json({ message: "Tài khoản hoặc mật khẩu không đúng!" });
  }
});

// 2. Refresh Token - Cấp token mới với timestamp hết hạn mới
app.post("/api/refresh-token", (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken)
    return res.status(403).json({ message: "Không có refresh token!" });

  const expireAt = Date.now() + TOKEN_EXPIRE_TIME;

  res.json({
    token: `access_token_${expireAt}`,
    refreshToken: `refresh_token_${Date.now()}`,
    expireAt, // client biết khi nào hết hạn để chủ động refresh
  });
});

// --- CÁC API DƯỚI ĐÂY PHẢI CÓ TOKEN MỚI CALL ĐƯỢC ---

// 3. Get Products (Cần Token)
app.get("/api/products", authenticate, (req, res) => {
  const { name, category } = req.query;
  let result = [...PRODUCTS];
  if (name)
    result = result.filter((p) =>
      p.name.toLowerCase().includes(name.toLowerCase()),
    );
  if (category) result = result.filter((p) => p.category === category);
  res.json(result);
});

// 4. Create Product (Cần Token)
app.post("/api/products", authenticate, (req, res) => {
  const newProduct = { id: PRODUCTS.length + 1, ...req.body };
  PRODUCTS.push(newProduct);
  res.status(201).json(newProduct);
});

// 5. Dashboard (Cần Token - 10 Fields)
app.get("/api/dashboard", authenticate, (req, res) => {
  const totalProducts = PRODUCTS.length;
  const outOfStock = PRODUCTS.filter((p) => !p.status).length;
  const totalCategories = new Set(PRODUCTS.map((p) => p.category)).size;

  res.json({
    totalUsers: 45,
    totalProducts: totalProducts,
    totalCategories: totalCategories,
    outOfStock: outOfStock,
    inStock: totalProducts - outOfStock,
    monthlyRevenue: 1250000000,
    pendingOrders: 14,
    completedOrders: 156,
    canceledOrders: 3,
    systemUptime: "99.9%",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`⏰ Token sẽ hết hạn sau: ${TOKEN_EXPIRE_TIME / 1000} giây`);
});
