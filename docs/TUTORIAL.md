# Tutorial: How Hulog Paluwagan Planner Works

This guide walks through the code so a beginner can read, change and extend it. You only need a text editor and a browser. Node.js is optional (for the tests).

## 1. The architecture in one picture

```
 index.html  -- page skeleton: header, summary area, 5 tab panels, about section
     |
     +-- css/hulog.css      how it looks (tokens -> components -> responsive -> print)
     |
     +-- js/hulog-core.js   WHAT the numbers are (pure functions, no DOM)
     |        payoutDates() -> buildSchedule() -> summary() / ledger()
     |        drawOrder()  shareText()  scheduleCsv()  importJson()
     |
     +-- js/hulog-app.js    HOW it shows and reacts (render + events + storage)
              state = { groups, activeId, tab }
              user action -> change state -> renderAll() -> save()
```

The key idea is **separation**: `hulog-core.js` never touches the page, so it can be tested in Node, and `hulog-app.js` never does date or money math itself.

## 2. Key concepts

- **Ulo (hand/slot):** one share in the paluwagan. A member with 2 ulo pays twice per round and receives two payouts.
- **Round:** one payout date. There are as many rounds as total ulo.
- **Pot:** hulog x total ulo. The recipient of the round gets the pot minus any organizer fee.
- **Centavos:** all money is stored as whole centavos (`100000` = PHP 1,000) so `0.1 + 0.2` rounding errors never happen.
- **Dates as text:** dates are `YYYY-MM-DD` strings computed in UTC, so the user's timezone can never shift a payday.

## 3. File by file

### `js/hulog-core.js` (JavaScript, pure logic)

It is wrapped in a small UMD pattern, so the same file works as `window.HulogCore` in the browser and `require()` in Node.

- `payoutDates(start, freq, count, sundayRule)` builds the calendar.
  - Weekly / every 2 weeks: add 7 or 14 days.
  - Kinsenas at katapusan: `nextSemimonthly()` returns the 15th if the day is 15 or earlier, otherwise the last day of the month.
  - Monthly: keeps the starting day but clamps to short months, using `daysInMonth()`.
  - Sunday rule: a Sunday payout becomes Monday.
- `normalizeOrder(group)` makes sure each member appears in the payout order exactly as many times as their ulo, keeping the existing order where possible.
- `buildSchedule(group, today)` is the heart of the app. For every round it adds the date, recipient, pot, fee, net payout, how much has been collected, who has not paid, and a status:
  - `done` - the date has passed and everyone paid
  - `late` - the date has passed and someone has not paid
  - `collecting` - the first round on or after today
  - `upcoming` - later rounds
- `summary()` and `ledger()` read the schedule to produce the dashboard numbers and per-member totals.
- `drawOrder(group, seed)` is the bunutan. It hashes the seed text with FNV-1a, feeds it to the small `mulberry32` random generator and runs a Fisher-Yates shuffle. Same seed in, same order out.
- `csvCell()` quotes CSV values and puts an apostrophe in front of anything starting with `= + - @`, which stops "CSV injection" when the file is opened in Excel.
- `sanitizeGroup()` / `importJson()` check every field of a pasted backup: real dates, sane amounts, 2-60 members, 1-5 ulo, and strip `<` and `>` from names.
- `sampleGroup(today)` builds the demo group with dates relative to today, so the demo always shows a late round and a round being collected.

### `js/hulog-app.js` (JavaScript, interface)

- `load()` / `save()` read and write `localStorage` inside `try/catch`. In a private window the app still works; it just will not remember.
- `renderAll(skip)` re-draws the summary and the five panels from `state`. The optional `skip` argument leaves the panel you are typing in alone so the cursor does not jump.
- Every piece of user text goes through `esc()` before it is put into HTML (prevents script injection through a member's name).
- **Event delegation:** one `click` listener on the document reads `data-act` attributes (`tick`, `draw`, `move`, `copy-share`...). No inline `onclick`.
- `confirmStep()` implements "tap again to confirm" for removing members and deleting groups, instead of a browser `confirm()` popup.
- `copyText()` uses the Clipboard API with a fallback.
- Tabs follow the ARIA tabs pattern, including arrow-key navigation.

### `css/hulog.css` (CSS)

1. **Tokens** at the top: colours (`--paper`, `--ink`, `--accent`, `--gold`, semantic `--ok/--warn/--bad`), fonts and spacing.
2. **Dark theme:** the same tokens redefined under `prefers-color-scheme: dark` and under `[data-theme="dark"]` (for the toggle).
3. **Components:** buttons, chips, the "stamp" round counter, the tracker grid (`.tick`), tables.
4. **Responsive:** columns stack under 860px and 520px; wide tables scroll inside their own box.
5. **Print:** hides navigation so the schedule prints cleanly.

### `index.html`, `sw.js`, `manifest.webmanifest`

The HTML is only a skeleton; the JavaScript fills the panels. `sw.js` caches the app files so it opens offline, and the manifest lets phones "Add to Home screen".

### `tools/build-demo.js`

Copies `index.html`, inlines the CSS and both JS files, and writes `demo/index.html`: a single file you can email or upload anywhere.

## 4. Run the tests

```bash
npm test                    # 12 unit tests, uses Node's built-in runner (Node 18+)
NODE_PATH=$(npm root -g) node tests/ui.e2e.js   # browser test, needs Playwright
```

## 5. Extension exercises

1. **Partial payments.** Change `paid` from `true` to an amount in centavos, show a half-filled box in the tracker, and count partial amounts in `buildSchedule()`.
2. **Reminder messages.** Add a `reminderText(group, memberId, today)` function to the core that lists that member's unpaid rounds, and a "Copy reminder" button next to each name in the tracker.
3. **Holiday rule.** Add an option to move payouts that land on a Philippine regular holiday to the next working day. Write a unit test for December 25 and January 1 first.
