// Runs on Vercel's Edge Runtime. Deploy this repo on Vercel (connected to
// your GitHub repo) and this file automatically becomes POST /api/chat.
// Your provider API keys live only here, as server environment variables —
// they are never sent to the browser.
export const config = { runtime: "edge" };

const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-5.6-sol",
  google: "gemini-3.5-flash",
};

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
  }

  const { provider, model, system, messages, withSearch } = body || {};

  try {
    if (provider === "anthropic") return await callAnthropic({ model, system, messages, withSearch });
    if (provider === "openai") return await callOpenAI({ model, system, messages });
    if (provider === "google") return await callGoogle({ model, system, messages });
    return new Response(JSON.stringify({ error: `Unknown provider: ${provider}` }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err && err.message ? err.message : err) }), { status: 500 });
  }
}

/* ---------- Anthropic (Claude) ---------- */
// Anthropic's stream already matches the normalized format the frontend
// expects (content_block_delta / text_delta events), so we proxy it as-is.
async function callAnthropic({ model, system, messages, withSearch }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return missingKey("ANTHROPIC_API_KEY");

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODELS.anthropic,
      max_tokens: 1536,
      system,
      stream: true,
      tools: withSearch ? [{ type: "web_search_20250305", name: "web_search" }] : undefined,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!upstream.ok || !upstream.body) return upstreamError("Anthropic", upstream);
  return new Response(upstream.body, { status: 200, headers: sseHeaders() });
}

/* ---------- OpenAI (ChatGPT) ---------- */
async function callOpenAI({ model, system, messages }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return missingKey("OPENAI_API_KEY");

  const oaMessages = [
    ...(system ? [{ role: "system", content: system }] : []),
    ...messages.map((m) => ({ role: m.role, content: flattenToText(m.content) })),
  ];

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: model || DEFAULT_MODELS.openai, stream: true, messages: oaMessages }),
  });

  if (!upstream.ok || !upstream.body) return upstreamError("OpenAI", upstream);
  const stream = normalizeStream(upstream.body, (json) => json?.choices?.[0]?.delta?.content || null);
  return new Response(stream, { status: 200, headers: sseHeaders() });
}

/* ---------- Google (Gemini) ---------- */
async function callGoogle({ model, system, messages }) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return missingKey("GOOGLE_API_KEY");

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: flattenToText(m.content) }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model || DEFAULT_MODELS.google
  )}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const upstream = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    }),
  });

  if (!upstream.ok || !upstream.body) return upstreamError("Gemini", upstream);
  const stream = normalizeStream(
    upstream.body,
    (json) => json?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || null
  );
  return new Response(stream, { status: 200, headers: sseHeaders() });
}

/* ---------- helpers ---------- */

function sseHeaders() {
  return { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" };
}

function missingKey(name) {
  return new Response(
    JSON.stringify({ error: `${name} is not set on the server. Add it in your Vercel project's Environment Variables.` }),
    { status: 500 }
  );
}

async function upstreamError(label, upstream) {
  const text = await upstream.text().catch(() => "");
  return new Response(JSON.stringify({ error: `${label} error (${upstream.status}): ${text.slice(0, 300)}` }), {
    status: upstream.status,
  });
}

// Claude messages can include image/document content blocks; other
// providers here only receive text, so we describe what was omitted.
function flattenToText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (block.type === "text") return block.text;
      if (block.type === "image") return "[an image was attached — switch to a Claude model to discuss images]";
      if (block.type === "document") return "[a file was attached — switch to a Claude model to discuss files]";
      return "";
    })
    .join("\n");
}

// Converts another provider's SSE stream into the same
// `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}`
// shape Anthropic sends, so the frontend can parse every provider identically.
function normalizeStream(upstreamBody, extractText) {
  const reader = upstreamBody.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;
        let json;
        try {
          json = JSON.parse(jsonStr);
        } catch (e) {
          continue;
        }
        const text = extractText(json);
        if (text) {
          const payload = JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text } });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        }
      }
    },
  });
}
