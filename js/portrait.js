// 人物の似顔絵（SVG）。胸から上のアニメ風。data.js の people[].look と sex・age から組み立てる。
//   女性と子供は萌え絵ふうに、大きな瞳・丸い顔・小さな口・ふんわりした前髪・天使の輪・胸元のリボンで描く
//   男性は目を細め、眉を太く、あごをしっかり描く
//   look.img に画像のパス（例 'img/people/ul.png'）を書くと、その絵を丸く切り抜いて使う
//   look.eye は瞳の色、look.ribbon は胸元のリボンの色（書かなければ名前から選ぶ）
// 子供（13歳未満）は顔をもっと丸く、目をもっと大きく描く。年配（50歳以上）は目もとにしわを描く。
(function () {
  const G = window.Game;

  const P = G.Portrait = {};

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
    const d = shade(c, 0.82);
    switch (style) {
      case 'long':  return `<path d="M17 22 C11 38 13 54 10 64 L54 64 C51 54 53 38 47 22 Z" fill="${d}"/>`;
      case 'pony':  return `<path d="M40 13 C56 12 59 30 55 45 C53 53 50 58 47 61 C48 47 46 32 38 20 Z" fill="${d}"/>`;
      case 'twin':  return `<path d="M20 17 C6 21 5 40 9 56 C12 47 14 36 22 26 Z M44 17 C58 21 59 40 55 56 C52 47 50 36 42 26 Z" fill="${d}"/>
        <circle cx="19.5" cy="18.5" r="2" fill="${shade(c, 0.6)}"/><circle cx="44.5" cy="18.5" r="2" fill="${shade(c, 0.6)}"/>`;
      case 'bun':   return `<circle cx="32" cy="8.5" r="6.5" fill="${c}"/><path d="M27 8.5 Q32 4.5 37 8.5" stroke="${tint(c, 0.35)}" stroke-width="0.9" fill="none"/>`;
      case 'short': return moe ? `<path d="M18 24 C17 34 19 41 22.5 44 L41.5 44 C45 41 47 34 46 24 Z" fill="${d}"/>` : '';
      case 'braid': return `<path d="M18 24 C16 31 17 37 19.5 41 L44.5 41 C47 37 48 31 46 24 Z" fill="${d}"/>`;
      default:      return '';
    }
  }

  // 頭にかぶさる髪（顔より先に描く）
  function hairCap(style, c, skin, moe) {
    if (style === 'shaved') return `<path d="M20.5 27 C20 17 25.5 12.5 32 12.5 C38.5 12.5 44 17 43.5 27 Z" fill="${shade(skin, 0.82)}"/>`;
    return moe
      ? `<path d="M17.6 30 C16.6 14 24.5 9 32 9 C39.5 9 47.4 14 46.4 30 Z" fill="${c}"/>`
      : `<path d="M19.5 28 C18.5 15 25 10.5 32 10.5 C39 10.5 45.5 15 44.5 28 Z" fill="${c}"/>`;
  }

  // 前髪（顔の上に描く）。萌えの前髪は房を細かく、つやの輪（天使の輪）をつける
  function bangs(style, c, moe) {
    if (style === 'shaved') return '';
    if (style === 'wild') {
      return `<path d="M18 29 L18.5 17 L22 20 L22.5 10 L27.5 16 L31 7.5 L34.5 15.5 L40 9.5 L41 18.5 L46 15.5 L46 29 L43 21 L40 24 L37.5 18.5 L34.5 23 L31.5 18 L28.5 23 L25.5 18.5 L22.5 23.5 Z" fill="${c}"/>`;
    }
    if (!moe) {
      return `<path d="M19.8 26 C19.3 15 25 11.5 32 11.5 C39 11.5 44.7 15 44.2 26 L41.8 19.5 L38.5 22.5 L35.5 17.5 L32.2 21.5 L29 17.5 L26 22 L22.5 19.5 Z" fill="${c}"/>
        <path d="M26 14.6 Q30 13 34 13.4" stroke="${tint(c, 0.3)}" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.6"/>`;
    }
    const d = shade(c, 0.78);
    const side = ['long', 'pony', 'twin', 'braid', 'bun', 'short'].includes(style)
      ? `<path d="M18.4 22 C15.8 32 16.4 41 19.6 47.5 L21.2 36.5 L20.4 29 Z M45.6 22 C48.2 32 47.6 41 44.4 47.5 L42.8 36.5 L43.6 29 Z" fill="${c}"/>` : '';
    return `${side}
      <path d="M18.4 30.5 C17.8 15.5 24.5 10.6 32 10.6 C39.5 10.6 46.2 15.5 45.6 30.5 L43.8 23.4 L42.4 28.4 L39.8 19.8 L37.6 26.6 L34.8 19.4 L32.6 26 L30 19.4 L27.4 26.6 L25 20 L22.4 27.6 L21 22.8 Z" fill="${c}"/>
      <path d="M25 20 L26.2 24.6 M30 19.4 L30.8 24 M34.8 19.4 L34 24 M39.8 19.8 L38.6 24.4" stroke="${d}" stroke-width="0.5" opacity="0.7"/>
      <path d="M24.5 17.4 Q28 15.2 31 14.9 M33 14.9 Q36 15.2 39.5 17.4" stroke="${tint(c, 0.45)}" stroke-width="1.3" fill="none" stroke-linecap="round" opacity="0.4"/>`;
  }

  // 三つ編みは体の前に垂らす
  function braidFront(style, c) {
    if (style !== 'braid') return '';
    const d = shade(c, 0.85), seg = x => [43, 48, 53, 58].map(y => `<ellipse cx="${x}" cy="${y}" rx="2.4" ry="3.1" fill="${c}" stroke="${d}" stroke-width="0.5"/>`).join('');
    return seg(19.5) + seg(44.5) + `<circle cx="19.5" cy="61.5" r="1.3" fill="#c0392b"/><circle cx="44.5" cy="61.5" r="1.3" fill="#c0392b"/>`;
  }

  // ---------- 目 ----------
  // 萌えの目：縦長の大きな瞳、上から下へ明るくなる色、白い光を二つ
  function moeEye(cx, iris, left, big) {
    const k = big ? 1.12 : 1, w = 4.3 * k, y = 32, top = y - 5.2 * k, bot = y + 4.6 * k;
    const irx = 3.3 * k, iry = 4.4 * k, out = left ? -1 : 1, gid = `ig${iris.slice(1)}`, clip = `me${left ? 'l' : 'r'}${big ? 'b' : ''}`;
    const shape = `M${cx - w} ${y + 0.4} C${cx - w} ${top + 0.6} ${cx + w} ${top} ${cx + w} ${y - 0.4} C${cx + w} ${bot} ${cx - w} ${bot + 0.4} ${cx - w} ${y + 0.4} Z`;
    return `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(iris, 0.45)}"/><stop offset="0.55" stop-color="${iris}"/><stop offset="1" stop-color="${tint(iris, 0.55)}"/></linearGradient>
      <clipPath id="${clip}"><path d="${shape}"/></clipPath>
      <path d="${shape}" fill="#fff"/>
      <g clip-path="url(#${clip})">
        <ellipse cx="${cx}" cy="${y + 0.6}" rx="${irx}" ry="${iry}" fill="url(#${gid})"/>
        <ellipse cx="${cx}" cy="${y + 0.2}" rx="${irx * 0.5}" ry="${iry * 0.55}" fill="${shade(iris, 0.3)}"/>
        <ellipse cx="${cx}" cy="${y + 2.6 * k}" rx="${irx * 0.75}" ry="${iry * 0.32}" fill="${tint(iris, 0.7)}" opacity="0.55"/>
        <path d="M${cx - w} ${top + 1.2} L${cx + w} ${top + 1.2}" stroke="rgba(0,0,0,0.22)" stroke-width="2.2"/>
      </g>
      <ellipse cx="${cx + 1.3 * k}" cy="${y - 1.4 * k}" rx="${1.35 * k}" ry="${1.65 * k}" fill="#fff"/>
      <circle cx="${cx - 1.3 * k}" cy="${y + 2.3 * k}" r="${0.6 * k}" fill="#fff"/>
      <circle cx="${cx + 1.8 * k}" cy="${y + 2.8 * k}" r="${0.35 * k}" fill="#fff" opacity="0.9"/>
      <path d="M${cx - w - 0.6} ${y + 0.9} C${cx - w} ${top - 0.4} ${cx + w} ${top - 1} ${cx + w + 0.6} ${y - 0.6}" stroke="#2a1812" stroke-width="1.7" fill="none" stroke-linecap="round"/>
      <path d="M${cx + out * (w + 0.4)} ${y + (left ? 0.6 : -0.6)} l${out * 1.7} -1.5 M${cx + out * (w - 0.6)} ${top + 1.6} l${out * 1.3} -1.4" stroke="#2a1812" stroke-width="0.9" stroke-linecap="round"/>
      <path d="M${cx - w * 0.55} ${bot + 0.9} Q${cx} ${bot + 1.5} ${cx + w * 0.55} ${bot + 0.8}" stroke="#2a1812" stroke-width="0.45" fill="none" opacity="0.7"/>`;
  }

  // 男性の目：細めで、光は小さく一つ
  function manEye(cx, iris) {
    const w = 3.3, y = 30.6, top = 28.2, bot = 32.6;
    const shape = `M${cx - w} ${y} Q${cx} ${top - 1.6} ${cx + w} ${y - 0.3} Q${cx} ${bot + 1.2} ${cx - w} ${y} Z`;
    const clip = `mm${cx < 32 ? 'l' : 'r'}`;
    return `<clipPath id="${clip}"><path d="${shape}"/></clipPath>
      <path d="${shape}" fill="#fff"/>
      <g clip-path="url(#${clip})">
        <ellipse cx="${cx}" cy="${y + 0.5}" rx="1.9" ry="2.4" fill="${iris}"/>
        <ellipse cx="${cx}" cy="${y + 0.2}" rx="0.95" ry="1.3" fill="#120c0a"/>
      </g>
      <circle cx="${cx + 0.8}" cy="${y - 0.6}" r="0.6" fill="#fff"/>
      <path d="M${cx - w - 0.3} ${y + 0.1} Q${cx} ${top - 1.9} ${cx + w + 0.3} ${y - 0.4}" stroke="#1a120c" stroke-width="1.05" fill="none" stroke-linecap="round"/>`;
  }

  function paint(kind, moe) {
    const y = moe ? 37.4 : 35.4;
    switch (kind) {
      case 'stripes': return `<path d="M21.6 ${y} L24.6 ${y + 0.8} M21.8 ${y + 1.8} L24.4 ${y + 2.4} M42.4 ${y} L39.4 ${y + 0.8} M42.2 ${y + 1.8} L39.6 ${y + 2.4}" stroke="#b23a2a" stroke-width="0.8" stroke-linecap="round"/>`;
      case 'dots':    return `<g fill="#fff" opacity="0.9"><circle cx="22.8" cy="${y + 0.6}" r="0.55"/><circle cx="24.2" cy="${y + 1.6}" r="0.55"/><circle cx="41.2" cy="${y + 0.6}" r="0.55"/><circle cx="39.8" cy="${y + 1.6}" r="0.55"/></g>`;
      case 'band':    return `<rect x="18" y="17.2" width="28" height="3" rx="1.5" fill="#2f4c7a"/><circle cx="32" cy="18.7" r="1.5" fill="#e2b04a"/>`;
      default:        return '';
    }
  }

  function accessory(kind) {
    switch (kind) {
      case 'feather': return `<path d="M43 18 Q53 6 52 1 Q47 8.5 41.5 16.5 Z" fill="#e0b84a" stroke="#8a5a23" stroke-width="0.5"/><path d="M42 17 L51 4" stroke="#8a5a23" stroke-width="0.4"/>`;
      case 'bone':    return `<path d="M29 57.4 L35 57.4" stroke="#f0e6d0" stroke-width="2" stroke-linecap="round"/>`;
      case 'beads':   return [[25.5, 53.6], [28, 55.2], [30.4, 56.1], [33.6, 56.1], [36, 55.2], [38.5, 53.6]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="1.05" fill="${['#c0392b', '#e2b04a', '#2e74a8'][i % 3]}"/>`).join('');
      case 'flower':  return `<g transform="translate(42 15.5)">${[0, 72, 144, 216, 288].map(a => `<ellipse rx="2.1" ry="3.4" cy="-2.8" fill="#fff" stroke="#f2a7b8" stroke-width="0.4" transform="rotate(${a})"/>`).join('')}<circle r="1.5" fill="#f5c84b"/></g>`;
      case 'earring': return `<circle cx="19.6" cy="38" r="1.3" fill="#e2b04a"/><circle cx="44.4" cy="38" r="1.3" fill="#e2b04a"/>`;
      default:        return '';
    }
  }

  // 胸元のリボン（萌えの女性と子供）
  function ribbon(color, y) {
    const d = shade(color, 0.7);
    return `<path d="M32 ${y} L24.6 ${y - 3.6} Q23.2 ${y} 24.6 ${y + 3.6} Z M32 ${y} L39.4 ${y - 3.6} Q40.8 ${y} 39.4 ${y + 3.6} Z" fill="${color}" stroke="${d}" stroke-width="0.5"/>
      <path d="M31 ${y + 1} L28.4 ${y + 7.6} L30.6 ${y + 7} Z M33 ${y + 1} L35.6 ${y + 7.6} L33.4 ${y + 7} Z" fill="${color}" stroke="${d}" stroke-width="0.4"/>
      <rect x="30.4" y="${y - 1.6}" width="3.2" height="3.2" rx="1" fill="${shade(color, 0.85)}"/>`;
  }

  // person: { look, age, sex, name }。size は表示の大きさ（px）
  P.svg = function (person, size = 56) {
    const L = person.look, age = person.age == null ? 25 : person.age, female = person.sex === 'f';
    const child = age < 13, old = age >= 50, moe = (female || child) && !old;
    if (L.img) {
      return `<svg class="portrait" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
        <clipPath id="pimg"><circle cx="32" cy="32" r="31"/></clipPath>
        <image href="${L.img}" x="0" y="0" width="64" height="64" preserveAspectRatio="xMidYMin slice" clip-path="url(#pimg)"/></svg>`;
    }
    // 萌えの顔は肌を明るめに描く（日焼けの差は残す）
    const skin = moe ? tint(L.skin, 0.4) : L.skin, skinD = shade(skin, 0.88), iris = eyeColor(person), cloth = L.cloth, clothD = shade(cloth, 0.72);
    const face = moe
      ? 'M18.8 29 C18.8 17 25 12.4 32 12.4 C39 12.4 45.2 17 45.2 29 C45.2 36 42.4 41.2 37.8 43.8 C35.8 45 33.9 45.6 32 45.6 C30.1 45.6 28.2 45 26.2 43.8 C21.6 41.2 18.8 36 18.8 29 Z'
      : 'M20.5 27 C20.5 18 26 13.5 32 13.5 C38 13.5 43.5 18 43.5 27 C43.5 34 42 39 38.2 42.6 C36 44.5 34 45.3 32 45.3 C30 45.3 28 44.5 25.8 42.6 C22 39 20.5 34 20.5 27 Z';
    const body = moe
      ? (child ? 'M15 64 C16 57 21 53.5 26.5 52.6 L30 50.6 L34 50.6 L37.5 52.6 C43 53.5 48 57 49 64 Z'
               : 'M11 64 C12 56 18 52 25 51 L29.6 48.6 L34.4 48.6 L39 51 C46 52 52 56 53 64 Z')
      : 'M4 64 C5 53 13.5 49 23 47.6 L29 45.6 L35 45.6 L41 47.6 C50.5 49 59 53 60 64 Z';
    const neckTop = moe ? 42.5 : 40;
    // 襟。萌えは丸い白襟、男性は V 字
    const collar = moe
      ? `<path d="M25.6 50.6 Q28.6 54.6 32 52.4 Q35.4 54.6 38.4 50.6 L34.4 48.6 L32 50.2 L29.6 48.6 Z" fill="${tint(cloth, 0.85)}" stroke="${clothD}" stroke-width="0.5"/>`
      : `<path d="M27.6 47.2 L32 54.5 L36.4 47.2 Z" fill="${skinD}"/><path d="M27.6 47.2 L32 54.5 L36.4 47.2" stroke="${clothD}" stroke-width="1" fill="none"/>`;
    const brows = moe
      ? `<path d="M22.4 25.2 Q25.4 23.8 28.4 24.8" stroke="${shade(L.hair, 0.75)}" stroke-width="0.7" fill="none" stroke-linecap="round"/><path d="M35.6 24.8 Q38.6 23.8 41.6 25.2" stroke="${shade(L.hair, 0.75)}" stroke-width="0.7" fill="none" stroke-linecap="round"/>`
      : `<path d="M23 25.6 L29.6 24.6" stroke="${shade(L.hair, 0.75)}" stroke-width="1.4" stroke-linecap="round"/><path d="M34.4 24.6 L41 25.6" stroke="${shade(L.hair, 0.75)}" stroke-width="1.4" stroke-linecap="round"/>`;
    const eyes = moe ? moeEye(25.8, iris, true, child) + moeEye(38.2, iris, false, child) : manEye(26.6, iris) + manEye(37.4, iris);
    const nose = moe
      ? `<path d="M32.2 37.6 L32.7 38.1" stroke="${shade(skin, 0.7)}" stroke-width="0.6" stroke-linecap="round"/>`
      : `<path d="M32.4 33.8 L31.7 35.7 L32.7 35.9" stroke="${shade(skin, 0.72)}" stroke-width="0.55" fill="none" stroke-linecap="round"/>`;
    const mouth = moe
      ? `<path d="M30.6 40.6 Q31.3 41.5 32 40.9 Q32.7 41.5 33.4 40.6" stroke="#a84a44" stroke-width="0.7" fill="none" stroke-linecap="round"/>`
      : `<path d="M29.8 39.4 Q32 40.1 34.2 39.4" stroke="#6b2e22" stroke-width="0.95" fill="none" stroke-linecap="round"/>`;
    const blush = moe
      ? `<ellipse cx="22.8" cy="38" rx="3.2" ry="1.5" fill="#f4807a" opacity="0.45"/><ellipse cx="41.2" cy="38" rx="3.2" ry="1.5" fill="#f4807a" opacity="0.45"/>
         <path d="M21.4 38.6 l1 -1.4 M22.8 38.6 l1 -1.4 M24.2 38.6 l1 -1.4 M39.8 38.6 l1 -1.4 M41.2 38.6 l1 -1.4 M42.6 38.6 l1 -1.4" stroke="#e0605a" stroke-width="0.4" opacity="0.6"/>`
      : old ? '' : `<ellipse cx="24.6" cy="35.3" rx="2.5" ry="1.1" fill="#f0857a" opacity="0.15"/><ellipse cx="39.4" cy="35.3" rx="2.5" ry="1.1" fill="#f0857a" opacity="0.15"/>`;
    const wrinkles = old ? `<path d="M21.6 31.6 l1.6 0.8 M42.4 31.6 l-1.6 0.8 M28.4 41 Q32 42.2 35.6 41" stroke="${shade(skin, 0.72)}" stroke-width="0.5" fill="none"/>` : '';
    const beard = L.beard
      ? `<path d="M22.5 35 C23 43 27 47 32 47 C37 47 41 43 41.5 35 C39 40 36 41.6 32 41.6 C28 41.6 25 40 22.5 35 Z" fill="${L.hair}"/><path d="M29 40.6 Q32 39.6 35 40.6" stroke="${shade(L.hair, 0.7)}" stroke-width="0.8" fill="none"/>`
      : '';
    return `<svg class="portrait" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
      <defs>
        <radialGradient id="pbg" cx="0.5" cy="0.35" r="0.75"><stop offset="0" stop-color="#fff8ee"/><stop offset="1" stop-color="#e6d3b4"/></radialGradient>
        <clipPath id="pc"><circle cx="32" cy="32" r="31"/></clipPath>
      </defs>
      <circle cx="32" cy="32" r="31" fill="url(#pbg)"/>
      <g clip-path="url(#pc)">
        ${hairBack(L.style, L.hair, moe)}
        <path d="${body}" fill="${cloth}" stroke="${clothD}" stroke-width="0.6"/>
        <rect x="${moe ? 29.6 : 29}" y="${neckTop}" width="${moe ? 4.8 : 6}" height="8" fill="${skinD}"/>
        ${collar}
        ${moe ? ribbon(ribbonColor(person), child ? 52.6 : 51.4) : ''}
        ${hairCap(L.style, L.hair, skin, moe)}
        <path d="${face}" fill="${skin}"/>
        <path d="M25 ${moe ? 43 : 40.5} Q32 ${moe ? 47.5 : 46} 39 ${moe ? 43 : 40.5}" stroke="${skinD}" stroke-width="0.6" fill="none" opacity="0.5"/>
        ${blush}
        ${wrinkles}
        ${eyes}
        ${brows}
        ${nose}
        ${mouth}
        ${L.paint === 'band' ? '' : paint(L.paint, moe)}
        ${beard}
        ${bangs(L.style, L.hair, moe)}
        ${L.paint === 'band' ? paint('band', moe) : ''}
        ${braidFront(L.style, L.hair)}
        ${accessory(L.acc)}
      </g>
    </svg>`;
  };

  P.shade = shade;
})();
