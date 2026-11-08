// Runs in <head>, before the first paint, so the page never flashes in the wrong theme.
// (The Content-Security-Policy forbids inline scripts — hence this tiny separate file.)
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem('ml.theme');
  } catch (e) {
    // storage disabled: fall through to the system preference
  }
  if (theme !== 'notebook' && theme !== 'darkroom') {
    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = dark ? 'darkroom' : 'notebook';
  }
  document.documentElement.setAttribute('data-theme', theme);
  // Phone browsers colour their toolbar with theme-color. color-scheme stops Chrome's and
  // Samsung Internet's automatic "dark mode for web pages" from inverting the paper notebook.
  var isDark = theme === 'darkroom';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isDark ? '#121110' : '#f6f1e6');
  var scheme = document.querySelector('meta[name="color-scheme"]');
  if (scheme) scheme.setAttribute('content', isDark ? 'dark' : 'only light');
})();
