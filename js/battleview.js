// 水上戦の画面。横づけにした2隻の甲板の上で、仲間と水族が打ち合う様子を描く。
// 戦いの中身は combat.js の Combat.stepBattle にあり、ここは毎フレームそれを進めて描くだけ。
(function () {
  const G = window.Game;
  const C = G.Combat;

  const B = G.BattleView = {};
  B.speed = 1;

  let canvas, ctx, raf = 0, last = 0, bt = null, onEnd = null, onFrame = null, endTimer = 0, hudTimer = 0;

  B.mounted = () => !!(canvas && canvas.isConnected);

  B.mount = function (container, battle, handlers) {
    if (B.mounted() && bt === battle && canvas.parentNode === container) return;
    bt = battle;
    onEnd = handlers.onEnd;
    onFrame = handlers.onFrame;
    endTimer = 0;
    container.innerHTML = '';
    canvas = document.createElement('canvas');
    canvas.className = 'battle-canvas';
    container.appendChild(canvas);
    ctx = canvas.getContext('2d');
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  };

  B.unmount = function () {
    cancelAnimationFrame(raf);
    raf = 0;
    canvas = null;
  };

  function loop(now) {
    if (!B.mounted()) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!bt.over) {
      // 早送りでも細かく刻んで進める
      for (let i = 0; i < B.speed; i++) C.stepBattle(bt, dt);
    } else {
      endTimer += dt;
      if (endTimer > 1.6 && onEnd) { const f = onEnd; onEnd = null; f(); return; }
    }
    hudTimer += dt;
    if (hudTimer > 0.25) { hudTimer = 0; onFrame && onFrame(); }
    draw(now / 1000);
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = Math.round(w * C.FIELD.h / C.FIELD.w);
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.height = h + 'px';
    }
    return { w, h, dpr };
  }

  function draw(t) {
    const { w, dpr } = resize();
    const k = w / C.FIELD.w;
    ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    const F = C.FIELD;

    // 海
    const g = ctx.createLinearGradient(0, 0, 0, F.h);
    g.addColorStop(0, '#3b7592');
    g.addColorStop(1, '#1f4a60');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, F.w, F.h);
    ctx.strokeStyle = 'rgba(230,245,250,0.25)';
    ctx.lineWidth = 1.5;
    for (let y = 20; y < F.h; y += 26) {
      for (let x = (y * 7) % 60 - 60; x < F.w; x += 60) {
        const ox = (t * 18 + y) % 60;
        ctx.beginPath();
        ctx.arc(x + ox, y + Math.sin(t + x) * 2, 7, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
    }

    // 2隻の船（上から見下ろした形）
    const top = F.deckY[0] - 50, bottom = F.deckY[1] + 14;
    drawHull(F.myDeck[0] - 30, F.myDeck[1] + 22, top, bottom, '#5c3a1e', '#a07a4a');
    drawHull(F.foeDeck[0] - 22, F.foeDeck[1] + 30, top, bottom, '#24201c', '#4a4038');
    // 渡し板と、つないだ縄
    const lanes = 3, span = F.deckY[1] - F.deckY[0];
    for (let i = 0; i < lanes; i++) {
      const y = F.deckY[0] + 10 + (i + 0.5) * (span - 20) / lanes - 14; // combat.js の列の位置に合わせる
      ctx.fillStyle = '#8a6a44';
      ctx.fillRect(F.myDeck[1] + 10, y, F.foeDeck[0] - F.myDeck[1] - 20, 22);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(F.myDeck[1] + 10, y, F.foeDeck[0] - F.myDeck[1] - 20, 22);
    }
    ctx.strokeStyle = '#d8c49a';
    ctx.lineWidth = 2;
    for (const y of [top + 8, bottom - 8]) {
      ctx.beginPath();
      ctx.moveTo(F.myDeck[1] + 14, y);
      ctx.quadraticCurveTo((F.myDeck[1] + F.foeDeck[0]) / 2, y + 10, F.foeDeck[0] - 14, y);
      ctx.stroke();
    }

    // 人（奥から順に）
    const units = bt.units.slice().sort((a, b) => a.y - b.y);
    for (const u of units) drawUnit(u, t);

    // 打った数字・倒れた印
    ctx.textAlign = 'center';
    for (const f of bt.fx) {
      const a = Math.max(0, 1 - f.age / 1.2);
      if (f.kind === 'hit') {
        ctx.font = 'bold 15px sans-serif';
        ctx.fillStyle = f.side === 'me' ? `rgba(255,120,100,${a})` : `rgba(255,240,160,${a})`;
        ctx.fillText(f.text, f.x, f.y - f.age * 30);
      } else {
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, 8 + f.age * 30, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // 両陣営の残り体力
    const side = s => bt.units.filter(u => u.side === s);
    const ratio = s => side(s).reduce((a, u) => a + u.hp, 0) / side(s).reduce((a, u) => a + u.maxHp, 0);
    bar(16, 14, 240, ratio('me'), '#7cc075', 'あなたの船団');
    bar(F.w - 256, 14, 240, ratio('foe'), '#ec7a68', G.DATA.raiders[bt.band].name);
    if (bt.over) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, F.h / 2 - 32, F.w, 64);
      ctx.font = 'bold 30px "Yu Gothic UI", sans-serif';
      ctx.fillStyle = bt.won ? '#ffe08a' : '#ffb3a6';
      ctx.textAlign = 'center';
      ctx.fillText(bt.won ? '勝利！' : '敗北……', F.w / 2, F.h / 2 + 10);
    }
  }

  function bar(x, y, w, r, color, label) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x, y, w, 12);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, r), 12);
    ctx.font = '12px "Yu Gothic UI", sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y + 26);
  }

  // 舟の形。舳先と艫がとがった細長い形を上から見る
  function boatPath(x0, x1, y0, y1, inset) {
    const mid = (y0 + y1) / 2, k = inset;
    ctx.beginPath();
    ctx.moveTo(x0 + k * 2, mid);
    ctx.quadraticCurveTo(x0 + 45, y0 + k, x0 + 95, y0 + k);
    ctx.lineTo(x1 - 95, y0 + k);
    ctx.quadraticCurveTo(x1 - 45, y0 + k, x1 - k * 2, mid);
    ctx.quadraticCurveTo(x1 - 45, y1 - k, x1 - 95, y1 - k);
    ctx.lineTo(x0 + 95, y1 - k);
    ctx.quadraticCurveTo(x0 + 45, y1 - k, x0 + k * 2, mid);
    ctx.closePath();
  }

  function drawHull(x0, x1, y0, y1, hull, deck) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.save(); ctx.translate(4, 6); boatPath(x0, x1, y0, y1, 0); ctx.fill(); ctx.restore();
    ctx.fillStyle = hull;
    boatPath(x0, x1, y0, y1, 0);
    ctx.fill();
    ctx.fillStyle = deck;
    boatPath(x0, x1, y0, y1, 8);
    ctx.fill();
    ctx.save();
    boatPath(x0, x1, y0, y1, 8);
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (let y = y0 + 20; y < y1; y += 16) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
    ctx.restore();
  }

  function drawUnit(u, t) {
    const L = u.look;
    ctx.save();
    ctx.translate(u.x, u.y);
    if (u.ko) {
      ctx.globalAlpha = 0.55;
      ctx.rotate(u.face * Math.PI / 2);
    }
    const s = u.age < 16 ? 0.85 : 1;
    ctx.scale(u.face * s, s);
    const step = u.ko ? 0 : Math.sin(t * 10 + u.x * 0.1) * 2;
    // 足
    ctx.strokeStyle = G.Portrait.shade(L.skin, 0.75);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(-4 - step, 6); ctx.moveTo(3, -6); ctx.lineTo(4 + step, 6); ctx.stroke();
    // 体
    ctx.fillStyle = L.cloth;
    ctx.beginPath();
    ctx.moveTo(-7, -6); ctx.lineTo(7, -6); ctx.lineTo(5, -24); ctx.lineTo(-5, -24); ctx.closePath();
    ctx.fill();
    // 槍（打つときに振り下ろす）
    const swing = u.swing > 0 ? (u.swing / 0.25) : 0;
    ctx.save();
    ctx.translate(5, -18);
    ctx.rotate(-0.9 + swing * 1.4);
    ctx.strokeStyle = '#c9a25e';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(22, 0); ctx.stroke();
    ctx.fillStyle = '#d8d8d0';
    ctx.beginPath(); ctx.moveTo(22, -3); ctx.lineTo(29, 0); ctx.lineTo(22, 3); ctx.closePath(); ctx.fill();
    ctx.restore();
    // 頭
    ctx.fillStyle = L.skin;
    ctx.beginPath(); ctx.arc(0, -30, 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = L.hair;
    if (L.style === 'shaved') {
      ctx.globalAlpha *= 0.4;
    }
    ctx.beginPath(); ctx.arc(0, -31.5, 6.6, Math.PI, Math.PI * 2); ctx.fill();
    if (L.style === 'long' || L.style === 'braid') ctx.fillRect(-7, -32, 3, 12);
    if (L.style === 'bun') { ctx.beginPath(); ctx.arc(-5, -37, 3, 0, Math.PI * 2); ctx.fill(); }
    if (L.style === 'wild') { ctx.beginPath(); ctx.moveTo(-7, -32); ctx.lineTo(-3, -42); ctx.lineTo(0, -35); ctx.lineTo(4, -42); ctx.lineTo(7, -32); ctx.fill(); }
    if (L.style === 'shaved') ctx.globalAlpha = u.ko ? 0.55 : 1;
    if (L.paint === 'band') { ctx.fillStyle = 'rgba(47,76,122,0.8)'; ctx.fillRect(-6, -32, 12, 3); }
    if (L.paint === 'stripes') { ctx.strokeStyle = '#b23a2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(1, -28); ctx.lineTo(5, -27); ctx.stroke(); }
    if (L.beard) { ctx.fillStyle = L.hair; ctx.beginPath(); ctx.arc(2, -26, 3.5, 0, Math.PI); ctx.fill(); }
    ctx.fillStyle = '#1a120c';
    ctx.beginPath(); ctx.arc(3, -30.5, 1, 0, Math.PI * 2); ctx.fill();
    if (L.acc === 'feather') { ctx.fillStyle = '#c8a24a'; ctx.beginPath(); ctx.moveTo(-3, -36); ctx.lineTo(-8, -48); ctx.lineTo(-1, -37); ctx.fill(); }
    ctx.restore();

    if (!u.ko) {
      // 体力
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(u.x - 12, u.y - 52, 24, 4);
      ctx.fillStyle = u.side === 'me' ? '#7cc075' : '#ec7a68';
      ctx.fillRect(u.x - 12, u.y - 52, 24 * u.hp / u.maxHp, 4);
      if (u.side === 'me') {
        ctx.font = '11px "Yu Gothic UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(u.name, u.x, u.y - 56);
      }
    }
  }
})();
