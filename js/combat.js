// 水族との遭遇と戦い。
// 戦いは船を横づけにした甲板の上で、一人ひとりが相手を選んで打ち合う。時間で進むので、画面（battleview.js）でそのまま見せられる。
//   体力 = unitHp[0] + 強さ × unitHp[1]、一打ち = 強さ × unitAtk
//   こちらは 船長室の効果（全員）・舳先の効果（座った人）・船団の強さ（打つ力と守り）で強くなる
// どちらかが全員倒れたら終わり。勝てば相手の積荷を奪い名声が上がる。負ければ積荷の一部を奪われる。
// 倒れた人は気を失うだけで、戦いのあとには起き上がる。
(function () {
  const G = window.Game;
  const D = G.DATA;
  const R = D.rules;

  const C = G.Combat = {};

  const rand = ([lo, hi]) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  // 外海で step だけ進むごとに呼ばれる。出会ったら相手の種類を返す
  C.check = function (x, y, step) {
    for (const z of D.encounterZones) {
      if (Math.hypot(z.x - x, z.y - y) > z.r || Math.random() >= z.rate * step / 4) continue;
      const entries = Object.entries(z.bands);
      let n = Math.random() * entries.reduce((a, [, w]) => a + w, 0);
      for (const [band, w] of entries) if ((n -= w) < 0) return band;
    }
    return null;
  };

  // 水族の一団を作る。一人ひとりに見た目をつける
  C.roll = function (band) {
    const b = D.raiders[band];
    const members = Array.from({ length: rand(b.count) }, () => ({
      str: rand(b.str),
      look: {
        skin: pick(['#a8754e', '#8f5f3c', '#b5835a', '#9a6a44']),
        hair: pick(['#140e0a', '#2b1d14', '#3a2a1e']),
        style: pick(['wild', 'shaved', 'long', 'braid']),
        paint: b.paint, cloth: b.cloth, beard: Math.random() < 0.5, acc: pick(['none', 'bone', 'feather']),
      },
    }));
    const cargo = {};
    for (const g in b.loot) cargo[g] = rand(b.loot[g]);
    return { band, members, cargo };
  };

  // 見立て用のおおまかな戦力
  C.myPower = s => s.party.reduce((a, m) => a + m.str, 0) + battleSailors(s) * R.sailorStr + G.Fleet.strength(s) * R.shipPower;
  const battleSailors = s => Math.min(s.sailors, R.sailorBattleMax);
  const SAILOR_LOOK = { skin: '#b5835a', hair: '#2b1d14', style: 'short', paint: 'none', cloth: '#7a6a52', beard: false, acc: 'none' };
  C.enemyPower = e => e.members.reduce((a, m) => a + m.str, 0) + D.raiders[e.band].ship * R.shipPower;

  C.fleeChance = function (s, e) {
    const p = R.fleeBase + (G.Fleet.speed(s) - D.raiders[e.band].speed) * 0.5 + G.Fleet.bonus(s).flee;
    return Math.min(0.9, Math.max(0.1, p));
  };

  // ---------- 戦い ----------
  // 戦場は 640x360。こちらの船は左、水族の舟は右に横づけ（上から見下ろした形）
  C.FIELD = { w: 640, h: 360, myDeck: [60, 290], foeDeck: [350, 580], deckY: [110, 320] };

  function unit(side, i, n, p) {
    const deck = side === 'me' ? C.FIELD.myDeck : C.FIELD.foeDeck;
    const cols = Math.ceil(n / 3), col = Math.floor(i / 3), row = i % 3;
    const x = side === 'me'
      ? deck[1] - 20 - col * (deck[1] - deck[0] - 40) / Math.max(1, cols)
      : deck[0] + 20 + col * (deck[1] - deck[0] - 40) / Math.max(1, cols);
    const rows = Math.min(3, n), y = C.FIELD.deckY[0] + 10 + (row + 0.5) * (C.FIELD.deckY[1] - C.FIELD.deckY[0] - 20) / rows;
    return { side, x, y, lane: y, hp: p.hp, maxHp: p.hp, ko: false, cd: 0.4 + Math.random() * 0.8, swing: 0, target: null, face: side === 'me' ? 1 : -1, ...p };
  }

  C.createBattle = function (s, e) {
    const b = D.raiders[e.band], F = G.Fleet, bonus = F.bonus(s), str = F.strength(s);
    const myAtk = (1 + str * R.shipAtk) * bonus.combat, myGuard = 1 - Math.min(0.35, str * R.shipGuard);
    const foeAtk = 1 + b.ship * R.shipAtk, foeGuard = 1 - Math.min(0.35, b.ship * R.shipGuard);
    const hp = st => R.unitHp[0] + st * R.unitHp[1];
    const nSail = battleSailors(s), mine = s.party.length + nSail;
    const units = [
      ...s.party.map((m, i) => unit('me', i, mine, {
        id: m.id, name: m.name, look: m.look, age: m.age, sex: m.sex,
        hp: hp(m.str), atk: m.str * R.unitAtk * myAtk * bonus.bow(m.id), guard: myGuard,
      })),
      ...Array.from({ length: nSail }, (_, i) => unit('me', s.party.length + i, mine, {
        id: 'sailor' + i, name: '水夫', sailor: true, look: SAILOR_LOOK, age: 25, sex: 'm',
        hp: hp(R.sailorStr), atk: R.sailorStr * R.unitAtk * myAtk, guard: myGuard,
      })),
      ...e.members.map((m, i) => unit('foe', i, e.members.length, {
        id: 'foe' + i, name: '水族', look: m.look, age: 30,
        hp: hp(m.str), atk: m.str * R.unitAtk * foeAtk, guard: foeGuard,
      })),
    ];
    return { t: 0, units, fx: [], over: false, won: null, band: e.band };
  };

  const alive = (bt, side) => bt.units.filter(u => u.side === side && !u.ko);

  // dt 秒ぶん戦いを進める
  C.stepBattle = function (bt, dt) {
    if (bt.over) return;
    bt.t += dt;
    for (const u of bt.units) {
      u.swing = Math.max(0, u.swing - dt);
      if (u.ko) continue;
      const foes = alive(bt, u.side === 'me' ? 'foe' : 'me');
      if (!foes.length) break;
      if (!u.target || u.target.ko) {
        // 自分の列（lane）に近い相手を選ぶ。横に広がって戦うように
        const score = f => Math.abs(f.x - u.x) + 2.5 * Math.abs(f.y - u.lane);
        u.target = foes.reduce((best, f) => (score(f) < score(best) ? f : best));
      }
      const t = u.target, dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy);
      u.face = dx >= 0 ? 1 : -1;
      if (d > 30) {
        const sp = 75 * dt;
        u.x += Math.sign(dx) * Math.min(sp, Math.max(0, Math.abs(dx) - 22));
        // 縦は自分の列と相手のあいだあたりへゆっくり寄る
        const wantY = (t.y + u.lane) / 2;
        u.y += Math.sign(wantY - u.y) * Math.min(sp * 0.5, Math.abs(wantY - u.y));
        if (Math.abs(dx) <= 22) u.y += Math.sign(dy) * Math.min(sp, Math.abs(dy) - 20 > 0 ? Math.abs(dy) - 20 : 0);
      } else {
        u.cd -= dt;
        if (u.cd <= 0) {
          const dmg = u.atk * (0.7 + Math.random() * 0.6) * t.guard;
          t.hp -= dmg;
          u.swing = 0.25;
          u.cd = 0.8 + Math.random() * 0.5;
          bt.fx.push({ kind: 'hit', x: t.x, y: t.y - 30, text: Math.round(dmg), age: 0, side: t.side });
          if (t.hp <= 0) {
            t.hp = 0;
            t.ko = true;
            bt.fx.push({ kind: 'ko', x: t.x, y: t.y, age: 0 });
          }
        }
      }
    }
    // 重なりすぎないように押し分ける
    const live = bt.units.filter(u => !u.ko);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
        if (d < 22) { const p = (22 - d) / 2; a.x -= dx / d * p; a.y -= dy / d * p; b.x += dx / d * p; b.y += dy / d * p; }
      }
    }
    for (const u of live) u.y = Math.max(C.FIELD.deckY[0], Math.min(C.FIELD.deckY[1], u.y));
    bt.fx.forEach(f => { f.age += dt; });
    bt.fx = bt.fx.filter(f => f.age < 1.2);
    if (!alive(bt, 'foe').length) { bt.over = true; bt.won = true; }
    else if (!alive(bt, 'me').length) { bt.over = true; bt.won = false; }
  };

  // 戦いを何度も素早く試して、勝てる見込みを出す
  C.winChance = function (s, e, tries = 30) {
    let wins = 0;
    for (let i = 0; i < tries; i++) {
      const bt = C.createBattle(s, e);
      for (let k = 0; k < 1200 && !bt.over; k++) C.stepBattle(bt, 0.1);
      if (bt.won) wins++;
    }
    return wins / tries;
  };

  // 戦いの結果を旅に反映する
  C.finish = function (s, bt) {
    const e = s.encounter, b = D.raiders[e.band];
    s.encounter = null;
    G.Sea.clearRaider(s);
    if (bt.won) {
      const parts = [];
      for (const g in e.cargo) {
        const n = Math.min(e.cargo[g], G.capacity(s) - G.cargoTotal(s));
        if (n <= 0) continue;
        s.cargo[g] += n;
        parts.push(`${D.goods[g].name}${n}`);
      }
      s.fame += b.fame;
      s.stats.wins++;
      for (const m of s.party) G.Bonds.add(s, m.id, R.winLove);
      const msg = `${b.name}との戦いに勝った！${parts.length ? parts.join('、') + 'を奪った。' : '舟に積む場所がなかった。'}名声が${b.fame}上がった。`;
      G.log(s, msg);
      return msg;
    }
    const parts = [];
    for (const g in s.cargo) {
      const n = Math.ceil(s.cargo[g] * R.loseShare);
      if (n <= 0) continue;
      s.cargo[g] -= n;
      parts.push(`${D.goods[g].name}${n}`);
    }
    s.stats.losses++;
    const lost = Math.ceil(s.sailors * R.sailorLoss);
    s.sailors -= lost;
    const msg = `${b.name}に負けた……${parts.length ? parts.join('、') + 'を奪われた。' : '奪われる物は何もなかった。'}${lost ? `水夫${lost}人がさらわれた。` : ''}気を失った仲間たちは、やがて起き上がった。`;
    G.log(s, msg);
    return msg;
  };

  // 逃げる。うまくいけば true、だめなら戦いになる（false）
  C.flee = function (s) {
    const e = s.encounter, b = D.raiders[e.band];
    if (Math.random() < C.fleeChance(s, e)) {
      s.encounter = null;
      G.Sea.clearRaider(s);
      G.log(s, `${b.name}から逃げきった。`);
      return true;
    }
    G.log(s, `${b.name}から逃げきれず、戦いになった。`);
    return false;
  };
})();
