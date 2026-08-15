// 🕊️ Carrier Pigeon WebSocket Worker v5.0
// Simple: WebSocket + in-memory state (no DO needed)

const PIGEON_SPEED = 177;
const LOST_CHANCE = 0.002;
const SPEED_VARIANCE = 0.25;
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

const users = new Map();
const messages = [];
const connections = new Map();

function sendTo(userId, msg) {
  const ws = connections.get(userId);
  if (ws) try { ws.send(JSON.stringify(msg)); } catch {}
}

function broadcast(msg, excludeId) {
  const data = JSON.stringify(msg);
  for (const [id, ws] of connections) {
    if (id !== excludeId) try { ws.send(data); } catch {}
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      }});
    }

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("WebSocket required", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.addEventListener("message", (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }

        switch (msg.type) {
          case "register": {
            const { userId: uid, name, avatar, lat, lng, city } = msg.data || {};
            if (!uid || !name) return server.send(JSON.stringify({ type: "error", data: "userId and name required" }));

            users.set(uid, { id: uid, name, avatar: avatar || "🕊️", lat: lat || 0, lng: lng || 0, city: city || "", connected: true });
            connections.set(uid, server);

            const messagesList = [...messages];
            server.send(JSON.stringify({
              type: "welcome",
              data: { user: users.get(uid), users: [...users.values()], messages: messagesList.slice(-50) },
            }));

            broadcast({ type: "user_online", data: users.get(uid) }, uid);
            break;
          }

          case "send_message": {
            const att = connections.has([...connections.keys()].find(k => connections.get(k) === server));
            const senderId = [...connections.keys()].find(k => connections.get(k) === server);
            if (!senderId) return server.send(JSON.stringify({ type: "error", data: "Not registered" }));

            const { receiverId, content } = msg.data || {};
            if (!receiverId || typeof content !== "string" || content.length === 0 || content.length > MAX_MSG_LEN)
              return server.send(JSON.stringify({ type: "error", data: `Invalid (1-${MAX_MSG_LEN} chars)` }));

            const sender = users.get(senderId);
            const receiver = users.get(receiverId);
            if (!sender || !receiver) return server.send(JSON.stringify({ type: "error", data: "User not found" }));

            const distance = haversineDistance(sender.lat, sender.lng, receiver.lat, receiver.lng);
            const sv = 1 - SPEED_VARIANCE + Math.random() * SPEED_VARIANCE * 2;
            const pm = {
              id: crypto.randomUUID(),
              senderId, receiverId, content,
              sentAt: Date.now(),
              deliveredAt: null,
              status: "inTransit",
              senderLat: sender.lat, senderLng: sender.lng,
              receiverLat: receiver.lat, receiverLng: receiver.lng,
              currentLat: sender.lat, currentLng: sender.lng,
              distanceKm: Math.round(distance * 100) / 100,
              speedKmh: Math.round(PIGEON_SPEED * sv),
              progress: 0,
            };

            messages.push(pm);
            if (messages.length > 500) messages.splice(0, messages.length - 500);

            sendTo(senderId, { type: "new_message", data: pm });
            sendTo(receiverId, { type: "new_message", data: pm });

            // Start simulation
            simulatePigeon(pm);
            break;
          }

          case "update_location": {
            const senderId = [...connections.keys()].find(k => connections.get(k) === server);
            if (!senderId) return;
            const { lat, lng } = msg.data || {};
            if (typeof lat === "number" && typeof lng === "number" && users.has(senderId)) {
              const u = users.get(senderId);
              u.lat = lat; u.lng = lng;
            }
            break;
          }

          case "ping":
            server.send(JSON.stringify({ type: "pong" }));
            break;

          default:
            server.send(JSON.stringify({ type: "error", data: "Unknown type" }));
        }
      });

      server.addEventListener("close", () => {
        const senderId = [...connections.keys()].find(k => connections.get(k) === server);
        if (senderId) {
          connections.delete(senderId);
          if (users.has(senderId)) {
            users.get(senderId).connected = false;
            broadcast({ type: "user_offline", data: { userId: senderId } });
          }
        }
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    // REST endpoints
    if (url.pathname === "/users") {
      return Response.json([...users.values()]);
    }
    if (url.pathname === "/messages") {
      return Response.json(messages.slice(-100));
    }

    return Response.json({
      name: "🕊️ Carrier Pigeon",
      version: "5.0.0",
      ws: `wss://${url.host}/ws`,
    });
  },
};

function simulatePigeon(pm) {
  const interval = setInterval(() => {
    if (pm.status !== "inTransit") { clearInterval(interval); return; }

    const now = Date.now();
    const elapsedSec = (now - pm.sentAt) / 1000;

    if (Math.random() < LOST_CHANCE) {
      pm.status = "lost";
      sendTo(pm.senderId, { type: "pigeon_update", data: pm });
      sendTo(pm.receiverId, { type: "pigeon_update", data: pm });
      clearInterval(interval);
      return;
    }

    const sv = 1 - SPEED_VARIANCE + Math.random() * SPEED_VARIANCE * 2;
    const effectiveSpeed = pm.speedKmh * sv;
    const increment = (effectiveSpeed / 3600) * 2 / (pm.distanceKm || 1);
    pm.progress = Math.min(1, pm.progress + increment);

    pm.currentLat = pm.senderLat + (pm.receiverLat - pm.senderLat) * pm.progress;
    pm.currentLng = pm.senderLng + (pm.receiverLng - pm.senderLng) * pm.progress;
    pm.currentLat += Math.sin(pm.progress * Math.PI) * 0.05;

    if (pm.progress >= 1) {
      pm.status = "delivered";
      pm.deliveredAt = Date.now();
      pm.currentLat = pm.receiverLat;
      pm.currentLng = pm.receiverLng;
    }

    sendTo(pm.senderId, { type: "pigeon_update", data: pm });
    sendTo(pm.receiverId, { type: "pigeon_update", data: pm });

    if (pm.progress >= 1) clearInterval(interval);
  }, 2000);
}
