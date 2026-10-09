# Catspirits · Cyber Jumper

Önálló robotkaland a **catspirits.com** számára. Öt világ, ugrás és lehajolás, kristályok, pajzsok, robotszínek, saját zene és négy szakaszt mutató pályaelőnézet. Billentyűvel, érintéssel vagy opcionálisan kamerás mozgással játszható.

[English README](README.md) · [Vezérlés / controls](docs/game.md) · [Cloudflare útmutató](docs/cloudflare.md)

A repó minden szükséges forrást, függőséget, tesztet és saját buildet tartalmaz. Nem kell hozzá az eredeti avataros alkalmazás, AI-fiók, API-kulcs, backend vagy helyi kamerasegéd.

## Indítás

Node **24.15.0** mellett:

```sh
npm ci
npm run dev
```

Nyisd meg a Vite által kiírt címet. Magyar: `/?lang=hu`, angol: `/?lang=en`, német: `/?lang=de`. A kezdőlapi nyelvválasztó megjegyzi a választást, és megőrzi az ebben a játékban mentett eredményeket. Elsőbbséget kap a link nyelve, majd a mentett választás, végül a böngésző nyelvi preferencialistájának első támogatott nyelve. Ha nincs egyezés, alapértelmezésként angolul indul.

## Ellenőrzés és feltölthető build

```sh
npm run check
npm run preview
```

A feltölthető mappa: **`dist/`**. Minden eszközútvonal relatív; a játék a domain gyökerében és egy almappában is működik. Nincs beállítandó környezeti változó.

## Cloudflare és catspirits.com

A játék a meglévő **catspirits** Cloudflare Workerbe kerül, amelyhez már hozzá van rendelve a **catspirits.com**. A GitHub build beállításai: ág `main`, build `npm run build`, deploy `npx wrangler deploy`, Node `24.15.0`, projektgyökér a repó gyökere. A `wrangler.jsonc` a `dist` mappát Workers Static Assets tartalomként adja meg, és tartalmazza a már beállított saját domaint.

A helyi publikálási parancs `npm run deploy:cloudflare`; a feltöltés nélküli konfigurációellenőrzés `npm run check:cloudflare`. A [Cloudflare útmutató](docs/cloudflare.md) a Worker beállításait írja le. A GitHub Actions ellenőrzés továbbra is csak tesztel és buildel; a Cloudflare-hez kötött `main` ág frissítése indít éles publikálást.

## Kamera és mentés

A kamera csak a kamerás mód kiválasztása és az indítás után kapcsolódik be. A képet a böngésző helyben dolgozza fel, nem rögzítjük vagy küldjük játékszerverre. Az első indításhoz internet kell a MediaPipe és a modell letöltéséhez; a billentyűs/érintéses játék ezeket nem tölti le. Kamerához HTTPS vagy localhost szükséges. A szintetikus próbák mellett az emberes pontosságot még ellenőrizni kell.

A mentés saját `catspirits.cyber-jumper.v1` kulcsot használ, az eredeti app mentését nem módosítja. A localhost és a majdani catspirits.com külön böngészős mentést kap. Nincs fiók, mérés, szerveres ranglista vagy felhőmentés.
