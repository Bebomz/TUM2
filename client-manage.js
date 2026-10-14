(function () {
  var addr = document.getElementById('addr');
  if (!addr) return;
  var btn = document.getElementById('checkAddr');
  var list = document.getElementById('addrResults');
  var box = document.getElementById('mapBox');
  var submit = document.getElementById('addSession');
  var latI = document.getElementById('lat');
  var lngI = document.getElementById('lng');
  var status = document.getElementById('addrStatus');
  var map = null;
  var marker = null;

  function reset() {
    latI.value = ''; lngI.value = '';
    submit.disabled = true;
    box.hidden = true;
    status.textContent = '';
    status.className = 'small';
  }
  addr.addEventListener('input', reset);
  addr.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); btn.click(); }
  });

  function showOnMap(lat, lng) {
    box.hidden = false;
    if (!map) {
      map = L.map('miniMap', { scrollWheelZoom: false }).setView([lat, lng], 17);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map);
    }
    map.setView([lat, lng], 17);
    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lng], { draggable: true }).addTo(map);
    marker.on('dragend', function () {
      var p = marker.getLatLng();
      latI.value = p.lat.toFixed(6);
      lngI.value = p.lng.toFixed(6);
      status.textContent = '✅ Emplacement ajusté manuellement.';
      status.className = 'small ok';
    });
    setTimeout(function () { map.invalidateSize(); }, 50);
  }

  function choose(r) {
    addr.value = r.label.slice(0, 250);
    latI.value = r.lat.toFixed(6);
    lngI.value = r.lng.toFixed(6);
    list.innerHTML = '';
    submit.disabled = false;
    if (r.hasNumber) {
      status.textContent = '✅ Adresse trouvée. Vérifiez l’emplacement sur la carte avant de valider.';
      status.className = 'small ok';
    } else {
      status.textContent = '⚠️ Numéro non reconnu : l’emplacement est approximatif, déplacez le repère au bon endroit.';
      status.className = 'small warn';
    }
    showOnMap(r.lat, r.lng);
  }

  btn.addEventListener('click', function () {
    var q = addr.value.trim();
    if (q.length < 3) { status.textContent = 'Saisissez une adresse.'; return; }
    btn.disabled = true;
    status.textContent = 'Recherche…';
    status.className = 'small';
    list.innerHTML = '';
    fetch('/api/geocode?q=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.results || !d.results.length) {
          status.textContent = d.error || 'Adresse introuvable. Précisez la ville ou le code postal.';
          status.className = 'small warn';
          return;
        }
        status.textContent = 'Choisissez la bonne adresse :';
        d.results.forEach(function (r) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'addr-opt';
          b.textContent = r.label;
          b.addEventListener('click', function () { choose(r); });
          list.appendChild(b);
        });
      })
      .catch(function () {
        status.textContent = 'Service d’adresses indisponible, réessayez.';
        status.className = 'small warn';
      })
      .then(function () { btn.disabled = false; });
  });
})();
