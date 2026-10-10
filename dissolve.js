(() => {
  'use strict';
  const images = new Map(), running = new Map(), prepared = new WeakMap();
  let sequence = 0;
  function loadImage(url) {
    const absolute = new URL(url, document.baseURI).href;
    if (!images.has(absolute)) {
      const request = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image); image.onerror = reject; image.src = absolute;
      });
      images.set(absolute,request);
      request.catch(() => { if (images.get(absolute) === request) images.delete(absolute); });
    }
    return images.get(absolute);
  }
  function cancel(card, state = running.get(card)) {
    if (!state || running.get(card) !== state) return;
    state.cancelled = true; cancelAnimationFrame(state.frame);
    state.canvas?.remove(); running.delete(card);
  }
  function cancelAll() {
    [...running.keys()].forEach(card => {
      const video = card.querySelector('.hover-video');
      if (card.classList.contains('selected') && video?.readyState >= 2 && !video.paused) video.classList.add('playing');
      cancel(card);
    });
  }
  function prepare(card, item) {
    const visual = card.querySelector('.card-visual'), w = visual.clientWidth, h = visual.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 1.25);
    const key = [item.cover || item.sheet,item.cell,w,h,ratio].join('|');
    const cached = prepared.get(card);
    if (cached?.key === key) return cached.promise;
    const promise = (async () => {
      if (!w || !h) throw new Error('Preview has no area');
      const image = await loadImage(item.cover || 'assets/' + item.sheet);
      const surface = document.createElement('canvas');
      surface.width = Math.ceil(w * ratio); surface.height = Math.ceil(h * ratio);
      const painter = surface.getContext('2d');
      if (!painter) throw new Error('Canvas is unavailable');
      painter.scale(ratio,ratio);
      const sw = image.naturalWidth / (item.cover ? 1 : 3), sh = image.naturalHeight / (item.cover ? 1 : 2);
      const sx = item.cover ? 0 : (item.cell % 3) * sw, sy = item.cover ? 0 : Math.floor(item.cell / 3) * sh;
      const scale = Math.max(w / sw, h / sh), cropW = w / scale, cropH = h / scale;
      painter.drawImage(image,sx+(sw-cropW)/2,sy+(sh-cropH)/2,cropW,cropH,0,0,w,h);
      const unit = Math.max(12,Math.sqrt(w*h/440)), tiles = [];
      for (let row=0,y=0; y<h+unit; row++,y+=unit) {
        for (let x=(row%2)*unit; x<w+unit; x+=unit*2) {
          const nx = Math.max(0,Math.min(1,x/w)), ny = Math.max(0,Math.min(1,y/h));
          // The bottom-left to top-right diagonal separates the two particle fields.
          const left = nx+ny<1, vertical = left?ny:1-ny;
          const column = left?nx:1-nx;
          const distance = Math.min(60,h*.18)*(.9+.1*vertical);
          tiles.push({x,y,dy:(left?-1:1)*distance,delay:vertical*150+column*45,duration:620});
        }
      }
      // Clip each diamond once into a reusable sprite atlas, never inside the animation loop.
      const tileSize = Math.ceil((unit*2+1)*ratio), columns = Math.ceil(Math.sqrt(tiles.length));
      const atlas = document.createElement('canvas');
      atlas.width = columns*tileSize; atlas.height = Math.ceil(tiles.length/columns)*tileSize;
      const ctx = atlas.getContext('2d');
      if (!ctx) throw new Error('Canvas is unavailable');
      tiles.forEach((p,i) => {
        p.sx = (i%columns)*tileSize; p.sy = Math.floor(i/columns)*tileSize;
        ctx.save(); ctx.translate(p.sx+tileSize/2,p.sy+tileSize/2); ctx.scale(ratio,ratio);
        ctx.beginPath(); ctx.moveTo(0,-unit-.4); ctx.lineTo(unit+.4,0); ctx.lineTo(0,unit+.4); ctx.lineTo(-unit-.4,0); ctx.closePath(); ctx.clip();
        ctx.drawImage(surface,0,0,surface.width,surface.height,-p.x,-p.y,w,h); ctx.restore();
      });
      return {w,h,ratio,unit,tiles,atlas,tileSize};
    })();
    prepared.set(card,{key,promise});
    promise.catch(() => { if (prepared.get(card)?.promise === promise) prepared.delete(card); });
    return promise;
  }
  async function reveal(card, item, video) {
    cancel(card);
    const state = {cancelled:false,frame:0,canvas:null};
    running.set(card,state);
    const valid = () => !state.cancelled && card.classList.contains('selected') && card.contains(video);
    try {
      const {w,h,ratio,unit,tiles,atlas,tileSize} = await prepare(card,item);
      if (!valid()) { cancel(card,state); return false; }
      const marginX = 1, marginY = Math.min(84,h*.24+12);
      const canvas = document.createElement('canvas');
      canvas.className = 'cover-dissolve'; canvas.setAttribute('aria-hidden','true');
      canvas.width = Math.ceil((w+marginX*2)*ratio); canvas.height = Math.ceil((h+marginY*2)*ratio);
      Object.assign(canvas.style,{left:-marginX+'px',top:-marginY+'px',width:w+marginX*2+'px',height:h+marginY*2+'px'});
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is unavailable');
      ctx.scale(ratio,ratio); state.canvas = canvas;
      canvas.dataset.particles = String(tiles.length);
      canvas.dataset.renderer = 'sprite-atlas';
      canvas.dataset.run = String(++sequence);
      const draw = elapsed => {
        ctx.clearRect(0,0,w+marginX*2,h+marginY*2);
        for (const p of tiles) {
          const t = Math.max(0,Math.min(1,(elapsed-p.delay)/p.duration));
          if (t===1) continue;
          const travel=1-Math.pow(1-t,3), settle=t*t*(3-2*t), shrink=1-.68*settle;
          const fade=Math.max(0,Math.min(1,(t-.12)/.88));
          const y=p.y+p.dy*travel, spill=Math.max(0,-y,y-h);
          const edgeFade=1-Math.min(1,spill/(unit*1.5));
          ctx.globalAlpha=(1-fade*fade*(3-2*fade))*edgeFade;
          const size=tileSize/ratio*shrink;
          ctx.drawImage(atlas,p.sx,p.sy,tileSize,tileSize,marginX+p.x-size/2,marginY+y-size/2,size,size);
        }
      };
      draw(0); card.querySelector('.card-stage').append(canvas); card.classList.add('preview-revealed');
      // Start at the first rendered frame; a delayed frame must not skip the whole effect.
      let last = null, elapsed = 0;
      const tick = now => {
        if (!valid()) { cancel(card,state); return; }
        if (last !== null) elapsed += Math.min(Math.max(0,now-last),32);
        last = now; draw(elapsed);
        if (elapsed<880) state.frame=requestAnimationFrame(tick);
        else cancel(card,state);
      };
      state.frame=requestAnimationFrame(tick);
      return true;
    } catch {
      if (valid() && video.readyState >= 2 && !video.paused) video.classList.add('playing');
      cancel(card,state);
      return false;
    }
  }
  window.FrameDissolve = {reveal,prepare,cancel,cancelAll,isRunning:card=>running.has(card)};
  window.addEventListener('resize',cancelAll,{passive:true});
})();
