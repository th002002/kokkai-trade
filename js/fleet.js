// 船団と仲間。
// 船にはいくつかの船室（ships[].cabins）があり、seats に座る人の id を持つ。seats[0] は船長室。
// 船長のいる船だけが船団に加わって一緒に旅をする。船長のいない船は港に置かれたまま。
// 船室に仲間を座らせると、その人の適性に応じて船団に効果が出る（Fleet.bonus）。
// 船は造船のできる港に依頼し、材料を届けると、決まった季節のあとに完成する。
// 船を動かすには人手（ships[].crew）が要る。名前のある仲間のほかは、水夫を人数だけで数える（s.sailors）。
(function () {
  const G = window.Game;
  const D = G.DATA;
  const R = D.rules;

  const F = G.Fleet = {};

  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  const fail = msg => ({ ok: false, msg });

  F.newPerson = id => JSON.parse(JSON.stringify({ id, ...D.people[id] }));
  F.newShip = (s, type, at, seats) => {
    const n = D.ships[type].cabins.length;
    return { uid: s.nextId++, type, at, seats: Array.from({ length: n }, (_, i) => (seats && seats[i]) || null) };
  };

  F.ships = s => s.ships.filter(sh => sh.seats[0]);
  F.mode = () => 'sea';
  F.member = (s, id) => s.party.find(m => m.id === id);
  F.seatOf = (s, id) => {
    for (const sh of s.ships) { const i = sh.seats.indexOf(id); if (i >= 0) return { sh, i }; }
    return null;
  };
  F.freeMembers = s => s.party.filter(m => !F.seatOf(s, m.id));
  F.docked = (s, townId) => s.ships.filter(sh => !sh.seats[0] && sh.at === townId);
  F.shipName = sh => D.ships[sh.type].name;
  F.cabinOf = (sh, i) => D.ships[sh.type].cabins[i];

  // 船室の効果をまとめる
  F.bonus = function (s) {
    const b = { captainApt: 0, lookout: 0, oars: 0, galley: 0, hold: 0, nursery: 0, bow: {} };
    const ships = F.ships(s);
    for (const sh of ships) {
      sh.seats.forEach((id, i) => {
        if (!id) return;
        const kind = F.cabinOf(sh, i), apt = F.member(s, id).apt[kind] || 0;
        if (kind === 'captain') b.captainApt += apt / ships.length;
        else if (kind === 'lookout') b.lookout = Math.max(b.lookout, apt);
        else if (kind === 'bow') b.bow[id] = apt;
        else b[kind] += apt;
      });
    }
    const C = D.cabins;
    return {
      combat: 1 + b.captainApt * C.captain.per,          // 仲間全員の打つ力の倍率
      bow: id => 1 + (b.bow[id] || 0) * C.bow.per,       // 舳先に座る人の打つ力の倍率
      sight: b.lookout * C.lookout.per,                  // 見渡せる距離の上乗せ
      flee: b.lookout * 0.04,                            // 逃げやすさの上乗せ
      speed: 1 + b.oars * C.oars.per,
      food: Math.min(0.5, b.galley * C.galley.per),      // 保存食の減り方を減らす割合
      hold: b.hold * C.hold.per,
      nursery: b.nursery * C.nursery.per,                // 子供の育ちの上乗せ（0 なら保育室に人がいない）
    };
  };

  // 船を動かす人手。水夫と仲間の合計が、船団の船の crew の合計に足りないと船足が落ちる（最低で半分）
  F.crewNeed = s => sum(F.ships(s), sh => D.ships[sh.type].crew || 0);
  F.crewHave = s => s.sailors + s.party.length;
  F.crewFactor = s => { const need = F.crewNeed(s); return need ? Math.min(1, F.crewHave(s) / need) : 1; };

  F.capacity = s => sum(F.ships(s), sh => D.ships[sh.type].capacity) + F.bonus(s).hold;
  F.speed = s => Math.round(Math.min(...F.ships(s).map(sh => D.ships[sh.type].speed)) * F.bonus(s).speed * (0.5 + 0.5 * F.crewFactor(s)) * 100) / 100;
  F.strength = s => sum(F.ships(s), sh => D.ships[sh.type].strength);
  F.sight = s => R.sightRadius + F.bonus(s).sight;
  F.foodPerSeason = s => Math.ceil((s.party.length + s.sailors * R.sailorFood) * R.foodPerMember * (1 - F.bonus(s).food));

  // ---------- 水夫 ----------
  // 港で雇う・暇を出す。金貨の町では金貨、物々交換の村では恩で払う
  F.sailorPrice = s => R.sailorHire * R.sailorCost;
  F.hireSailors = function (s) {
    const n = R.sailorHire, cost = F.sailorPrice(s), t = s.towns[s.townId];
    if (G.Civ.usesCoins(s, s.townId)) {
      if (s.coins < cost) return fail(`金貨が${cost}枚必要（いま${s.coins}枚）`);
      s.coins -= cost;
    } else {
      if (t.credit < cost) return fail(`恩が${cost}必要（いま${G.fmt(t.credit)}）`);
      t.credit -= cost;
    }
    s.sailors += n;
    G.log(s, `${D.towns[s.townId].name}で水夫を${n}人雇った（水夫${s.sailors}人）。`);
    return { ok: true };
  };
  F.dismissSailors = function (s) {
    if (s.sailors <= 0) return fail('水夫はいない。');
    const n = Math.min(R.sailorHire, s.sailors);
    s.sailors -= n;
    G.log(s, `水夫${n}人に暇を出した（水夫${s.sailors}人）。`);
    return { ok: true };
  };

  // 積荷が載りきるかを確かめながら変更する。載りきらなければ元に戻す
  function tryChange(s, change, undo) {
    change();
    if (G.cargoTotal(s) <= F.capacity(s)) return true;
    undo();
    return false;
  }

  // 船室に人を座らせる（memberId が null なら空ける）
  F.setSeat = function (s, uid, i, memberId) {
    const sh = s.ships.find(x => x.uid === uid);
    if (!sh) return fail('その船はない。');
    const inFleet = !!sh.seats[0];
    if (!inFleet && !(i === 0 && sh.at === s.townId)) return fail('港に置いてある船は、まず船長を決めること。');
    if (sh.seats[i] === memberId) return { ok: true };
    if (i === 0 && sh.seats[0] === 'you') return fail('自分の船の船長はあなた。別の船に移るときは「乗り換える」を使う。');
    if (i === 0 && !memberId) return fail('船長を外すときは「港に置く」を使う。');
    if (memberId === 'you') return fail('あなたは自分の船の船長室にいる。');
    const from = memberId ? F.seatOf(s, memberId) : null;
    if (from && from.i === 0) return fail(`${F.member(s, memberId).name}は${F.shipName(from.sh)}の船長をしている。`);
    const prev = sh.seats[i], prevAt = sh.at;
    const ok = tryChange(s, () => {
      if (from) from.sh.seats[from.i] = null;
      sh.seats[i] = memberId;
      if (i === 0) sh.at = null;
    }, () => {
      if (from) from.sh.seats[from.i] = memberId;
      sh.seats[i] = prev;
      sh.at = prevAt;
    });
    if (!ok) return fail('積荷が載りきらなくなる。');
    const cabin = D.cabins[F.cabinOf(sh, i)].name;
    if (!memberId) G.log(s, `${F.shipName(sh)}の${cabin}を空けた。`);
    else if (i === 0 && !inFleet) G.log(s, `${F.member(s, memberId).name}に${F.shipName(sh)}を任せた。船団に加わった。`);
    else G.log(s, `${F.member(s, memberId).name}を${F.shipName(sh)}の${cabin}に座らせた。`);
    return { ok: true };
  };

  // 仲間の船を港に置いていく。座っていた人は手が空く
  F.dock = function (s, uid) {
    const sh = s.ships.find(x => x.uid === uid);
    if (!sh || !sh.seats[0]) return fail('その船は船団にいない。');
    if (sh.seats[0] === 'you') return fail('自分の船は置いていけない。先に別の船に乗り換えること。');
    const seats = sh.seats.slice();
    const ok = tryChange(s, () => { sh.seats = seats.map(() => null); sh.at = s.townId; },
      () => { sh.seats = seats; sh.at = null; });
    if (!ok) return fail('残りの船に積荷が載りきらない。');
    G.log(s, `${F.shipName(sh)}を${D.towns[s.townId].name}に置いた。乗っていた仲間は他の船に移った。`);
    return { ok: true };
  };

  // 港に置いてある船に乗り換える。それまでの船はこの港に置く
  F.board = function (s, uid) {
    const sh = s.ships.find(x => x.uid === uid);
    if (!sh || sh.seats[0] || sh.at !== s.townId) return fail('その船はここにない。');
    const old = s.ships.find(x => x.seats[0] === 'you');
    const oldSeats = old.seats.slice();
    const ok = tryChange(s, () => {
      old.seats = oldSeats.map(() => null); old.at = s.townId;
      sh.seats[0] = 'you'; sh.at = null;
    }, () => {
      old.seats = oldSeats; old.at = null;
      sh.seats[0] = null; sh.at = s.townId;
    });
    if (!ok) return fail('乗り換えると積荷が載りきらない。');
    G.log(s, `${F.shipName(sh)}に乗り換えた。${F.shipName(old)}は港に置いた。`);
    return { ok: true };
  };

  // ---------- 造船 ----------
  F.canOrder = function (s, type) {
    const town = s.towns[s.townId], sd = D.ships[type];
    if (!(D.towns[s.townId].shipyard || []).includes(type)) return 'この村では造れない';
    const V = G.Civ;
    if (V.era(s, s.townId) < (sd.era || 1)) return `村が「${V.eraName(sd.era)}」の時代になると造れる`;
    if (V.size(s, s.townId) < (sd.size || 1)) return `村が「${V.sizeName(sd.size)}」の大きさになると造れる`;
    const missing = (sd.requires || []).filter(k => !town.knowledge.includes(k));
    if (missing.length) return `この村が${missing.map(k => D.knowledge[k].name).join('・')}を知らない`;
    if (s.orders.some(o => o.town === s.townId && o.type === type)) return 'もう依頼している';
    if (town.credit < sd.build.credit) return `恩が${sd.build.credit}必要（いま${G.fmt(town.credit)}）`;
    return null;
  };

  F.order = function (s, type) {
    const err = F.canOrder(s, type);
    if (err) return fail(err);
    const sd = D.ships[type];
    s.towns[s.townId].credit -= sd.build.credit;
    s.orders.push({ uid: s.nextId++, type, town: s.townId, delivered: {}, readyAt: null });
    G.log(s, `${D.towns[s.townId].name}で${sd.name}を依頼した。材料を届ければ造り始めてくれる。`);
    return { ok: true };
  };

  F.remaining = function (o) {
    const need = {};
    const mats = D.ships[o.type].build.materials;
    for (const g in mats) need[g] = mats[g] - (o.delivered[g] || 0);
    return need;
  };

  // 積荷から材料を渡す。amounts は { 品物: 数 }（足りない分と手持ちを超えた分は渡さない）
  F.deliver = function (s, uid, amounts) {
    const o = s.orders.find(x => x.uid === uid);
    if (!o || o.town !== s.townId || o.readyAt != null) return fail('材料を届ける依頼がない。');
    const need = F.remaining(o), parts = [];
    for (const g in need) {
      const n = Math.min(need[g], s.cargo[g], amounts[g] || 0);
      if (n <= 0) continue;
      s.cargo[g] -= n;
      o.delivered[g] = (o.delivered[g] || 0) + n;
      parts.push(`${D.goods[g].name}${n}`);
    }
    if (!parts.length) return fail('渡す材料を選んでいない。');
    const sd = D.ships[o.type];
    let msg = `${sd.name}の材料として${parts.join('、')}を届けた。`;
    if (Object.values(F.remaining(o)).every(n => n <= 0)) {
      o.readyAt = s.season + sd.build.seasons;
      msg += `材料がそろった。${G.seasonLabel(o.readyAt)}に完成する。`;
    }
    G.log(s, msg);
    return { ok: true };
  };

  G.onSeason.push(s => {
    for (const o of s.orders.filter(x => x.readyAt != null && s.season >= x.readyAt)) {
      const sh = F.newShip(s, o.type, o.town);
      sh.uid = o.uid;
      s.ships.push(sh);
      G.log(s, `${D.towns[o.town].name}で${D.ships[o.type].name}が完成した。`);
    }
    s.orders = s.orders.filter(x => x.readyAt == null || s.season < x.readyAt);
  });

  // ---------- 仲間 ----------
  // 村で仲間になってくれる人。人物の中身（D.people）と、名声・恩の条件をあわせて返す
  F.recruits = s => (D.towns[s.townId].recruits || [])
    .filter(r => !s.hired.includes(r.id) && !F.member(s, r.id))
    .map(r => ({ ...D.people[r.id], ...r }));

  F.canRecruit = function (s, r) {
    if (G.Civ.size(s, s.townId) < (r.size || 1)) return `村が「${G.Civ.sizeName(r.size)}」の大きさになると現れる`;
    if (s.fame < r.fame) return `名声が${r.fame}必要（いま${s.fame}）`;
    if (s.towns[s.townId].credit < r.cost) return `恩が${r.cost}必要（いま${G.fmt(s.towns[s.townId].credit)}）`;
    return null;
  };

  F.recruit = function (s, id) {
    const r = F.recruits(s).find(x => x.id === id);
    if (!r) return fail('その人はここにいない。');
    const err = F.canRecruit(s, r);
    if (err) return fail(err);
    s.towns[s.townId].credit -= r.cost;
    s.hired.push(r.id);
    s.party.push(F.newPerson(r.id));
    G.log(s, `${r.role}の${r.name}が仲間になった。`);
    return { ok: true };
  };
})();
