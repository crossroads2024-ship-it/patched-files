// Collapse / expand the dashboard sidebar. The choice is remembered on this device (never required: storage may be blocked).
(function () {
  var b = document.getElementById('sideToggle'); if (!b) return;
  var KEY = 'ws_side_collapsed';
  function paint(c) {
    document.body.classList.toggle('side-collapsed', c);
    b.setAttribute('aria-expanded', c ? 'false' : 'true');
    b.setAttribute('aria-label', c ? 'Expand sidebar' : 'Collapse sidebar');
  }
  var c = false; try { c = localStorage.getItem(KEY) === '1'; } catch (e) {}
  paint(c);
  b.addEventListener('click', function () {
    c = !c; paint(c);
    try { localStorage.setItem(KEY, c ? '1' : '0'); } catch (e) {}
  });
})();

// Phone bottom bar: "More" opens the other dashboard pages as a panel above the bar. Closes on a choice, a tap outside, or Escape.
(function () {
  var nav = document.getElementById('siteNav'), b = document.getElementById('navMore'); if (!nav || !b) return;
  var moreItems = '[data-nav="reading"], [data-nav="reports"], [data-nav="plans"], [data-nav="contact"], .logout-btn';
  function isOpen() { return nav.classList.contains('more-open'); }
  function set(open) { nav.classList.toggle('more-open', open); document.body.classList.toggle('nav-open', open); b.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  // The More panel closes after a selection. Keep its accessible name in sync so
  // screen-reader users can still identify the selected page while its link is collapsed.
  function syncMoreLabel() {
    var active = nav.querySelector('a[aria-current="page"]');
    var inMore = active && active.matches(moreItems);
    b.setAttribute('aria-label', inMore ? 'More pages. Current page: ' + (active.getAttribute('aria-label') || active.textContent.trim()) : 'More pages');
  }
  syncMoreLabel();
  if ('MutationObserver' in window) {
    var observer = new MutationObserver(syncMoreLabel);
    observer.observe(nav, { subtree: true, attributes: true, attributeFilter: ['aria-current', 'class'] });
  }
  b.addEventListener('click', function (e) { e.stopPropagation(); set(!isOpen()); if (isOpen()) { var f = nav.querySelector('a[data-nav="mocks"]'); if (f) f.focus(); } });
  nav.addEventListener('click', function (e) { if (isOpen() && e.target.closest('a, .logout-btn')) set(false); });
  document.addEventListener('click', function (e) { if (isOpen() && !nav.contains(e.target)) set(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) { set(false); b.focus(); } });
  window.addEventListener('resize', function () { if (isOpen() && window.innerWidth > 560) set(false); });
})();

// Shared section bar for the pages that live outside /app (Reading, Books). It shows the same links, in the same order,
// as the dashboard sidebar, highlights the current section, and puts a "Dashboard" back link above the page content.
(function () {
  var section = document.body && document.body.getAttribute('data-section'), nav = document.getElementById('pubNav');
  if (!section || !nav) return;
  var LINKS = [
    ['dash', 'Dashboard', '/app'], ['writing', 'Writing', '/app#writing'], ['speaking', 'Speaking', '/app#speaking'],
    ['listening', 'Listening', '/app#listening'], ['reading', 'Reading', '/reading?from=dashboard'],
    ['reports', 'Reports', '/app#reports'], ['plans', 'Pricing', '/app#plans']
  ];
  function build() {
    nav.setAttribute('aria-label', 'Main navigation'); nav.textContent = '';
    LINKS.forEach(function (l) {
      var a = document.createElement('a'); a.href = l[2]; a.textContent = l[1]; a.setAttribute('data-nav', l[0]);
      if (l[0] === section) a.setAttribute('aria-current', 'page');
      nav.appendChild(a);
    });
    var brand = document.querySelector('.pub-bar .brand'); if (brand) { brand.href = '/app'; brand.setAttribute('aria-label', 'WritSpeak dashboard'); }
    var main = document.querySelector('main');
    if (main && !document.querySelector('.dash-back')) {
      var p = document.createElement('p'); p.className = 'dash-back gutter';
      p.innerHTML = '<a class="inner" href="/app">← Dashboard</a>';
      main.parentNode.insertBefore(p, main);
    }
  }
  // Reading is a signed-in page. Books is a public shop page, so visitors who are not signed in keep the public menu.
  if (section !== 'books') { build(); return; }
  var h = {}; try { var ss = localStorage.getItem('ws_session'); if (ss) h['x-session'] = ss; } catch (e) {}
  fetch('/api/me', { credentials: 'same-origin', cache: 'no-store', headers: h }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.student) build(); }).catch(function () {});
})();
