// 🕊️ Carrier Pigeon WebSocket Worker v3.1
// Cloudflare Workers + Durable Objects + D1 + Hibernation API

const PIGEON_SPEED = 177;
const LOST_CHANCE = 0.002;
const SPEED_VARIANCE = 0.25;
const TICK_MS = 2000;
const MAX_MSG_LEN = 2000;

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function createPigeonMessage(senderId, receiverId, content, sLat, sLng, rLat, rLng) {
  const distance = haversineDistance(sLat, sLng, rLat, rLng);
  const sv = 1 - SPEED_VARIANCE + Math.random() * SPEED_VARIANCE * 2;
  return {
    id: crypto.randomUUID(),
    senderId, receiverId, content,
    sentAt: Date.now(),
    lastUpdateAt: Date.now(),
    deliveredAt: null,
    status: "inTransit",
    senderLat: sLat, senderLng: sLng,
    receiverLat: rLat, receiverLng: rLng,
    currentLat: sLat, currentLng: sLng,
    distanceKm: Math.round(distance * 100) / 100,
    speedKmh: Math.round(PIGEON_SPEED * sv),
    progress: 0,
  };
}

function updatePigeon(msg) {
  if (msg.status !== "inTransit") return msg;
  const now = Date.now();
  const elapsedSec = (now - (msg.lastUpdateAt || msg.sentAt)) / 1000;
  msg.lastUpdateAt = now;
  if (Math.random() < LOST_CHANCE * (elapsedSec / 2)) {
    msg.status = "lost";
    return msg;
  }
  const sv = 1 - SPEED_VARIANCE + Math.random() * SPEED_VARIANCE * 2;
  const effectiveSpeed = msg.speedKmh * sv;
  const increment = (effectiveSpeed / 3600) * elapsedSec / (msg.distanceKm || 1);
  msg.progress = Math.min(1, msg.progress + increment);
  msg.currentLat = msg.senderLat + (msg.receiverLat - msg.senderLat) * msg.progress;
  msg.currentLng = msg.senderLng + (msg.receiverLng - msg.senderLng) * msg.progress;
  msg.currentLat += Math.sin(msg.progress * Math.PI) * 0.05;
  if (msg.progress >= 1) {
    msg.status = "delivered";
    msg.deliveredAt = Date.now();
    msg.currentLat = msg.receiverLat;
    msg.currentLng = msg.receiverLng;
  }
  return msg;
}

function dbToMsg(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    content: row.content,
    sentAt: row.sent_at,
    lastUpdateAt: row.last_update_at,
    deliveredAt: row.delivered_at,
    status: row.status,
    senderLat: row.sender_lat,
    senderLng: row.sender_lng,
    receiverLat: row.receiver_lat,
    receiverLng: row.receiver_lng,
    currentLat: row.current_lat,
    currentLng: row.current_lng,
    distanceKm: row.distance_km,
    speedKmh: row.speed_kmh,
    progress: row.progress,
  };
}

// ============ Durable Object ============
export class MessengerDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this._dbReady = false;
  }

  async ensureDB() {
    if (this._dbReady) return;
    try {
      const db = this.env.DB;
      if (!db) throw new Error("DB binding not found");
      await db.exec(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT DEFAULT '🕊️',
        lat REAL DEFAULT 0, lng REAL DEFAULT 0, city TEXT DEFAULT '',
        connected INTEGER DEFAULT 0, created_at INTEGER
      )`);
      await db.exec(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, sender_id TEXT NOT NULL, receiver_id TEXT NOT NULL,
        content TEXT NOT NULL, sent_at INTEGER, last_update_at INTEGER,
        delivered_at INTEGER, status TEXT DEFAULT 'inTransit',
        sender_lat REAL, sender_lng REAL, receiver_lat REAL, receiver_lng REAL,
        current_lat REAL, current_lng REAL, distance_km REAL,
        speed_kmh REAL, progress REAL DEFAULT 0
      )`);
      this._dbReady = true;
    } catch (e) {
      console.error("DB init error:", e);
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    await this.ensureDB();

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("WebSocket required", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/messages") {
      try {
        const { results } = await this.env.DB.prepare(
          "SELECT * FROM messages ORDER BY sent_at DESC LIMIT 100"
        ).all();
        return Response.json(results.map(dbToMsg));
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
      }
    }

    if (url.pathname === "/users") {
      try {
        const { results } = await this.env.DB.prepare(
          "SELECT * FROM users ORDER BY created_at DESC"
        ).all();
        return Response.json(results);
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
      }
    }

    return Response.json({ name: "🕊️ Carrier Pigeon", version: "3.1.0", ws: `wss://${url.host}/ws` });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch {
      return ws.send(JSON.stringify({ type: "error", data: "Invalid JSON" }));
    }
    const att = ws.deserializeAttachment();
    const userId = att?.userId;

    switch (msg.type) {
      case "register": {
        const { userId: uid, name, avatar, lat, lng, city } = msg.data || {};
        if (!uid || !name) return ws.send(JSON.stringify({ type: "error", data: "userId and name required" }));
        ws.serializeAttachment({ userId: uid });
        try {
          await this.env.DB.prepare(
            `INSERT INTO users (id,name,avatar,lat,lng,city,connected,created_at) VALUES (?,?,?,?,?,?,1,?)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name,avatar=excluded.avatar,lat=excluded.lat,lng=excluded.lng,city=excluded.city,connected=1`
          ).bind(uid, name, avatar||"🕊️", lat||0, lng||0, city||"", Date.now()).run();
          const { results: users } = await this.env.DB.prepare("SELECT * FROM users").all();
          const user = users.find(u => u.id === uid);
          const { results: msgs } = await this.env.DB.prepare(
            "SELECT * FROM messages WHERE sender_id=? OR receiver_id=? ORDER BY sent_at DESC LIMIT 50"
          ).bind(uid, uid).all();
          ws.send(JSON.stringify({ type: "welcome", data: { user, users: users.map(u=>({...u,connected:!!u.connected})), messages: msgs.map(dbToMsg).reverse() } }));
          this.broadcast({ type: "user_online", data: user }, uid);
        } catch (e) {
          ws.send(JSON.stringify({ type: "error", data: e.message }));
        }
        break;
      }

      case "send_message": {
        if (!userId) return ws.send(JSON.stringify({ type: "error", data: "Not registered" }));
        const { receiverId, content } = msg.data || {};
        if (!receiverId || typeof content !== "string" || content.length === 0 || content.length > MAX_MSG_LEN)
          return ws.send(JSON.stringify({ type: "error", data: `Invalid (1-${MAX_MSG_LEN} chars)` }));
        try {
          const sender = await this.env.DB.prepare("SELECT * FROM users WHERE id=?").bind(userId).first();
          const receiver = await this.env.DB.prepare("SELECT * FROM users WHERE id=?").bind(receiverId).first();
          if (!sender || !receiver) return ws.send(JSON.stringify({ type: "error", data: "User not found" }));
          const pm = createPigeonMessage(userId, receiverId, content, sender.lat, sender.lng, receiver.lat, receiver.lng);
          await this.env.DB.prepare(
            `INSERT INTO messages (id,sender_id,receiver_id,content,sent_at,last_update_at,delivered_at,status,sender_lat,sender_lng,receiver_lat,receiver_lng,current_lat,current_lng,distance_km,speed_kmh,progress) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
          ).bind(pm.id,pm.senderId,pm.receiverId,pm.content,pm.sentAt,pm.lastUpdateAt,pm.deliveredAt,pm.status,pm.senderLat,pm.senderLng,pm.receiverLat,pm.receiverLng,pm.currentLat,pm.currentLng,pm.distanceKm,pm.speedKmh,pm.progress).run();
          this.sendTo(userId, { type: "new_message", data: pm });
          this.sendTo(receiverId, { type: "new_message", data: pm });
          await this.ensureAlarm();
        } catch (e) {
          ws.send(JSON.stringify({ type: "error", data: e.message }));
        }
        break;
      }

      case "update_location": {
        if (!userId) return;
        const { lat, lng } = msg.data || {};
        if (typeof lat !== "number" || typeof lng !== "number") return;
        await this.env.DB.prepare("UPDATE users SET lat=?,lng=? WHERE id=?").bind(lat, lng, userId).run();
        break;
      }

      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;

      default:
        ws.send(JSON.stringify({ type: "error", data: "Unknown type" }));
    }
  }

  async webSocketClose(ws) {
    const att = ws.deserializeAttachment();
    if (!att?.userId) return;
    try {
      await this.env.DB.prepare("UPDATE users SET connected=0 WHERE id=?").bind(att.userId).run();
      this.broadcast({ type: "user_offline", data: { userId: att.userId } });
    } catch {}
  }

  async ensureAlarm() {
    if (!(await this.state.storage.getAlarm())) {
      await this.state.storage.setAlarm(Date.now() + TICK_MS);
    }
  }

  async alarm() {
    try {
      const { results } = await this.env.DB.prepare("SELECT * FROM messages WHERE status='inTransit'").all();
      let hasFlying = false;
      const batch = [];
      for (const row of results) {
        const msg = dbToMsg(row);
        updatePigeon(msg);
        hasFlying = true;
        batch.push(this.env.DB.prepare(
          "UPDATE messages SET status=?,progress=?,current_lat=?,current_lng=?,last_update_at=?,delivered_at=? WHERE id=?"
        ).bind(msg.status, msg.progress, msg.currentLat, msg.currentLng, msg.lastUpdateAt, msg.deliveredAt, msg.id));
        this.sendTo(msg.senderId, { type: "pigeon_update", data: msg });
        this.sendTo(msg.receiverId, { type: "pigeon_update", data: msg });
      }
      if (batch.length > 0) await this.env.DB.batch(batch);
      if (hasFlying) await this.state.storage.setAlarm(Date.now() + TICK_MS);
    } catch (e) {
      console.error("Alarm error:", e);
    }
  }

  broadcast(msg, excludeId) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a?.userId !== excludeId) try { ws.send(data); } catch {}
    }
  }

  sendTo(userId, msg) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a?.userId === userId) try { ws.send(data); } catch {}
    }
  }
}

// ============ Worker ============
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      }});
    }
    if (url.pathname === "/") {
      return Response.json({ name: "🕊️ Carrier Pigeon", version: "3.1.0", ws: `wss://${url.host}/ws` });
    }
    const doId = env.MESSENGER.idFromName("main");
    return env.MESSENGER.get(doId).fetch(request);
  },
};
