# 🕊️ Carrier Pigeon Backend

بک‌اند پیام‌رسان کبوتر با Cloudflare Workers + Durable Objects

## 📦 نصب

```bash
cd backend
npm install
```

## 🚀 دپلوی

1. **ورفینگر نصب کن:**
```bash
npm install -g wrangler
```

2. **لاگین کن:**
```bash
wrangler login
```

3. **دپلوی کن:**
```bash
wrangler deploy
```

4. **آدرس ورکر رو کپی کن** مثلاً:
```
carrier-pigeon.YOUR_SUBDOMAIN.workers.dev
```

5. **آدرس رو توی فلاتر بذار** در `lib/services/websocket_service.dart`:
```dart
static const String wsUrl = 'wss://carrier-pigeon.YOUR_SUBDOMAIN.workers.dev/ws';
```

## 🏗️ معماری

```
Flutter App ──WebSocket──▶ Cloudflare Worker ──▶ Durable Object
                                                      │
                                                 💾 Messages
                                                 👥 Users
                                                 🕊️ Pigeon Sim
```

## 🔌 API

### WebSocket `wss://.../ws`

**ثبت‌نام:**
```json
{"type": "register", "data": {"userId": "u1", "name": "علی", "lat": 35.68, "lng": 51.38}}
```

**ارسال پیام:**
```json
{"type": "send_message", "data": {"senderId": "u1", "receiverId": "u2", "content": "سلام!"}}
```

**بروزرسانی موقعیت:**
```json
{"type": "update_location", "data": {"userId": "u1", "lat": 35.69, "lng": 51.39}}
```

### REST

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/messages` | GET | لیست پیام‌ها |
| `/users` | GET | لیست کاربران |

## 🕊️ قوانین کبوتر

| پارامتر | مقدار |
|---------|-------|
| سرعت | 177 km/h ±25% |
| احتمال گم شدن | 0.2% در هر تیک |
| تیک هر ۲ ثانیه | شبیه‌سازی پرواز |
| مسیر | مستقیم + انحنای کم |

## ⚙️ متغیرهای محیطی

در `wrangler.toml` قابل تغییر هستند.
