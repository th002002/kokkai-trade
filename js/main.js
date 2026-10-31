// 起動。保存があれば続きから。
(function () {
  const G = window.Game;
  G.state = G.load() || G.newGame();
  G.UI.render();
})();
