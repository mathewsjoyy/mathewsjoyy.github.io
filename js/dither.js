/*
 * Hero band: animated duotone ordered (Bayer) dither, disturbed by the cursor
 * like the surface of water.
 *
 * The source photo is drawn into a deliberately small canvas, its luminance is
 * quantised against an 8x8 Bayer matrix onto a short ramp of magenta inks (a
 * two-colour print look: shadows carry the most ink), then CSS upscales it with
 * `image-rendering: pixelated`. The matrix is fixed in screen space while the
 * photo drifts very slowly underneath it, so the dot pattern reorganises over
 * time without ever boiling.
 *
 * Pointer movement drops energy into a height field that is stepped with the
 * classic two-buffer wave equation. Its gradient displaces the *source sample
 * coordinates* of the dither pass, so ripples spread out behind the cursor and
 * fade. Because the Bayer threshold is still indexed by output x/y, the matrix
 * stays pinned to the screen and the dots reorganise rather than smear.
 *
 * Everything is client-side and same-origin: no build step, no network calls,
 * no external dependencies. Falls back to the plain <img> if unavailable.
 */
(function () {
  "use strict";

  /* —— Tuning —————————————————————————————————————————————
   * PIXEL     size of one dither cell in CSS px (bigger = chunkier)
   * PALETTE   ink ramp, darkest first; luminance level n paints PALETTE[n].
   *           More entries = gentler flicker, since a cell flipping then moves
   *           a smaller share of the range.
   * SPREAD    dither strength; 1 = full ordered dither, <1 = flatter
   * GAMMA     <1 lifts shadows. This is a night scene, so it is lifted hard,
   *           otherwise the whole sky lands on the darkest ink as one slab.
   * CONTRAST  applied around mid-grey after gamma
   * EXPOSURE  flat additive lift, post-contrast
   * KNEE/CEIL highlight compression, so bright areas keep dot texture
   * FOCUS_Y   vertical framing of the photo, 0 = top, 1 = bottom. Must match
   *           the object-position y on .hero__photo so the fallback frames alike.
   * DRIFT     overall multiplier on the pan/zoom motion. Lower = calmer.
   *           Set to 0 for a completely still image.
   * FPS       idle render cap; the drift is slow enough that this can stay low
   */
  var PIXEL = 2;
  var PALETTE = [
    [158, 0, 88], //   #9E0058
    [230, 25, 140], // #E6198C
    [236, 111, 176], // #EC6FB0
    [246, 196, 222], // #F6C4DE
  ];
  var LEVELS = PALETTE.length;
  var SPREAD = 1;
  var GAMMA = 0.6;
  var CONTRAST = 1.05;
  var EXPOSURE = 0.08;
  var KNEE = 0.8;
  var CEIL = 0.96;
  var FOCUS_Y = 0.8;
  var DRIFT = 0.3;
  var FPS = 15;
  var MAX_BUFFER_W = 900;

  /* —— Ripple tuning ——————————————————————————————————————
   * The wave sim runs on a grid at half the buffer's resolution; that is well
   * below the eye's threshold for a displacement field this smooth, and it
   * keeps the step down around a millisecond.
   *
   * RIPPLE      displacement ceiling in buffer px. This is a safety rail against
   *             a wild flick stacking drops, not the main shaping control — with
   *             the gain below, a normal sweep peaks just under it and never
   *             clips, which matters because a clipped crest goes flat and reads
   *             as a hard edge instead of water.
   * RIPPLE_GAIN height gradient -> buffer px. Measured over a representative
   *             sweep, the raw central difference peaks around 0.87, so 5.5 puts
   *             the peak at ~4.8px. Raise for choppier water.
   * RIPPLE_DAMP per-frame decay of the height field.
   * DROP/RADIUS amplitude and grid-cell radius of one pointer stamp.
   * FPS_RIPPLE  render cap while the surface is moving. Waves at 15fps strobe;
   *             30 is smooth and still leaves most of the frame budget unused.
   *
   * Displacement is deliberately whole-pixel: sub-pixel sampling would need
   * interpolation, and interpolation is exactly the softness this whole effect
   * exists to avoid.
   */
  var RIPPLE = 5;
  var RIPPLE_GAIN = 5.5;
  var RIPPLE_DAMP = 0.978;
  var RIPPLE_DROP = 1.2;
  var RIPPLE_RADIUS = 3;
  var FPS_RIPPLE = 30;

  var canvas = document.querySelector(".hero__dither");
  var photo = document.querySelector(".hero__photo");
  if (!canvas || !photo || !canvas.getContext) return;

  var ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!ctx) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /*
   * Ripples are a cursor affordance, so they are limited to devices that have
   * a cursor. On touch the hero is scroll territory, and a per-frame sim there
   * would only cost battery for an interaction nobody can perform.
   */
  var rippleOn =
    !reduceMotion && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* —— Bayer matrix ——
   * Recursive construction: M(2n) = [4M+0 4M+2 ; 4M+3 4M+1].
   * Normalised to -0.5..+0.5, i.e. plus or minus half a quantisation step.
   */
  function bayer(order) {
    var m = [[0]];
    var size = 1;
    while (size < order) {
      var next = [];
      for (var y = 0; y < size * 2; y++) next.push(new Array(size * 2));
      for (var j = 0; j < size; j++) {
        for (var i = 0; i < size; i++) {
          var v = m[j][i] * 4;
          next[j][i] = v;
          next[j][i + size] = v + 2;
          next[j + size][i] = v + 3;
          next[j + size][i + size] = v + 1;
        }
      }
      m = next;
      size *= 2;
    }
    return m;
  }

  var N = 8;
  var matrix = bayer(N);
  var thresholds = new Float32Array(N * N);
  for (var my = 0; my < N; my++) {
    for (var mx = 0; mx < N; mx++) {
      thresholds[my * N + mx] = ((matrix[my][mx] + 0.5) / (N * N) - 0.5) * SPREAD;
    }
  }

  var q = LEVELS - 1;

  /* —— Tone curve ——
   * greyQ[l] is the graded luminance of input luma l, pre-scaled into 0..q so
   * the inner loop is a lookup, an add and a round.
   */
  var greyQ = new Float32Array(256);
  for (var l = 0; l < 256; l++) {
    var v = Math.pow(l / 255, GAMMA);
    v = (v - 0.5) * CONTRAST + 0.5 + EXPOSURE;
    if (v > KNEE) v = KNEE + ((v - KNEE) * (CEIL - KNEE)) / (1 - KNEE);
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    greyQ[l] = v * q;
  }

  // Flattened so the pixel loop reads three bytes without touching nested arrays.
  var inks = new Uint8Array(LEVELS * 3);
  for (var p = 0; p < LEVELS; p++) inks.set(PALETTE[p], p * 3);

  var bufW = 0;
  var bufH = 0;

  /* —— Ripple state ——
   * heightA/heightB are ping-ponged by the wave step. gradX/gradY hold that
   * field's gradient baked down to whole buffer pixels — Int8 is plenty, since
   * one buffer pixel is already two CSS px of a deliberately chunky image, so
   * there is nothing for sub-pixel displacement to resolve.
   *
   * The one-cell border of the grid is never written, so it stays at zero and
   * waves reflect off it, which is what keeps ripples inside the frame.
   */
  var gridW = 0;
  var gridH = 0;
  var heightA = null;
  var heightB = null;
  var gradX = null;
  var gradY = null;
  var srcPix = null;
  // Set by pointer input, cleared once the field stops displacing anything.
  var wet = false;

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var cssW = rect.width || window.innerWidth;
    var cssH = rect.height || window.innerHeight;
    var w = Math.max(2, Math.round(cssW / PIXEL));
    var h = Math.max(2, Math.round(cssH / PIXEL));
    if (w > MAX_BUFFER_W) {
      h = Math.max(2, Math.round((h * MAX_BUFFER_W) / w));
      w = MAX_BUFFER_W;
    }
    if (w === bufW && h === bufH) return false;
    bufW = canvas.width = w;
    bufH = canvas.height = h;
    allocRipple();
    return true;
  }

  function allocRipple() {
    if (!rippleOn) return;
    /*
     * Round the half-resolution grid *up*: the pixel loop indexes it with
     * `x >> 1`, so an odd buffer width — which Math.round happily produces —
     * would otherwise let the last column read past the end of its grid row.
     * Out-of-range typed-array reads give undefined, which poisons the sample
     * coordinate to NaN and paints the edge black.
     */
    gridW = Math.max(4, (bufW + 1) >> 1);
    gridH = Math.max(4, (bufH + 1) >> 1);
    var cells = gridW * gridH;
    heightA = new Float32Array(cells);
    heightB = new Float32Array(cells);
    gradX = new Int8Array(cells);
    gradY = new Int8Array(cells);
    srcPix = new Uint8ClampedArray(bufW * bufH * 4);
    calm();
  }

  function calm() {
    wet = false;
    pending = false;
    lastGx = -1;
    if (!gradX) return;
    heightA.fill(0);
    heightB.fill(0);
    gradX.fill(0);
    gradY.fill(0);
  }

  /* —— Source framing ——
   * Cover-fit the photo to the buffer, then apply a very slow zoom/pan. The
   * periods are mutually irrational-ish so the loop never visibly repeats.
   */
  function drawSource(seconds) {
    var iw = photo.naturalWidth;
    var ih = photo.naturalHeight;
    if (!iw || !ih) return false;

    var cover = Math.max(bufW / iw, bufH / ih);
    var zoom = 1.04 + Math.sin(seconds * 0.021) * 0.02 * DRIFT;
    var sw = bufW / cover / zoom;
    var sh = bufH / cover / zoom;
    var sx = (iw - sw) / 2 + Math.sin(seconds * 0.017) * sw * 0.018 * DRIFT;
    var sy = (ih - sh) * FOCUS_Y + Math.cos(seconds * 0.013) * sh * 0.014 * DRIFT;
    // The drift can push past the photo's bottom edge when FOCUS_Y is near 1.
    sy = Math.max(0, Math.min(ih - sh, sy));

    ctx.drawImage(photo, sx, sy, sw, sh, 0, 0, bufW, bufH);
    return true;
  }

  /* —— Wave step ——
   * Two-buffer discrete wave equation: a cell's next height is the mean of its
   * four neighbours' current heights minus its own previous height, damped.
   * Subtracting the previous value is what carries momentum, and therefore what
   * makes a disturbance travel outward as a ring instead of just sagging back.
   */
  function stepWaves() {
    var cur = heightA;
    var prev = heightB;
    var w = gridW;
    for (var y = 1; y < gridH - 1; y++) {
      var i = y * w + 1;
      for (var x = 1; x < w - 1; x++, i++) {
        prev[i] = ((cur[i - 1] + cur[i + 1] + cur[i - w] + cur[i + w]) * 0.5 - prev[i]) * RIPPLE_DAMP;
      }
    }
    // prev now holds the new surface
    heightA = prev;
    heightB = cur;
  }

  /*
   * Central differences, pre-scaled and clamped so the pixel loop only looks up.
   * Returns the peak magnitude, which is how the surface decides when it has
   * gone still: Int8 assignment truncates toward zero, so once the peak drops
   * below 1 every cell has already become a no-op. That measurement is what
   * ends the animation rather than a fixed timer — a big splash gets the longer
   * settle it earns, and a small one stops paying for frames almost at once.
   */
  function bakeGradients() {
    var h = heightA;
    var w = gridW;
    var peak = 0;
    for (var y = 1; y < gridH - 1; y++) {
      var i = y * w + 1;
      for (var x = 1; x < w - 1; x++, i++) {
        var dx = (h[i - 1] - h[i + 1]) * RIPPLE_GAIN;
        var dy = (h[i - w] - h[i + w]) * RIPPLE_GAIN;
        if (dx > peak) peak = dx;
        else if (-dx > peak) peak = -dx;
        if (dy > peak) peak = dy;
        else if (-dy > peak) peak = -dy;
        gradX[i] = dx < -RIPPLE ? -RIPPLE : dx > RIPPLE ? RIPPLE : dx;
        gradY[i] = dy < -RIPPLE ? -RIPPLE : dy > RIPPLE ? RIPPLE : dy;
      }
    }
    return peak;
  }

  // One pointer stamp: a squared-falloff dimple, so edges blend instead of clicking.
  function drop(cx, cy, amp) {
    var r = RIPPLE_RADIUS;
    var x0 = Math.max(1, cx - r);
    var x1 = Math.min(gridW - 2, cx + r);
    var y0 = Math.max(1, cy - r);
    var y1 = Math.min(gridH - 2, cy + r);
    var rr = r * r;
    for (var y = y0; y <= y1; y++) {
      var dy = y - cy;
      var row = y * gridW;
      for (var x = x0; x <= x1; x++) {
        var dx = x - cx;
        var d2 = dx * dx + dy * dy;
        if (d2 > rr) continue;
        var f = 1 - d2 / rr;
        heightA[row + x] -= amp * f * f;
      }
    }
  }

  /* —— Pointer ——
   * Listened for on the window rather than the canvas: .hero__content sits at
   * z-index 5, so canvas-targeted events would die wherever the copy is, which
   * is most of where the cursor actually goes.
   *
   * The handler only records where the cursor got to; the actual stamping
   * happens once per rendered frame in stampTrail(). That matters more than it
   * looks: pointermove fires at the mouse's polling rate, so stamping inline
   * would let a 1000Hz gaming mouse pour roughly eight times the energy into
   * the surface that a 125Hz one does for the very same gesture. Coalescing
   * makes the wake depend on how far the cursor moved, not how often it
   * reported — and it bounds what one frame can inject, which measurably keeps
   * frantic scribbling from saturating the field.
   */
  var lastGx = -1;
  var lastGy = -1;
  var pendGx = 0;
  var pendGy = 0;
  var pending = false;
  var canvasRect = null;

  function onPointerMove(e) {
    if (!gradX || e.pointerType === "touch") return;
    if (!canvasRect) canvasRect = canvas.getBoundingClientRect();
    var r = canvasRect;
    if (!r.width || !r.height) return;

    var u = (e.clientX - r.left) / r.width;
    var v = (e.clientY - r.top) / r.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) {
      // Left the hero; the next entry starts a fresh trail rather than drawing
      // a wake across everything the cursor skipped in between.
      lastGx = -1;
      pending = false;
      return;
    }

    pendGx = u * (gridW - 1);
    pendGy = v * (gridH - 1);
    pending = true;
    wet = true;
  }

  function stampTrail() {
    if (!pending) return;
    pending = false;

    if (lastGx < 0) {
      drop(pendGx | 0, pendGy | 0, RIPPLE_DROP * 0.5);
    } else {
      /*
       * Stamping along the segment between the last frame's position and this
       * one is what makes the wake read as a continuous trail rather than a
       * dotted line, and scaling amplitude by distance means a slow, considered
       * movement disturbs the surface less than a flick. The step cap keeps a
       * single frantic frame bounded; past it the stamps just space out, which
       * is invisible at the speed required to hit it.
       */
      var dx = pendGx - lastGx;
      var dy = pendGy - lastGy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var steps = Math.min(12, Math.max(1, Math.round(dist / (RIPPLE_RADIUS * 0.75))));
      var amp = RIPPLE_DROP * (0.35 + 0.65 * Math.min(1, dist / 14));
      for (var k = 1; k <= steps; k++) {
        var t = k / steps;
        drop((lastGx + dx * t) | 0, (lastGy + dy * t) | 0, amp);
      }
    }

    lastGx = pendGx;
    lastGy = pendGy;
  }

  /*
   * `warping` is loop-invariant, so the branch inside the pixel loop costs
   * essentially nothing, and folding the displaced read into this pass rather
   * than running a separate warp pass matters a lot: measured on a 712x450
   * buffer, merged is +1.1ms over the plain loop where a standalone warp pass
   * is +5.4ms. Scattered reads are the expense, so we pay for them once.
   */
  function dither(warping) {
    var frame = ctx.getImageData(0, 0, bufW, bufH);
    var d = frame.data;
    var read = d;
    if (warping) {
      srcPix.set(d);
      read = srcPix;
    }
    var last = bufW - 1;
    var bottom = bufH - 1;

    for (var y = 0; y < bufH; y++) {
      var row = (y & 7) * N;
      var i = y * bufW * 4;
      var gRow = warping ? (y >> 1) * gridW : 0;
      for (var x = 0; x < bufW; x++, i += 4) {
        var si = i;
        if (warping) {
          var gi = gRow + (x >> 1);
          var sx2 = x + gradX[gi];
          var sy2 = y + gradY[gi];
          if (sx2 < 0) sx2 = 0;
          else if (sx2 > last) sx2 = last;
          if (sy2 < 0) sy2 = 0;
          else if (sy2 > bottom) sy2 = bottom;
          si = (sy2 * bufW + sx2) << 2;
        }

        var r = read[si];
        var g = read[si + 1];
        var b = read[si + 2];

        // Integer Rec.709 luma: (77R + 150G + 29B) >> 8
        var luma = (r * 77 + g * 150 + b * 29) >> 8;

        // Grade, dither, quantise to an ink level, then paint that ink.
        var lv = greyQ[luma] + thresholds[row + (x & 7)];
        lv = lv < 0 ? 0 : lv > q ? q : (lv + 0.5) | 0;
        var k = lv * 3;
        d[i] = inks[k];
        d[i + 1] = inks[k + 1];
        d[i + 2] = inks[k + 2];
      }
    }
    ctx.putImageData(frame, 0, 0);
  }

  var live = false;

  function render(seconds) {
    if (!drawSource(seconds)) return;

    var warping = false;
    if (wet) {
      stampTrail();
      stepWaves();
      warping = true;
      // Below one whole pixel the field can no longer move anything, so zeroing
      // it here is a no-op visually and stops us paying for frames.
      if (bakeGradients() < 1) calm();
    }

    dither(warping);
    if (!live) {
      live = true;
      canvas.classList.add("is-live");
      document.documentElement.classList.add("dither-live");
    }
  }

  var running = false;
  var rafId = 0;
  var lastFrame = 0;
  var idleInterval = 1000 / FPS;
  var rippleInterval = 1000 / FPS_RIPPLE;

  function loop(now) {
    rafId = window.requestAnimationFrame(loop);
    // Spend the higher frame rate only while there is water to move.
    var interval = wet ? rippleInterval : idleInterval;
    if (now - lastFrame < interval) return;
    lastFrame = now;
    render(now / 1000);
  }

  function start() {
    if (running) return;
    running = true;
    lastFrame = 0;
    rafId = window.requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  // The loop has to run if either the drift or the ripples need it.
  var animated = !reduceMotion && (DRIFT !== 0 || rippleOn);

  function begin() {
    resize();
    if (!animated) {
      render(0);
      return;
    }
    start();
  }

  if (photo.complete && photo.naturalWidth) {
    begin();
  } else {
    photo.addEventListener("load", begin, { once: true });
  }

  if (rippleOn) {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    // The canvas rect is cached per burst of movement; anything that can move
    // the hero relative to the viewport invalidates it.
    window.addEventListener(
      "scroll",
      function () {
        canvasRect = null;
      },
      { passive: true }
    );
  }

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    canvasRect = null;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      if (resize() && !running) render(0);
    }, 150);
  });

  // Don't burn CPU on a backgrounded tab.
  document.addEventListener("visibilitychange", function () {
    if (!animated) return;
    if (document.hidden) {
      stop();
      // Drop the surface rather than resuming mid-ripple against a cursor that
      // may have moved anywhere in the meantime.
      calm();
    } else if (live || (photo.complete && photo.naturalWidth)) {
      canvasRect = null;
      start();
    }
  });
})();
