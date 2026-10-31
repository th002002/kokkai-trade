// 場面の画面（酒場・仲間）。RPG のように、一枚絵の中で人を選び、コマンドを選んで交流する。
//   酒場：カウンターの奥に酒場の娘、テーブルに仲間になってくれそうな人。水夫を雇うのもここ
//   仲間：夜の甲板に仲間が並ぶ。相手を選ぶと大きな絵と、話す・贈る・デート・結婚などのコマンドが出る
// 決まりごとは Bonds / Fleet / Family を呼ぶだけ。ここは画面と操作だけを持つ。
// 状態（開いている場面・選んでいる相手・コマンドの段・メッセージ）は保存しない。
(function () {
  const G = window.Game;
  const D = G.DATA;
  const R = D.rules;
  const $ = sel => document.querySelector(sel);
  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);

  const S = G.Scene = {
    open: null,     // 'tavern' | 'crew' | null
    target: null,   // 選んでいる人の id。'sailors' は水夫の溜まり場
    menu: 'main',   // 'main' | 'gift'
    msg: null,      // { who, text, love } または { text }（地の文）
  };

  S.enter = function (kind) {
    const s = G.state;
    S.open = kind;
    S.town = s.townId;
    S.target = null;
    S.menu = 'main';
    S.msg = { text: kind === 'tavern' ? tavernIntro(s) : '甲板に、仲間たちが集まっている。だれと過ごそうか。' };
  };
  S.leave = () => { S.open = null; S.target = null; };

  function tavernIntro(s) {
    const tv = D.towns[s.townId].tavern;
    if (!tv) return 'この村に酒場はない。村の集会所で、人々が火を囲んでいる。';
    const girl = tv.girl && !G.Fleet.member(s, tv.girl) ? G.Bonds.person(s, tv.girl) : null;
    return girl ? `「${tv.name}」に入った。カウンターの奥で${girl.name}が手を振っている。` : `「${tv.name}」に入った。店は村の人が預かっている。`;
  }

  // ---------- 一枚絵 ----------
  // 酒場：板壁、棚の壺、吊るした灯り、カウンターとテーブル（手前の絵は人の前に重ねる）
  function tavernBack() {
    const planks = Array.from({ length: 24 }, (_, i) => `<rect x="${i * 40}" y="0" width="39" height="540" fill="${i % 2 ? '#5d3d24' : '#56381f'}"/>`).join('');
    const jars = Array.from({ length: 14 }, (_, i) => {
      const x = 250 + i * 34, c = ['#a8643a', '#7a8a5a', '#c89a5a', '#6a4a7a', '#b0502a'][i % 5];
      return `<path d="M${x} 168 q-12 -2 -10 -20 q2 -10 10 -12 q8 2 10 12 q2 18 -10 20 Z" fill="${c}" stroke="#2a180c" stroke-width="2"/>`;
    }).join('');
    const lamp = x => `<line x1="${x}" y1="0" x2="${x}" y2="70" stroke="#2a180c" stroke-width="3"/>
      <circle cx="${x}" cy="95" r="120" fill="url(#glow)"/><path d="M${x - 14} 70 h28 l-6 34 h-16 Z" fill="#e8b860" stroke="#2a180c" stroke-width="3"/>`;
    return `<svg class="scene-art" viewBox="0 0 960 540" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><radialGradient id="glow"><stop offset="0" stop-color="rgba(255,200,110,0.55)"/><stop offset="1" stop-color="rgba(255,200,110,0)"/></radialGradient></defs>
      ${planks}
      <rect x="230" y="110" width="500" height="18" fill="#3a2414"/><rect x="230" y="170" width="500" height="18" fill="#3a2414"/>
      ${jars}
      <rect x="230" y="232" width="500" height="18" fill="#3a2414"/>
      ${[0, 1, 2, 3, 4, 5].map(i => `<ellipse cx="${280 + i * 80}" cy="218" rx="26" ry="16" fill="#6b4423" stroke="#2a180c" stroke-width="2"/>`).join('')}
      ${lamp(140)}${lamp(480)}${lamp(820)}
      <rect x="0" y="470" width="960" height="70" fill="#3a2616"/>
    </svg>`;
  }
  function tavernFront() {
    const table = x => `<ellipse cx="${x}" cy="470" rx="110" ry="26" fill="#7a4e2a" stroke="#2a180c" stroke-width="4"/>
      <rect x="${x - 12}" y="470" width="24" height="70" fill="#5a3a1e"/><ellipse cx="${x - 40}" cy="458" rx="14" ry="8" fill="#c89a5a" stroke="#2a180c" stroke-width="2"/>
      <path d="M${x + 30} 462 q0 -22 12 -22 q12 0 12 22 Z" fill="#a8643a" stroke="#2a180c" stroke-width="2"/>`;
    return `<svg class="scene-art front" viewBox="0 0 960 540" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d="M300 372 L660 372 L690 420 L270 420 Z" fill="#9a6838" stroke="#2a180c" stroke-width="4"/>
      <rect x="270" y="420" width="420" height="120" fill="#6b4423" stroke="#2a180c" stroke-width="4"/>
      ${[0, 1, 2, 3, 4].map(i => `<line x1="${270 + i * 84}" y1="420" x2="${270 + i * 84}" y2="540" stroke="#2a180c" stroke-width="2"/>`).join('')}
      <path d="M560 372 q-6 -26 8 -30 q14 4 8 30 Z" fill="#7a8a5a" stroke="#2a180c" stroke-width="2"/>
      ${table(110)}${table(850)}
    </svg>`;
  }

  // 甲板：夜空と星、海、帆柱、ランタン、甲板の板
  function deckBack() {
    const stars = Array.from({ length: 60 }, (_, i) => {
      const x = (i * 157) % 960, y = (i * 71) % 220, r = (i % 3) * 0.6 + 0.6;
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${0.4 + (i % 5) * 0.12}"/>`;
    }).join('');
    return `<svg class="scene-art" viewBox="0 0 960 540" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#141c3a"/><stop offset="1" stop-color="#3a3e6a"/></linearGradient>
        <radialGradient id="lglow"><stop offset="0" stop-color="rgba(255,190,100,0.6)"/><stop offset="1" stop-color="rgba(255,190,100,0)"/></radialGradient>
      </defs>
      <rect width="960" height="300" fill="url(#sky)"/>${stars}
      <circle cx="790" cy="80" r="34" fill="#f4ecd0"/><circle cx="804" cy="72" r="30" fill="#1c244a" opacity="0.25"/>
      <rect y="230" width="960" height="90" fill="#1f3c58"/>
      ${Array.from({ length: 16 }, (_, i) => `<path d="M${i * 64} ${250 + (i % 3) * 18} q16 -6 32 0" stroke="#7aa6c8" stroke-width="2" fill="none" opacity="0.5"/>`).join('')}
      <rect x="455" y="0" width="22" height="330" fill="#5a3a1e" stroke="#2a180c" stroke-width="3"/>
      <path d="M477 20 L700 60 L690 230 L477 250 Z" fill="#d8cdb0" stroke="#2a180c" stroke-width="3" opacity="0.92"/>
      <rect y="290" width="960" height="250" fill="#7a5230"/>
      ${Array.from({ length: 9 }, (_, i) => `<line x1="0" y1="${300 + i * 28}" x2="960" y2="${300 + i * 28}" stroke="#4a3018" stroke-width="2"/>`).join('')}
      <rect y="262" width="960" height="30" fill="#5a3a1e" stroke="#2a180c" stroke-width="3"/>
      <circle cx="150" cy="300" r="150" fill="url(#lglow)"/><circle cx="820" cy="300" r="150" fill="url(#lglow)"/>
      <path d="M138 220 h24 l-4 34 h-16 Z" fill="#f0c060" stroke="#2a180c" stroke-width="3"/><path d="M808 220 h24 l-4 34 h-16 Z" fill="#f0c060" stroke="#2a180c" stroke-width="3"/>
    </svg>`;
  }

  // ---------- 人 ----------
  function standee(s, p, x, y, w, sub, extra = '') {
    return `<button class="standee ${S.target === p.id ? 'on' : ''}" data-sc="pick" data-id="${p.id}" style="left:${x}%;top:${y}%;width:${w}%">
      ${G.Portrait.svg(p, 120)}<span class="plate"><b>${p.name}</b>${sub ? `<small>${sub}</small>` : ''}</span>${extra}</button>`;
  }

  function loveBar(s, id) {
    const B = G.Bonds;
    if (!B.canBond(s, id)) return '';
    const b = B.get(s, id), p = B.person(s, id);
    const next = D.bondStages[b.stage] && (p.sex === 'f' || !D.bondStages[b.stage].lover) ? D.bondStages[b.stage] : null;
    const hint = next ? `${next.at}で「${next.name}」` : B.isLover(s, id) && !b.married ? `${R.marryAt}で結婚を申し込める` : '';
    const tags = (b.married ? '<span class="tag love">♥ 妻</span>' : B.isLover(s, id) ? '<span class="tag love">♥ 恋人</span>' : '')
      + (G.Family.pregnant(s, id) ? '<span class="tag hi">身ごもっている</span>' : '');
    return `<div class="love-row"><span class="heart">♥</span><div class="bar love"><div style="width:${b.love}%"></div></div>
      <span>${b.love}　<b>${B.stageName(s, id)}</b></span>${tags}</div>${hint ? `<div class="hint">${hint}</div>` : ''}`;
  }

  function hearts(s, id) {
    const b = G.Bonds.get(s, id);
    if (!G.Bonds.canBond(s, id)) return '';
    return `<span class="mini-love">${b.married ? '💍' : G.Bonds.isLover(s, id) ? '♥' : ''}${b.love}</span>`;
  }

  // ---------- コマンド ----------
  const cmd = (act, label, opts = {}) => `<button class="cmd ${opts.cls || ''}" data-sc="${act}" ${opts.id ? `data-id="${opts.id}"` : ''} ${opts.g ? `data-g="${opts.g}"` : ''} ${opts.off ? 'disabled' : ''} ${opts.title ? `title="${opts.title}"` : ''}>${label}</button>`;

  function personCommands(s, id, inTavern) {
    const B = G.Bonds, F = G.Fleet, b = B.get(s, id), now = s.season;
    const p = B.person(s, id);
    if (p.family) return cmd('talk', '話す', { id, off: b.talked === now }) + cmd('back', '戻る');
    if (S.menu === 'gift') {
      const gifts = Object.keys(D.goods).filter(g => s.cargo[g] > 0);
      return `<div class="cmd-title">何を贈る？</div><div class="cmd-scroll">${gifts.map(g => cmd('give', `${D.goods[g].icon} ${D.goods[g].name}（${s.cargo[g]}）${(p.likes || []).includes(g) ? ' <span class="heart">♥好物</span>' : ''}`, { id, g })).join('') || '<p class="muted">積荷がない。</p>'}</div>${cmd('menu-main', 'やめる')}`;
    }
    const lover = B.isLover(s, id), proposeErr = B.canPropose(s, id);
    const recruit = inTavern && F.recruits(s).find(r => r.id === id);
    let html = '';
    if (recruit) {
      const err = F.canRecruit(s, recruit);
      html += cmd('recruit', `仲間に誘う（恩${recruit.cost}）`, { id, off: !!err, title: err || '' });
      if (err) html += `<div class="cmd-note">${err}</div>`;
      return html + cmd('back', '戻る');
    }
    html += cmd('talk', '話す', { id, off: b.talked === now });
    if (inTavern) html += cmd('treat', `一杯おごる（恩${R.treatCost}）`, { id, off: b.treated === now });
    html += cmd('menu-gift', '贈り物をする', { id, off: b.gifted === now });
    if (lover) html += cmd('date', '♥ デートする', { id, off: b.dated === now, cls: 'love' });
    if (lover && !b.married) html += cmd('propose', '💍 結婚を申し込む', { id, off: !!proposeErr, cls: 'love', title: proposeErr || '' });
    if (inTavern && !F.member(s, id)) {
      const inv = B.canInvite(s, id);
      html += cmd('invite', '仲間に誘う', { id, off: !!inv, title: inv || '' });
    }
    if (!F.member(s, id) || !inTavern) html += cmd('profile', 'くわしく', { id });
    return html + cmd('back', '戻る');
  }

  function sailorCommands(s) {
    const F = G.Fleet, coin = G.Economy.usesCoins(s, s.townId), price = F.sailorPrice(s);
    return cmd('hire', `${R.sailorHire}人雇う（${coin ? `金貨${price}枚` : `恩${price}`}）`)
      + cmd('dismiss', `${R.sailorHire}人に暇を出す`, { off: !s.sailors }) + cmd('back', '戻る');
  }

  function sailorText(s) {
    const F = G.Fleet;
    return `水夫たちが酒をあおっている。いま水夫${s.sailors}人・仲間${s.party.length}人。船団を動かすのに${F.crewNeed(s)}人要る。`
      + (F.crewFactor(s) < 1 ? '人手が足りず、船足が落ちている。' : '')
      + `\n水夫は戦いにも${R.sailorBattleMax}人まで加わり、1人が1季節に保存食を${R.sailorFood}食べる。`;
  }

  // 相手の情報（くわしく）
  function profileText(p) {
    return `${p.role}・${Math.floor(p.age)}歳・強さ${p.str}\n${p.bio || ''}\n`
      + Object.keys(D.cabins).map(k => `${D.cabins[k].icon}${D.cabins[k].name} ${stars(p.apt ? p.apt[k] || 0 : 0)}`).join('　')
      + `\n好きな物: ${(p.likes || []).map(g => D.goods[g].icon + D.goods[g].name).join('・') || '—'}`;
  }

  // ---------- 描画 ----------
  S.render = function (s) {
    const el = $('#scene');
    // 港を離れたら（沖へ出た・別の港へ行った・戦いになった）場面は閉じる
    if (S.open && (s.sea || G.battle || s.townId !== S.town)) S.leave();
    if (!S.open) { el.className = ''; el.innerHTML = ''; return; }
    const tavern = S.open === 'tavern', B = G.Bonds, F = G.Fleet;
    let people = '', side = '';
    if (S.target && S.target !== 'sailors') {
      // 選んだ相手を大きく
      const p = B.person(s, S.target);
      people = `<div class="focus">${G.Portrait.svg(p, 320)}</div>`;
      side = `<div class="win info"><div class="who">${p.name}<small>${p.role || ''}</small></div>${loveBar(s, p.id)}</div>
        <div class="win cmds">${personCommands(s, p.id, tavern)}</div>`;
    } else if (tavern) {
      const tv = D.towns[s.townId].tavern;
      const girlId = tv && tv.girl && !F.member(s, tv.girl) ? tv.girl : null;
      if (girlId) people += standee(s, B.person(s, girlId), 46, 22, 20, '酒場の娘', hearts(s, girlId));
      F.recruits(s).slice(0, 3).forEach((r, i) => {
        people += standee(s, r, [11, 26, 82][i], 34, 14, F.canRecruit(s, r) ? '旅の者' : '仲間になりたそう');
      });
      side = `<div class="win cmds"><div class="cmd-title">${tv ? tv.name : '村の集会所'}</div>
        ${girlId ? cmd('pick', `${B.person(s, girlId).name}と話す`, { id: girlId }) : ''}
        ${F.recruits(s).length ? '<div class="cmd-note">テーブルの人を選ぶと、仲間に誘える</div>' : ''}
        ${cmd('pick', '水夫の溜まり場へ', { id: 'sailors' })}
        ${cmd('leave', '店を出る')}</div>`;
      if (S.target === 'sailors') side = `<div class="win cmds"><div class="cmd-title">水夫の溜まり場</div>${sailorCommands(s)}</div>`;
    } else {
      const crew = s.party.filter(m => m.id !== 'you');
      const n = crew.length, perRow = Math.min(6, Math.max(1, Math.ceil(n / 2))), rows = Math.ceil(n / perRow);
      crew.forEach((m, i) => {
        const r = Math.floor(i / perRow), c = i % perRow, inRow = Math.min(perRow, n - r * perRow);
        const x = 44 + (c - (inRow - 1) / 2) * 14.5, y = rows === 1 ? 30 : 21 + r * 30;
        people += standee(s, m, x, y, 12.5, m.family ? (m.sex === 'f' ? '娘' : '息子') : m.role, hearts(s, m.id));
      });
      s.children.forEach((c, i) => {
        people += standee(s, c, 6 + i * 8, 70, 7, `${Math.floor(c.age)}歳`);
      });
      side = `<div class="win cmds"><div class="cmd-title">甲板</div><div class="cmd-note">話したい相手を選ぶ</div>${cmd('leave', '戻る')}</div>`;
    }
    const m = S.msg, speaker = m && m.who ? B.person(s, m.who) : null;
    const message = m ? `<div class="win message">${speaker ? `<div class="name">${speaker.name}</div>` : ''}
      ${m.text.split('\n').map(l => `<p class="${l.startsWith('「') ? 'say' : ''}">${l}</p>`).join('')}
      ${m.love ? `<span class="heart">♥ +${m.love}</span>` : ''}</div>` : '';
    el.className = 'open';
    el.innerHTML = `<div class="scene-box ${S.open}">
      ${tavern ? tavernBack() : deckBack()}
      ${people}
      ${tavern && !S.target ? tavernFront() : ''}
      ${side}
      ${message}
    </div>`;
  };

  // ---------- 操作 ----------
  function run(fn) {
    const s = G.state, res = fn();
    if (res) {
      if (res.chat) S.msg = { who: res.chat.who, text: res.chat.text, love: res.chat.love };
      else if (!res.ok) S.msg = { text: res.msg };
      else if (res.text) S.msg = { who: res.who, text: res.text };
    }
    G.save(s);
    G.UI.render();
  }

  document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-sc]');
    if (!b || b.disabled || !S.open) return;
    const s = G.state, B = G.Bonds, F = G.Fleet, id = b.dataset.id, a = b.dataset.sc;
    switch (a) {
      case 'pick': {
        S.target = id;
        S.menu = 'main';
        if (id === 'sailors') { S.msg = { text: sailorText(s) }; break; }
        const p = B.person(s, id);
        const recruit = S.open === 'tavern' && F.recruits(s).find(r => r.id === id);
        S.msg = recruit ? { who: id, text: `${p.bio}\n名声${recruit.fame}以上・恩${recruit.cost}${recruit.size ? `・村が「${G.Civ.sizeName(recruit.size)}」以上` : ''}で仲間になってくれる。` }
          : p.family && !F.member(s, id) ? { who: id, text: `${p.name}（${Math.floor(p.age)}歳）。あと${G.Family.seasonsToJoin(s, p)}季節ほどで、仲間として船に乗る。\n「おかえりなさい！」` }
          : { who: id, text: `「${pickGreeting(s, id)}」` };
        break;
      }
      case 'back': S.target = null; S.menu = 'main'; S.msg = null; break;
      case 'leave': S.leave(); break;
      case 'menu-gift': S.menu = 'gift'; break;
      case 'menu-main': S.menu = 'main'; break;
      case 'profile': S.msg = { text: profileText(B.person(s, id)) }; break;
      case 'talk':
        if (B.person(s, id).family) { B.get(s, id).talked = s.season; return run(() => ({ ok: true, who: id, text: pickChildLine() })); }
        return run(() => B.talk(s, id));
      case 'treat': return run(() => B.treat(s, id));
      case 'give': S.menu = 'main'; return run(() => B.gift(s, id, b.dataset.g));
      case 'date': return run(() => B.date(s, id));
      case 'propose': return run(() => {
        const r = B.propose(s, id);
        return r.ok ? { ok: true, who: id, text: '「……はい。喜んで」' } : r;
      });
      case 'invite': return run(() => {
        const r = B.invite(s, id);
        if (r.ok) { S.target = null; return { ok: true, text: `${B.person(s, id).name}が仲間になった。` }; }
        return r;
      });
      case 'recruit': return run(() => {
        const r = F.recruit(s, id);
        if (r.ok) { S.target = null; return { ok: true, text: `${B.person(s, id).name}が仲間になった。` }; }
        return r;
      });
      case 'hire': return run(() => { const r = F.hireSailors(s); return r.ok ? { ok: true, text: sailorText(s) } : r; });
      case 'dismiss': return run(() => { const r = F.dismissSailors(s); return r.ok ? { ok: true, text: sailorText(s) } : r; });
    }
    G.UI.render();
  });

  window.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape' || !S.open || (G.state.pendingEvents || []).length) return;
    if (S.menu !== 'main') S.menu = 'main';
    else if (S.target) { S.target = null; S.msg = null; } else S.leave();
    G.UI.render();
  });

  function pickGreeting(s, id) {
    const B = G.Bonds, b = B.get(s, id);
    if (b.married) return 'おかえりなさい、あなた';
    if (B.isLover(s, id)) return 'あ……来てくれたんだ';
    if (b.stage >= 2) return '待ってたよ。何か用？';
    if (b.stage >= 1) return 'やあ。元気？';
    return 'いらっしゃい。何か用？';
  }
  function pickChildLine() {
    const lines = ['「父さん、見て！　魚つかまえた！」', '「海の向こうの話、して！」', '「大きくなったら、父さんの船に乗るんだ」', '「母さんがね、父さんのこと好きだって」'];
    return lines[Math.floor(Math.random() * lines.length)];
  }
})();
