// 🕊️ Carrier Pigeon WebSocket Worker v5.1
// Cloudflare Workers + Durable Objects (SQLite storage) + Hibernation API

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

export class MessengerDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    await this.initDB();

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
      const msgs = this.state.storage.sql.exec("SELECT * FROM messages ORDER BY sent_at DESC LIMIT 100").toArray();
      return Response.json(msgs.map(this.dbToMsg));
    }

    if (url.pathname === "/users") {
      const users = this.state.storage.sql.exec("SELECT * FROM users").toArray();
      return Response.json(users);
    }

    return Response.json({
      name: "🕊️ Carrier Pigeon",
      version: "5.1.0",
      ws: `wss://${url.host}/ws`,
    });
  }

  async initDB() {
    this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT DEFAULT '🕊️',
        lat REAL DEFAULT 0, lng REAL DEFAULT 0, city TEXT DEFAULT '',
        connected INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, sender_id TEXT NOT NULL, receiver_id TEXT NOT NULL,
        content TEXT NOT NULL, sent_at INTEGER, last_update_at INTEGER,
        delivered_at INTEGER, status TEXT DEFAULT 'inTransit',
        sender_lat REAL, sender_lng REAL, receiver_lat REAL, receiver_lng REAL,
        current_lat REAL, current_lng REAL, distance_km REAL,
        speed_kmh REAL, progress REAL DEFAULT 0
      );
    `);
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

        this.state.storage.sql.exec(
          "INSERT INTO users (id,name,avatar,lat,lng,city,connected) VALUES (?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,avatar=excluded.avatar,lat=excluded.lat,lng=excluded.lng,city=excluded.city,connected=1",
          uid, name, avatar || "🕊️", lat || 0, lng || 0, city || ""
        );

        const users = this.state.storage.sql.exec("SELECT * FROM users").toArray();
        const user = users.find(u => u.id === uid);
        const msgs = this.state.storage.sql.exec(
          "SELECT * FROM messages WHERE sender_id=? OR receiver_id=? ORDER BY sent_at DESC LIMIT 50", uid, uid
        ).toArray();

        ws.send(JSON.stringify({
          type: "welcome",
          data: { user, users, messages: msgs.map(this.dbToMsg).reverse() },
        }));
        this.broadcast({ type: "user_online", data: user }, uid);
        break;
      }

      case "send_message": {
        if (!userId) return ws.send(JSON.stringify({ type: "error", data: "Not registered" }));
        const { receiverId, content } = msg.data || {};
        if (!receiverId || typeof content !== "string" || content.length === 0 || content.length > MAX_MSG_LEN)
          return ws.send(JSON.stringify({ type: "error", data: `Invalid (1-${MAX_MSG_LEN} chars)` }));

        const sender = this.state.storage.sql.exec("SELECT * FROM users WHERE id=?", userId).toArray()[0];
        const receiver = this.state.storage.sql.exec("SELECT * FROM users WHERE id=?", receiverId).toArray()[0];
        if (!sender || !receiver) return ws.send(JSON.stringify({ type: "error", data: "User not found" }));

        const pm = createPigeonMessage(userId, receiverId, content, sender.lat, sender.lng, receiver.lat, receiver.lng);

        this.state.storage.sql.exec(
          `INSERT INTO messages (id,sender_id,receiver_id,content,sent_at,last_update_at,delivered_at,status,sender_lat,sender_lng,receiver_lat,receiver_lng,current_lat,current_lng,distance_km,speed_kmh,progress) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          pm.id, pm.senderId, pm.receiverId, pm.content, pm.sentAt, pm.lastUpdateAt, pm.deliveredAt, pm.status,
          pm.senderLat, pm.senderLng, pm.receiverLat, pm.receiverLng, pm.currentLat, pm.currentLng,
          pm.distanceKm, pm.speedKmh, pm.progress
        );

        this.sendTo(userId, { type: "new_message", data: pm });
        this.sendTo(receiverId, { type: "new_message", data: pm });
        await this.ensureAlarm();
        break;
      }

      case "update_location": {
        if (!userId) return;
        const { lat, lng } = msg.data || {};
        if (typeof lat !== "number" || typeof lng !== "number") return;
        this.state.storage.sql.exec("UPDATE users SET lat=?,lng=? WHERE id=?", lat, lng, userId);
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
    this.state.storage.sql.exec("UPDATE users SET connected=0 WHERE id=?", att.userId);
    this.broadcast({ type: "user_offline", data: { userId: att.userId } });
  }

  async ensureAlarm() {
    if (!(await this.state.storage.getAlarm())) {
      await this.state.storage.setAlarm(Date.now() + TICK_MS);
    }
  }

  async alarm() {
    try {
      const msgs = this.state.storage.sql.exec("SELECT * FROM messages WHERE status='inTransit'").toArray();
      let hasFlying = false;
      for (const row of msgs) {
        const msg = this.dbToMsg(row);
        updatePigeon(msg);
        hasFlying = true;
        this.state.storage.sql.exec(
          "UPDATE messages SET status=?,progress=?,current_lat=?,current_lng=?,last_update_at=?,delivered_at=? WHERE id=?",
          msg.status, msg.progress, msg.currentLat, msg.currentLng, msg.lastUpdateAt, msg.deliveredAt, msg.id
        );
        this.sendTo(msg.senderId, { type: "pigeon_update", data: msg });
        this.sendTo(msg.receiverId, { type: "pigeon_update", data: msg });
      }
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

  dbToMsg(row) {
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
}

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
      return Response.json({ name: "🕊️ Carrier Pigeon", version: "5.1.0", ws: `wss://${url.host}/ws` });
    }
    const doId = env.MESSENGER.idFromName("main");
    return env.MESSENGER.get(doId).fetch(request);
  },
};
