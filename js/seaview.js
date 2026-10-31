// 航海画面。地図を大きく拡大した海を、船団が実際に進んでいく様子を描く。
// 操作: 海をクリック（押したまま動かしてもよい）でその方向へ / 矢印キー・WASD で舵を取る / スペースで止まる
// 動きの決まりは sea.js の Sea.tick にあり、ここは毎フレームそれを呼んで描くだけ。
(function () {
  const G = window.Game;
  const D = G.DATA;
  const R = D.rules;
  const M = D.map;

  const V = G.SeaView = {};
  V.zoom = 4;          // 地図の1点を画面の何ピクセルにするか
  V.timeScale = 1;     // 早送り

  let canvas, ctx, raf = 0, last = 0, onEvent = null, onFrame = null;
  let seaPath, landPaths, ways, fogCanvas, fogKey = '';
  let trail = [];
  const keys = new Set();
  let dragging = false;
  let hudTimer = 0, saveTimer = 0;
  const seaCache = new Map();

  const COLORS = {
    land: '#9c8660', grass: '#7d7d4e', sea: '#2e6482', deep: '#24526b', shallow: 'rgba(140,200,215,0.35)',
    sand: '#d8c49a', wave: 'rgba(225,240,245,', fog: 'rgba(36,30,26,0.82)',
  };

  function isSeaCached(x, y) {
    const k = x + ',' + y;
    if (!seaCache.has(k)) seaCache.set(k, G.Sea.isSea(x, y));
    return seaCache.get(k);
  }

  V.mounted = () => !!(canvas && canvas.isConnected);

  V.mount = function (container, handlers) {
    onEvent = handlers.onEvent;
    onFrame = handlers.onFrame;
    if (V.mounted() && canvas.parentNode === container) return;
    container.innerHTML = '';
    canvas = document.createElement('canvas');
    canvas.className = 'sea-canvas';
    canvas.tabIndex = 0;
    container.appendChild(canvas);
    ctx = canvas.getContext('2d');
    seaPath = new Path2D(M.seaPath);
    landPaths = M.landPaths.map(p => new Path2D(p));
    ways = M.waterways.map(w => ({ width: w.width, path: new Path2D(w.d) }));
    trail = [];
    canvas.addEventListener('mousedown', ev => { dragging = true; aim(ev); });
    canvas.addEventListener('mousemove', ev => { if (dragging) aim(ev); });
    window.addEventListener('mouseup', () => { dragging = false; });
    canvas.addEventListener('touchstart', ev => { aim(ev.touches[0]); ev.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchmove', ev => { aim(ev.touches[0]); ev.preventDefault(); }, { passive: false });
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  };

  V.unmount = function () {
    cancelAnimationFrame(raf);
    raf = 0;
    canvas = null;
  };

  // 画面上の点 → 地図の点
  function toWorld(ev) {
    const s = G.state, r = canvas.getBoundingClientRect();
    return [s.sea.x + (ev.clientX - r.left - r.width / 2) / V.zoom, s.sea.y + (ev.clientY - r.top - r.height / 2) / V.zoom];
  }

  function aim(ev) {
    const s = G.state;
    if (!s.sea || s.encounter || G.battle) return;
    const [x, y] = toWorld(ev);
    const port = s.discovered.find(id => Math.hypot(D.towns[id].x - x, D.towns[id].y - y) <= 8);
    G.Sea.setTarget(s, x, y, port);
  }

  window.addEventListener('keydown', ev => {
    if (!V.mounted() || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const k = ev.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '].includes(k)) ev.preventDefault();
    if (k === ' ') { G.Sea.stop(G.state); return; }
    keys.add(k);
  });
  window.addEventListener('keyup', ev => keys.delete(ev.key.toLowerCase()));

  function steerByKeys(s) {
    let dx = 0, dy = 0;
    if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
    if (keys.has('arrowright') || keys.has('d')) dx += 1;
    if (keys.has('arrowup') || keys.has('w')) dy -= 1;
    if (keys.has('arrowdown') || keys.has('s')) dy += 1;
    if (dx || dy) G.Sea.setTarget(s, s.sea.x + dx * 20, s.sea.y + dy * 20);
  }

  function loop(now) {
    if (!V.mounted()) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const s = G.state;
    if (!s.sea) return;
    if (!s.encounter && !G.battle && !(s.pendingEvents && s.pendingEvents.length)) {
      steerByKeys(s);
      const before = [s.sea.x, s.sea.y];
      const ev = G.Sea.tick(s, dt * V.timeScale);
      if (s.sea && (before[0] !== s.sea.x || before[1] !== s.sea.y)) {
        trail.push([s.sea.x, s.sea.y, now]);
        if (trail.length > 160) trail.shift();
      }
      if (Object.keys(ev).length) { G.save(s); onEvent && onEvent(ev); if (!s.sea) return; }
    }
    hudTimer += dt; saveTimer += dt;
    if (hudTimer > 0.25) { hudTimer = 0; onFrame && onFrame(); }
    if (saveTimer > 3) { saveTimer = 0; G.save(s); }
    draw(s, now / 1000);
  }

  // ---------- 描画 ----------
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = Math.round(w * 0.62);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.height = h + 'px';
    }
    return { w, h, dpr };
  }

  function fogImage(s) {
    const C = R.exploreCell, cw = Math.ceil(M.width / C), ch = Math.ceil(M.height / C);
    const key = Object.keys(s.explored).length;
    if (fogCanvas && fogKey === key) return fogCanvas;
    fogKey = key;
    fogCanvas = fogCanvas || document.createElement('canvas');
    fogCanvas.width = cw;
    fogCanvas.height = ch;
    const f = fogCanvas.getContext('2d');
    f.clearRect(0, 0, cw, ch);
    f.fillStyle = COLORS.fog;
    for (let x = 0; x < cw; x++) for (let y = 0; y < ch; y++) if (!s.explored[x + ',' + y]) f.fillRect(x, y, 1, 1);
    return fogCanvas;
  }

  function draw(s, t) {
    const { w, h, dpr } = resize();
    const Z = V.zoom, v = s.sea;
    const ox = w / 2 - v.x * Z, oy = h / 2 - v.y * Z;
    const toScreen = (x, y) => [x * Z + ox, y * Z + oy];
    const view = { x0: v.x - w / 2 / Z, y0: v.y - h / 2 / Z, x1: v.x + w / 2 / Z, y1: v.y + h / 2 / Z };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.land;
    ctx.fillRect(0, 0, w, h);

    // 世界座標で描く
    ctx.setTransform(dpr * Z, 0, 0, dpr * Z, dpr * ox, dpr * oy);
    ctx.fillStyle = COLORS.grass;
    for (let x = Math.floor(view.x0 / 12) * 12; x < view.x1; x += 12) {
      for (let y = Math.floor(view.y0 / 12) * 12; y < view.y1; y += 12) {
        const hsh = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 % 1;
        if (hsh > 0.3) ctx.fillRect(x + hsh * 6, y + hsh * 4, 1.2, 1.2);
      }
    }
    // 海峡と川（岸の砂を少し太く描いてから水を描く）
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const w of ways) {
      ctx.strokeStyle = COLORS.sand;
      ctx.lineWidth = w.width + 1.2;
      ctx.stroke(w.path);
    }
    for (const w of ways) {
      ctx.strokeStyle = COLORS.sea;
      ctx.lineWidth = w.width;
      ctx.stroke(w.path);
    }
    ctx.fillStyle = COLORS.sea;
    ctx.fill(seaPath);
    ctx.fillStyle = COLORS.land;
    landPaths.forEach(p => ctx.fill(p));
    // 浅瀬と砂浜
    ctx.save();
    ctx.clip(seaPath);
    ctx.strokeStyle = COLORS.shallow;
    ctx.lineWidth = 7;
    ctx.stroke(seaPath);
    landPaths.forEach(p => ctx.stroke(p));
    ctx.restore();
    ctx.strokeStyle = COLORS.sand;
    ctx.lineWidth = 1.2;
    ctx.stroke(seaPath);
    landPaths.forEach(p => ctx.stroke(p));

    // 波
    ctx.lineWidth = 0.35;
    for (let x = Math.floor(view.x0 / 9) * 9; x < view.x1; x += 9) {
      for (let y = Math.floor(view.y0 / 7) * 7; y < view.y1; y += 7) {
        if (!isSeaCached(x, y)) continue;
        const hsh = Math.abs(Math.sin(x * 7.13 + y * 3.71)) * 10;
        const a = 0.12 + 0.18 * Math.sin(t * 1.3 + hsh);
        if (a <= 0.05) continue;
        const wx = x + (hsh % 4) + Math.sin(t * 0.6 + hsh) * 0.8, wy = y + (hsh % 3);
        ctx.strokeStyle = COLORS.wave + a.toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(wx, wy, 1.4, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
    }

    // 航跡
    if (trail.length > 1) {
      ctx.lineCap = 'round';
      for (let i = 1; i < trail.length; i++) {
        const age = (t * 1000 - trail[i][2]) / 1000;
        const a = Math.max(0, 0.5 - age * 0.08);
        if (a <= 0) continue;
        ctx.strokeStyle = `rgba(235,245,250,${a.toFixed(2)})`;
        ctx.lineWidth = 0.8 + age * 0.3;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1][0], trail[i - 1][1]);
        ctx.lineTo(trail[i][0], trail[i][1]);
        ctx.stroke();
      }
    }

    // 港
    for (const id of s.discovered) {
      const tw = D.towns[id];
      drawHuts(tw.x, tw.y);
    }

    // 霧
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fogImage(s), 0, 0, Math.ceil(M.width / R.exploreCell) * R.exploreCell, Math.ceil(M.height / R.exploreCell) * R.exploreCell);

    // 見渡せる範囲
    ctx.setLineDash([1.5, 2]);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.arc(v.x, v.y, G.Fleet.sight(s), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 目的地
    if (v.target) {
      ctx.strokeStyle = 'rgba(226,176,74,0.9)';
      ctx.lineWidth = 0.6;
      const r = 2 + Math.sin(t * 4) * 0.5;
      ctx.beginPath(); ctx.arc(v.target.x, v.target.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([1, 1.5]);
      ctx.beginPath(); ctx.moveTo(v.x, v.y); ctx.lineTo(v.target.x, v.target.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // 水族
    if (v.raider) {
      const r = v.raider;
      ctx.strokeStyle = `rgba(220,60,40,${(0.5 + 0.4 * Math.sin(t * 6)).toFixed(2)})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.arc(r.x, r.y, 7, 0, Math.PI * 2); ctx.stroke();
      drawBoat(r.x, r.y, r.heading || 0, 9, '#2a2420', ['#24434a', '#24434a', '#24434a'], t, false);
    }

    // 船団（先頭があなたの船、ほかは後ろに並ぶ）
    const ships = G.Fleet.ships(s);
    const hd = v.heading, bx = Math.cos(hd), by = Math.sin(hd);
    ships.slice().reverse().forEach((sh, ri) => {
      const i = ships.length - 1 - ri;
      const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * 5;
      const x = v.x - bx * 10 * i - by * side, y = v.y - by * 10 * i + bx * side;
      const sd = D.ships[sh.type];
      const crew = sh.seats.filter(Boolean).map(id => G.Fleet.member(s, id).look.cloth);
      drawBoat(x, y, hd, 6 + sd.capacity / 10, sh.type === 'war' ? '#5c3a1e' : '#7a5230', crew, t, sh.type === 'twin');
    });

    // 画面座標で描く（文字・印）
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = 'bold 13px "Yu Gothic UI", sans-serif';
    ctx.textAlign = 'center';
    for (const id of s.discovered) {
      const tw = D.towns[id];
      const [sx, sy] = toScreen(tw.x, tw.y);
      if (sx < -80 || sx > w + 80 || sy < -30 || sy > h + 30) continue;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(40,30,20,0.8)';
      ctx.strokeText(tw.name, sx, sy - 22);
      ctx.fillStyle = '#fff';
      ctx.fillText(tw.name, sx, sy - 22);
    }
    // 画面の外にある目的地の向き
    if (v.target) {
      const [tx, ty] = toScreen(v.target.x, v.target.y);
      if (tx < 0 || tx > w || ty < 0 || ty > h) {
        const a = Math.atan2(ty - h / 2, tx - w / 2);
        const reach = Math.min((w / 2 - 28) / Math.abs(Math.cos(a) || 1e-6), (h / 2 - 28) / Math.abs(Math.sin(a) || 1e-6));
        const ex = w / 2 + Math.cos(a) * reach, ey = h / 2 + Math.sin(a) * reach;
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(a);
        ctx.fillStyle = 'rgba(226,176,74,0.95)';
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
        ctx.restore();
        if (v.target.port) {
          ctx.font = '12px "Yu Gothic UI", sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.fillText(D.towns[v.target.port].name, ex, ey + 22);
        }
      }
    }
    // 方位
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('北', w - 24, 22);
    ctx.beginPath(); ctx.moveTo(w - 24, 28); ctx.lineTo(w - 29, 42); ctx.lineTo(w - 19, 42); ctx.closePath(); ctx.fill();
    if (V.timeScale > 1) { ctx.textAlign = 'left'; ctx.fillText(`早送り ×${V.timeScale}`, 12, 22); }
  }

  function drawHuts(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1.6, 1.6);
    x = 0; y = 0;
    for (const [dx, dy] of [[-3, 0], [2, -2], [3, 2]]) {
      ctx.fillStyle = '#6b4a2b';
      ctx.fillRect(x + dx - 1.4, y + dy - 0.4, 2.8, 2);
      ctx.fillStyle = '#c9a25e';
      ctx.beginPath(); ctx.moveTo(x + dx - 2, y + dy); ctx.lineTo(x + dx, y + dy - 2.6); ctx.lineTo(x + dx + 2, y + dy); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,240,200,0.5)';
    ctx.beginPath(); ctx.arc(x, y + 4, 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // 舟一隻。len は長さ（地図の点）、crew は乗っている人の服の色
  function drawBoat(x, y, heading, len, hull, crew, t, twin) {
    ctx.save();
    ctx.translate(x, y + Math.sin(t * 2 + x) * 0.2);
    ctx.rotate(heading);
    ctx.scale(1.1, 1.1); // 地図の縮尺どおりだと小さすぎるので大きめに描く
    const hulls = twin ? [-1.6, 1.6] : [0];
    for (const oy of hulls) {
      ctx.fillStyle = hull;
      ctx.beginPath();
      ctx.moveTo(len / 2, oy);
      ctx.quadraticCurveTo(len / 4, oy - 1.4, -len / 2, oy - 1.1);
      ctx.lineTo(-len / 2, oy + 1.1);
      ctx.quadraticCurveTo(len / 4, oy + 1.4, len / 2, oy);
      ctx.fill();
    }
    if (twin) { ctx.fillStyle = '#a07a4a'; ctx.fillRect(-len / 3, -1.6, len * 0.6, 3.2); }
    crew.forEach((c, i) => {
      const cx = len / 2 - 2 - i * Math.max(1.2, (len - 3) / Math.max(1, crew.length));
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(cx, 0, 0.7, 0, Math.PI * 2); ctx.fill();
      // 櫂
      ctx.strokeStyle = 'rgba(230,210,170,0.8)';
      ctx.lineWidth = 0.25;
      const sw = Math.sin(t * 5 + i) * 0.6;
      ctx.beginPath(); ctx.moveTo(cx, 0.4); ctx.lineTo(cx - 0.6 + sw, 2.6 + (twin ? 1.6 : 0)); ctx.stroke();
    });
    ctx.restore();
  }
})();
