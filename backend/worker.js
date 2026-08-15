// 🕊️ Carrier Pigeon v6.2 - With Ping/Pong Keepalive

const PIGEON_SPEED = 177;
const LOST_CHANCE = 0.002;
const SPEED_VARIANCE = 0.25;
const MAX_MSG_LEN = 2000;

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const users = new Map();
const msgs = [];
const conns = new Map();
const heartbeats = new Map();

let cleanupStarted = false;

function startCleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [uid, lastBeat] of heartbeats) {
      if (now - lastBeat > 35000) {
        conns.delete(uid);
        heartbeats.delete(uid);
        if (users.has(uid)) {
          users.get(uid).connected = false;
          broadcast({type: "user_offline", data: {userId: uid}});
        }
      }
    }
  }, 30000);
}

function sendTo(uid, m) {
  const w = conns.get(uid);
  if (w) try { w.send(JSON.stringify(m)); } catch {}
}

function broadcast(m, ex) {
  const d = JSON.stringify(m);
  for (const [id, w] of conns) {
    if (id !== ex) try { w.send(d); } catch {}
  }
}

function simulatePigeon(pm) {
  const iv = setInterval(() => {
    if (pm.status !== "inTransit") { clearInterval(iv); return; }
    if (Math.random() < LOST_CHANCE) {
      pm.status = "lost";
      sendTo(pm.senderId, {type:"pigeon_update",data:pm});
      sendTo(pm.receiverId, {type:"pigeon_update",data:pm});
      clearInterval(iv);
      return;
    }
    const sv = 1 - SPEED_VARIANCE + Math.random() * SPEED_VARIANCE * 2;
    pm.progress = Math.min(1, pm.progress + (pm.speedKmh * sv / 3600) * 2 / (pm.distanceKm || 1));
    pm.currentLat = pm.senderLat + (pm.receiverLat - pm.senderLat) * pm.progress;
    pm.currentLng = pm.senderLng + (pm.receiverLng - pm.senderLng) * pm.progress;
    pm.currentLat += Math.sin(pm.progress * Math.PI) * 0.05;
    if (pm.progress >= 1) {
      pm.status = "delivered";
      pm.deliveredAt = Date.now();
      pm.currentLat = pm.receiverLat;
      pm.currentLng = pm.receiverLng;
    }
    sendTo(pm.senderId, {type:"pigeon_update",data:pm});
    sendTo(pm.receiverId, {type:"pigeon_update",data:pm});
    if (pm.progress >= 1) clearInterval(iv);
  }, 2000);
}

export default {
  async fetch(request) {
    // Start cleanup timer on first request
    startCleanup();

    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    if (url.pathname === "/") {
      return Response.json({
        name: "🕊️ Carrier Pigeon",
        version: "6.2.0",
        ws: `wss://${url.host}/ws`,
        users: users.size,
        messages: msgs.length
      });
    }

    if (url.pathname === "/users") {
      return Response.json([...users.values()]);
    }

    if (url.pathname === "/messages") {
      return Response.json(msgs.slice(-100));
    }

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("WebSocket required", {status: 426});
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.accept();
      let myUserId = null;

      server.send(JSON.stringify({type: "connected", data: {time: Date.now()}}));

      server.addEventListener("message", (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === "ping") {
          if (myUserId) heartbeats.set(myUserId, Date.now());
          server.send(JSON.stringify({type: "pong", data: {time: Date.now()}}));
          return;
        }

        if (msg.type === "register") {
          const {userId: uid, name, avatar, lat, lng, city} = msg.data || {};
          if (!uid || !name) {
            server.send(JSON.stringify({type: "error", data: "userId and name required"}));
            return;
          }

          if (users.has(uid)) {
            conns.delete(uid);
            heartbeats.delete(uid);
          }

          myUserId = uid;
          users.set(uid, {
            id: uid, name, avatar: avatar || "🕊️",
            lat: lat || 0, lng: lng || 0, city: city || "", connected: true
          });
          conns.set(uid, server);
          heartbeats.set(uid, Date.now());

          server.send(JSON.stringify({
            type: "welcome",
            data: {
              user: users.get(uid),
              users: [...users.values()],
              messages: msgs.slice(-50)
            }
          }));
          broadcast({type: "user_online", data: users.get(uid)}, uid);

        } else if (msg.type === "send_message") {
          if (!myUserId) {
            server.send(JSON.stringify({type: "error", data: "Not registered"}));
            return;
          }
          const {receiverId, content} = msg.data || {};
          if (!receiverId || typeof content !== "string" || !content.length || content.length > MAX_MSG_LEN) {
            server.send(JSON.stringify({type: "error", data: `Invalid (1-${MAX_MSG_LEN})`}));
            return;
          }
          const s = users.get(myUserId), r = users.get(receiverId);
          if (!s || !r) {
            server.send(JSON.stringify({type: "error", data: "User not found"}));
            return;
          }
          const d = haversineDistance(s.lat, s.lng, r.lat, r.lng);
          const sv = 1 - SPEED_VARIANCE + Math.random() * SPEED_VARIANCE * 2;
          const pm = {
            id: crypto.randomUUID(), senderId: myUserId, receiverId, content,
            sentAt: Date.now(), deliveredAt: null, status: "inTransit",
            senderLat: s.lat, senderLng: s.lng, receiverLat: r.lat, receiverLng: r.lng,
            currentLat: s.lat, currentLng: s.lng,
            distanceKm: Math.round(d * 100) / 100, speedKmh: Math.round(PIGEON_SPEED * sv), progress: 0
          };
          msgs.push(pm);
          if (msgs.length > 500) msgs.splice(0, msgs.length - 500);
          sendTo(myUserId, {type: "new_message", data: pm});
          sendTo(receiverId, {type: "new_message", data: pm});
          simulatePigeon(pm);

        } else if (msg.type === "update_location") {
          if (!myUserId) return;
          const {lat, lng} = msg.data || {};
          if (typeof lat === "number" && typeof lng === "number" && users.has(myUserId)) {
            const u = users.get(myUserId);
            u.lat = lat;
            u.lng = lng;
          }
        }
      });

      server.addEventListener("close", () => {
        if (myUserId) {
          conns.delete(myUserId);
          heartbeats.delete(myUserId);
          if (users.has(myUserId)) {
            users.get(myUserId).connected = false;
            broadcast({type: "user_offline", data: {userId: myUserId}});
          }
        }
      });

      return new Response(null, {status: 101, webSocket: client});
    }

    return Response.json({error: "Not found"}, {status: 404});
  },
};
