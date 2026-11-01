// 交換の仕組み。
// 品物の価値は「村の在庫」で決まる。品薄なら高く、余っていれば安い。
// 新石器以前の村は物々交換。渡した品物の価値が欲しい品物の価値を上回ると、その差は村への「恩」として残り、次の交換や知識の礼に使える。
//   食べ物が貨幣のかわりで、差額は保存食で合わせることが多い（画面の「保存食で合わせる」）。
// 青銅器時代からの村は金貨で売り買いする。売った代金は金貨で受け取り、足りない分は金貨で払う（恩は動かない）。
(function () {
  const G = window.Game;
  const D = G.DATA;
  const R = D.rules;

  const E = G.Economy = {};

  // 知識の効果を反映した、村のその品物の在り方。
  // 教えたばかりの知識は、knowledgeRamp 季節かけて少しずつ効いてくる
  // 村の goods に書いていない品物は、作らず・ふつうに扱う。飾り物は大きな町ほど欲しがり、人が多く景気が良いほど作る量が増える
  const PLAIN = [0, 1];
  E.effective = function (s, townId, g) {
    const t = s.towns[townId], td = D.towns[townId], learnedAt = t.learnedAt || {}, gd = D.goods[g];
    let [target, mult] = td.goods[g] || PLAIN;
    for (const k of t.knowledge) {
      const e = D.knowledge[k].effects[g];
      if (!e) continue;
      const w = k in learnedAt ? Math.min(1, (s.season - learnedAt[k]) / R.knowledgeRamp) : 1;
      if (e.target) target += e.target * w;
      if (e.mult) mult *= 1 + (e.mult - 1) * w;
    }
    if (gd.lux) mult *= 1 + R.luxPerSize * (G.Civ.size(s, townId) - 1);
    target *= Math.max(0.5, Math.min(3, Math.sqrt(t.pop / td.pop))) * (0.8 + t.boom / 250) * E.depth(s, townId);
    return { target, mult };
  };

  // 市場の深さ。人の多い町ほど在庫が多く、たくさん売り買いしても値が動きにくい（小さな村は 0.6、大都市は最大 4）
  E.depth = (s, townId) => Math.max(R.depthMin, Math.min(R.depthMax, Math.sqrt(s.towns[townId].pop / R.depthPop)));

  // この村がその品物を扱うか（村の時代が品物の時代に届いているか、自分で作っている）
  E.handles = (s, townId, g) => G.Civ.era(s, townId) >= D.goods[g].era || E.effective(s, townId, g).target > 0;
  E.usesCoins = (s, townId) => G.Civ.usesCoins(s, townId);
  E.goodsAt = (s, townId) => Object.keys(D.goods).filter(g => E.handles(s, townId, g));

  // 知識を教えた村は恩人として、少し良い条件で交換してくれる
  E.isBenefactor = (s, townId) => !!s.towns[townId].benefactor;
  E.giveUnit = (s, townId, g, stock) =>
    E.unitPrice(s, townId, g, stock) * (E.isBenefactor(s, townId) ? R.benefactorBonus : 1);
  E.takeUnit = (s, townId, g, stock) =>
    E.unitPrice(s, townId, g, stock) * (E.isBenefactor(s, townId) ? R.benefactorMarkup : R.buyMarkup);

  // 在庫が stock のときの1つあたりの価値
  E.unitPrice = function (s, townId, g, stock) {
    const { mult } = E.effective(s, townId, g);
    const seasonMod = G.seasonInfo(s.season).mods[g] || 1;
    const scarcity = Math.min(R.priceMax, Math.max(R.priceMin, Math.sqrt(R.idealStock * E.depth(s, townId) / Math.max(stock, 1))));
    return D.goods[g].base * mult * seasonMod * scarcity;
  };

  // n個渡したときにもらえる価値（1個ごとに在庫が増え、価値が下がっていく）
  E.giveValue = function (s, townId, g, n) {
    let stock = s.towns[townId].stock[g], v = 0;
    for (let i = 0; i < n; i++) v += E.giveUnit(s, townId, g, stock++);
    return v;
  };

  // n個もらうのに必要な価値
  E.takeCost = function (s, townId, g, n) {
    let stock = s.towns[townId].stock[g], v = 0;
    for (let i = 0; i < n; i++) v += E.takeUnit(s, townId, g, --stock);
    return v;
  };

  // 見積もり。金貨の村は { coin, pay: 払う金貨, get: 受け取る金貨 }、物々交換の村は { credit, balance: 交換後の恩 }。ok は成り立つか
  E.quote = function (s, townId, give, take) {
    let giveV = 0, takeV = 0;
    for (const g in give) giveV += E.giveValue(s, townId, g, give[g] || 0);
    for (const g in take) takeV += E.takeCost(s, townId, g, take[g] || 0);
    if (E.usesCoins(s, townId)) {
      const net = giveV - takeV;
      const pay = net < 0 ? Math.ceil(-net - 1e-9) : 0, get = net > 0 ? Math.floor(net + 1e-9) : 0;
      return { coin: true, giveV, takeV, net, pay, get, ok: pay <= s.coins };
    }
    const credit = s.towns[townId].credit, balance = credit + giveV - takeV;
    return { coin: false, giveV, takeV, credit, balance, ok: balance >= -1e-6 };
  };

  // ---------- 仕入れ値 ----------
  // 積荷1つあたりの平均の仕入れ値を s.costs に持つ。買うたびに平均し直す（売る・食べる・奪われるでは変わらない）
  // 始めから持っている積荷はふつうの値、戦いで奪った積荷はただ（0）として数える
  const costs = s => s.costs || (s.costs = {});
  E.cost = (s, g) => (s.cargo[g] > 0 && costs(s)[g] != null ? costs(s)[g] : null);
  E.addCargo = function (s, g, n, unitCost) {
    if (n <= 0) return;
    const have = s.cargo[g], c = costs(s), old = have > 0 && c[g] != null ? c[g] : unitCost;
    c[g] = (old * have + unitCost * n) / (have + n);
    s.cargo[g] = have + n;
  };

  // 訪れた港の相場の控え（memo）で、その品物を一番高く引き取ってくれた値と港。行ったことのある港がなければ null
  // 控えは訪れたときのものなので、いまの相場とは違うことがある
  E.bestElsewhere = function (s, townId, g) {
    let best = null;
    for (const id in s.memo) {
      if (id === townId || s.memo[id].give[g] == null) continue;
      if (!best || s.memo[id].give[g] > best.v) best = { v: s.memo[id].give[g], town: id };
    }
    return best;
  };

  // ここで売ると得な数。1個ごとに値が下がるので、仕入れ値を下回る手前まで（儲けが出る分だけ）
  // 仕入れ値がわからない積荷は、訪れた港で売れた一番の値（それも知らなければふつうの値）を基準にする
  E.goodSellCount = function (s, townId, g) {
    const best = E.bestElsewhere(s, townId, g), cost = E.cost(s, g);
    const floor = cost != null ? cost : best ? best.v : D.goods[g].base;
    let stock = s.towns[townId].stock[g], n = 0;
    while (n < s.cargo[g] && E.giveUnit(s, townId, g, stock + n) >= floor) n++;
    return { n, floor, best, cost };
  };

  // ここで買って、ほかの港で売れば儲かる数（ほかの相場を知っているときだけ）。1個ごとに値が上がるので、ほかで売れる値の9割までに抑える
  E.goodBuyCount = function (s, townId, g) {
    const best = E.bestElsewhere(s, townId, g);
    if (!best) return { n: 0, best: null };
    let stock = s.towns[townId].stock[g], n = 0;
    while (stock - n > 0 && E.takeUnit(s, townId, g, stock - n - 1) <= best.v * 0.9) n++;
    return { n, best };
  };

  // 物々交換の差額を保存食で合わせる。足りなければ保存食を渡し、余れば保存食を受け取る（恩は使わない）
  E.balanceFood = function (s, townId, give, take) {
    give = { ...give, food: 0 };
    take = { ...take, food: 0 };
    const net = () => { const q = E.quote(s, townId, give, take); return q.giveV - q.takeV; };
    let load = G.cargoTotal(s);
    for (const g in D.goods) load += (take[g] || 0) - (give[g] || 0);
    if (net() < 0) {
      while (net() < 0 && give.food < s.cargo.food) give.food++;
    } else {
      while (take.food < s.towns[townId].stock.food && load + 1 <= G.capacity(s)) {
        take.food++;
        if (net() < 0) { take.food--; break; }
        load++;
      }
    }
    return { give, take };
  };

  E.trade = function (s, townId, give, take) {
    const t = s.towns[townId];
    let load = G.cargoTotal(s), moved = 0;
    for (const g in D.goods) {
      const gv = give[g] || 0, tk = take[g] || 0;
      if (gv > s.cargo[g]) return { ok: false, msg: `${D.goods[g].name}が手持ちより多い。` };
      if (gv && !E.handles(s, townId, g)) return { ok: false, msg: `この村ではまだ${D.goods[g].name}を使わない。` };
      if (gv && tk) return { ok: false, msg: `${D.goods[g].name}を渡しながら受け取ることはできない。` };
      if (tk > t.stock[g]) return { ok: false, msg: `村に${D.goods[g].name}がそんなにない。` };
      load += tk - gv;
      moved += gv + tk;
    }
    if (moved === 0) return { ok: false, msg: '交換する品物を選んでいない。' };
    if (load > G.capacity(s)) return { ok: false, msg: '舟に積みきれない。' };
    const q = E.quote(s, townId, give, take);
    if (!q.ok) return { ok: false, msg: q.coin ? `金貨が${q.pay}枚要る（手持ち${s.coins}枚）。` : '村の人は首を横に振った。渡す品が足りない。' };

    const gave = [], got = [];
    // 受け取る品の仕入れ値は、在庫が動く前の値で数える
    const paid = {};
    for (const g in take) if (take[g] > 0) paid[g] = E.takeCost(s, townId, g, take[g]) / take[g];
    for (const g in D.goods) {
      const gv = give[g] || 0, tk = take[g] || 0;
      s.cargo[g] -= gv;
      if (tk) E.addCargo(s, g, tk, paid[g]);
      t.stock[g] += gv - tk;
      if (gv) gave.push(`${D.goods[g].name}${gv}`);
      if (tk) got.push(`${D.goods[g].name}${tk}`);
    }
    s.stats.trades++;
    G.Civ.addBoom(s, townId, q.giveV + q.takeV);
    const parts = [];
    if (gave.length) parts.push(`${gave.join('・')}を${q.coin ? '売' : '渡し'}${got.length ? (q.coin ? 'り' : '') : (q.coin ? 'った' : 'た')}`);
    if (got.length) parts.push(`${got.join('・')}を${q.coin ? '買った' : '受け取った'}`);
    let msg = `${D.towns[townId].name}で${parts.join('、')}。`;
    if (q.coin) {
      s.coins += q.get - q.pay;
      if (q.get) msg += `（金貨${q.get}枚を受け取った）`;
      if (q.pay) msg += `（金貨${q.pay}枚を払った）`;
    } else {
      const before = t.credit;
      t.credit = Math.round(q.balance * 10) / 10;
      if (t.credit !== before) msg += `（恩 ${fmt(before)} → ${fmt(t.credit)}）`;
    }
    G.log(s, msg);
    E.remember(s, townId);
    return { ok: true, msg };
  };

  // 訪れた村の相場を覚えておく（ほかの村で計画を立てるため）
  E.remember = function (s, townId) {
    const t = s.towns[townId];
    const m = { season: s.season, coin: E.usesCoins(s, townId), give: {}, take: {} };
    for (const g of E.goodsAt(s, townId)) {
      m.give[g] = E.giveUnit(s, townId, g, t.stock[g]);
      m.take[g] = t.stock[g] > 0 ? E.takeUnit(s, townId, g, t.stock[g] - 1) : null;
    }
    s.memo[townId] = m;
  };

  E.tickTown = function (s, townId) {
    const t = s.towns[townId];
    for (const g in D.goods) {
      const { target } = E.effective(s, townId, g);
      const noise = Math.round((Math.random() - 0.5) * 3);
      t.stock[g] = Math.max(0, Math.round(t.stock[g] + (target - t.stock[g]) * R.recovery + noise));
    }
  };

  G.onSeason.push(s => { for (const id in s.towns) E.tickTown(s, id); });

  function fmt(v) { return (Math.round(v * 10) / 10).toString(); }
  G.fmt = fmt;
})();
