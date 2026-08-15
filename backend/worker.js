// 🕊️ Carrier Pigeon WebSocket Worker v4.0
// Cloudflare Workers + Durable Objects + Hibernation API
// Storage: Durable Object Storage only (no D1 needed)

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

// ============ Durable Object ============
export class MessengerDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // Init storage
    if (!(await this.state.storage.get("initialized"))) {
      await this.state.storage.put("users", {});
      await this.state.storage.put("messages", []);
      await this.state.storage.put("initialized", true);
    }

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("WebSocket required", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    // REST
    if (url.pathname === "/messages") {
      const messages = (await this.state.storage.get("messages")) || [];
      return Response.json(messages.slice(-100));
    }

    if (url.pathname === "/users") {
      const users = (await this.state.storage.get("users")) || {};
      return Response.json(Object.values(users));
    }

    return Response.json({
      name: "🕊️ Carrier Pigeon",
      version: "4.0.0",
      ws: `wss://${url.host}/ws`,
    });
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

        const users = (await this.state.storage.get("users")) || {};
        users[uid] = { id: uid, name, avatar: avatar || "🕊️", lat: lat || 0, lng: lng || 0, city: city || "", connected: true };
        await this.state.storage.put("users", users);

        const messages = (await this.state.storage.get("messages")) || [];
        ws.send(JSON.stringify({
          type: "welcome",
          data: { user: users[uid], users: Object.values(users), messages: messages.slice(-50) },
        }));

        this.broadcast({ type: "user_online", data: users[uid] }, uid);
        break;
      }

      case "send_message": {
        if (!userId) return ws.send(JSON.stringify({ type: "error", data: "Not registered" }));
        const { receiverId, content } = msg.data || {};
        if (!receiverId || typeof content !== "string" || content.length === 0 || content.length > MAX_MSG_LEN)
          return ws.send(JSON.stringify({ type: "error", data: `Invalid (1-${MAX_MSG_LEN} chars)` }));

        const users = (await this.state.storage.get("users")) || {};
        const sender = users[userId];
        const receiver = users[receiverId];
        if (!sender || !receiver) return ws.send(JSON.stringify({ type: "error", data: "User not found" }));

        const pm = createPigeonMessage(userId, receiverId, content, sender.lat, sender.lng, receiver.lat, receiver.lng);

        const messages = (await this.state.storage.get("messages")) || [];
        messages.push(pm);
        if (messages.length > 500) messages.splice(0, messages.length - 500);
        await this.state.storage.put("messages", messages);

        this.sendTo(userId, { type: "new_message", data: pm });
        this.sendTo(receiverId, { type: "new_message", data: pm });

        await this.ensureAlarm();
        break;
      }

      case "update_location": {
        if (!userId) return;
        const { lat, lng } = msg.data || {};
        if (typeof lat !== "number" || typeof lng !== "number") return;
        const users = (await this.state.storage.get("users")) || {};
        if (users[userId]) { users[userId].lat = lat; users[userId].lng = lng; }
        await this.state.storage.put("users", users);
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
    const users = (await this.state.storage.get("users")) || {};
    if (users[att.userId]) {
      users[att.userId].connected = false;
      await this.state.storage.put("users", users);
      this.broadcast({ type: "user_offline", data: { userId: att.userId } });
    }
  }

  async ensureAlarm() {
    if (!(await this.state.storage.getAlarm())) {
      await this.state.storage.setAlarm(Date.now() + TICK_MS);
    }
  }

  async alarm() {
    try {
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
      await this.state.storage.put("messages", messages);
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
      return Response.json({ name: "🕊️ Carrier Pigeon", version: "4.0.0", ws: `wss://${url.host}/ws` });
    }
    const doId = env.MESSENGER.idFromName("main");
    return env.MESSENGER.get(doId).fetch(request);
  },
};
