# Catspirits · Kamerával irányítható mozgásjátékok

**Kamerával vezérelt, aktív mozgásjáték: a tested mozdulataival irányítod Bitet.** Ugorj, hajolj le, és dőlj oldalra öt neonvilágon át a [catspirits.com](https://catspirits.com) játékában! A mozgást a böngésző helyben követi, a kamerakép a gépeden marad. Magyarul, angolul és németül játszható. A kamera mellett billentyűvel és érintéssel is irányíthatod a játékot.

[Motion Arcade – hat játszható küldetés](https://catspirits.com/?game=arcade&lang=hu) · [Standi bemutató és játékötletek](docs/festival-hu.md) · [English README](README.md) · [Mozgás és vezérlés](docs/game.md) · [Neon Blade kardos játék](docs/sword-tracking.md) · [Neon Pop célzós játék](docs/neon-pop.md) · [Cloudflare útmutató](docs/cloudflare.md)

A repó minden szükséges forrást, függőséget, tesztet és saját buildet tartalmaz. Nem kell hozzá az eredeti avataros alkalmazás, AI-fiók, API-kulcs, backend vagy helyi kamerasegéd.

## Galaxisfa

A játékválasztóban a **Galaxisfa** egy 3D-s merülés a csillagtengerben. A nyolc ágon tizenhat fényhernyót kell elkapni, majd a törzs túloldalán megkeresni a Csillagmagot. Húzással vagy a nyilakkal fordulhatsz, a látható hernyókat kattintással, koppintással vagy Tab és Enter billentyűvel foghatod el. A helyi kamerakövetés csippentéssel működteti a hernyókat és a navigációs nyilakat. Tartott csippentéssel fordulhatsz, két kézzel közelíthetsz. A Tératlasz macOS-segédjével az AirPods fejkövetés az 5173-as fejlesztői és a 4173-as előnézeti localhost porton használható.

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

A CatSpirits megnyitásakor engedélyezd a kamerát. Minden játékhoz szükség van rá. A Cyber Jumperben a **Testkalibrálás** után állj egyenesen úgy, hogy a vállad és a csípőd látszódjon. Kalibrálás után ugrással, lehajolással és oldalra dőléssel játszhatsz. A böngésző helyben dolgozza fel a képet, a képkockák az eszközödön maradnak. Az első indításkor a MediaPipe és a kéz- és testkövető modellek erről az oldalról töltődnek le. A kamerához HTTPS vagy localhost szükséges.

A mentés saját `catspirits.cyber-jumper.v1` kulcsot használ, az eredeti app mentését nem módosítja. A localhost és a majdani catspirits.com külön böngészős mentést kap. Nincs fiók, mérés, szerveres ranglista vagy felhőmentés.

## Neon Blade · kamerás kardkaland

A [Neon Blade](https://catspirits.com/?game=blade&lang=hu) külön választható, egyperces kardos játék. A Puppet2-ben használt négysávos rózsaszín–zöld, puha jelölőbottal vághatók a kristályok. Az 1. szinten bármilyen irányú vágás jó, tüskék nélkül. A 2. szinten a nyilakat kell követni; a második hullámtól piros tüskék is jönnek. Minden kristály külön aktív, egy suhintás többet is eltalálhat. Három hullám, aranykristályok, kombók és legfeljebb négyszeres pontszorzó; egérrel és érintéssel is kipróbálható. A két vezérlés rekordja külön tárolódik.

A kardkövetés helyben fut, és játék közben a közös kamerát használja. A gyors natív képbemenet mellett megmarad a kompatibilis tartalékút. [A bot méretei és követése](docs/sword-tracking.md) · [Puppet2-port](docs/puppet2-port.md)

## Licenc, biztonság és erőforrások

A saját kód [MIT-licencű](LICENSE). A Three.js, MediaPipe és a Google test- és kézkövető modelljei saját licencekkel rendelkezik; a [külső licencek tájékoztatója](public/licenses/THIRD-PARTY-NOTICES.txt) és teljes szövege a webes buildben is elérhető. A kamera futtatókörnyezete és modellje ugyanerről a webhelyről töltődik le, külső CDN-kérés nélkül. A képkockák helyben maradnak. A Cloudflare tárhely és botvédelem IP-címet, technikai kérésadatokat és biztonsági sütiket kezelhet; ezt a játék adatvédelmi menüje is jelzi.

Játék közben legfeljebb 60, menüben 30 renderfrissítés történik másodpercenként. Háttérbe kerülő oldalon a renderelés, kamera és hang leáll. A grafikai rajzpuffer körülbelül 1080p képpontra korlátozott. Az aktív testkövetés ettől még használ CPU/GPU-t és akkumulátort.

[Biztonsági hibák privát bejelentése](SECURITY.md) · [Ellenőrzés és korlátai](docs/security-review.md).


## Neon Pop · célzós tesztjáték

A [Neon Pop](https://catspirits.com/?game=pop&lang=hu) külön, 45 másodperces célzós tesztjáték. A felbukkanó fénylényeket kamerával követett kézzel vagy jelölőbottal lehet lecsapni; egérrel és érintéssel is működik. Mindkét kéz és minden célpont külön aktív, nincs kötelező vágási irány. A körív mutatja a célpont hátralévő idejét.

Kézi módban a közös testkövető a csuklókat figyeli. A váll, könyök és kéz legyen látható. Botos játékban a színkövető ugyanazt a kameraképet használja. [Neon Pop vezérlése](docs/neon-pop.md)


## Bit Rescue — virtuális robotkar

[Bit Rescue indítása](https://catspirits.com/?game=robot&lang=hu): 3D-s robotkarral, kamerával követett váll–könyök–kéz mozgással, alapértelmezett kézcsukásos fogással és automatikus emeléssel, egérrel, érintéssel vagy billentyűvel vigyél három energiacellát a megfelelő dokkhoz. Add át Bitnek a vezérlést, és ha elakad, vedd vissza, kerüld meg az akadályt, majd add vissza neki. Az első küldetés szabad dokkolás, a második kerülőutat igényel. A vezérlés szabályalapú, nem tanított AI; a játék nem rögzít demonstrációkat, és nem kapcsolódik fizikai robothoz. A 3D nézetben külön kapcsolható kísérleti magasságvezérlés is: a kalibrált tenyérméret változása vezérli az emelést. [Vezérlés és fejlesztői dokumentáció](docs/robot-rescue.md).


### Cyber-elektrós zene és játékhangok

A Cyber Jumper alatt 138 BPM-es synthwave, a Neon Popban 132 BPM-es electro-pop, a Neon Blade-ben 148 BPM-es techno, a Bit Rescue-ban 128 BPM-es arpeggiós téma szól. A hat fesztiválküldetés mindegyikéhez saját kísérőzene készült. A Magnet Meadow győzelmekor Beethoven V. szimfóniájának közkincs nyitómotívumát játssza a szinti. A böngésző minden hangot és effektet helyben szólaltat meg. [A kotta és a feldolgozás forrása](public/licenses/THIRD-PARTY-NOTICES.txt)

A **hangszóróikon** minden játékban megjegyzi a választást. A Cyber Jumperben a zene és az effektek hangereje külön is állítható. A némítás az előre beütemezett hangokat is leállítja.

### Kézkurzor a teljes felületen

A kézkurzor a kameraengedély megadása után automatikusan elindul. Nyitott kézzel mozgasd a kurzort. Csippents a hüvelyk- és mutatóujjaddal, majd kattintáshoz engedd el őket. Tartott csippentéssel húzhatsz, a képernyőszélen várva pedig görgethetsz a menükben. A menüre célzott csippentést a menü kapja, a pályán pedig az adott játék kezeli a saját gesztusait.

A jobb felső teljesképernyő-ikon az aktuális játékteret nagyítja ki a vezérlőkkel és az élő kameraelőnézettel együtt. Csippentésre a játék kitölti a böngészőablakot. Kattintással vagy koppintással a támogatott böngészőkben a teljes kijelzőt is használhatod. Visszalépéshez használd újra az ikont vagy nyomd meg az Esc billentyűt.

Játék- és nyelvváltáskor ugyanaz a kamera és kézkövető működik tovább. A háttérbe tett lap elengedi a kamerát, visszatéréskor újraindítja. Ha a hozzáférés sikertelen, a **Kamera újraindítása** gombbal próbálkozhatsz újra. A kézvesztés és az irányítás átadása megszakítja a csippentést. Új csippentés előtt nyisd ki a kezed.

### Stabil csippentés és kamerajelölések

A csippentés a nyitott kéz utolsó kurzorhelyét rögzíti, rövid elengedési türelmi idővel. Gomboknál és linkeknél megmarad a célpont; a játéktér és csúszkák húzása 200 ms tartás és tartós, legalább 24 képernyőpixelnyi tenyérmozgás után indul. Kézvesztés megszakítja a kattintást.

A jobb alsó sarokban lévő, tükrözött előnézet megmutatja a követett testet és mindkét kéz ujjait. Botos játékban ugyanitt a bot vonala és az érzékelt gyűrűk is megjelennek. Ha valamelyik már nincs a képen, a hozzá tartozó vonalak eltűnnek.
