// 人物の似顔絵（SVG）。data.js の people[].look と age から組み立てる。
(function () {
  const G = window.Game;

  const P = G.Portrait = {};

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k))));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }

  // 髪の後ろ側（頭より先に描く）
  function hairBack(style, c) {
    switch (style) {
      case 'long':  return `<path d="M17 28 Q16 50 22 56 L42 56 Q48 50 47 28 Z" fill="${c}"/>`;
      case 'braid': return `<rect x="15" y="34" width="5" height="20" rx="2.5" fill="${c}"/><rect x="44" y="34" width="5" height="20" rx="2.5" fill="${c}"/>`;
      case 'bun':   return `<circle cx="32" cy="12" r="7" fill="${c}"/>`;
      case 'pony':  return `<path d="M42 16 Q54 18 52 34 Q50 46 46 50 Q48 36 42 24 Z" fill="${c}"/>`;
      case 'twin':  return `<path d="M17 22 Q8 30 11 46 Q14 40 19 34 Z M47 22 Q56 30 53 46 Q50 40 45 34 Z" fill="${c}"/>`;
      default:      return '';
    }
  }

  // 髪の前側（頭の上に描く）
  function hairFront(style, c, skin) {
    switch (style) {
      case 'short':  return `<path d="M19 28 Q19 13 32 13 Q45 13 45 28 Q40 20 32 20 Q24 20 19 28 Z" fill="${c}"/>`;
      case 'long':
      case 'braid':
      case 'pony':
      case 'twin':
      case 'bun':    return `<path d="M19 30 Q18 13 32 13 Q46 13 45 30 Q42 19 32 19 Q22 19 19 30 Z" fill="${c}"/>`;
      case 'shaved': return `<path d="M20 24 Q22 15 32 15 Q42 15 44 24 Q38 19 32 19 Q26 19 20 24 Z" fill="${shade(skin, 0.8)}"/>`;
      case 'wild':   return `<path d="M17 30 L18 18 L22 21 L23 11 L28 17 L31 8 L35 16 L40 10 L41 19 L46 16 L47 30 Q42 19 32 19 Q22 19 17 30 Z" fill="${c}"/>`;
      default:       return '';
    }
  }

  function paint(kind) {
    switch (kind) {
      case 'stripes': return `<path d="M22 33 L27 35 M22 36 L27 38 M42 33 L37 35 M42 36 L37 38" stroke="#b23a2a" stroke-width="1.4"/>`;
      case 'dots':    return `<circle cx="28" cy="22" r="1.1" fill="#f3ece0"/><circle cx="32" cy="21" r="1.1" fill="#f3ece0"/><circle cx="36" cy="22" r="1.1" fill="#f3ece0"/>`;
      case 'band':    return `<rect x="19" y="26" width="26" height="5" fill="#2f4c7a" opacity="0.75"/>`;
      default:        return '';
    }
  }

  function accessory(kind) {
    switch (kind) {
      case 'feather': return `<path d="M44 18 Q52 6 50 2 Q46 10 42 17 Z" fill="#c8a24a" stroke="#6b4423" stroke-width="0.6"/>`;
      case 'bone':    return `<path d="M26 54 L38 54" stroke="#f0e6d0" stroke-width="2.4" stroke-linecap="round"/><circle cx="26" cy="54" r="1.6" fill="#f0e6d0"/><circle cx="38" cy="54" r="1.6" fill="#f0e6d0"/>`;
      case 'beads':   return [24, 28, 32, 36, 40].map((x, i) => `<circle cx="${x}" cy="${53 + (i % 2)}" r="1.5" fill="${['#b23a2a', '#e2b04a', '#4f7a94'][i % 3]}"/>`).join('');
      case 'flower':  return `<g transform="translate(43 19)">${[0, 72, 144, 216, 288].map(a => `<ellipse rx="2.2" ry="3.6" cy="-3" fill="#f2a7b8" transform="rotate(${a})"/>`).join('')}<circle r="1.6" fill="#f5d36b"/></g>`;
      case 'earring': return `<circle cx="19.5" cy="36" r="1.8" fill="#e2b04a"/><circle cx="44.5" cy="36" r="1.8" fill="#e2b04a"/>`;
      default:        return '';
    }
  }

  // person: { look, age }。size は表示の大きさ（px）
  P.svg = function (person, size = 56) {
    const L = person.look, age = person.age || 30, female = person.sex === 'f';
    const young = age < 16, old = age >= 50;
    const headRy = young ? 14 : female ? 14.5 : 15;
    const headRx = female ? 12.3 : 13;
    const eyeR = young ? 1.9 : female ? 1.8 : 1.5;
    // 女性は睫毛・頬の赤み・紅をさした唇
    const femaleFace = female ? `
        <path d="M24.6 28.2 L23.6 27.2 M25.6 27.6 L25 26.4 M39.4 28.2 L40.4 27.2 M38.4 27.6 L39 26.4" stroke="#1a120c" stroke-width="0.7"/>
        ${old ? '' : `<ellipse cx="24.5" cy="35" rx="2.6" ry="1.5" fill="#e07a6a" opacity="0.35"/><ellipse cx="39.5" cy="35" rx="2.6" ry="1.5" fill="#e07a6a" opacity="0.35"/>`}` : '';
    const mouth = female && !old
      ? `<path d="M29.3 38.8 Q32 40.8 34.7 38.8 Q32 39.6 29.3 38.8 Z" fill="#b8473e" stroke="#9a3a32" stroke-width="0.6"/>`
      : `<path d="M28.5 39 Q32 ${old ? 39.5 : 41} 35.5 39" stroke="#6b2e22" stroke-width="1.1" fill="none"/>`;
    const wrinkles = old
      ? `<path d="M25 21 Q32 19 39 21 M27 24 Q32 22.5 37 24" stroke="${shade(L.skin, 0.7)}" stroke-width="0.7" fill="none"/>`
      : '';
    const beard = L.beard
      ? `<path d="M22 36 Q24 48 32 48 Q40 48 42 36 Q38 42 32 42 Q26 42 22 36 Z" fill="${L.hair}"/>`
      : '';
    return `<svg class="portrait" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="32" cy="32" r="31" fill="#e9dcc4"/>
      <clipPath id="pc"><circle cx="32" cy="32" r="31"/></clipPath>
      <g clip-path="url(#pc)">
        ${hairBack(L.style, L.hair)}
        <path d="M10 64 Q12 50 32 48 Q52 50 54 64 Z" fill="${L.cloth}"/>
        <rect x="28" y="40" width="8" height="9" fill="${shade(L.skin, 0.9)}"/>
        <ellipse cx="32" cy="30" rx="${headRx}" ry="${headRy}" fill="${L.skin}"/>
        ${paint(L.paint)}
        ${wrinkles}
        <ellipse cx="27" cy="30" rx="${eyeR}" ry="${eyeR * 1.2}" fill="#1a120c"/>
        <ellipse cx="37" cy="30" rx="${eyeR}" ry="${eyeR * 1.2}" fill="#1a120c"/>
        ${female ? '<circle cx="27.6" cy="29.3" r="0.6" fill="#fff"/><circle cx="37.6" cy="29.3" r="0.6" fill="#fff"/>' : ''}
        <path d="M27 26.5 L30 26 M34 26 L37 26.5" stroke="${shade(L.hair, 0.9)}" stroke-width="${female ? 0.8 : 1.1}"/>
        <path d="M32 31 L31 35 L33 35" stroke="${shade(L.skin, 0.75)}" stroke-width="0.9" fill="none"/>
        ${femaleFace}
        ${mouth}
        ${beard}
        ${hairFront(L.style, L.hair, L.skin)}
        ${accessory(L.acc)}
      </g>
    </svg>`;
  };

  P.shade = shade;
})();
