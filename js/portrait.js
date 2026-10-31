// 人物の似顔絵（SVG）。RPG の顔グラフィックのような、四角い枠いっぱいに写した胸から上の絵。
//   黒い輪郭線と、影をはっきり塗り分ける（セル塗り）
//   女性と子供：やや大きな瞳・丸い顔・小さな口・頬の赤み・胸元のリボン
//   男性：鋭い目・太い眉・しっかりしたあご
//   look.img に画像のパス（例 'img/people/ul.png'）を書くと、その絵を四角く切り抜いて使う
//   look.eye は瞳の色、look.ribbon は胸元のリボンの色（書かなければ名前から選ぶ）
// 子供（13歳未満）は顔を丸く、目を大きく描く。年配（50歳以上）は目もとにしわを描く。
(function () {
  const G = window.Game;

  const P = G.Portrait = {};

  // 絵の中で枠に写す範囲（顔が枠いっぱいになるように寄せる）
  const VIEW = { x: 8.5, y: 7, w: 47, h: 47 };
  const OL = '#3a2418';                      // 輪郭線の色
  const line = (w = 0.55) => `stroke="${OL}" stroke-width="${w}" stroke-linejoin="round"`;

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k))));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  // 白に近づける（k=0 そのまま、1 で白）
  function tint(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * k));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function hash(person) {
    let h = 0;
    for (const ch of person.name || person.id || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  }
  const EYES = ['#7a4a2a', '#3f8a5a', '#5a5ab0', '#2f74a8', '#b07a22', '#a8455a', '#7a52a8'];
  const RIBBONS = ['#c0392b', '#2e5fa8', '#d4772c', '#7a3fa0', '#2f8a5a', '#d4507a'];
  const eyeColor = p => p.look.eye || EYES[hash(p) % EYES.length];
  const ribbonColor = p => p.look.ribbon || RIBBONS[(hash(p) >> 3) % RIBBONS.length];

  // ---------- 髪 ----------
  // 頭の後ろの髪（体より先に描く）
  function hairBack(style, c, moe) {
    const d = shade(c, 0.78), o = line();
    switch (style) {
      case 'long':  return `<path d="M17 22 C11 38 13 54 10 64 L54 64 C51 54 53 38 47 22 Z" fill="${d}" ${o}/>`;
      case 'pony':  return `<path d="M40 13 C56 12 59 30 55 45 C53 53 50 58 47 61 C48 47 46 32 38 20 Z" fill="${d}" ${o}/>`;
      case 'twin':  return `<path d="M20 17 C6 21 5 40 9 56 C12 47 14 36 22 26 Z M44 17 C58 21 59 40 55 56 C52 47 50 36 42 26 Z" fill="${d}" ${o}/>
        <circle cx="19.5" cy="18.5" r="2" fill="${shade(c, 0.6)}" ${o}/><circle cx="44.5" cy="18.5" r="2" fill="${shade(c, 0.6)}" ${o}/>`;
      case 'bun':   return `<circle cx="32" cy="8.5" r="6.5" fill="${c}" ${o}/><path d="M28 7.5 Q32 4.8 36 7.5" stroke="${tint(c, 0.4)}" stroke-width="0.9" fill="none"/>`;
      case 'short': return moe ? `<path d="M18 24 C17 34 19 41 22.5 44 L41.5 44 C45 41 47 34 46 24 Z" fill="${d}" ${o}/>` : '';
      case 'braid': return `<path d="M18 24 C16 31 17 37 19.5 41 L44.5 41 C47 37 48 31 46 24 Z" fill="${d}" ${o}/>`;
      default:      return '';
    }
  }

  // 頭にかぶさる髪（顔より先に描く）
  function hairCap(style, c, skin, moe) {
    if (style === 'shaved') return `<path d="M20.5 27 C20 17 25.5 12.5 32 12.5 C38.5 12.5 44 17 43.5 27 Z" fill="${shade(skin, 0.82)}" ${line()}/>`;
    return moe
      ? `<path d="M17.6 30 C16.6 14 24.5 9 32 9 C39.5 9 47.4 14 46.4 30 Z" fill="${c}" ${line()}/>`
      : `<path d="M19.5 28 C18.5 15 25 10.5 32 10.5 C39 10.5 45.5 15 44.5 28 Z" fill="${c}" ${line()}/>`;
  }

  // 前髪の形（顔に落ちる影にも使う）
  function bangsPath(style, moe) {
    if (style === 'shaved') return '';
    if (style === 'wild') return 'M18 29 L18.5 17 L22 20 L22.5 10 L27.5 16 L31 7.5 L34.5 15.5 L40 9.5 L41 18.5 L46 15.5 L46 29 L43 21 L40 24 L37.5 18.5 L34.5 23 L31.5 18 L28.5 23 L25.5 18.5 L22.5 23.5 Z';
    if (!moe) return 'M19.8 26 C19.3 15 25 11.5 32 11.5 C39 11.5 44.7 15 44.2 26 L41.8 19.5 L38.5 22.5 L35.5 17.5 L32.2 21.5 L29 17.5 L26 22 L22.5 19.5 Z';
    return 'M18.4 30.5 C17.8 15.5 24.5 10.6 32 10.6 C39.5 10.6 46.2 15.5 45.6 30.5 L43.8 23.4 L42.4 28.4 L39.8 19.8 L37.6 26.6 L34.8 19.4 L32.6 26 L30 19.4 L27.4 26.6 L25 20 L22.4 27.6 L21 22.8 Z';
  }

  // 前髪（顔の上に描く）。房の筋と、つや
  function bangs(style, c, moe) {
    const d = bangsPath(style, moe);
    if (!d) return '';
    const side = moe && ['long', 'pony', 'twin', 'braid', 'bun', 'short'].includes(style)
      ? `<path d="M18.4 22 C15.8 32 16.4 41 19.6 47.5 L21.2 36.5 L20.4 29 Z M45.6 22 C48.2 32 47.6 41 44.4 47.5 L42.8 36.5 L43.6 29 Z" fill="${c}" ${line()}/>` : '';
    const strands = moe
      ? `<path d="M25 20 L26.2 24.6 M30 19.4 L30.8 24 M34.8 19.4 L34 24 M39.8 19.8 L38.6 24.4" stroke="${shade(c, 0.7)}" stroke-width="0.5"/>`
      : '';
    // つや：髪の明るい帯を、前髪の形で切り抜いて描く
    return `${side}<path d="${d}" fill="${c}" ${line()}/>${strands}
      <path d="M22.5 17.6 Q27 14.2 31 14 L30.4 15.6 Q27 15.9 23.4 18.8 Z M33 14 Q37 14.2 41.5 17.6 L40.6 18.8 Q37 15.9 33.6 15.6 Z" fill="${tint(c, 0.45)}" opacity="0.75"/>`;
  }

  // 三つ編みは体の前に垂らす
  function braidFront(style, c) {
    if (style !== 'braid') return '';
    const seg = x => [43, 48, 53, 58].map(y => `<ellipse cx="${x}" cy="${y}" rx="2.4" ry="3.1" fill="${c}" ${line(0.45)}/>`).join('');
    return seg(19.5) + seg(44.5);
  }

  // ---------- 目 ----------
  // 女性・子供の目：上まぶたを太く外へはね上げ、縦長の瞳に光を二つ
  function softEye(cx, iris, left, big) {
    const k = big ? 1.12 : 1, w = 3.9 * k, y = 31.6, top = y - 4.3 * k, bot = y + 3.4 * k;
    const irx = 2.75 * k, iry = 3.6 * k, out = left ? -1 : 1, gid = `ig${iris.slice(1)}`, clip = `se${left ? 'l' : 'r'}${big ? 'b' : ''}`;
    const shape = `M${cx - w} ${y + 0.3} C${cx - w * 0.8} ${top + 0.4} ${cx + w * 0.8} ${top} ${cx + w} ${y - 0.5} C${cx + w * 0.8} ${bot} ${cx - w * 0.8} ${bot + 0.3} ${cx - w} ${y + 0.3} Z`;
    return `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(iris, 0.4)}"/><stop offset="0.6" stop-color="${iris}"/><stop offset="1" stop-color="${tint(iris, 0.5)}"/></linearGradient>
      <clipPath id="${clip}"><path d="${shape}"/></clipPath>
      <path d="${shape}" fill="#fff"/>
      <g clip-path="url(#${clip})">
        <ellipse cx="${cx}" cy="${y + 0.5}" rx="${irx}" ry="${iry}" fill="url(#${gid})" stroke="${shade(iris, 0.35)}" stroke-width="0.4"/>
        <ellipse cx="${cx}" cy="${y + 0.3}" rx="${irx * 0.48}" ry="${iry * 0.55}" fill="${shade(iris, 0.25)}"/>
        <path d="M${cx - w} ${top + 1} L${cx + w} ${top + 1}" stroke="rgba(0,0,0,0.25)" stroke-width="2.2"/>
      </g>
      <ellipse cx="${cx + 1.1 * k}" cy="${y - 1.2 * k}" rx="${1.05 * k}" ry="${1.3 * k}" fill="#fff"/>
      <circle cx="${cx - 1.1 * k}" cy="${y + 2 * k}" r="${0.5 * k}" fill="#fff"/>
      <path d="M${cx - w - 0.4} ${y + 0.8} C${cx - w * 0.8} ${top - 0.6} ${cx + w * 0.8} ${top - 1} ${cx + w + 0.4} ${y - 0.8}" stroke="${OL}" stroke-width="1.9" fill="none" stroke-linecap="round"/>
      <path d="M${cx + out * (w + 0.2)} ${y + (left ? 0.4 : -0.8)} l${out * 1.6} -1.2" stroke="${OL}" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M${cx + out * w * 0.2} ${bot + 0.5} Q${cx + out * w * 0.7} ${bot + 0.2} ${cx + out * w} ${y + 1}" stroke="${OL}" stroke-width="0.5" fill="none"/>`;
  }

  // 男性の目：細く鋭く、光は小さく一つ
  function manEye(cx, iris) {
    const w = 3.4, y = 30.6, top = 28.4, bot = 32.4;
    const shape = `M${cx - w} ${y} Q${cx} ${top - 1.4} ${cx + w} ${y - 0.5} Q${cx} ${bot + 1} ${cx - w} ${y} Z`;
    const clip = `mm${cx < 32 ? 'l' : 'r'}`;
    return `<clipPath id="${clip}"><path d="${shape}"/></clipPath>
      <path d="${shape}" fill="#fff"/>
      <g clip-path="url(#${clip})">
        <ellipse cx="${cx}" cy="${y + 0.4}" rx="2" ry="2.5" fill="${iris}" stroke="${shade(iris, 0.4)}" stroke-width="0.4"/>
        <ellipse cx="${cx}" cy="${y + 0.2}" rx="0.95" ry="1.3" fill="#120c0a"/>
      </g>
      <circle cx="${cx + 0.8}" cy="${y - 0.6}" r="0.6" fill="#fff"/>
      <path d="M${cx - w - 0.3} ${y + 0.1} Q${cx} ${top - 1.7} ${cx + w + 0.4} ${y - 0.7}" stroke="${OL}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
  }

  function paint(kind, moe) {
    const y = moe ? 36.8 : 35.4;
    switch (kind) {
      case 'stripes': return `<path d="M21.8 ${y} L24.6 ${y + 0.8} M22 ${y + 1.8} L24.4 ${y + 2.4} M42.2 ${y} L39.4 ${y + 0.8} M42 ${y + 1.8} L39.6 ${y + 2.4}" stroke="#b23a2a" stroke-width="0.8" stroke-linecap="round"/>`;
      case 'dots':    return `<g fill="#fff" opacity="0.9"><circle cx="22.8" cy="${y + 0.6}" r="0.55"/><circle cx="24.2" cy="${y + 1.6}" r="0.55"/><circle cx="41.2" cy="${y + 0.6}" r="0.55"/><circle cx="39.8" cy="${y + 1.6}" r="0.55"/></g>`;
      case 'band':    return `<rect x="18" y="17.2" width="28" height="3" rx="1.5" fill="#2f4c7a" ${line(0.45)}/><circle cx="32" cy="18.7" r="1.5" fill="#e2b04a" ${line(0.4)}/>`;
      default:        return '';
    }
  }

  function accessory(kind) {
    const o = line(0.4);
    switch (kind) {
      case 'feather': return `<path d="M43 18 Q53 6 52 1 Q47 8.5 41.5 16.5 Z" fill="#e0b84a" ${o}/><path d="M42 17 L51 4" stroke="#8a5a23" stroke-width="0.4"/>`;
      case 'bone':    return `<path d="M29 53.4 L35 53.4" stroke="#f0e6d0" stroke-width="2" stroke-linecap="round"/>`;
      case 'beads':   return [[25.5, 49.6], [28, 51.2], [30.4, 52.1], [33.6, 52.1], [36, 51.2], [38.5, 49.6]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="1.05" fill="${['#c0392b', '#e2b04a', '#2e74a8'][i % 3]}" ${o}/>`).join('');
      case 'flower':  return `<g transform="translate(42 15.5)">${[0, 72, 144, 216, 288].map(a => `<ellipse rx="2.1" ry="3.4" cy="-2.8" fill="#fff" ${o} transform="rotate(${a})"/>`).join('')}<circle r="1.5" fill="#f5c84b" ${o}/></g>`;
      case 'earring': return `<circle cx="19.6" cy="38" r="1.3" fill="#e2b04a" ${o}/><circle cx="44.4" cy="38" r="1.3" fill="#e2b04a" ${o}/>`;
      default:        return '';
    }
  }

  // 胸元のリボン（女性と子供）
  function ribbon(color, y) {
    const o = line(0.45);
    return `<path d="M32 ${y} L25 ${y - 3.4} Q23.6 ${y} 25 ${y + 3.4} Z M32 ${y} L39 ${y - 3.4} Q40.4 ${y} 39 ${y + 3.4} Z" fill="${color}" ${o}/>
      <path d="M26 ${y - 1.6} L29.5 ${y} M38 ${y - 1.6} L34.5 ${y}" stroke="${shade(color, 0.7)}" stroke-width="0.5"/>
      <rect x="30.4" y="${y - 1.6}" width="3.2" height="3.2" rx="1" fill="${shade(color, 0.85)}" ${o}/>`;
  }

  // person: { look, age, sex, name }。size は表示の大きさ（px）
  P.svg = function (person, size = 56) {
    const L = person.look, age = person.age == null ? 25 : person.age, female = person.sex === 'f';
    const child = age < 13, old = age >= 50, soft = (female || child) && !old;
    const vb = `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`;
    if (L.img) {
      return `<svg class="portrait" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
        <image href="${L.img}" x="0" y="0" width="64" height="64" preserveAspectRatio="xMidYMin slice"/></svg>`;
    }
    const skin = soft ? tint(L.skin, 0.35) : L.skin, skinS = shade(skin, 0.84), iris = eyeColor(person), cloth = L.cloth, clothS = shade(cloth, 0.72);
    const face = soft
      ? 'M18.8 29 C18.8 17 25 12.4 32 12.4 C39 12.4 45.2 17 45.2 29 C45.2 36 42.4 41.2 37.8 43.8 C35.8 45 33.9 45.6 32 45.6 C30.1 45.6 28.2 45 26.2 43.8 C21.6 41.2 18.8 36 18.8 29 Z'
      : 'M20.5 27 C20.5 18 26 13.5 32 13.5 C38 13.5 43.5 18 43.5 27 C43.5 34 42 39 38.2 42.6 C36 44.5 34 45.3 32 45.3 C30 45.3 28 44.5 25.8 42.6 C22 39 20.5 34 20.5 27 Z';
    const fid = soft ? 'fcs' : 'fcm';
    // 体は少し上へ寄せて、枠の下に肩が写るようにする
    const body = soft
      ? (child ? 'M15 64 C16 56 21 52 26.5 51 L30 49 L34 49 L37.5 51 C43 52 48 56 49 64 Z'
               : 'M11 64 C12 55 18 50.5 25 49.5 L29.6 47 L34.4 47 L39 49.5 C46 50.5 52 55 53 64 Z')
      : 'M4 64 C5 52 13.5 47.5 23 46 L29 44 L35 44 L41 46 C50.5 47.5 59 52 60 64 Z';
    const bodyShade = soft
      ? 'M40 50 C46 51 52 55 53 64 L44 64 C44 58 42 53 40 50 Z'
      : 'M42 46.4 C50.5 48 59 52 60 64 L48 64 C48 57 45 50 42 46.4 Z';
    const collar = soft
      ? `<path d="M25.6 49 Q28.6 53 32 50.8 Q35.4 53 38.4 49 L34.4 47 L32 48.6 L29.6 47 Z" fill="${tint(cloth, 0.85)}" ${line(0.5)}/>`
      : `<path d="M27.4 45.4 L32 52.6 L36.6 45.4 Z" fill="${skinS}" ${line(0.5)}/>`;
    const brows = soft
      ? `<path d="M22.2 25.6 Q25.2 24 28.4 25" stroke="${shade(L.hair, 0.6)}" stroke-width="0.8" fill="none" stroke-linecap="round"/><path d="M35.6 25 Q38.8 24 41.8 25.6" stroke="${shade(L.hair, 0.6)}" stroke-width="0.8" fill="none" stroke-linecap="round"/>`
      : `<path d="M22.8 26 L29.6 24.4" stroke="${shade(L.hair, 0.6)}" stroke-width="1.5" stroke-linecap="round"/><path d="M34.4 24.4 L41.2 26" stroke="${shade(L.hair, 0.6)}" stroke-width="1.5" stroke-linecap="round"/>`;
    const eyes = soft ? softEye(25.9, iris, true, child) + softEye(38.1, iris, false, child) : manEye(26.6, iris) + manEye(37.4, iris);
    const nose = soft
      ? `<path d="M32.6 36.4 L32.2 37.9 L33 38" stroke="${shade(skin, 0.68)}" stroke-width="0.55" fill="none" stroke-linecap="round"/>`
      : `<path d="M32.5 33.4 L31.6 36 L32.8 36.2" stroke="${shade(skin, 0.65)}" stroke-width="0.6" fill="none" stroke-linecap="round"/>`;
    const mouth = soft
      ? `<path d="M30.4 40.8 Q32 41.9 33.6 40.8" stroke="#8a3a34" stroke-width="0.75" fill="none" stroke-linecap="round"/>`
      : `<path d="M29.6 39.6 Q32 40.4 34.4 39.6" stroke="#5a261c" stroke-width="0.95" fill="none" stroke-linecap="round"/>`;
    const blush = soft
      ? `<ellipse cx="23" cy="37.6" rx="2.9" ry="1.3" fill="#f4807a" opacity="0.4"/><ellipse cx="41" cy="37.6" rx="2.9" ry="1.3" fill="#f4807a" opacity="0.4"/>
         <path d="M21.8 38.2 l0.9 -1.2 M23.1 38.2 l0.9 -1.2 M39.9 38.2 l0.9 -1.2 M41.2 38.2 l0.9 -1.2" stroke="#d85a52" stroke-width="0.4" opacity="0.6"/>`
      : '';
    const wrinkles = old ? `<path d="M21.6 31.6 l1.6 0.8 M42.4 31.6 l-1.6 0.8 M28.4 41 Q32 42.2 35.6 41 M26 22.6 Q32 21.4 38 22.6" stroke="${shade(skin, 0.68)}" stroke-width="0.5" fill="none"/>` : '';
    const beard = L.beard
      ? `<path d="M22.5 35 C23 43 27 47 32 47 C37 47 41 43 41.5 35 C39 40 36 41.6 32 41.6 C28 41.6 25 40 22.5 35 Z" fill="${L.hair}" ${line(0.5)}/><path d="M29 40.6 Q32 39.6 35 40.6" stroke="${shade(L.hair, 0.65)}" stroke-width="0.8" fill="none"/>`
      : '';
    const bp = bangsPath(L.style, soft);
    return `<svg class="portrait" viewBox="${vb}" width="${size}" height="${size}" aria-hidden="true">
      <defs>
        <linearGradient id="pbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4ead6"/><stop offset="1" stop-color="#d9c6a2"/></linearGradient>
        <clipPath id="${fid}"><path d="${face}"/></clipPath>
      </defs>
      <rect x="${VIEW.x}" y="${VIEW.y}" width="${VIEW.w}" height="${VIEW.h}" fill="url(#pbg)"/>
      ${hairBack(L.style, L.hair, soft)}
      <rect x="${soft ? 29.4 : 28.8}" y="40" width="${soft ? 5.2 : 6.4}" height="9" fill="${skin}" ${line(0.5)}/>
      <path d="M${soft ? 29.4 : 28.8} 41 L${soft ? 34.6 : 35.2} 41 L${soft ? 34.6 : 35.2} 44.5 Q32 46.5 ${soft ? 29.4 : 28.8} 43.5 Z" fill="${skinS}"/>
      <path d="${body}" fill="${cloth}" ${line()}/>
      <path d="${bodyShade}" fill="${clothS}" opacity="0.8"/>
      ${collar}
      ${soft ? ribbon(ribbonColor(person), child ? 51 : 49.8) : ''}
      ${hairCap(L.style, L.hair, skin, soft)}
      <path d="${face}" fill="${skin}"/>
      <g clip-path="url(#${fid})">
        <path d="M39.5 16 C46 24 46 37 37 46 L47 47 L47 15 Z" fill="${skinS}" opacity="0.7"/>
        ${bp ? `<path d="${bp}" fill="${skinS}" transform="translate(0.4 1.8)"/>` : ''}
      </g>
      <path d="${face}" fill="none" ${line()}/>
      ${blush}
      ${wrinkles}
      ${eyes}
      ${brows}
      ${nose}
      ${mouth}
      ${L.paint === 'band' ? '' : paint(L.paint, soft)}
      ${beard}
      ${bangs(L.style, L.hair, soft)}
      ${L.paint === 'band' ? paint('band', soft) : ''}
      ${braidFront(L.style, L.hair)}
      ${accessory(L.acc)}
      <rect x="${VIEW.x + 0.3}" y="${VIEW.y + 0.3}" width="${VIEW.w - 0.6}" height="${VIEW.h - 0.6}" fill="none" stroke="#6b5236" stroke-width="0.6"/>
    </svg>`;
  };

  P.shade = shade;
})();
