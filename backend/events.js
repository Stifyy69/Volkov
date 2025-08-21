// backend/events.js
import { Router } from "express";

const router = Router();

// Clienți SSE menținuți în memorie
let sseClients = [];

/**
 * GET /events
 * Conexiune Server‑Sent Events pentru update‑uri live.
 * Frontend: new EventSource("/events")
 */
router.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const client = { id: Date.now(), res };
  sseClients.push(client);

  // ping periodic pt. a ține conexiunea deschisă
  const keep = setInterval(() => {
    try { res.write(`event: ping\ndata: {}\n\n`); } catch {}
  }, 25000);

  req.on("close", () => {
    clearInterval(keep);
    sseClients = sseClients.filter((c) => c !== client);
  });
});

/** Trimite un eveniment tuturor clienților */
export function sseBroadcast(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload || {})}\n\n`;
  for (const c of sseClients) {
    try { c.res.write(data); } catch {}
  }
}

export default router;
