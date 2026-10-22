# Catspirits · Cyber Jumper

**Kamerával vezérelt, aktív mozgásjáték: a tested mozdulataival irányítod Bitet.** Ugorj, hajolj le, és dőlj oldalra öt neonvilágon át a [catspirits.com](https://catspirits.com) játékában! A mozgást a böngésző helyben követi, a kamerakép a gépeden marad. Magyarul, angolul és németül játszható. Kamera nélkül billentyűvel és érintéssel is működik.

[English README](README.md) · [Mozgás és vezérlés](docs/game.md) · [Neon Blade kardos játék](docs/sword-tracking.md) · [Neon Pop célzós játék](docs/neon-pop.md) · [Cloudflare útmutató](docs/cloudflare.md)

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

A kamerás mozgás az alapértelmezett vezérlés. Nyomd meg a **Kamera indítása** gombot, engedélyezd a hozzáférést, és állj egyenesen úgy, hogy a vállad és a csípőd látszódjon. Kalibrálás után ugrással, lehajolással és oldalra dőléssel játszhatsz. A kamera az indítógomb megnyomásáig nem kapcsol be. Kamera nélküli játékhoz válaszd a billentyűs/érintéses módot. A képet a böngésző helyben dolgozza fel, nem rögzítjük vagy küldjük játékszerverre. Az első indításhoz internet kell a MediaPipe és a modell letöltéséhez; a billentyűs/érintéses játék ezeket nem tölti le. Kamerához HTTPS vagy localhost szükséges. A szintetikus próbák mellett az emberes pontosságot még ellenőrizni kell.

A mentés saját `catspirits.cyber-jumper.v1` kulcsot használ, az eredeti app mentését nem módosítja. A localhost és a majdani catspirits.com külön böngészős mentést kap. Nincs fiók, mérés, szerveres ranglista vagy felhőmentés.

## Neon Blade · kamerás kardkaland

A [Neon Blade](https://catspirits.com/?game=blade&lang=hu) külön választható, egyperces kardos játék. A Puppet2-ben használt négysávos rózsaszín–zöld, puha jelölőbottal vághatók a kristályok. Az 1. szinten bármilyen irányú vágás jó, tüskék nélkül. A 2. szinten a nyilakat kell követni; a második hullámtól piros tüskék is jönnek. Minden kristály külön aktív, egy suhintás többet is eltalálhat. Három hullám, aranykristályok, kombók és legfeljebb négyszeres pontszorzó; egérrel és érintéssel is kipróbálható. A két vezérlés rekordja külön tárolódik.

A kardkövetés helyben fut, testkövető modell és 3D motor nélkül. A gyors natív képbemenet mellett megmarad a kompatibilis tartalékút. A bot méretei és a működés részletei: [kardos útmutató](docs/sword-tracking.md). Az átvett optimalizálások: [Puppet2-port](docs/puppet2-port.md).

## Licenc, biztonság és erőforrások

A saját kód [MIT-licencű](LICENSE). A Three.js, MediaPipe és a Google testkövető modell saját licencekkel rendelkezik; a [külső licencek tájékoztatója](public/licenses/THIRD-PARTY-NOTICES.txt) és teljes szövege a webes buildben is elérhető. A kamera futtatókörnyezete és modellje ugyanerről a webhelyről töltődik le, külső CDN-kérés nélkül. A képkockák helyben maradnak. A Cloudflare tárhely és botvédelem IP-címet, technikai kérésadatokat és biztonsági sütiket kezelhet; ezt a játék adatvédelmi menüje is jelzi.

Játék közben legfeljebb 60, menüben 30 renderfrissítés történik másodpercenként. Háttérbe kerülő oldalon a renderelés, kamera és hang leáll. A grafikai rajzpuffer körülbelül 1080p képpontra korlátozott. Az aktív testkövetés ettől még használ CPU/GPU-t és akkumulátort.

[Biztonsági hibák privát bejelentése](SECURITY.md) · [Ellenőrzés és korlátai](docs/security-review.md).


## Neon Pop · célzós tesztjáték

A [Neon Pop](https://catspirits.com/?game=pop&lang=hu) külön, 45 másodperces célzós tesztjáték. A felbukkanó fénylényeket kamerával követett kézzel vagy jelölőbottal lehet lecsapni; egérrel és érintéssel is működik. Mindkét kéz és minden célpont külön aktív, nincs kötelező vágási irány. A körív mutatja a célpont hátralévő idejét.

Kézi módban a meglévő, helyben futó modell a csuklókat figyeli; a váll, könyök és kéz legyen látható. A kardos mód csak a könnyebb színkövetést használja. Nincs kameraképfeltöltés, és egyszerre csak a kiválasztott követő fut. A valódi kamerás pontosságot még érdemes különféle telefonokon kipróbálni.
