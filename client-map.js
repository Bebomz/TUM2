(function () {
  var DAYS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  var cats = window.CATEGORIES || [];
  var todayIdx = ((new Date().getDay() + 6) % 7) + 1;
  var state = { day: todayIdx, radius: 10, cats: new Set(), pos: null, fitted: false };
  var seq = 0;
  var lastLocations = [];

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var map = L.map('map', { zoomControl: false, tap: true }).setView([46.6, 2.4], 6);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  var markers = L.layerGroup().addTo(map);
  var circle = null;
  var posMarker = null;

  // ---------- Marqueurs en goutte inversée ----------
  function pinHtml(color, inner, isCount) {
    return (
      '<div class="pin">' +
      '<svg width="44" height="56" viewBox="0 0 44 56" aria-hidden="true">' +
      '<path d="M22 54C22 54 3 34 3 21a19 19 0 0 1 38 0c0 13-19 33-19 33z" fill="' + color + '" stroke="#fff" stroke-width="3"/>' +
      '<circle cx="22" cy="21" r="13" fill="#fff"/></svg>' +
      '<span class="pin-in' + (isCount ? ' pin-count' : '') + '"' + (isCount ? ' style="color:' + color + '"' : '') + '>' + inner + '</span>' +
      '</div>'
    );
  }
  function makeIcon(loc) {
    var first = loc.merchants[0].category;
    if (loc.count > 1) {
      var same = loc.merchants.every(function (m) { return m.category.id === first.id; });
      return L.divIcon({
        className: 'pin-wrap', html: pinHtml(same ? first.color : '#37474F', loc.count, true),
        iconSize: [44, 56], iconAnchor: [22, 54], popupAnchor: [0, -50]
      });
    }
    return L.divIcon({
      className: 'pin-wrap', html: pinHtml(first.color, esc(first.icon), false),
      iconSize: [44, 56], iconAnchor: [22, 54], popupAnchor: [0, -50]
    });
  }

  // ---------- Mini fiche affichée au clic sur un marqueur ----------
  // Marchand : photo, nom, catégorie, horaires. Lieu : adresse courte + "Y aller". Puis "Voir la fiche".
  function hoursLines(m) {
    return m.sessions.map(function (s) {
      return (state.day === 0 ? DAYS[s.weekday] + ' ' : '') + s.start + '–' + s.end;
    });
  }
  function addrHtml(loc) {
    var dest = loc.lat + ',' + loc.lng;
    return '<div class="pm-addr"><span class="pm-addr-text">📍 ' + esc(loc.short || loc.address) + '</span>' +
      '<a class="btn btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&amp;destination=' + esc(dest) + '">🧭 Y aller</a></div>';
  }
  function merchantHtml(m) {
    var img = m.photo
      ? '<img src="/uploads/' + encodeURIComponent(m.photo) + '" alt="" loading="lazy">'
      : '<span class="ph" style="background:' + esc(m.category.color) + '">' + esc(m.category.icon) + '</span>';
    return '<div class="pm-head">' + img + '<div class="pm-info"><b>' + esc(m.name) + '</b>' +
      '<span class="pm-cat" style="background:' + esc(m.category.color) + '">' + esc(m.category.icon) + ' ' + esc(m.category.name) + '</span>' +
      '<span class="pm-hours">🕒 ' + hoursLines(m).map(esc).join('<br>') + '</span></div></div>';
  }
  // Sessions "en cours" d'un marchand, d'après l'horloge de l'appareil (le serveur revérifie).
  function reportable(m) {
    var d = new Date();
    var wd = ((d.getDay() + 6) % 7) + 1;
    var t = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    return m.sessions.filter(function (s) { return s.id && s.weekday === wd && s.start <= t && t <= s.end; });
  }
  function popupHtml(loc, idx) {
    var html = '<div class="popup">';
    if (loc.count > 1) html += addrHtml(loc); // plusieurs marchands : l'adresse est commune, en tête
    loc.merchants.forEach(function (m) {
      html += '<div class="pm">' + merchantHtml(m);
      if (loc.count === 1) html += addrHtml(loc);
      html += '<a class="btn btn-light btn-sm pm-fiche" href="/marchand/' + encodeURIComponent(m.slug) + '">Voir la fiche complète</a>';
      if (reportable(m).length) {
        html += '<button type="button" class="pm-report" data-place="' + idx + '" data-mid="' + m.id + '">🚩 Il n’est pas à son emplacement ?</button>';
      }
      html += '</div>';
    });
    return html + '</div>';
  }

  // ---------- Chargement ----------
  function load() {
    var my = ++seq;
    var p = new URLSearchParams({ day: state.day });
    if (state.cats.size) p.set('categories', Array.from(state.cats).join(','));
    if (state.pos && state.radius > 0) {
      p.set('lat', state.pos.lat); p.set('lng', state.pos.lng); p.set('radius', state.radius);
    }
    fetch('/api/sessions?' + p.toString())
      .then(function (r) { return r.json(); })
      .then(function (data) { if (my === seq) render(data); })
      .catch(function () { $('resultPill').textContent = 'Erreur de chargement. Réessayez.'; });
  }

  function render(data) {
    markers.clearLayers();
    var pts = [];
    lastLocations = data.locations;
    data.locations.forEach(function (loc, idx) {
      var mk = L.marker([loc.lat, loc.lng], { icon: makeIcon(loc), riseOnHover: true });
      mk.bindPopup(popupHtml(loc, idx), { maxWidth: 300, minWidth: 250 });
      markers.addLayer(mk);
      pts.push([loc.lat, loc.lng]);
    });
    var dayTxt = state.day === 0 ? 'tous les jours' : DAYS[state.day].toLowerCase();
    var n = data.total;
    var txt = n === 0 ? 'Aucun marchand trouvé · ' + dayTxt : n + ' marchand' + (n > 1 ? 's' : '') + ' · ' + dayTxt;
    if (!state.pos && state.radius > 0) txt += ' · position inconnue';
    $('resultPill').textContent = txt;
    if (!state.pos && !state.fitted && pts.length) {
      map.fitBounds(pts, { padding: [60, 60], maxZoom: 13 });
      state.fitted = true;
    }
    updateSummary();
  }

  function updateSummary() {
    var parts = [state.day === 0 ? 'Tous jours' : DAYS[state.day]];
    if (state.cats.size) parts.push(state.cats.size + ' cat.');
    if (state.pos && state.radius > 0) parts.push(state.radius + ' km');
    $('filterSummary').textContent = parts.join(' · ');
  }

  // ---------- Position de référence ----------
  function setPos(lat, lng, isUser) {
    state.pos = { lat: lat, lng: lng };
    if (posMarker) map.removeLayer(posMarker);
    posMarker = L.circleMarker([lat, lng], {
      radius: 8, color: '#fff', weight: 3, fillColor: isUser ? '#2979ff' : '#1f2430', fillOpacity: 1
    }).addTo(map);
    drawCircle(true);
  }
  function drawCircle(fit) {
    if (circle) { map.removeLayer(circle); circle = null; }
    if (!state.pos) return;
    if (state.radius > 0) {
      circle = L.circle([state.pos.lat, state.pos.lng], {
        radius: state.radius * 1000, color: '#ff6b35', weight: 2, fillColor: '#ff6b35', fillOpacity: 0.06, interactive: false
      }).addTo(map);
      if (fit) map.fitBounds(circle.getBounds(), { padding: [20, 20] });
    } else if (fit) {
      map.setView([state.pos.lat, state.pos.lng], 12);
    }
  }

  function locate(initial) {
    if (!navigator.geolocation) { noGeo(initial); return; }
    $('resultPill').textContent = 'Localisation en cours…';
    navigator.geolocation.getCurrentPosition(
      function (p) { setPos(p.coords.latitude, p.coords.longitude, true); load(); },
      function () { noGeo(initial); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }
  function noGeo(initial) {
    if (!initial) alert('Position indisponible. Autorisez la géolocalisation ou saisissez une ville.');
    load();
    openFilters(true);
    // Pas de focus automatique au chargement : sur mobile il ouvrirait le clavier devant la carte.
    if (!initial) $('placeInput').focus({ preventScroll: true });
  }

  // ---------- Recherche d'une ville ----------
  function searchPlace() {
    var q = $('placeInput').value.trim();
    if (q.length < 3) return;
    $('placeBtn').disabled = true;
    fetch('/api/geocode?q=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.results || !d.results.length) { alert(d.error || 'Lieu introuvable.'); return; }
        var r = d.results[0];
        setPos(r.lat, r.lng, false);
        load();
        openFilters(false);
      })
      .catch(function () { alert('Recherche indisponible.'); })
      .then(function () { $('placeBtn').disabled = false; });
  }

  // ---------- Filtres UI ----------
  function openFilters(open) {
    $('filters').classList.toggle('open', open);
    $('filtersToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  $('filtersToggle').addEventListener('click', function () { openFilters(!$('filters').classList.contains('open')); });

  $('daySelect').value = String(state.day);
  $('daySelect').addEventListener('change', function () { state.day = +this.value; load(); });
  $('radiusSelect').addEventListener('change', function () {
    state.radius = +this.value;
    drawCircle(true);
    load();
  });

  var chips = $('chips');
  cats.forEach(function (c) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.style.setProperty('--c', c.color);
    b.innerHTML = '<span class="dot"></span>' + esc(c.icon) + ' ' + esc(c.name);
    b.addEventListener('click', function () {
      if (state.cats.has(c.id)) state.cats.delete(c.id); else state.cats.add(c.id);
      b.classList.toggle('on', state.cats.has(c.id));
      load();
    });
    chips.appendChild(b);
  });
  $('clearCats').addEventListener('click', function () {
    state.cats.clear();
    Array.prototype.forEach.call(chips.children, function (c) { c.classList.remove('on'); });
    load();
  });

  $('placeBtn').addEventListener('click', searchPlace);
  $('placeInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') searchPlace(); });
  $('locateBtn').addEventListener('click', function () { locate(false); });
  map.on('click', function () { openFilters(false); });

  // ---------- Signalement d'absence ----------
  var modal = $('reportModal');
  var form = $('reportForm');
  var msg = $('reportMsg');
  function closeReport() { modal.hidden = true; }
  function openReport(m) {
    var list = reportable(m);
    if (!list.length) return;
    $('reportIntro').textContent = m.name + ' devrait être présent en ce moment. Vous ne le trouvez pas ? Nous le prévenons.';
    var box = $('reportSessions');
    box.innerHTML = '';
    list.forEach(function (s, i) {
      var l = document.createElement('label');
      var r = document.createElement('input');
      r.type = 'radio'; r.name = 'session_id'; r.value = s.id; r.checked = i === 0;
      l.appendChild(r);
      l.appendChild(document.createTextNode(s.start + '–' + s.end));
      box.appendChild(l);
    });
    box.hidden = list.length < 2; // une seule session : pas de choix à proposer
    form.comment.value = '';
    msg.textContent = ''; msg.className = 'small';
    $('reportSend').disabled = false;
    modal.hidden = false;
  }
  // Phase de capture : fonctionne même si Leaflet bloque la propagation des clics dans la popup.
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.pm-report');
    if (!b) return;
    var loc = lastLocations[+b.getAttribute('data-place')];
    var m = loc && loc.merchants.filter(function (x) { return x.id === +b.getAttribute('data-mid'); })[0];
    if (m) openReport(m);
  }, true);
  $('reportCancel').addEventListener('click', closeReport);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeReport(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) closeReport(); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var p = new URLSearchParams();
    new FormData(form).forEach(function (v, k) { p.append(k, v); });
    p.append('_csrf', window.CSRF || '');
    $('reportSend').disabled = true;
    msg.className = 'small'; msg.textContent = 'Envoi…';
    fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p.toString() })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) {
        if (x.ok) {
          msg.className = 'small ok'; msg.textContent = '✅ ' + (x.d.message || 'Merci !');
          setTimeout(closeReport, 2500);
        } else {
          msg.className = 'small warn'; msg.textContent = x.d.error || 'Envoi impossible.';
          $('reportSend').disabled = false;
        }
      })
      .catch(function () {
        msg.className = 'small warn'; msg.textContent = 'Envoi impossible. Rechargez la page puis réessayez.';
        $('reportSend').disabled = false;
      });
  });

  updateSummary();
  locate(true);
})();
