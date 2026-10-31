// 村の時代・人口・景気。
// 時代は知っている知識で決まる（知識の opensEra の一番大きいもの。麦づくりや牧畜で新石器、青銅で青銅器…）。
//   時代が進むと使う品物・造れる船が増え、青銅器時代からは金貨で売り買いする。
// 人口は季節ごとに「養える人数」へ向かって増える。景気が良いほど早く、飢えると減る。
//   養える人数は land × (1 + 知識と研究者のぶん)。人口で町の大きさ（集落〜大都市）が決まる。
//   大きな町ほど品物を多く作り、飾り物を欲しがり、人（仲間）が集まる。
// 景気（0〜100、ふつうは50）は交換するほど上がり、季節ごとに50へ戻っていく。食べ物が足りないと下がる。
// 研究者は村への恩で支える。研究者のいる村は、invent のついた知識を自分で編み出すことがある。
(function () {
  const G = window.Game;
  const D = G.DATA;
  const R = D.rules;

  const V = G.Civ = {};

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---------- 時代 ----------
  V.eraOf = knowledge => knowledge.reduce((n, k) => Math.max(n, D.knowledge[k].opensEra || 1), 1);
  V.era = (s, id) => V.eraOf(s.towns[id].knowledge);
  V.eraName = n => D.eras[n - 1].name;
  V.usesCoins = (s, id) => V.era(s, id) >= R.coinEra;
  // 次の時代を開く知識
  V.nextEraKeys = (s, id) => Object.keys(D.knowledge).filter(k => D.knowledge[k].opensEra === V.era(s, id) + 1);

  // ---------- 人口と大きさ ----------
  V.sizeOfPop = pop => D.sizes.reduce((n, sz, i) => (pop >= sz.at ? i + 1 : n), 1);
  V.size = (s, id) => V.sizeOfPop(s.towns[id].pop);
  V.sizeName = n => D.sizes[n - 1].name;
  V.nextSizeAt = (s, id) => (D.sizes[V.size(s, id)] || {}).at;

  // 養える人数
  V.cap = function (s, id) {
    const t = s.towns[id];
    const k = t.knowledge.reduce((a, x) => a + (D.knowledge[x].cap != null ? D.knowledge[x].cap : R.capPerKnowledge), 0);
    return Math.round(D.towns[id].land * (1 + k + t.researchers * R.capPerResearcher));
  };

  // 1季節に増える人数の見込み
  V.growth = function (s, id) {
    const t = s.towns[id], cap = V.cap(s, id);
    if (V.hungry(s, id)) return -Math.round(t.pop * R.popHunger);
    return Math.round(t.pop * R.popGrowth * (t.boom / 50) * (1 - t.pop / cap));
  };

  V.hungry = (s, id) => {
    const target = G.Economy.effective(s, id, 'food').target + G.Economy.effective(s, id, 'grain').target;
    return target > 0 && s.towns[id].stock.food + s.towns[id].stock.grain < target * 0.3;
  };

  // ---------- 景気 ----------
  V.addBoom = function (s, id, value) {
    const t = s.towns[id];
    t.boom = clamp(t.boom + Math.min(R.boomTradeMax, value * R.boomPerValue), 0, 100);
  };

  V.boomLabel = function (boom) {
    if (boom < 35) return '不景気';
    if (boom < 60) return 'ふつう';
    if (boom < 80) return '好景気';
    return '大にぎわい';
  };

  // ---------- 知識を覚えたとき ----------
  // 時代が進んだら記録に残す。knowledge.js（教えた）と研究者の発明から呼ぶ
  V.learned = function (s, id, k, eraBefore) {
    const after = V.era(s, id);
    if (after > eraBefore && s.discovered.includes(id)) {
      G.log(s, `${D.towns[id].name}は「${V.eraName(after)}」の時代に入った。${after >= R.coinEra && eraBefore < R.coinEra ? 'これからは金貨で売り買いする。' : ''}`);
    }
  };

  // ---------- 研究者 ----------
  V.researcherCost = s => R.researcherCost[s.towns[s.townId].researchers];

  V.canFund = function (s) {
    const t = s.towns[s.townId], cost = V.researcherCost(s);
    if (cost == null) return 'もう研究者がいっぱい';
    if (t.credit < cost) return `恩が${cost}必要（いま${G.fmt(t.credit)}）`;
    return null;
  };

  V.fund = function (s) {
    const err = V.canFund(s);
    if (err) return { ok: false, msg: err };
    const t = s.towns[s.townId], cost = V.researcherCost(s);
    t.credit -= cost;
    t.researchers++;
    G.log(s, `${D.towns[s.townId].name}への恩${cost}を使い、暮らしの心配なく工夫に打ちこめる研究者を一人支えた（${t.researchers}人目）。村が養える人が少し増え、新しい技を編み出すかもしれない。`);
    return { ok: true };
  };

  // 研究者が編み出せる知識（この村がまだ知らず、大きさと前提の知識がそろっているもの）
  V.inventable = function (s, id) {
    const t = s.towns[id];
    return Object.keys(D.knowledge).filter(k => {
      const kd = D.knowledge[k];
      return kd.invent && kd.invent.town === id && !t.knowledge.includes(k) && V.size(s, id) >= kd.invent.size
        && kd.requires.every(r => t.knowledge.includes(r));
    });
  };

  V.tick = function (s, id) {
    const t = s.towns[id];
    const sizeBefore = V.size(s, id);
    t.pop = Math.max(20, t.pop + V.growth(s, id));
    t.boom += (50 - t.boom) * R.boomDrift;
    if (V.hungry(s, id)) t.boom -= R.boomHunger;
    t.boom = clamp(t.boom, 0, 100);
    const sizeAfter = V.size(s, id);
    if (sizeAfter > sizeBefore && s.discovered.includes(id)) G.log(s, `${D.towns[id].name}は人が増え、「${V.sizeName(sizeAfter)}」になった（人口${t.pop}）。`);
    if (!t.researchers) return;
    for (const k of V.inventable(s, id)) {
      if (Math.random() >= R.inventChance * t.researchers) continue;
      const kd = D.knowledge[k], eraBefore = V.era(s, id);
      t.knowledge.push(k);
      t.learnedAt = { ...t.learnedAt, [k]: s.season };
      if (s.discovered.includes(id)) G.log(s, `${D.towns[id].name}の研究者たちが「${kd.name}」を編み出した！その村で学べるようになった。`);
      V.learned(s, id, k, eraBefore);
    }
  };

  G.onSeason.push(s => { for (const id in s.towns) V.tick(s, id); });
})();
