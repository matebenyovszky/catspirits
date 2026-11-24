type Palette = readonly [top: string, left: string, right: string];
const stone: Palette = ['#263f60', '#131f3a', '#1c3150'];
const aqua: Palette = ['#bbeffe', '#388e9f', '#53dfbc'];
const violet: Palette = ['#e2d8ff', '#704eb3', '#a286ff'];
const gold: Palette = ['#fff1b2', '#b1664d', '#ffc273'];

function block(x: number, y: number, r: number, height: number, colors: Palette): string {
  const d = r / 2;
  return `<g transform="translate(${x} ${y})">
    <path d="M0 ${-d} ${r} 0 0 ${d} ${-r} 0Z" fill="${colors[0]}"/>
    <path d="M${-r} 0 0 ${d}V${d + height}L${-r} ${height}Z" fill="${colors[1]}"/>
    <path d="M0 ${d} ${r} 0V${height}L0 ${d + height}Z" fill="${colors[2]}"/>
  </g>`;
}

export function neonScene(game: 'blade' | 'pop'): string {
  const city = [
    block(265, 169, 45, 148, stone), block(343, 205, 46, 140, stone),
    block(151, 209, 38, 104, stone), block(406, 239, 26, 94, stone),
    block(120, 273, 26, 83, stone), block(384, 294, 36, 74, stone),
  ].join('');
  const tiles = Array.from({ length: 25 }, (_, index) => {
    const row = Math.floor(index / 5), column = index % 5;
    return block(260 + (column - row) * 40, 267 + (column + row) * 20, 38, 13,
      index % 7 === 0 ? (game === 'blade' ? aqua : gold) : stone);
  }).join('');
  const spirits = [
    block(190, 225, 48, 52, aqua), block(324, 172, 55, 60, violet), block(302, 320, 29, 33, gold),
    '<path d="M164 231v13m15-5v13m115-74v14m18-5v14m-26 123v8m10-3v8" fill="none" stroke="#10182f" stroke-width="5"/>',
  ].join('');
  const blade = `<g transform="translate(263 237) rotate(33)">
    <path d="M0 -142 16 -127V53H-16V-127Z" fill="#75efce" stroke="#cdfbf4" stroke-width="3"/>
    <path d="M0 -127H10V53H0Z" fill="#d1fff6"/>
    <path d="M-43 53H43V66H-43Z" fill="#a997fa"/>
    <path d="M-9 66H9V106H-9Z" fill="#655799"/>
    <path d="M-9 77H9m-18 11H9m-18 11H9" stroke="#d6c7fe" stroke-width="4"/>
  </g>${block(139, 248, 22, 22, violet)}${block(384, 273, 26, 26, gold)}`;
  return `<div class="shell-scene" aria-hidden="true"><svg viewBox="0 0 520 480" focusable="false">
    <g opacity=".68">${city}</g>${tiles}
    <path d="M237 54h5v5h-5zm-123 80h8v8h-8zm275-35h6v6h-6zm39 77h7v7h-7zM104 197h5v5h-5z" fill="#8bffea"/>
    ${game === 'blade' ? blade : spirits}
  </svg></div>`;
}
