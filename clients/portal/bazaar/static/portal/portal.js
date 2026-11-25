// Small progressive enhancements for the portal. Every page works without
// this file; it adds the drawer, toasts, confirm dialogs, the photo
// dropzone and the gallery. Loaded with `defer`, so the DOM is ready.
(function () {
  "use strict";

  var csrf = document.querySelector('meta[name="csrf-token"]');
  var csrfToken = csrf ? csrf.content : "";
  window.bazaarCsrf = csrfToken;

  // htmx sends the CSRF token on every request it makes.
  document.body.addEventListener("htmx:configRequest", function (e) {
    e.detail.headers["X-CSRFToken"] = csrfToken;
  });

  // Mobile navigation drawer.
  var toggle = document.querySelector("[data-nav-toggle]");
  var nav = document.getElementById("app-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.getAttribute("data-open") !== "true";
      nav.setAttribute("data-open", String(open));
      toggle.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.getAttribute("data-open") === "true") {
        nav.setAttribute("data-open", "false");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  }

  // Toasts close on click and fade out after a while, errors stay longer.
  function wireToasts(root) {
    (root || document).querySelectorAll(".toast").forEach(function (t) {
      if (t.dataset.wired) return;
      t.dataset.wired = "1";
      var close = t.querySelector("button");
      if (close) close.addEventListener("click", function () { t.remove(); });
      var ms = t.classList.contains("note-error") ? 12000 : 5000;
      setTimeout(function () { if (t.isConnected) t.remove(); }, ms);
    });
  }
  wireToasts();
  document.body.addEventListener("htmx:afterSettle", function () { wireToasts(); });

  // Confirm before anything destructive, with a real dialog instead of window.confirm.
  var dialog = document.getElementById("confirm-dialog");
  document.addEventListener("submit", function (e) {
    var form = e.target;
    var message = form.getAttribute("data-confirm") ||
      (e.submitter && e.submitter.getAttribute("data-confirm"));
    if (!message || !dialog || form.dataset.confirmed === "1") return;
    e.preventDefault();
    e.stopPropagation();
    var submitter = e.submitter || null;
    dialog.querySelector("[data-confirm-text]").textContent = message;
    dialog.returnValue = "";
    dialog.showModal();
    dialog.addEventListener("close", function onClose() {
      dialog.removeEventListener("close", onClose);
      if (dialog.returnValue === "yes") {
        form.dataset.confirmed = "1";
        // Goes through htmx or a normal submit, with the same button value.
        form.requestSubmit(submitter);
        setTimeout(function () { delete form.dataset.confirmed; }, 0);
      }
    });
  }, true);

  // Product gallery: thumbnails swap the main photo.
  document.querySelectorAll("[data-gallery]").forEach(function (g) {
    var main = g.querySelector("[data-gallery-main]");
    g.querySelectorAll("[data-gallery-thumb]").forEach(function (b) {
      b.addEventListener("click", function () {
        main.src = b.getAttribute("data-src");
        main.alt = b.getAttribute("data-alt") || "";
        g.querySelectorAll("[data-gallery-thumb]").forEach(function (o) { o.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
      });
    });
  });

  // Variant picker updates the price and stock line next to it.
  document.querySelectorAll("[data-variant-select]").forEach(function (sel) {
    var price = document.querySelector("[data-variant-price]");
    var stock = document.querySelector("[data-variant-stock]");
    function update() {
      var opt = sel.options[sel.selectedIndex];
      if (price) price.textContent = opt.getAttribute("data-price");
      if (stock) stock.textContent = opt.getAttribute("data-stock");
    }
    sel.addEventListener("change", update);
  });

  // Dropzones: drag files in, preview them before upload, show progress.
  function wireDropzones(root) {
    (root || document).querySelectorAll("[data-dropzone]").forEach(function (zone) {
      if (zone.dataset.wired) return;
      zone.dataset.wired = "1";
      var input = zone.querySelector('input[type="file"]');
      var previews = zone.querySelector("[data-previews]");
      var summary = zone.querySelector("[data-summary]");
      function show(files) {
        if (!previews) return;
        previews.replaceChildren();
        Array.prototype.slice.call(files, 0, 10).forEach(function (f) {
          if (f.type.indexOf("image/") === 0) {
            var img = document.createElement("img");
            img.alt = "";
            img.src = URL.createObjectURL(f);
            img.onload = function () { URL.revokeObjectURL(img.src); };
            previews.appendChild(img);
          }
        });
        if (summary) summary.textContent = files.length ? files.length + " file" + (files.length > 1 ? "s" : "") + " ready to upload" : "";
      }
      input.addEventListener("change", function () { show(input.files); });
      ["dragenter", "dragover"].forEach(function (t) {
        zone.addEventListener(t, function (e) { e.preventDefault(); zone.setAttribute("data-over", "true"); });
      });
      ["dragleave", "drop"].forEach(function (t) {
        zone.addEventListener(t, function () { zone.setAttribute("data-over", "false"); });
      });
      zone.addEventListener("drop", function (e) {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files.length) {
          input.files = e.dataTransfer.files;
          show(input.files);
        }
      });
    });
  }
  wireDropzones();
  document.body.addEventListener("htmx:afterSettle", function (e) { wireDropzones(e.target); });
  document.body.addEventListener("htmx:xhr:progress", function (e) {
    var bar = e.target.querySelector && e.target.querySelector("progress");
    if (bar && e.detail.lengthComputable) {
      bar.hidden = false;
      bar.value = Math.round((e.detail.loaded / e.detail.total) * 100);
    }
  });

  // Flash a row green after an inline save.
  document.body.addEventListener("htmx:afterSwap", function (e) {
    if (e.target && e.target.tagName === "TR") {
      e.target.classList.add("saved");
      setTimeout(function () { e.target.classList.remove("saved"); }, 900);
    }
  });
})();
