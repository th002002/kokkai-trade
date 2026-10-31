// 外海の航行。港から沖へ漕ぎ出し、航海画面（seaview.js）で広い海を進む。
// Sea.tick を毎フレーム呼ぶと、目的地へ向かって船団が少しずつ進む。
// 漕いだ距離が seaPerSeason に達するごとに一季節が過ぎ、保存食を食べる（速い船団ほど遠くまで進める）。
// 隠れた港（hidden の村）に見渡せる距離まで近づくと発見し、以後は航路で自動航行できる。
// 水族の出る海域では水族の舟が現れて追ってくる。追いつかれると遭遇（combat.js）、引き離せば諦める。
// 海峡や川（data.js の waterways）も進める。川をさかのぼると遅く、下ると速い。
(function () {
  const G = window.Game;
  const D = G.DATA;
  const R = D.rules;
  const M = D.map;
  const STEP = 1;

  const S = G.Sea = {};

  // 海（島を除く）か、海峡・川の水路の中なら舟で進める
  let ctx, seaPath, landPaths, ways;
  function init() {
    if (ctx) return;
    ctx = document.createElement('canvas').getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    seaPath = new Path2D(M.seaPath);
    landPaths = M.landPaths.map(p => new Path2D(p));
    ways = M.waterways.map(w => ({ ...w, path: new Path2D(w.d) }));
  }
  const inOpenSea = (x, y) => ctx.isPointInPath(seaPath, x, y) && !landPaths.some(p => ctx.isPointInPath(p, x, y));
  function wayAt(x, y) {
    for (const w of ways) {
      ctx.lineWidth = w.width;
      if (ctx.isPointInStroke(w.path, x, y)) return w;
    }
    return null;
  }
  S.isSea = function (x, y) {
    init();
    return inOpenSea(x, y) || !!wayAt(x, y);
  };

  // 川の流れ。(x, y) から (dx, dy) の向きへ進むときの船足の倍率と、いる川の名前
  S.flow = function (x, y, dx, dy) {
    init();
    if (inOpenSea(x, y)) return { f: 1, river: null };
    const w = wayAt(x, y);
    if (!w || !w.river) return { f: 1, river: null };
    // 一番近い区間の向き（上流へ向かう向き）
    let best = null, bestD = Infinity;
    for (let i = 0; i < w.pts.length - 1; i++) {
      const [ax, ay] = w.pts[i], [bx, by] = w.pts[i + 1];
      const vx = bx - ax, vy = by - ay, len2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / len2));
      const d = Math.hypot(x - ax - vx * t, y - ay - vy * t);
      if (d < bestD) { bestD = d; best = [vx, vy]; }
    }
    const len = Math.hypot(dx, dy) * Math.hypot(best[0], best[1]) || 1;
    const dot = (dx * best[0] + dy * best[1]) / len;
    const f = dot > 0.3 ? R.upstream : dot < -0.3 ? R.downstream : 1;
    return { f, river: w.name, up: dot > 0.3, down: dot < -0.3 };
  };

  // ---------- 霧 ----------
  S.reveal = function (s, x, y, r) {
    const C = R.exploreCell;
    for (let cx = Math.floor((x - r) / C); cx <= Math.floor((x + r) / C); cx++) {
      for (let cy = Math.floor((y - r) / C); cy <= Math.floor((y + r) / C); cy++) {
        if (Math.hypot((cx + 0.5) * C - x, (cy + 0.5) * C - y) <= r) s.explored[cx + ',' + cy] = 1;
      }
    }
  };

  S.revealKnown = function (s) {
    for (const id of s.discovered) S.reveal(s, D.towns[id].x, D.towns[id].y, R.portReveal);
    for (const r of D.routes) {
      if (!G.Travel.routeKnown(s, r)) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, ay] = r.pts[i], [bx, by] = r.pts[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (R.routeReveal * 0.6)));
        for (let k = 0; k <= n; k++) S.reveal(s, ax + (bx - ax) * k / n, ay + (by - ay) * k / n, R.routeReveal);
      }
    }
  };

  S.isExplored = function (s, x, y) {
    const C = R.exploreCell;
    return !!s.explored[Math.floor(x / C) + ',' + Math.floor(y / C)];
  };

  // ---------- 航行 ----------
  function nearestSea(x, y) {
    if (S.isSea(x, y)) return [x, y];
    for (let r = 2; r <= 80; r += 2) {
      for (let a = 0; a < 360; a += 15) {
        const nx = x + Math.cos(a * Math.PI / 180) * r, ny = y + Math.sin(a * Math.PI / 180) * r;
        if (S.isSea(nx, ny)) return [nx, ny];
      }
    }
    return [x, y];
  }

  // 目標へ一歩。まっすぐ進めなければ、目標に近づける範囲で岸沿いにそれる
  S.stepToward = function (x, y, tx, ty, step) {
    const base = Math.atan2(ty - y, tx - x), d0 = Math.hypot(tx - x, ty - y);
    for (const off of [0, 20, -20, 40, -40, 60, -60, 80, -80]) {
      const a = base + off * Math.PI / 180;
      const nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
      if (S.isSea(nx, ny) && Math.hypot(tx - nx, ty - ny) < d0 - step * 0.1) return [nx, ny];
    }
    return null;
  };

  function passSeason(s) {
    const eat = G.Fleet.foodPerSeason(s);
    if (s.cargo.food >= eat) {
      s.cargo.food -= eat;
      s.sea.hungry = false;
    } else {
      s.cargo.food = 0;
      if (!s.sea.hungry) G.log(s, '保存食が尽きた。岸辺で食べ物を探しながらでは、船足が半分になる。');
      s.sea.hungry = true;
    }
    G.advanceSeason(s, 1);
  }

  function discover(s) {
    const found = [], sight = G.Fleet.sight(s);
    for (const id in D.towns) {
      if (s.discovered.includes(id)) continue;
      if (Math.hypot(D.towns[id].x - s.sea.x, D.towns[id].y - s.sea.y) <= sight) {
        s.discovered.push(id);
        found.push(id);
        G.log(s, `新しい港を見つけた！「${D.towns[id].name}」`);
      }
    }
    if (found.length) S.revealKnown(s);
    return found;
  }

  S.setSail = function (s) {
    if (s.sea) return { ok: false, msg: 'もう沖にいる。' };
    const t = D.towns[s.townId];
    const [x, y] = nearestSea(t.x, t.y);
    s.sea = { x, y, heading: 0, dist: 0, hungry: false, carry: 0, target: null, raider: null, calm: 3 };
    G.log(s, `${t.name}から沖へ漕ぎ出した。`);
    return { ok: true };
  };

  // 向かう先を決める。port を渡すと、着いたらその港に入る
  S.setTarget = function (s, x, y, port) {
    if (!s.sea) return;
    s.sea.target = port ? { x: D.towns[port].x, y: D.towns[port].y, port } : { x, y, port: null };
  };
  S.stop = s => { if (s.sea) s.sea.target = null; };

  // 船団と水族の速さ（地図の点 / 秒）
  S.fleetRate = s => R.seaUnitsPerSecond * G.Fleet.speed(s) * (s.sea.hungry ? 0.5 : 1);
  S.raiderRate = band => R.seaUnitsPerSecond * D.raiders[band].speed;

  // dt 秒ぶん時間を進める。起きたことを返す
  S.tick = function (s, dt) {
    const ev = {};
    const v = s.sea;
    if (!v || s.encounter) return ev;
    v.calm = Math.max(0, (v.calm || 0) - dt);

    // 船団を進める。川をさかのぼると一歩に多くかかり、下ると少なくて済む
    if (v.target) {
      const rate = S.fleetRate(s);
      v.carry += rate * dt;
      while (true) {
        if (v.target.port && S.portsNear(s).includes(v.target.port)) {
          S.enter(s, v.target.port);
          ev.entered = true;
          return ev;
        }
        if (Math.hypot(v.target.x - v.x, v.target.y - v.y) < STEP) { v.target = null; ev.arrived = true; break; }
        const next = S.stepToward(v.x, v.y, v.target.x, v.target.y, STEP);
        if (!next) { v.target = null; ev.blocked = true; break; }
        const fl = S.flow(v.x, v.y, next[0] - v.x, next[1] - v.y), need = STEP / fl.f;
        v.flow = fl;
        if (v.carry < need) break;
        v.carry -= need;
        v.heading = Math.atan2(next[1] - v.y, next[0] - v.x);
        [v.x, v.y] = next;
        S.reveal(s, v.x, v.y, G.Fleet.sight(s));
        v.dist += need * R.seaUnitsPerSecond / rate;
        if (v.dist >= R.seaPerSeason) { v.dist -= R.seaPerSeason; passSeason(s); ev.season = true; }
        const found = discover(s);
        if (found.length) { ev.found = found; v.target = null; break; }
        if (!v.raider && !v.calm) {
          const band = G.Combat.check(v.x, v.y, STEP);
          if (band) { spawnRaider(s, band); ev.raider = band; }
        }
      }
      if (!v.target) v.carry = 0;
    }

    // 水族の舟が追ってくる
    if (v.raider) {
      const r = v.raider;
      const d = Math.hypot(v.x - r.x, v.y - r.y);
      if (d <= R.raiderCatch) {
        s.encounter = G.Combat.roll(r.band);
        v.target = null;
        G.log(s, `${D.raiders[r.band].name}に追いつかれた。`);
        ev.caught = true;
      } else if (d >= R.raiderGiveUp) {
        G.log(s, `${D.raiders[r.band].name}を振り切った。`);
        v.raider = null;
        ev.escaped = true;
      } else {
        const step = S.raiderRate(r.band) * dt;
        const next = S.stepToward(r.x, r.y, v.x, v.y, step);
        if (next) { r.heading = Math.atan2(next[1] - r.y, next[0] - r.x); [r.x, r.y] = next; }
      }
    }
    return ev;
  };

  function spawnRaider(s, band) {
    const v = s.sea, dist = R.raiderSpawn + G.Fleet.bonus(s).sight;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const x = v.x + Math.cos(a) * dist, y = v.y + Math.sin(a) * dist;
      if (S.isSea(x, y)) {
        v.raider = { band, x, y, heading: a + Math.PI };
        G.log(s, `${D.raiders[band].name}がこちらへ向かってくる！`);
        return;
      }
    }
  }

  // 遭遇が片付いたあと（勝った・逃げた・負けた）。水族は去り、しばらくは現れない
  S.clearRaider = function (s) {
    if (!s.sea) return;
    s.sea.raider = null;
    s.sea.calm = 5;
  };

  S.portsNear = function (s) {
    if (!s.sea) return [];
    return s.discovered.filter(id => Math.hypot(D.towns[id].x - s.sea.x, D.towns[id].y - s.sea.y) <= R.portRadius);
  };

  // 入港。漕ぎかけの季節は、港に着くまでに過ぎたものとする
  S.enter = function (s, id) {
    if (s.encounter) return { ok: false, msg: '水族が目の前にいる。' };
    if (!S.portsNear(s).includes(id)) return { ok: false, msg: 'まだ港から遠い。' };
    if (s.sea.dist > 0) passSeason(s);
    s.sea = null;
    s.townId = id;
    G.log(s, `${D.towns[id].name}に入港した。`);
    G.Economy.remember(s, id);
    return { ok: true };
  };
})();
