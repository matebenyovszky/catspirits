# Catspirits a PlayIT-en

A Telekom PlayIT Show 2026. december 5–6-án lesz az MTK Sportparkban. A hat játék olyan standhoz készült, ahol valaki a sorból nézve is összekötheti a játékos mozdulatát a képernyőn történtekkel. [Hivatalos rendezvényoldal](https://playit.hu/) · [Motion Arcade játékok](https://catspirits.com/?game=arcade&lang=hu)

## Mit adj a látogató kezébe?

A játékválasztó **Standi bemutató** gombja kamerahasználat nélkül, zenével váltogatja a hat játékot. Az **Ezt játszom** gomb az éppen futó küldetéshez vezet.

Elsőre a **Glow Ferryt** érdemes megmutatni. Tartsd vízszintesen a puha botot, majd billentsd meg épp annyira, hogy a látogató lássa elindulni a kis utast. Add át neki a botot, mielőtt az utas elérné a szélét. Egyetlen ellendöntésből érthetővé válik, hogyan hat a valódi mozdulat a virtuális teherre.

| Játék | Az első feladat | Miért kérhet még egy kört? | Kapcsolat a robotikával |
| --- | --- | --- | --- |
| [Jungle Relay](https://catspirits.com/?game=arcade&mission=jungle&lang=hu) | A bot hegyével válts sávot. A jelzéshez érve suhintsd el az indát, a piros akadályt kerüld ki. | A pályaolvasás és az időzítés együtt adja a találatot. | Az útvonal és a szerszámművelet összehangolása. |
| [Glow Ferry](https://catspirits.com/?game=arcade&mission=ferry&lang=hu) | Vezesd a kis utast a rés magasságába. Amikor csúszni kezd, finoman billents vissza. | Nagy mozdulattal könnyű túlkorrigálni. Másodszorra próbálj kisebbet mozdulni. | Tehermozgatás és folyamatos visszacsatolás. |
| [Magnet Meadow](https://catspirits.com/?game=arcade&mission=herd&lang=hu) | Húzd a bot hegyét a kisállat elé, majd vezesd be az arany karámba. | Több állat együtt gyorsabban célba érhet, de a tavat is kerülniük kell. | Több önállóan mozgó szereplő irányítása egyetlen jellel. |
| [Bridge Foundry](https://catspirits.com/?game=arcade&mission=build&lang=hu) | A közeledő robot előtt építsd meg a járható híd következő részét. | Az építési sorrenden és a következő útvonal előkészítésén is múlik a konvoj sorsa. | Az ember megváltoztatja a terepet, az automata azon halad tovább. |
| [Prism Studio](https://catspirits.com/?game=arcade&mission=paint&lang=hu) | Válassz ecsetet, és vezesd végig a világító mintán. | Második próbára simábban, kevesebb kapkodással járhatod be az íveket. | Szerszámválasztás és pályakövetés, mint egy festőrobotnál. |
| [Orbit Rally](https://catspirits.com/?game=arcade&mission=rover&lang=hu) | A bot döntésével kormányozd a rovert a következő kapuhoz. | A korábban megkezdett, kisebb korrekcióval szebben be lehet állni a kapuba. | Jármű-távvezérlés kameraképről. |

Az Orbit Rally **3D · Követőkamera** gombjával menet közben is beülhetsz a rover mögé. A kapuk és a kormányzás változatlanok, így ugyanaz a feladat két nézetben is kipróbálható. [Orbit Rally 3D](https://catspirits.com/?game=arcade&mission=rover&lang=hu&view=3d)

Aki a konvojnak szívesen segített, annak a **Bit Rescue** jó következő állomás. Adja át a robotkar irányítását Bitnek a második küldetésben. Amikor az automata a pajzshoz ér, vegye vissza a kart, vezesse a másik oldalra, és adja vissza a vezérlést. Ez konkrét példát ad arra, mire való egy távoli emberi beavatkozás. [Bit Rescue, második küldetés](https://catspirits.com/?game=robot&level=2&lang=hu)

## A többi ötletből mi került bele?

A dzsungelfelfedezésből a háromsávos, suhintással bejárható küldetés került a csomagba. Rövid bemutatón könnyű megmutatni a következő döntést. Egy bejárható labirintushoz külön haladási és fordulási gesztus kellene. A két egyforma botot a jelenlegi követő nem különbözteti meg megbízhatóan. Kétkardos folytatás előtt külön azonosítható jelöléseket és kereszteződő botokkal végzett próbát érdemes készíteni.

A toronyvédelem és a térbeli blokképítés közös magja a Bridge Foundry. A látogató lerak egy darabot, majd azonnal látja, átjut-e rajta a robot. Egy külön térbeli kirakóban a következő kérdés a forgatás és az egymást takaró mezők kiválasztása lenne. A célzóeszköz és a második kéz gesztusainak egyidejű követése helyett a jelenlegi játékok egy aktív irányítási módra épülnek. A bot hegyének képbeli helyét és dőlését mérik, a mélységet és a játéktér fizikáját a program számítja.

A főzésből és az etetésből az érzékenyebb szerszámhasználatot vittük tovább. A Prism Studio az ecset hegyének útját teszi láthatóvá, a Magnet Meadow pedig azt, hogyan reagál egy másik szereplő a mozdulatra. A lapátos etetés külön jó folytatás lehet, ha egy próba igazolja, hogy az emelés és az ürítés oldalnézetben is jól elkülönül.

## Rövid helyszíni próba

1. Rögzítsd a kamerát. A játékos nyújtott karral is lássa a képen a puha bot mind a négy színes sávját. Próbáld ki a stand végleges világításánál, egy közeli és egy távolabbi állásból. Az első próbán a követési vonal segít láthatóvá tenni, melyik végpontot érzékeli a játék. [A jelölőbot méretei és színei](sword-tracking.md)
2. Menjen végig egy kör egérrel vagy érintéssel, majd ugyanaz bottal. A Glow Ferryben döntsd a botot mindkét irányba, a Jungle Relayben próbálj korán, majd a vonalnál suhintani. A Bridge Foundryban próbáld ki kézzel is az építést. A próbán legyen külön megfigyelő, aki összeveti a mozdulatot a képernyővel.
3. Tíz másodpercre takard el a botot, majd hozd vissza a képbe. Figyeld meg, ad-e fantomtalálatot, és hogy az új játékos érti-e, mikor folytathatja. Próbáljátok ki a némítást, a szünetet, az újrajátszást és a következő játék kiválasztását is.
4. Hívj oda három olyan embert, aki még nem játszott. Mindegyiknél jegyezd fel az első sikerig eltelt másodperceket, melyik mozdulatot értette félre, és miből kért újabb kört. Ha mindhárman ugyanott akadnak el, azt az egy mozdulatot mutasd be a következő játékosnak.
5. A tényleges standi telefonnal vagy laptoppal játsszatok folyamatosan legalább 20 percig. Ellenőrizd, hogy a későbbi körök is ugyanúgy reagálnak-e. A hangfalnál külön próbáld ki a zene mellett a találati jelzéseket. A látogató hallja a visszajelzést, miközben még érthető a mellette álló játékvezető hangja.

## Zene

Mind a hat kör saját, helyben szintetizált zenét kap. A Jungle Relay tört dobritmust, a Glow Ferry lassabb érzetű féltempót, a Magnet Meadow lendülő basszusmenetet használ. A Bridge Foundry szögletes lüktetést, a Prism Studio diszkóritmust, az Orbit Rally gyors üldözési témát kapott. A mély alaphang fölött szóló felső oktáv kis hangszórón is követhetővé teszi a ritmust. A hangszóróikon a zenét és az effektusokat együtt kapcsolja.

Ha mind az öt kisállatot beterelted az arany karámba a Magnet Meadow pályáján, a játék Beethoven V. (c-moll) szimfóniájának első nyolc hangjával ünnepel. A két rövid motívum közé lélegzetnyi szünet került. A kitartott hangok alatt két oktávval mélyebben lép be a szintibasszus. Az 1808-as kompozíció közkincs, a játék saját hangszerelésében, közvetlenül a böngészőben szólal meg. [Beethoven kézirata a berlini Állami Könyvtár kiállításán](https://blog.sbb.berlin/diesen-kuss-der-ganzen-welt-beethoven-ausstellung/) · [Az első tétel kottája, 1. oldal](https://www.mutopiaproject.org/ftp/BeethovenLv/O67/Symphony5_1/Symphony5_1-a4.pdf) · [Uniós védelmi idő, 1. cikk](https://eur-lex.europa.eu/eli/dir/2006/116/oj/eng)
