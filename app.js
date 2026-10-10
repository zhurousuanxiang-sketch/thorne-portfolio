(() => {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const data = window.PORTFOLIO, intro = $('#intro'), viewer = $('#viewer'), media = $('#viewer-media');
  const motionButton = $('#motion-toggle'), cursor = $('#cursor-ring');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), finePointer = matchMedia('(hover:hover) and (pointer:fine)');
  let savedMotion;
  try { savedMotion = localStorage.getItem('frame-motion'); } catch {}
  let motion = !reduced.matches && savedMotion !== 'off', introTimers = [], selected = null;
  let viewList = [], viewIndex = 0, opener = null, closing = false, previewSerial = 0;
  let activePlayer = null, switchTimer = null, viewerSerial = 0;
  const esc = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function art(item, extra = '') {
    if (item.cover) return `<div class="card-art ${extra}" data-cover="${esc(item.cover)}" role="img" aria-label="${esc(item.title)}"></div>`;
    return `<div class="card-art atlas-art ${extra}" data-sheet="${esc(item.sheet)}" data-cell="${item.cell}" role="img" aria-label="${esc(item.title)}"></div>`;
  }
  const artObserver = new ResizeObserver(entries => entries.forEach(({target, contentRect:r}) => {
    const cell = Number(target.dataset.cell), w = 2048/3, h = 384, k = Math.max(r.width/w, r.height/h);
    target.style.backgroundSize = `${2048*k}px ${768*k}px`;
    target.style.backgroundPosition = `${-((cell%3)*w*k+(w*k-r.width)/2)}px ${-(Math.floor(cell/3)*h*k+(h*k-r.height)/2)}px`;
  }));
  function observeArt(root = document) {
    root.querySelectorAll('[data-sheet]').forEach(el => { el.style.backgroundImage = `url("assets/${el.dataset.sheet}")`; artObserver.observe(el); });
    root.querySelectorAll('[data-cover]').forEach(el => { el.style.backgroundImage = `url("${encodeURI(el.dataset.cover).replaceAll('"','%22')}")`; });
  }
  const selectionShell = '<div class="selection-shell selection-frame" aria-hidden="true"><i class="selection-bracket"></i><i class="selection-bracket"></i><i class="selection-bracket"></i><i class="selection-bracket"></i></div>';
  // Keep source indices for playback; show the two lead projects first without duplicating them.
  const categoryOrder = {aigc:0,ad:1};
  const orderedWorks = data.works.map((work,index) => ({work,index})).sort((a,b) => Number(!!b.work.featured)-Number(!!a.work.featured) || categoryOrder[a.work.category]-categoryOrder[b.work.category] || a.index-b.index);
  const accent = work => /^#[0-9a-f]{6}$/i.test(work.accent || '') ? work.accent : '#bdacef';
  $('#work-grid').innerHTML = orderedWorks.map(({work:w,index:i}) => `<article class="work-card ${w.category==='ad'?'ad-card':''} ${w.featured?'featured':''}" data-work="${i}" data-category="${w.category}" style="--selection-accent:${accent(w)}"><div class="card-stage"><div class="card-visual">${art(w)}<button class="preview-hit" aria-label="静音预览${esc(w.title)}，双击大屏播放" title="双击大屏播放 · Enter 打开" aria-pressed="false"></button></div>${selectionShell}</div><div class="card-caption"><div class="card-heading"><span class="card-type">${w.category==='ad'?'COMMERCIAL':'AIGC FILM'}</span><h3>${esc(w.title)}<span>${esc(w.en)}</span></h3></div></div></article>`).join('');
  const realFilms = data.works.filter(w => !w.demo).length;
  $('#work-note').textContent = data.works.some(w => w.demo)?(realFilms?`已收录 ${realFilms} 部正式作品，其余为演示素材。`:'当前为演示素材，正式作品待更新。'):'每一帧，都是另一种可能。';
  $('#design-grid').innerHTML = data.designs.map((d,i) => `<button class="design-card" data-design="${i}" aria-label="查看${esc(d.title)}作品集"><div class="design-image">${art(d)}<div class="design-image-label"><span>${esc(d.en)}</span><span aria-hidden="true">+</span></div></div><div class="design-card-caption"><h3>${esc(d.title)}</h3></div></button>`).join('');
  observeArt();
  const contactEmail = data.contact?.email;
  if (contactEmail) {
    const contactLink = $('#contact-email');
    contactLink.firstChild.textContent = contactEmail;
    contactLink.href = 'mailto:' + contactEmail;
    contactLink.setAttribute('aria-label','发送邮件联系 THORNE：' + contactEmail);
    $('#copy-email').addEventListener('click',async () => {
      try { await navigator.clipboard.writeText(contactEmail); $('#contact-status').textContent = '邮箱已复制'; }
      catch { $('#contact-status').textContent = '请复制上方邮箱'; }
    });
  }

  function cancelIntro() { introTimers.forEach(clearTimeout); introTimers = []; }
  function finishIntro() { intro.classList.add('finished'); document.body.classList.remove('intro-playing'); }
  function playIntro() {
    cancelIntro();
    if (!motion) { finishIntro(); return; }
    intro.classList.remove('running','exit','finished');
    document.body.classList.add('intro-playing');
    void intro.offsetWidth;
    intro.classList.add('running');
    introTimers.push(setTimeout(() => { intro.classList.add('exit'); document.body.classList.remove('intro-playing'); },1150), setTimeout(finishIntro,2650));
  }
  function applyMotion() {
    document.body.classList.toggle('motion-off',!motion);
    motionButton.setAttribute('aria-pressed',String(motion));
    $('.motion-label').textContent = motion?'动态开启':'动态关闭';
    $('#replay-intro').disabled = !motion;
    $('#replay-intro').title = motion?'重播开场':'开启动效后可重播';
    if (!motion) { cancelIntro(); finishIntro(); hideCursor(); window.FrameDissolve?.cancelAll(); }
    document.dispatchEvent(new CustomEvent('frame-motion-change',{detail:{enabled:motion}}));
  }
  motionButton.addEventListener('click',() => { motion = !motion; try { localStorage.setItem('frame-motion',motion?'on':'off'); } catch {} applyMotion(); });
  reduced.addEventListener('change',() => { motion = !reduced.matches; applyMotion(); });
  finePointer.addEventListener('change',hideCursor);
  $('#replay-intro').addEventListener('click',playIntro);

  // A selected preview is always silent, including after returning from the large player.
  function stopPreview() {
    previewSerial++;
    if (!selected) return;
    const video = selected.querySelector('video');
    video?.pause(); video?.classList.remove('playing');
    window.FrameDissolve?.cancel(selected);
    selected.classList.remove('selected','preview-failed','preview-revealed','preview-pending');
    selected.querySelector('.preview-hit').setAttribute('aria-pressed','false');
    selected = null;
  }
  function revealCover(card,item,video) {
    if (!motion || !window.FrameDissolve) return;
    window.FrameDissolve.reveal(card,item,video);
  }
  function selectPreview(card,replay=false) {
    if (viewer.open || closing || card.hidden || document.hidden) return;
    const existing = card.querySelector('.hover-video');
    if (selected === card && (card.classList.contains('preview-pending') || (existing && !existing.paused && !existing.ended))) {
      if (replay && !window.FrameDissolve?.isRunning(card)) revealCover(card,data.works[Number(card.dataset.work)],existing);
      return;
    }
    if (selected !== card) { stopPreview(); selected = card; }
    card.classList.add('selected');
    card.querySelector('.preview-hit').setAttribute('aria-pressed','true');
    const item = data.works[Number(card.dataset.work)];
    if (!item.video) return;
    let video = card.querySelector('video');
    if (!video) {
      video = document.createElement('video');
      video.className = 'hover-video'; video.muted = true; video.defaultMuted = true;
      video.loop = true; video.playsInline = true; video.preload = 'none';
      video.setAttribute('muted',''); video.setAttribute('aria-hidden','true'); video.src = item.preview || item.video;
      video.addEventListener('error',() => { video.classList.remove('playing'); card.classList.add('preview-failed'); });
      card.querySelector('.card-visual').append(video);
    }
    video.muted = true;
    const serial = ++previewSerial;
    card.classList.add('preview-pending');
    // Cover feedback belongs to selection, independently of video loading or buffering.
    revealCover(card,item,video);
    video.play().then(() => {
      if (serial === previewSerial && selected === card && !viewer.open && !document.hidden) {
        card.classList.remove('preview-failed','preview-pending');
        video.classList.add('playing');
      }
      else if (selected !== card || viewer.open || document.hidden) video.pause();
    }).catch(error => {
      if (serial !== previewSerial || selected !== card) return;
      card.classList.remove('preview-pending');
      if (error.name !== 'AbortError') card.classList.add('preview-failed');
    });
  }
  let lastTouchCard = null, lastTouchTime = 0;
  function openFilm(card) {
    if (viewer.open || closing || card.hidden) return;
    const shown = $$('.work-card').filter(c => !c.hidden);
    openViewer(shown.map(c => data.works[Number(c.dataset.work)]),shown.indexOf(card),card.querySelector('.preview-hit'));
  }
  $$('.work-card').forEach(card => {
    card.addEventListener('pointerenter',() => { if (finePointer.matches) selectPreview(card); });
    // Mouse exit ends pointer selection even when a previous click left keyboard focus here.
    card.addEventListener('pointerleave',() => { if (selected === card) stopPreview(); });
    card.addEventListener('focusin',e => { if (e.target.matches('.preview-hit')) selectPreview(card); });
    card.addEventListener('focusout',e => { if (selected === card && !card.contains(e.relatedTarget) && !card.matches(':hover')) stopPreview(); });
    card.addEventListener('click',e => selectPreview(card,e.detail<=1));
    card.querySelector('.preview-hit').addEventListener('dblclick',e => { e.preventDefault(); openFilm(card); });
    card.querySelector('.preview-hit').addEventListener('keydown',e => {
      if (e.key==='Enter') { e.preventDefault(); openFilm(card); }
    });
    card.querySelector('.preview-hit').addEventListener('pointerup',e => {
      if (e.pointerType!=='touch') return;
      const now=performance.now();
      if (lastTouchCard===card && now-lastTouchTime<340) { lastTouchCard=null; lastTouchTime=0; openFilm(card); }
      else { lastTouchCard=card; lastTouchTime=now; }
    });
  });
  $$('.filter').forEach(btn => btn.addEventListener('click',() => {
    stopPreview();
    $('#work-grid').dataset.filter = btn.dataset.filter;
    $$('.filter').forEach(b => { const active = b === btn; b.classList.toggle('active',active); b.setAttribute('aria-pressed',String(active)); });
    $$('.work-card').forEach(card => { card.hidden = btn.dataset.filter !== 'all' && card.dataset.category !== btn.dataset.filter; });
  }));

  function pauseMedia() {
    activePlayer?.destroy(); activePlayer = null;
    const video = media.querySelector('video');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    media.querySelectorAll('[data-sheet]').forEach(el => artObserver.unobserve(el));
    media.replaceChildren();
  }
  function renderViewer() {
    pauseMedia();
    const item = viewList[viewIndex];
    viewer.classList.toggle('is-design',!!item.gallery);
    viewer.classList.toggle('is-film',!item.gallery);
    $('#viewer-title').textContent = item.title + ' / ' + item.en;
    $('#viewer-label').textContent = item.gallery?'CONCEPT LAB':(item.category==='ad'?'COMMERCIAL / 广告':'AIGC FILM');
    $('#viewer-type').textContent = item.gallery ? '' : (item.genre || (item.demo?'演示 · ':'') + (item.category==='ad'?'商业概念影像':'AIGC 概念短片'));
    $('#viewer-description').textContent = item.description;
    if (item.gallery) {
      media.innerHTML = `<div class="design-gallery">${item.gallery.map(g => `<figure class="gallery-figure"><div class="gallery-image">${art(g)}</div><figcaption>${esc(g.title)}</figcaption></figure>`).join('')}</div>`;
      observeArt(media);
    } else if (item.video) {
      const video = document.createElement('video');
      video.controls = true; video.playsInline = true; video.preload = 'metadata'; video.autoplay = true;
      video.setAttribute('aria-label',item.title); video.src = item.video;
      video.addEventListener('error',() => {
        if (!media.contains(video)) return;
        activePlayer?.destroy(); activePlayer = null;
        media.innerHTML = `<div class="viewer-art">${art(item)}</div><div class="viewer-placeholder"><p>暂时无法播放，请稍后重试。</p></div>`;
        observeArt(media);
      },{once:true});
      media.append(video);
      try { if (window.FramePlayer) activePlayer = window.FramePlayer.attach(video,media,item.title); }
      catch { activePlayer = null; video.controls = true; media.replaceChildren(video); }
      video.play().catch(() => {});
    } else { media.innerHTML = `<div class="viewer-art">${art(item)}</div><div class="viewer-placeholder"><p>作品即将上线</p></div>`; observeArt(media); }
  }
  function openViewer(items,index,button) {
    clearTimeout(switchTimer); viewerSerial++; media.classList.remove('switching');
    viewList = items; viewIndex = index; opener = button;
    stopPreview(); hideCursor(); renderViewer();
    viewer.showModal(); viewer.append(cursor);
    document.body.style.overflow = 'hidden';
    document.documentElement.classList.add('viewer-open');
    document.dispatchEvent(new CustomEvent('frame-viewer-change',{detail:{open:true}}));
  }
  $$('.design-card').forEach(card => card.addEventListener('click',() => openViewer(data.designs,Number(card.dataset.design),card)));
  $('#close-viewer').addEventListener('click',() => viewer.close());
  viewer.addEventListener('close',() => {
    clearTimeout(switchTimer); viewerSerial++; media.classList.remove('switching');
    closing = true; stopPreview(); pauseMedia(); hideCursor(); document.body.append(cursor);
    document.body.style.overflow = ''; document.documentElement.classList.remove('viewer-open');
    document.dispatchEvent(new CustomEvent('frame-viewer-change',{detail:{open:false}}));
    opener?.focus({preventScroll:true}); closing = false;
  });
  function changeWork(delta) {
    viewIndex = (viewIndex+delta+viewList.length)%viewList.length;
    clearTimeout(switchTimer);
    const serial = ++viewerSerial;
    media.querySelector('video')?.pause();
    media.classList.add('switching');
    switchTimer = setTimeout(() => {
      if (!viewer.open || serial !== viewerSerial) return;
      renderViewer(); media.classList.remove('switching');
    },motion?130:0);
  }
  $('#prev-work').addEventListener('click',() => changeWork(-1));
  $('#next-work').addEventListener('click',() => changeWork(1));
  viewer.addEventListener('keydown',e => {
    if (e.target.tagName === 'VIDEO') return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); changeWork(e.key==='ArrowLeft'?-1:1); }
  });
  document.addEventListener('keydown',e => { if (e.key === 'Escape' && !intro.classList.contains('finished')) { cancelIntro(); finishIntro(); } });

  let cursorFrame=0, cursorX=0, cursorY=0;
  function hideCursor() { cancelAnimationFrame(cursorFrame); cursorFrame=0; cursor.classList.remove('visible'); document.body.classList.remove('cursor-enabled'); }
  document.addEventListener('pointermove',e => {
    if (!finePointer.matches || !motion || e.pointerType === 'touch') { hideCursor(); return; }
    const nativeControls = e.target.closest('video[controls],input,textarea,select');
    document.body.classList.toggle('cursor-enabled',!nativeControls);
    cursor.classList.toggle('visible',!nativeControls);
    cursor.classList.toggle('is-active',!!e.target.closest('a,button,.work-card'));
    cursorX=e.clientX; cursorY=e.clientY;
    if (!cursorFrame) cursorFrame=requestAnimationFrame(() => {
      cursor.style.translate = cursorX + 'px ' + cursorY + 'px'; cursorFrame=0;
    });
  },{passive:true});
  document.documentElement.addEventListener('pointerleave',hideCursor);
  window.addEventListener('blur',hideCursor);
  const hero = $('.hero'), heroArt = $('.hero-art');
  hero.addEventListener('pointermove',e => {
    if (!motion || !finePointer.matches) return;
    const r = hero.getBoundingClientRect(), x = (e.clientX/r.width-.5)*-3, y = ((e.clientY-r.top)/r.height-.5)*-3;
    heroArt.style.transform = `scale(1.025) translate(${x}px,${y}px)`;
  });
  hero.addEventListener('pointerleave',() => { heroArt.style.transform = 'scale(1.025)'; });
  const navObserver = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) $$('.nav-link').forEach(a => a.classList.toggle('current',a.getAttribute('href') === '#'+e.target.id));
  }),{rootMargin:'-15% 0px -60% 0px'});
  $$('#work,#design,#about').forEach(s => navObserver.observe(s));
  const previewObserver = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) { if (selected === e.target) stopPreview(); return; }
    if (motion) window.FrameDissolve?.prepare(e.target,data.works[Number(e.target.dataset.work)]).catch(() => {});
  }),{threshold:.08});
  $$('.work-card').forEach(card => previewObserver.observe(card));
  document.addEventListener('visibilitychange',() => {
    if (document.hidden) { stopPreview(); hideCursor(); media.querySelector('video')?.pause(); }
  });
  applyMotion(); playIntro();
})();
