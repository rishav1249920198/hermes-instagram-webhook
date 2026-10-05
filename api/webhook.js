/**
 * Instagram Business Graph API Webhook Handler for Vercel
 * Handles Meta Webhook Verification (GET) and Acknowledges Incoming Events (POST).
 * Full conversational intelligence, tools, and session management are handled
 * natively by Hermes Agent Gateway on the Azure VM.
 */

// Global in-memory log buffer for live debugging
global.recentLogs = global.recentLogs || [];

function logEvent(type, data) {
  try {
    global.recentLogs.unshift({ timestamp: new Date().toISOString(), type, data });
    if (global.recentLogs.length > 50) global.recentLogs.pop();
  } catch (e) {}
}

export default async function handler(req, res) {
  const validTokens = [
    process.env.VERIFY_TOKEN,
    "rishav_hermes_2026",
    "rishav_hermes_insta_2026"
  ].filter(Boolean);

  const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || "";

  // 0. HEALTH & LIVE LOGS ENDPOINT
  if (req.method === "GET" && req.query.status === "health") {
    return res.status(200).json({
      status: "online",
      engine: "hermes-gateway-native",
      token_configured: Boolean(INSTAGRAM_ACCESS_TOKEN),
      token_preview: INSTAGRAM_ACCESS_TOKEN ? `${INSTAGRAM_ACCESS_TOKEN.substring(0, 6)}...` : "missing",
      timestamp: new Date().toISOString()
    });
  }

  if (req.method === "GET" && req.query.status === "logs") {
    return res.status(200).json({
      total: (global.recentLogs || []).length,
      logs: global.recentLogs || []
    });
  }

  // 1. META WEBHOOK VERIFICATION (GET Handshake)
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log("[Instagram Webhook] Verification Request:", { mode, token, challenge });

    if (mode === "subscribe" && validTokens.includes(token)) {
      console.log("[Instagram Webhook] Verification SUCCESS!");
      return res.status(200).send(challenge);
    } else {
      console.warn("[Instagram Webhook] Verification FAILED:", { received: token, expected: validTokens });
      return res.status(403).json({ error: "Verification token mismatch" });
    }
  }

  // 2. INCOMING INSTAGRAM MESSAGES & EVENTS (POST)
  if (req.method === "POST") {
    const body = req.body;
    logEvent("INCOMING_POST", body);

    console.log("[Instagram Webhook] Incoming POST Event:", JSON.stringify(body, null, 2));

    // Meta requires HTTP 200 response within 20s to acknowledge receipt
    return res.status(200).json({ status: "EVENT_RECEIVED" });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
