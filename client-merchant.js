(function () {
  var DAYS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var el = document.getElementById('ficheMap');
  var sessions = window.SESSIONS || [];
  if (el && sessions.length) {
    var map = L.map('ficheMap', { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    var pts = [];
    var seen = {};
    sessions.forEach(function (s) {
      var key = s.lat.toFixed(4) + ',' + s.lng.toFixed(4);
      if (!seen[key]) seen[key] = { s: s, lines: [] };
      seen[key].lines.push(DAYS[s.weekday] + ' ' + s.start + '–' + s.end);
    });
    Object.keys(seen).forEach(function (k) {
      var o = seen[k];
      var icon = L.divIcon({
        className: 'pin-wrap',
        html: '<div class="pin"><svg width="44" height="56" viewBox="0 0 44 56"><path d="M22 54C22 54 3 34 3 21a19 19 0 0 1 38 0c0 13-19 33-19 33z" fill="' + esc(window.COLOR) +
          '" stroke="#fff" stroke-width="3"/><circle cx="22" cy="21" r="13" fill="#fff"/></svg><span class="pin-in">' + esc(window.ICON) + '</span></div>',
        iconSize: [44, 56], iconAnchor: [22, 54], popupAnchor: [0, -50]
      });
      L.marker([o.s.lat, o.s.lng], { icon: icon })
        .addTo(map)
        .bindPopup('<b>' + esc(o.s.address) + '</b><br>' + o.lines.map(esc).join('<br>'));
      pts.push([o.s.lat, o.s.lng]);
    });
    if (pts.length === 1) map.setView(pts[0], 15);
    else map.fitBounds(pts, { padding: [40, 40] });
  }

  var share = document.getElementById('shareBtn');
  if (share) {
    share.addEventListener('click', function () {
      if (navigator.share) {
        navigator.share({ title: window.FICHE_NAME, url: window.FICHE_URL }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(window.FICHE_URL).then(function () { share.textContent = '✅ Lien copié'; });
      } else {
        prompt('Copiez ce lien :', window.FICHE_URL);
      }
    });
  }
})();
