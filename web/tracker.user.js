// ==UserScript==
// @name         Webgentz Jungle Tracker
// @namespace    https://github.com/webgentz
// @version      0.1
// @description  Shows your AI conversations as agents in the Webgentz jungle
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://grok.com/*
// @match        https://claude.ai/*
// @match        https://gemini.google.com/*
// @match        https://www.perplexity.ai/*
// @match        https://copilot.microsoft.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  const JUNGLE = "http://127.0.0.1:8765";
  const host = location.hostname;

  const TOOL =
    (host === "chatgpt.com" || host === "chat.openai.com") ? "chatgpt" :
    host === "grok.com" ? "grok" :
    host === "claude.ai" ? "claude-web" :
    host === "gemini.google.com" ? "gemini" :
    host === "www.perplexity.ai" ? "perplexity" :
    host === "copilot.microsoft.com" ? "copilot" :
    null;

  if (!TOOL) return;

  // Stable session ID for this tab (lost when tab closes, which sends an end event).
  const SESSION_ID = sessionStorage.getItem("wgz-sid") || (() => {
    const id = `${TOOL}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem("wgz-sid", id);
    return id;
  })();

  // Map tool to its layer: ChatGPT / Claude.ai are product tools → understory
  const LAYER = "understory";
  const NAME = `${TOOL}-${SESSION_ID.slice(-4)}`;

  let active = false;

  function send(fields) {
    const payload = JSON.stringify({
      session_id: SESSION_ID,
      agent_type: TOOL,
      layer: LAYER,
      name: NAME,
      ...fields,
    });
    // Use sendBeacon for reliability on page unload, fetch otherwise.
    if (fields.event === "end") {
      navigator.sendBeacon(`${JUNGLE}/event`, new Blob([payload], { type: "application/json" }));
    } else {
      fetch(`${JUNGLE}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      }).catch(() => {});
    }
  }

  // ---------------------------------------------------------------- fetch intercept

  // Patterns that indicate a new message is being sent to the AI.
  function isConversationPost(url) {
    return (
      (TOOL === "chatgpt"    && url.includes("/backend-api/conversation")) ||
      (TOOL === "grok"       && (url.includes("/rest/app-chat/") || url.includes("/api/rpc"))) ||
      (TOOL === "claude-web" && url.includes("/completion")) ||
      (TOOL === "gemini"     && url.includes("batchexecute")) ||
      (TOOL === "perplexity" && url.includes("/rest/perplexity/")) ||
      (TOOL === "copilot"    && url.includes("/sydney/ChatHub"))
    );
  }

  function extractPrompt(bodyText) {
    try {
      const obj = JSON.parse(bodyText);
      // ChatGPT / OpenAI format
      if (Array.isArray(obj.messages)) {
        const last = obj.messages[obj.messages.length - 1];
        const c = last?.content;
        if (typeof c === "string") return c.slice(0, 500);
        if (Array.isArray(c)) return (c.find(x => x.type === "text")?.text || "").slice(0, 500);
      }
      // Claude.ai format
      if (typeof obj.prompt === "string") return obj.prompt.slice(0, 500);
      if (Array.isArray(obj.messages)) return "";
    } catch {}
    return "";
  }

  async function drainStream(response) {
    const reader = response.body?.getReader();
    if (!reader) return "";
    const dec = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += dec.decode(value, { stream: true });
    }
    return text;
  }

  function extractAnswer(streamText) {
    // ChatGPT SSE: data: {"message":{"content":{"parts":["..."]}}}
    try {
      const lines = streamText.split("\n").filter(l => l.startsWith("data: ") && !l.includes("[DONE]"));
      for (let i = lines.length - 1; i >= 0; i--) {
        const d = JSON.parse(lines[i].slice(6));
        const parts = d?.message?.content?.parts;
        if (Array.isArray(parts) && parts.some(p => typeof p === "string" && p.trim())) {
          return parts.filter(p => typeof p === "string").join("").slice(-2000);
        }
      }
    } catch {}
    // Claude.ai SSE: data: {"type":"content_block_delta","delta":{"text":"..."}}
    try {
      let answer = "";
      for (const line of streamText.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const d = JSON.parse(line.slice(6));
        if (d?.delta?.text) answer += d.delta.text;
        if (d?.type === "message_stop") break;
      }
      if (answer) return answer.slice(-2000);
    } catch {}
    return "";
  }

  const origFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : (input instanceof Request ? input.url : "");
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();

    if (method === "POST" && isConversationPost(url)) {
      let prompt = "";
      try {
        const bodyText = typeof init?.body === "string" ? init.body :
          (init?.body instanceof Blob ? await init.body.text() : "");
        prompt = extractPrompt(bodyText);
      } catch {}

      if (!active) {
        active = true;
        send({ event: "start" });
        send({ event: "prompt", prompt });
      } else {
        send({ event: "tool_start", tool: "thinking" });
      }

      const response = await origFetch(input, init);
      const clone = response.clone();

      drainStream(clone).then(text => {
        const answer = extractAnswer(text);
        active = false;
        send({ event: "done", answer });
      }).catch(() => {
        active = false;
        send({ event: "done" });
      });

      return response;
    }

    return origFetch(input, init);
  };

  // ---------------------------------------------------------------- lifecycle

  send({ event: "start" });

  window.addEventListener("beforeunload", () => {
    send({ event: "end" });
  });

})();
