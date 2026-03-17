const HEYREACH_BASE = "https://api.heyreach.io/api/public";

const accountDefinitions = [
  { env: "HEYREACH_API_KEY_1", name: "Complero" },
  { env: "HEYREACH_API_KEY_2", name: "Enosix" },
  { env: "HEYREACH_API_KEY_3", name: "Groundfog" },
];

function classifySentiment(text = "") {
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
    at: message.createdAt || new Date().toISOString(),
    body: message.body || "",
    sender: message.sender || "CORRESPONDENT",
  }));
}

async function fetchAccountReplies(account) {
  const apiKey = process.env[account.env];
  if (!apiKey) {
    throw new Error(`Missing required environment variable: ${account.env}`);
  }

  const response = await fetch(`${HEYREACH_BASE}/inbox/conversations?limit=100&offset=0`, {
    method: "GET",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HeyReach ${account.name} request failed with ${response.status}`);
  }

  const payload = await response.json();
  return (payload.items || [])
    .filter((item) => item.lastMessageSender === "CORRESPONDENT")
    .map((item) => ({
      id: `hr-${account.name}-${item.id}`,
      source: account.name,
      channel: "linkedin",
      lastMessageText: item.lastMessageText || "",
      lastMessageAt: item.lastMessageAt || new Date().toISOString(),
      sentiment: classifySentiment(item.lastMessageText || ""),
      lead: {
        name: `${item.correspondentProfile?.firstName || ""} ${item.correspondentProfile?.lastName || ""}`.trim() || "Unknown Lead",
        company: item.correspondentProfile?.companyName || "",
      },
      messages: normalizeMessages(item.messages || []),
    }));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const merged = [];
    for (const account of accountDefinitions) {
      const replies = await fetchAccountReplies(account);
      merged.push(...replies);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    merged.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
    return res.status(200).json({ replies: merged });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to fetch HeyReach replies" });
  }
}
