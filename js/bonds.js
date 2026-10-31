// 好感度と酒場。
// 仲間や酒場の娘と話す・おごる・贈り物をすると好感度が上がる。得意な船室に座らせたり、一緒に戦いに勝っても上がる。
// 好感度が data.js の bondStages に届くとイベント（stories.js）が起き、強さや適性が伸びる。
// 酒場の娘は「信頼」の段階まで仲良くなると仲間に誘える。イベントは大人（18歳以上）だけ。
// 状態は s.bonds[人の id] = { love, stage, talked, treated, gifted, later }、起きたイベントは s.pendingEvents に積まれ、画面が順に見せる。
(function () {
  const G = window.Game;
  const D = G.DATA;
  const R = D.rules;

  const B = G.Bonds = {};

  const rand = ([lo, hi]) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const fail = msg => ({ ok: false, msg });

  B.get = (s, id) => s.bonds[id] || (s.bonds[id] = { love: 0, stage: 0, talked: -1, treated: -1, gifted: -1, later: [] });
  B.person = (s, id) => G.Fleet.member(s, id) || { id, ...D.people[id] };
  B.story = id => D.stories[id] || D.stories.generic;
  B.canBond = (s, id) => id !== 'you' && B.person(s, id).age >= 18;
  B.stageName = (s, id) => { const b = B.get(s, id); return b.stage ? D.bondStages[b.stage - 1].name : '知り合い'; };

  // 一番得意な船室（まだ5に届いていないもの）
  function bestApt(p) {
    let best = null;
    for (const k in p.apt) if (p.apt[k] < 5 && (best === null || p.apt[k] > p.apt[best])) best = k;
    return best;
  }

  function apply(m, eff) {
    if (eff.str) m.str += eff.str;
    if (eff.apt) { const k = bestApt(m); if (k) m.apt[k] = Math.min(5, m.apt[k] + eff.apt); }
  }

  function rewardText(p, st) {
    const out = [];
    if (st.str) out.push(`強さ +${st.str}`);
    if (st.apt) { const k = bestApt(p); if (k) out.push(`${D.cabins[k].name}の適性 +${st.apt}`); }
    if (st.join && !p.inParty) out.push('仲間に誘えるようになった');
    return out.join('・');
  }

  B.add = function (s, id, n) {
    if (!B.canBond(s, id)) return 0;
    const b = B.get(s, id), before = b.love;
    b.love = Math.max(0, Math.min(100, b.love + n));
    while (b.stage < D.bondStages.length && b.love >= D.bondStages[b.stage].at) reach(s, id, b.stage++);
    return b.love - before;
  };

  function reach(s, id, i) {
    const st = D.bondStages[i], b = B.get(s, id), m = G.Fleet.member(s, id);
    const p = m ? { ...m, inParty: true } : B.person(s, id);
    const reward = rewardText(p, st);
    const eff = { str: st.str, apt: st.apt };
    if (m) apply(m, eff); else b.later.push(eff);
    s.pendingEvents.push({ who: id, stage: i, reward });
    G.log(s, `${p.name}との仲が「${st.name}」になった。（${reward}）`);
  }

  // 話しかけられる相手：仲間か、いる港の酒場の娘
  B.here = (s, id) => !s.sea && (!!G.Fleet.member(s, id) || (!!id && (D.towns[s.townId].tavern || {}).girl === id));

  B.talk = function (s, id) {
    if (!B.here(s, id)) return fail('ここにはいない。');
    const b = B.get(s, id), p = B.person(s, id);
    if (b.talked === s.season) return fail(`${p.name}とはこの季節もう話した。`);
    b.talked = s.season;
    const n = B.add(s, id, rand(R.talkLove));
    let text = pick(B.story(id).talk);
    if (!G.Fleet.member(s, id)) text += `\n「そういえば……${B.rumor(s)}」`;
    return { ok: true, msg: '', chat: { who: id, text, love: n } };
  };

  B.treat = function (s, id) {
    if (!B.here(s, id)) return fail('ここにはいない。');
    const b = B.get(s, id), p = B.person(s, id), t = s.towns[s.townId];
    if (b.treated === s.season) return fail(`${p.name}にはこの季節もうおごった。`);
    if (t.credit < R.treatCost) return fail(`恩が${R.treatCost}必要（いま${G.fmt(t.credit)}）`);
    t.credit -= R.treatCost;
    b.treated = s.season;
    const n = B.add(s, id, rand(R.treatLove));
    return { ok: true, msg: '', chat: { who: id, text: pick(['「ありがと！じゃあ、乾杯」', '「いいの？……ふふ、今夜は付き合ってあげる」', '「おいしい。あなたと飲むと、いつもよりね」']), love: n } };
  };

  B.gift = function (s, id, g) {
    if (!B.here(s, id)) return fail('ここにはいない。');
    const b = B.get(s, id), p = B.person(s, id);
    if (!g || !D.goods[g]) return fail('贈る品物を選んでいない。');
    if (s.cargo[g] < 1) return fail(`${D.goods[g].name}を持っていない。`);
    if (b.gifted === s.season) return fail(`${p.name}にはこの季節もう贈り物をした。`);
    s.cargo[g]--;
    b.gifted = s.season;
    const liked = (p.likes || []).includes(g);
    const n = B.add(s, id, liked ? R.giftLikedLove : R.giftLove);
    const text = liked ? `「${D.goods[g].name}！ずっと欲しかったの。……大事にするね」` : `「${D.goods[g].name}？ありがとう」`;
    return { ok: true, msg: '', chat: { who: id, text, love: n } };
  };

  // 酒場の娘を仲間に誘う
  B.canInvite = function (s, id) {
    if (G.Fleet.member(s, id)) return 'もう仲間';
    const joinAt = D.bondStages.findIndex(st => st.join);
    if (B.get(s, id).stage <= joinAt) return `好感度が${D.bondStages[joinAt].at}（「${D.bondStages[joinAt].name}」）になると誘える`;
    return null;
  };

  B.invite = function (s, id) {
    if (!B.here(s, id)) return fail('ここにはいない。');
    const err = B.canInvite(s, id);
    if (err) return fail(err);
    const m = G.Fleet.newPerson(id), b = B.get(s, id);
    for (const eff of b.later) apply(m, eff);
    b.later = [];
    s.party.push(m);
    s.hired.push(id);
    G.log(s, `${m.name}が酒場を任せて、仲間になった。`);
    return { ok: true, msg: '' };
  };

  // 酒場の噂。ほかの村の様子、まだ知らない港、研究者たちの動き、水族
  B.rumor = function (s) {
    const here = s.townId, out = [];
    const others = s.discovered.filter(id => id !== here);
    if (others.length) {
      const id = pick(others);
      let best = null, bestR = 0;
      for (const g in D.goods) {
        if (!G.Economy.handles(s, id, g)) continue;
        const r = G.Economy.giveUnit(s, id, g, s.towns[id].stock[g]) / D.goods[g].base;
        if (r > bestR) { bestR = r; best = g; }
      }
      if (best) out.push(`${D.towns[id].name}じゃ、いま${D.goods[best].name}を高く引き取ってくれるって。`);
      const boomy = others.find(o => s.towns[o].boom >= 70);
      if (boomy) out.push(`${D.towns[boomy].name}はずいぶんにぎわってるらしいよ。`);
    }
    const hidden = Object.keys(D.towns).filter(id => !s.discovered.includes(id));
    if (hidden.length) {
      const id = pick(hidden), a = D.towns[here], b = D.towns[id];
      const dirs = ['東', '南東', '南', '南西', '西', '北西', '北', '北東'];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const dir = dirs[(Math.round(ang / (Math.PI / 4)) + 8) % 8];
      out.push(`ここから${dir}の海の先に、まだ知られてない村があるって漁師が言ってた。`);
    }
    for (const k in D.knowledge) {
      const kd = D.knowledge[k];
      if (!kd.invent || !s.discovered.includes(kd.invent.town) || s.towns[kd.invent.town].knowledge.includes(k)) continue;
      const t = s.towns[kd.invent.town], missing = kd.requires.filter(r => !t.knowledge.includes(r));
      out.push(`${D.towns[kd.invent.town].name}は、研究者を支えて「${G.Civ.sizeName(kd.invent.size)}」くらいまで人が増えたら、何か新しい技を編み出すかもしれないね。`
        + (missing.length ? `でも、その前に${missing.map(r => D.knowledge[r].name).join('と')}を知らないとだめだって。` : ''));
    }
    out.push('東の沖には、水族の長の大舟が出るんだって。気をつけて。');
    return pick(out);
  };

  // 得意な船室にいる仲間は、季節ごとに少しずつ打ち解ける
  G.onSeason.push(s => {
    for (const sh of G.Fleet.ships(s)) {
      sh.seats.forEach((id, i) => {
        if (id && id !== 'you' && G.Fleet.member(s, id).apt[G.Fleet.cabinOf(sh, i)] >= 4) B.add(s, id, R.cabinLove);
      });
    }
  });
})();
