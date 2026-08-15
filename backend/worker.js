// 🕊️ Carrier Pigeon WebSocket Worker
// Cloudflare Worker + Durable Objects

// ============ Types ============
// @ts-ignore
const PIGEON_SPEED = 177;
const LOST_CHANCE = 0.002;
const SPEED_VARIANCE = 0.25;

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

function createPigeonMessage(senderId, receiverId, content, senderLat, senderLng, receiverLat, receiverLng) {
  const distance = haversineDistance(senderLat, senderLng, receiverLat, receiverLng);
  const speedVariation = 1 - SPEED_VARIANCE + Math.random() * SPEED_VARIANCE * 2;
  return {
    id: crypto.randomUUID(),
    senderId,
    receiverId,
    content,
    sentAt: new Date().toISOString(),
    deliveredAt: null,
    status: "inTransit",
    senderLat, senderLng,
    receiverLat, receiverLng,
    currentLat: senderLat,
    currentLng: senderLng,
    distanceKm: Math.round(distance * 100) / 100,
    speedKmh: Math.round(PIGEON_SPEED * speedVariation),
    progress: 0,
  };
}

function updatePigeon(msg) {
  if (msg.status !== "inTransit") return msg;
  if (Math.random() < LOST_CHANCE) {
    msg.status = "lost";
    return msg;
  }
  const speedVariation = 1 - SPEED_VARIANCE + Math.random() * SPEED_VARIANCE * 2;
  const effectiveSpeed = msg.speedKmh * speedVariation;
  const increment = (effectiveSpeed / 3600) * 2 / (msg.distanceKm || 1);
  msg.progress = Math.min(1, msg.progress + increment);
  msg.currentLat = msg.senderLat + (msg.receiverLat - msg.senderLat) * msg.progress;
  msg.currentLng = msg.senderLng + (msg.receiverLng - msg.senderLng) * msg.progress;
  msg.currentLat += Math.sin(msg.progress * Math.PI) * 0.05;
  if (msg.progress >= 1) {
    msg.status = "delivered";
    msg.deliveredAt = new Date().toISOString();
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
    this.connections = new Map();
    this.users = new Map();
    this.messages = [];
    this.pigeonInterval = null;

    // Restore state from storage
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get("messages");
      if (stored) this.messages = stored;
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("WebSocket required", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === "/messages") {
      return Response.json(this.messages.slice(-100));
    }
    if (url.pathname === "/users") {
      return Response.json(Array.from(this.users.values()));
    }
    return Response.json({ name: "🕊️ Carrier Pigeon", status: "ok" });
  }

  async webSocketMessage(ws, raw) {
    try {
      const msg = JSON.parse(raw);
      await this.handleMessage(ws, msg);
    } catch (e) {
      ws.send(JSON.stringify({ type: "error", data: "Invalid JSON" }));
    }
  }

  async webSocketClose(ws) {
    for (const [userId, conn] of this.connections) {
      if (conn === ws) {
        this.connections.delete(userId);
        const user = this.users.get(userId);
        if (user) {
          user.connected = false;
          this.broadcast({ type: "user_offline", data: { userId } });
        }
        break;
      }
    }
  }

  async handleMessage(ws, msg) {
    switch (msg.type) {
      case "register": {
        const { userId, name, avatar, lat, lng, city } = msg.data;
        const user = {
          id: userId, name,
          avatar: avatar || "🕊️",
          lat: lat || 0, lng: lng || 0,
          city: city || "",
          connected: true,
        };
        this.users.set(userId, user);
        this.connections.set(userId, ws);
        ws.send(JSON.stringify({
          type: "welcome",
          data: { user, users: Array.from(this.users.values()), messages: this.messages.slice(-50) },
        }));
        this.broadcast({ type: "user_online", data: user }, userId);
        break;
      }
      case "send_message": {
        const { senderId, receiverId, content } = msg.data;
        const sender = this.users.get(senderId);
        const receiver = this.users.get(receiverId);
        if (!sender || !receiver) return ws.send(JSON.stringify({ type: "error", data: "User not found" }));
        const pigeonMsg = createPigeonMessage(senderId, receiverId, content, sender.lat, sender.lng, receiver.lat, receiver.lng);
        this.messages.push(pigeonMsg);
        this.sendTo(senderId, { type: "new_message", data: pigeonMsg });
        this.sendTo(receiverId, { type: "new_message", data: pigeonMsg });
        this.startPigeonSimulation();
        // Persist
        await this.state.storage.put("messages", this.messages.slice(-200));
        break;
      }
      case "update_location": {
        const { userId, lat, lng } = msg.data;
        const user = this.users.get(userId);
        if (user) { user.lat = lat; user.lng = lng; }
        break;
      }
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
    }
  }

  startPigeonSimulation() {
    if (this.pigeonInterval) return;
    this.pigeonInterval = setInterval(() => {
      let hasFlying = false;
      for (const msg of this.messages) {
        if (msg.status === "inTransit") {
          updatePigeon(msg);
          hasFlying = true;
          this.sendTo(msg.senderId, { type: "pigeon_update", data: msg });
          this.sendTo(msg.receiverId, { type: "pigeon_update", data: msg });
        }
      }
      if (!hasFlying && this.pigeonInterval) {
        clearInterval(this.pigeonInterval);
        this.pigeonInterval = null;
      }
    }, 2000);
  }

  broadcast(msg, excludeId) {
    const data = JSON.stringify(msg);
    for (const [userId, ws] of this.connections) {
      if (userId !== excludeId) { try { ws.send(data); } catch {} }
    }
  }

  sendTo(userId, msg) {
    const ws = this.connections.get(userId);
    if (ws) { try { ws.send(JSON.stringify(msg)); } catch {} }
  }
}

// ============ Worker Entry ============
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
      return Response.json({ name: "🕊️ Carrier Pigeon API", ws: `wss://${url.host}/ws` });
    }
    const doId = env.MESSENGER.idFromName("main");
    return env.MESSENGER.get(doId).fetch(request);
  },
};
