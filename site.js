// Ссылка на свежий установщик для кнопок «Скачать»
(() => {
  const REPO = 'RoGGyt/neon-launcher';

  // кнопки «Скачать» ведут прямо на Setup.exe последней версии
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
    .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
    .then(rel => {
      const setup = rel.assets.find(a => /Setup.*\.exe$/i.test(a.name));
      if (!setup) return;
      document.querySelectorAll('.js-download').forEach(a => { a.href = setup.browser_download_url; });
      const mb = Math.round(setup.size / 1048576);
      document.querySelectorAll('.js-dl-meta').forEach(el => {
        el.textContent = `Версия ${rel.tag_name.replace(/^v/, '')}, ${mb} МБ, Windows 10 и 11`;
      });
    })
    .catch(() => { /* остаётся ссылка на страницу релизов */ });

})();
