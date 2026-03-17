const SMARTLEAD_BASE = "https://server.smartlead.ai/api/v1";

function classifySentiment(text = "", category = "") {
  const normalizedCategory = category.toLowerCase();
  if (normalizedCategory.includes("interested")) return "positive";
  if (normalizedCategory.includes("not interested") || normalizedCategory.includes("do not contact")) return "negative";
  if (normalizedCategory.includes("out of office") || normalizedCategory.includes("wrong")) return "neutral";

  const lower = text.toLowerCase();
  const negative = ["kein interesse", "not interested", "no interest", "nicht interessiert", "no thank", "kein bedarf"];
  const positive = ["yes", "ja", "interested", "interessant", "gerne", "meeting", "call", "let's talk"];
  const neutral = ["out of office", "wrong person", "stay in touch", "not attending", "abwesend"];

  if (negative.some((keyword) => lower.includes(keyword))) return "negative";
  if (positive.some((keyword) => lower.includes(keyword))) return "positive";
  if (neutral.some((keyword) => lower.includes(keyword))) return "neutral";
  return "unknown";
}

function normalizeMessages(messages = []) {
  return messages.map((message) => ({
    at: message.created_at || message.sent_at || new Date().toISOString(),
    body: message.body || message.message || "",
    sender: (message.sender_type || message.sender || "").toString().toUpperCase().includes("LEAD")
      ? "CORRESPONDENT"
      : "ME",
  }));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.SMARTLEAD_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ replies: [], warnings: ["Missing required environment variable: SMARTLEAD_API_KEY"] });
  }

  try {
    const [clientsResponse, campaignsResponse, inboxResponse] = await Promise.all([
      fetch(`${SMARTLEAD_BASE}/client/?api_key=${apiKey}`),
      fetch(`${SMARTLEAD_BASE}/campaigns?api_key=${apiKey}`),
      fetch(`${SMARTLEAD_BASE}/inbox/replies?api_key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset: 0, limit: 100 }),
      }),
    ]);

    if (!clientsResponse.ok) throw new Error(`Smartlead clients request failed with ${clientsResponse.status}`);
    if (!campaignsResponse.ok) throw new Error(`Smartlead campaigns request failed with ${campaignsResponse.status}`);
    if (!inboxResponse.ok) throw new Error(`Smartlead inbox request failed with ${inboxResponse.status}`);

    const [clients, campaigns, inboxPayload] = await Promise.all([
      clientsResponse.json(),
      campaignsResponse.json(),
      inboxResponse.json(),
    ]);

    const clientById = new Map((clients || []).map((client) => [String(client.id), client]));
    const campaignById = new Map((campaigns || []).map((campaign) => [String(campaign.id), campaign]));
    const inboxItems = Array.isArray(inboxPayload)
      ? inboxPayload
      : inboxPayload?.data || inboxPayload?.items || [];

    const replies = inboxItems.map((item, index) => {
      const campaignId = item.campaign_id || item.campaignId;
      const campaign = campaignById.get(String(campaignId || ""));
      const clientId = item.client_id || campaign?.client_id;
      const client = clientById.get(String(clientId || ""));
      const clientName = item.client_name || campaign?.client_name || client?.name || "Unknown Client";
      const messages = normalizeMessages(item.message_history || item.messages || []);
      const lastMessageText = item.reply_text || item.message || messages[messages.length - 1]?.body || "";

      return {
        id: `sl-${item.id || item.lead_id || index}`,
        source: `SL: ${clientName}`,
        channel: "email",
        lastMessageText,
        lastMessageAt: item.created_at || item.updated_at || messages[messages.length - 1]?.at || new Date().toISOString(),
        sentiment: classifySentiment(lastMessageText, item.category || item.lead_category || ""),
        lead: {
          name: `${item.first_name || item.lead_first_name || ""} ${item.last_name || item.lead_last_name || ""}`.trim() || item.email || "Unknown Lead",
          company: item.company_name || clientName,
        },
        messages,
      };
    });

    replies.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
    return res.status(200).json({ replies, warnings: [] });
  } catch (error) {
    return res.status(200).json({ replies: [], warnings: [error.message || "Failed to fetch Smartlead replies"] });
  }
}
