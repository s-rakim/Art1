// While a rider is on shift and this page is open, send their position to
// the portal every 15 seconds (it forwards it to the API). The browser asks
// for permission first; nothing is sent when they're off shift.
(function () {
  "use strict";
  // Jobs near you: refresh the list every 20 seconds, unless the rider is
  // in the middle of ticking jobs or typing.
  var list = document.getElementById("open-jobs");
  if (list && window.htmx) {
    setInterval(function () {
      if (document.hidden || list.querySelector("input:checked") || list.contains(document.activeElement)) return;
      window.htmx.ajax("GET", list.getAttribute("data-refresh"), { target: list, swap: "innerHTML" });
    }, 20000);
    list.addEventListener("change", function () {
      var n = list.querySelectorAll("input[name=job]:checked").length;
      var out = list.querySelector("[data-picked-count]");
      if (out) out.textContent = n ? n + " ticked" : "Tick jobs to take several at once.";
    });
  }
})();

(function () {
  "use strict";
  var box = document.querySelector("[data-share-location]");
  if (!box || !navigator.geolocation) return;
  var out = box.querySelector("[data-location-status]");
  var url = box.getAttribute("data-share-location");
  var last = 0;
  var pending = false;

  function say(text) { if (out) out.textContent = text; }

  function send(pos) {
    var now = Date.now();
    if (pending || now - last < 15000) return;
    pending = true;
    var c = pos.coords;
    fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRFToken": window.bazaarCsrf || "" },
      body: JSON.stringify({
        lat: c.latitude, lng: c.longitude, accuracy_m: c.accuracy,
        heading: isNaN(c.heading) ? null : c.heading, speed_mps: isNaN(c.speed) ? null : c.speed,
      }),
    }).then(function (r) {
      last = Date.now();
      say(r.ok ? "Location shared at " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
               : "The shop didn't take your location. Check you're on shift.");
    }).catch(function () {
      say("No connection. We'll try again in a moment.");
    }).finally(function () { pending = false; });
  }

  navigator.geolocation.watchPosition(send, function (err) {
    say(err.code === 1 ? "Location is blocked. Allow it in your browser so shops can find you."
                       : "Can't get your location right now.");
  }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  say("Finding your location…");
})();
