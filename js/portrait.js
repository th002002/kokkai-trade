// 人物の似顔絵（SVG）。胸から上のアニメ風。data.js の people[].look と sex・age から組み立てる。
//   look.img に画像のパス（例 'img/people/ul.png'）を書くと、その絵を丸く切り抜いて使う
//   look.eye は瞳の色（書かなければ名前から選ぶ）
// 子供（13歳未満）は顔を丸く、目を大きく描く。年配（50歳以上）は目もとにしわを描く。
(function () {
  const G = window.Game;

  const P = G.Portrait = {};

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k))));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }

  const EYES = ['#6b4226', '#3f6b4a', '#4a4a8a', '#2f5d7a', '#8a5a22', '#7a3a4a'];
  function eyeColor(person) {
    if (person.look.eye) return person.look.eye;
    const key = person.name || person.id || '';
    let h = 0;
    for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return EYES[h % EYES.length];
  }

  // ---------- 髪 ----------
  // 頭の後ろの髪（体より先に描く）
  function hairBack(style, c, female) {
    const d = shade(c, 0.8);
    switch (style) {
      case 'long':  return `<path d="M18 22 C13 36 15 52 12 64 L52 64 C49 52 51 36 46 22 Z" fill="${d}"/>`;
      case 'pony':  return `<path d="M41 15 C55 15 57 31 53 45 C51 52 49 57 47 60 C47 46 46 32 39 21 Z" fill="${d}"/>`;
      case 'twin':  return `<path d="M20 19 C8 23 7 40 11 54 C13 45 15 35 22 26 Z M44 19 C56 23 57 40 53 54 C51 45 49 35 42 26 Z" fill="${d}"/>`;
      case 'bun':   return `<circle cx="32" cy="10" r="6.5" fill="${c}"/><path d="M27 10 Q32 6 37 10" stroke="${shade(c, 1.25)}" stroke-width="0.8" fill="none"/>`;
      case 'short': return female ? `<path d="M19.5 24 C18.5 33 20 39 23.5 42 L40.5 42 C44 39 45.5 33 44.5 24 Z" fill="${d}"/>` : '';
      case 'braid': return `<path d="M19 24 C17 30 18 36 20 40 L44 40 C46 36 47 30 45 24 Z" fill="${d}"/>`;
      default:      return '';
    }
  }

  // 頭にかぶさる髪（顔より先に描く）
  function hairCap(style, c, skin) {
    if (style === 'shaved') return `<path d="M20.5 27 C20 17 25.5 12.5 32 12.5 C38.5 12.5 44 17 43.5 27 Z" fill="${shade(skin, 0.82)}"/>`;
    return `<path d="M19.5 28 C18.5 15 25 10.5 32 10.5 C39 10.5 45.5 15 44.5 28 Z" fill="${c}"/>`;
  }

  // 前髪（顔の上に描く）
  function bangs(style, c, female) {
    const hl = `<path d="M26.5 14.8 Q30 13.4 33.5 13.6" stroke="rgba(255,255,255,0.22)" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
    if (style === 'shaved') return '';
    if (style === 'wild') {
      return `<path d="M18 29 L18.5 17 L22 20 L22.5 10 L27.5 16 L31 7.5 L34.5 15.5 L40 9.5 L41 18.5 L46 15.5 L46 29 L43 21 L40 24 L37.5 18.5 L34.5 23 L31.5 18 L28.5 23 L25.5 18.5 L22.5 23.5 Z" fill="${c}"/>${hl}`;
    }
    if (!female) {
      return `<path d="M19.8 26 C19.3 15 25 11.5 32 11.5 C39 11.5 44.7 15 44.2 26 L41.8 19.5 L38.5 22.5 L35.5 17.5 L32.2 21.5 L29 17.5 L26 22 L22.5 19.5 Z" fill="${c}"/>${hl}`;
    }
    // 女性の前髪。長い髪の型は顔の横に垂れる房をつける
    const side = ['long', 'pony', 'twin', 'braid', 'bun'].includes(style)
      ? `<path d="M20 22 C18.6 31 19 38 21.4 43.5 L22.8 32 Z M44 22 C45.4 31 45 38 42.6 43.5 L41.2 32 Z" fill="${c}"/>` : '';
    return `<path d="M19.8 27.5 C19.3 15.5 25 11.8 32 11.8 C39 11.8 44.7 15.5 44.2 27.5 L42.2 21 L40.6 25 L38.2 18.6 L35.8 24 L33.2 18.2 L30.6 23.6 L28 18.6 L25.6 24.6 L23.6 20.4 L21.8 26 Z" fill="${c}"/>${side}${hl}`;
  }

  // 三つ編みは体の前に垂らす
  function braidFront(style, c) {
    if (style !== 'braid') return '';
    const d = shade(c, 0.85), seg = x => [42, 47, 52, 57].map(y => `<ellipse cx="${x}" cy="${y}" rx="2.3" ry="3" fill="${c}" stroke="${d}" stroke-width="0.5"/>`).join('');
    return seg(20.5) + seg(43.5) + `<circle cx="20.5" cy="60.5" r="1.2" fill="#b23a2a"/><circle cx="43.5" cy="60.5" r="1.2" fill="#b23a2a"/>`;
  }

  // ---------- 顔 ----------
  // 目。cx は目の中心、kind は f（女性）/ m（男性）/ c（子供）
  function eye(cx, kind, iris, left) {
    const w = kind === 'm' ? 3.3 : 3.7, top = kind === 'm' ? 28.2 : 27.2, bot = kind === 'm' ? 32.6 : 34.2, y = 30.6;
    const irx = kind === 'm' ? 1.9 : kind === 'c' ? 2.7 : 2.45, iry = kind === 'm' ? 2.4 : kind === 'c' ? 3.3 : 3.0;
    const out = left ? -1 : 1;
    const clip = `eye-${kind}-${left ? 'l' : 'r'}`;
    const shape = `M${cx - w} ${y} Q${cx} ${top - 1.6} ${cx + w} ${y - 0.3} Q${cx} ${bot + 1.2} ${cx - w} ${y} Z`;
    return `<clipPath id="${clip}"><path d="${shape}"/></clipPath>
      <path d="${shape}" fill="#fff"/>
      <g clip-path="url(#${clip})">
        <ellipse cx="${cx}" cy="${y + 0.5}" rx="${irx}" ry="${iry}" fill="${iris}"/>
        <ellipse cx="${cx}" cy="${y + 1.4}" rx="${irx * 0.7}" ry="${iry * 0.55}" fill="${shade(iris, 1.35)}" opacity="0.6"/>
        <ellipse cx="${cx}" cy="${y + 0.2}" rx="${irx * 0.48}" ry="${iry * 0.55}" fill="#120c0a"/>
        <path d="M${cx - w} ${y - 2.5} L${cx + w} ${y - 2.5}" stroke="rgba(0,0,0,0.18)" stroke-width="2"/>
      </g>
      <circle cx="${cx + 0.9}" cy="${y - 0.8}" r="${kind === 'm' ? 0.65 : 0.95}" fill="#fff"/>
      <circle cx="${cx - 0.8}" cy="${y + 1.6}" r="0.45" fill="#fff" opacity="0.9"/>
      <path d="M${cx - w - 0.3} ${y + 0.1} Q${cx} ${top - 1.9} ${cx + w + 0.3} ${y - 0.4}" stroke="#1a120c" stroke-width="${kind === 'm' ? 1.0 : 1.35}" fill="none" stroke-linecap="round"/>
      ${kind === 'm' ? '' : `<path d="M${cx + out * (w + 0.2)} ${y - 0.2 + (left ? 0.3 : -0.3)} l${out * 1.4} -1.3" stroke="#1a120c" stroke-width="0.9" stroke-linecap="round"/>`}
      <path d="M${cx - w * 0.6} ${bot + 0.2} Q${cx} ${bot + 0.8} ${cx + w * 0.6} ${bot + 0.1}" stroke="${shade(iris, 0.6)}" stroke-width="0.4" fill="none" opacity="0.6"/>`;
  }

  function paint(kind) {
    switch (kind) {
      case 'stripes': return `<path d="M22.2 35 L25.6 35.8 M22.4 37 L25.4 37.6 M41.8 35 L38.4 35.8 M41.6 37 L38.6 37.6" stroke="#b23a2a" stroke-width="0.9" stroke-linecap="round"/>`;
      case 'dots':    return `<g fill="#f3ece0" opacity="0.9"><circle cx="23.5" cy="36.4" r="0.6"/><circle cx="25" cy="37.4" r="0.6"/><circle cx="40.5" cy="36.4" r="0.6"/><circle cx="39" cy="37.4" r="0.6"/></g>`;
      case 'band':    return `<rect x="19" y="18.6" width="26" height="3" rx="1.5" fill="#2f4c7a"/><circle cx="32" cy="20.1" r="1.4" fill="#e2b04a"/>`;
      default:        return '';
    }
  }

  function accessory(kind) {
    switch (kind) {
      case 'feather': return `<path d="M43 19 Q52 7 51 2 Q46.5 9 41.5 17.5 Z" fill="#c8a24a" stroke="#6b4423" stroke-width="0.5"/><path d="M42 18 L50 5" stroke="#6b4423" stroke-width="0.4"/>`;
      case 'bone':    return `<path d="M24 51 Q32 56 40 51" stroke="#5a3a22" stroke-width="0.5" fill="none"/><path d="M29.5 54.6 L34.5 54.6" stroke="#f0e6d0" stroke-width="2" stroke-linecap="round"/>`;
      case 'beads':   return `<path d="M24 50.5 Q32 56 40 50.5" stroke="#5a3a22" stroke-width="0.4" fill="none"/>` + [[25.5, 51.6], [28, 53.2], [30.4, 54.1], [32.8, 54.2], [35.3, 53.5], [37.8, 52.2]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="1.1" fill="${['#b23a2a', '#e2b04a', '#4f7a94'][i % 3]}"/>`).join('');
      case 'flower':  return `<g transform="translate(41.5 16.5)">${[0, 72, 144, 216, 288].map(a => `<ellipse rx="1.9" ry="3.1" cy="-2.6" fill="#f2a7b8" transform="rotate(${a})"/>`).join('')}<circle r="1.4" fill="#f5d36b"/></g>`;
      case 'earring': return `<circle cx="20.8" cy="36.5" r="1.4" fill="#e2b04a"/><circle cx="43.2" cy="36.5" r="1.4" fill="#e2b04a"/>`;
      default:        return '';
    }
  }

  // person: { look, age, sex, name }。size は表示の大きさ（px）
  P.svg = function (person, size = 56) {
    const L = person.look, age = person.age == null ? 25 : person.age, female = person.sex === 'f';
    const child = age < 13, old = age >= 50;
    if (L.img) {
      return `<svg class="portrait" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
        <clipPath id="pimg"><circle cx="32" cy="32" r="31"/></clipPath>
        <image href="${L.img}" x="0" y="0" width="64" height="64" preserveAspectRatio="xMidYMin slice" clip-path="url(#pimg)"/></svg>`;
    }
    const kind = child ? 'c' : female ? 'f' : 'm';
    const skin = L.skin, skinD = shade(skin, 0.86), iris = eyeColor(person);
    const face = female || child
      ? 'M21 27 C21 18 26 14 32 14 C38 14 43 18 43 27 C43 34 40.4 39 36.4 42 C34.8 43.3 33.4 44.1 32 44.1 C30.6 44.1 29.2 43.3 27.6 42 C23.6 39 21 34 21 27 Z'
      : 'M20.5 27 C20.5 18 26 13.5 32 13.5 C38 13.5 43.5 18 43.5 27 C43.5 34 42 39 38.2 42.6 C36 44.5 34 45.3 32 45.3 C30 45.3 28 44.5 25.8 42.6 C22 39 20.5 34 20.5 27 Z';
    const body = child
      ? 'M14 64 C15 56 20 52.5 26 51.5 L29.5 49.5 L34.5 49.5 L38 51.5 C44 52.5 49 56 50 64 Z'
      : female
        ? 'M8 64 C9 54.5 16 50.5 24 49 L29 46.5 L35 46.5 L40 49 C48 50.5 55 54.5 56 64 Z'
        : 'M4 64 C5 53 13.5 49 23 47.6 L29 45.6 L35 45.6 L41 47.6 C50.5 49 59 53 60 64 Z';
    const neckline = child ? 'M28.5 50 L32 54 L35.5 50 Z' : 'M27.6 47.2 L32 54.5 L36.4 47.2 Z';
    const cloth = L.cloth, clothD = shade(cloth, 0.72);
    const brows = female || child
      ? `<path d="M23.4 25.4 Q26.4 23.9 29.4 25" stroke="${shade(L.hair, 0.8)}" stroke-width="0.75" fill="none" stroke-linecap="round"/><path d="M34.6 25 Q37.6 23.9 40.6 25.4" stroke="${shade(L.hair, 0.8)}" stroke-width="0.75" fill="none" stroke-linecap="round"/>`
      : `<path d="M23 25.6 L29.6 24.6" stroke="${shade(L.hair, 0.75)}" stroke-width="1.4" stroke-linecap="round"/><path d="M34.4 24.6 L41 25.6" stroke="${shade(L.hair, 0.75)}" stroke-width="1.4" stroke-linecap="round"/>`;
    const mouth = female || child
      ? `<path d="M30.2 38.9 Q32 40.2 33.8 38.9" stroke="#b0544a" stroke-width="0.85" fill="none" stroke-linecap="round"/>`
      : `<path d="M29.8 39.4 Q32 40.1 34.2 39.4" stroke="#6b2e22" stroke-width="0.95" fill="none" stroke-linecap="round"/>`;
    const blush = old ? '' : `<ellipse cx="24.6" cy="35.3" rx="2.5" ry="1.1" fill="#f0857a" opacity="${female || child ? 0.45 : 0.15}"/><ellipse cx="39.4" cy="35.3" rx="2.5" ry="1.1" fill="#f0857a" opacity="${female || child ? 0.45 : 0.15}"/>`;
    const wrinkles = old ? `<path d="M21.6 31.6 l1.6 0.8 M42.4 31.6 l-1.6 0.8 M28.4 41 Q32 42.2 35.6 41" stroke="${shade(skin, 0.72)}" stroke-width="0.5" fill="none"/>` : '';
    const beard = L.beard
      ? `<path d="M22.5 35 C23 43 27 47 32 47 C37 47 41 43 41.5 35 C39 40 36 41.6 32 41.6 C28 41.6 25 40 22.5 35 Z" fill="${L.hair}"/><path d="M29 40.6 Q32 39.6 35 40.6" stroke="${shade(L.hair, 0.7)}" stroke-width="0.8" fill="none"/>`
      : '';
    return `<svg class="portrait" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
      <defs>
        <radialGradient id="pbg" cx="0.5" cy="0.35" r="0.7"><stop offset="0" stop-color="#f6ecd9"/><stop offset="1" stop-color="#dcc8a6"/></radialGradient>
        <clipPath id="pc"><circle cx="32" cy="32" r="31"/></clipPath>
      </defs>
      <circle cx="32" cy="32" r="31" fill="url(#pbg)"/>
      <g clip-path="url(#pc)">
        ${hairBack(L.style, L.hair, female)}
        <path d="${body}" fill="${cloth}"/>
        <path d="${body}" fill="none" stroke="${clothD}" stroke-width="0.6"/>
        <rect x="29" y="${child ? 41 : 40}" width="6" height="9" fill="${skinD}"/>
        <path d="${neckline}" fill="${skinD}"/>
        <path d="${neckline.replace(' Z', '')}" stroke="${clothD}" stroke-width="1" fill="none"/>
        ${female && !child ? `<path d="M24 56 Q27 58.5 30 57.6 M34 57.6 Q37 58.5 40 56" stroke="${clothD}" stroke-width="0.6" fill="none" opacity="0.7"/>` : ''}
        ${hairCap(L.style, L.hair, skin)}
        <path d="${face}" fill="${skin}"/>
        <path d="M24 40.5 Q32 46 40 40.5" stroke="${skinD}" stroke-width="0.6" fill="none" opacity="0.5"/>
        ${blush}
        ${wrinkles}
        ${eye(26.6, kind, iris, true)}
        ${eye(37.4, kind, iris, false)}
        ${brows}
        <path d="M32.4 33.8 L31.7 35.7 L32.7 35.9" stroke="${shade(skin, 0.72)}" stroke-width="0.55" fill="none" stroke-linecap="round"/>
        ${mouth}
        ${L.paint === 'band' ? '' : paint(L.paint)}
        ${beard}
        ${bangs(L.style, L.hair, female || child)}
        ${L.paint === 'band' ? paint('band') : ''}
        ${braidFront(L.style, L.hair)}
        ${accessory(L.acc)}
      </g>
    </svg>`;
  };

  P.shade = shade;
})();
