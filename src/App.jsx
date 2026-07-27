import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Plus, Trash2, Paperclip, Send, X, FileText, Image as ImageIcon,
  Search, Pencil, Check, Copy, RotateCcw, PanelLeftClose, PanelLeft,
  TerminalSquare, Globe, ChevronDown,
} from "lucide-react";

const C = {
  bg: "#0B0B0D",
  panel: "#111114",
  panel2: "#17171B",
  border: "#232327",
  borderStrong: "#313136",
  text: "#EDEDEF",
  textSec: "#A0A0A8",
  textTer: "#68686F",
  accent: "#4F7CFF",
  accentDim: "rgba(79,124,255,0.14)",
  danger: "#F85149",
  code: "#0A0A0C",
};

// Model lists change often — check each provider's docs if one of these
// stops working and update the id here.
const PROVIDERS = {
  anthropic: {
    label: "Claude",
    models: [
      { id: "claude-sonnet-5", label: "Sonnet 5" },
      { id: "claude-opus-4-8", label: "Opus 4.8" },
      { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
    ],
  },
  openai: {
    label: "ChatGPT",
    models: [
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
      { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
    ],
  },
  google: {
    label: "Gemini",
    models: [
      { id: "gemini-3.5-flash", label: "3.5 Flash" },
      { id: "gemini-3.1-pro-preview", label: "3.1 Pro" },
    ],
  },
};

const SUGGESTIONS = [
  { title: "Build a web app", body: "Describe an app idea and get working code" },
  { title: "Make a simple game", body: "A browser game concept, built step by step" },
  { title: "Design a website", body: "Landing page copy, layout, and code" },
  { title: "Debug my code", body: "Paste an error or snippet for a fix" },
];

const SYSTEM_PROMPT =
  "You are Genius AI, a helpful assistant focused on doing genuinely useful, high-quality work for the person you're talking to. You're especially strong at writing clean, complete, working code for apps, games, and websites, and at explaining it clearly. When a web search tool is available to you, use it for anything time-sensitive or unfamiliar rather than guessing; if it isn't available, answer from what you know and say so if you're unsure. Give direct, complete answers. Formatting rules for code: briefly state your approach in a sentence or two before the code, not after. Put each file in its own fenced code block labeled ```language:filename.ext (e.g. ```jsx:App.jsx), never combine multiple files in one block. Keep prose outside code blocks short — a line per file is enough — and don't restate the code in words. After the code, add a short 'How to run it' note only if setup steps are actually needed. Be honest about what is and isn't possible rather than overpromising.";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function loadLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function saveLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // storage unavailable (private browsing, quota, etc.) — app still works for this session
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsText(file);
  });
}

function timeLabel(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function copyToClipboard(text) {
  try {
    navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e2) {}
    document.body.removeChild(ta);
  }
}

/* ---------- lightweight markdown rendering ---------- */

function renderInline(str, keyPrefix) {
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let m;
  let i = 0;
  while ((m = regex.exec(str))) {
    if (m.index > lastIndex) parts.push(str.slice(lastIndex, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={`${keyPrefix}-${i++}`}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(
        <code
          key={`${keyPrefix}-${i++}`}
          style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 5px", fontFamily: "JetBrains Mono, monospace", fontSize: "0.87em" }}
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = m.index + token.length;
  }
  if (lastIndex < str.length) parts.push(str.slice(lastIndex));
  return parts;
}

function renderTextBlock(text, keyPrefix) {
  const lines = text.split("\n");
  const elements = [];
  let listBuffer = [];
  let listType = null;
  let paraBuffer = [];

  const flushPara = () => {
    if (paraBuffer.length) {
      elements.push(
        <p key={`${keyPrefix}-p-${elements.length}`} className="leading-relaxed" style={{ margin: "0 0 10px 0" }}>
          {renderInline(paraBuffer.join(" "), `${keyPrefix}-p-${elements.length}`)}
        </p>
      );
      paraBuffer = [];
    }
  };
  const flushList = () => {
    if (listBuffer.length) {
      const Tag = listType === "ol" ? "ol" : "ul";
      elements.push(
        <Tag key={`${keyPrefix}-l-${elements.length}`} style={{ margin: "0 0 10px 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4, listStyleType: listType === "ol" ? "decimal" : "disc" }}>
          {listBuffer.map((item, idx) => (
            <li key={idx} className="leading-relaxed">{renderInline(item, `${keyPrefix}-li-${idx}`)}</li>
          ))}
        </Tag>
      );
      listBuffer = [];
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const heading = line.match(/^(#{1,3})\s+(.*)/);
    const bullet = line.match(/^[-*]\s+(.*)/);
    const numbered = line.match(/^\d+\.\s+(.*)/);

    if (heading) {
      flushPara(); flushList();
      const level = heading[1].length;
      const size = level === 1 ? "1.15em" : level === 2 ? "1.05em" : "1em";
      elements.push(
        <div key={`${keyPrefix}-h-${elements.length}`} style={{ fontWeight: 600, fontSize: size, margin: "14px 0 6px 0" }}>
          {renderInline(heading[2], `${keyPrefix}-h-${elements.length}`)}
        </div>
      );
    } else if (bullet) {
      flushPara();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listBuffer.push(bullet[1]);
    } else if (numbered) {
      flushPara();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listBuffer.push(numbered[1]);
    } else if (line.trim() === "") {
      flushPara(); flushList();
    } else {
      flushList();
      paraBuffer.push(line);
    }
  }
  flushPara(); flushList();
  return elements;
}

const LANG_COLORS = {
  js: "#F0DB4F", jsx: "#61DAFB", ts: "#3178C6", tsx: "#3178C6",
  py: "#3572A5", html: "#E34C26", css: "#563D7C", json: "#292929",
  sql: "#E38C00", bash: "#89E051", sh: "#89E051", java: "#B07219",
};

function CodeBlock({ lang, filename, content }) {
  const [copied, setCopied] = useState(false);
  const lineCount = content.split("\n").length;
  const dotColor = LANG_COLORS[(lang || "").toLowerCase()] || C.textTer;
  return (
    <div style={{ background: C.code, border: `1px solid ${C.borderStrong}`, borderRadius: 8, overflow: "hidden", margin: "14px 0" }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ background: C.panel2, borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ width: 7, height: 7, borderRadius: 999, background: dotColor, flexShrink: 0 }} />
          {filename ? (
            <span className="truncate" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12.5, color: C.text, fontWeight: 500 }}>{filename}</span>
          ) : (
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: C.textSec }}>{lang || "text"}</span>
          )}
          {filename && lang && (
            <span className="shrink-0" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: C.textTer }}>· {lang}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: C.textTer }}>{lineCount} lines</span>
          <button
            onClick={() => { copyToClipboard(content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="flex items-center gap-1 text-xs"
            style={{ color: copied ? C.accent : C.textTer }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3" style={{ margin: 0 }}>
        <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: C.text, lineHeight: 1.65, whiteSpace: "pre" }}>{content}</code>
      </pre>
    </div>
  );
}

function Markdown({ text }) {
  const fenceRegex = /```([\w+-]*)(?::([^\n]+))?\n?([\s\S]*?)```/g;
  const segments = [];
  let lastIndex = 0;
  let m;
  let i = 0;
  while ((m = fenceRegex.exec(text))) {
    if (m.index > lastIndex) segments.push({ type: "text", content: text.slice(lastIndex, m.index), key: i++ });
    segments.push({ type: "code", lang: m[1], filename: m[2] ? m[2].trim() : null, content: m[3].replace(/\n$/, ""), key: i++ });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) segments.push({ type: "text", content: text.slice(lastIndex), key: i++ });
  if (segments.length === 0) segments.push({ type: "text", content: text, key: 0 });

  for (let idx = 0; idx < segments.length; idx++) {
    const seg = segments[idx];
    if (seg.type !== "code" || seg.filename) continue;
    const prev = segments[idx - 1];
    if (!prev || prev.type !== "text") continue;
    const lines = prev.content.replace(/\s+$/, "").split("\n");
    const lastLine = lines[lines.length - 1] || "";
    const match = lastLine.trim().match(/^\*\*([\w.\-/]+\.\w{1,10})\*\*:?$/) || lastLine.trim().match(/^([\w.\-/]+\.\w{1,10}):?$/);
    if (match) {
      seg.filename = match[1];
      lines.pop();
      prev.content = lines.join("\n");
    }
  }

  return (
    <div style={{ fontSize: 15 }}>
      {segments.map((seg) =>
        seg.type === "code" ? (
          <CodeBlock key={seg.key} lang={seg.lang} filename={seg.filename} content={seg.content} />
        ) : (
          <React.Fragment key={seg.key}>{renderTextBlock(seg.content, `seg-${seg.key}`)}</React.Fragment>
        )
      )}
    </div>
  );
}

function groupConversations(list) {
  const now = new Date();
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOf(now);
  const yesterday = today - 86400000;
  const weekAgo = today - 6 * 86400000;

  const groups = { Today: [], Yesterday: [], "Previous 7 days": [], Older: [] };
  for (const c of list) {
    const t = c.updatedAt || c.createdAt;
    if (t >= today) groups.Today.push(c);
    else if (t >= yesterday) groups.Yesterday.push(c);
    else if (t >= weekAgo) groups["Previous 7 days"].push(c);
    else groups.Older.push(c);
  }
  return Object.entries(groups).filter(([, arr]) => arr.length > 0);
}

/* ---------- model selector ---------- */

function ModelSelector({ provider, modelId, onChange }) {
  const [open, setOpen] = useState(false);
  const p = PROVIDERS[provider];
  const current = p.models.find((m) => m.id === modelId) || p.models[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[13px]"
        style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text }}
      >
        <span style={{ fontWeight: 500 }}>{p.label}</span>
        <span style={{ color: C.textSec }}>{current.label}</span>
        <ChevronDown size={13} color={C.textTer} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 rounded-lg overflow-hidden z-40 py-1" style={{ width: 210, background: C.panel, border: `1px solid ${C.borderStrong}` }}>
            {Object.entries(PROVIDERS).map(([key, prov]) => (
              <div key={key}>
                <div className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: C.textTer, letterSpacing: "0.06em" }}>
                  {prov.label}
                </div>
                {prov.models.map((m) => {
                  const active = provider === key && modelId === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => { onChange(key, m.id); setOpen(false); }}
                      className="w-full text-left px-3 py-1.5 text-[13px] flex items-center justify-between"
                      style={{ background: active ? C.accentDim : "transparent", color: active ? C.accent : C.text }}
                    >
                      {m.label}
                      {active && <Check size={13} />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- app ---------- */

export default function App() {
  const [conversations, setConversations] = useState(() => loadLocal("genius-ai:conversations", []));
  const [currentId, setCurrentId] = useState(null);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [copiedMsgId, setCopiedMsgId] = useState(null);

  const [profile, setProfile] = useState(() => loadLocal("genius-ai:profile", null));
  const [gateOpen, setGateOpen] = useState(() => !loadLocal("genius-ai:profile", null)?.accepted);
  const [nameInput, setNameInput] = useState("");
  const [agreed, setAgreed] = useState(false);

  const [provider, setProvider] = useState(() => loadLocal("genius-ai:provider", "anthropic"));
  const [modelId, setModelId] = useState(() => loadLocal("genius-ai:model", PROVIDERS.anthropic.models[0].id));

  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  const current = conversations.find((c) => c.id === currentId) || null;

  useEffect(() => { saveLocal("genius-ai:conversations", conversations); }, [conversations]);
  useEffect(() => { saveLocal("genius-ai:provider", provider); }, [provider]);
  useEffect(() => { saveLocal("genius-ai:model", modelId); }, [modelId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [current?.messages, isLoading, isStreaming]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  function acceptTerms() {
    const p = { accepted: true, name: nameInput.trim() || "You", acceptedAt: Date.now() };
    setProfile(p);
    saveLocal("genius-ai:profile", p);
    setGateOpen(false);
  }

  function resetData() {
    localStorage.removeItem("genius-ai:profile");
    localStorage.removeItem("genius-ai:conversations");
    setConversations([]);
    setCurrentId(null);
    setProfile(null);
    setNameInput("");
    setAgreed(false);
    setGateOpen(true);
  }

  function handleModelChange(newProvider, newModelId) {
    setProvider(newProvider);
    setModelId(newModelId);
    if (newProvider !== "anthropic") setSearchEnabled(false);
  }

  function createConversation() {
    const now = Date.now();
    const conv = { id: uid(), title: "New conversation", messages: [], createdAt: now, updatedAt: now };
    setConversations((prev) => [conv, ...prev]);
    setCurrentId(conv.id);
    setAttachments([]);
    setError(null);
  }

  function deleteConversation(id, e) {
    e.stopPropagation();
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (currentId === id) setCurrentId(null);
  }

  function startRename(conv, e) {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  }

  function commitRename() {
    if (editingId) {
      setConversations((prev) => prev.map((c) => (c.id === editingId ? { ...c, title: editingTitle.trim() || "Untitled" } : c)));
    }
    setEditingId(null);
  }

  async function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        if (file.type === "application/pdf") {
          const data = await readFileAsBase64(file);
          setAttachments((prev) => [...prev, { id: uid(), name: file.name, kind: "document", media_type: "application/pdf", data }]);
        } else if (file.type.startsWith("image/")) {
          const data = await readFileAsBase64(file);
          setAttachments((prev) => [...prev, { id: uid(), name: file.name, kind: "image", media_type: file.type, data }]);
        } else {
          const text = await readFileAsText(file);
          setAttachments((prev) => [...prev, { id: uid(), name: file.name, kind: "text", text }]);
        }
      } catch (err) {
        setError(`Couldn't read ${file.name}`);
      }
    }
    e.target.value = "";
  }

  function removeAttachment(id) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function buildUserContent(text, atts) {
    const blocks = [];
    for (const a of atts) {
      if (a.kind === "document") blocks.push({ type: "document", source: { type: "base64", media_type: a.media_type, data: a.data } });
      else if (a.kind === "image") blocks.push({ type: "image", source: { type: "base64", media_type: a.media_type, data: a.data } });
    }
    let finalText = text;
    const textFiles = atts.filter((a) => a.kind === "text");
    if (textFiles.length) {
      finalText = `${text}\n\n${textFiles.map((a) => `--- ${a.name} ---\n${a.text}`).join("\n\n")}`;
    }
    blocks.push({ type: "text", text: finalText || "(see attached file)" });
    return blocks;
  }

  const callAPI = useCallback(async (messagesForApi, convId, withSearch, providerArg, modelArg) => {
    setIsLoading(true);
    setIsStreaming(true);
    setError(null);
    const assistantId = uid();
    let started = false;
    let fullText = "";
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerArg,
          model: modelArg,
          system: SYSTEM_PROMPT,
          withSearch: withSearch && providerArg === "anthropic",
          messages: messagesForApi.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok || !response.body) {
        let msg = `Request failed (${response.status})`;
        try {
          const errJson = await response.json();
          if (errJson.error) msg = errJson.error;
        } catch (e) {}
        throw new Error(msg);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          let evt;
          try { evt = JSON.parse(jsonStr); } catch (e) { continue; }

          if (evt.type === "content_block_delta" && evt.delta && evt.delta.type === "text_delta") {
            fullText += evt.delta.text;
            if (!started) {
              started = true;
              setIsLoading(false);
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === convId
                    ? { ...c, messages: [...c.messages, { id: assistantId, role: "assistant", content: [{ type: "text", text: "" }], displayText: "", ts: Date.now() }] }
                    : c
                )
              );
            }
            const snapshot = fullText;
            setConversations((prev) =>
              prev.map((c) =>
                c.id === convId
                  ? { ...c, updatedAt: Date.now(), messages: c.messages.map((m) => (m.id === assistantId ? { ...m, displayText: snapshot, content: [{ type: "text", text: snapshot }] } : m)) }
                  : c
              )
            );
          }
        }
      }

      if (!started) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? { ...c, messages: [...c.messages, { id: assistantId, role: "assistant", content: [{ type: "text", text: fullText || "(no response)" }], displayText: fullText || "(no response)", ts: Date.now() }] }
              : c
          )
        );
      }
    } catch (err) {
      setError(err.message || "Something went wrong reaching the model. Please try again.");
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  }, []);

  async function sendMessage() {
    if (!input.trim() && attachments.length === 0) return;
    let conv = current;
    const now = Date.now();
    if (!conv) {
      conv = { id: uid(), title: "New conversation", messages: [], createdAt: now, updatedAt: now };
      setConversations((prev) => [conv, ...prev]);
      setCurrentId(conv.id);
    }

    const userContent = buildUserContent(input.trim(), attachments);
    const userMessage = {
      id: uid(), role: "user", content: userContent, displayText: input.trim(),
      attachmentNames: attachments.map((a) => a.name), ts: now,
    };
    const isFirst = conv.messages.length === 0;
    const newTitle = isFirst ? (input.trim().slice(0, 48) || "Untitled") : conv.title;
    const updatedMessages = [...conv.messages, userMessage];

    setConversations((prev) => prev.map((c) => (c.id === conv.id ? { ...c, messages: updatedMessages, title: newTitle, updatedAt: now } : c)));
    setInput("");
    setAttachments([]);
    await callAPI(updatedMessages, conv.id, searchEnabled, provider, modelId);
  }

  function regenerate() {
    if (!current || isStreaming) return;
    const msgs = current.messages;
    const lastAssistantIdx = msgs.map((m) => m.role).lastIndexOf("assistant");
    if (lastAssistantIdx === -1) return;
    const trimmed = msgs.slice(0, lastAssistantIdx);
    setConversations((prev) => prev.map((c) => (c.id === current.id ? { ...c, messages: trimmed } : c)));
    callAPI(trimmed, current.id, searchEnabled, provider, modelId);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function useSuggestion(s) {
    if (!current) createConversation();
    setInput(s.title + ": ");
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  const filteredGroups = groupConversations(
    conversations.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: C.bg, color: C.text, fontFamily: "Inter, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
        .msg-in { animation: fadeIn 0.18s ease-out; }
        @keyframes dotPulse { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
        .dot { animation: dotPulse 1.2s infinite; display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: ${C.textSec}; }
        textarea:focus, input:focus { outline: none; }
        button { cursor: pointer; }
        @media (prefers-reduced-motion: reduce) { .msg-in { animation: none; } .dot { animation: none; } }
      `}</style>

      {gateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(6,6,7,0.75)" }}>
          <div className="w-full max-w-md rounded-xl p-6" style={{ background: C.panel, border: `1px solid ${C.borderStrong}` }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: C.accent }}>
                <TerminalSquare size={15} color="#08090C" />
              </div>
              <span className="text-base font-semibold">Welcome to Genius AI</span>
            </div>
            <p className="text-sm mt-2" style={{ color: C.textSec }}>What should I call you?</p>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Your name (optional)"
              className="w-full mt-2 px-3 py-2 rounded-md text-sm bg-transparent"
              style={{ border: `1px solid ${C.border}`, color: C.text }}
            />
            <div className="mt-4 rounded-lg p-3 text-xs leading-relaxed" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.textSec, maxHeight: 160, overflowY: "auto" }}>
              <p className="font-medium mb-1.5" style={{ color: C.text }}>Before you start</p>
              <ul className="list-disc pl-4 flex flex-col gap-1">
                <li>Don't use this to ask for illegal content, or content meant to harm people.</li>
                <li>Responses can be wrong — check anything important before relying on it.</li>
                <li>Don't share passwords, financial details, or other sensitive personal data in chat.</li>
                <li>Your name and conversations are saved in this browser's local storage — nobody else can see them through this app.</li>
              </ul>
            </div>
            <label className="flex items-start gap-2 mt-3 text-xs cursor-pointer" style={{ color: C.textSec }}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
              I understand and agree to these rules.
            </label>
            <button
              onClick={acceptTerms}
              disabled={!agreed}
              className="w-full mt-4 py-2 rounded-md text-sm font-medium"
              style={{ background: C.accent, color: "#08090C", opacity: agreed ? 1 : 0.4 }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {sidebarOpen && (
        <div className="flex flex-col shrink-0" style={{ width: 268, background: C.panel, borderRight: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2 px-3 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
            <div className="w-6 h-6 rounded flex items-center justify-center shrink-0" style={{ background: C.accent }}>
              <TerminalSquare size={14} color="#08090C" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Genius AI</span>
            <button onClick={() => setSidebarOpen(false)} className="ml-auto p-1 rounded" style={{ color: C.textTer }} title="Collapse sidebar">
              <PanelLeftClose size={16} />
            </button>
          </div>

          <div className="px-3 pt-3">
            <button
              onClick={createConversation}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium"
              style={{ background: C.panel2, border: `1px solid ${C.borderStrong}`, color: C.text }}
            >
              <Plus size={15} /> New chat
            </button>
          </div>

          <div className="px-3 pt-2.5">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md" style={{ background: C.panel2, border: `1px solid ${C.border}` }}>
              <Search size={13} color={C.textTer} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations"
                className="bg-transparent text-xs flex-1"
                style={{ color: C.text }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pt-3 pb-2">
            {filteredGroups.length === 0 && (
              <p className="px-2.5 py-4 text-xs" style={{ color: C.textTer }}>No conversations yet.</p>
            )}
            {filteredGroups.map(([label, items]) => (
              <div key={label} className="mb-3">
                <div className="px-2.5 pb-1 text-[11px] font-medium tracking-wide uppercase" style={{ color: C.textTer, letterSpacing: "0.06em" }}>
                  {label}
                </div>
                {items.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => setCurrentId(c.id)}
                    className="group flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer"
                    style={{ background: c.id === currentId ? C.panel2 : "transparent" }}
                  >
                    {editingId === c.id ? (
                      <input
                        autoFocus
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => { if (e.key === "Enter") commitRename(); }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 bg-transparent text-sm"
                        style={{ color: C.text, border: `1px solid ${C.accent}`, borderRadius: 4, padding: "1px 4px" }}
                      />
                    ) : (
                      <span className="flex-1 text-sm truncate" style={{ color: c.id === currentId ? C.text : C.textSec }}>{c.title}</span>
                    )}
                    <button onClick={(e) => startRename(c, e)} className="opacity-0 group-hover:opacity-100 shrink-0" style={{ color: C.textTer }}>
                      <Pencil size={12} />
                    </button>
                    <button onClick={(e) => deleteConversation(c.id, e)} className="opacity-0 group-hover:opacity-100 shrink-0" style={{ color: C.textTer }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between px-3 py-2.5" style={{ borderTop: `1px solid ${C.border}` }}>
            <span className="text-[11px] truncate" style={{ color: C.textTer, fontFamily: "JetBrains Mono, monospace" }}>
              {profile?.name || "You"}
            </span>
            <button onClick={resetData} className="text-[11px]" style={{ color: C.textTer }} title="Clear saved name and conversations">
              Reset my data
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-3 px-4 shrink-0" style={{ height: 48, borderBottom: `1px solid ${C.border}` }}>
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} className="p-1 rounded" style={{ color: C.textTer }} title="Show sidebar">
              <PanelLeft size={16} />
            </button>
          )}
          <span className="text-sm font-medium truncate">{current ? current.title : "New chat"}</span>
          <div className="ml-auto flex items-center gap-2">
            {provider === "anthropic" && (
              <button
                onClick={() => setSearchEnabled((v) => !v)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px]"
                style={{
                  background: searchEnabled ? C.accentDim : C.panel2,
                  border: `1px solid ${searchEnabled ? C.accent + "55" : C.border}`,
                  color: searchEnabled ? C.accent : C.textSec,
                  fontFamily: "JetBrains Mono, monospace",
                }}
                title={searchEnabled ? "Web search is on — click to turn off for faster replies" : "Web search is off (faster replies) — click to enable"}
              >
                <Globe size={11} /> web search {searchEnabled ? "on" : "off"}
              </button>
            )}
            <ModelSelector provider={provider} modelId={modelId} onChange={handleModelChange} />
          </div>
        </div>

        {searchEnabled && provider === "anthropic" && (
          <div className="px-4 py-1.5 text-[11px]" style={{ background: C.accentDim, color: C.accent, borderBottom: `1px solid ${C.border}`, fontFamily: "JetBrains Mono, monospace" }}>
            Web search is on for this message — replies may take a bit longer.
          </div>
        )}

        {!current || current.messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4" style={{ background: C.accentDim, border: `1px solid ${C.accent}33` }}>
              <TerminalSquare size={20} color={C.accent} />
            </div>
            <h1 className="text-xl font-semibold" style={{ letterSpacing: "-0.01em" }}>Hi, I'm Genius AI</h1>
            <p className="mt-1.5 text-sm" style={{ color: C.textSec }}>Ask anything, or have me build something — a page, a script, a small game.</p>
            <div className="grid grid-cols-2 gap-2.5 mt-7 w-full max-w-md">
              {SUGGESTIONS.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => useSuggestion(s)}
                  className="text-left p-3 rounded-lg"
                  style={{ background: C.panel, border: `1px solid ${C.border}` }}
                >
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: C.textTer }}>{s.body}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
            <div className="max-w-2xl mx-auto flex flex-col gap-5">
              {current.messages.map((m, idx) => {
                const isLast = idx === current.messages.length - 1;
                return (
                  <div key={m.id} className="msg-in flex gap-3" style={{ flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                    <div
                      className="w-6 h-6 rounded flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-semibold"
                      style={m.role === "user"
                        ? { background: C.panel2, border: `1px solid ${C.borderStrong}`, color: C.textSec }
                        : { background: C.accent, color: "#08090C" }}
                    >
                      {m.role === "user" ? "Y" : "G"}
                    </div>
                    <div className="flex flex-col min-w-0" style={{ alignItems: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
                      {m.role === "user" && m.attachmentNames?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-1.5 justify-end">
                          {m.attachmentNames.map((n, i2) => (
                            <span key={i2} className="flex items-center gap-1 px-2 py-1 rounded text-xs" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.textSec, fontFamily: "JetBrains Mono, monospace" }}>
                              <FileText size={11} /> {n}
                            </span>
                          ))}
                        </div>
                      )}
                      <div
                        className="min-w-0"
                        style={m.role === "user"
                          ? { background: C.panel2, border: `1px solid ${C.border}`, borderRadius: "10px 10px 2px 10px", padding: "9px 13px" }
                          : { padding: "1px 0" }}
                      >
                        {m.role === "user" ? (
                          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{m.displayText}</p>
                        ) : (
                          <Markdown text={m.displayText} />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 px-1">
                        <span className="text-[11px]" style={{ color: C.textTer, fontFamily: "JetBrains Mono, monospace" }}>{timeLabel(m.ts)}</span>
                        {m.role === "assistant" && (
                          <>
                            <button
                              onClick={() => { copyToClipboard(m.displayText); setCopiedMsgId(m.id); setTimeout(() => setCopiedMsgId(null), 1500); }}
                              className="text-[11px] flex items-center gap-1"
                              style={{ color: copiedMsgId === m.id ? C.accent : C.textTer }}
                            >
                              {copiedMsgId === m.id ? <Check size={11} /> : <Copy size={11} />}
                            </button>
                            {isLast && !isStreaming && (
                              <button onClick={regenerate} className="text-[11px] flex items-center gap-1" style={{ color: C.textTer }} title="Regenerate">
                                <RotateCcw size={11} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {isLoading && (
                <div className="msg-in flex gap-3">
                  <div className="w-6 h-6 rounded flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-semibold" style={{ background: C.accent, color: "#08090C" }}>G</div>
                  <div className="flex items-center gap-1 pt-1.5">
                    <span className="dot" style={{ animationDelay: "0s" }} />
                    <span className="dot" style={{ animationDelay: "0.15s" }} />
                    <span className="dot" style={{ animationDelay: "0.3s" }} />
                  </div>
                </div>
              )}
              {error && (
                <div className="text-sm px-3 py-2 rounded-md" style={{ background: "rgba(248,81,73,0.08)", color: C.danger, border: `1px solid rgba(248,81,73,0.25)` }}>
                  {error}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="px-4 pb-5 pt-2 shrink-0">
          <div className="max-w-2xl mx-auto">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachments.map((a) => (
                  <span key={a.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs" style={{ background: C.panel2, color: C.textSec, border: `1px solid ${C.border}`, fontFamily: "JetBrains Mono, monospace" }}>
                    {a.kind === "image" ? <ImageIcon size={12} /> : <FileText size={12} />}
                    {a.name}
                    <button onClick={() => removeAttachment(a.id)} style={{ color: C.textTer }}><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-1.5 rounded-xl px-2.5 py-2" style={{ background: C.panel, border: `1px solid ${C.borderStrong}` }}>
              <button onClick={() => fileInputRef.current?.click()} className="p-2 rounded-md shrink-0" style={{ color: C.textSec }} title="Attach a file">
                <Paperclip size={17} />
              </button>
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.md,.csv,.json" onChange={handleFileChange} className="hidden" />
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Genius AI..."
                rows={1}
                className="flex-1 bg-transparent resize-none text-[15px] py-1.5"
                style={{ color: C.text }}
              />
              <button
                onClick={sendMessage}
                disabled={isStreaming || (!input.trim() && attachments.length === 0)}
                className="p-2 rounded-md shrink-0"
                style={{ background: C.accent, color: "#08090C", opacity: isStreaming || (!input.trim() && attachments.length === 0) ? 0.35 : 1 }}
              >
                <Send size={16} />
              </button>
            </div>
            <p className="text-center text-[11px] mt-2" style={{ color: C.textTer, fontFamily: "JetBrains Mono, monospace" }}>
              enter to send · shift+enter for a new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
