import { DurableObject } from "cloudflare:workers";
import { PigeonMessage, User, WSMessage } from "./types";
import { createPigeonMessage, updatePigeon, haversineDistance } from "./pigeon";

// ============ Messenger Durable Object ============
export class MessengerDO extends DurableObject {
  private connections: Map<string, WebSocket> = new Map();
  private users: Map<string, User> = new Map();
  private messages: PigeonMessage[] = [];
  private pigeonInterval: number | null = null;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.ctx.acceptWebSocket(server);

      return new Response(null, { status: 101, webSocket: client });
    }

    // REST: Get all messages
    if (url.pathname === "/messages" && request.method === "GET") {
      return Response.json(this.messages);
    }

    // REST: Get all users
    if (url.pathname === "/users" && request.method === "GET") {
      return Response.json(Array.from(this.users.values()));
    }

    return new Response("Carrier Pigeon API 🕊️", { status: 200 });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    try {
      const msg: WSMessage = JSON.parse(raw as string);
      await this.handleMessage(ws, msg);
    } catch (e) {
      ws.send(JSON.stringify({ type: "error", data: "Invalid message" }));
    }
  }

  async webSocketClose(ws: WebSocket) {
    // Find and remove disconnected user
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

  private async handleMessage(ws: WebSocket, msg: WSMessage) {
    switch (msg.type) {
      case "register": {
        const { userId, name, avatar, lat, lng, city } = msg.data;
        const user: User = {
          id: userId,
          name,
          avatar: avatar || "🕊️",
          lat: lat || 0,
          lng: lng || 0,
          city: city || "",
          connected: true,
        };
        this.users.set(userId, user);
        this.connections.set(userId, ws);

        // Send current state to new user
        ws.send(JSON.stringify({
          type: "welcome",
          data: {
            user,
            users: Array.from(this.users.values()),
            messages: this.messages,
          },
        }));

        // Broadcast new user
        this.broadcast({ type: "user_online", data: user }, userId);
        break;
      }

      case "send_message": {
        const { senderId, receiverId, content } = msg.data;
        const sender = this.users.get(senderId);
        const receiver = this.users.get(receiverId);
        if (!sender || !receiver) {
          ws.send(JSON.stringify({ type: "error", data: "User not found" }));
          return;
        }

        const pigeonMsg = createPigeonMessage(
          senderId, receiverId, content,
          sender.lat, sender.lng,
          receiver.lat, receiver.lng
        );

        this.messages.push(pigeonMsg);

        // Send to both sender and receiver
        this.sendTo(senderId, { type: "new_message", data: pigeonMsg });
        this.sendTo(receiverId, { type: "new_message", data: pigeonMsg });

        // Start pigeon simulation if not running
        this.startPigeonSimulation();
        break;
      }

      case "update_location": {
        const { userId, lat, lng } = msg.data;
        const user = this.users.get(userId);
        if (user) {
          user.lat = lat;
          user.lng = lng;
          this.broadcast({ type: "location_update", data: { userId, lat, lng } });
        }
        break;
      }

      case "ping": {
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      }
    }
  }

  private startPigeonSimulation() {
    if (this.pigeonInterval) return;

    this.pigeonInterval = this.ctx.setInterval(() => {
      let hasFlying = false;

      for (const msg of this.messages) {
        if (msg.status === "inTransit") {
          updatePigeon(msg);
          hasFlying = true;

          // Notify sender and receiver
          this.sendTo(msg.senderId, { type: "pigeon_update", data: msg });
          this.sendTo(msg.receiverId, { type: "pigeon_update", data: msg });
        }
      }

      if (!hasFlying && this.pigeonInterval) {
        this.ctx.clearInterval(this.pigeonInterval);
        this.pigeonInterval = null;
      }
    }, 2000);
  }

  private broadcast(msg: WSMessage, excludeId?: string) {
    const data = JSON.stringify(msg);
    for (const [userId, ws] of this.connections) {
      if (userId !== excludeId) {
        try { ws.send(data); } catch {}
      }
    }
  }

  private sendTo(userId: string, msg: WSMessage) {
    const ws = this.connections.get(userId);
    if (ws) {
      try { ws.send(JSON.stringify(msg)); } catch {}
    }
  }
}

// ============ Main Worker ============
export interface Env {
  MESSENGER: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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

    // Health check
    if (url.pathname === "/") {
      return Response.json({
        name: "🕊️ Carrier Pigeon API",
        version: "1.0.0",
        ws: `wss://${url.host}/ws`,
      });
    }

    // WebSocket or API proxy to Durable Object
    const doId = env.MESSENGER.idFromName("main");
    const stub = env.MESSENGER.get(doId);
    return stub.fetch(request);
  },
};
