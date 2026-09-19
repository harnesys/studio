(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }

  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy");
      var restore = btn.textContent;
      function done() {
        btn.textContent = "Copied";
        window.setTimeout(function () {
          btn.textContent = restore;
        }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
        return;
      }
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "absolute";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch (err) {}
      document.body.removeChild(area);
      done();
    });
  });

  var revealables = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  if (!revealables.length) return;

  if (reduceMotion.matches || !("IntersectionObserver" in window)) {
    revealables.forEach(function (el) {
      el.classList.add("in");
    });
    return;
  }

  var groups = new Map();
  revealables.forEach(function (el) {
    var parent = el.parentElement;
    if (!groups.has(parent)) groups.set(parent, 0);
    var index = groups.get(parent);
    groups.set(parent, index + 1);
    el.style.setProperty("--reveal-delay", Math.min(index * 90, 360) + "ms");
  });

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
  );

  revealables.forEach(function (el) {
    observer.observe(el);
  });
})();
