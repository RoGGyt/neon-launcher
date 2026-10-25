// Общее для страниц сайта: ссылка на свежий установщик и маленький нарисованный персонаж
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

  // персонаж в неоновой толстовке, нарисованный по пикселям (свой, не из игры)
  const mini = document.getElementById('miniSkin');
  if (mini) drawMascot(mini);

  function drawMascot(canvas) {
    const ctx = canvas.getContext('2d');
    const S = 9; // размер «пикселя»
    const W = 16, H = 32;
    const ox = Math.round((canvas.width - W * S) / 2), oy = Math.round((canvas.height - H * S) / 2);
    const C = {
      h: '#2a1f3d', s: '#f2c9a5', d: '#d9a882', e: '#05060f', w: '#ffffff',
      c: '#00d9ef', C: '#00a8c0', m: '#ff2bd6', p: '#1b1e45', P: '#121433', b: '#0b0d1f', g: '#9dff00',
    };
    const rows = [
      '....hhhhhhhh....',
      '....hhhhhhhh....',
      '....hsssssshh...',
      '....ssssssss....',
      '....swessews....',
      '....ssssssss....',
      '....sssddsss....',
      '....ssmmmmss....',
      'cccccccccccccccc',
      'cccccccccccccccc',
      'Ccccccmmmmcccccc',
      'Ccc.ccmggmcc.ccC',
      'Ccc.cccmmccc.ccC',
      'Ccc.cccccccc.ccC',
      'Ccc.cccccccc.ccC',
      'Ccc.cccccccc.ccC',
      'ssS.cccccccc.Sss',
      'ss..mmmmmmmm..ss',
      '....pppppppp....',
      '....pppppppp....',
      '....pppPPppp....',
      '....pppPPppp....',
      '....pppPPppp....',
      '....pppPPppp....',
      '....pppPPppp....',
      '....pppPPppp....',
      '....pppPPppp....',
      '....pppPPppp....',
      '....bbbbbbbb....',
      '....bbbbbbbb....',
      '....wwwbbwww....',
      '................',
    ];
    ctx.imageSmoothingEnabled = false;
    // свечение под ногами
    const glow = ctx.createRadialGradient(canvas.width / 2, oy + (H - 2) * S, 4, canvas.width / 2, oy + (H - 2) * S, 90);
    glow.addColorStop(0, 'rgba(0,240,255,.45)');
    glow.addColorStop(1, 'rgba(0,240,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, oy + (H - 2) * S - 50, canvas.width, 70);
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      const col = ch === 'S' ? C.d : C[ch];
      if (!col) return;
      ctx.fillStyle = col;
      ctx.fillRect(ox + x * S, oy + y * S, S, S);
    }));
  }
})();
