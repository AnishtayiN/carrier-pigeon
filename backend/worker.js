// 🕊️ Carrier Pigeon WebSocket Worker
// Cloudflare Workers + Durable Objects + Hibernation API
// ============================================

const PIGEON_SPEED = 177;        // km/h base speed
const LOST_CHANCE = 0.002;       // 0.2% per tick
const SPEED_VARIANCE = 0.25;     // ±25%
const TICK_MS = 2000;            // simulation tick interval
const MAX_MSG_LEN = 2000;        // max message length

// ============ Haversine ============
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

// ============ Pigeon Factory ============
function createPigeonMessage(senderId, receiverId, content, sLat, sLng, rLat, rLng) {
  const distance = haversineDistance(sLat, sLng, rLat, rLng);
  const sv = 1 - SPEED_VARIANCE + Math.random() * SPEED_VARIANCE * 2;
  return {
    id: crypto.randomUUID(),
    senderId,
    receiverId,
    content,
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

// ============ Pigeon Update (time-based) ============
function updatePigeon(msg) {
  if (msg.status !== "inTransit") return msg;

  const now = Date.now();
  const elapsedSec = (now - (msg.lastUpdateAt || msg.sentAt)) / 1000;
  msg.lastUpdateAt = now;

  // Lost chance scales with elapsed time
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

// ============ Durable Object ============
export class MessengerDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;

    // WebSocket Hibernation API: acceptWebSocket is called in fetch()
    // userId stored via ws.serializeAttachment()
    // users persisted in Durable Object Storage
    // messages persisted in Durable Object Storage
    // Alarm used for pigeon simulation (no setInterval)
  }

  async fetch(request) {
    const url = new URL(request.url);

    // ---- WebSocket upgrade ----
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("WebSocket required", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      // Accept with Hibernation API — no acceptWebSocket call here,
      // the userId will be set on first message after register
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    // ---- REST endpoints ----
    if (url.pathname === "/messages") {
      const msgs = (await this.state.storage.get("messages")) || [];
      return Response.json(msgs.slice(-100));
    }
    if (url.pathname === "/users") {
      const users = (await this.state.storage.get("users")) || {};
      return Response.json(Object.values(users));
    }

    return Response.json({
      name: "🕊️ Carrier Pigeon API",
      status: "ok",
      ws: `wss://${url.host}/ws`,
    });
  }

  // ---- WebSocket message (Hibernation API) ----
  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return ws.send(JSON.stringify({ type: "error", data: "Invalid JSON" }));
    }

    const attachment = ws.deserializeAttachment();
    const userId = attachment?.userId;

    switch (msg.type) {
      case "register": {
        const { userId: uid, name, avatar, lat, lng, city } = msg.data || {};
        if (!uid || !name) {
          return ws.send(JSON.stringify({ type: "error", data: "userId and name required" }));
        }

        // Store userId in WebSocket attachment
        ws.serializeAttachment({ userId: uid });

        // Persist user in storage
        const users = (await this.state.storage.get("users")) || {};
        users[uid] = {
          id: uid, name,
          avatar: avatar || "🕊️",
          lat: lat || 0, lng: lng || 0,
          city: city || "",
          connected: true,
        };
        await this.state.storage.put("users", users);

        // Send welcome to this user
        const messages = (await this.state.storage.get("messages")) || [];
        ws.send(JSON.stringify({
          type: "welcome",
          data: {
            user: users[uid],
            users: Object.values(users),
            messages: messages.slice(-50),
          },
        }));

        // Broadcast user_online to others
        this.broadcast({ type: "user_online", data: users[uid] }, uid);
        break;
      }

      case "send_message": {
        // Auth: userId must be set from attachment, not from message
        if (!userId) {
          return ws.send(JSON.stringify({ type: "error", data: "Not registered" }));
        }

        const { receiverId, content } = msg.data || {};

        // Validate
        if (!receiverId || typeof content !== "string" || content.length === 0 || content.length > MAX_MSG_LEN) {
          return ws.send(JSON.stringify({
            type: "error",
            data: `Invalid message (max ${MAX_MSG_LEN} chars)`,
          }));
        }

        const users = (await this.state.storage.get("users")) || {};
        const sender = users[userId];
        const receiver = users[receiverId];

        if (!sender || !receiver) {
          return ws.send(JSON.stringify({ type: "error", data: "User not found" }));
        }

        const pigeonMsg = createPigeonMessage(
          userId, receiverId, content,
          sender.lat, sender.lng,
          receiver.lat, receiver.lng,
        );

        // Persist
        const messages = (await this.state.storage.get("messages")) || [];
        messages.push(pigeonMsg);
        // Keep last 500 messages
        if (messages.length > 500) messages.splice(0, messages.length - 500);
        await this.state.storage.put("messages", messages);

        // Notify sender & receiver
        this.sendTo(userId, { type: "new_message", data: pigeonMsg });
        this.sendTo(receiverId, { type: "new_message", data: pigeonMsg });

        // Start pigeon simulation via Alarm
        await this.ensureAlarm();
        break;
      }

      case "update_location": {
        if (!userId) return;
        const { lat, lng } = msg.data || {};
        if (typeof lat !== "number" || typeof lng !== "number") return;

        const users = (await this.state.storage.get("users")) || {};
        if (users[userId]) {
          users[userId].lat = lat;
          users[userId].lng = lng;
          await this.state.storage.put("users", users);
        }
        break;
      }

      case "ping": {
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      }

      default:
        ws.send(JSON.stringify({ type: "error", data: "Unknown type" }));
    }
  }

  // ---- WebSocket close ----
  async webSocketClose(ws) {
    const attachment = ws.deserializeAttachment();
    if (!attachment?.userId) return;

    const users = (await this.state.storage.get("users")) || {};
    if (users[attachment.userId]) {
      users[attachment.userId].connected = false;
      await this.state.storage.put("users", users);
      this.broadcast({ type: "user_offline", data: { userId: attachment.userId } });
    }
  }

  // ---- Alarm for pigeon simulation ----
  async ensureAlarm() {
    const existing = await this.state.storage.getAlarm();
    if (!existing) {
      await this.state.storage.setAlarm(Date.now() + TICK_MS);
    }
  }

  async alarm() {
    const messages = (await this.state.storage.get("messages")) || [];
    let hasFlying = false;

    for (const msg of messages) {
      if (msg.status === "inTransit") {
        updatePigeon(msg);
        hasFlying = true;
        this.sendTo(msg.senderId, { type: "pigeon_update", data: msg });
        this.sendTo(msg.receiverId, { type: "pigeon_update", data: msg });
      }
    }

    // Persist updated messages
    await this.state.storage.put("messages", messages);

    // Schedule next tick if there are still flying pigeons
    if (hasFlying) {
      await this.state.storage.setAlarm(Date.now() + TICK_MS);
    }
  }

  // ---- Send helpers (use Hibernation API getWebSockets) ----
  broadcast(msg, excludeId) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment();
      if (attachment?.userId !== excludeId) {
        try { ws.send(data); } catch {}
      }
    }
  }

  async sendTo(userId, msg) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment();
      if (attachment?.userId === userId) {
        try { ws.send(data); } catch {}
      }
    }
  }
}

// ============ Worker Entry ============
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (url.pathname === "/") {
      return Response.json({
        name: "🕊️ Carrier Pigeon API",
        version: "2.0.0",
        ws: `wss://${url.host}/ws`,
      });
    }

    const doId = env.MESSENGER.idFromName("main");
    return env.MESSENGER.get(doId).fetch(request);
  },
};
