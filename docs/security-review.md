# Security, privacy, licences and resource review

Reviewed on 2026-10-09. This records a source/configuration review and specific checks, not a penetration-test certificate, legal opinion or promise of zero risk. The live domain is catspirits.com; other domains were reference-only and were not modified.

## Source and execution boundaries

The shipped application is a static Vite/TypeScript browser game. There is no application Worker script, backend API, login, database, payment flow or server-side player data. Cloudflare handles TLS, routing, static files and edge security. Repository configuration contains no runtime credentials. `.env`, local tools, audit captures and build outputs are ignored.

Production has no development control object. DOM HTML comes from authored templates, fixed dictionaries, authored course data and validated numeric saves. Camera device labels and error messages are displayed as text. URL languages are restricted to en/hu/de. Save values are reconstructed into a fixed schema with bounded stars, suit and volumes. There is no remote HTML, user-generated markup or external script CDN in the game.

Camera access is opt-in, requests video without audio, and never records or uploads frames/landmarks in application code. One image is in flight; decoded-frame deduplication, stale-frame rejection, timeouts, GPU-to-CPU recovery and cancellation prevent an unbounded image queue. Hidden/closed pages stop tracks and workers. The optional sword detector remains inactive in normal play. Images sent to its worker stay local; its purpose is entertainment, not identity or medically accurate measurement.

## Dependency and secret checks

- `npm audit` found **0 known vulnerabilities**, including development dependencies, at review time. CI repeats the audit and rejects moderate or higher findings.
- Gitleaks 8.30.1 scanned the complete Git history and the files selected for publication. No confirmed credential leak was found. Its generic-key detector initially flagged the public `catspirits.cyber-jumper.v1` localStorage namespace; only that exact string is allowlisted. The tool was downloaded from its official release and checked against the published SHA-256.
- GitHub dependency alerts/security updates, secret scanning/push protection and private vulnerability reporting are enabled. GitHub Actions use fixed commit hashes and read-only repository permissions. Dependabot proposes dependency/action updates; updates still need review and passing checks.
- Lockfile runtime dependencies are Three.js 0.182.0 (MIT) and MediaPipe Tasks Vision 0.10.32 (Apache-2.0). Optional development tools include libvips (LGPL) and Lightning CSS (MPL); these tools/binaries are not deployed as game assets. The development dependency tree should not be redistributed as if entirely MIT licensed.

Scanners cannot establish the absence of every secret or vulnerability. External package registries, browser engines, Cloudflare and upstream compiled WASM remain supply-chain dependencies.

### CodeQL findings reviewed

GitHub CodeQL default setup is enabled for JavaScript/TypeScript and GitHub Actions with the extended query suite. The initial analysis succeeded and reported three findings; all three were individually reviewed and dismissed as false positives, leaving **0 open findings**. No query or file was excluded from future analysis.

- Alert 1 (`js/remote-property-injection`, `ColorWandDetector.ts`): the writes target `Uint8Array`/`Int32Array` buffers, using numeric pixel indices and a numeric queue counter. Dimensions and RGBA length are validated and capped at 640×480 pixels. Each pixel is marked visited before enqueue; no string object property reaches these writes.
- Alerts 2 and 3 (`js/missing-origin-check`, pose and sword workers): both handlers run inside dedicated workers on private creator channels. They are not `Window.onmessage` handlers; the application does not forward Window messages or expose SharedWorker/BroadcastChannel entry points. Cross-origin documents cannot directly obtain these worker handles. A Window-origin check is not applicable to this transport.

These assessments must be revisited if message transport, worker ownership, index validation or buffer types change. Finding descriptions and dismissal reasons are retained in GitHub's code-scanning history.

## Licences and provenance

The user selected MIT for Catspirits-owned code. `LICENSE`, runtime third-party notices and full upstream licence texts ship with the website and are linked in its privacy/licences menu. Third-party components are not relicensed under MIT. The unchanged Google Pose Landmarker Lite float16 bundle v1 is self-hosted; the model card linked from the official bundle documentation specifies Apache-2.0. Its SHA-256 is verified before every dev/build preparation. Unmodified WASM assets are copied from the pinned, integrity-locked npm package. Updating MediaPipe requires reviewing asset paths, licences and model integrity; immutable asset paths must change with content.

Source came from the user's ClubGPT-Puppet2 checkout. The available tracked body-tracking/runner history identifies matebenyovszky as author. The extracted jumper and sword directories were untracked there, so their authorship cannot be established from Git. No foreign copyright header, third-party character model, recorded soundtrack, downloaded font, commercial VRM or AprilTag asset was found in the published source. Robot/scenery geometry and audio are generated by the game. **These facts do not prove ownership under employment/client agreements or rule out code copied without attribution.** Those agreements and any contributor rights must be confirmed by the rights holder. Brand/trademark clearance, patent clearance and similarity to other artwork were not established by this technical review.

MediaPipe's npm package lacks a separate LICENSE/NOTICE file. We therefore distribute the exact upstream v0.10.32 LICENSE (including its additional Lucent notice), retain unmodified runtime files, and identify upstream sources. This is not a reconstructed, exhaustive bill of every library statically linked into Google's WASM. Upstream packaging/provenance and applicable API terms remain a legal review boundary.

Sources: [MediaPipe source licence v0.10.32](https://github.com/google-ai-edge/mediapipe/blob/v0.10.32/LICENSE), [official pose bundle documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker), [linked BlazePose GHUM model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf).

## Browser and edge protections

The domain's DNSSEC validated through 1.1.1.1 with the AD flag. The www hostname redirects to HTTPS apex while preserving path/query. HTTPS/HSTS, Full (Strict), TLS minimum 1.2 and TLS 1.3 were checked in the domain configuration. This game-only domain uses null MX, deny-all SPF, reject DMARC and an empty wildcard DKIM key. Configure mail properly before introducing mail services.

Bot Fight Mode, browser integrity, managed WAF and DDoS protection remain active. Three custom block rules cover secret/CMS scanner paths, known scanner user agents and unsupported HTTP methods; a separate root-page burst rule protects HTML without limiting normal asset downloads. A few non-destructive live probes returned 403 for `.env`, `.git/config`, WordPress login, sqlmap user agent and POST to root, while the game returned 200. Rate-limit thresholds and DDoS capacity were not stress-tested. User agents are spoofable and path matching is not complete protection; nonexistent files still need safe 404 handling.

Site headers prohibit plugin objects, forms, base URL overrides and cross-origin framing. They restrict camera to self, disable microphone/geolocation/display capture/payment/USB, remove outgoing referrers and limit network/resource destinations. Cross-site iframe embedding is deliberately blocked. Hashed/versioned assets have immutable one-year caching; HTML is revalidated.

**The CSP is limited:** `script-src` and `default-src` are intentionally absent because Bot Fight Mode inserts dynamic inline code and a static response cannot generate fresh script nonces. Inline event attributes are prohibited, but script injection is not comprehensively blocked by this policy. Static nonces, disabling bot protection and `no-transform` were not used as workarounds. Stronger script CSP needs a separately verified nonce design. [Cloudflare documents the incompatibility and nonce requirement](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/#if-you-have-a-content-security-policy-csp).

## Privacy information and unresolved operator details

There are no ads or application analytics. Camera runtime/WASM/model are served from the game origin; Google/jsDelivr are not required runtime destinations. Inspected pinned JS/WASM did not identify a telemetry endpoint, synthetic worker tests completed with network destinations restricted, and external telemetry connections are blocked by CSP. This observation is version-specific; [Google's current MediaPipe terms](https://developers.google.com/edge/mediapipe/legal/tos) describe possible metrics collection and consent responsibilities, so future SDK changes require a new privacy review. Local inference is not a blanket legal assurance about all processing.

Cloudflare still processes hosting/security request metadata, including IP addresses, and may use security cookies or network-error reports. Progress/settings and language are saved in the browser under `catspirits.cyber-jumper.v1` and `catspirits.language.v1`. Players can delete them by clearing this site's data. Technical privacy information is available in all three game languages.

**The operator's legal identity/contact, processing legal basis, retention details, Cloudflare contract/transfer safeguards and complete applicable privacy notice have not been confirmed.** Do not describe the site as certified GDPR-compliant. A camera permission prompt is not a complete GDPR notice. The operator must supply these details and assess jurisdiction/audience, especially children, commercialization or future tracking. [EU Commission guidance lists the information to provide](https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en).

## Resource limits and validation

Render/physics updates are capped at 60/s in gameplay/camera setup and 30/s in menus. Hidden pages cancel their render loop, stop camera/audio and suspend the audio context. A deferred start cannot restart camera/gameplay after the page is hidden. Drawing buffers, including compositor sizing, are limited to roughly 1920×1080 pixels and DPR 1.5. These caps bound extra high-refresh/4K rendering; they do not bound all VRAM or total power.

The camera Lite model is about 5.5 MiB and the selected WASM variant about 10–11 MiB uncompressed, loaded only when the camera starts and cached. Keyboard/touch does not need them. Frame input is 320×240 in quick mode or up to 480×360 in steady mode. Tracking continues at available camera/inference speed, independently of render capping. It can consume significant client CPU/GPU/battery while active. Synthetic first-frame timing is not a sustained device benchmark or proof of human motion accuracy.

There is no per-request application Worker execution. [Cloudflare says static asset requests are free and unlimited](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/); other account features or future backend code may have separate costs. Generated resources are served directly and cached; no database, per-player polling or server inference is present.

Validation includes 155 passing tests across 13 files, strict TypeScript, production Vite build, Wrangler deployment dry run, CodeQL JavaScript/TypeScript and Actions analysis, 144 Hz rendering/hidden-page regression tests, 4K/8K pixel-budget tests, and real browser CPU/GPU worker startup with one synthetic blank frame under the site's headers. Human camera quality, sustained mobile thermals and independent penetration testing remain outside this evidence.
