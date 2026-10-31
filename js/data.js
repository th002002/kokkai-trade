// ゲームの中身（数値・村・品物・知識・船・人物・敵・地理）はすべてここに置く。
// 新しい村や品物、知識、船、移動手段を足すときは、基本的にこのファイルだけを編集すればよい。
// 人物ごとの会話やイベントの文章は stories.js、緯度経度から地図を組み立てるのは geo.js。
window.Game = window.Game || {};

Game.DATA = {
  version: 7,

  // 地理。座標はすべて [経度, 緯度]。geo.js が地図の点（x, y）に直し、D.map を作る。
  //   kx, ky: 経度・緯度1度あたりの地図の点（1点はおよそ1.1km）
  //   seas: 海の輪郭。islands: 海の中の島（c と r で楕円、または pts）
  //   waterways: 舟で通れる細い水路。river: true は川で、pts は河口から上流へ並べる（遡ると遅く、下ると速い）。width は川幅（地図の点）
  //   labels: 地図に書く海や川の名前
  geo: {
    lon0: 22, lon1: 46, lat0: 51, lat1: 39.3, kx: 72, ky: 100,
    seas: [
      { name: '黒い海', pts: [
        [29.10, 41.23], [28.95, 41.27], [28.60, 41.33], [28.25, 41.45], [28.05, 41.62], [27.98, 41.88], [28.03, 41.98], [27.85, 42.17],
        [27.76, 42.27], [27.72, 42.40], [27.62, 42.42], [27.50, 42.48], [27.47, 42.52], [27.64, 42.57], [27.73, 42.66], [27.90, 42.70],
        [27.88, 42.85], [27.90, 43.05], [27.86, 43.17], [27.95, 43.21], [28.10, 43.38], [28.20, 43.41], [28.47, 43.37], [28.60, 43.54],
        [28.58, 43.82], [28.65, 44.17], [28.70, 44.33], [28.85, 44.50], [29.00, 44.70], [29.30, 44.80], [29.62, 44.85], [29.68, 45.05],
        [29.68, 45.16], [29.75, 45.33], [29.70, 45.50], [29.90, 45.75], [30.20, 45.95], [30.47, 46.08], [30.70, 46.35], [30.75, 46.48],
        [31.10, 46.60], [31.50, 46.60], [31.62, 46.52], [31.90, 46.42], [31.55, 46.28], [31.90, 46.12], [32.30, 46.10], [32.80, 46.08],
        [33.20, 46.13], [33.60, 46.15], [33.45, 45.95], [33.10, 45.90], [32.70, 45.85], [32.50, 45.65], [32.50, 45.38], [32.75, 45.35],
        [33.10, 45.30], [33.37, 45.19], [33.55, 45.10], [33.60, 44.85], [33.52, 44.62], [33.40, 44.55], [33.73, 44.39], [34.17, 44.49],
        [34.41, 44.67], [34.97, 44.84], [35.38, 45.03], [35.80, 45.00], [36.20, 45.05], [36.42, 45.10], [36.65, 45.12], [37.00, 44.95],
        [37.32, 44.89], [37.77, 44.70], [38.07, 44.56], [38.60, 44.35], [39.07, 44.10], [39.73, 43.58], [39.92, 43.43], [40.27, 43.28],
        [40.34, 43.16], [41.00, 43.00], [41.47, 42.71], [41.62, 42.40], [41.67, 42.15], [41.70, 41.90], [41.63, 41.64], [41.43, 41.39],
        [40.90, 41.20], [40.52, 41.03], [39.72, 41.00], [39.10, 40.97], [38.39, 40.92], [37.88, 40.98], [37.28, 41.13], [36.95, 41.35],
        [36.60, 41.37], [36.33, 41.29], [36.10, 41.55], [35.95, 41.73], [35.50, 41.68], [35.20, 41.80], [35.15, 42.02], [34.95, 42.10],
        [34.60, 41.95], [34.00, 41.98], [33.30, 41.95], [32.70, 41.83], [32.39, 41.75], [32.20, 41.65], [31.79, 41.46], [31.42, 41.28],
        [31.12, 41.09], [30.65, 41.12], [30.15, 41.20], [29.61, 41.18], [29.15, 41.21],
      ] },
      { name: '浅い内海', pts: [
        [36.62, 45.45], [36.20, 45.47], [35.80, 45.45], [35.45, 45.33], [35.55, 45.50], [35.25, 45.80], [34.95, 46.05], [34.82, 46.17],
        [35.30, 46.35], [35.90, 46.60], [36.75, 46.65], [37.50, 47.05], [38.20, 47.10], [38.90, 47.20], [39.25, 47.20], [38.80, 46.98],
        [38.30, 46.75], [38.10, 46.60], [38.10, 46.20], [37.85, 45.95], [37.60, 45.65], [37.40, 45.35], [37.00, 45.38], [36.80, 45.45],
      ] },
      { name: '小さな内海', pts: [
        [29.02, 41.02], [28.60, 40.97], [28.25, 41.07], [27.95, 41.00], [27.50, 40.97], [27.30, 40.70], [27.10, 40.62], [26.80, 40.48],
        [26.67, 40.42], [26.69, 40.34], [27.00, 40.39], [27.30, 40.40], [27.50, 40.35], [27.70, 40.40], [27.75, 40.52], [27.95, 40.47],
        [27.98, 40.36], [28.40, 40.38], [28.88, 40.38], [29.05, 40.42], [28.95, 40.55], [29.27, 40.66], [29.92, 40.72], [29.90, 40.77],
        [29.40, 40.80], [29.25, 40.85], [29.10, 40.92],
      ] },
      { name: '南の多島海', pts: [
        [26.20, 39.98], [26.10, 39.75], [26.07, 39.48], [26.50, 39.52], [26.90, 39.58], [26.95, 39.30], [23.30, 39.30], [23.10, 39.60],
        [22.80, 39.90], [22.60, 40.10], [22.60, 40.30], [22.80, 40.55], [22.94, 40.60], [23.05, 40.35], [23.35, 40.15], [23.70, 39.95],
        [23.55, 40.20], [23.45, 40.25], [23.70, 40.20], [23.98, 39.92], [23.95, 40.25], [24.05, 40.30], [24.40, 40.15], [24.15, 40.40],
        [23.85, 40.55], [23.80, 40.75], [24.20, 40.80], [24.40, 40.93], [24.80, 40.85], [25.20, 40.95], [25.60, 40.88], [25.88, 40.85],
        [26.03, 40.73], [26.40, 40.62], [26.80, 40.62], [26.65, 40.50], [26.35, 40.38], [26.25, 40.20], [26.18, 40.05],
      ] },
    ],
    islands: [
      { name: '金の島', c: [24.70, 40.68], r: [0.16, 0.11] },
      { name: '風の島', c: [25.55, 40.47], r: [0.12, 0.07] },
      { name: '羊の島', c: [25.85, 40.17], r: [0.14, 0.06] },
      { name: '火の島', pts: [[25.05, 39.95], [25.20, 40.00], [25.38, 39.98], [25.45, 39.88], [25.35, 39.78], [25.20, 39.82], [25.10, 39.85]] },
      { name: '小島', c: [26.03, 39.82], r: [0.05, 0.03] },
      { name: '大理石の島', c: [27.58, 40.62], r: [0.09, 0.04] },
    ],
    waterways: [
      { name: '北の海峡', width: 6, pts: [[29.13, 41.26], [29.07, 41.15], [29.05, 41.08], [29.00, 41.00], [28.98, 40.95]] },
      { name: '南の海峡', width: 8, pts: [[26.72, 40.44], [26.55, 40.30], [26.40, 40.15], [26.30, 40.08], [26.10, 40.02]] },
      { name: '東の海峡', width: 12, pts: [[36.52, 45.05], [36.50, 45.20], [36.55, 45.32], [36.60, 45.42], [36.65, 45.55]] },
      { name: 'ドナウ川', river: true, width: 7, pts: [[29.78, 45.16], [29.20, 45.17], [28.80, 45.18], [28.05, 45.43], [27.97, 45.27], [27.90, 44.70], [28.03, 44.34], [27.27, 44.12], [25.95, 43.85], [25.35, 43.62], [24.90, 43.70], [24.00, 43.75], [22.87, 44.00], [22.50, 44.50]] },
      { name: 'ドニエストル川', river: true, width: 6, pts: [[30.55, 46.00], [30.35, 46.20], [30.05, 46.38], [29.63, 46.84], [29.17, 47.27], [28.30, 48.15], [27.80, 48.45]] },
      { name: '大河の入り江', river: true, width: 10, pts: [[31.45, 46.55], [31.75, 46.58], [32.00, 46.60]] },
      { name: 'ドニエプル川', river: true, width: 7, pts: [[32.00, 46.60], [32.62, 46.63], [33.37, 46.75], [34.10, 47.50], [35.10, 47.85], [35.00, 48.45], [34.40, 48.80], [33.40, 49.07], [32.06, 49.44], [31.30, 49.80], [30.78, 50.12], [30.52, 50.45]] },
      { name: '南ブグ川', river: true, width: 5, pts: [[32.00, 46.60], [31.98, 46.97], [31.50, 47.40], [31.33, 47.57], [30.85, 48.05]] },
      { name: 'ドン川', river: true, width: 6, pts: [[39.10, 47.12], [39.25, 47.20], [39.70, 47.23], [40.30, 47.45], [41.00, 47.60], [42.10, 47.65], [42.90, 48.20], [43.50, 48.70], [43.30, 49.40]] },
      { name: 'クバン川', river: true, width: 5, pts: [[37.33, 45.40], [37.50, 45.25], [38.10, 45.20], [38.98, 45.03], [39.60, 45.10], [40.30, 45.10], [41.10, 45.00]] },
      { name: 'リオニ川', river: true, width: 5, pts: [[41.58, 42.15], [41.75, 42.17], [42.20, 42.20], [42.70, 42.27]] },
    ],
    labels: [
      { text: '黒 い 海', at: [34.0, 43.4], size: 44 },
      { text: '浅い内海', at: [36.9, 46.3], size: 22 },
      { text: '小さな内海', at: [28.3, 40.72], size: 14 },
      { text: '南の多島海', at: [24.6, 39.55], size: 24 },
      { text: 'ドナウ川', at: [25.6, 44.05], size: 16, river: true },
      { text: 'ドニエプル川', at: [34.0, 48.25], size: 16, river: true },
      { text: 'ドン川', at: [41.4, 47.95], size: 16, river: true },
    ],
  },

  // 時代。村の時代は知っている知識の opensEra の一番大きいもの（なければ旧石器）。
  // 品物・船の era はその時代になると使える・造れる。coinEra 以上の村では金貨で売り買いできる。
  eras: [
    { name: '旧石器', note: '狩りと採集の暮らし。物々交換' },
    { name: '新石器', note: '畑と家畜の暮らし。食べ物が貨幣のかわり' },
    { name: '青銅器', note: '金貨が使える' },
    { name: '鉄器',   note: '金貨が使える' },
    { name: '鋼',     note: '金貨が使える' },
    { name: '銃',     note: '金貨が使える' },
    { name: '大航海', note: '金貨が使える' },
  ],
  // 町の大きさ。人口が at を超えるとその大きさになる。大きいほど品物を多く作り、飾り物を欲しがり、人が集まる。
  sizes: [
    { name: '集落',   at: 0 },
    { name: '村',     at: 150 },
    { name: '町',     at: 600 },
    { name: '市街',   at: 2000 },
    { name: '都市',   at: 5000 },
    { name: '大都市', at: 12000 },
  ],

  // 品物の種類（交換画面の絞り込み）
  goodCats: { food: '食料', material: '素材', tool: '道具', cloth: '布と革', ware: '器', jewel: '飾り', other: '薬・香・馬' },

  // 品物。base は「ふつうの価値」（金貨の村では金貨の枚数）。村ごとの事情でここから上下する。
  //   era: 村がこの品物を使う（受け取る）ようになる時代。作っている村なら時代に関係なく扱う
  //   lux: 飾り物。大きな町ほど欲しがる
  goods: {
    food:       { name: '保存食',     icon: '🍖', base: 4,  era: 1, cat: 'food' },
    grain:      { name: '麦',         icon: '🌾', base: 3,  era: 2, cat: 'food' },
    fish:       { name: '干し魚',     icon: '🐟', base: 4,  era: 1, cat: 'food' },
    nuts:       { name: '木の実',     icon: '🌰', base: 3,  era: 1, cat: 'food' },
    honey:      { name: '蜂蜜',       icon: '🍯', base: 9,  era: 1, cat: 'food' },
    cheese:     { name: 'チーズ',     icon: '🧀', base: 8,  era: 2, cat: 'food' },
    wine:       { name: 'ぶどう酒',   icon: '🍷', base: 12, era: 2, cat: 'food' },
    oil:        { name: 'オリーブ油', icon: '🫒', base: 14, era: 2, cat: 'food' },
    wood:       { name: '木材',       icon: '🪵', base: 3,  era: 1, cat: 'material' },
    tar:        { name: '松脂',       icon: '🌲', base: 5,  era: 1, cat: 'material' },
    salt:       { name: '塩',         icon: '🧂', base: 6,  era: 1, cat: 'material' },
    flint:      { name: '燧石',       icon: '🪨', base: 7,  era: 1, cat: 'material' },
    obsidian:   { name: '黒曜石',     icon: '⬛', base: 16, era: 1, cat: 'material' },
    hide:       { name: '生皮',       icon: '🦌', base: 5,  era: 1, cat: 'material' },
    flax:       { name: '亜麻',       icon: '🌿', base: 5,  era: 2, cat: 'material' },
    wool:       { name: '羊毛',       icon: '🐑', base: 6,  era: 2, cat: 'material' },
    copper:     { name: '銅',         icon: '🟠', base: 26, era: 2, cat: 'material' },
    tin:        { name: '錫',         icon: '⚪', base: 30, era: 3, cat: 'material' },
    iron:       { name: '鉄',         icon: '⚙️', base: 34, era: 4, cat: 'material' },
    blade:      { name: '石刃',       icon: '🔪', base: 9,  era: 1, cat: 'tool' },
    rope:       { name: '縄',         icon: '➰', base: 4,  era: 1, cat: 'tool' },
    net:        { name: '漁網',       icon: '🕸️', base: 8,  era: 1, cat: 'tool' },
    axe:        { name: '磨製石斧',   icon: '🪓', base: 12, era: 2, cat: 'tool' },
    bronzetool: { name: '青銅の道具', icon: '🔨', base: 40, era: 3, cat: 'tool' },
    weapon:     { name: '青銅の剣',   icon: '⚔️', base: 70, era: 3, cat: 'tool' },
    irontool:   { name: '鉄の道具',   icon: '⚒️', base: 50, era: 4, cat: 'tool' },
    fur:        { name: '毛皮',       icon: '🦊', base: 10, era: 1, cat: 'cloth' },
    leather:    { name: '革',         icon: '👞', base: 12, era: 1, cat: 'cloth' },
    linen:      { name: '亜麻布',     icon: '🧵', base: 13, era: 2, cat: 'cloth' },
    woolcloth:  { name: '毛織物',     icon: '🧶', base: 16, era: 2, cat: 'cloth' },
    purple:     { name: '紫の染め布', icon: '🟣', base: 60, era: 3, cat: 'cloth', lux: true },
    basket:     { name: '籠',         icon: '🧺', base: 4,  era: 1, cat: 'ware' },
    pottery:    { name: '土器',       icon: '🏺', base: 9,  era: 2, cat: 'ware' },
    painted:    { name: '彩文土器',   icon: '🎨', base: 22, era: 2, cat: 'ware', lux: true },
    bronzeware: { name: '青銅の器',   icon: '🥣', base: 45, era: 3, cat: 'ware', lux: true },
    shell:      { name: '貝飾り',     icon: '🐚', base: 18, era: 1, cat: 'jewel', lux: true },
    beads:      { name: '石のビーズ', icon: '📿', base: 12, era: 1, cat: 'jewel', lux: true },
    amber:      { name: '琥珀',       icon: '🟡', base: 24, era: 1, cat: 'jewel', lux: true },
    gold:       { name: '金飾り',     icon: '👑', base: 45, era: 2, cat: 'jewel', lux: true },
    silver:     { name: '銀',         icon: '🥈', base: 35, era: 3, cat: 'jewel', lux: true },
    herbs:      { name: '薬草',       icon: '🌱', base: 8,  era: 1, cat: 'other' },
    incense:    { name: '乳香',       icon: '💨', base: 40, era: 3, cat: 'other', lux: true },
    horse:      { name: '馬',         icon: '🐎', base: 50, era: 2, cat: 'other' },
  },

  // 知識。effects は「この知識を持つ村」の品物の在り方を変える。
  //   target: 村が普段ためておく在庫量への加算（増えるほど安くなる）
  //   mult:   その品物をどれだけ大事にするかの倍率（大きいほど高く買う）
  //   opensEra: この知識を持つ村はその時代になる
  //   cap:    この知識で村が養える人の増え方（書かなければ rules.capPerKnowledge）
  //   invent: どの村もはじめは知らない知識。研究者のいる村が、決まった大きさ（sizes の番号）に育つと編み出すことがある
  // 教えた知識の効果は rules.knowledgeRamp 季節かけて少しずつ表れる。
  knowledge: {
    tanning: {
      name: '皮なめし', learnCost: 40, teachReward: 60, requires: [],
      desc: '獣の皮を樹皮の汁で処理し、腐らない柔らかな革にする技。生皮を革に変えるので、生皮がより求められる。',
      effects: { leather: { target: 10 }, hide: { mult: 1.3 } },
    },
    preserving: {
      name: '保存食加工', learnCost: 30, teachReward: 60, requires: [],
      desc: '塩で肉や魚を漬け、冬を越せる食べ物にする技。保存食を作れるようになり、そのぶん塩と魚を欲しがる。',
      effects: { food: { target: 15 }, salt: { mult: 1.25 }, fish: { mult: 1.1 } },
    },
    flintwork: {
      name: '石刃づくり', learnCost: 30, teachReward: 50, requires: [],
      desc: '燧石を打ち欠いて、鋭い刃や鏃を作る技。石刃を作るようになり、燧石を欲しがる。',
      effects: { blade: { target: 10 }, flint: { mult: 1.2 } },
    },
    netting: {
      name: '網漁', learnCost: 30, teachReward: 50, requires: [],
      desc: '縄を編んで網にし、魚の群れをまとめてすくう技。干し魚と漁網を作るようになり、縄を欲しがる。',
      effects: { fish: { target: 12 }, net: { target: 6 }, rope: { mult: 1.2 } },
    },
    farming: {
      name: '麦づくり', opensEra: 2, cap: 0.6, learnCost: 50, teachReward: 90, requires: [],
      desc: '南から伝わった、麦を播いて刈る暮らし。村は新石器の時代に入り、ずっと多くの人を養える。畑を拓く石斧が要る。',
      effects: { grain: { target: 25 }, food: { target: 5 }, axe: { mult: 1.2 }, flint: { mult: 1.1 } },
    },
    herding: {
      name: '牧畜', opensEra: 2, cap: 0.25, learnCost: 45, teachReward: 75, requires: [],
      desc: '羊や山羊を飼いならし、乳と毛をとる暮らし。村は新石器の時代に入る。チーズと羊毛がとれるようになる。',
      effects: { cheese: { target: 10 }, wool: { target: 10 }, hide: { target: 5 } },
    },
    beekeeping: {
      name: '蜜採り', learnCost: 35, teachReward: 55, requires: [],
      desc: '木のうろの蜂の巣を煙でいぶして蜜をとる技。蜂蜜がとれるようになる。',
      effects: { honey: { target: 10 } },
    },
    pottery: {
      name: '土器焼き', learnCost: 45, teachReward: 70, requires: [],
      desc: '粘土をこねて焼き、壺や鉢を作る技。土器を作るようになり、焚き木と蓄える食べ物を欲しがる。',
      effects: { pottery: { target: 12 }, wood: { mult: 1.15 }, food: { mult: 1.1 } },
    },
    painting: {
      name: '彩文土器', learnCost: 55, teachReward: 80, requires: ['pottery'],
      desc: '赤や黒の土で渦巻きを描いた美しい土器。遠くの村まで欲しがる飾りの器を作るようになる。',
      effects: { painted: { target: 5 }, pottery: { mult: 1.1 } },
    },
    weaving: {
      name: '機織り', learnCost: 55, teachReward: 80, requires: [],
      desc: '亜麻や羊毛から糸を紡ぎ、布を織る技。亜麻布と毛織物を作るようになり、亜麻と羊毛を欲しがる。',
      effects: { linen: { target: 10 }, woolcloth: { target: 4 }, flax: { mult: 1.3 }, wool: { mult: 1.2 }, fur: { mult: 0.9 } },
    },
    viticulture: {
      name: 'ぶどう作り', learnCost: 50, teachReward: 80, requires: [],
      desc: '山ぶどうを育て、壺の中で寝かせて酒にする技。ぶどう酒を作るようになり、壺を欲しがる。',
      effects: { wine: { target: 10 }, pottery: { mult: 1.2 } },
    },
    olive: {
      name: 'オリーブ作り', learnCost: 50, teachReward: 80, requires: ['farming'],
      desc: '南の島から伝わった木を育て、実を搾って油をとる技。オリーブ油を作るようになる。',
      effects: { oil: { target: 10 }, pottery: { mult: 1.1 } },
    },
    shellcraft: {
      name: '貝細工', learnCost: 50, teachReward: 75, requires: [],
      desc: '大きな貝や石を削り、腕輪や首飾りにする技。貝飾りと石のビーズを作るようになり、刃物の燧石を欲しがる。',
      effects: { shell: { target: 6 }, beads: { target: 6 }, flint: { mult: 1.15 } },
    },
    horseriding: {
      name: '馬の飼いならし', learnCost: 70, teachReward: 100, requires: ['herding'],
      desc: '草原の野生の馬を捕らえ、慣らして育てる技。馬を育てるようになり、飼い葉の麦を欲しがる。',
      effects: { horse: { target: 4 }, grain: { mult: 1.15 } },
    },
    sailing: {
      name: '帆走', learnCost: 70, teachReward: 100, requires: ['weaving'],
      invent: { town: 'bosporus', size: 3 },
      desc: '亜麻布の帆に風を受けて舟を走らせる技。帆舟を造れるようになり、布と縄をますます欲しがる。',
      effects: { linen: { mult: 1.25 }, rope: { mult: 1.2 } },
    },
    copper: {
      name: '銅の精錬', learnCost: 90, teachReward: 130, requires: ['pottery'],
      invent: { town: 'colchis', size: 2 },
      desc: '緑の石を炉で焼き、赤い金属を取り出す技。銅を作るようになり、炉にくべる木をたくさん使う。',
      effects: { copper: { target: 6 }, wood: { mult: 1.3 } },
    },
    goldwork: {
      name: '金細工', learnCost: 120, teachReward: 160, requires: ['copper'],
      invent: { town: 'varna', size: 3 },
      desc: '川の砂から金を集め、打ち延ばして飾りにする技。金飾りを作るようになり、貝飾りへの関心は薄れる。',
      effects: { gold: { target: 3 }, shell: { mult: 0.9 } },
    },
    bronze: {
      name: '青銅', opensEra: 3, cap: 0.3, learnCost: 150, teachReward: 200, requires: ['copper'],
      invent: { town: 'kuban', size: 3 },
      desc: '銅に錫を混ぜて、固く鋭い金属にする技。村は青銅器の時代に入り、金貨で売り買いするようになる。錫を強く欲しがる。',
      effects: { bronzetool: { target: 6 }, weapon: { target: 2 }, bronzeware: { target: 3 }, tin: { mult: 1.8 }, copper: { mult: 1.3 } },
    },
    ironwork: {
      name: '製鉄', opensEra: 4, cap: 0.3, learnCost: 200, teachReward: 260, requires: ['bronze'],
      invent: { town: 'troy', size: 4 },
      desc: '赤い砂や石を炭とともに焼き、鉄を取り出す技。村は鉄器の時代に入る。たくさんの炭がいる。',
      effects: { iron: { target: 5 }, irontool: { target: 4 }, wood: { mult: 1.3 }, tin: { mult: 0.8 } },
    },
    steel: {
      name: '鋼', opensEra: 5, learnCost: 260, teachReward: 320, requires: ['ironwork'],
      invent: { town: 'troy', size: 5 },
      desc: '鉄を何度も焼いて打ち、しなやかで折れない鋼にする技。村は鋼の時代に入る。',
      effects: { irontool: { target: 4 }, iron: { mult: 1.3 } },
    },
    gunpowder: {
      name: '火薬', opensEra: 6, learnCost: 320, teachReward: 400, requires: ['steel'],
      invent: { town: 'bosporus', size: 5 },
      desc: '硝石と硫黄と炭を混ぜると、雷のように燃える粉になる。村は銃の時代に入る。',
      effects: { salt: { mult: 1.3 }, wood: { mult: 1.1 } },
    },
    navigation: {
      name: '羅針盤と海図', opensEra: 7, learnCost: 400, teachReward: 500, requires: ['gunpowder', 'sailing'],
      invent: { town: 'bosporus', size: 6 },
      desc: '磁石の針と測った海岸線で、陸の見えない大洋を渡る技。村は大航海の時代に入る。',
      effects: { linen: { mult: 1.2 } },
    },
  },

  // 季節。mods は品物の価値への倍率。
  seasons: [
    { name: '春', mods: { food: 1.25, grain: 1.2, honey: 0.9 },             note: '冬を越えて食べ物が乏しい' },
    { name: '夏', mods: { honey: 0.85, fish: 0.9 },                         note: '海が穏やか' },
    { name: '秋', mods: { food: 0.85, grain: 0.8, wine: 0.85, nuts: 0.8 },  note: '実りの季節' },
    { name: '冬', mods: { fur: 1.3, honey: 1.2, woolcloth: 1.2, food: 1.1 }, note: '寒さで毛皮が求められる' },
  ],

  // 移動の種類。routes の mode と ships の mode を結びつける。陸路を足すときは land などを追加する。
  modes: {
    sea: { name: '海路' },
  },

  // 船室。仲間を座らせると、その人の適性（apt、1〜5）に応じて効果が出る。
  //   per: 適性1あたりの効果量。効果の中身は fleet.js の Fleet.bonus で計算する
  cabins: {
    captain: { name: '船長室', icon: '⚓', per: 0.03, desc: '船を率いる。座る人の適性1ごとに、この船の仲間の戦う力が3%上がる。船長がいないと船は出せない。' },
    lookout: { name: '見張り台', icon: '👁', per: 8,    desc: '遠くを見渡す。適性1ごとに見渡せる距離が伸び、水族に早く気づいて逃げやすくなる。' },
    oars:    { name: '漕ぎ座',   icon: '🚣', per: 0.04, desc: '舟を漕ぐ。適性1ごとに船団の速さが4%上がる。' },
    galley:  { name: '炊事場',   icon: '🔥', per: 0.06, desc: '食べ物を上手に分ける。適性1ごとに保存食の減りが6%少なくなる（最大半分）。' },
    hold:    { name: '荷物番',   icon: '📦', per: 3,    desc: '荷を上手に積む。適性1ごとに積める量が3増える。' },
    bow:     { name: '舳先',     icon: '🗡', per: 0.12, desc: '戦いの先頭に立つ。座る人は戦いで、適性1ごとに12%強く打てる。' },
    nursery: { name: '保育室',   icon: '🍼', per: 0.1,  desc: '子供たちが船で一緒に旅をする。座る人の適性1ごとに子供の育ちが10%早くなり、母親たちとの仲も季節ごとに深まる。' },
  },

  // 船。船団の積荷の上限は乗っている船の capacity の合計、速さは一番遅い船、強さは合計。
  //   crew: 動かすのに要る人数（水夫と仲間の合計）。足りないと船足が落ちる
  //   cabins: 船室の並び。最初は必ず船長室
  //   build: 造れる船の注文内容。credit は依頼時に払う恩、materials は届ける材料、seasons は完成までの季節数
  //   requires: 造る村が持っていなければならない知識
  //   era: 造る村に必要な時代、size: 造る村に必要な大きさ（sizes の番号）
  ships: {
    canoe: {
      name: '丸木舟', mode: 'sea', capacity: 20, speed: 1.0, strength: 1, crew: 1, era: 1,
      cabins: ['captain'],
      desc: '一本の木をくりぬいた舟。軽く扱いやすい。',
      build: { credit: 10, materials: { wood: 8 }, seasons: 1 },
    },
    hide: {
      name: '皮張り舟', mode: 'sea', capacity: 25, speed: 1.5, strength: 1, crew: 2, era: 1,
      cabins: ['captain', 'lookout'],
      desc: '木の骨組みに革を張った軽い舟。とても速い。',
      requires: ['tanning'],
      build: { credit: 20, materials: { wood: 6, leather: 10 }, seasons: 1 },
    },
    war: {
      name: '大丸木舟', mode: 'sea', capacity: 35, speed: 1.2, strength: 6, crew: 8, era: 1,
      cabins: ['captain', 'bow', 'bow', 'oars', 'oars', 'lookout'],
      desc: '巨木から削り出した大きな舟。舳先が高く、水族の舟を押しのける。',
      build: { credit: 60, materials: { wood: 30, tar: 6 }, seasons: 2 },
    },
    twin: {
      name: '双胴舟', mode: 'sea', capacity: 50, speed: 0.8, strength: 2, crew: 5, era: 2,
      cabins: ['captain', 'lookout', 'oars', 'galley', 'hold', 'nursery'],
      desc: '丸木舟を二つ並べて板で結んだ舟。遅いがたくさん積め、船室も多い。',
      build: { credit: 30, materials: { wood: 20, rope: 6 }, seasons: 2 },
    },
    sail: {
      name: '帆舟', mode: 'sea', capacity: 45, speed: 1.8, strength: 2, crew: 4, era: 2,
      cabins: ['captain', 'lookout', 'oars', 'hold'],
      desc: '亜麻布の帆を張った舟。風をつかめば、漕ぐよりずっと速い。',
      requires: ['sailing'],
      build: { credit: 50, materials: { wood: 20, linen: 12, rope: 6 }, seasons: 2 },
    },
    long: {
      name: '大交易船', mode: 'sea', capacity: 90, speed: 1.2, strength: 5, crew: 12, era: 3, size: 3,
      cabins: ['captain', 'lookout', 'oars', 'oars', 'galley', 'hold', 'hold', 'bow', 'nursery'],
      desc: '青銅の道具で板を削り合わせた大きな帆船。荷も人もたくさん乗る、大きな町でしか造れない船。',
      requires: ['sailing', 'bronze'],
      build: { credit: 100, materials: { wood: 40, linen: 10, bronzetool: 4 }, seasons: 3 },
    },
  },

  // 人物。仲間になる人・酒場の娘はすべてここに置き、村の recruits / tavern や start.party から id で呼ぶ。
  //   sex: 'f' 女性 / 'm' 男性、age: 年齢、str: 戦う強さ、apt: 船室ごとの適性（1〜5）
  //   likes: 贈ると特に喜ぶ品物
  //   look: 似顔絵の見た目。skin 肌、hair 髪の色、style 髪型（short/long/bun/braid/shaved/wild/pony/twin）、
  //         paint 顔の模様（none/stripes/dots/band）、cloth 服の色、beard ひげ、acc 飾り（none/feather/bone/beads/flower/earring）
  // 好感度のイベント（stories.js）は大人（18歳以上）だけに起きる。
  people: {
    you:  { name: 'あなた', sex: 'm', role: '商人', age: 28, str: 5, bio: '黒い海を渡り歩く若い商人。',
            apt: { captain: 3, lookout: 2, oars: 2, galley: 1, hold: 3, bow: 2, nursery: 1 }, likes: [],
            look: { skin: '#c99a6e', hair: '#2b1d14', style: 'short', paint: 'none', cloth: '#8a5a2b', beard: false, acc: 'beads' } },
    ul:   { name: 'ウル', sex: 'f', role: '漕ぎ手', age: 20, str: 4, bio: '日に焼けた快活な娘。どこまででも漕いでいける。',
            apt: { captain: 1, lookout: 3, oars: 5, galley: 1, hold: 2, bow: 3, nursery: 1 }, likes: ['honey', 'shell'],
            look: { skin: '#b07a50', hair: '#1a120c', style: 'pony', paint: 'stripes', cloth: '#5e6b3a', beard: false, acc: 'none' } },
    nagi: { name: 'ナギ', sex: 'f', role: '炊事番', age: 21, str: 2, bio: '浜の村の台所で育った娘。干し魚の扱いはだれにも負けず、口うるさいほど世話を焼く。',
            apt: { captain: 2, lookout: 1, oars: 1, galley: 5, hold: 4, bow: 1, nursery: 5 }, likes: ['salt', 'pottery'],
            look: { skin: '#d2a77c', hair: '#7a5030', style: 'bun', paint: 'dots', cloth: '#a0522d', beard: false, acc: 'bone' } },
    duru: { name: 'ドゥル', sex: 'f', role: '女戦士', age: 24, str: 8, bio: '槍を持たせれば男たちも敵わない大柄な女。口数は少ないが、甘いものに弱い。',
            apt: { captain: 2, lookout: 1, oars: 3, galley: 1, hold: 2, bow: 5, nursery: 1 }, likes: ['honey', 'copper'],
            look: { skin: '#8f5f3c', hair: '#2a2440', style: 'braid', paint: 'band', cloth: '#3f3a36', beard: false, acc: 'bone' } },
    mira: { name: 'ミラ', sex: 'f', role: '見張り', age: 18, str: 2, bio: '鷹の目をもつ娘。帆柱のてっぺんが好きで、きれいな物に目がない。',
            apt: { captain: 1, lookout: 5, oars: 2, galley: 2, hold: 1, bow: 1, nursery: 2 }, likes: ['shell', 'amber'],
            look: { img: 'img/people/mira.jpg', skin: '#c08a5e', hair: '#9a8466', eye: '#5a6a80', style: 'twin', paint: 'none', cloth: '#3c4a66', beard: false, acc: 'feather' } },
    saka: { name: 'サカ', sex: 'm', role: '老舟長', age: 61, str: 4, bio: '若いころ海峡まで漕いだという老人。風と潮をよく知る。',
            apt: { captain: 5, lookout: 3, oars: 2, galley: 2, hold: 3, bow: 2, nursery: 2 }, likes: ['honey', 'wine'],
            look: { skin: '#a8754e', hair: '#d8d8d8', style: 'long', paint: 'stripes', cloth: '#6b4423', beard: true, acc: 'beads' } },
    ama:  { name: 'アマ', sex: 'f', role: '漁師', age: 24, str: 4, bio: '網を打たせれば一番の漁師。からっとした性格で、だれとでもすぐ打ち解ける。',
            apt: { captain: 2, lookout: 3, oars: 4, galley: 3, hold: 2, bow: 2, nursery: 3 }, likes: ['salt', 'net'],
            look: { skin: '#c08a5c', hair: '#5a3a2a', style: 'long', paint: 'none', cloth: '#5a7d6a', beard: false, acc: 'beads' } },
    sena: { name: 'セナ', sex: 'f', role: '塩掘り', age: 23, str: 5, bio: '塩湖で荷を担いできた働き者。重い荷ほど燃える。',
            apt: { captain: 2, lookout: 2, oars: 3, galley: 2, hold: 5, bow: 2, nursery: 2 }, likes: ['food', 'cheese'],
            look: { skin: '#e0b994', hair: '#c89a5a', style: 'bun', paint: 'none', cloth: '#d8cbb3', beard: false, acc: 'earring' } },
    goru: { name: 'ゴラ', sex: 'f', role: '狩人', age: 22, str: 7, bio: '森の女狩人。弓も槍も使いこなし、獲物を追う目は鋭い。',
            apt: { captain: 2, lookout: 4, oars: 2, galley: 2, hold: 1, bow: 4, nursery: 2 }, likes: ['copper', 'obsidian'],
            look: { skin: '#9a6a44', hair: '#6a2a1e', style: 'wild', paint: 'dots', cloth: '#4b5a2e', beard: false, acc: 'feather' } },
    baru: { name: 'バルナ', sex: 'f', role: '川の戦士の頭', age: 24, str: 8, bio: '大河の戦士たちを率いる女頭。名の知れた者にしか従わない。',
            apt: { captain: 4, lookout: 2, oars: 3, galley: 1, hold: 2, bow: 5, nursery: 1 }, likes: ['copper', 'horse'],
            look: { skin: '#b5835a', hair: '#8a2a2a', style: 'braid', paint: 'band', cloth: '#7a2e22', beard: false, acc: 'bone' } },
    iri:  { name: 'イリ', sex: 'f', role: '舟乗り', age: 22, str: 5, bio: '海峡を行き来する舟乗り。どの舟でもすぐ乗りこなす、負けず嫌い。',
            apt: { captain: 3, lookout: 3, oars: 4, galley: 2, hold: 3, bow: 2, nursery: 2 }, likes: ['linen', 'gold'],
            look: { skin: '#a77650', hair: '#1e2a4a', style: 'short', paint: 'stripes', cloth: '#2f5e7a', beard: false, acc: 'earring' } },
    yuna: { name: 'ユナ', sex: 'f', role: '薬師', age: 23, str: 2, bio: '大集落の研究者たちのもとで薬草と星を学んだ娘。物静かだが好奇心は人一倍。',
            apt: { captain: 3, lookout: 3, oars: 1, galley: 4, hold: 3, bow: 1, nursery: 4 }, likes: ['herbs', 'honey'],
            look: { skin: '#e6c39e', hair: '#6a4a8a', style: 'long', paint: 'dots', cloth: '#7d6a9a', beard: false, acc: 'flower' } },
    tia:  { name: 'ティア', sex: 'f', role: '星読み', age: 21, str: 3, bio: '海峡の町で、星の位置から舟の進む先を読む娘。夜の海を怖がらない。',
            apt: { captain: 4, lookout: 5, oars: 2, galley: 1, hold: 2, bow: 1, nursery: 1 }, likes: ['gold', 'incense'],
            look: { skin: '#b98a62', hair: '#28305a', style: 'long', paint: 'none', cloth: '#2c3e6b', beard: false, acc: 'earring' } },
    kaya: { name: 'カヤ', sex: 'f', role: '銅打ち', age: 23, str: 6, bio: '炉の火を守る銅打ちの娘。腕は太く、笑うと子供のよう。',
            apt: { captain: 2, lookout: 1, oars: 3, galley: 3, hold: 4, bow: 4, nursery: 3 }, likes: ['wood', 'honey'],
            look: { skin: '#a46c45', hair: '#b0502a', style: 'pony', paint: 'band', cloth: '#8b4a2a', beard: false, acc: 'beads' } },

    // 酒場の娘たち。酒場で話したり、おごったり、贈り物をしたりして仲良くなると、仲間に誘える。
    vela: { name: 'ヴェラ', sex: 'f', role: '湾の酒場の娘', age: 22, str: 3, bio: 'ヴァルナの湾の酒場の娘。塩と金の噂話なら何でも知っている、おしゃべりで世話焼きな娘。',
            apt: { captain: 2, lookout: 3, oars: 2, galley: 4, hold: 3, bow: 1, nursery: 4 }, likes: ['amber', 'wine'],
            look: { skin: '#dcb08a', hair: '#a85a2a', style: 'long', paint: 'none', cloth: '#b0703a', beard: false, acc: 'flower' } },
    lina: { name: 'リナ', sex: 'f', role: '葦原の酒場の娘', age: 19, str: 2, bio: '葦原村の酒場の看板娘。笑い上戸で、旅の話をせがむ。',
            apt: { captain: 1, lookout: 3, oars: 2, galley: 4, hold: 3, bow: 1, nursery: 4 }, likes: ['shell', 'honey'],
            look: { skin: '#e2b994', hair: '#d07a3a', style: 'twin', paint: 'none', cloth: '#b5654a', beard: false, acc: 'flower' } },
    shio: { name: 'シオ', sex: 'f', role: '塩湖の酒場の娘', age: 24, str: 4, bio: '塩湖の酒場を一人で切り盛りする。きっぷがよく、酒にも強い。',
            apt: { captain: 3, lookout: 2, oars: 3, galley: 3, hold: 4, bow: 2, nursery: 3 }, likes: ['honey', 'linen'],
            look: { skin: '#d4a57a', hair: '#4a3a5a', style: 'bun', paint: 'none', cloth: '#e0d6c0', beard: false, acc: 'earring' } },
    mede: { name: 'メデ', sex: 'f', role: '森の酒場の娘', age: 23, str: 3, bio: '森の酒場で薬草酒を醸す。妖しく笑うが、根は面倒見がいい。',
            apt: { captain: 2, lookout: 2, oars: 1, galley: 5, hold: 2, bow: 2, nursery: 5 }, likes: ['salt', 'shell'],
            look: { skin: '#c99366', hair: '#3a2a4a', style: 'long', paint: 'dots', cloth: '#3e5a3a', beard: false, acc: 'flower' } },
    neri: { name: 'ネリ', sex: 'f', role: '川辺の酒場の娘', age: 20, str: 3, bio: '川辺の酒場で歌う娘。歌声を聞きに、遠くの村からも人が来る。',
            apt: { captain: 1, lookout: 3, oars: 4, galley: 2, hold: 2, bow: 2, nursery: 2 }, likes: ['salt', 'beads'],
            look: { skin: '#e8c8a4', hair: '#e0c070', style: 'braid', paint: 'none', cloth: '#5b7aa0', beard: false, acc: 'beads' } },
    zara: { name: 'ザラ', sex: 'f', role: '海峡の酒場の娘', age: 24, str: 4, bio: '海峡の酒場の女主人。南の言葉も話し、遠い国の話をよく知っている。',
            apt: { captain: 4, lookout: 2, oars: 2, galley: 3, hold: 3, bow: 2, nursery: 3 }, likes: ['fur', 'gold'],
            look: { skin: '#9e6c48', hair: '#1a1424', style: 'long', paint: 'band', cloth: '#9a2f4a', beard: false, acc: 'earring' } },
    kara: { name: 'カラ', sex: 'f', role: '崖の酒場の娘', age: 21, str: 4, bio: '崖の村の酒場の娘。無口だが目が良く、沖の舟をだれより早く見つける。',
            apt: { captain: 2, lookout: 5, oars: 3, galley: 2, hold: 1, bow: 3, nursery: 2 }, likes: ['food', 'linen'],
            look: { skin: '#c79a70', hair: '#7a3020', style: 'short', paint: 'stripes', cloth: '#6a5a4a', beard: false, acc: 'feather' } },
  },

  // 村。at は [経度, 緯度]（geo.js が x, y に直す）。川沿いの村は川をさかのぼって行く。
  //   pop: はじめの人口、land: 知識なしで養える人の数（知識を覚えるほど増える）
  //   goods: 知識を持つ前の素の状態 { 品物: [普段の在庫, 大事にする倍率] }（書いていない品物は、作らず・普通に扱う）
  //   hidden: true の村は、外海を漕いで近づくまで地図に載らない。
  //   shipyard: この村で造ってもらえる船（船の era・size・requires も満たす必要がある）
  //   recruits: この村の酒場で仲間にできる人。fame は必要な名声、cost は払う恩、size は村に必要な大きさ
  //   tavern: 酒場の名前と、酒場の娘（people の id）
  towns: {
    varna: {
      name: 'ヴァルナの湾の村', at: [27.92, 43.20], pop: 650, land: 900,
      desc: '湾の奥の豊かな村。近くの塩の泉で塩を煮つめ、麦を育て、緑の石から銅をとる。南の海の貝飾りや北の琥珀に目がない。',
      knowledge: ['farming', 'herding', 'pottery', 'copper'],
      shipyard: ['canoe', 'twin', 'long'],
      tavern: { name: '湾の酒場', girl: 'vela' },
      recruits: [{ id: 'ama', fame: 0, cost: 20 }],
      goods: { grain: [25, 1], salt: [22, 0.9], pottery: [14, 1], copper: [5, 1.1], fish: [12, 1], cheese: [6, 1],
               fur: [0, 1.3], shell: [0, 1.5], amber: [0, 1.4], wood: [6, 1.1], flint: [0, 1.2], obsidian: [0, 1.3] },
    },
    sozopol: {
      name: '岬の漁村', at: [27.70, 42.42], pop: 300, land: 300,
      desc: '南の岬に寄り添う漁村。背後の森から舟材と松脂をとる。塩と刃物の石が足りない。',
      knowledge: ['farming', 'preserving'],
      shipyard: ['canoe', 'war'],
      goods: { fish: [28, 0.9], food: [16, 1], wood: [22, 0.8], tar: [10, 0.9], grain: [8, 1], salt: [2, 1.3], flint: [0, 1.2], pottery: [0, 1.2] },
    },
    tomis: {
      name: '白い崖の村', at: [28.65, 44.17], pop: 180, land: 180,
      desc: '白い崖の上の小さな村。羊を飼い、燧石を掘る。土の人形を作る不思議な風習がある。',
      knowledge: ['farming', 'herding'],
      goods: { grain: [16, 1], cheese: [10, 1], wool: [8, 1], flint: [14, 0.9], beads: [3, 1], fish: [0, 1.2], salt: [3, 1.2] },
    },
    danube: {
      name: 'ドナウの葦原村', at: [28.80, 45.20],
      pop: 450, land: 500,
      desc: '大河の河口から少しさかのぼった葦原の村。麦を育て、川魚を塩に漬けて蓄え、葦の籠を編む。塩はいつも足りない。',
      knowledge: ['farming', 'preserving', 'pottery'],
      shipyard: ['canoe', 'twin'],
      tavern: { name: '葦の屋根の酒場', girl: 'lina' },
      goods: { food: [26, 1], fish: [30, 0.8], grain: [18, 1], wood: [14, 1], basket: [14, 0.8], pottery: [10, 1],
               salt: [2, 1.35], fur: [3, 1.25], tar: [0, 1.1] },
    },
    tyras: {
      name: '入り江の狩人村', at: [30.35, 46.20], pop: 120, land: 170, hidden: true,
      desc: '細長い入り江のほとりで、狩りと漁で暮らす人々。畑は知らない。森の木の実と獣の皮が豊か。',
      knowledge: [],
      goods: { fish: [25, 0.9], fur: [16, 0.9], nuts: [16, 0.8], hide: [12, 0.9], honey: [5, 1], salt: [0, 1.4], blade: [0, 1.3] },
    },
    dnieper: {
      name: 'ドニエプルの川辺村', at: [32.62, 46.65], pop: 140, land: 200, hidden: true,
      desc: '北の大河の岸、草原と森のあわいの村。獣も魚も多いが、塩を知らずに暮らしてきた。川舟づくりが得意。',
      knowledge: [],
      shipyard: ['canoe', 'hide'],
      tavern: { name: '川辺の歌い小屋', girl: 'neri' },
      recruits: [{ id: 'baru', fame: 20, cost: 50 }],
      goods: { fur: [28, 0.8], fish: [22, 0.9], wood: [35, 0.7], honey: [5, 0.9], hide: [14, 0.8], rope: [8, 1], salt: [0, 1.45] },
    },
    dereivka: {
      name: '早瀬の馬飼い村', at: [33.80, 48.95], pop: 220, land: 220, hidden: true,
      desc: '大河をずっとさかのぼった草原の村。野の馬を捕らえて飼いならす、ほかでは見ない暮らしをしている。',
      knowledge: ['herding', 'horseriding'],
      goods: { horse: [5, 0.9], hide: [16, 0.9], cheese: [10, 1], wool: [8, 1], grain: [0, 1.4], salt: [0, 1.3], pottery: [0, 1.2], blade: [0, 1.2] },
    },
    trypillia: {
      name: 'トリピリャの大集落', at: [30.78, 50.12], pop: 5200, land: 2400, hidden: true,
      desc: '大河の上流、森の縁に数千の家が輪になって並ぶ大集落。渦巻き模様の彩文土器で知られ、北の琥珀も集まる。塩と貝飾りを強く欲しがる。',
      knowledge: ['farming', 'herding', 'pottery', 'painting', 'weaving'],
      recruits: [{ id: 'yuna', fame: 15, cost: 40 }],
      goods: { grain: [60, 0.9], painted: [14, 1], pottery: [26, 0.9], linen: [10, 1], cheese: [14, 1], wool: [8, 1], amber: [6, 1],
               salt: [0, 1.5], shell: [0, 1.5], copper: [0, 1.4], fish: [0, 1.2] },
    },
    crimea: {
      name: '塩湖の村', at: [33.40, 45.15], pop: 90, land: 120, hidden: true,
      desc: '半島の西、干上がる塩湖のほとりの村。塩はいくらでもとれ、良い燧石も出るが、冬の食べ物に困っている。木の育たない草原の村。',
      knowledge: ['flintwork'],
      tavern: { name: '塩の酒場', girl: 'shio' },
      recruits: [{ id: 'sena', fame: 5, cost: 25 }],
      goods: { salt: [50, 0.8], flint: [16, 0.8], blade: [6, 1], food: [6, 1.2], wood: [2, 1.6], fur: [4, 1.1] },
    },
    kerch: {
      name: '東の海峡の漁村', at: [36.47, 45.33], pop: 160, land: 170, hidden: true,
      desc: '浅い内海への狭い海峡にある漁村。魚の群れが季節ごとに海峡を抜け、網ですくい放題。木はほとんど生えない。',
      knowledge: ['preserving', 'netting'],
      shipyard: ['canoe', 'hide'],
      goods: { fish: [40, 0.8], salt: [16, 0.9], food: [18, 1], net: [6, 1], wood: [2, 1.5], fur: [0, 1.2] },
    },
    tanais: {
      name: 'ドン河口の村', at: [39.30, 47.20], pop: 200, land: 220, hidden: true,
      desc: '浅い内海の奥、大河ドンの河口の村。大きなチョウザメがとれ、草原の牧人が毛皮と家畜を持ってくる。',
      knowledge: ['herding'],
      goods: { fish: [26, 0.8], fur: [20, 0.9], cheese: [10, 1], horse: [2, 1.1], hide: [12, 0.9], pottery: [0, 1.3], salt: [3, 1.2] },
    },
    kuban: {
      name: 'クバンの川辺村', at: [38.98, 45.03], pop: 500, land: 300, hidden: true,
      desc: '山すそから流れ出るクバン川をさかのぼった村。山で銅と金と銀を掘り、王のような長が豪華な墓に眠る。',
      knowledge: ['farming', 'herding', 'pottery', 'copper', 'goldwork'],
      goods: { grain: [20, 1], copper: [6, 1], gold: [4, 1], silver: [3, 1], horse: [3, 1.1], pottery: [8, 1],
               linen: [0, 1.3], salt: [0, 1.3], shell: [0, 1.4] },
    },
    colchis: {
      name: 'コルキスの森村', at: [41.72, 42.16], pop: 260, land: 300, hidden: true,
      desc: '東の果て、リオニ川の河口の深い森の村。獣の皮をなめし、木のうろから蜜をとり、山ぶどうで酒を造る。山には緑の石がある。',
      knowledge: ['tanning', 'beekeeping', 'viticulture'],
      shipyard: ['canoe', 'war', 'long'],
      tavern: { name: '薬草酒の小屋', girl: 'mede' },
      recruits: [{ id: 'goru', fame: 10, cost: 40 }, { id: 'kaya', fame: 20, cost: 50, size: 3 }],
      goods: { fur: [45, 0.7], wood: [50, 0.6], honey: [12, 0.9], wine: [10, 1], herbs: [14, 0.9], tar: [12, 0.8], food: [10, 1.1], salt: [4, 1.3] },
    },
    trapezus: {
      name: '東の入り江の村', at: [39.72, 41.02], pop: 110, land: 160, hidden: true,
      desc: '南の山が海に迫る入り江の村。木の実の林と、山奥の銀の鉱脈で知られる。',
      knowledge: [],
      goods: { nuts: [30, 0.7], wood: [30, 0.7], silver: [2, 1], fish: [14, 1], salt: [0, 1.4], blade: [0, 1.3] },
    },
    sinope: {
      name: '岬の崖村', at: [35.15, 42.02], pop: 200, land: 220, hidden: true,
      desc: '南の海岸、海に突き出た崖の上の村。岩の窪みで海水を干して塩をとり、大きな貝を削って飾りにする。土地がやせて食べ物に乏しい。',
      knowledge: ['shellcraft', 'preserving'],
      tavern: { name: '崖の上の酒場', girl: 'kara' },
      goods: { salt: [30, 0.9], shell: [6, 1], beads: [4, 1], fish: [25, 0.9], food: [5, 1.4], wood: [6, 1.3], fur: [8, 1.2] },
    },
    bosporus: {
      name: '海峡の村', at: [29.06, 41.12], pop: 900, land: 450, hidden: true,
      desc: '黒い海から南へ抜ける狭い海峡のほとり。遠い南の地の人々が行き交い、麦と布と土器が集まる。北の毛皮を珍しがる。',
      knowledge: ['farming', 'herding', 'pottery', 'weaving'],
      shipyard: ['canoe', 'twin', 'sail'],
      tavern: { name: '海峡の女主人の店', girl: 'zara' },
      recruits: [{ id: 'iri', fame: 0, cost: 30 }, { id: 'tia', fame: 25, cost: 60, size: 3 }],
      goods: { grain: [30, 1], linen: [12, 1], pottery: [15, 1], cheese: [10, 1], wool: [10, 1], woolcloth: [4, 1], fish: [20, 0.9],
               fur: [3, 1.6], amber: [0, 1.3], wood: [8, 1.2] },
    },
    troy: {
      name: '丘の上の城塞', at: [26.24, 39.97], pop: 1600, land: 600, hidden: true,
      desc: '南の海峡の出口を見下ろす丘の、石の壁に囲まれた町。青銅の道具を使い、金貨で売り買いする。北の毛皮と琥珀、馬に高い値をつける。',
      knowledge: ['farming', 'herding', 'pottery', 'weaving', 'copper', 'bronze', 'viticulture', 'olive', 'sailing'],
      shipyard: ['twin', 'sail', 'long'],
      goods: { woolcloth: [15, 0.9], wool: [12, 1], bronzetool: [8, 1], weapon: [3, 1], bronzeware: [4, 1], wine: [10, 1], oil: [10, 1], grain: [20, 1],
               horse: [0, 1.4], fur: [0, 1.5], amber: [0, 1.6], gold: [0, 1.3], tin: [0, 1.4], copper: [0, 1.3] },
    },
    lemnos: {
      name: '火の島の港', at: [25.40, 39.84], pop: 700, land: 350, hidden: true,
      desc: '多島海に浮かぶ島の、石造りの家が並ぶ港町。遠い南の島々から黒曜石や錫、紫の染め布が届く。木と麦が足りない。',
      knowledge: ['farming', 'pottery', 'copper', 'bronze', 'shellcraft', 'olive'],
      goods: { oil: [12, 0.9], shell: [10, 0.9], purple: [3, 1], tin: [4, 1], obsidian: [8, 1], fish: [20, 0.9], bronzeware: [3, 1], incense: [2, 1],
               grain: [0, 1.4], wood: [0, 1.6], fur: [0, 1.4] },
    },
  },

  // 航路。via は途中の点（[経度, 緯度]）。かかる季節数は geo.js が道のりから計算する。
  // 両端の村を見つけている航路だけ、自動で行き来できる。
  routes: [
    { a: 'varna',    b: 'sozopol',   mode: 'sea', via: [[28.10, 43.00], [27.95, 42.60]] },
    { a: 'varna',    b: 'tomis',     mode: 'sea', via: [[28.30, 43.50], [28.80, 43.95]] },
    { a: 'tomis',    b: 'danube',    mode: 'sea', via: [[29.00, 44.50], [29.80, 45.05], [29.78, 45.16], [29.20, 45.17]] },
    { a: 'danube',   b: 'tyras',     mode: 'sea', via: [[29.20, 45.17], [29.78, 45.16], [29.95, 45.45], [30.50, 46.00]] },
    { a: 'tyras',    b: 'dnieper',   mode: 'sea', via: [[30.55, 46.00], [31.00, 46.30], [31.45, 46.55], [32.00, 46.60]] },
    { a: 'dnieper',  b: 'dereivka',  mode: 'sea', via: [[33.37, 46.75], [34.10, 47.50], [35.10, 47.85], [35.00, 48.45], [34.40, 48.80]] },
    { a: 'dereivka', b: 'trypillia', mode: 'sea', via: [[33.40, 49.07], [32.06, 49.44], [31.30, 49.80]] },
    { a: 'varna',    b: 'bosporus',  mode: 'sea', via: [[28.30, 42.60], [28.60, 41.60], [29.13, 41.26]] },
    { a: 'sozopol',  b: 'bosporus',  mode: 'sea', via: [[28.20, 42.00], [28.90, 41.40], [29.13, 41.26]] },
    { a: 'bosporus', b: 'troy',      mode: 'sea', via: [[28.98, 40.95], [28.50, 40.85], [27.50, 40.78], [26.90, 40.52], [26.55, 40.30], [26.30, 40.08]] },
    { a: 'troy',     b: 'lemnos',    mode: 'sea', via: [[25.90, 39.95], [25.55, 39.86]] },
    { a: 'bosporus', b: 'sinope',    mode: 'sea', via: [[29.13, 41.26], [29.40, 41.45], [31.00, 41.60], [33.00, 42.10]] },
    { a: 'sinope',   b: 'trapezus',  mode: 'sea', via: [[36.00, 41.90], [37.50, 41.40], [39.00, 41.15]] },
    { a: 'trapezus', b: 'colchis',   mode: 'sea', via: [[40.60, 41.40], [41.40, 41.95]] },
    { a: 'sinope',   b: 'crimea',    mode: 'sea', via: [[34.50, 43.50], [33.50, 44.40], [33.10, 44.90]] },
    { a: 'crimea',   b: 'tyras',     mode: 'sea', via: [[32.40, 45.30], [31.00, 45.80]] },
    { a: 'crimea',   b: 'dnieper',   mode: 'sea', via: [[32.40, 45.40], [31.70, 46.25], [31.45, 46.55], [32.00, 46.60]] },
    { a: 'crimea',   b: 'kerch',     mode: 'sea', via: [[33.20, 44.80], [33.70, 44.30], [34.50, 44.55], [35.40, 44.90], [36.30, 44.98], [36.52, 45.10]] },
    { a: 'kerch',    b: 'tanais',    mode: 'sea', via: [[36.65, 45.55], [37.50, 46.30], [38.50, 46.90], [39.10, 47.12]] },
    { a: 'kerch',    b: 'kuban',     mode: 'sea', via: [[36.65, 45.55], [37.10, 45.50], [37.33, 45.40], [37.50, 45.25], [38.10, 45.20]] },
    { a: 'kerch',    b: 'colchis',   mode: 'sea', via: [[36.52, 45.05], [37.30, 44.70], [39.00, 43.90], [40.50, 43.00], [41.40, 42.40]] },
    { a: 'varna',    b: 'crimea',    mode: 'sea', via: [[29.50, 43.70], [31.50, 44.50], [32.80, 45.00]] },
  ],

  // 水族（海を荒らす舟の民）。外海を漕いでいると zones の中で出会うことがある。
  //   count: 人数の幅、str: 一人の強さの幅、ship: 舟の強さ、speed: 舟の速さ（逃げやすさに関わる）
  //   loot: 勝ったときに奪える品物の幅、fame: 勝ったときの名声
  //   cloth / paint: 戦いの画面での見た目
  raiders: {
    small: { name: '水族の小舟',   count: [3, 5], str: [3, 5], ship: 1, speed: 1.0, fame: 3, cloth: '#2f4f4f', paint: 'stripes',
             loot: { food: [3, 8], fish: [2, 6], fur: [0, 4] } },
    band:  { name: '水族の舟団',   count: [7, 10], str: [4, 6], ship: 2, speed: 1.2, fame: 8, cloth: '#24434a', paint: 'band',
             loot: { fur: [4, 10], salt: [3, 8], flint: [2, 6], hide: [2, 6] } },
    chief: { name: '水族の長の大舟', count: [13, 16], str: [5, 8], ship: 5, speed: 1.1, fame: 20, cloth: '#1d2f3a', paint: 'band',
             loot: { fur: [10, 20], shell: [2, 5], copper: [0, 3], amber: [0, 3] } },
  },
  // at は [経度, 緯度]、r は地図の点。rate は地図の4点進むごとに出会う確率。bands は出てくる相手の重み。
  encounterZones: [
    { at: [33.5, 43.4], r: 260, rate: 0.004, bands: { small: 3, band: 1 } },
    { at: [39.0, 42.6], r: 170, rate: 0.006, bands: { band: 2, chief: 1 } },
    { at: [31.0, 45.4], r: 100, rate: 0.004, bands: { small: 1 } },
    { at: [37.0, 46.3], r: 90,  rate: 0.004, bands: { small: 2, band: 1 } },
  ],

  // 好感度の段階。好感度が at に届くと、その人のイベントが起き、ほうびがある。
  //   str: 強さ +1、apt: 一番得意な船室（5未満のもの）の適性 +1、join: 酒場の娘を仲間に誘えるようになる
  //   lover: 恋人になる。恋人とはデートができ、好感度が rules.marryAt に届くと結婚を申し込める（恋人や妻の数に限りはない）
  bondStages: [
    { at: 20, name: '打ち解けた', str: 1 },
    { at: 45, name: '信頼',       apt: 1, join: true },
    { at: 70, name: '恋人',       str: 1, apt: 1, lover: true },
  ],

  // 子供の名前（生まれたとき、ここからまだ使っていない名前をつける）
  childNames: {
    f: ['ハナ', 'ソラ', 'ミオ', 'ユイ', 'ナオ', 'リコ', 'アヤ', 'サキ', 'ノア', 'エマ', 'ルカ', 'ミナ'],
    m: ['タク', 'ハル', 'カイ', 'リク', 'ソウ', 'ジン', 'レン', 'トワ', 'ユウ', 'ケン', 'ナギト', 'アキ'],
  },

  rules: {
    idealStock: 20,     // この在庫のとき価値がちょうど base * mult になる（市場の深さを掛ける）
    depthPop: 300,      // 市場の深さ = √(人口 / depthPop)。深い市場ほど在庫が多く、売り買いで値が動きにくい
    depthMin: 0.6,
    depthMax: 4,
    priceMin: 0.35,     // 在庫過多のときの価値の下限倍率
    priceMax: 3,        // 品薄のときの価値の上限倍率
    recovery: 0.35,     // 1季節で在庫が普段の量へ戻る割合
    buyMarkup: 1.1,     // 村からもらうときの上乗せ
    knowledgeRamp: 4,   // 教えた知識の効果が出そろうまでの季節数
    benefactorMarkup: 1.05, // 知識を教えた村（恩人）からもらうときの上乗せ
    benefactorBonus: 1.03,  // 恩人が品物を受け取るときの価値の上乗せ（benefactorMarkup より小さくしておくこと。でないと渡して取り戻すだけで恩が増える）
    foodPerMember: 1,   // 船旅1季節あたり、仲間1人が食べる保存食
    coinEra: 3,         // この時代（eras の番号）以上の村では金貨で売り買いする
    // 村の景気と人口
    boomPerValue: 0.05, // 交換した価値1あたり景気が上がる量
    boomTradeMax: 10,   // 1回の交換で上がる景気の上限
    boomDrift: 0.15,    // 1季節で景気が普通（50）へ戻る割合
    boomHunger: 6,      // 食べ物の在庫が普段の3割を切った季節に下がる景気
    popGrowth: 0.06,    // 景気がふつうのとき、1季節に人口が増える割合（養える人数に近づくほど鈍る）
    popHunger: 0.03,    // 飢えた季節に減る人口の割合
    capPerKnowledge: 0.12, // 知識1つごとに、養える人数が land の何倍ぶん増えるか（知識の cap で上書き）
    capPerResearcher: 0.05, // 研究者1人ごとに、養える人数が land の何倍ぶん増えるか
    luxPerSize: 0.12,   // 飾り物を、町の大きさが1段上がるごとに欲しがる上乗せ
    researcherCost: [30, 50, 80], // 研究者を支える恩（1人目・2人目・3人目）。人数の上限もこの長さ
    inventChance: 0.15, // 研究者1人ごとの、1季節で知識を編み出す確率
    // 好感度
    talkLove: [3, 5],   // 話すと上がる好感度
    treatLove: [6, 8],  // おごると上がる好感度
    treatCost: 3,       // おごるのに払う恩
    giftLove: 2,        // 贈り物で上がる好感度
    giftLikedLove: 7,   // 好きな品物を贈ったとき
    winLove: 2,         // 戦いに勝ったとき仲間全員の好感度
    cabinLove: 1,       // 得意な船室（適性4以上）にいる仲間の、1季節ごとの好感度
    // 恋人・結婚・子供
    dateLove: [4, 7],   // デートで上がる好感度（恋人・妻と、一季節に一度）
    marryAt: 90,        // この好感度で結婚を申し込める
    weddingGifts: ['gold', 'amber', 'silver'], // 結婚を申し込むときに贈る品（どれか一つ）
    childChance: 0.3,   // 妻とデートしたあと子供ができる確率
    pregnancySeasons: 3, // 子供ができてから生まれるまでの季節数
    childGrowth: 1,     // 子供が1季節に育つ年数（ゲームの都合で早い）
    childJoinAge: 16,   // この年になると仲間として船に乗る
    nurseryLove: 1,     // 保育室があるとき、母親たちの1季節ごとの好感度
    // 水夫（名前のない船乗り。人数だけで数える）
    sailorFood: 0.5,    // 水夫1人が1季節に食べる保存食
    sailorStr: 2,       // 戦いでの水夫の強さ
    sailorBattleMax: 8, // 戦いに出る水夫の上限（残りは船を守る）
    sailorHire: 5,      // 一度に雇う人数
    sailorCost: 2,      // 1人を雇う恩（金貨の町では金貨）
    sailorLoss: 0.2,    // 戦いに負けたときに失う水夫の割合
    // 外海の航行（地図の1点はおよそ1.1km）
    seaPerSeason: 350,  // 速さ1の船団が1季節で漕げる距離（地図の点の数）
    upstream: 0.6,      // 川をさかのぼるときの船足の倍率
    downstream: 1.3,    // 川を下るときの船足の倍率
    sightRadius: 40,    // 舟から見渡せる距離。この内に入った港を発見する
    portRadius: 18,     // この距離まで近づけば入港できる
    exploreCell: 24,    // 霧を晴らす升目の大きさ
    portReveal: 110,    // 知っている港のまわりの霧が晴れている範囲
    routeReveal: 45,    // 知っている航路沿いの霧が晴れている範囲
    seaUnitsPerSecond: 18, // 航海画面で速さ1の船団が1秒に進む距離（地図の点の数）
    raiderSpawn: 60,    // 水族が現れる距離（見張り台の効果で伸びる）
    raiderGiveUp: 130,  // ここまで離れると水族はあきらめる
    raiderCatch: 7,     // ここまで近づかれると遭遇
    // 戦い（戦いの画面で、一人ひとりが打ち合う）
    shipPower: 3,       // 船の強さ1あたりの戦力（見立ての計算用）
    unitHp: [20, 5],    // 体力 = 20 + 強さ×5
    unitAtk: 1.3,       // 一打ちの強さ = 強さ×1.3
    shipAtk: 0.03,      // 船の強さ1ごとに打つ力 +3%
    shipGuard: 0.04,    // 船の強さ1ごとに受ける傷 −4%（最大35%）
    loseShare: 0.4,     // 負けたときに奪われる積荷の割合
    fleeBase: 0.4,      // 逃げられる基本の確率
    teachFame: 5,       // 知識を教えたときに上がる名声
  },

  // 始まりの状態。いまはシステムのテストプレイ用に、大きな船2隻・仲間6人・多めの積荷と金貨で始める。
  // 本来の始まり（丸木舟1隻・ウルと2人・保存食10）に戻すときは、下の normalStart の中身をここへ移す。
  start: {
    town: 'varna',
    cargo: { food: 30, grain: 8, fish: 8, fur: 8, salt: 8, wood: 6, flint: 4, honey: 4, pottery: 4 },
    coins: 30,
    sailors: 8,
    fame: 10,
    knowledge: [],
    party: ['you', 'ul', 'nagi', 'duru', 'mira', 'saka'],
    // seats: 船室の並び（ships の cabins）と同じ順に座る人の id。先頭が船長
    ships: [
      { type: 'war',  seats: ['you', 'duru', null, 'ul', null, null] },
      { type: 'twin', seats: ['saka', 'mira', null, 'nagi', null] },
    ],
  },
  normalStart: {
    town: 'varna',
    cargo: { food: 10 },
    coins: 0,
    sailors: 0,
    fame: 0,
    knowledge: [],
    party: ['you', 'ul'],
    ships: [{ type: 'canoe', seats: ['you'] }],
  },
};
