// 家族。妻とのデートのあと子供ができ、pregnancySeasons 季節で生まれる。
// 子供は季節ごとに childGrowth 年ずつ育ち（保育室に人がいれば早く育つ）、childJoinAge になると仲間として船に乗る。
// 子供は家族として扱い、好感度や恋のイベントの相手にはならない（bonds.js の canBond）。
// 子供は s.children に { id, name, sex, age, mother, born, look, family: true } で持ち、仲間になると s.party へ移る。
(function () {
  const G = window.Game;
  const D = G.DATA;
  const R = D.rules;

  const Fa = G.Family = {};

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  Fa.pregnant = (s, id) => s.pregnancies.some(p => p.mother === id);

  // 妻とのデートのあとに呼ぶ。子供ができたら true
  Fa.conceive = function (s, id) {
    if (Fa.pregnant(s, id) || Math.random() >= R.childChance) return false;
    s.pregnancies.push({ mother: id, due: s.season + R.pregnancySeasons });
    G.log(s, `${G.Bonds.person(s, id).name}が身ごもった。${R.pregnancySeasons}季節ほどで生まれる。`);
    return true;
  };

  function mix(a, b) {
    const n = h => parseInt(h.slice(1), 16), x = n(a), y = n(b);
    const c = [16, 8, 0].map(sh => Math.round((((x >> sh) & 255) + ((y >> sh) & 255)) / 2));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function usedNames(s) {
    return new Set([...s.children, ...s.party].map(p => p.name));
  }

  function birth(s, motherId) {
    const mother = G.Bonds.person(s, motherId), me = G.Fleet.member(s, 'you') || D.people.you;
    const sex = Math.random() < 0.5 ? 'f' : 'm';
    const used = usedNames(s), names = D.childNames[sex].filter(n => !used.has(n));
    const child = {
      id: 'child' + s.nextId++, family: true, sex, age: 0, mother: motherId, born: s.season,
      name: pick(names.length ? names : D.childNames[sex]),
      look: {
        skin: mix(mother.look.skin, me.look.skin),
        hair: pick([mother.look.hair, me.look.hair]),
        eye: mother.look.eye,
        style: sex === 'f' ? pick(['twin', 'pony', 'long', 'short', 'braid']) : pick(['short', 'wild']),
        paint: 'none', cloth: pick(['#7d6a9a', '#5a7d6a', '#b5654a', '#4f7a94', '#a0522d', '#8a5a2b']),
        beard: false, acc: sex === 'f' ? pick(['none', 'flower', 'beads']) : 'none',
      },
    };
    s.children.push(child);
    s.pendingEvents.push({ kind: 'birth', who: motherId, child: child.id, reward: `${sex === 'f' ? '娘' : '息子'}の${child.name}が生まれた` });
    G.log(s, `${mother.name}が${sex === 'f' ? '女の子' : '男の子'}を産んだ。${child.name}と名づけた。`);
  }

  // 大きくなった子供を仲間にする。強さと適性は両親から受け継ぐ
  function grown(s, c) {
    const mother = G.Bonds.person(s, c.mother), me = G.Fleet.member(s, 'you') || D.people.you;
    const apt = {};
    for (const k in D.cabins) apt[k] = clamp(Math.round(((mother.apt[k] || 1) + (me.apt[k] || 1)) / 2 + (Math.random() * 2 - 1)), 1, 5);
    const m = {
      ...c, apt, age: Math.floor(c.age),
      role: c.sex === 'f' ? 'あなたの娘' : 'あなたの息子',
      str: Math.round((mother.str + me.str) / 2),
      bio: `${mother.name}とあなたの${c.sex === 'f' ? '娘' : '息子'}。船と港を行き来しながら育った。`,
      likes: mother.likes ? mother.likes.slice(0, 1) : [],
    };
    s.children = s.children.filter(x => x.id !== c.id);
    s.party.push(m);
    s.pendingEvents.push({ kind: 'grown', who: c.id, reward: `${m.name}が仲間になった` });
    G.log(s, `${m.name}が${m.age}歳になり、仲間として船に乗ることになった。`);
  }

  // 次の季節に子供が育つ年数
  Fa.growthPerSeason = s => R.childGrowth * (1 + G.Fleet.bonus(s).nursery);
  // 仲間になるまでの季節数の見込み
  Fa.seasonsToJoin = (s, c) => Math.max(0, Math.ceil((R.childJoinAge - c.age) / Fa.growthPerSeason(s)));

  G.onSeason.push(s => {
    for (const p of s.pregnancies.filter(x => s.season >= x.due)) birth(s, p.mother);
    s.pregnancies = s.pregnancies.filter(x => s.season < x.due);
    const g = Fa.growthPerSeason(s);
    for (const c of s.children.slice()) {
      if (c.born === s.season) continue;
      c.age = Math.round((c.age + g) * 10) / 10;
      if (c.age >= R.childJoinAge) grown(s, c);
    }
  });
})();
