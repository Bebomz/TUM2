// Garantit que la fiche tient sur une seule page A4 : le QR code et la bannière ne doivent
// jamais être coupés. Étapes (déjà partiellement gérées en CSS : photo compressible, 2 colonnes) :
//   1. réduction progressive de l'échelle du contenu (jusqu'à 55 %) ;
//   2. en dernier recours, masquage des dernières sessions avec renvoi vers la fiche en ligne.
(function () {
  var sheet = document.querySelector('.sheet');
  var content = document.querySelector('.content');
  if (!sheet || !content) return;

  var overflowing = function () { return content.scrollHeight > content.clientHeight + 1; };

  function fit() {
    var more = document.querySelector('.schedule-more');
    if (more) more.remove();
    Array.prototype.forEach.call(document.querySelectorAll('.schedule li'), function (li) { li.hidden = false; });
    content.style.zoom = '';

    var z = 1;
    while (overflowing() && z > 0.56) {
      z -= 0.03;
      content.style.zoom = z.toFixed(2);
    }

    if (overflowing()) {
      var items = Array.prototype.slice.call(document.querySelectorAll('.schedule li'));
      var hidden = 0;
      var list = document.querySelector('.schedule');
      var note = document.createElement('p');
      note.className = 'schedule-more';
      list.parentNode.appendChild(note);
      while (overflowing() && items.length - hidden > 3) {
        items[items.length - 1 - hidden].hidden = true;
        hidden++;
        note.textContent = '+ ' + hidden + ' autre' + (hidden > 1 ? 's' : '') + ' session' + (hidden > 1 ? 's' : '') + ' : voir la fiche en ligne (QR code)';
      }
      if (!hidden) note.remove();
    }
  }

  window.addEventListener('load', fit);
  window.addEventListener('beforeprint', fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
})();
