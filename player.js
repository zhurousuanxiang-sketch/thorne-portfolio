/* Compact, accessible film controls. The native player remains the fallback. */
(() => {
  'use strict';
  const icons = {
    play:'<path d="m9 5 11 7-11 7Z"/>',
    pause:'<path d="M8 5v14M16 5v14"/>',
    sound:'<path d="m11 4-5 4H3v8h3l5 4ZM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/>',
    mute:'<path d="m11 4-5 4H3v8h3l5 4ZM16 9l5 6m0-6-5 6"/>',
    expand:'<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
    collapse:'<path d="M4 9h5V4m6 0v5h5M9 20v-5H4m16 0h-5v5"/>'
  };
  const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
  let preferredMuted = false, preferredVolume = 1;
  const time = value => {
    const seconds = Math.max(0,Math.floor(Number.isFinite(value)?value:0));
    const minutes = Math.floor(seconds/60), tail = String(seconds%60).padStart(2,'0');
    return minutes>=60?`${Math.floor(minutes/60)}:${String(minutes%60).padStart(2,'0')}:${tail}`:`${String(minutes).padStart(2,'0')}:${tail}`;
  };
  window.FramePlayer = {
    attach(video,media,title) {
      video.muted = preferredMuted; video.volume = preferredVolume;
      const root = document.createElement('div');
      root.className = 'film-player'; root.tabIndex = 0;
      root.setAttribute('aria-label',title+'播放器');
      root.innerHTML = `<div class="film-picture"></div><div class="player-controls" role="group" aria-label="视频播放控制"><button class="player-button player-toggle" aria-label="播放视频">${svg('play')}</button><input class="player-seek" type="range" min="0" max="1000" step="1" value="0" disabled aria-label="播放进度"><span class="player-time"><span class="player-current">00:00</span><span class="player-divider"> / </span><span class="player-duration">00:00</span></span><button class="player-button player-mute" aria-label="静音" aria-pressed="false">${svg('sound')}</button><input class="player-volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="音量"><button class="player-button player-fullscreen" aria-label="全屏播放">${svg('expand')}</button></div><span class="player-message" role="status"></span>`;
      media.append(root); root.querySelector('.film-picture').append(video);
      video.controls = false;
      const toggle = root.querySelector('.player-toggle'), seek = root.querySelector('.player-seek');
      const current = root.querySelector('.player-current'), duration = root.querySelector('.player-duration');
      const mute = root.querySelector('.player-mute'), volume = root.querySelector('.player-volume');
      const fullscreen = root.querySelector('.player-fullscreen'), message = root.querySelector('.player-message');
      const cleanups = [];
      let previousVolume = video.volume || 1, messageTimer;
      const on = (target,event,handler) => { target.addEventListener(event,handler); cleanups.push(() => target.removeEventListener(event,handler)); };
      const notify = text => { clearTimeout(messageTimer); message.textContent = text; messageTimer = setTimeout(() => {message.textContent = '';},2200); };
      function syncPlayback() {
        const paused = video.paused || video.ended;
        toggle.innerHTML = svg(paused?'play':'pause');
        toggle.setAttribute('aria-label',paused?'播放视频':'暂停视频');
        root.classList.toggle('is-paused',paused);
      }
      function syncTime() {
        const ready = Number.isFinite(video.duration) && video.duration>0;
        const progress = ready?Math.min(1000,video.currentTime/video.duration*1000):0;
        seek.disabled = !ready; seek.value = String(progress);
        seek.style.setProperty('--progress',`${progress/10}%`);
        current.textContent = time(video.currentTime); duration.textContent = time(video.duration);
        seek.setAttribute('aria-valuetext',`${time(video.currentTime)} / ${time(video.duration)}`);
      }
      function syncAudio() {
        preferredMuted = video.muted; preferredVolume = video.volume;
        const silent = video.muted || video.volume===0;
        mute.innerHTML = svg(silent?'mute':'sound');
        mute.setAttribute('aria-label',silent?'开启声音':'静音');
        mute.setAttribute('aria-pressed',String(silent));
        volume.value = String(video.muted?0:video.volume);
        volume.style.setProperty('--progress',`${Number(volume.value)*100}%`);
      }
      function togglePlayback() {
        if (!video.paused && !video.ended) { video.pause(); return; }
        if (video.ended) video.currentTime = 0;
        video.play().catch(() => notify('点击播放重试'));
      }
      function toggleAudio() {
        if (video.muted || video.volume===0) { video.muted = false; if (video.volume===0) video.volume = previousVolume; }
        else { previousVolume = video.volume; video.muted = true; }
        syncAudio();
      }
      function seekTo(seconds) {
        if (!Number.isFinite(video.duration) || video.duration<=0) return;
        video.currentTime = Math.max(0,Math.min(video.duration,seconds)); syncTime();
      }
      function syncFullscreen() {
        const active = document.fullscreenElement===root || !!video.webkitDisplayingFullscreen;
        fullscreen.innerHTML = svg(active?'collapse':'expand');
        fullscreen.setAttribute('aria-label',active?'退出全屏':'全屏播放');
      }
      async function toggleFullscreen() {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else if (root.requestFullscreen) await root.requestFullscreen();
          else if (video.webkitEnterFullscreen) { video.controls = true; video.webkitEnterFullscreen(); }
          else notify('当前浏览器已使用大屏播放');
        } catch { notify('当前浏览器已使用大屏播放'); }
      }
      on(toggle,'click',togglePlayback); on(video,'click',togglePlayback);
      on(mute,'click',toggleAudio); on(fullscreen,'click',toggleFullscreen);
      on(seek,'input',() => seekTo(Number(seek.value)/1000*video.duration));
      on(volume,'input',() => { video.volume = Number(volume.value); video.muted = false; if (video.volume>0) previousVolume = video.volume; syncAudio(); });
      ['play','pause','ended'].forEach(event => on(video,event,syncPlayback));
      ['loadedmetadata','durationchange','timeupdate','seeked'].forEach(event => on(video,event,syncTime));
      on(video,'volumechange',syncAudio);
      on(document,'fullscreenchange',syncFullscreen);
      on(video,'webkitbeginfullscreen',syncFullscreen);
      on(video,'webkitendfullscreen',() => { video.controls = false; syncFullscreen(); });
      on(root,'keydown',event => {
        if (event.target.matches('input,button')) {
          if (event.key==='ArrowLeft' || event.key==='ArrowRight') event.stopPropagation();
          return;
        }
        if (event.key===' ' || event.key.toLowerCase()==='k') {event.preventDefault(); event.stopPropagation(); togglePlayback();}
        if (event.key==='ArrowLeft' || event.key==='ArrowRight') {event.preventDefault(); event.stopPropagation(); seekTo(video.currentTime+(event.key==='ArrowLeft'?-5:5));}
        if (event.key.toLowerCase()==='m') {event.preventDefault(); event.stopPropagation(); toggleAudio();}
        if (event.key.toLowerCase()==='f') {event.preventDefault(); event.stopPropagation(); toggleFullscreen();}
      });
      syncPlayback(); syncTime(); syncAudio();
      return {destroy() { clearTimeout(messageTimer); cleanups.forEach(cleanup => cleanup()); }};
    }
  };
})();
