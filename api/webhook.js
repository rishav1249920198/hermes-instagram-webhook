/**
 * Instagram Business Graph API Webhook Handler for Vercel
 * Handles Meta Webhook Verification (GET) and Incoming Instagram DMs (POST).
 */

// Global in-memory log buffer for live debugging
global.recentLogs = global.recentLogs || [];
function logEvent(type, data) {
  try {
    global.recentLogs.unshift({ timestamp: new Date().toISOString(), type, data });
    if (global.recentLogs.length > 30) global.recentLogs.pop();
  } catch (e) {}
}

export default async function handler(req, res) {
  // Configured Verify Tokens (Accepts both rishav_hermes_2026 and rishav_hermes_insta_2026)
  const validTokens = [
    process.env.VERIFY_TOKEN,
    "rishav_hermes_2026",
    "rishav_hermes_insta_2026"
  ].filter(Boolean);
  const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || "";
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";

  // 0. HEALTH & LIVE LOGS ENDPOINT
  if (req.method === "GET" && req.query.status === "health") {
    return res.status(200).json({
      status: "online",
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

    console.log("[Instagram Webhook] Incoming GET Verification Request:", { mode, token, challenge });

    if (mode === "subscribe" && validTokens.includes(token)) {
      console.log("[Instagram Webhook] Verification SUCCESS! Responding with challenge:", challenge);
      // Meta requires HTTP 200 with the exact challenge value in the response body
      return res.status(200).send(challenge);
    } else {
      console.warn("[Instagram Webhook] Verification FAILED. Token mismatch:", { received: token, expected: validTokens });
      return res.status(403).json({ error: "Verification token mismatch" });
    }
  }

  // 2. INCOMING INSTAGRAM MESSAGES & EVENTS (POST)
  if (req.method === "POST") {
    const body = req.body;
    logEvent("INCOMING_POST", body);

    console.log("[Instagram Webhook] Incoming POST Event:", JSON.stringify(body, null, 2));

    // Confirm this is an event from Instagram or Page subscription
    if (body.object === "instagram" || body.object === "page") {
      try {
        const entries = body.entry || [];
        for (const entry of entries) {
          // Check messaging events (Direct Messages)
          const messagingEvents = entry.messaging || [];
          for (const event of messagingEvents) {
            const senderId = event.sender?.id;
            const message = event.message;

            // Ignore message echoes (messages sent by the bot itself)
            if (message && !message.is_echo && message.text) {
              const userText = message.text;
              console.log(`[Instagram DM Received] From Sender: ${senderId} | Message: "${userText}"`);

              // If Instagram Access Token is configured, generate and send an automated AI reply
              if (INSTAGRAM_ACCESS_TOKEN) {
                await handleAiReply(senderId, userText, INSTAGRAM_ACCESS_TOKEN, OPENROUTER_API_KEY);
              }
            }
          }
        }
      } catch (err) {
        console.error("[Instagram Webhook] Error processing event:", err);
      }

      // Meta requires a 200 OK response within 20 seconds to confirm delivery
      return res.status(200).json({ status: "EVENT_RECEIVED" });
    } else {
      return res.status(404).json({ error: "Unknown object type" });
    }
  }

  // Handle other HTTP methods
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}

/**
 * Generates an AI response and dispatches it back to the Instagram user via Meta Graph API
 */
async function handleAiReply(senderId, userText, accessToken, openRouterKey) {
  try {
    let replyText = "Namaste! Main Aman Sharma hoon (Senior Digital Consultant working with Rishav Kumar). Aapke message ke liye dhanyawad! Main aapki kya sahayata kar sakta hoon?";

    // Support OpenRouter or Gemini if provided
    if (openRouterKey) {
      try {
        const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openRouterKey}`,
            "HTTP-Referer": "https://hermes-instagram-webhook.vercel.app",
            "X-Title": "Hermes Instagram Assistant"
          },
          body: JSON.stringify({
            model: "google/gemini-2.0-flash-001",
            messages: [
              {
                role: "system",
                content: "You are Aman Sharma, Senior Digital Consultant working with Rishav Kumar. You respond politely, helpfully, and concisely in natural Hindi/Hinglish to business owners and clients on Instagram. Offer web development, digital growth, and agency solutions. Keep replies under 2-3 sentences. Never say you are an AI or bot."
              },
              {
                role: "user",
                content: userText
              }
            ],
            max_tokens: 250,
            temperature: 0.7
          })
        });

        if (aiResponse.ok) {
          const data = await aiResponse.json();
          replyText = data.choices?.[0]?.message?.content || replyText;
        }
      } catch (aiErr) {
        console.warn("[Instagram AI] LLM error, falling back to default reply:", aiErr.message);
      }
    } else {
      // Smart contextual fallback based on user message keywords
      const lower = userText.toLowerCase();
      if (lower.includes("price") || lower.includes("rate") || lower.includes("cost") || lower.includes("kitna")) {
        replyText = "Namaste! Hamare packages basic website ke liye ₹2,999 se start hote hain aur full stack dynamic business web portal ₹8,499 se shuru hota hai. Aapki requirement ke hisaab se best quote share kar dunga. Aapka kis cheez ka business hai?";
      } else if (lower.includes("demo") || lower.includes("portfolio") || lower.includes("work") || lower.includes("sample")) {
        replyText = "Namaste! Hamare live live projects aur portfolio dekhne ke liye aap hamare WhatsApp (+91-XXXXX) ya yahan DM par apna requirement share kar sakte hain, main turant live demo links bhej deta hoon.";
      } else if (lower.includes("hi") || lower.includes("hello") || lower.includes("hey") || lower.includes("namaste")) {
        replyText = "Namaste! Main Aman Sharma hoon (working with Rishav Kumar). Aapke message ke liye shukriya! Bataiye aapke business ya website requirement ke baare me kaise madad kar sakta hoon?";
      }
    }

    // Auto-detect Instagram Graph endpoint vs Facebook Graph endpoint based on token type
    // Instagram Login tokens (IGAA...) use graph.instagram.com, Facebook Page tokens use graph.facebook.com
    const graphEndpoint = accessToken.startsWith("EA")
      ? "https://graph.facebook.com/v21.0/me/messages"
      : "https://graph.instagram.com/v21.0/me/messages";

    const graphApiUrl = `${graphEndpoint}?access_token=${encodeURIComponent(accessToken)}`;
    const graphRes = await fetch(graphApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: senderId },
        message: { text: replyText }
      })
    });

    const graphData = await graphRes.json();
    console.log("[Instagram Reply Dispatched] Result:", graphData);
    logEvent("DISPATCH_RESULT", { status: graphRes.status, data: graphData, senderId, replyText });
  } catch (error) {
    console.error("[Instagram Dispatch Error]:", error);
    logEvent("DISPATCH_ERROR", { message: error.message, stack: error.stack });
  }
}
