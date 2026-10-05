// Watches one claude.ai (or ChatGPT or Grok) tab and reports the open chat to Webgentz.
//
// It only reads what is already on the page (the chat title, the messages,
// and whether the Stop button is showing). It never clicks, types, or calls
// the site's servers, and it sends events only to the background worker,
// which posts them to the jungle on this computer.

(() => {
  // What to read on each site. Only claude.ai is switched on in
  // manifest.json for now; the others stay here to turn back on later.
  const SITES = {
    "claude.ai": {
      key: "claude",
      label: "Claude",
      agentType: "claude-chat",
      titleSuffix: / [-–|] Claude$/,
      chatPath: /\/chat\/([\w-]+)/,
      user: '[data-testid="user-message"]',
      assistant: '[data-is-streaming]',
      // A chat inside a project shows the project's name as a link at the top.
      projectLink: 'a[href^="/project/"]',
    },
    "chatgpt.com": {
      key: "chatgpt",
      label: "ChatGPT",
      agentType: "chatgpt",
      titleSuffix: / [-–|] ChatGPT$/,
      chatPath: /\/c\/([\w-]+)/,
      user: '[data-message-author-role="user"]',
      assistant: '[data-message-author-role="assistant"]',
    },
    "grok.com": {
      key: "grok",
      label: "Grok",
      agentType: "grok",
      titleSuffix: / [-–|] Grok$/,
      chatPath: /\/c\/([\w-]+)/,
      user: '[data-testid="user-message"], .message-row.items-end .message-bubble, div.items-end .message-bubble',
      assistant: '[data-testid="assistant-message"], .message-row.items-start .message-bubble, div.items-start .message-bubble',
    },
  };
  SITES["chat.openai.com"] = SITES["chatgpt.com"];
  const SITE = SITES[location.hostname];
  if (!SITE) return;

  // The Stop button only shows while the model is answering.
  const STOP = '[data-testid="stop-button"], button[aria-label*="stop" i]';
  const STREAMING = '[data-is-streaming="true"]'; // claude.ai marks the answer being written
  const SEARCHING = /searching( the web)?|reading sources|browsing/i;
  const HEARTBEAT_MS = 2 * 60 * 1000; // so long answers do not look stuck
  const CHECK_GAP_MS = 500;

  let current = null; // what we last reported about the open chat
  let lastCheck = 0;
  let trailing = null;

  function chatInfo() {
    const chat = location.pathname.match(SITE.chatPath);
    if (!chat) return null; // a brand-new chat has no id until the first message is sent
    return { id: chat[1], project: projectName() };
  }

  function projectName() {
    if (SITE.projectLink) {
      const link = document.querySelector(SITE.projectLink);
      return link ? (link.innerText || "").trim().slice(0, 60) : "";
    }
    // ChatGPT projects live under /g/g-p-<id>-<name>/c/<chat>.
    const project = location.pathname.match(/\/g\/g-p-[0-9a-f]+-([\w-]+)/i);
    return project ? project[1] : "";
  }

  function chatTitle() {
    const title = document.title.replace(SITE.titleSuffix, "").trim();
    return title && title !== SITE.label ? title : "New chat";
  }

  function lastText(selector) {
    const nodes = document.querySelectorAll(selector);
    const node = nodes[nodes.length - 1];
    return { count: nodes.length, text: node ? (node.innerText || "").trim() : "" };
  }

  function isWorking() {
    if (document.querySelector(STREAMING)) return true;
    return [...document.querySelectorAll(STOP)].some((b) => b.offsetParent !== null);
  }

  function phaseOf(answer) {
    if (SEARCHING.test(answer.slice(0, 200))) return "Searching";
    return answer ? "Writing" : "Thinking";
  }

  function send(event) {
    const info = current;
    const body = {
      v: 1,
      session_id: `${SITE.key}-${info.id}`,
      agent_type: SITE.agentType,
      name: [SITE.label, info.project, info.title].filter(Boolean).join(" · "),
      cwd: `${SITE.key}/${info.project || "chats"}`, // lets webgentz.json pick a layer
      open: { url: info.url },
      source: "browser",
      ...event,
    };
    try {
      chrome.runtime.sendMessage({ webgentz: body });
    } catch (e) {
      // the extension was reloaded; this old copy of the script just stops
    }
  }

  function words(text) {
    return text ? text.split(/\s+/).length : 0;
  }

  function check() {
    const info = chatInfo();
    if (!info) return;
    const user = lastText(SITE.user);
    const answer = lastText(SITE.assistant);
    const working = isWorking();

    if (!current || current.id !== info.id) {
      // A new chat in this tab (or the tab just opened).
      current = { id: info.id, project: info.project, title: chatTitle(), url: location.href,
                  prompts: user.count, working: false, phase: "", beat: 0 };
      send({ event: "start" });
    }
    current.title = chatTitle();
    current.project = info.project || current.project;
    current.url = location.href;

    const now = Date.now();
    const newPrompt = user.count > current.prompts;
    current.prompts = Math.max(current.prompts, user.count);

    if (working && (!current.working || newPrompt)) {
      current.working = true;
      current.phase = "";
      send({ event: "prompt", prompt: user.text.slice(0, 500) });
    }
    if (working) {
      const phase = phaseOf(answer.text);
      if (phase !== current.phase || now - current.beat > HEARTBEAT_MS) {
        current.phase = phase;
        current.beat = now;
        const detail = phase === "Writing" ? `${words(answer.text)} words so far` : "";
        send({ event: "tool_start", tool: phase, detail });
      }
    } else if (current.working) {
      current.working = false;
      send({ event: "done", answer: answer.text.slice(0, 2000) });
    }
  }

  function maybeCheck() {
    const now = Date.now();
    if (now - lastCheck < CHECK_GAP_MS) {
      // Too soon; check once more shortly so the last change is not missed.
      if (!trailing) trailing = setTimeout(() => { trailing = null; maybeCheck(); }, CHECK_GAP_MS);
      return;
    }
    lastCheck = now;
    check();
  }

  // Streaming text changes the page constantly, so watching for changes
  // catches answers even in background tabs, where timers are slowed down.
  new MutationObserver(maybeCheck).observe(document.documentElement, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ["data-testid", "aria-label", "disabled", "data-is-streaming"],
  });
  setInterval(maybeCheck, 2000);
  maybeCheck();
})();
