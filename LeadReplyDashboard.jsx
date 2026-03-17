import React, { useCallback, useEffect, useMemo, useState } from "react";

const HEYREACH_BASE = "https://api.heyreach.io/api/public";
const SMARTLEAD_BASE = "https://server.smartlead.ai/api/v1";
const SMARTLEAD_API_KEY = "e6956a9a-67e8-4745-86d2-12f681d5e32b_rpre0b2";

const heyreachAccounts = [
  { name: "Complero", apiKey: "gI02YUQI2z94QtOL1sHKbYchkNJRFTmPorKTFJM/BkE=", color: "#7c3aed" },
  { name: "Enosix", apiKey: "rw2wqHIw4/9u8Ab0vEyrJO5Icp6KwXm3C9E/UYzQU90=", color: "#2563eb" },
  { name: "Groundfog", apiKey: "UVL3w8I2Atl3KEO41FzG+46zNbbIu8sjTIDnBJw1egU=", color: "#16a34a" },
];

const sentimentMeta = {
  positive: { label: "Interested ↗", color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
  negative: { label: "Not Interested ↘", color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
  neutral: { label: "Neutral →", color: "#f59e0b", bg: "rgba(245,158,11,0.18)" },
  unknown: { label: "Needs Review ?", color: "#a855f7", bg: "rgba(168,85,247,0.16)" },
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function classifySentiment(text, smartleadCategory) {
  const category = (smartleadCategory || "").toLowerCase();
  if (category.includes("interested")) return "positive";
  if (category.includes("not interested") || category.includes("do not contact")) return "negative";
  if (category.includes("out of office") || category.includes("wrong") || category.includes("neutral")) return "neutral";

  if (!text) return "unknown";
  const lower = text.toLowerCase();

  const negative = ["kein interesse", "not interested", "no interest", "nicht interessiert", "nicht spannend", "nein, kein", "keine interesse", "no thank", "kein bedarf", "derzeit nicht interessiert"];
  const positive = ["ja", "yes", "interessant", "interested", "gerne", "klingt gut", "klingt interessant", "sounds good", "let's talk", "lass uns", "termin", "call", "meeting", "freue mich", "vorab ein", "more info", "mehr informationen"];
  const neutral = ["nicht dort", "not attending", "bin nicht", "leider nicht", "can't make", "kontakt bleiben", "stay in touch", "nicht anwesend", "leider kann ich nicht", "nicht mehr in dieser funktion", "nächste mal", "out of office", "abwesend"];

  if (negative.some((k) => lower.includes(k))) return "negative";
  if (positive.some((k) => lower.includes(k))) return "positive";
  if (neutral.some((k) => lower.includes(k))) return "neutral";
  return "unknown";
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const sourceColor = (source) => {
  if (source === "Complero") return "#7c3aed";
  if (source === "Enosix") return "#2563eb";
  if (source === "Groundfog") return "#16a34a";
  if (source.startsWith("SL:")) {
    const palette = ["#f59e0b", "#fb923c", "#f97316", "#fbbf24"];
    const idx = Math.abs(
      source.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
    ) % palette.length;
    return palette[idx];
  }
  return "#71717a";
};

export default function LeadReplyDashboard() {
  const [replies, setReplies] = useState([]);
  const [selectedReply, setSelectedReply] = useState(null);
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [smartleadClients, setSmartleadClients] = useState([]);
  const [smartleadConnected, setSmartleadConnected] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const fetchHeyreachConversations = useCallback(async (account) => {
    const res = await fetch(`${HEYREACH_BASE}/inbox/conversations?limit=100&offset=0`, {
      headers: { "X-API-KEY": account.apiKey },
    });
    if (!res.ok) throw new Error(`HeyReach ${account.name} failed: ${res.status}`);
    const data = await res.json();

    return (data.items || [])
      .filter((item) => item.lastMessageSender === "CORRESPONDENT")
      .map((item) => ({
        id: `hr-${account.name}-${item.id}`,
        source: account.name,
        channel: "linkedin",
        lastMessageAt: item.lastMessageAt,
        lastMessageText: item.lastMessageText || "",
        sentiment: classifySentiment(item.lastMessageText),
        lead: {
          firstName: item.correspondentProfile?.firstName || "",
          lastName: item.correspondentProfile?.lastName || "",
          headline: item.correspondentProfile?.headline || "",
          company: item.correspondentProfile?.companyName || "",
          email: null,
          profileUrl: item.correspondentProfile?.profileUrl || null,
          imageUrl: item.correspondentProfile?.imageUrl || null,
        },
        senderAccount: `${item.linkedInAccount?.firstName || ""} ${item.linkedInAccount?.lastName || ""}`.trim(),
        totalMessages: item.totalMessages || (item.messages || []).length,
        messages: (item.messages || []).map((m) => ({ at: m.createdAt, body: m.body, sender: m.sender })),
        campaignId: null,
        leadId: null,
        smartleadCategory: null,
      }));
  }, []);

  const fetchSmartleadReplies = useCallback(async () => {
    const clientsRes = await fetch(`${SMARTLEAD_BASE}/client/?api_key=${SMARTLEAD_API_KEY}`);
    if (!clientsRes.ok) throw new Error(`Smartlead clients failed: ${clientsRes.status}`);
    const clients = await clientsRes.json();
    setSmartleadClients(clients);

    const campaignsRes = await fetch(`${SMARTLEAD_BASE}/campaigns?api_key=${SMARTLEAD_API_KEY}`);
    if (!campaignsRes.ok) throw new Error(`Smartlead campaigns failed: ${campaignsRes.status}`);
    const campaigns = await campaignsRes.json();
    const campaignById = new Map((campaigns || []).map((c) => [String(c.id), c]));

    const inboxRes = await fetch(`${SMARTLEAD_BASE}/inbox/replies?api_key=${SMARTLEAD_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset: 0, limit: 100 }),
    });
    if (!inboxRes.ok) throw new Error(`Smartlead inbox failed: ${inboxRes.status}`);
    const inbox = await inboxRes.json();

    const items = Array.isArray(inbox) ? inbox : inbox?.data || inbox?.items || [];

    setSmartleadConnected(true);

    return items.map((r, idx) => {
      const campaignId = r.campaign_id || r.campaignId;
      const campaign = campaignById.get(String(campaignId || ""));
      const clientName = r.client_name || campaign?.client_name || "Unknown Client";
      const first = r.first_name || r.lead_first_name || "";
      const last = r.last_name || r.lead_last_name || "";
      const history = r.message_history || r.messages || [];
      const lastText = r.reply_text || r.message || history[history.length - 1]?.body || "";

      return {
        id: `sl-${r.id || r.lead_id || idx}`,
        source: `SL: ${clientName}`,
        channel: "email",
        lastMessageAt: r.created_at || r.updated_at || new Date().toISOString(),
        lastMessageText: lastText,
        sentiment: classifySentiment(lastText, r.category || r.lead_category),
        lead: {
          firstName: first,
          lastName: last,
          headline: r.title || r.job_title || "",
          company: r.company_name || campaign?.client_name || "",
          email: r.email || r.lead_email || null,
          profileUrl: null,
          imageUrl: null,
        },
        senderAccount: campaign?.from_email || "Smartlead",
        totalMessages: history.length || 1,
        messages: history.map((m) => ({
          at: m.created_at || m.sent_at || new Date().toISOString(),
          body: m.body || m.message || "",
          sender: (m.sender_type || m.sender || "").toUpperCase().includes("LEAD") ? "CORRESPONDENT" : "ME",
        })),
        campaignId: campaignId || null,
        leadId: r.lead_id || null,
        smartleadCategory: r.category || r.lead_category || null,
      };
    });
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const combined = [];
      for (const account of heyreachAccounts) {
        combined.push(...(await fetchHeyreachConversations(account)));
        await delay(250);
      }
      await delay(350);
      combined.push(...(await fetchSmartleadReplies()));
      combined.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
      setReplies(combined);
      setSelectedReply((prev) => prev || combined[0] || null);
    } catch (e) {
      setError(`${e.message}. If this is a browser CORS error, route API calls through a backend proxy.`);
    } finally {
      setLoading(false);
    }
  }, [fetchHeyreachConversations, fetchSmartleadReplies]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const filtered = useMemo(() => {
    return replies.filter((r) => {
      if (sentimentFilter !== "all" && r.sentiment !== sentimentFilter) return false;
      if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
      if (channelFilter !== "all" && r.channel !== channelFilter) return false;
      const q = search.toLowerCase().trim();
      if (!q) return true;
      const blob = `${r.lead.firstName} ${r.lead.lastName} ${r.lead.company} ${r.lastMessageText}`.toLowerCase();
      return blob.includes(q);
    });
  }, [replies, sentimentFilter, sourceFilter, channelFilter, search]);

  const counts = useMemo(() => replies.reduce((acc, r) => ({ ...acc, [r.sentiment]: (acc[r.sentiment] || 0) + 1, all: acc.all + 1 }), { all: 0, positive: 0, negative: 0, neutral: 0, unknown: 0 }), [replies]);
  const sources = useMemo(() => ["all", ...Array.from(new Set(replies.map((r) => r.source)))], [replies]);

  const handleSuggest = useCallback(async () => {
    if (!selectedReply) return;
    setAiLoading(true);
    setAiText("");
    try {
      const conversationHistory = selectedReply.messages
        .map((m) => `[${new Date(m.at).toLocaleString()}] ${m.sender}: ${m.body}`)
        .join("\n");

      const prompt = `You are an expert B2B sales assistant. Generate a suggested response.\n\nLEAD: ${selectedReply.lead.firstName} ${selectedReply.lead.lastName} (${selectedReply.lead.headline} @ ${selectedReply.lead.company})\nSOURCE: ${selectedReply.source} (${selectedReply.channel === "linkedin" ? "LinkedIn" : "Email"})\nSENTIMENT: ${selectedReply.sentiment}\nTHEIR LAST MESSAGE: "${selectedReply.lastMessageText}"\nFULL CONVERSATION HISTORY:\n${conversationHistory}\n\nINSTRUCTIONS:\n- If negative/not interested: Be gracious, thank them, leave door open (2-3 sentences max)\n- If neutral (wrong person, unavailable): Politely ask for referral or future timing\n- If positive/interested: Propose specific next step (call/meeting/send info)\n- If unknown: Ask a clarifying follow-up question\n- Match their language (German if German, English if English)\n- For email replies: include a subject line\n- For LinkedIn replies: keep it conversational\n- Be concise and natural\n- Return ONLY the message text`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`AI request failed: ${res.status}`);
      const data = await res.json();
      const text = data?.content?.map((c) => c.text).join("\n") || "No suggestion returned.";
      setAiText(text);
    } catch (e) {
      setAiText(`Could not generate suggestion: ${e.message}`);
    } finally {
      setAiLoading(false);
    }
  }, [selectedReply]);

  return (
    <div style={{ background: "#09090b", color: "#fafafa", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@500&display=swap');
      .fade-in { animation: fadeIn .25s ease both; }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: translateY(0);} }
      .pulse { animation: pulse 1.3s infinite; }
      @keyframes pulse { 0% {opacity:.5} 50% {opacity:1} 100% {opacity:.5} }
      `}</style>

      <header style={{ padding: "16px 24px", borderBottom: "1px solid #27272a", position: "sticky", top: 0, background: "#09090b", zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>Lead Reply Dashboard</h1>
            <div style={{ color: "#a1a1aa", fontSize: 14 }}>HeyReach + Smartlead • {counts.all} replies • AI-Powered</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["all", "positive", "negative", "neutral", "unknown"].map((key) => (
              <button key={key} onClick={() => setSentimentFilter(key)} style={{ border: "1px solid #27272a", background: sentimentFilter === key ? "#7c3aed" : "#18181b", color: "#fff", borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}>
                {(key === "all" ? "All" : sentimentMeta[key].label)} ({counts[key] || 0})
              </button>
            ))}
          </div>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr 380px", minHeight: "calc(100vh - 82px)" }}>
        <aside style={{ borderRight: "1px solid #27272a", padding: 14 }}>
          <label style={{ fontSize: 12, color: "#a1a1aa" }}>Source</label>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} style={{ width: "100%", marginTop: 4, marginBottom: 12, background: "#18181b", color: "#fff", border: "1px solid #27272a", borderRadius: 8, padding: 8 }}>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <label style={{ fontSize: 12, color: "#a1a1aa" }}>Channel</label>
          <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} style={{ width: "100%", marginTop: 4, marginBottom: 12, background: "#18181b", color: "#fff", border: "1px solid #27272a", borderRadius: 8, padding: 8 }}>
            <option value="all">All</option>
            <option value="linkedin">LinkedIn</option>
            <option value="email">Email</option>
          </select>

          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, company, message" style={{ width: "100%", background: "#18181b", color: "#fff", border: "1px solid #27272a", borderRadius: 8, padding: 8, marginBottom: 14 }} />

          {Object.keys(sentimentMeta).map((key) => (
            <div key={key} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: sentimentMeta[key].color }}>{sentimentMeta[key].label}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{counts[key] || 0}</span>
              </div>
              <div style={{ height: 7, background: "#27272a", borderRadius: 999 }}>
                <div style={{ width: `${counts.all ? (counts[key] / counts.all) * 100 : 0}%`, height: "100%", background: sentimentMeta[key].color, borderRadius: 999 }} />
              </div>
            </div>
          ))}

          <div style={{ marginTop: 16, border: "1px solid #27272a", borderRadius: 8, padding: 10, background: "#18181b" }}>
            <div style={{ fontSize: 12, color: "#a1a1aa" }}>Smartlead</div>
            <div style={{ color: smartleadConnected ? "#22c55e" : "#f59e0b", fontSize: 13 }}>{smartleadConnected ? "Connected" : "Not connected"}</div>
            <div style={{ fontSize: 12, color: "#d4d4d8" }}>{smartleadClients.length} client(s)</div>
          </div>
        </aside>

        <main style={{ overflow: "auto", borderRight: "1px solid #27272a" }}>
          {loading && <div className="pulse" style={{ padding: 16, color: "#a1a1aa" }}>Loading replies...</div>}
          {error && <div style={{ margin: 12, border: "1px solid #7f1d1d", color: "#fecaca", background: "#450a0a", padding: 10, borderRadius: 8 }}>{error}</div>}

          {filtered.map((r) => {
            const active = selectedReply?.id === r.id;
            return (
              <button key={r.id} className="fade-in" onClick={() => setSelectedReply(r)} style={{ textAlign: "left", display: "block", width: "100%", border: 0, borderBottom: "1px solid #27272a", background: active ? "#1e1b4b" : "#09090b", color: "inherit", padding: 12, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {r.lead.imageUrl ? <img src={r.lead.imageUrl} alt="avatar" style={{ width: 30, height: 30, borderRadius: "50%" }} /> : <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#3f3f46", display: "grid", placeItems: "center", fontSize: 12 }}>{(r.lead.firstName || "?")[0]}</div>}
                    <div style={{ fontWeight: 600 }}>{r.lead.firstName} {r.lead.lastName}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "#a1a1aa" }}>{timeAgo(r.lastMessageAt)}</div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{ padding: "2px 8px", background: `${sourceColor(r.source)}22`, color: sourceColor(r.source), borderRadius: 999, fontSize: 12 }}>{r.source}</span>
                  <span style={{ padding: "2px 8px", background: r.channel === "linkedin" ? "#1d4ed822" : "#b4530922", color: r.channel === "linkedin" ? "#60a5fa" : "#fbbf24", borderRadius: 999, fontSize: 12 }}>{r.channel === "linkedin" ? "🔗 LinkedIn" : "📧 Email"}</span>
                  <span style={{ padding: "2px 8px", background: sentimentMeta[r.sentiment].bg, color: sentimentMeta[r.sentiment].color, borderRadius: 999, fontSize: 12 }}>{sentimentMeta[r.sentiment].label}</span>
                </div>

                <div style={{ fontSize: 13, color: "#d4d4d8" }}>{r.lead.headline} {r.lead.company ? `• ${r.lead.company}` : ""}</div>
                <div style={{ marginTop: 6, color: "#a1a1aa", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.lastMessageText}</div>
                <div style={{ marginTop: 6, color: "#71717a", fontSize: 12 }}>{r.totalMessages} messages</div>
              </button>
            );
          })}
        </main>

        <aside style={{ padding: 16, overflow: "auto" }}>
          {!selectedReply ? <div style={{ color: "#a1a1aa" }}>Select a reply to view conversation.</div> : (
            <div>
              <h3 style={{ marginTop: 0 }}>{selectedReply.lead.firstName} {selectedReply.lead.lastName}</h3>
              <div style={{ color: "#a1a1aa", fontSize: 13 }}>{selectedReply.lead.headline} {selectedReply.lead.company && `@ ${selectedReply.lead.company}`}</div>
              {selectedReply.lead.email && <div style={{ color: "#d4d4d8", fontSize: 13 }}>{selectedReply.lead.email}</div>}
              {selectedReply.lead.profileUrl && <a href={selectedReply.lead.profileUrl} target="_blank" rel="noreferrer" style={{ color: "#60a5fa", fontSize: 13 }}>LinkedIn Profile</a>}

              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ padding: "3px 10px", background: `${sourceColor(selectedReply.source)}22`, borderRadius: 999 }}>{selectedReply.source}</span>
                <span style={{ padding: "3px 10px", background: "#27272a", borderRadius: 999 }}>{selectedReply.channel === "linkedin" ? "🔗 LinkedIn" : "📧 Email"}</span>
                <span style={{ padding: "3px 10px", background: sentimentMeta[selectedReply.sentiment].bg, color: sentimentMeta[selectedReply.sentiment].color, borderRadius: 999 }}>{sentimentMeta[selectedReply.sentiment].label}</span>
              </div>

              <div style={{ marginTop: 14, border: "1px solid #27272a", background: "#18181b", borderRadius: 10, maxHeight: 320, overflow: "auto", padding: 10 }}>
                {selectedReply.messages.map((m, i) => (
                  <div key={i} style={{ marginBottom: 8, textAlign: m.sender === "ME" ? "right" : "left" }}>
                    <div style={{ display: "inline-block", padding: "8px 10px", borderRadius: 10, maxWidth: "92%", background: m.sender === "ME" ? "#312e81" : "#27272a" }}>
                      <div style={{ fontSize: 13 }}>{m.body || "(empty)"}</div>
                      <div style={{ marginTop: 4, fontSize: 11, color: "#a1a1aa" }}>{new Date(m.at).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={handleSuggest} disabled={aiLoading} style={{ marginTop: 12, width: "100%", background: "#7c3aed", border: 0, borderRadius: 10, color: "white", padding: "10px 12px", cursor: "pointer" }}>{aiLoading ? "Thinking..." : "✨ Suggest AI Response"}</button>

              {aiText && (
                <div style={{ marginTop: 12, border: "1px solid #27272a", borderRadius: 10, background: "#18181b", padding: 10 }}>
                  <div style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "#f4f4f5" }}>{aiText}</div>
                  <button onClick={() => navigator.clipboard.writeText(aiText)} style={{ marginTop: 10, background: "#27272a", border: "1px solid #3f3f46", color: "#fff", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>Copy</button>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
