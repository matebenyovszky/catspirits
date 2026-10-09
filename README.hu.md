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

Nyisd meg a Vite által kiírt címet. Magyar: `/?lang=hu`, angol: `/?lang=en`. A kezdőlapi nyelvválasztó megjegyzi a választást, és megőrzi az ebben a játékban mentett eredményeket. Választás nélkül a böngésző nyelve alapján indul; a magyaron kívüli nyelveknél angolul.

## Ellenőrzés és feltölthető build

```sh
npm run check
npm run preview
```

A feltölthető mappa: **`dist/`**. Minden eszközútvonal relatív; a játék a domain gyökerében és egy almappában is működik. Nincs beállítandó környezeti változó.

## Cloudflare és catspirits.com

Cloudflare Pages-ben kapcsolható ehhez a GitHub repóhoz: ág `main`, build `npm run build`, kimenet `dist`, Node `24.15.0`, projektgyökér a repó gyökere. Ezután a Pages projekt **Custom domains** részében adható hozzá a `catspirits.com`. A gyökérdomainhez ugyanabban a Cloudflare-fiókban kell lennie a domain DNS-zónájának és oda kell mutatnia a névszervereknek; a pontos lépéseket és a hivatalos forrásokat a [Cloudflare útmutató](docs/cloudflare.md) tartalmazza.

Ez a projektelőkészítés még nem tett közzé élő weboldalt és nem módosította a domain DNS-ét. A GitHub-ellenőrzés tesztel és buildel; nem publikál automatikusan.

## Kamera és mentés

A kamera csak a kamerás mód kiválasztása és az indítás után kapcsolódik be. A képet a böngésző helyben dolgozza fel, nem rögzítjük vagy küldjük játékszerverre. Az első indításhoz internet kell a MediaPipe és a modell letöltéséhez; a billentyűs/érintéses játék ezeket nem tölti le. Kamerához HTTPS vagy localhost szükséges. A szintetikus próbák mellett az emberes pontosságot még ellenőrizni kell.

A mentés saját `catspirits.cyber-jumper.v1` kulcsot használ, az eredeti app mentését nem módosítja. A localhost és a majdani catspirits.com külön böngészős mentést kap. Nincs fiók, mérés, szerveres ranglista vagy felhőmentés.
