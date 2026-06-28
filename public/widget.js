// The self-healing webring widget. Members paste ONE line onto their site, once:
//   <script src="https://uwcs-ring.vercel.app/widget.js" data-site="your-domain.com"></script>
// It reads the live index.json at load time and renders ← prev | random | next →.
// Because neighbors are computed from the current index, the ring re-stitches itself
// when any site dies — members never touch their snippet again.
(function () {
  var script = document.currentScript;
  var site = (script.getAttribute("data-site") || "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  // Ring base derived from where this script is hosted, so a fork just works.
  var base = script.src.replace(/\/widget\.js.*$/, "");

  fetch(base + "/index.json")
    .then(function (r) { return r.json(); })
    .then(function (index) {
      var live = index.members.filter(function (m) { return m.ok; });
      var i = live.findIndex(function (m) { return m.domain === site; });
      if (i === -1) {
        // Site not in the ring (yet) — render nothing rather than a broken widget.
        return;
      }
      var n = live.length;
      var prev = live[(i - 1 + n) % n];
      var next = live[(i + 1) % n];
      var rand = live[Math.floor(Math.random() * n)];

      var url = function (m) { return m.homepage || "https://" + m.domain; };
      var el = document.createElement("div");
      el.className = "webring-widget";
      el.innerHTML =
        '<a class="wr-ring" href="' + base + '">' + esc(index.ring.name) + "</a> " +
        '<a href="' + esc(url(prev)) + '" title="' + esc(prev.name) + '">← prev</a> · ' +
        '<a href="' + esc(url(rand)) + '">random</a> · ' +
        '<a href="' + esc(url(next)) + '" title="' + esc(next.name) + '">next →</a>';
      var mount = document.getElementById("webring") || script.parentNode;
      mount.insertBefore(el, script);
    })
    .catch(function () { /* ring unreachable: fail silent, never break the host page */ });

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
})();
