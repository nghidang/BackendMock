const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const app = express();
const PORT = 3000;

// --- CORS: chỉ luồng auth mới cần credentialed (gửi/nhận cookie) ---
// Các origin được phép cho credentialed request (KHÔNG được dùng "*" khi có credentials).
// Đọc từ env CORS_ORIGINS (phân tách bằng dấu phẩy), fallback về localhost cho dev.
const AUTH_ORIGINS = (
  process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:3000"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
// Các path auth cần cookie HttpOnly -> CORS specific-origin + credentials
const AUTH_PATHS = [
  "/api/login",
  "/api/register",
  "/api/auth/refresh",
  "/api/auth/logout",
];

const credentialedCors = cors({ origin: AUTH_ORIGINS, credentials: true });
const publicCors = cors({ origin: "*" }); // request thường dùng Bearer header, không cần cookie

// Chọn cấu hình CORS theo path (chạy cho cả preflight OPTIONS lẫn request thật)
app.use((req, res, next) => {
  if (AUTH_PATHS.includes(req.path)) return credentialedCors(req, res, next);
  return publicCors(req, res, next);
});

app.use(express.json());
app.use(cookieParser());

// --- CẤU HÌNH COOKIE CHO REFRESH TOKEN ---
const REFRESH_COOKIE_NAME = "refreshToken";
const IS_PROD = process.env.NODE_ENV === "production";
// Prod: Secure + SameSite=None (cross-site, bắt buộc HTTPS).
// Dev (http://localhost): hạ cấp xuống secure:false + SameSite=Lax để browser chịu lưu cookie.
const refreshCookieOptions = {
  httpOnly: true, // JS phía client không đọc được -> chống XSS
  secure: IS_PROD, // chỉ bật Secure (yêu cầu HTTPS) ở production
  sameSite: IS_PROD ? "none" : "lax", // none cần Secure; dev dùng lax cho http localhost
  // Cookie chỉ gửi tới các route auth (refresh + logout), không lọt sang /api/products...
  // (least privilege) nhưng vẫn đủ rộng để logout đọc được mà thu hồi token.
  path: "/api/auth",
};

// --- STORE REFRESH TOKEN (in-memory; production thật nên dùng Redis/DB) ---
// Map: refreshToken -> userId. Chỉ token do server phát hành mới được chấp nhận.
const refreshTokenStore = new Map();

// Sinh refresh token ngẫu nhiên, khó đoán (thay cho timestamp dễ trùng/đoán)
const generateRefreshToken = () =>
  `refresh_${crypto.randomBytes(32).toString("hex")}`;

// Phát hành + lưu refresh token mới cho user, trả về token
const issueRefreshToken = (userId) => {
  const token = generateRefreshToken();
  refreshTokenStore.set(token, userId);
  return token;
};

// --- LOG MỌI REQUEST ĐẾN ---
app.use((req, res, next) => {
  const time = new Date().toISOString();
  console.log(`\n[${time}] ${req.method} ${req.originalUrl}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("  Body:", JSON.stringify(req.body));
  }

  // Log status code khi response trả về
  res.on("finish", () => {
    console.log(`  -> ${res.statusCode} ${res.statusMessage}`);
  });

  next();
});

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

  const [scheme, token] = authHeader.split(" "); // "Bearer <token>"
  if (scheme !== "Bearer" || !token)
    return res.status(401).json({ message: "Token không hợp lệ!" });

  // Token có dạng: access_token_<expireAt>
  const match = /^access_token_(\d+)$/.exec(token);
  if (!match)
    return res.status(401).json({ message: "Token không hợp lệ!" });

  const expireAt = Number(match[1]);
  if (Date.now() > expireAt)
    return res.status(401).json({ message: "Token đã hết hạn!" });

  next();
};

// --- API ROUTES ---

// 1. Login - Tạo token có kèm timestamp hết hạn
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const user = USERS.find(
    (u) => u.username === username && u.password === password,
  );

  if (user) {
    // console.log(`  ✅ Login thành công: username="${username}"`);
    const expireAt = Date.now() + TOKEN_EXPIRE_TIME;
    const accessToken = `access_token_${expireAt}`;
    const refreshToken = issueRefreshToken(user.id);

    // Tách password ra, chỉ lấy phần còn lại
    const { password: _, ...safeUser } = user;

    // Set refreshToken vào HttpOnly cookie (không trả về trong body nữa)
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);

    res.json({
      user: safeUser,
      token: accessToken,
      expireAt, // client biết khi nào hết hạn để chủ động refresh
    });
  } else {
    // Giúp debug: cho biết sai username hay sai password
    // const userByName = USERS.find((u) => u.username === username);
    // if (!userByName) {
    //   console.log(`  ❌ Login fail: username="${username}" không tồn tại`);
    // } else {
    //   console.log(
    //     `  ❌ Login fail: sai password cho username="${username}" (nhận được="${password}")`,
    //   );
    // }
    res.status(401).json({ message: "Tài khoản hoặc mật khẩu không đúng!" });
  }
});

// 2. Refresh Token - Xác thực token trong store, xoay vòng rồi cấp token mới
app.post("/api/auth/refresh", (req, res) => {
  const refreshToken = req.cookies[REFRESH_COOKIE_NAME];
  if (!refreshToken)
    return res.status(403).json({ message: "Không có refresh token!" });

  // Chỉ chấp nhận token do server phát hành (chống token giả mạo)
  const userId = refreshTokenStore.get(refreshToken);
  if (!userId) {
    // Token không hợp lệ -> dọn cookie rác phía client luôn
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions);
    return res.status(403).json({ message: "Refresh token không hợp lệ!" });
  }

  // Rotation: thu hồi token cũ, phát hành token mới (chống replay)
  refreshTokenStore.delete(refreshToken);
  const newRefreshToken = issueRefreshToken(userId);

  const expireAt = Date.now() + TOKEN_EXPIRE_TIME;
  res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, refreshCookieOptions);

  res.json({
    token: `access_token_${expireAt}`,
    expireAt, // client biết khi nào hết hạn để chủ động refresh
  });
});

// 2b. Logout - Thu hồi refresh token + xóa cookie (HttpOnly nên chỉ server xóa được)
app.post("/api/auth/logout", (req, res) => {
  const refreshToken = req.cookies[REFRESH_COOKIE_NAME];
  if (refreshToken) refreshTokenStore.delete(refreshToken); // thu hồi khỏi store
  // clearCookie phải khớp path/sameSite/secure như lúc set -> dùng lại refreshCookieOptions
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions);
  res.json({ message: "Đã đăng xuất" });
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
