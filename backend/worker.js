// 🕊️ Carrier Pigeon v6.0 - DO with Hibernation WebSocket
// Tests: just accept WS and echo

export class MessengerDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // REST
    if (url.pathname === "/") return Response.json({ name: "🕊️ Carrier Pigeon", version: "6.0.0" });
    if (url.pathname === "/users") return Response.json([]);
    if (url.pathname === "/messages") return Response.json([]);

    // WebSocket
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket required", { status: 426 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }

  async webSocketMessage(ws, raw) {
    // Echo for now
    ws.send(JSON.stringify({ type: "echo", data: raw }));
  }

  async webSocketClose(ws, code, reason) {
    // Nothing
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
    const doId = env.MESSENGER.idFromName("main");
    return env.MESSENGER.get(doId).fetch(request);
  },
};
