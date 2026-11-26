export type Position = readonly [number, number, number];
export type Larva = { id: string; name: string; note: string; position: Position; color: string; axis: Position };
type Station = {
  name: string;
  hint: string;
  color: string;
  center: Position;
  distance: number;
  yaw: number;
  pitch: number;
  gate?: Position;
  larvae: readonly Larva[];
};

export const stations: readonly Station[] = [
  {
    name: 'Derengő gyökerek', hint: 'A két fényhernyó a gyökerek külső ívén úszik.', color: '#73ffe2',
    center: [0, 1.7, .2], distance: 33, yaw: .17, pitch: .105, gate: [5.7, -.55, 3.2],
    larvae: [
      { id: 'mint', name: 'Mentauszony', note: 'A gyökerek fényéből táplálkozik.', position: [-5.3, -2.8, 4.4], color: '#97ffe5', axis: [1, .23, .15] },
      { id: 'amber', name: 'Aranyszál', note: 'Meleg fényt hagy maga után az áramlatban.', position: [3.8, -5.3, 4.6], color: '#ffd28b', axis: [-1, .23, .1] },
    ],
  },
  {
    name: 'Korallág', hint: 'Keresd a lila sodrásban cikázó két fényhernyót.', color: '#ffa8d5',
    center: [4.9, 1.4, 1.5], distance: 16, yaw: .85, pitch: .23, gate: [2.1, 5.3, 4.3],
    larvae: [
      { id: 'rose', name: 'Rózsafodor', note: 'Fényjelekkel tartja a kapcsolatot a rajával.', position: [4.1, 2.5, 4.5], color: '#ffa7d9', axis: [1, .48, -.45] },
      { id: 'coral', name: 'Korallpernye', note: 'A korallág csúcsainál pihen, amikor elcsendesedik a víz.', position: [8.6, .15, 1.8], color: '#ffb2a3', axis: [-.45, .2, -1] },
    ],
  },
  {
    name: 'Csillaglomb', hint: 'A lombkorona két szélén keresd a hideg fényeket.', color: '#99c2ff',
    center: [-.8, 6.8, .35], distance: 17, yaw: -.30, pitch: .16, gate: [1.8, 8.6, 2.05],
    larvae: [
      { id: 'violet', name: 'Ibolyafény', note: 'A mag körül ugyanilyen ibolyaszínű fény dereng.', position: [-5.1, 7.3, 2.2], color: '#c5a8ff', axis: [.8, .35, .55] },
      { id: 'ice', name: 'Jégcsillám', note: 'A törzs túloldaláról hoz apró jégszemcséket.', position: [2.7, 8.5, 3], color: '#a2dbff', axis: [-1, .18, -.3] },
    ],
  },
  {
    name: 'Sarki legyező', hint: 'Figyeld a sarki ágak között sodródó zöld fényeket.', color: '#a4ffd0',
    center: [-12.3, 13.2, 1.45], distance: 18.5, yaw: -.46, pitch: .16, gate: [-10.6, 14.5, -.45],
    larvae: [
      { id: 'aurora', name: 'Sarki selyem', note: 'A legyező végén összegyűjti a sarki fényt.', position: [-16.2, 15.3, 2.6], color: '#b2ffd9', axis: [.82, .18, .48] },
      { id: 'fern', name: 'Páfrányfény', note: 'Csak a szélcsendben hagyja el a legyezőt.', position: [-8.3, 12.2, 3.6], color: '#a1f5a8', axis: [-.92, .26, -.25] },
    ],
  },
  {
    name: 'Holdzátony', hint: 'A zátony íve alatt két ezüstös hernyó úszik.', color: '#b7b4ff',
    center: [-12.1, 7.8, -9.5], distance: 18.6, yaw: -2.34, pitch: .19, gate: [-6.95, 10.3, -11],
    larvae: [
      { id: 'moon', name: 'Holduszony', note: 'Az árnyékban fényesebbre vált a színe.', position: [-15.15, 8.75, -13.0], color: '#e6dcff', axis: [.85, .17, .25] },
      { id: 'pearl', name: 'Gyöngypernye', note: 'Apró gyöngyök jelzik, merre járt.', position: [-8.9, 6.85, -11.9], color: '#aac8ff', axis: [-.85, .42, -.44] },
    ],
  },
  {
    name: 'Aranyáramlat', hint: 'Nézz az aranyló ág két vége felé.', color: '#ffc993',
    center: [9.4, 14.35, -3.9], distance: 21, yaw: .53, pitch: .19, gate: [11.62, 11.6, -.75],
    larvae: [
      { id: 'sun', name: 'Napparázs', note: 'A legmagasabb ág fényében tölti fel a bundáját.', position: [8.15, 15.1, .65], color: '#ffe6a1', axis: [.74, .42, -.62] },
      { id: 'drift', name: 'Sodorfény', note: 'A meleg áramlatok szélén gyorsul fel.', position: [16, 17.2, -2.5], color: '#ffba91', axis: [-.95, -.18, .2] },
    ],
  },
  {
    name: 'Üvegkert', hint: 'Az üvegág két oldalán keresd a türkiz felvillanásokat.', color: '#98f4ff',
    center: [12.9, -1.0, -10.05], distance: 19.2, yaw: 1.55, pitch: .16, gate: [12.85, -3.8, -13.7],
    larvae: [
      { id: 'glass', name: 'Üveguszony', note: 'Szinte áttetszővé válik, amikor megáll.', position: [15.75, .85, -14.3], color: '#a7fff5', axis: [-.25, .3, 1] },
      { id: 'ripple', name: 'Hullámcsillám', note: 'A kert rétegei között fodrozódik a fénye.', position: [14.3, -3.6, -6.35], color: '#91dafc', axis: [.46, -.19, -.78] },
    ],
  },
  {
    name: 'Mélyvízi gyökerek', hint: 'A két utolsó fény a mély gyökerek körül kering.', color: '#e4a9ff',
    center: [-7.2, -10.65, -7.65], distance: 20.5, yaw: -2.49, pitch: .145, gate: [-3.48, -7.92, -9.7],
    larvae: [
      { id: 'lantern', name: 'Mélységi lámpás', note: 'A gyökerek sötétjében a saját fénye mutatja az utat.', position: [-11.15, -7.5, -10.4], color: '#ffb5ed', axis: [-.73, -.1, -.5] },
      { id: 'dusk', name: 'Alkonyfonál', note: 'A raj utolsó tagja fénycsíkot húz a rejtek felé.', position: [-4.55, -13.75, -11.5], color: '#bda3ff', axis: [.87, .24, .33] },
    ],
  },
  {
    name: 'Rejtett öböl', hint: 'Fordulj a törzs túloldala felé, és kövesd az ibolyaszínű felvillanásokat.', color: '#e3baff',
    center: [-.6, 2.7, -.7], distance: 14, yaw: 2.18, pitch: .14, larvae: [],
  },
];

export const starseed = { id: 'starseed', position: [-3.6, 2.0, -4.2] as Position, color: '#fff0b2' };
export const totalLarvae = stations.reduce((count, station) => count + station.larvae.length, 0);

export class Dive {
  private index = 0;
  private caught = new Set<string>();
  private found = false;

  get stage(): number { return this.index; }
  get station(): Station { return stations[this.index]; }
  get count(): number { return this.caught.size; }
  get complete(): boolean { return this.found; }
  get canSwim(): boolean {
    return !!this.station.gate && this.station.larvae.every(larva => this.caught.has(larva.id));
  }
  get canSwimBack(): boolean { return this.index > 0 && !this.found; }
  get lookingForSeed(): boolean { return this.index === stations.length - 1 && !this.found; }

  reset(): void {
    this.index = 0;
    this.caught.clear();
    this.found = false;
  }

  collected(id: string): boolean { return this.caught.has(id); }

  catch(id: string): Larva | undefined {
    const larva = this.station.larvae.find(target => target.id === id);
    if (!larva || this.caught.has(id)) return;
    this.caught.add(id);
    return larva;
  }

  swim(): boolean {
    if (!this.canSwim) return false;
    this.index++;
    return true;
  }

  back(): boolean {
    if (!this.canSwimBack) return false;
    this.index--;
    return true;
  }

  findSeed(visible: boolean): boolean {
    if (!this.lookingForSeed || !visible) return false;
    this.found = true;
    return true;
  }
}
