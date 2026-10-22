# How Hulog Paluwagan Planner Was Built

This is a plain-language record of how this project was made: which languages it uses, what each file does, and every step in the order it happened, including the problems found and how they were fixed.

| | |
|---|---|
| **Project** | Hulog Paluwagan Planner |
| **Type** | Interactive web app (progressive web app, works offline) |
| **Version** | 1.0.0 |
| **Built** | 2026-10-21, by Claude (nightly showcase run) for Efraim Ray |
| **Difficulty** | Intermediate (no framework, but real date and money logic plus tests) |
| **Time to install/run** | Under 1 minute: open `index.html`, or visit the GitHub Pages link |

## 1. Languages Used

Line counts are real, measured with `find . -name "*.<ext>" | xargs cat | wc -l` (excluding `demo/`, which is a generated copy, and the `publish-to-github` files).

| Language | Lines | Share of code | Files | What it does in this project |
|---|---:|---:|---|---|
| JavaScript | 1,407 | 76.3% | `js/hulog-core.js` (497), `js/hulog-app.js` (598), `sw.js` (23), `tests/core.test.js` (123), `tests/ui.e2e.js` (119), `tools/build-demo.js` (47) | All the logic (payout dates, schedule, draw, totals, export, import), the interface (drawing the screens, reacting to taps, saving), offline caching, tests and the single-file build |
| CSS | 294 | 15.9% | `css/hulog.css` | The look: colour and font tokens, light and dark themes, tracker grid, tables, phone layout, print layout |
| HTML | 115 | 6.2% | `index.html` | The page skeleton: header, summary area, five tab panels, the About section |
| JSON | 27 | 1.5% | `package.json` (14), `manifest.webmanifest` (13) | Project info and test commands; "install as app" settings for phones |
| SVG | 1 | 0.1% | `favicon.svg` | The app icon (a dashed "stamp" circle) |

Documentation (Markdown) is not counted as code: README, CHANGELOG, TUTORIAL, DEPLOYMENT and this log. The Windows publisher is PowerShell (`publish-to-github.ps1`) plus a 7-line batch file.

**In one sentence:** JavaScript does all the thinking and the screen updates, CSS makes it look like a clean passbook in light or dark, and HTML gives it a page structure that screen readers understand.

### Frameworks and APIs

- **No framework and no libraries.** Plain (vanilla) JavaScript written in an ES5-compatible style so it runs on older Android phones.
- **Web Storage API** (`localStorage`) to remember groups, always wrapped in `try/catch`.
- **Clipboard API** with a fallback, for "Copy summary", "Copy CSV" and "Copy backup".
- **Intl.DateTimeFormat** to know today's date in Asia/Manila.
- **Service Worker + Web App Manifest** for offline use and "Add to Home screen".
- **FileReader** to restore a backup file; **Blob + object URLs** for downloads.
- Optional **Google Fonts** (Bricolage Grotesque, IBM Plex Sans, JetBrains Mono) with system-font fallbacks.

### Tools used to build and test

| Tool | What it was used for |
|---|---|
| `node --check` | Syntax check of every JavaScript file |
| Node.js built-in test runner (`node --test`) | 12 unit tests of the logic |
| Playwright + Chromium | 44 browser checks of the app, 4 render checks of the Blogger post, rendering the featured image |
| `tools/build-demo.js` (Node) | Building the single-file `demo/index.html` and the showcase page |
| `gzip -c file \| wc -c` | Measuring real download sizes |
| PowerShell 7.4.6 (Linux) + a stand-in `gh` + a local bare Git repo | Testing `publish-to-github.ps1` end to end without touching GitHub |
| Python + Pillow | Converting the featured image to JPG; generating and checking the Blogger post |
| zip | Packaging the project |
| GitHub CLI + `publish-to-github.bat` | Publishing to GitHub (done by Efraim with one double-click) |

**Build step needed?** No. No npm install, no Composer, no bundler. `npm test` works without installing anything because it uses Node's built-in runner. `node tools/build-demo.js` is only needed after you change files, to refresh the single-file demo.

## 2. How It Works (the 30-second version)

```
  Settings (amount, start date, frequency)      Members (+ how many ulo each)
                 |                                         |
                 v                                         v
        payoutDates()  --->  buildSchedule()  <---  payout order (bunutan seed or manual)
                                   |
             +---------------------+----------------------+
             v                     v                      v
     Summary strip          Schedule + totals        Hulog tracker grid
   (next payout, meter,    (dates, recipients,      (tap = paid; red = late;
    who is behind)           pot, fee, status)        gold = your payout)
                                   |
                                   v
             Share & backup: chat summary, CSV, JSON backup / restore
                                   |
                                   v
                    localStorage (stays in this browser only)
```

The key idea: one pure function, `buildSchedule()`, turns the settings, members, order and "who paid" marks into a full table of rounds with a status for each. Every screen just displays that table in a different way, so the summary, schedule, tracker and chat text can never disagree with each other.

## 3. Step-by-Step: How We Built It

### Step 1: Checked the weekly plan and earlier projects

The run started at 7:55 PM on Wednesday, October 21, 2026 (Asia/Manila), so a regular weekday project was due. `gh api user` confirmed the login `efraimray`, but repository API calls were refused for this cloud session, and GitHub web pages are blocked for fetching, so the `claude-improve` issue check was skipped. The Artifact gallery listed 11 artifacts; none was a savings or paluwagan tool. A WordPress plugin (Presyo Menu Board) was already built on Tuesday, so this week's WordPress rule was met and tonight could be an interactive web app.

### Step 2: Picked the idea and why

**Hulog Paluwagan Planner.** Paluwagan is everywhere in the Philippines (offices, markets, schools, cooperatives) but it runs on notebooks and group chats. The pain points are real: whose turn is it, who has not paid, and was the order drawn fairly? It is useful to many people, a good portfolio piece (dates, money, fairness, offline), and a natural client offer for cooperatives and HR teams. The name *hulog* is the Filipino word for the installment each member pays.

### Step 3: Planned the data

A group is stored as: name, hulog amount in **centavos**, frequency, start date (`YYYY-MM-DD`), Sunday rule, fee, members (each with a number of *ulo*), the payout order (one entry per ulo) and a `paid` map with keys like `"3|m6"` (round 3, member m6). Using centavos avoids floating-point errors, and plain date strings avoid timezone shifts.

### Step 4: Wrote the logic engine (`js/hulog-core.js`, JavaScript)

Written first and kept free of any page code so it can be tested in Node. It contains the payout calendar (weekly, every 2 weeks, 15th and end of month, monthly with short-month clamping, Sunday-to-Monday), `normalizeOrder()`, `buildSchedule()`, `summary()`, `ledger()`, the seeded bunutan (`hashSeed` + `mulberry32` + Fisher-Yates), CSV export with formula-injection protection, the chat summary text, and `sanitizeGroup()` / `importJson()` that check every field of a restored backup. `sampleGroup(today)` builds the demo group with dates relative to today, so the demo always shows a late round and a round being collected.

### Step 5: Wrote the unit tests (`tests/core.test.js`, JavaScript)

12 tests. The first attempt to run them with `node --test tests/` failed because Node 22 treated the folder name as a module; running `node --test tests/core.test.js` worked and all 12 passed on the first run. That command is now `npm test`.

| Test case | Expected | Result |
|---|---|---|
| Semi-monthly from 2028-01-20 (leap year) | Jan 31, Feb 15, Feb 29, Mar 15 | Pass |
| Monthly from Jan 31 | Jan 31, Feb 28, Mar 31, Apr 30 | Pass |
| Weekly from Sunday 2026-10-18 with Sunday rule | Oct 19, Oct 26 | Pass |
| Nov 15, 2026 is a Sunday (semi-monthly) | Moves to Nov 16 | Pass |
| 3 members, one with 2 ulo, PHP 1,000 hulog | 4 rounds, pot PHP 4,000 | Pass |
| No fee | Every member's net = 0 | Pass |
| 2% fee on PHP 4,000 pot | Fee PHP 80, net PHP 3,920 | Pass |
| Statuses on 2026-02-10 | done, late, collecting, upcoming | Pass |
| Same seed twice | Same order; hand counts kept | Pass |
| Peso format / parse | `₱1,234,567.89`, `"1,500.50"` -> 150050 | Pass |
| CSV cell `=HYPERLINK("x")` | Prefixed with `'` and quoted | Pass |
| Bad backups (not JSON, amount 0, Feb 30, HTML in name, stray paid keys) | Rejected or cleaned | Pass |
| Sample group on 2026-10-21 | Starts Sep 15; rounds 1-4 = done, done, late, collecting | Pass |
| Chat summary | 10 round lines and a "Waiting for hulog from" line | Pass |

### Step 6: Built the page (`index.html`, HTML)

A skeleton with a skip link, a sticky header (group picker, New group, theme switch), a summary area, five ARIA tabs (Schedule, Hulog tracker, Members & bunutan, Settings, Share & backup) and an About section with the problem, users, features, tech and install notes.

### Step 7: Built the interface (`js/hulog-app.js`, JavaScript)

State lives in one object; every action changes the state, calls `renderAll()` and saves. All user text is escaped before it goes into HTML. One click listener handles every button through `data-act` attributes. Destructive actions use "tap again to confirm" instead of browser pop-ups. Tabs support arrow keys. The tracker boxes have full labels such as "Mark Bong paid for round 3 (Oct 15), late".

### Step 8: Styling (`css/hulog.css`, CSS)

A "passbook" design: cool paper background, navy ink, a cobalt accent, gold for payouts, and green, amber and red only for status. The round counter is drawn as a tilted, dashed "stamp". All colours are tokens with a full dark theme, and wide tables scroll inside their own box. A print stylesheet hides the navigation.

### Step 9: Offline support and single-file build

Added `sw.js` (caches the app files), `manifest.webmanifest` and `favicon.svg`. Wrote `tools/build-demo.js`, which inlines the CSS and JavaScript into `demo/index.html` (80 KB; 22 KB gzipped) and marks it as the standalone build, where download and print buttons are hidden.

### Step 10: Browser testing (`tests/ui.e2e.js`, Playwright)

Both `index.html` and `demo/index.html` were opened at 1280px and 390px wide, in light and dark: 8 combinations, each checking all 5 tabs for horizontal scrolling, the body background colour, and page errors. The full flow was then tested: tap a hulog box (collection changes), add a member (10 -> 11 rounds), draw twice with the same seed (same order), change to monthly and PHP 2,500 (pot PHP 27,500 for 11 ulo), reject a negative amount, back up and restore (2 groups), reject a broken backup, reload (data kept), toggle the theme. **Result: 44/44 checks passed on the first run.**

Looking at the screenshots found two layout issues: on a phone the header wrapped onto three rows, and the long frequency name made the heading crowded. Fixed by making the group picker fill the second row and by using the short frequency name in the heading. Re-run: 44/44 passed.

**Measured sizes:** `hulog-core.js` 6,640 bytes gzipped, `hulog-app.js` 9,822 bytes (16.5 KB of JavaScript in total), `hulog.css` 4,615 bytes, `index.html` 2,463 bytes. The app makes no required external requests (Google Fonts is optional). Lighthouse was not run.

### Step 11: Documentation

Wrote README.md (features, setup, customization, roadmap, `claude-improve`), docs/TUTORIAL.md (architecture, file by file, 3 exercises), docs/DEPLOYMENT.md (double-click publisher, GitHub Desktop, git CLI, Pages, versioning, custom domain, cPanel), CHANGELOG.md, LICENSE (MIT), `.gitignore`, `.gitattributes` and `package.json`.

### Step 12: Showcase artifact

The single-file build was published to the Claude artifacts gallery as **"Showcase · Hulog Paluwagan Planner"**: the working app with the sample group and the About section. The publish tool warned that download links do nothing inside the gallery viewer; those buttons are already hidden in the standalone build, and the Copy buttons do the same job there.

### Step 13: Featured image

A 1200x630 HTML scene (dark grid, emerald glow, the project name, a "Next payout" card with a tracker grid, and chips) was rendered by Playwright at 2x and saved as a JPG with Pillow. The fonts were installed from npm (`@fontsource`) because Google Fonts is blocked in the build sandbox, including the latin-ext files so the peso sign renders. **Problem:** in the first render the title wrapped onto three lines and ran into the chips and the small logo. **Fix:** smaller title on two lines, a wider text column, and the bottom-left logo and fourth chip removed. The final image was copied to `.github/social-preview.jpg` (README banner and GitHub Social preview).

### Step 14: The one-click GitHub publisher

`publish-to-github.bat` and `publish-to-github.ps1` were based on the Presyo Menu Board template (downloaded successfully). That copy did not yet have the "LAST STEP" Social-preview block, so it was added, along with skipping `.github/*` in the release zip. Both files are ASCII with Windows (CRLF) line endings.

**Test:** PowerShell 7.4.6 for Linux ran the script on a copy of the project, with a stand-in `gh` command that logs its arguments, and with Git configured to send `https://github.com/efraimray/...` to a local bare repository.

- The first test attempt failed at `git push`. The cause was in the test setup (the redirect path was missing a trailing slash), not in the script. After fixing the setup:
- **Run 1 (exit 0):** created the Git repo, set the commit name and private email, committed "Hulog Paluwagan Planner v1.0.0", created the repository, pushed `main`, added 8 topics and the `claude-improve` label, tagged and pushed `v1.0.0`, built the zip (19 files, all under `hulog-paluwagan/`, with no `.git`, `.github` or publisher files), created the release, turned on Pages, and the LAST STEP block found `.github/social-preview.jpg`.
- **Run 2 (exit 0):** "No new changes to commit", reused the repository, "Release v1.0.0 already exists", no errors.

The project is published by **double-clicking `publish-to-github.bat`** on Efraim's Windows PC. Cloud runs cannot create repositories.

### Step 15: Blogger post

The post was generated by a script from the reference template (Bukas Hours): the template's scoped CSS and helper script copied word for word, plus a project block (`hpd-` demo, `hps-` slider scenes, `dfaq-` FAQ). It has a blank screenshot slot after the meta bar, a working mini demo (tap hulog boxes, run the seeded draw), measured numbers only, three real code excerpts, three HTML recreations of the interface, and 6 FAQ questions. The visible FAQ and the `FAQPage` schema come from the same list in the script.

Checks: the post's script passed `node --check`; the JSON-LD parsed with `TechArticle` and `FAQPage` in one `@graph`; all 6 questions and answers match the visible text exactly; the Labels line starts with "Projects", ends with "Efraim Ray, Web Developer in Bukidnon" and is 196 of 200 characters; the search description is 140 characters. Playwright rendered it in a light and a dark page at 900px and 390px: no horizontal scroll, no errors, the demo, draw, FAQ, code tabs and slider all worked (4/4).

### Step 16: Packaging

The project folder was zipped as `hulog-paluwagan.zip` with the folder at the top level, keeping `.gitignore`, `.gitattributes`, `.github/` and the publisher files, and without any `.git` folder.

## 4. What You Received

| Deliverable | Where it lives |
|---|---|
| Project zip (code, docs, tests, publisher) | `hulog-paluwagan.zip` (sent in the chat) |
| The app | `index.html`, `css/`, `js/`, `sw.js`, `manifest.webmanifest`, `favicon.svg` |
| Single-file demo | `demo/index.html` |
| Showcase artifact | Claude artifacts gallery: "Showcase · Hulog Paluwagan Planner" |
| Tests | `tests/core.test.js` (12 unit), `tests/ui.e2e.js` (44 browser checks) |
| Docs | `README.md`, `docs/TUTORIAL.md`, `docs/DEPLOYMENT.md`, `docs/BUILD-LOG.md`, `CHANGELOG.md` |
| One-click publisher | `publish-to-github.bat` + `publish-to-github.ps1` |
| Featured image | `hulog-paluwagan-featured.jpg` (sent) and `.github/social-preview.jpg` |
| Blogger post | `2026-10-21-blogger-hulog-paluwagan.html` (sent) |

## 5. Known Limits and What's Next

**Honest limits**

- Data is stored only in one browser. There is no sync between phones; use the backup to move a group.
- Only full payments are tracked (paid / not paid per round). Partial and advance payments are not yet supported.
- Payouts are not moved for public holidays, only for Sundays.
- Adding a member after the cycle has started adds their slot at the end and marks their earlier rounds as unpaid (late), which is correct for the math but may need explaining to the group.
- Tested in Chromium (Playwright). Not yet tested on Safari/iOS or on a real installed PWA on a phone. Lighthouse was not run.
- It is a planning tool only; it does not collect or move money.

**Roadmap**

1. Partial and advance payments, plus per-member reminder messages.
2. A read-only share link for members.
3. Philippine holiday rule for payout dates.
4. Filipino and Cebuano interface.

**Want a change?** Open an issue on GitHub with the label `claude-improve`. The nightly run will implement it, bump the version, update this log and prepare a new release.
