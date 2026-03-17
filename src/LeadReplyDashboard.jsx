import React, { useEffect, useMemo, useState } from "react";

const sentimentMeta = {
  positive: { label: "Interested ↗", color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
  negative: { label: "Not Interested ↘", color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
  neutral: { label: "Neutral →", color: "#f59e0b", bg: "rgba(245,158,11,0.18)" },
  unknown: { label: "Needs Review ?", color: "#a855f7", bg: "rgba(168,85,247,0.16)" },
};

const sourceColor = (source) => {
  if (source === "Complero") return "#7c3aed";
  if (source === "Enosix") return "#2563eb";
  if (source === "Groundfog") return "#16a34a";
  if (source.startsWith("SL:")) return "#f59e0b";
  return "#71717a";
};

const timeAgo = (iso) => {
  if (!iso) return "Unknown";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export default function LeadReplyDashboard() {
  const [replies, setReplies] = useState([]);
  const [selectedReply, setSelectedReply] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);

  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      setWarnings([]);
      try {
        const results = await Promise.allSettled([
          fetch("/api/heyreach"),
          fetch("/api/smartlead"),
        ]);

        const merged = [];
        const nextWarnings = [];

        for (const [index, result] of results.entries()) {
          const sourceName = index === 0 ? "HeyReach" : "Smartlead";
          if (result.status !== "fulfilled") {
            nextWarnings.push(`${sourceName}: request failed`);
            continue;
          }

          const response = result.value;
          let payload = {};
          try {
            payload = await response.json();
          } catch {
            nextWarnings.push(`${sourceName}: invalid JSON response`);
            continue;
          }

          if (!response.ok) {
            nextWarnings.push(`${sourceName}: ${payload.error || `HTTP ${response.status}`}`);
            continue;
          }

          if (Array.isArray(payload.replies)) {
            merged.push(...payload.replies);
          }

          if (Array.isArray(payload.warnings) && payload.warnings.length > 0) {
            nextWarnings.push(...payload.warnings.map((w) => `${sourceName}: ${w}`));
          }
        }

        merged.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
        setReplies(merged);
        setSelectedReply(merged[0] || null);
        setWarnings(nextWarnings);

        if (!merged.length) {
          setError("No replies could be loaded from the available data sources.");
        }
      } catch (loadError) {
        setError(loadError.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const counts = useMemo(
    () =>
      replies.reduce(
        (acc, reply) => {
          acc.all += 1;
          acc[reply.sentiment] = (acc[reply.sentiment] || 0) + 1;
          return acc;
        },
        { all: 0, positive: 0, negative: 0, neutral: 0, unknown: 0 }
      ),
    [replies]
  );

  const filteredReplies = useMemo(() => {
    const query = search.toLowerCase().trim();
    return replies.filter((reply) => {
      if (sentimentFilter !== "all" && reply.sentiment !== sentimentFilter) return false;
      if (sourceFilter !== "all" && reply.source !== sourceFilter) return false;
      if (channelFilter !== "all" && reply.channel !== channelFilter) return false;
      if (!query) return true;

      const haystack = `${reply.lead?.name || ""} ${reply.lead?.company || ""} ${reply.lastMessageText || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [replies, search, sentimentFilter, sourceFilter, channelFilter]);

  const sources = useMemo(() => ["all", ...new Set(replies.map((reply) => reply.source))], [replies]);

  return (
    <div style={{ minHeight: "100vh", background: "#09090b", color: "#fafafa", fontFamily: "Inter, system-ui, sans-serif" }}>
      <header style={{ padding: "16px 20px", borderBottom: "1px solid #27272a", position: "sticky", top: 0, background: "#09090b" }}>
        <h1 style={{ margin: 0 }}>Lead Reply Dashboard</h1>
        <p style={{ margin: "4px 0 10px", color: "#a1a1aa" }}>HeyReach + Smartlead • {counts.all} replies</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["all", "positive", "negative", "neutral", "unknown"].map((key) => (
            <button
              key={key}
              onClick={() => setSentimentFilter(key)}
              style={{
                background: sentimentFilter === key ? "#7c3aed" : "#18181b",
                border: "1px solid #27272a",
                color: "#fff",
                borderRadius: 999,
                padding: "5px 10px",
                cursor: "pointer",
              }}
            >
              {key === "all" ? "All" : sentimentMeta[key].label} ({counts[key] || 0})
            </button>
          ))}
        </div>
      </header>

      {warnings.length > 0 && (
        <div style={{ margin: 12, border: "1px solid #854d0e", background: "#451a03", color: "#fcd34d", borderRadius: 8, padding: 10 }}>
          <strong>Data source warnings:</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
            {warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr 340px", minHeight: "calc(100vh - 120px)" }}>
        <aside style={{ borderRight: "1px solid #27272a", padding: 14 }}>
          <label style={{ fontSize: 12 }}>Source</label>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} style={{ width: "100%", marginTop: 4, marginBottom: 10, background: "#18181b", color: "#fff", border: "1px solid #27272a", borderRadius: 8, padding: 8 }}>
            {sources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>

          <label style={{ fontSize: 12 }}>Channel</label>
          <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} style={{ width: "100%", marginTop: 4, marginBottom: 10, background: "#18181b", color: "#fff", border: "1px solid #27272a", borderRadius: 8, padding: 8 }}>
            <option value="all">All</option>
            <option value="linkedin">LinkedIn</option>
            <option value="email">Email</option>
          </select>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, message"
            style={{ width: "100%", background: "#18181b", color: "#fff", border: "1px solid #27272a", borderRadius: 8, padding: 8 }}
          />
        </aside>

        <main style={{ borderRight: "1px solid #27272a", overflow: "auto" }}>
          {loading && <p style={{ padding: 12, color: "#a1a1aa" }}>Loading replies...</p>}
          {error && <p style={{ padding: 12, color: "#fca5a5" }}>{error}</p>}

          {filteredReplies.map((reply) => (
            <button
              key={reply.id}
              onClick={() => setSelectedReply(reply)}
              style={{
                width: "100%",
                textAlign: "left",
                background: selectedReply?.id === reply.id ? "#1e1b4b" : "#09090b",
                border: 0,
                borderBottom: "1px solid #27272a",
                color: "#fff",
                padding: 12,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#a1a1aa" }}>
                <span>{reply.lead?.name || "Unknown Lead"}</span>
                <span>{timeAgo(reply.lastMessageAt)}</span>
              </div>
              <div style={{ display: "flex", gap: 8, margin: "6px 0", flexWrap: "wrap" }}>
                <span style={{ padding: "2px 8px", borderRadius: 999, background: `${sourceColor(reply.source)}22`, color: sourceColor(reply.source), fontSize: 12 }}>{reply.source}</span>
                <span style={{ padding: "2px 8px", borderRadius: 999, background: reply.channel === "linkedin" ? "#1d4ed822" : "#b4530922", color: reply.channel === "linkedin" ? "#60a5fa" : "#fbbf24", fontSize: 12 }}>
                  {reply.channel === "linkedin" ? "🔗 LinkedIn" : "📧 Email"}
                </span>
                <span style={{ padding: "2px 8px", borderRadius: 999, background: sentimentMeta[reply.sentiment]?.bg || sentimentMeta.unknown.bg, color: sentimentMeta[reply.sentiment]?.color || sentimentMeta.unknown.color, fontSize: 12 }}>{sentimentMeta[reply.sentiment]?.label || sentimentMeta.unknown.label}</span>
              </div>
              <div style={{ fontSize: 13, color: "#d4d4d8" }}>{reply.lead?.company || "No company"}</div>
              <div style={{ marginTop: 5, fontSize: 13, color: "#a1a1aa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reply.lastMessageText || "(no message)"}</div>
            </button>
          ))}
        </main>

        <aside style={{ padding: 14, overflow: "auto" }}>
          {!selectedReply ? (
            <p style={{ color: "#a1a1aa" }}>Select a reply to view conversation.</p>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>{selectedReply.lead?.name || "Unknown Lead"}</h3>
              <p style={{ color: "#a1a1aa", marginTop: 0 }}>{selectedReply.lead?.company || "No company"}</p>
              <div style={{ border: "1px solid #27272a", borderRadius: 10, background: "#18181b", padding: 10, maxHeight: 450, overflow: "auto" }}>
                {(selectedReply.messages || []).map((message, index) => (
                  <div key={`${selectedReply.id}-${index}`} style={{ marginBottom: 8, textAlign: message.sender === "ME" ? "right" : "left" }}>
                    <div style={{ display: "inline-block", background: message.sender === "ME" ? "#312e81" : "#27272a", borderRadius: 8, padding: "8px 10px", maxWidth: "95%" }}>
                      <div style={{ fontSize: 13 }}>{message.body || "(empty)"}</div>
                      <div style={{ fontSize: 11, marginTop: 3, color: "#a1a1aa" }}>{new Date(message.at || Date.now()).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
