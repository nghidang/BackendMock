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

| Method | Endpoint              | Auth | Mô tả                                      |
|--------|-----------------------|------|--------------------------------------------|
| POST   | `/api/login`          | ❌   | Đăng nhập, trả về `token` + `refreshToken` |
| POST   | `/api/refresh-token`  | ❌   | Cấp access token mới                       |
| GET    | `/api/products`       | ✅   | Danh sách sản phẩm (lọc `name`, `category`)|
| POST   | `/api/products`       | ✅   | Tạo sản phẩm mới                           |
| GET    | `/api/dashboard`      | ✅   | Thống kê dashboard (10 fields)             |

Các API có `✅` yêu cầu header:

```
Authorization: Bearer <access_token>
```

## Ví dụ

```bash
# Login
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'

# Gọi API cần token
curl http://localhost:3000/api/products \
  -H "Authorization: Bearer access_token_<timestamp>"
```
