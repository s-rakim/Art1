// Live maps. A .map element names a JSON endpoint on the portal
// (data-src) and how often to poll it (data-poll, seconds). The endpoint
// answers {markers: [{kind, lat, lng, label}], rows?, count?}. Tokens never
// reach the browser: the portal calls the API on its side.
(function () {
  "use strict";
  if (!window.L) return;

  function icon(kind) {
    var letter = { rider: "R", store: "S", home: "D" }[kind] || "•";
    return L.divIcon({
      className: "",
      html: '<span class="pin pin-' + kind + '" aria-hidden="true">' + letter + "</span>",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  }

  document.querySelectorAll(".map[data-src]").forEach(function (el) {
    var center = (el.getAttribute("data-center") || "5.6037,-0.1870").split(",").map(Number);
    var map = L.map(el, { scrollWheelZoom: false }).setView(center, 12);
    L.tileLayer(el.getAttribute("data-tiles"), {
      maxZoom: 19,
      attribution: el.getAttribute("data-attribution") || "",
    }).addTo(map);
    var layer = L.layerGroup().addTo(map);
    var fitted = false;
    var status = document.querySelector(el.getAttribute("data-status") || "#map-status");
    var table = document.querySelector(el.getAttribute("data-rows") || "#map-rows");
    var every = Math.max(3, Number(el.getAttribute("data-poll") || 5)) * 1000;
    var timer = null;

    function cell(text) {
      var td = document.createElement("td");
      td.textContent = text;
      return td;
    }

    function draw(data) {
      layer.clearLayers();
      var pts = [];
      (data.markers || []).forEach(function (m) {
        var mk = L.marker([m.lat, m.lng], { icon: icon(m.kind), title: m.label, alt: m.label });
        mk.bindTooltip(m.label);
        mk.addTo(layer);
        pts.push([m.lat, m.lng]);
      });
      if (!fitted && pts.length) {
        map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
        fitted = true;
      }
      if (status) {
        var bits = [];
        if (data.status) bits.push(String(data.status).replace(/_/g, " "));
        if (data.eta_minutes != null) bits.push("about " + data.eta_minutes + " min away");
        if (data.count != null) bits.push(data.count + " active deliver" + (data.count === 1 ? "y" : "ies"));
        bits.push("updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        status.textContent = bits.join(" · ");
      }
      if (table && data.rows) {
        var body = table.querySelector("tbody");
        body.replaceChildren();
        data.rows.forEach(function (r) {
          var tr = document.createElement("tr");
          [r.order, r.store, r.rider, String(r.status).replace(/_/g, " ")].forEach(function (v) { tr.appendChild(cell(v)); });
          body.appendChild(tr);
        });
        if (!data.rows.length) {
          var tr = document.createElement("tr");
          var td = cell("No deliveries on the road right now.");
          td.colSpan = 4;
          td.className = "muted";
          tr.appendChild(td);
          body.appendChild(tr);
        }
      }
    }

    function tick() {
      if (document.hidden) return;
      fetch(el.getAttribute("data-src"), { credentials: "same-origin", headers: { Accept: "application/json" } })
        .then(function (r) {
          if (r.status === 401) { window.location.reload(); throw new Error("signed out"); }
          return r.json();
        })
        .then(draw)
        .catch(function () { if (status) status.textContent = "Can't reach the live feed. Retrying…"; });
    }
    tick();
    timer = setInterval(tick, every);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) tick(); });
    window.addEventListener("pagehide", function () { clearInterval(timer); });
  });
})();
