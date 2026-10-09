# Deploy Catspirits to Cloudflare Workers

The existing **catspirits** Worker is connected to **matebenyovszky/catspirits** and the custom domain **catspirits.com**. This repository deploys the built game using **Workers Static Assets**. No application-side Worker script, database, API keys or runtime secrets are needed.

## Build settings

In the Worker's **Settings → Builds** section:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `/` (repository root) |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Node version | `24.15.0`, specified by `.node-version` |

The build generates `dist`. `wrangler.jsonc` identifies that directory with `assets.directory`, names the existing Worker `catspirits`, and declares the already assigned `catspirits.com` custom domain. The `workers.dev` and preview URLs remain disabled, matching the current dashboard settings.

Pushes to `main` trigger Cloudflare's connected build and production deployment. The GitHub Actions workflow separately tests and builds the game without deployment credentials. Verify `https://catspirits.com/?lang=en`, `https://catspirits.com/?lang=hu` and `https://catspirits.com/?lang=de` after a successful deployment.

Official references: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/get-started/), [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

## Why the first deployment failed

The game build succeeded, but the first repository configuration used `pages_build_output_dir`, which belongs to Cloudflare Pages. The connected service is a Worker and runs `wrangler deploy`, so it could not find either a Worker entry point or a static assets directory. Workers Static Assets uses `assets.directory: "./dist"` instead. This site does not need `main` because it serves static assets directly.

## Local preview and validation

```sh
npm ci
npm run build
npm run check:cloudflare
npm run preview:cloudflare
```

`check:cloudflare` runs a deployment dry run without uploading. `preview:cloudflare` serves the static output on `http://127.0.0.1:8788` using the Workers runtime. Neither publishes anything. `npm run preview` provides the simpler Vite preview.

## Optional command-line deployment

For an authenticated Cloudflare account with access to the existing Worker:

```sh
npx wrangler login
npm run deploy:cloudflare
```

This builds the game and executes `wrangler deploy`. The repository configuration contains no credentials or account IDs.

## Browser resources

`public/_headers` is copied into `dist` and supplies content-type protection, a referrer policy, a camera-only permissions policy and long-lived caching for hashed assets. It leaves iframe embedding available. [Workers Static Assets supports these headers](https://developers.cloudflare.com/workers/static-assets/headers/).

Camera movement is the default control mode. After the player presses Start camera, it downloads WASM from `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm` and the Lite pose model from Google Storage. Keyboard/touch play needs neither. If a site-wide Content Security Policy is added later, allow the necessary runtime/model connections, blob workers and WebAssembly compilation; verify the camera after applying it.

An embedding site must allow the camera and full screen explicitly if it wants those features:

```html
<iframe src="https://catspirits.com/?lang=en"
        title="Catspirits Cyber Jumper" width="100%" height="720"
        style="border:0;border-radius:20px" allow="camera; fullscreen" allowfullscreen>
</iframe>
```

Remove `camera` from `allow` for keyboard/touch-only embeds.
