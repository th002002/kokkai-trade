// 知識を学ぶ・教える。
// 学ぶには村への「恩」を礼として払い、1季節を過ごす。
// 教えると村が養える人が増え（時代が進むこともある）、礼として恩をもらう。村の欲しいものも変わる。
(function () {
  const G = window.Game;
  const D = G.DATA;

  const K = G.Knowledge = {};

  K.canLearn = function (s, k) {
    const t = s.towns[s.townId], kd = D.knowledge[k];
    if (s.knowledge.includes(k)) return 'もう身につけている';
    if (!t.knowledge.includes(k)) return 'この村の人は知らない';
    if (t.credit < kd.learnCost) return `恩が${kd.learnCost}必要（いま${G.fmt(t.credit)}）`;
    return null;
  };

  K.learn = function (s, k) {
    const err = K.canLearn(s, k);
    if (err) return { ok: false, msg: err };
    const t = s.towns[s.townId], kd = D.knowledge[k];
    t.credit -= kd.learnCost;
    s.knowledge.push(k);
    s.stats.learned++;
    G.log(s, `${D.towns[s.townId].name}で一季節を過ごし、「${kd.name}」を身につけた。`);
    G.advanceSeason(s, 1);
    return { ok: true };
  };

  K.canTeach = function (s, k) {
    const t = s.towns[s.townId], kd = D.knowledge[k];
    if (!s.knowledge.includes(k)) return 'まだ知らない';
    if (t.knowledge.includes(k)) return 'この村はもう知っている';
    const missing = kd.requires.filter(r => !t.knowledge.includes(r));
    if (missing.length) return `先に${missing.map(r => D.knowledge[r].name).join('・')}が必要`;
    return null;
  };

  K.teach = function (s, k) {
    const err = K.canTeach(s, k);
    if (err) return { ok: false, msg: err };
    const t = s.towns[s.townId], kd = D.knowledge[k], eraBefore = G.Civ.era(s, s.townId), capBefore = G.Civ.cap(s, s.townId);
    t.knowledge.push(k);
    t.learnedAt = { ...t.learnedAt, [k]: s.season };
    t.benefactor = true;
    t.credit += kd.teachReward;
    s.stats.taught++;
    s.fame += D.rules.teachFame;
    G.log(s, `${D.towns[s.townId].name}で一季節かけて「${kd.name}」を教えた。村が養える人が${G.Civ.cap(s, s.townId) - capBefore}人増え、恩${kd.teachReward}と名声${D.rules.teachFame}を得た。村の暮らしは${D.rules.knowledgeRamp}季節かけて少しずつ変わっていく。この村はあなたを恩人として、良い条件で交換してくれるようになった。`);
    G.Civ.learned(s, s.townId, k, eraBefore);
    G.advanceSeason(s, 1);
    G.Economy.remember(s, s.townId);
    return { ok: true };
  };
})();
