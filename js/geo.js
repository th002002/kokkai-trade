// 地理。data.js の geo（緯度経度）から、ゲームで使う地図（D.map）を組み立てる。
// 地図の点 x は東へ、y は南へ増える。1点はおよそ1.1km。
// 村・航路・水族の海域の [経度, 緯度] も、ここで地図の点に直しておく。
(function () {
  const G = window.Game;
  const D = G.DATA;
  const Gd = D.geo;

  const r1 = v => Math.round(v * 10) / 10;
  const P = ([lon, lat]) => [r1((lon - Gd.lon0) * Gd.kx), r1((Gd.lat0 - lat) * Gd.ky)];
  G.project = P;

  const pathOf = (pts, close) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ') + (close ? ' Z' : '');
  const lengthOf = pts => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

  // 島は楕円（c, r）か点の並び（pts）
  function islandPts(isl) {
    if (isl.pts) return isl.pts.map(P);
    return Array.from({ length: 14 }, (_, i) => {
      const a = i / 14 * Math.PI * 2, wob = 1 + 0.12 * Math.sin(i * 2.7);
      return P([isl.c[0] + Math.cos(a) * isl.r[0] * wob, isl.c[1] + Math.sin(a) * isl.r[1] * wob]);
    });
  }

  D.map = {
    width: r1((Gd.lon1 - Gd.lon0) * Gd.kx),
    height: r1((Gd.lat0 - Gd.lat1) * Gd.ky),
    seaPath: Gd.seas.map(s => pathOf(s.pts.map(P), true)).join(' '),
    landPaths: Gd.islands.map(isl => pathOf(islandPts(isl), true)),
    waterways: Gd.waterways.map(w => {
      const pts = w.pts.map(P);
      return { name: w.name, river: !!w.river, width: w.width, pts, d: pathOf(pts) };
    }),
    labels: Gd.labels.map(l => { const [x, y] = P(l.at); return { ...l, x, y }; }),
  };

  for (const id in D.towns) [D.towns[id].x, D.towns[id].y] = P(D.towns[id].at);

  // 航路は 港 → 途中の点 → 港 の折れ線。季節数は道のりから
  for (const r of D.routes) {
    r.pts = [[D.towns[r.a].x, D.towns[r.a].y], ...r.via.map(P), [D.towns[r.b].x, D.towns[r.b].y]];
    r.length = lengthOf(r.pts);
    r.seasons = Math.max(1, Math.round(r.length / D.rules.seaPerSeason));
  }

  for (const z of D.encounterZones) [z.x, z.y] = P(z.at);
})();
