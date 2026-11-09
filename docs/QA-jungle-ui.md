# Jungle UI manual QA checklist

Run this after any change to `web/` (the main page, not the history page).
Start the server with `python3 server.py`, open <http://localhost:8765/?demo>,
and wait about 10 seconds for all 7 demo agents to arrive. Demo agents are
random, so check behaviour, not exact numbers. Keep the browser console open:
it should stay free of errors the whole time.

Clear test state first (DevTools console):
`localStorage.removeItem('wg-customs'); localStorage.removeItem('webgentz.layerNames')`

## A. Load
- [ ] A1. The page loads with no console errors and the tree draws on the canvas.
- [ ] A2. Agents walk in one by one; after ~10s the HUD says **7 agents**.
- [ ] A3. The HUD shows the WEBGENTZ logo, "N agents · M working", a gear button with the current time, and a **Quest Board** button.
- [ ] A4. While any agent needs you, the Quest Board button shows a yellow "N need you" badge.
- [ ] A5. The layer labels (Canopy, Understory, Roots) show "N agents" for layers that have agents and nothing for empty layers.
- [ ] A6. The clock shows the real local time (auto mode).

## B. Settings popover (gear button)
- [ ] B1. The popover is open when the page first loads.
- [ ] B2. It shows the Bank total in dollars, a **View details** button, Light/Dark and Day/Night toggles.
- [ ] B3. The gear button opens and closes it.
- [ ] B4. Pressing anywhere outside it (and outside the gear) closes it.
- [ ] B5. **Dark** switches the page to the dusk theme and highlights Dark; **Light** switches back.
- [ ] B6. **Night** animates the clock to about 10:00 PM; **Day** to 12:00 PM. The clock then stops following real time.
- [ ] B7. **View details** opens the Bank window and closes the popover.

## C. Canvas
- [ ] C1. Hovering over an animal shows a card: avatar, name (hex suffix dimmed), kind · layer, status tag, provider badge (Claude/OpenAI), current detail, tokens/cost/active time.
- [ ] C2. Moving off the animal, or out of the canvas, hides the card.
- [ ] C3. Hovering the bank (hut left of the trunk) shows "Bank · today $X".
- [ ] C4. Hovering the quest board (right of the trunk) shows "Quest board", plus "· N need you" when any do.
- [ ] C5. Clicking an animal opens its side sheet and sends `POST /api/open`.
- [ ] C6. Clicking empty canvas closes the sheet.
- [ ] C7. Clicking the bank opens the Bank window; clicking the board opens the Quest Board.

## D. Agent sheet
- [ ] D1. The header shows avatar, name, kind · layer, provider badge and status tag.
- [ ] D2. The stat grid shows Tokens, Cost and Active time.
- [ ] D3. **Tools**, **Recent** and **Details** expand and collapse, and the chevron flips. Details lists project folder, "Running in" (for app agents), session id, started, layer, type and token counts.
- [ ] D4. The palette button shows colour swatches. Picking one recolours the avatar and the animal on the tree. The reset swatch restores the default.
- [ ] D5. A picked colour survives a page reload.
- [ ] D6. For an agent that needs you, the sheet shows **Approve**, **Deny** and a find button. Approve turns it to Working and Deny to Idle, straight away.
- [ ] D7. **Send away** calls `POST /api/dismiss`. Demo agents are unknown to the server, so an error alert appears and the sheet stays open.
- [ ] D8. **Close terminal** only appears for Terminal/iTerm2 agents with a tty (never in demo mode).
- [ ] D9. Clicking the header calls `POST /api/open`.
- [ ] D10. The X button, the Escape key, and clicking outside the sheet (not on the canvas) all close it.

## E. Ledger (bottom bar)
- [ ] E1. Closed, it shows "Ledger", an unread count, and the latest message.
- [ ] E2. Clicking it opens the drawer on the **Chat** tab: "All agents" plus one channel per agent, with message counts. Newest messages are first.
- [ ] E3. Clicking a channel shows only that agent's messages; "All agents" shows everything again.
- [ ] E4. The **Who's on what** tab lists every agent with job, activity, a token bar and a status tag. Clicking a row opens that agent's sheet.
- [ ] E5. The Close button, Escape, and pressing outside the drawer all close it.
- [ ] E6. After the drawer has been opened, the unread count resets.

## F. Quest Board
- [ ] F1. The HUD button opens it over a dark backdrop, with "Agent updates" on the left and "Your quests and notes" on the right.
- [ ] F2. Posting an empty note does nothing.
- [ ] F3. Posting text adds the note to the list and clears the box.
- [ ] F4. The note is still there after a reload (it is loaded from `/api/notes`).
- [ ] F5. While you type, live agent updates do not wipe the draft or move the cursor.
- [ ] F6. The X button, clicking the backdrop, and Escape all close it.

## G. Bank window
- [ ] G1. The tiles show today's spend, tokens used and tool calls.
- [ ] G2. The table lists every agent with layer, tokens and cost. Clicking a row opens that agent's sheet and closes the window.
- [ ] G3. With some history in the database, a 14-day chart appears and **Cost** / **Tokens** switch what it shows.

## H. Renaming layers
- [ ] H1. Clicking a layer label turns it into a text box with the name selected.
- [ ] H2. Enter (or clicking away) saves. The new name shows on the label, in hover cards, and in the sheet.
- [ ] H3. Escape cancels without saving.
- [ ] H4. Saving an empty name, or the default name, goes back to the default.
- [ ] H5. Custom names survive a page reload.

## I. Live mode (no `?demo`)
- [ ] I1. Open <http://localhost:8765/>. The page connects to `/stream` without errors.
- [ ] I2. `curl -X POST localhost:8765/event -d '{"session_id":"qa","event":"start","agent_type":"python"}'` makes a new animal appear.
- [ ] I3. Stopping and restarting the server: the page reconnects by itself within a few seconds.
- [ ] I4. Clicking a live agent and pressing **Send away** removes it without an error.

Not practical to check by hand: idle agents fall asleep after 15 minutes, and
the clock moves forward once a minute in auto mode.

## Known bugs (current behaviour, kept on purpose)

These fail the checklist today. A change that only refactors code must leave
them exactly as they are; fix them in their own commit.

- **G2 / E4.** Clicking a row in the Bank table or in "Who's on what" closes
  the panel but does not open the agent's sheet. The click that opens the sheet
  also reaches the document's "click outside the sheet" listener, which closes it.
- **G3.** Chart day labels are one day early west of UTC: `new Date('2026-11-08')`
  is read as UTC midnight.
- **H3 / H4.** After Escape, or after saving an empty or unchanged name, the text
  box can stay on the label (the label's HTML cache is not cleared when the box
  appears). Clicking away then saves whatever is in the box.
- **D4.** For `gtm`, `python` and `research` animals the avatar ignores the chosen
  colour (that is `JungleEngine.avatar`); the colour is still saved.

## Tips for testing

- Keep the browser tab visible. Hidden tabs pause animation frames, so the tree,
  clock and HUD stop updating and checks give wrong results.
- Demo agents get new ids on every reload, so D5 can only confirm the colour is
  saved in `localStorage` (`wg-customs`), not that it shows on the same animal.
- Clear `localStorage` *before* loading the page, not after; the page reads it
  once at start.
