/**
 * Instagram Business Graph API Webhook Handler for Vercel
 * Handles Meta Webhook Verification (GET) and Incoming Instagram DMs (POST) with Multi-Turn AI.
 */

// Global in-memory log buffer for live debugging
global.recentLogs = global.recentLogs || [];
global.processedMessageIds = global.processedMessageIds || new Set();
global.conversationMemory = global.conversationMemory || {};

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
  const DEFAULT_OR_B64 = "c2stb3ItdjEtOWNiZTRjN2JiYjNiYzQyOGRiYjFjMDRiMWRlNTU2NDJiYzMzODFjN2U4NTQyNDgxMDU4MGUzMmU1NWYzN2RkZQ==";
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || Buffer.from(DEFAULT_OR_B64, "base64").toString("utf-8");

  // 0. HEALTH & LIVE LOGS ENDPOINT
  if (req.method === "GET" && req.query.status === "health") {
    return res.status(200).json({
      status: "online",
      token_configured: Boolean(INSTAGRAM_ACCESS_TOKEN),
      token_preview: INSTAGRAM_ACCESS_TOKEN ? `${INSTAGRAM_ACCESS_TOKEN.substring(0, 6)}...` : "missing",
      openrouter_configured: Boolean(OPENROUTER_API_KEY),
      active_conversations: Object.keys(global.conversationMemory).length,
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

    if (body.object === "instagram" || body.object === "page") {
      try {
        const entries = body.entry || [];
        for (const entry of entries) {
          const messagingEvents = entry.messaging || [];
          for (const event of messagingEvents) {
            const senderId = event.sender?.id;
            const message = event.message;
            const msgId = message?.mid || message?.id;

            // Ignore echoes and already processed message IDs
            if (message && !message.is_echo && message.text) {
              if (msgId && global.processedMessageIds.has(msgId)) {
                console.log(`[Instagram DM] Skipping duplicate msgId ${msgId}`);
                continue;
              }
              if (msgId) {
                global.processedMessageIds.add(msgId);
                // Keep set bounded
                if (global.processedMessageIds.size > 2000) {
                  const arr = Array.from(global.processedMessageIds);
                  global.processedMessageIds = new Set(arr.slice(-1000));
                }
              }

              const userText = message.text;
              console.log(`[Instagram DM Received] From ${senderId}: "${userText}"`);

              if (INSTAGRAM_ACCESS_TOKEN) {
                await handleAiReply(senderId, userText, INSTAGRAM_ACCESS_TOKEN, OPENROUTER_API_KEY);
              }
            }
          }
        }
      } catch (err) {
        console.error("[Instagram Webhook] Error processing event:", err);
      }

      // Meta requires HTTP 200 response
      return res.status(200).json({ status: "EVENT_RECEIVED" });
    } else {
      return res.status(404).json({ error: "Unknown object type" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}

/**
 * Generates an AI response and dispatches it back to the Instagram user via Meta Graph API
 */
async function handleAiReply(senderId, userText, accessToken, openRouterKey) {
  try {
    // 1. Maintain multi-turn conversation memory per user
    if (!global.conversationMemory[senderId]) {
      global.conversationMemory[senderId] = [];
    }
    const history = global.conversationMemory[senderId];
    history.push({ role: "user", content: userText });
    if (history.length > 10) history.shift();

    const isFirstTurn = history.length <= 1;

    const systemPrompt = `You are Aman Sharma, Senior Digital Consultant working with Rishav Kumar (@itz_rishav_editz).
You handle Instagram Direct Messages with clients and business owners inquiring about web development and agency services.

CORE RULES:
- Language & Tone: Speak natural, warm, polite, and confident Hindi/Hinglish (mix of casual Hindi and English).
- Identity: You are a real senior consultant on Rishav's team. NEVER say you are an AI, bot, or virtual assistant.
- Length: Keep responses concise (1 to 3 sentences maximum). Instagram DMs need to be fast and readable.

OFFICIAL PRICING PACKAGES:
- Plan 1 (Frontend / Business Website): ₹2,999 to ₹4,499. Modern responsive design, mobile-first, domain & hosting guidance, high-speed performance.
- Plan 2 (Full Stack Web Portal + Dashboard): ₹8,499 to ₹12,499. Custom admin dashboard, secure mobile PIN login, database, WhatsApp API / payment integration, and client management.
- Bargaining / Discount: If they negotiate or hesitate, you can offer a special close at ₹3,499 for Plan 1 or ₹9,999 for Plan 2 if they confirm soon.

CONVERSATION FLOW:
${isFirstTurn ? '- This is their FIRST message. Greet them warmly: "Namaste! Main Aman Sharma hoon (working with Rishav Kumar). Aapke business ya website requirement ke baare me bataiye, main kaise help kar sakta hoon?"' : '- This is an ONGOING conversation. DO NOT repeat your name or introduction! Directly answer their question or follow up.'}
- If they ask for demos, portfolio, or past work: Mention that you have built portals for retail, clinics, fashion stores, and schools, and offer to share live demo links or discuss over WhatsApp.
- If they want to talk to Rishav directly: Say "Haan bilkul, main Rishav ji ko aapka message convey kar deta hoon. Aap apna contact number ya business requirement share kar dijiye, woh aapse jald connect karenge."
- Always end with a short engaging question to guide the deal.`;

    let replyText = "";
    const modelsToTry = [
      "inclusionai/ling-3.0-flash-sante:free",
      "qwen/qwen3.8-27b:free",
      "nvidia/nemotron-3.5-lightning:free"
    ];

    for (const model of modelsToTry) {
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
            model: model,
            messages: [
              { role: "system", content: systemPrompt },
              ...history
            ],
            max_tokens: 220,
            temperature: 0.7
          })
        });

        if (aiResponse.ok) {
          const data = await aiResponse.json();
          const generated = data.choices?.[0]?.message?.content?.trim();
          if (generated) {
            replyText = generated;
            break;
          }
        } else {
          const errData = await aiResponse.json().catch(() => ({}));
          console.warn(`[Instagram AI] Model ${model} failed:`, errData);
        }
      } catch (err) {
        console.warn(`[Instagram AI] Exception with model ${model}:`, err.message);
      }
    }

    // Dynamic contextual fallback if all LLMs are temporarily unreachable
    if (!replyText) {
      const lower = userText.toLowerCase();
      if (lower.includes("price") || lower.includes("rate") || lower.includes("cost") || lower.includes("kitna") || lower.includes("rupaye") || lower.includes("charge")) {
        replyText = "Hamare packages basic frontend website ke liye ₹2,999 se ₹4,499 tak hain, aur full-stack business portal with dashboard ₹8,499 se ₹12,499 tak hai. Aapko kis type ki website banwani hai?";
      } else if (lower.includes("demo") || lower.includes("portfolio") || lower.includes("sample") || lower.includes("work")) {
        replyText = "Humne healthcare, retail stores aur education ke liye kai dynamic web portals banaye hain. Aapka kis category ka business hai, main relevant demo link share kar deta hoon?";
      } else if (lower.includes("rishav") || lower.includes("owner") || lower.includes("call") || lower.includes("number")) {
        replyText = "Main Rishav ji ko aapka message convey kar deta hoon. Aap apna contact number ya business name share kar dijiye, hum turant aapse connect karenge.";
      } else if (isFirstTurn) {
        replyText = "Namaste! Main Aman Sharma hoon (working with Rishav Kumar). Aapke business ya website requirement ke baare me bataiye, main kaise help kar sakta hoon?";
      } else {
        replyText = "Ji bilkul! Aap thoda detail me batayein ki aapko website me kaun-kaun se features chahiye, taaki main aapko exact solution aur timeline suggest kar sakoon.";
      }
    }

    // Record bot response in conversation history
    history.push({ role: "assistant", content: replyText });
    if (history.length > 10) history.shift();

    // Dispatch via Meta Graph API v21.0
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
    console.log(`[Instagram Reply Sent] To ${senderId}: "${replyText}" | Result:`, graphData);
    logEvent("DISPATCH_RESULT", { status: graphRes.status, data: graphData, senderId, replyText });
  } catch (error) {
    console.error("[Instagram Dispatch Error]:", error);
    logEvent("DISPATCH_ERROR", { message: error.message, stack: error.stack });
  }
}
