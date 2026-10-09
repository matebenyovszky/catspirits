# Deploy Catspirits to Cloudflare Pages

The output is a static site. No Worker code, database, API keys or environment secrets are required. These instructions prepare a deployment; no Cloudflare project or DNS change has been made yet.

## GitHub integration (recommended)

1. In Cloudflare, open **Workers & Pages**, create a **Pages** project and choose Git integration.
2. Connect **matebenyovszky/catspirits**. Use `main` as the production branch and the repository root as the root directory.
3. Set the build command to **`npm run build`** and the output directory to **`dist`**. Use Node **24.15.0** (`.node-version`; set `NODE_VERSION=24.15.0` in the build settings if necessary).
4. Deploy and verify the generated `pages.dev` URL in English and Hungarian. Check keyboard/touch, audio and optional camera mode over HTTPS.
5. In that Pages project, open **Custom domains** and add **catspirits.com**. To use this apex domain, its DNS zone must be in the same Cloudflare account, with its nameservers pointing to Cloudflare. Follow the dashboard's domain-verification steps.
6. Add `www.catspirits.com` only if wanted, then configure a redirect to the apex in Cloudflare. Do not add DNS records for a Pages hostname before associating it through Custom domains.

After Git integration is connected, Cloudflare builds pushes to `main` and can create branch previews. The repository's GitHub Actions workflow only runs tests and builds; it does not hold deployment credentials.

Official references: [build settings](https://developers.cloudflare.com/pages/configuration/build-configuration/), [Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/), [custom domains and DNS](https://developers.cloudflare.com/pages/configuration/custom-domains/).

## Local Cloudflare preview

```sh
npm ci
npm run build
npm run preview:cloudflare
```

Open `http://127.0.0.1:8788`. This serves the static output with Cloudflare's local Pages runtime, including the `_headers` rules. It does not publish anything. A simpler local preview is `npm run preview`.

## Optional command-line deployment

If an existing Pages project named `catspirits` is ready and you have authenticated with your Cloudflare account:

```sh
npx wrangler login
npm run deploy:cloudflare
```

Choose Git integration before creating the project if you want GitHub-driven publishing. A project created using Direct Upload cannot later switch to Git integration; Cloudflare documents this [here](https://developers.cloudflare.com/pages/get-started/direct-upload/).

`wrangler.jsonc` specifies the project name, compatibility date and `dist` directory. It contains no account IDs or credentials.

## Browser resources

`public/_headers` is copied into `dist` and supplies content-type protection, a referrer policy, a camera-only permissions policy and long-lived caching for hashed assets. It leaves iframe embedding available. These headers are recognised by [Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/headers/).

The optional camera downloads WASM from `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm` and the Lite pose model from Google Storage. Keyboard/touch play needs neither. If a site-wide Content Security Policy is added later, allow the necessary runtime/model connections, blob workers and WebAssembly compilation; verify the camera after applying it.

An embedding site must allow the camera and full screen explicitly if it wants those features:

```html
<iframe src="https://catspirits.com/?lang=en"
        title="Catspirits Cyber Jumper" width="100%" height="720"
        style="border:0;border-radius:20px" allow="camera; fullscreen" allowfullscreen>
</iframe>
```

Remove `camera` from `allow` for keyboard/touch-only embeds.
