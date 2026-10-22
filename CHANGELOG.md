# Changelog

All notable changes to Hulog Paluwagan Planner are listed here. The project uses [semantic versioning](https://semver.org/).

## [1.0.0] - 2026-10-21

### Added
- Payout schedule for weekly, every 2 weeks, kinsenas at katapusan (15th and end of month) and monthly groups, with short-month clamping and an optional Sunday-to-Monday rule.
- Members can hold 1 to 5 ulo (slots); the pot is the hulog times the total ulo.
- Seeded bunutan (draw lots): the same seed always gives the same payout order, so the group can check the draw.
- Manual reordering with up/down buttons and an A-Z order.
- Hulog tracker grid with paid, not yet, late and payout-round states, plus "mark all paid" for the current round.
- Summary strip: next payout, collection meter, pot per round and members behind on hulog.
- Per-member totals (pays in, receives, paid so far) and an optional organizer fee (fixed or percent, capped at 20%).
- Messenger-ready group chat summary, CSV export with formula-injection protection, JSON backup and validated restore.
- Light and dark themes, keyboard-friendly tabs, offline support (service worker + web app manifest).
- 12 unit tests (`node --test`) and a Playwright browser test.
- One-click publisher for Windows: `publish-to-github.bat`.
