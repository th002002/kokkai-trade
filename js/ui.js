// 画面の描画と操作。ゲームの決まりごとはここには書かず、Economy / Knowledge / Travel / Fleet / Sea / Combat を呼ぶだけにする。
// 左の大きな枠は、港では地図（SVG）、外海では航海画面（seaview.js）、戦いのときは戦いの画面（battleview.js）になる。
(function () {
  const G = window.Game;
  const D = G.DATA;
  const R = D.rules;
  const E = () => G.Economy;
  const $ = sel => document.querySelector(sel);
  const fmt = v => G.fmt(v);
  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);

  let basket = { give: {}, take: {} };
  let tab = 'trade';
  let notice = '';
  let deliverPick = {}; // 造船の材料をいくつ渡すか "依頼uid:品物" → 数
  let nearKey = '';     // 外海で近くにある港（変わったら右の枠を描き直す）
  const winCache = new WeakMap();

  const UI = G.UI = {};
  G.battle = null;      // 戦っている最中の戦い（保存はしない）

  UI.render = function () {
    const s = G.state;
    renderHeader(s);
    renderStage(s);
    renderTown(s);
    renderLog(s);
    G.Scene.render(s);
    renderDialog(s);
  };

  function act(fn) {
    const res = fn();
    notice = res && !res.ok ? res.msg : '';
    if (res && res.ok) basket = { give: {}, take: {} };
    G.save(G.state);
    UI.render();
  }

  function svgPoint(svg, ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  // ---------- ヘッダー ----------
  function renderHeader(s) {
    const se = G.seasonInfo(s.season);
    const known = s.knowledge.length ? s.knowledge.map(k => `<span class="chip">${D.knowledge[k].name}</span>`).join('') : '<span class="muted">なし</span>';
    $('#header').innerHTML = `
      <div class="stat"><b>${G.seasonLabel(s.season)}</b><span class="muted">${se.note}</span></div>
      <div class="stat">船団 ${G.Fleet.ships(s).length}隻（速さ${G.Fleet.speed(s)}・強さ${G.Fleet.strength(s)}）<b>積荷 ${G.cargoTotal(s)} / ${G.capacity(s)}</b></div>
      <div class="stat">積荷<span>${Object.keys(D.goods).filter(g => s.cargo[g]).map(g => `<span title="${D.goods[g].name}">${D.goods[g].icon}${s.cargo[g]}</span>`).join('　') || '<span class="muted">空</span>'}</span></div>
      <div class="stat">仲間 ${s.party.length}人・水夫 ${s.sailors}人<span class="faces">${s.party.map(p => G.Portrait.svg(p, 26)).join('')}</span></div>
      <div class="stat">金貨<b>${s.coins}枚</b></div>
      <div class="stat">名声<b>${s.fame}</b></div>
      <div class="stat">知識<span>${known}</span></div>`;
  }

  // ---------- 左の大きな枠 ----------
  function renderStage(s) {
    const stage = $('#map');
    if (G.battle) {
      G.SeaView.unmount();
      G.BattleView.mount(stage, G.battle, { onEnd: endBattle, onFrame: renderBattleSide });
    } else if (s.sea) {
      G.BattleView.unmount();
      G.SeaView.mount(stage, { onEvent: () => UI.render(), onFrame: updateSeaHud });
    } else {
      G.SeaView.unmount();
      G.BattleView.unmount();
      stage.innerHTML = mapSvg(s, false);
    }
  }

  // 地図に映す範囲。霧の晴れたところと知っている港が収まるように広げる（横長 6:5）
  function mapBox(s) {
    const M = D.map, C = R.exploreCell;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const key in s.explored) { const [cx, cy] = key.split(',').map(Number); add(cx * C, cy * C); add((cx + 1) * C, (cy + 1) * C); }
    for (const id of s.discovered) add(D.towns[id].x, D.towns[id].y);
    if (s.sea) add(s.sea.x, s.sea.y);
    let w = Math.max(x1 - x0 + 80, 360), h = Math.max(y1 - y0 + 80, 300);
    if (w / h < 1.2) w = h * 1.2; else h = w / 1.2;
    w = Math.min(w, M.width); h = Math.min(h, M.height);
    const clamp = (v, hi) => Math.max(0, Math.min(hi, v));
    return { x: clamp((x0 + x1 - w) / 2, M.width - w), y: clamp((y0 + y1 - h) / 2, M.height - h), w, h, k: w / 420 };
  }

  // 地図。mini のときは外海の右の枠に出す小さな地図（船団と水族の位置つき）
  function mapSvg(s, mini) {
    const M = D.map, C = R.exploreCell, box = mapBox(s), k = box.k, sfx = mini ? '-m' : '';
    const here = s.sea ? null : s.townId;
    const reach = new Set(here ? G.Travel.routesFrom(s, here).map(r => r.to) : []);
    const seasonsOf = new Map(here ? G.Travel.routesFrom(s, here).map(r => [r.to, r.seasons]) : []);
    let routes = '', towns = '', holes = '';
    for (const key in s.explored) {
      const [cx, cy] = key.split(',').map(Number);
      holes += `<circle cx="${(cx + 0.5) * C}" cy="${(cy + 0.5) * C}" r="${C * 0.9}"/>`;
    }
    for (const r of D.routes) {
      if (!G.Travel.routeKnown(s, r)) continue;
      const active = r.a === here || r.b === here;
      routes += `<polyline points="${r.pts.map(p => p.join(',')).join(' ')}" class="route ${active ? 'active' : ''}" style="stroke-width:${(active ? 2.5 : 2) * k};stroke-dasharray:${5 * k} ${6 * k}"/>`;
      if (!mini && active) {
        const [mx, my] = r.pts[Math.floor(r.pts.length / 2)];
        routes += `<text x="${mx}" y="${my + 4 * k}" class="route-label" style="font-size:${12 * k}px;stroke-width:${3 * k}px">${seasonsOf.get(r.a === here ? r.b : r.a)}季節</text>`;
      }
    }
    for (const id of s.discovered) {
      const t = D.towns[id];
      const cls = id === here ? 'here' : reach.has(id) || s.sea ? 'reach' : '';
      towns += `<g class="town ${cls}" data-act="map-go" data-to="${id}">
        <circle cx="${t.x}" cy="${t.y}" r="${(id === here ? 10 : 7) * k}" style="stroke-width:${2 * k}"/>
        <text x="${t.x}" y="${t.y - 14 * k}" class="town-label" style="font-size:${14 * k}px;stroke-width:${3 * k}px">${t.name}</text>
        ${mini ? '' : `<text x="${t.x}" y="${t.y + 24 * k}" class="town-civ" style="font-size:${11 * k}px;stroke-width:${3 * k}px">${G.Civ.sizeName(G.Civ.size(s, id))}・${G.Civ.eraName(G.Civ.era(s, id))}</text>`}
      </g>`;
    }
    let marks = '';
    if (s.sea) {
      if (s.sea.target) marks += `<circle cx="${s.sea.target.x}" cy="${s.sea.target.y}" r="${5 * k}" class="mini-target" style="stroke-width:${2 * k}"/>`;
      if (s.sea.raider) marks += `<circle id="mini-raider" cx="${s.sea.raider.x}" cy="${s.sea.raider.y}" r="${6 * k}" class="mini-raider"/>`;
      marks += `<circle id="mini-fleet" cx="${s.sea.x}" cy="${s.sea.y}" r="${7 * k}" class="mini-fleet" style="stroke-width:${2 * k}"/>`;
    }
    const labels = M.labels.map(l => `<text x="${l.x}" y="${l.y}" class="${l.river ? 'river-label' : 'sea-label'}" style="font-size:${l.size}px">${l.text}</text>`).join('');
    return `
      <svg viewBox="${box.x} ${box.y} ${box.w} ${box.h}" role="img" aria-label="地図" class="${mini ? 'mini' : ''}">
        <defs>
          <filter id="fog-soft${sfx}"><feGaussianBlur stdDeviation="${C * 0.4}"/></filter>
          <mask id="fog-mask${sfx}">
            <rect width="${M.width}" height="${M.height}" fill="white"/>
            <g fill="black" filter="url(#fog-soft${sfx})">${holes}</g>
          </mask>
        </defs>
        <rect width="${M.width}" height="${M.height}" class="land"/>
        ${M.waterways.map(w => `<path class="waterway" d="${w.d}" style="stroke-width:${w.width}"/>`).join('')}
        <path class="sea" d="${M.seaPath}"/>
        ${M.landPaths.map(p => `<path class="land" d="${p}"/>`).join('')}
        ${mini ? '' : labels}
        ${routes}
        <rect width="${M.width}" height="${M.height}" class="fog" mask="url(#fog-mask${sfx})"/>
        ${towns}${marks}
      </svg>`;
  }

  // ---------- 右の枠 ----------
  function renderTown(s) {
    if (G.battle) { $('#town').innerHTML = battleSide(); return; }
    if (s.sea) { $('#town').innerHTML = seaView(s); nearKey = G.Sea.portsNear(s).join(); return; }
    const id = s.townId, t = s.towns[id], td = D.towns[id];
    const chips = t.knowledge.map(k => `<span class="chip">${D.knowledge[k].name}</span>`).join('') || '<span class="muted">まだ何も</span>';
    const tabs = [['trade', '交換'], ['village', '村の様子'], ['knowledge', '知識'], ['tavern', '酒場'], ['ships', '船と船室'], ['crew', '仲間'], ['travel', '出航']]
      .map(([k, l]) => `<button class="tab ${tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('');
    let body = '';
    if (tab === 'trade') body = tradeView(s);
    if (tab === 'village') body = villageView(s);
    if (tab === 'knowledge') body = knowledgeView(s);
    if (tab === 'ships') body = shipsView(s);
    if (tab === 'travel') body = travelView(s);
    $('#town').innerHTML = `
      <h2>${td.name}</h2>
      <p class="desc">${td.desc}</p>
      <p>時代 <b>${G.Civ.eraName(G.Civ.era(s, id))}</b>　人口 <b>${t.pop}</b>（${G.Civ.sizeName(G.Civ.size(s, id))}）　景気 <b>${G.Civ.boomLabel(t.boom)}</b>
        ${E().usesCoins(s, id) ? '<span class="tag hi">金貨が使える</span>' : '<span class="tag lo">物々交換</span>'}<br>
        ${chips}　｜　この村への恩 <b>${fmt(t.credit)}</b>${t.benefactor ? '　<span class="tag hi">恩人として良い条件</span>' : ''}</p>
      <div class="tabs">${tabs}</div>
      ${notice ? `<p class="notice">${notice}</p>` : ''}
      <div class="tab-body">${body}</div>`;
  }

  function priceTag(price, base, kind) {
    const r = price / base;
    if (kind === 'give' && r >= 1.5) return `<span class="tag hi" title="ふつうよりずっと高く引き取る">高値</span>`;
    if (kind === 'take' && r <= 0.8) return `<span class="tag lo" title="ふつうより安い">安い</span>`;
    return '';
  }

  function stepper(kind, g, n) {
    const extra = kind === 'give'
      ? `<button class="mini" data-act="all" data-kind="give" data-g="${g}">全部</button>`
      : `<button class="mini" data-act="all" data-kind="take" data-g="${g}">最大</button>`;
    return `<div class="stepper">
      <button data-act="step" data-kind="${kind}" data-g="${g}" data-d="-1">−</button>
      <span>${n}</span>
      <button data-act="step" data-kind="${kind}" data-g="${g}" data-d="1">＋</button>${extra}</div>`;
  }

  // 交換。左に自分の積荷、右に村の品を並べ、押した品物が下の「交換の台」に乗る。数は台の上で決める
  let tradeCat = 'all', tradeSort = 'deal';
  function tradeView(s) {
    const id = s.townId, t = s.towns[id], coin = E().usesCoins(s, id), unit = coin ? '枚' : '';
    const here = E().goodsAt(s, id);
    const giveP = g => E().giveUnit(s, id, g, t.stock[g]);
    const takeP = g => E().takeUnit(s, id, g, t.stock[g] - 1);
    const inCat = g => tradeCat === 'all' || D.goods[g].cat === tradeCat;
    const mine = here.filter(g => s.cargo[g] > 0 && inCat(g));
    const theirs = here.filter(g => t.stock[g] > 0 && inCat(g));
    if (tradeSort === 'deal') {
      mine.sort((a, b) => giveP(b) / D.goods[b].base - giveP(a) / D.goods[a].base);
      theirs.sort((a, b) => takeP(a) / D.goods[a].base - takeP(b) / D.goods[b].base);
    }
    const cats = [['all', 'すべて'], ...Object.entries(D.goodCats).filter(([c]) => here.some(g => D.goods[g].cat === c))];
    const catBtns = cats.map(([c, l]) => `<button class="mini ${tradeCat === c ? 'on' : ''}" data-act="tcat" data-c="${c}">${l}</button>`).join('');
    const sortBtns = [['deal', 'お得な順'], ['name', 'いつもの順']]
      .map(([k, l]) => `<button class="mini ${tradeSort === k ? 'on' : ''}" data-act="tsort" data-k="${k}">${l}</button>`).join('');
    const row = (kind, g, have, price) => {
      const gd = D.goods[g];
      return `<button class="goods-row ${basket[kind][g] ? 'picked' : ''}" data-act="pick" data-kind="${kind}" data-g="${g}">
        <span class="gname">${gd.icon} ${gd.name}</span><span class="num muted small">${have}</span>
        <span class="num">${fmt(price)}${unit}</span><span class="gtag">${priceTag(price, gd.base, kind)}</span></button>`;
    };
    const giveLabel = coin ? '売る' : '渡す', takeLabel = coin ? '買う' : 'もらう';

    // 交換の台
    const lines = [];
    for (const g in basket.give) if (basket.give[g] > 0) lines.push(['give', g, basket.give[g], E().giveValue(s, id, g, basket.give[g])]);
    for (const g in basket.take) if (basket.take[g] > 0) lines.push(['take', g, basket.take[g], E().takeCost(s, id, g, basket.take[g])]);
    const q = E().quote(s, id, basket.give, basket.take);
    let load = G.cargoTotal(s);
    for (const g in D.goods) load += (basket.take[g] || 0) - (basket.give[g] || 0);
    const ok = lines.length && q.ok && load <= G.capacity(s);
    let sum;
    if (coin) {
      sum = `${giveLabel}品 <b>${fmt(q.giveV)}</b> − ${takeLabel}品 <b>${fmt(q.takeV)}</b> ＝ `
        + (q.get ? `<b class="good">金貨${q.get}枚を受け取る</b>` : q.pay ? `<b class="${q.ok ? '' : 'bad'}">金貨${q.pay}枚を払う</b>` : '<b>0</b>')
        + `<div class="muted small">手持ちの金貨 ${s.coins}枚。端数は切り捨て・切り上げ。舟の積荷 ${load} / ${G.capacity(s)}</div>`;
    } else {
      const foodV = giveP('food'), net = q.giveV - q.takeV;
      sum = `渡す品 <b>${fmt(q.giveV)}</b> ＋ 恩 <b>${fmt(q.credit)}</b> − もらう品 <b>${fmt(q.takeV)}</b> ＝ <b class="${q.balance < 0 ? 'bad' : 'good'}">${fmt(q.balance)}</b>
        <div class="muted small">品物どうしの差し引き ${fmt(net)}（保存食 約${fmt(Math.abs(net) / foodV)}個分${net < 0 ? '足りない' : '余る'}）。残りは村への恩になる。舟の積荷 ${load} / ${G.capacity(s)}</div>`;
    }
    const deal = `<div class="deal">
      <h3>交換の台</h3>
      ${lines.length ? `<table class="trade"><tbody>${lines.map(([kind, g, n, v]) => `<tr>
        <td class="small ${kind === 'give' ? 'good' : ''}">${kind === 'give' ? giveLabel : takeLabel}</td>
        <td>${D.goods[g].icon} ${D.goods[g].name}</td>
        <td>${stepper(kind, g, n)}</td>
        <td class="num">${fmt(v)}${unit}</td>
        <td><button class="mini" data-act="unpick" data-kind="${kind}" data-g="${g}" title="台から下ろす">✕</button></td></tr>`).join('')}</tbody></table>`
        : `<p class="muted small">上の品物を押すと、ここに乗る。</p>`}
      <div>${sum}</div>
      <div class="buttons">
        <button class="primary" data-act="trade" ${ok ? '' : 'disabled'}>${coin ? '売り買いする' : '交換する'}</button>
        ${coin ? '' : '<button data-act="food-balance" title="足りなければ保存食を渡し、余れば保存食を受け取る">差額を保存食で合わせる</button>'}
        <button data-act="clear">やめる</button>
      </div>
    </div>`;

    const unused = Object.keys(D.goods).filter(g => s.cargo[g] && !here.includes(g));
    return `
      <div class="trade-bar"><span>${catBtns}</span><span>${sortBtns}</span></div>
      <div class="goods-cols">
        <div><h3>積荷（${giveLabel}）</h3><div class="goods-head small muted"><span>品物</span><span>手持ち</span><span>1つの値</span></div>
          ${mine.map(g => row('give', g, s.cargo[g], giveP(g))).join('') || '<p class="muted small">この種類の積荷はない。</p>'}</div>
        <div><h3>村の品（${takeLabel}）</h3><div class="goods-head small muted"><span>品物</span><span>在庫</span><span>1つの値</span></div>
          ${theirs.map(g => row('take', g, t.stock[g], takeP(g))).join('') || '<p class="muted small">この種類の品はない。</p>'}</div>
      </div>
      ${deal}
      ${unused.length ? `<p class="muted small">この村ではまだ使わない品物: ${unused.map(g => `${D.goods[g].icon}${D.goods[g].name}${s.cargo[g]}`).join('、')}（村の時代が進むと扱うようになる）</p>` : ''}
      <p class="muted small">${coin ? 'この町は青銅器の時代。品物を金貨で売り買いする。' : 'この村は物々交換。食べ物が貨幣のかわりで、差額は保存食で合わせることが多い。'}
        同じ品物をたくさん${giveLabel}ほど村に余って値が下がる。季節が過ぎると村の在庫は元に戻っていく。交換するほど村の景気が良くなる。</p>`;
  }

  function knowledgeView(s) {
    let html = '';
    // まだどの村も編み出していない知識は伏せておく
    const known = k => s.knowledge.includes(k) || Object.values(s.towns).some(t => t.knowledge.includes(k));
    for (const k in D.knowledge) {
      const kd = D.knowledge[k];
      if (!known(k)) continue;
      const learnErr = G.Knowledge.canLearn(s, k);
      const teachErr = G.Knowledge.canTeach(s, k);
      let action;
      if (!teachErr) action = `<button class="primary" data-act="teach" data-k="${k}">教える（一季節・恩+${kd.teachReward}）</button>`;
      else if (!learnErr) action = `<button class="primary" data-act="learn" data-k="${k}">学ぶ（一季節・恩−${kd.learnCost}）</button>`;
      else action = `<span class="muted">学ぶ: ${learnErr}／教える: ${teachErr}</span>`;
      html += `<div class="card">
        <h3>${kd.name}${s.knowledge.includes(k) ? '<span class="chip">身につけている</span>' : ''}</h3>
        <p>${kd.desc}</p>
        <p class="muted small">${effectText(kd)}</p>
        ${action}
      </div>`;
    }
    return html + `<p class="muted small">知識を教えると村の文明値が上がり、その村で欲しがるもの・余るものが変わる。まだだれも知らない技もある。研究者のいる村が栄えると、自分で編み出すことがある。</p>`;
  }

  function effectText(kd) {
    const out = [];
    for (const g in kd.effects) {
      const e = kd.effects[g];
      if (e.target) out.push(`${D.goods[g].name}を${e.target > 0 ? '作るようになる' : '使うようになる'}`);
      if (e.mult) out.push(`${D.goods[g].name}を${e.mult > 1 ? 'より欲しがる' : 'あまり欲しがらない'}`);
    }
    return (kd.opensEra ? `覚えた村は「${G.Civ.eraName(kd.opensEra)}」の時代に入る。` : '')
      + `覚えた村では（${R.knowledgeRamp}季節かけて少しずつ）: ` + out.join('、') + `。教えると村が養える人が増える。教えた村は恩人として良い条件で交換してくれる`
      + (kd.requires.length ? `。先に${kd.requires.map(r => D.knowledge[r].name).join('・')}が要る` : '');
  }

  function shipStats(type) {
    const sd = D.ships[type];
    return `積荷${sd.capacity}・速さ${sd.speed}・強さ${sd.strength}・船室${sd.cabins.length}・人手${sd.crew || 0}人`;
  }

  // 船室の席。座っている人と、座らせられる人を選ぶ
  function seatRow(s, sh, i) {
    const F = G.Fleet, kind = F.cabinOf(sh, i), cab = D.cabins[kind];
    const cur = sh.seats[i] ? F.member(s, sh.seats[i]) : null;
    let control;
    if (i === 0 && sh.seats[0] === 'you') {
      control = '<span>あなた（自分の船）</span>';
    } else {
      // 手の空いている人と、ほかの船室（船長室以外）に座っている人を選べる
      const options = s.party.filter(m => {
        if (m.id === 'you') return false;
        const at = F.seatOf(s, m.id);
        return !at || at.i !== 0 || (cur && cur.id === m.id);
      });
      const from = m => {
        const at = F.seatOf(s, m.id);
        return at && !(at.sh === sh && at.i === i) ? `（いま${F.shipName(at.sh)}の${D.cabins[F.cabinOf(at.sh, at.i)].name}）` : '';
      };
      control = `<select data-change="seat" data-uid="${sh.uid}" data-i="${i}">
        ${i === 0 ? '' : '<option value="">（空き）</option>'}
        ${options.map(m => `<option value="${m.id}" ${cur && cur.id === m.id ? 'selected' : ''}>${m.name}　${stars(m.apt[kind])}${from(m)}</option>`).join('')}
      </select>`;
    }
    return `<tr>
      <td title="${cab.desc}">${cab.icon} ${cab.name}</td>
      <td>${cur ? G.Portrait.svg(cur, 28) : ''}</td>
      <td>${control}</td>
      <td class="small ${cur ? '' : 'muted'}">${cur ? '適性 ' + stars(cur.apt[kind]) : '効果なし'}</td>
    </tr>`;
  }

  function bonusText(s) {
    const b = G.Fleet.bonus(s);
    const pct = v => Math.round(v * 100);
    return [
      `船足 +${pct(b.speed - 1)}%`,
      `見渡し +${b.sight}`,
      `逃げやすさ +${pct(b.flee)}%`,
      `保存食の減り −${pct(b.food)}%（1季節 ${G.Fleet.foodPerSeason(s)}）`,
      `積荷 +${b.hold}`,
      `戦う力 +${pct(b.combat - 1)}%`,
    ].join('・');
  }

  function shipsView(s) {
    const F = G.Fleet, id = s.townId;
    let html = `<div class="card"><b>船室の効果</b><br><span class="small">${bonusText(s)}</span>
      <br><span class="small ${F.crewFactor(s) < 1 ? 'bad' : ''}">人手 ${F.crewHave(s)} / ${F.crewNeed(s)}人（仲間${s.party.length}・水夫${s.sailors}）${F.crewFactor(s) < 1 ? '　足りないので船足が落ちている。水夫は酒場で雇える' : ''}</span></div><h3>船団</h3>`;
    for (const sh of F.ships(s)) {
      html += `<div class="card">
        <div class="row"><div><b>${F.shipName(sh)}</b>　<span class="muted small">${shipStats(sh.type)}</span></div>
        ${sh.seats[0] === 'you' ? '<span class="chip">あなたの船</span>' : `<button data-act="dock" data-uid="${sh.uid}">この港に置く</button>`}</div>
        <table class="cabins"><tbody>${sh.seats.map((_, i) => seatRow(s, sh, i)).join('')}</tbody></table>
      </div>`;
    }
    const docked = F.docked(s, id);
    if (docked.length) {
      html += '<h3>この港に置いてある船</h3>';
      for (const sh of docked) {
        html += `<div class="card">
          <div><b>${F.shipName(sh)}</b>　<span class="muted small">${shipStats(sh.type)}</span></div>
          <table class="cabins"><tbody>${seatRow(s, sh, 0)}</tbody></table>
          <p class="muted small">船長を選ぶと船団に加わる。</p>
          <div class="buttons"><button data-act="board" data-uid="${sh.uid}">自分が乗り換える</button></div>
        </div>`;
      }
    }
    const elsewhere = s.ships.filter(sh => !sh.seats[0] && sh.at !== id);
    if (elsewhere.length) {
      html += `<p class="muted small">ほかの港に置いてある船: ${elsewhere.map(sh => `${F.shipName(sh)}（${D.towns[sh.at].name}）`).join('、')}</p>`;
    }
    const yard = D.towns[id].shipyard || [];
    if (yard.length) {
      html += '<h3>造船を依頼する</h3>';
      for (const type of yard) {
        const sd = D.ships[type];
        const o = s.orders.find(x => x.town === id && x.type === type);
        const mats = Object.entries(sd.build.materials).map(([g, n]) => `${D.goods[g].name}${n}`).join('、');
        let action;
        if (!o) {
          const err = F.canOrder(s, type);
          action = err ? `<span class="muted small">${err}</span>`
            : `<button class="primary" data-act="order" data-type="${type}">依頼する（恩−${sd.build.credit}）</button>`;
        } else if (o.readyAt != null) {
          action = `<span class="good">造っている。${G.seasonLabel(o.readyAt)}に完成</span>`;
        } else {
          const rows = Object.entries(F.remaining(o)).filter(([, n]) => n > 0).map(([g, n]) => {
            const v = deliverAmount(s, o, g);
            return `<tr><td>${D.goods[g].icon} ${D.goods[g].name}</td><td class="num">あと${n}</td><td class="num">手持ち${s.cargo[g]}</td>
              <td><div class="stepper">
                <button data-act="dstep" data-uid="${o.uid}" data-g="${g}" data-d="-1">−</button><span>${v}</span>
                <button data-act="dstep" data-uid="${o.uid}" data-g="${g}" data-d="1">＋</button>
                <button class="mini" data-act="dmax" data-uid="${o.uid}" data-g="${g}">最大</button>
                <button class="mini" data-act="dzero" data-uid="${o.uid}" data-g="${g}">0</button>
              </div></td></tr>`;
          }).join('');
          action = `<table class="trade"><tbody>${rows}</tbody></table>
            <div class="buttons"><button class="primary" data-act="deliver" data-uid="${o.uid}">選んだ材料を渡す</button></div>`;
        }
        html += `<div class="card">
          <h3>${sd.name}　<span class="muted small">${shipStats(type)}</span></h3>
          <p>${sd.desc}</p>
          <p class="muted small">船室: ${sd.cabins.map(c => D.cabins[c].name).join('・')}</p>
          <p class="muted small">材料 ${mats}・完成まで${sd.build.seasons}季節・村が「${G.Civ.eraName(sd.era || 1)}」の時代${sd.size ? `で「${G.Civ.sizeName(sd.size)}」以上` : ''}${sd.requires ? `・造るには村が${sd.requires.map(k => D.knowledge[k].name).join('・')}を知っていること` : ''}</p>
          ${action}
        </div>`;
      }
    }
    const away = s.orders.filter(o => o.town !== id);
    if (away.length) {
      html += `<p class="muted small">ほかの港での依頼: ${away.map(o => `${D.ships[o.type].name}（${D.towns[o.town].name}・${o.readyAt != null ? G.seasonLabel(o.readyAt) + '完成' : '材料待ち'}）`).join('、')}</p>`;
    }
    html += '<h3>船室のはたらき</h3>' + Object.values(D.cabins).map(c => `<p class="small">${c.icon} <b>${c.name}</b>　${c.desc}</p>`).join('');
    return html;
  }

  // 渡す材料の数。選んでいなければ渡せるだけ
  function deliverMax(s, o, g) { return Math.max(0, Math.min(G.Fleet.remaining(o)[g], s.cargo[g])); }
  function deliverAmount(s, o, g) {
    const v = deliverPick[o.uid + ':' + g];
    return Math.min(v === undefined ? Infinity : v, deliverMax(s, o, g));
  }

  // ---------- 村の様子 ----------
  function villageView(s) {
    const id = s.townId, t = s.towns[id], V = G.Civ, td = D.towns[id];
    const era = V.era(s, id), size = V.size(s, id), cap = V.cap(s, id), grow = V.growth(s, id);
    const nextAt = V.nextSizeAt(s, id), floor = D.sizes[size - 1].at;
    const pct = nextAt == null ? 100 : Math.max(0, Math.min(100, Math.round(100 * (t.pop - floor) / (nextAt - floor))));
    const keys = V.nextEraKeys(s, id);
    const gName = g => D.goods[g].icon + D.goods[g].name;
    const eraGoods = Object.keys(D.goods).filter(g => D.goods[g].era === era + 1);
    const eraShips = (td.shipyard || []).filter(x => (D.ships[x].era || 1) === era + 1);
    const sizePeople = (td.recruits || []).filter(r => (r.size || 1) === size + 1).map(r => D.people[r.id].name);
    const sizeShips = (td.shipyard || []).filter(x => D.ships[x].size === size + 1);
    const pending = Object.keys(D.knowledge).filter(k => { const kd = D.knowledge[k]; return kd.invent && kd.invent.town === id && !t.knowledge.includes(k); });
    const cost = V.researcherCost(s), err = V.canFund(s);
    let html = `<div class="card">
      <h3>時代「${V.eraName(era)}」　<span class="muted small">${D.eras[era - 1].note}</span></h3>
      ${keys.length ? `<p class="small">「${V.eraName(era + 1)}」の時代へ進むには、${keys.map(k => `「${D.knowledge[k].name}」`).join('か')}を知ること。
        進むと: ${[eraGoods.length ? `品物 ${eraGoods.map(gName).join('・')} を使う` : '', eraShips.length ? `${eraShips.map(x => D.ships[x].name).join('・')}を造れる` : '', era + 1 >= R.coinEra && era < R.coinEra ? '金貨で売り買いする' : ''].filter(Boolean).join('、')}</p>` : ''}
      <p class="muted small">扱う品物: ${E().goodsAt(s, id).map(gName).join('・')}</p>
    </div>
    <div class="card">
      <h3>人口 ${t.pop}人「${V.sizeName(size)}」　<span class="muted small">${nextAt == null ? '' : `${nextAt}人で「${V.sizeName(size + 1)}」`}</span></h3>
      <div class="bar civ"><div style="width:${pct}%"></div></div>
      <p class="small">養える人数 ${cap}人。1季節ごとに ${grow >= 0 ? '+' : ''}${grow}人${V.hungry(s, id) ? '　<span class="bad">食べ物が足りず、人が減っている</span>' : ''}</p>
      ${nextAt != null && (sizePeople.length || sizeShips.length) ? `<p class="small">「${V.sizeName(size + 1)}」になると: ${[sizePeople.length ? `${sizePeople.join('・')}が酒場に現れる` : '', sizeShips.length ? `${sizeShips.map(x => D.ships[x].name).join('・')}を造れる` : ''].filter(Boolean).join('、')}</p>` : ''}
      <p class="muted small">知識を教えたり研究者を支えたりすると、養える人数が増える。景気が良いほど早く人が増え、大きな町ほど品物を多く作り、飾り物を欲しがる。</p>
    </div>
    <div class="card">
      <h3>景気「${V.boomLabel(t.boom)}」　<span class="muted small">${Math.round(t.boom)} / 100</span></h3>
      <div class="bar boom"><div style="width:${Math.round(t.boom)}%"></div></div>
      <p class="muted small">交換するほど景気が上がり、季節ごとに普通（50）へ戻っていく。食べ物が足りないと下がる。景気が良いと品物を多く作り、人も早く増える。</p>
    </div>
    <div class="card">
      <h3>研究者　<span class="muted small">${t.researchers} / ${R.researcherCost.length}人</span></h3>
      <p class="small">村への恩で、暮らしの心配なく工夫に打ちこめる研究者を支える。1人ごとに養える人数が少し増える。大きく育った村の研究者は、まだだれも知らない技を編み出すことがある。</p>
      ${pending.length ? `<p class="small">この村の研究者が編み出しそうな技: ${pending.map(k => { const kd = D.knowledge[k], miss = kd.requires.filter(r => !t.knowledge.includes(r)); return `？？？（村が「${V.sizeName(kd.invent.size)}」以上${miss.length ? `、先に${miss.map(r => D.knowledge[r].name).join('・')}が要る` : ''}）`; }).join('、')}</p>` : ''}
      ${err ? `<span class="muted small">${err}</span>` : `<button class="primary" data-act="fund">研究者を支える（恩−${cost}）</button>`}
    </div>`;
    return html;
  }

  // ---------- 好感度の出来事 ----------
  function renderDialog(s) {
    const el = $('#dialog');
    const ev = s.pendingEvents && s.pendingEvents[0];
    if (!ev || G.battle) { el.innerHTML = ''; el.className = ''; return; }
    const B = G.Bonds, kind = ev.kind || 'stage';
    // 生まれた・育った子供の出来事では、子供の顔を出す
    const child = ev.child ? B.person(s, ev.child) : kind === 'grown' ? B.person(s, ev.who) : null;
    const mother = kind === 'grown' ? B.person(s, child.mother) : B.person(s, ev.who);
    const face = kind === 'grown' ? child : mother;
    const story = B.story(mother.id), gen = D.stories.generic;
    const raw = kind === 'stage' ? story.events[ev.stage] : story[kind] || gen[kind];
    const lines = (raw || []).map(l => l.replace(/\{name\}/g, mother.name).replace(/\{child\}/g, child ? child.name : ''));
    const label = { stage: D.bondStages[ev.stage || 0].name, wedding: '結婚', birth: '誕生', grown: '旅立ち' }[kind];
    el.className = 'open';
    el.innerHTML = `<div class="dialog-card">
      <div class="dialog-head">${G.Portrait.svg(face, 120)}${kind === 'birth' ? G.Portrait.svg(child, 72) : ''}
        <div><div class="muted small">${face.role || (face.sex === 'f' ? '娘' : '息子')}</div><h2>${face.name}</h2><div class="tag hi">♥ ${label}</div></div></div>
      <div class="dialog-lines">${lines.map(l => `<p class="${l.startsWith('「') ? 'say' : 'narr'}">${l}</p>`).join('')}</div>
      <p class="small good">${ev.reward}</p>
      <div class="buttons"><button class="primary" data-act="event-next">続ける</button></div>
    </div>`;
  }

  function travelView(s) {
    let html = '<p class="muted small">地図の港をダブルクリックすると、知っている航路をたどってそこへ向かう（途中の港は通り過ぎる）。</p>';
    for (const r of G.Travel.routesFrom(s, s.townId)) {
      const need = G.Travel.foodNeeded(s, r);
      const short = s.cargo.food < need;
      html += `<div class="card">
        <h3>${D.towns[r.to].name}へ（${r.seasons}季節）</h3>
        <p>保存食 ${need} を食べる${short ? '　<span class="bad">足りない！食べ物を探して一季節余計にかかる</span>' : ''}</p>
        ${memoTable(s, r.to)}
        <button class="primary" data-act="go" data-to="${r.to}">出航する</button>
      </div>`;
    }
    html += `<div class="card"><h3>沖へ漕ぎ出す</h3>
      <p class="muted">航路を使わず、広い海を自分で舵を取って進む。霧の向こうに、まだ知らない港があるかもしれない。</p>
      <button class="primary" data-act="set-sail">沖へ出る</button></div>`;
    html += `<div class="card"><h3>この村に留まる</h3><p class="muted">一季節を過ごす。村の在庫が回復する。</p>
      <button data-act="wait">一季節待つ</button></div>`;
    return html;
  }

  function encounterView(s) {
    const e = s.encounter, b = D.raiders[e.band], C = G.Combat;
    if (!winCache.has(e)) winCache.set(e, C.winChance(s, e));
    const win = Math.round(winCache.get(e) * 100);
    const odds = win >= 75 ? '勝ち目は高い' : win >= 45 ? '五分五分' : win >= 20 ? '分が悪い' : 'ほぼ勝ち目はない';
    return `
      <h2>${b.name}</h2>
      <p class="desc">水の上で暮らす水族の舟に追いつかれた。積荷を狙っている。</p>
      <div class="card">
        <p>相手 ${e.members.length}人・舟の強さ${b.ship}</p>
        <p>こちら ${s.party.length}人・船団の強さ${G.Fleet.strength(s)}</p>
        <p>見立て: <b>${odds}</b>（およそ${win}%）　逃げられる見込み およそ${Math.round(C.fleeChance(s, e) * 100)}%</p>
      </div>
      <p class="muted small">勝てば相手の積荷を奪い、名声が${b.fame}上がる。負ければ積荷の${Math.round(R.loseShare * 100)}%を奪われる。逃げそこなうと戦いになる。</p>
      <div class="buttons">
        <button class="primary" data-act="fight">戦う</button>
        <button data-act="flee">逃げる</button>
      </div>`;
  }

  function seaView(s) {
    if (s.encounter) return encounterView(s);
    const v = s.sea;
    const near = G.Sea.portsNear(s).map(id =>
      `<button class="primary" data-act="enter" data-to="${id}">${D.towns[id].name}に入港する</button>`).join(' ');
    const known = s.discovered.map(id =>
      `<button data-act="sail-to" data-to="${id}">${D.towns[id].name}</button>`).join(' ');
    const speeds = [1, 2, 4].map(n =>
      `<button class="mini ${G.SeaView.timeScale === n ? 'on' : ''}" data-act="timescale" data-n="${n}">×${n}</button>`).join('');
    return `
      <h2>外海</h2>
      <p class="desc">海をクリック（押したまま動かしても良い）するとその方へ漕ぎ進む。矢印キーやWASDでも舵を取れ、スペースで止まる。</p>
      <div id="minimap">${mapSvg(s, true)}</div>
      <p class="small muted">小さな地図をクリックすると、そこへ向かって進む。</p>
      <p>この季節の航程　<span class="small muted">（船足 ${G.Fleet.speed(s)}・早送り ${speeds}）</span></p>
      <div class="bar"><div id="season-bar" style="width:${Math.min(100, Math.round(v.dist / R.seaPerSeason * 100))}%"></div></div>
      <p class="muted small">バーが満ちると季節が変わり、保存食を${G.Fleet.foodPerSeason(s)}食べる（いま ${s.cargo.food}）。港に入るときも、漕ぎかけの季節は過ぎたものになる。</p>
      <p class="small" id="flow-note">${flowNote(s)}</p>
      ${v.hungry ? '<p class="bad">保存食がない。船足が半分になっている。</p>' : ''}
      ${v.raider ? `<p class="bad">${D.raiders[v.raider.band].name}が追ってくる！引き離せば諦める。</p>` : ''}
      ${notice ? `<p class="notice">${notice}</p>` : ''}
      ${near ? `<div class="card"><h3>港が近い</h3>${near}</div>` : ''}
      <div class="card"><h3>知っている港へ向かう</h3>${known}
        <div class="buttons"><button data-act="stop">止まる</button></div></div>`;
  }

  function flowNote(s) {
    const fl = s.sea && s.sea.target && s.sea.flow;
    if (!fl || !fl.river) return '';
    if (fl.up) return `${fl.river}をさかのぼっている（船足×${R.upstream}）`;
    if (fl.down) return `${fl.river}を下っている（船足×${R.downstream}）`;
    return `${fl.river}の上にいる`;
  }

  // 外海で、描き直さずに動くところだけ更新する
  function updateSeaHud() {
    const s = G.state;
    if (!s.sea) return;
    if (G.Sea.portsNear(s).join() !== nearKey) { renderTown(s); return; }
    const fn = $('#flow-note');
    if (fn) fn.textContent = flowNote(s);
    const bar = $('#season-bar');
    if (bar) bar.style.width = Math.min(100, Math.round(s.sea.dist / R.seaPerSeason * 100)) + '%';
    const f = $('#mini-fleet');
    if (f) { f.setAttribute('cx', s.sea.x); f.setAttribute('cy', s.sea.y); }
    const r = $('#mini-raider');
    if (r && s.sea.raider) { r.setAttribute('cx', s.sea.raider.x); r.setAttribute('cy', s.sea.raider.y); }
  }

  // ---------- 戦い ----------
  function battleSide() {
    const bt = G.battle, b = D.raiders[bt.band];
    const mine = bt.units.filter(u => u.side === 'me' && !u.sailor);
    const sailors = bt.units.filter(u => u.sailor);
    const foes = bt.units.filter(u => u.side === 'foe');
    const speeds = [1, 2, 4].map(n =>
      `<button class="mini ${G.BattleView.speed === n ? 'on' : ''}" data-act="bspeed" data-n="${n}">×${n}</button>`).join('');
    return `
      <h2>水上戦　<span class="muted small">${b.name}</span></h2>
      <p class="small muted">船を横づけにして打ち合う。舳先に座る人は強く打ち、船長たちの統率で全員の力が上がる。　早送り ${speeds}</p>
      <div id="roster">${roster(mine)}</div>
      ${sailors.length ? `<p class="small muted" id="sailor-count">水夫 ${sailors.filter(u => !u.ko).length} / ${sailors.length}人</p>` : ''}
      <p class="small muted">水族 ${foes.filter(u => !u.ko).length} / ${foes.length}人</p>`;
  }

  function roster(units) {
    return units.map(u => `<div class="roster-row ${u.ko ? 'ko' : ''}">
      ${G.Portrait.svg(u, 30)}<span class="roster-name">${u.name}</span>
      <div class="bar hp"><div style="width:${Math.round(100 * u.hp / u.maxHp)}%"></div></div>
    </div>`).join('');
  }

  function renderBattleSide() {
    const el = $('#roster');
    if (el && G.battle) el.innerHTML = roster(G.battle.units.filter(u => u.side === 'me' && !u.sailor));
    const sc = $('#sailor-count');
    if (sc && G.battle) { const su = G.battle.units.filter(u => u.sailor); sc.textContent = `水夫 ${su.filter(u => !u.ko).length} / ${su.length}人`; }
  }

  function startBattle(s) {
    G.battle = G.Combat.createBattle(s, s.encounter);
    notice = '';
    UI.render();
  }

  function endBattle() {
    const s = G.state;
    notice = G.Combat.finish(s, G.battle);
    G.battle = null;
    G.save(s);
    UI.render();
  }

  function memoTable(s, townId) {
    const m = s.memo[townId];
    if (!m) return '<p class="muted small">まだ訪れたことがない。相場はわからない。</p>';
    const ratio = (v, g) => v / D.goods[g].base;
    const hi = Object.keys(m.give).sort((a, b) => ratio(m.give[b], b) - ratio(m.give[a], a)).slice(0, 5);
    const lo = Object.keys(m.take).filter(g => m.take[g] != null).sort((a, b) => ratio(m.take[a], a) - ratio(m.take[b], b)).slice(0, 5);
    const item = (g, v) => `${D.goods[g].icon}${D.goods[g].name} ${fmt(v)}${m.coin ? '枚' : ''}`;
    return `<p class="muted small">${G.seasonLabel(m.season)}に見た相場${m.coin ? '（金貨）' : '（物々交換）'}</p>
      <p class="small memo-line">高く引き取る: ${hi.map(g => item(g, m.give[g])).join('、')}<br>安く手に入る: ${lo.map(g => item(g, m.take[g])).join('、')}</p>`;
  }

  // ---------- 記録 ----------
  function renderLog(s) {
    $('#log').innerHTML = '<h3>旅の記録</h3>' + s.log.slice(0, 30)
      .map(l => `<div><span class="muted">${G.seasonLabel(l.t)}</span>　${l.msg}</div>`).join('');
  }

  // ---------- 操作 ----------
  function maxTake(s, g) {
    const id = s.townId;
    const trial = { give: { ...basket.give }, take: { ...basket.take, [g]: 0 } };
    trial.give[g] = 0;
    let n = 0;
    while (n < s.towns[id].stock[g]) {
      trial.take[g] = n + 1;
      let load = G.cargoTotal(s);
      for (const k in D.goods) load += (trial.take[k] || 0) - (trial.give[k] || 0);
      if (load > G.capacity(s) || !E().quote(s, id, trial.give, trial.take).ok) break;
      n++;
    }
    return n;
  }

  // 港にいるとき、地図の既知の港をダブルクリックすると航路をたどって向かう
  document.addEventListener('dblclick', ev => {
    const s = G.state;
    const svg = ev.target.closest('#map svg');
    if (!svg || s.sea) return;
    const townEl = ev.target.closest('.town');
    const p = svgPoint(svg, ev);
    const to = townEl ? townEl.dataset.to
      : s.discovered.find(id => Math.hypot(D.towns[id].x - p.x, D.towns[id].y - p.y) <= R.portRadius);
    if (!to || to === s.townId) return;
    tab = 'trade';
    act(() => G.Travel.goTo(s, to));
  });

  // 船室の席を選ぶ
  document.addEventListener('change', ev => {
    const el = ev.target;
    if (el.dataset.change !== 'seat') return;
    act(() => G.Fleet.setSeat(G.state, Number(el.dataset.uid), Number(el.dataset.i), el.value || null));
  });

  document.addEventListener('click', ev => {
    const s = G.state;
    // 外海の小さな地図をクリックすると、そこへ向かう
    const mini = ev.target.closest('#minimap svg');
    if (mini && s.sea && !s.encounter) {
      const p = svgPoint(mini, ev);
      const townEl = ev.target.closest('.town');
      const port = townEl ? townEl.dataset.to
        : s.discovered.find(id => Math.hypot(D.towns[id].x - p.x, D.towns[id].y - p.y) <= R.portRadius);
      G.Sea.setTarget(s, p.x, p.y, port);
      return renderTown(s);
    }
    const b = ev.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const a = b.dataset.act, g = b.dataset.g, uid = Number(b.dataset.uid);
    const F = G.Fleet, C = G.Combat;
    switch (a) {
      case 'tab':
        // 酒場と仲間は一枚絵の場面で開く
        if (b.dataset.tab === 'tavern' || b.dataset.tab === 'crew') G.Scene.enter(b.dataset.tab);
        else tab = b.dataset.tab;
        notice = '';
        break;
      case 'step': {
        const kind = b.dataset.kind, other = kind === 'give' ? 'take' : 'give';
        const limit = kind === 'give' ? s.cargo[g] : s.towns[s.townId].stock[g];
        basket[kind][g] = Math.max(0, Math.min(limit, (basket[kind][g] || 0) + Number(b.dataset.d)));
        basket[other][g] = 0;
        break;
      }
      case 'all':
        if (b.dataset.kind === 'give') { basket.give[g] = s.cargo[g]; basket.take[g] = 0; }
        else { basket.take[g] = maxTake(s, g); basket.give[g] = 0; }
        break;
      case 'pick': case 'unpick': {
        const kind = b.dataset.kind, other = kind === 'give' ? 'take' : 'give';
        const limit = kind === 'give' ? s.cargo[g] : s.towns[s.townId].stock[g];
        basket[kind][g] = a === 'unpick' ? 0 : Math.min(limit, (basket[kind][g] || 0) + 1);
        basket[other][g] = 0;
        notice = '';
        break;
      }
      case 'tcat': tradeCat = b.dataset.c; break;
      case 'tsort': tradeSort = b.dataset.k; break;
      case 'food-balance': basket = E().balanceFood(s, s.townId, basket.give, basket.take); break;
      case 'clear': basket = { give: {}, take: {} }; notice = ''; break;
      case 'trade': return act(() => E().trade(s, s.townId, basket.give, basket.take));
      case 'learn': return act(() => G.Knowledge.learn(s, b.dataset.k));
      case 'teach': return act(() => G.Knowledge.teach(s, b.dataset.k));
      case 'go': tab = 'trade'; return act(() => G.Travel.go(s, b.dataset.to));
      case 'map-go':
        if (s.sea) return;
        // 地図は描き直さない（描き直すとダブルクリックが届かなくなる）
        tab = b.dataset.to === s.townId ? 'trade' : 'travel';
        notice = '';
        return renderTown(s);
      case 'wait': return act(() => G.Travel.wait(s));
      case 'set-sail': tab = 'trade'; return act(() => G.Sea.setSail(s));
      case 'enter': return act(() => G.Sea.enter(s, b.dataset.to));
      case 'sail-to': G.Sea.setTarget(s, 0, 0, b.dataset.to); return renderTown(s);
      case 'stop': G.Sea.stop(s); return renderTown(s);
      case 'timescale': G.SeaView.timeScale = Number(b.dataset.n); break;
      case 'bspeed': G.BattleView.speed = Number(b.dataset.n); return renderTown(s);
      case 'dock': return act(() => F.dock(s, uid));
      case 'board': return act(() => F.board(s, uid));
      case 'order': return act(() => F.order(s, b.dataset.type));
      case 'dstep': case 'dmax': case 'dzero': {
        const o = s.orders.find(x => x.uid === uid), key = uid + ':' + g;
        const v = a === 'dmax' ? deliverMax(s, o, g) : a === 'dzero' ? 0 : deliverAmount(s, o, g) + Number(b.dataset.d);
        deliverPick[key] = Math.max(0, Math.min(deliverMax(s, o, g), v));
        break;
      }
      case 'deliver': {
        const o = s.orders.find(x => x.uid === uid), amounts = {};
        for (const g2 in F.remaining(o)) amounts[g2] = deliverAmount(s, o, g2);
        deliverPick = {};
        return act(() => F.deliver(s, uid, amounts));
      }
      case 'fund': return act(() => G.Civ.fund(s));
      case 'event-next': s.pendingEvents.shift(); G.save(s); break;
      case 'fight': return startBattle(s);
      case 'flee':
        if (C.flee(s)) { notice = '逃げきった。'; G.save(s); break; }
        return startBattle(s);
      case 'new':
        if (!confirm('いまの旅を捨てて、最初からやり直しますか？')) return;
        G.battle = null;
        G.state = G.newGame(); tab = 'trade'; return act(() => null);
    }
    UI.render();
  });
})();
