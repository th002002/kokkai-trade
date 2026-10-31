// ゲームの状態と時間の進行。
// 季節が進むたびに Game.onSeason に登録された関数が呼ばれる。
// 子供の成長や集落づくりなど「季節ごとに何かが起きる」仕組みは、ここに関数を足すだけでつながる。
(function () {
  const G = window.Game;
  const D = G.DATA;

  G.onSeason = [];
  G.SAVE_KEY = 'kokkai-trade-save';

  G.newGame = function () {
    const s = {
      version: D.version,
      season: 0,
      townId: D.start.town,
      cargo: {},
      knowledge: [...D.start.knowledge],
      party: [],      // 仲間（D.people の写し。年齢などは旅のあいだに変わりうる）
      ships: [],      // { uid, type, at: 置いてある港 | null, seats: [船室ごとの人の id] }
      orders: [],     // 造船の依頼 { uid, type, town, delivered: {品物: 数}, readyAt }
      hired: [],      // 雇った人の id
      nextId: 1,
      fame: D.start.fame || 0,
      coins: D.start.coins || 0, // 金貨（青銅器時代からの村で使える。積荷の場所はとらない）
      sailors: D.start.sailors || 0, // 水夫の人数（名前のない船乗り）
      children: [],   // 仲間になる前の子供たち（family.js）
      pregnancies: [], // { mother, due: 生まれる季節 }
      towns: {},
      memo: {},
      discovered: Object.keys(D.towns).filter(id => !D.towns[id].hidden),
      explored: {},   // 霧が晴れた升目 "x,y" → 1
      sea: null,      // 外海にいるとき { x, y, dist, hungry }
      encounter: null, // 水族に追いつかれ、向かい合っているとき
      bonds: {},      // 人の id → 好感度など（bonds.js）
      pendingEvents: [], // まだ見せていない好感度のイベント
      log: [],
      stats: { taught: 0, learned: 0, trades: 0, wins: 0, losses: 0 },
    };
    s.party = D.start.party.map(G.Fleet.newPerson);
    s.ships = D.start.ships.map(sh => G.Fleet.newShip(s, sh.type, null, sh.seats));
    for (const g in D.goods) s.cargo[g] = D.start.cargo[g] || 0;
    for (const id in D.towns) {
      s.towns[id] = { knowledge: [...D.towns[id].knowledge], credit: 0, stock: {}, pop: D.towns[id].pop, boom: 50, researchers: 0 };
    }
    for (const id in D.towns) {
      for (const g in D.goods) s.towns[id].stock[g] = Math.round(G.Economy.effective(s, id, g).target);
    }
    G.Sea.revealKnown(s);
    G.log(s, `${s.ships.map(G.Fleet.shipName).join('と')}、仲間${s.party.length - 1}人とともに、${D.towns[s.townId].name}から旅が始まる。`);
    G.Economy.remember(s, s.townId);
    return s;
  };

  G.log = function (s, msg) {
    s.log.unshift({ t: s.season, msg });
    if (s.log.length > 80) s.log.length = 80;
  };

  G.seasonInfo = function (i) { return D.seasons[i % D.seasons.length]; };
  G.seasonLabel = function (i) { return `${Math.floor(i / D.seasons.length) + 1}年目の${G.seasonInfo(i).name}`; };

  G.advanceSeason = function (s, n = 1) {
    for (let i = 0; i < n; i++) {
      s.season++;
      for (const fn of G.onSeason) fn(s);
    }
  };

  G.capacity = function (s) { return G.Fleet.capacity(s); };
  G.cargoTotal = function (s) { return Object.values(s.cargo).reduce((a, b) => a + b, 0); };

  G.save = function (s) {
    try { localStorage.setItem(G.SAVE_KEY, JSON.stringify(s)); } catch (e) { /* 保存できない環境でも遊べる */ }
  };
  G.load = function () {
    try {
      const s = JSON.parse(localStorage.getItem(G.SAVE_KEY));
      return s && s.version === D.version ? s : null;
    } catch (e) { return null; }
  };
})();
