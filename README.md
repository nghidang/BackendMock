# BackendMock

Mock backend API server xây dựng bằng **Node.js + Express**, mô phỏng luồng xác thực
bằng token có thời gian hết hạn (60 giây) để test cơ chế **refresh token** ở phía client.

## Cài đặt

```bash
npm install
```

## Chạy server

```bash
npm start
# hoặc dev mode (cần nodemon)
npm run dev
```

Server chạy tại: `http://localhost:3000`

> ⏰ Access token tự động hết hạn sau **60 giây**.

## Tài khoản mẫu

| username | password |
|----------|----------|
| admin    | 123456   |
| user     | 123456   |
| guest    | 123456   |

## API Endpoints

| Method | Endpoint            | Auth   | Mô tả                                                        |
|--------|---------------------|--------|--------------------------------------------------------------|
| POST   | `/api/login`        | Public | Đăng nhập, trả về `token`; refresh token vào HttpOnly cookie |
| POST   | `/api/auth/refresh` | Cookie | Đọc refresh token từ cookie, cấp access token mới (rotate)   |
| POST   | `/api/auth/logout`  | Cookie | Thu hồi refresh token + xóa cookie                           |
| GET    | `/api/products`     | Bearer | Danh sách sản phẩm (lọc `name`, `category`)                  |
| POST   | `/api/products`     | Bearer | Tạo sản phẩm mới                                             |
| GET    | `/api/dashboard`    | Bearer | Thống kê dashboard (10 fields)                               |

- **Bearer**: yêu cầu header `Authorization: Bearer <access_token>`.
- **Cookie**: dựa vào **HttpOnly cookie** `refreshToken` (path `/api/auth`) — client gọi với
  `withCredentials: true` (axios) hoặc `credentials: "include"` (fetch). Refresh token
  **không** còn nằm trong response body.

> Cookie tự điều chỉnh theo môi trường: production (`NODE_ENV=production`) dùng
> `Secure; SameSite=None`; dev dùng `SameSite=Lax` (chạy được trên `http://localhost`).
> Origin cho credentialed request đọc từ env `CORS_ORIGINS` (phẩy phân tách),
> mặc định `http://localhost:5173,http://localhost:3000`.

## Ví dụ

```bash
# Login - lưu cookie (refresh token) vào cookies.txt
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}' \
  -c cookies.txt

# Refresh - gửi cookie lên, KHÔNG cần body
curl -X POST http://localhost:3000/api/auth/refresh \
  -b cookies.txt -c cookies.txt

# Logout - thu hồi refresh token + xóa cookie
curl -X POST http://localhost:3000/api/auth/logout \
  -b cookies.txt

# Gọi API cần token
curl http://localhost:3000/api/products \
  -H "Authorization: Bearer access_token_<timestamp>"
```
