# BÁO CÁO DỰ ÁN: YU-GI-OH! DISCORD BOT

## 📋 Tổng Quan Dự Án

**Tên dự án:** Discord Bot with MongoDB API  
**Phiên bản:** 1.0.0  
**Giấy phép:** ISC  
**Ngôn ngữ lập trình:** JavaScript (Node.js)  

### Mô tả
Đây là một Discord bot chuyên dụng để tra cứu thông tin về thẻ bài Yu-Gi-Oh!, bao gồm khả năng tìm kiếm thẻ bài, archetype (hệ thẻ), và thông tin Pokemon. Bot tích hợp với MongoDB để lưu trữ dữ liệu thẻ bài và sử dụng LangFlow API cho các truy vấn AI-powered.

---

## 🏗️ Kiến Trúc Hệ Thống

### Cấu Trúc Thư Mục

```
YUGIOH_DiscordBot/
├── index.js                 # Entry point của Discord bot
├── start.js                 # Script khởi động đồng thời (bot + API)
├── server.js                # Express API server
├── package.json             # Dependencies và scripts
├── .env.example             # Mẫu cấu hình môi trường
├── README.md                # Hướng dẫn sử dụng
├── src/
│   ├── api.js               # LangFlow API client
│   ├── autocomplete.js      # Logic gợi ý tên thẻ
│   ├── cardUtils.js         # Xử lý dữ liệu thẻ
│   ├── discordClient.js     # Thiết lập Discord client
│   ├── mongo.js             # Kết nối MongoDB
│   ├── multiCardUtils.js    # Hiển thị nhiều thẻ
│   ├── pokemonUtils.js      # Xử lý thông tin Pokemon
│   └── requestQueue.js      # Quản lý hàng đợi request
└── data/
    ├── Card_archetype_unique.csv   # Danh sách archetype
    └── Card_name_unique.csv        # Danh sách tên thẻ
```

### Sơ Đồ Kiến Trúc

```
┌─────────────────────────────────────────────────────────────────┐
│                        DISCORD BOT                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────┐    ┌───────────────┐    ┌────────────────┐  │
│  │ discordClient │    │   cardUtils   │    │ pokemonUtils   │  │
│  │  (Commands)   │    │  (Processing) │    │  (Processing)  │  │
│  └───────┬───────┘    └───────┬───────┘    └────────┬───────┘  │
│          │                    │                      │          │
│          └────────────────────┼──────────────────────┘          │
│                               │                                  │
│                    ┌──────────▼──────────┐                      │
│                    │    requestQueue     │                      │
│                    │  (Rate Limiting)    │                      │
│                    └──────────┬──────────┘                      │
└───────────────────────────────┼─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐    ┌───────────────────┐    ┌───────────────┐
│   LangFlow    │    │   MongoDB API     │    │   MongoDB     │
│     API       │    │    (Express)      │    │    Atlas      │
│  (AI Query)   │    │   server.js       │    │  (Database)   │
└───────────────┘    └───────────────────┘    └───────────────┘
```

---

## ⚙️ Công Nghệ Sử Dụng

### Dependencies Chính

| Package | Phiên Bản | Mục Đích |
|---------|-----------|----------|
| discord.js | ^14.23.2 | Discord API wrapper |
| express | ^4.18.2 | HTTP server framework |
| mongodb | ^5.7.0 | MongoDB driver |
| axios | ^1.13.1 | HTTP client |
| fuse.js | ^7.1.0 | Fuzzy search library |
| csv-parse | ^6.1.0 | CSV parsing |
| dotenv | ^17.2.3 | Environment variables |
| cors | ^2.8.5 | CORS middleware |
| node-fetch | ^2.6.9 | Fetch API cho Node.js |

### Dev Dependencies

| Package | Phiên Bản | Mục Đích |
|---------|-----------|----------|
| nodemon | ^3.1.10 | Hot reload development |

---

## 🎮 Chức Năng Bot Discord

### Các Slash Commands

#### 1. `/card <query>`
- **Mô tả:** Tìm kiếm thẻ Yu-Gi-Oh! theo tên
- **Tham số:** `query` (bắt buộc) - Tên thẻ hoặc từ khóa tìm kiếm
- **Tính năng:** Hỗ trợ autocomplete với Fuse.js fuzzy search
- **Kết quả:** Embed Discord với hình ảnh, stats, và mô tả thẻ

#### 2. `/archetype <query>`
- **Mô tả:** Tìm kiếm thẻ theo archetype (hệ thẻ)
- **Tham số:** `query` (bắt buộc) - Tên archetype
- **Kết quả:** Danh sách các thẻ thuộc archetype với pagination

#### 3. `/pokemon <query>`
- **Mô tả:** Tìm kiếm thông tin Pokemon
- **Tham số:** `query` (bắt buộc) - Tên Pokemon (hỗ trợ tiếng Việt/Anh)
- **Kết quả:** Embed với stats, type, chiều cao, cân nặng

#### 4. `/tierlist`
- **Mô tả:** Xem tier list Yu-Gi-Oh! hiện tại
- **Quyền hạn:** Chỉ Admin/Moderator
- **Kết quả:** Tier list bằng tiếng Việt

#### 5. `/status`
- **Mô tả:** Kiểm tra trạng thái server và hàng đợi
- **Quyền hạn:** Chỉ Admin
- **Thông tin:** Uptime, RAM usage, active/queued requests

#### 6. `/art <query> [size]`
- **Mô tả:** Lấy artwork thẻ bài
- **Tham số:** 
  - `query` (bắt buộc) - Tên thẻ
  - `size` (tùy chọn) - full/small/cropped
- **Kết quả:** Hình ảnh thẻ bài chất lượng cao

---

## 🔌 MongoDB API Endpoints

### Base Endpoints

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/health` | Health check |
| GET | `/cards` | Liệt kê tất cả thẻ (có limit) |
| GET | `/cards/:id` | Lấy thẻ theo ObjectId |
| POST | `/cards` | Thêm thẻ mới |
| DELETE | `/cards` | Xóa tất cả thẻ |

### Card Search API (YGOPRODECK-compatible)

**GET `/cardinfo`** - Tìm kiếm thẻ nâng cao

#### Query Parameters:

| Parameter | Mô tả | Ví dụ |
|-----------|-------|-------|
| `name` | Tìm chính xác theo tên | `name=Dark Magician` |
| `fname` | Tìm fuzzy theo tên | `fname=Magician` |
| `id` | Tìm theo Card ID | `id=46986414` |
| `archetype` | Tìm theo archetype | `archetype=Blue-Eyes` |
| `type` | Tìm theo loại thẻ | `type=Effect Monster` |
| `atk` | Tìm theo ATK | `atk=lt2500` (lt/gt/lte/gte) |
| `def` | Tìm theo DEF | `def=gte2000` |
| `level` | Tìm theo Level/Rank | `level=7` |
| `race` | Tìm theo Race | `race=Dragon` |
| `attribute` | Tìm theo Attribute | `attribute=DARK` |
| `sort` | Sắp xếp kết quả | `sort=-atk` (descending) |
| `limit` | Giới hạn kết quả | `limit=50` |

### Card Art API

**GET `/art`** - Lấy artwork thẻ bài

| Parameter | Mô tả |
|-----------|-------|
| `name` hoặc `q` | Tên thẻ cần tìm |

**Response:**
```json
{
  "name": "Dark Magician",
  "id": 46986414,
  "type": "Normal Monster",
  "images": {
    "full": "https://...",
    "small": "https://...",
    "cropped": "https://..."
  }
}
```

---

## 🛡️ Hệ Thống Bảo Mật & Tối Ưu

### Rate Limiting

- **Giới hạn:** 5 requests/phút/user
- **Hàng đợi tối đa:** 50 requests
- **Concurrent requests:** 1 (tối ưu cho server thấp RAM)
- **Timeout:** 60 giây

### Caching

- **Autocomplete Cache:**
  - TTL: 60 giây
  - Max size: 100 entries
  - LRU eviction policy

### Resource Optimization (Render 512MB RAM)

1. **Fuse.js optimizations:**
   - `ignoreLocation: true` - Bỏ qua location scoring
   - `minMatchCharLength: 2` - Yêu cầu tối thiểu 2 ký tự
   - `distance: 100` - Giới hạn distance calculation

2. **Discord Embed Size Management:**
   - Max embed size: 6000 characters
   - Safety margin: 200 characters
   - Auto truncation cho description và fields

---

## 📊 Luồng Xử Lý Request

```
User Input (Discord)
        │
        ▼
┌───────────────────┐
│  Command Handler  │
│   (index.js)      │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐     ┌───────────────────┐
│   Rate Limiter    │────►│  Error Response   │
│  (requestQueue)   │     │  (if limited)     │
└─────────┬─────────┘     └───────────────────┘
          │
          ▼
┌───────────────────┐
│   Request Queue   │
│   (enqueue)       │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐     ┌───────────────────┐
│   API Call        │     │   LangFlow API    │
│   (api.js)        │────►│   (External)      │
└─────────┬─────────┘     └───────────────────┘
          │
          ▼
┌───────────────────┐
│  Result Processing│
│  (cardUtils.js)   │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Discord Embed    │
│  Builder          │
└─────────┬─────────┘
          │
          ▼
     User Response
```

---

## 🔧 Cấu Hình Môi Trường

### Biến môi trường cần thiết (.env)

```env
# Discord Configuration
DISCORD_TOKEN=your_bot_token

# LangFlow API Endpoints
CARD_API_URL=http://your-langflow/card
ARCHETYPE_API_URL=http://your-langflow/archetype
POKEMON_API_URL=http://your-langflow/pokemon
LANGFLOW_API_KEY=your_api_key

# MongoDB Configuration
MONGODB_URI=mongodb+srv://...
DB_NAME=card_store
PORT=3000
MONGODB_API_URL=http://localhost:3000

# Data Files (optional)
CARDS_CSV_PATH=data/Card_name_unique.csv
ARCHETYPE_CSV_PATH=data/Card_archetype_unique.csv
```

---

## 🚀 Hướng Dẫn Triển Khai

### Cài đặt Dependencies

```bash
npm install
```

### Chạy ứng dụng

```bash
# Chạy cả bot và API
npm start

# Chỉ chạy bot
npm run bot

# Chỉ chạy API
npm run api

# Development mode (auto-reload)
npm run dev
```

### Yêu cầu Discord Bot Permissions

- Send Messages
- Embed Links
- Read Message History
- Use Slash Commands

---

## 📈 Thống Kê Code

| File | Số dòng | Mô tả |
|------|---------|-------|
| index.js | 311 | Main bot logic |
| server.js | 257 | Express API server |
| cardUtils.js | 646 | Card processing utilities |
| pokemonUtils.js | 430 | Pokemon processing |
| multiCardUtils.js | 196 | Multi-card rendering |
| autocomplete.js | 190 | Fuzzy search autocomplete |
| requestQueue.js | 194 | Rate limiting & queue |
| discordClient.js | 73 | Discord client setup |
| api.js | 40 | LangFlow API client |
| mongo.js | 23 | MongoDB connection |
| **Tổng cộng** | **~2360** | **Core source code** |

---

## 🐛 Xử Lý Lỗi

### Error Handlers

1. **Rate Limit Errors:** Thông báo thời gian chờ cho user
2. **API Timeout:** Thông báo server đang bận
3. **Discord Interaction Timeout (10062):** Bỏ qua silently
4. **MongoDB Connection Errors:** Log và exit process
5. **Unhandled Rejections:** Global handler để prevent crash

### Graceful Shutdown

- Xử lý SIGINT và SIGTERM signals
- Đóng kết nối MongoDB và Discord client đúng cách

---

## 📝 Kết Luận

### Điểm Mạnh

1. ✅ Kiến trúc modular, dễ mở rộng
2. ✅ Tích hợp MongoDB cho lưu trữ dữ liệu
3. ✅ Rate limiting bảo vệ server
4. ✅ Hỗ trợ đa ngôn ngữ (Việt/Anh)
5. ✅ Autocomplete cải thiện UX
6. ✅ Tối ưu cho server tài nguyên thấp

### Điểm Có Thể Cải Thiện

1. ⚠️ Chưa có unit tests
2. ⚠️ Chưa có logging system tập trung
3. ⚠️ Chưa có monitoring/alerting
4. ⚠️ Chưa có documentation API (Swagger/OpenAPI)

### Khuyến Nghị

1. Thêm unit tests với Jest
2. Tích hợp Winston cho logging
3. Thêm Prometheus metrics
4. Tạo API documentation với Swagger
5. Implement caching layer (Redis) cho production

---

**Báo cáo được tạo:** Tháng 12, 2024  
**Tác giả:** GitHub Copilot Analysis  
**Repository:** NightBlad/YUGIOH_DiscordBot
