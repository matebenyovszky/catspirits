import { getLanguage } from '../../i18n';
import type { FestivalId } from '../../core/festival/types';
export function say(hu: string, en: string, de: string): string {
  const language = getLanguage();
  return language === 'hu' ? hu : language === 'de' ? de : en;
}
export const ids: FestivalId[] = ['jungle','ferry','build','herd','paint','rover'];
export function festivalId(value:string|null): FestivalId | undefined {
  return ids.find(id=>id===value);
}
export const titles: Record<FestivalId,string> = {
  jungle:'Jungle Relay', ferry:'Glow Ferry', build:'Bridge Foundry',
  herd:'Magnet Meadow', paint:'Prism Studio', rover:'Orbit Rally',
};
export const accents: Record<FestivalId,string> = {
  jungle:'#83f7ac', ferry:'#85deff', build:'#ffc277', herd:'#b5f089', paint:'#ee9fff', rover:'#ffaaa2',
};
export function description(id:FestivalId):string {
  switch(id) {
    case 'jungle': return say('Törj utat Bitnek a neonőserdőben.','Carve a path for Bit through the neon jungle.','Bahne Bit einen Weg durch den Neondschungel.');
    case 'ferry': return say('Egyensúlyozz át egy billegő kis utast a kapukon.','Balance a tiny passenger through the gates.','Balanciere deinen kleinen Passagier durch die Tore.');
    case 'herd': return say('Mágneses pásztorbotoddal vezesd haza a kóbor állatkákat.','Guide stray critters home with a magnetic shepherd’s wand.','Führe die Streuner mit deinem Magnetstab nach Hause.');
    case 'build': return say('Építs átjárót a közeledő robotkonvojnak.','Lay a crossing for the approaching robot convoy.','Baue einen Übergang für den Roboterkonvoi.');
    case 'paint': return say('Fesd meg a neonképet egy világító ecsettel.','Paint a neon mural with a luminous brush.','Male ein Neonbild mit einem leuchtenden Pinsel.');
    case 'rover': return say('A botod a kormány. Vezesd át a rovert a kapukon.','Your wand is the wheel. Pilot a rover through the gates.','Dein Stab ist das Steuer. Lenke den Rover durch die Tore.');
  }
}
export function instructions(id:FestivalId):string {
  switch(id) {
    case 'jungle': return say('Válts sávot a bot hegyével. A fénylő sávban, a vonalnál vágd át az indát. A piros akadályt kerüld ki.','Steer with the tip. Slash the vine in the glowing lane at the line. Dodge red barricades.','Wechsle mit der Spitze die Spur. Durchtrenne die Ranke auf der Leuchtspur an der Linie. Weiche roten Sperren aus.');
    case 'ferry': return say('Emeld vagy süllyeszd a botot a nyíláshoz. Finom ellendöntéssel tartsd középen az utast.','Raise or lower the wand to the opening. Counter-tilt gently to keep the passenger centred.','Hebe oder senke den Stab zur Öffnung. Halte den Passagier mit sanftem Gegenlenken in der Mitte.');
    case 'herd': return say('Közelíts a bot hegyével, és lassan vezesd a kisállatokat az arany karámba. Kerüld a tavat. Suhintással több állatot is magadhoz vonzhatsz.','Approach with the tip and lead the critters slowly to the gold pen. Avoid the pond. A sweep draws in a wider group.','Nähere dich mit der Spitze und locke die Tiere langsam ins goldene Gehege. Umgehe den Teich. Ein Schwung zieht weitere Tiere an.');
    case 'build': return say('Tartsd a hegyet egy világító + jelen, vagy koppints rá. A szomszédos sorba is építhetsz. Juttass át három robotot, mielőtt lemerülnek.','Hold over a glowing + or tap it to lay a tile. You can step one row sideways. Get three robots across before their batteries run out.','Halte die Spitze auf ein leuchtendes + oder tippe darauf. Ein Feld zur Seite ist erlaubt. Bring drei Roboter vor Akkuende ans Ziel.');
    case 'paint': return say('Vedd fel a világító ecsetet a palettáról. Haladj sorban a pulzáló pontokon. Három mintából áll össze a kép, az ütemre zárás bónuszt ér.','Pick up the glowing brush from the palette. Trace the pulsing dots in order to finish all three patterns. Close a stroke on the beat for a bonus.','Wähle den leuchtenden Pinsel und folge den pulsierenden Punkten der Reihe nach. Vollende drei Muster. Ein Abschluss im Takt bringt Bonuspunkte.');
    case 'rover': return say('Döntéssel vagy oldalra mozdítással kormányozz. A hegyet felemelve gyorsítasz. Juss át tíz kapun három sérülés előtt.','Tilt or move sideways to steer. Raise the tip to accelerate. Clear ten gates before the rover takes three hits.','Neige oder verschiebe den Stab zum Lenken. Hebe die Spitze zum Beschleunigen. Schaffe zehn Tore vor dem dritten Treffer.');
  }
}
