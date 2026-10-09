# Standalone extraction checks — 2026-10-09

- Clean locked dependency installation, TypeScript check and production build passed in this repository. Only Three.js and MediaPipe are runtime dependencies. The build does not contain avatar models, AI/chat code or local helper requests.
- 117 tests pass across eight files. Course tests cover all five worlds, jump/duck combinations, progress, scores, retries, shields and tracking loss. Camera tests use synthetic landmarks and lifecycle doubles.
- Translation tests cover URL/stored/browser language selection, blocked storage, document metadata, numbers, accessible labels, preserved HTML/SVG, menu screens, camera errors and keyboard fallback. Interface tests verify the Catspirits save does not modify the original application's save.
- The production English game ran in the Codex browser: an actual keyboard jump cleared the first gate with all three lives, followed by the English pause screen. Hungarian/English home-screen switching, English help, world list and game-over output were also checked.
- English layouts were visually checked at desktop 1280 × 720 and phone 390 × 844. The temporary viewport override was reset afterwards.
- Cloudflare's local Pages runtime served the production build with HTTP 200 and parsed all three `_headers` rules. The game also loaded in that runtime in the browser.
- `npm audit` reports no known vulnerabilities for the locked dependency set at the time of these checks.

No live Cloudflare deployment or domain/DNS change was performed. Real-person camera accuracy remains unmeasured; synthetic tests do not establish it.
