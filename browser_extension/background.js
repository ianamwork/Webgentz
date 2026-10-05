// Content scripts cannot post to localhost themselves (the chat site's page
// rules would block it), so they hand each event to this worker, which can.
const JUNGLE = "http://127.0.0.1:8765/event";

chrome.runtime.onMessage.addListener((message) => {
  if (!message || !message.webgentz) return;
  fetch(JUNGLE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message.webgentz),
  }).catch(() => {}); // the jungle is optional; stay quiet if it is not running
});
