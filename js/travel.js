// 移動。航路（routes）の mode が今の船団で使えるものだけ通れる。
// 陸路を足すときは modes に新しい種類を、routes に mode の違う道を足す。
// かかる季節数は船団の速さ（一番遅い船）で縮んだり延びたりする。
(function () {
  const G = window.Game;
  const D = G.DATA;

  const T = G.Travel = {};

  T.routesFrom = function (s, townId) {
    const speed = G.Fleet.speed(s);
    return D.routes
      .filter(r => (r.a === townId || r.b === townId) && r.mode === G.Fleet.mode(s) && T.routeKnown(s, r))
      .map(r => {
        const fwd = r.a === townId;
        return { ...r, to: fwd ? r.b : r.a, seasons: Math.max(1, Math.round(T.effLength(r, fwd) / D.rules.seaPerSeason / speed)) };
      });
  };

  // 川の流れを入れた道のり（さかのぼる区間は長く、下る区間は短く数える）。一度計算したら覚えておく
  T.effLength = function (r, fwd) {
    const key = fwd ? 'effAB' : 'effBA';
    if (r[key] != null) return r[key];
    const pts = fwd ? r.pts : r.pts.slice().reverse();
    let len = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], d = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(d / 10));
      for (let k = 0; k < n; k++) {
        const x = ax + (bx - ax) * (k + 0.5) / n, y = ay + (by - ay) * (k + 0.5) / n;
        len += d / n / G.Sea.flow(x, y, bx - ax, by - ay).f;
      }
    }
    return (r[key] = len);
  };

  T.routeKnown = function (s, r) {
    return s.discovered.includes(r.a) && s.discovered.includes(r.b);
  };

  T.foodNeeded = function (s, route) {
    return route.seasons * G.Fleet.foodPerSeason(s);
  };

  T.go = function (s, to) {
    const route = T.routesFrom(s, s.townId).find(r => r.to === to);
    if (!route) return { ok: false, msg: 'そこへの航路はない。' };
    const eat = G.Fleet.foodPerSeason(s);
    let seasons = route.seasons, starving = false;
    for (let i = 0; i < route.seasons; i++) {
      if (s.cargo.food >= eat) s.cargo.food -= eat;
      else { s.cargo.food = 0; starving = true; }
    }
    const from = D.towns[s.townId].name;
    if (starving) {
      seasons += 1;
      G.log(s, `保存食が尽き、岸辺で食べ物を探しながら進んだ。一季節余計にかかった。`);
    }
    G.log(s, `${from}から${G.Fleet.ships(s).length}隻の船団で漕ぎ出した。`);
    G.advanceSeason(s, seasons);
    s.townId = to;
    G.log(s, `${D.towns[to].name}に着いた。`);
    G.Economy.remember(s, to);
    return { ok: true };
  };

  // 知っている航路をたどって、季節数が一番少ない道筋を探す（経由する港の列。見つからなければ null）
  T.path = function (s, from, to) {
    const dist = { [from]: 0 }, prev = {}, done = new Set();
    while (true) {
      let cur = null;
      for (const id in dist) if (!done.has(id) && (cur === null || dist[id] < dist[cur])) cur = id;
      if (cur === null) return null;
      if (cur === to) break;
      done.add(cur);
      for (const r of T.routesFrom(s, cur)) {
        const d = dist[cur] + r.seasons;
        if (dist[r.to] === undefined || d < dist[r.to]) { dist[r.to] = d; prev[r.to] = cur; }
      }
    }
    const hops = [];
    for (let id = to; id !== from; id = prev[id]) hops.unshift(id);
    return hops;
  };

  // 遠くの港へ。途中の港は通り過ぎるだけ
  T.goTo = function (s, to) {
    if (to === s.townId) return { ok: false, msg: 'もうここにいる。' };
    const hops = T.path(s, s.townId, to);
    if (!hops) return { ok: false, msg: 'そこへ行く航路を知らない。' };
    for (const id of hops) T.go(s, id);
    return { ok: true };
  };

  T.wait = function (s) {
    G.log(s, `${D.towns[s.townId].name}で一季節を過ごした。`);
    G.advanceSeason(s, 1);
    G.Economy.remember(s, s.townId);
    return { ok: true };
  };
})();
