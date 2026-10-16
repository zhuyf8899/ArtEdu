
/* ============================================================
   原子课程背景：提取自用户提供的 codefield.js（无依赖 / 2D Canvas）
   - 内容：随机分布的 ART&DESIGN / AI&DESIGN / FORM FOLLOWS FEELING /
     INPUT: CULTURE（全部大写），其余单元由三角形与方块符号随机填充
   - 短语单元稳定显示；符号单元随噪声流场产生疏密 / 聚散 / 流动
   - 只叠加内容，不铺底色：浅色底由 CSS 渐变负责，保证正文可读
   - 增量重绘（每帧只刷新一段单元格），DPR 自适应，离开视口暂停
   - prefers-reduced-motion：渲染一帧静态图案
   ============================================================ */
export function mountAtomic(root) {
  'use strict';

  var canvas = root.querySelector('#effect-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  var CW = 11, CH = 15;          /* 单元格尺寸（CSS px，越小越密） */
  var PHRASES = ['ART&DESIGN', 'AI&DESIGN', 'FORM FOLLOWS FEELING', 'INPUT: CULTURE'];
  var SYMBOLS = ['▲', '△', '■', '□'];
  var ALPHAS = [0.07, 0.13, 0.21, 0.30, 0.40];
  var PAL = [];                  /* 3 个色相区间 × 5 档透明度 */
  var FONT = '700 11px ui-monospace, SFMono-Regular, Menlo, "Courier New", monospace';

  var W = 0, H = 0, cols = 0, rows = 0, total = 0;
  var cacheChar = [], cachePal = [];
  var phraseChar = [], phraseHue = [], phraseSize = [];
  var cursor = 0, perFrame = 600, t = 0, lastTime = null;
  var raf = null, running = false, visible = true;

  /* ---------- 工具函数 ---------- */
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
    function f(p, q, x) {
      if (x < 0) x += 1; if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [Math.round(f(p, q, h + 1 / 3) * 255), Math.round(f(p, q, h) * 255), Math.round(f(p, q, h - 1 / 3) * 255)];
  }
  function buildPalette() {
    // MORPH LAB：紫色 / 深紫色 / 主题黄色。
    var colors = [[99,82,237], [125,107,239], [221,247,68]];
    PAL = [];
    colors.forEach(function(rgb, index) {
      ALPHAS.forEach(function(alpha) {
        PAL.push('rgba(' + rgb.join(',') + ',' + (index === 2 ? Math.min(0.85, alpha * 1.7) : alpha) + ')');
      });
    });
  }
  function hash(x, y) {
    var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  }
  function noise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function smoothstep(a, b, x) {
    var k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  }

  /* 密度 = 流动等高线带 × 大尺度团块遮罩（疏密 / 聚散，随时间缓慢变化） */
  function field(col, row) {
    var x = col * 0.095, y = row * 0.125;
    var n1 = noise(x + t * 1.9, y + t * 0.5);
    var n2 = noise(x * 2.35 - 40, y * 2.35 + t * 1.15);
    var v = 0.62 * n1 + 0.38 * n2;
    var band = Math.abs(Math.sin((v * 5.4 + t * 0.85) * Math.PI));
    var d = Math.pow(band, 2.5);

    var c1 = noise(col * 0.026 + 5.3, row * 0.030 - 9.1 + t * 0.20);   /* 大团块 */
    var c2 = noise(col * 0.058 - 21.4, row * 0.066 + t * 0.33);
    var c3 = noise(col * 0.075 - 3.3, row * 0.090 + 6.1 + t * 0.26);   /* 中频起伏 */
    var cluster = c1 * 0.44 + c2 * 0.24 + c3 * 0.32;
    var gate = smoothstep(0.40, 0.62, cluster);
    var booster = smoothstep(0.58, 0.80, cluster);
    d = d * (0.06 + 0.94 * gate) * (1 + 0.75 * booster);

    var hue = hash(col * 0.53 + 2.1, row * 0.71 + 5.7);   /* 廉价色相，省一次 noise */
    return [Math.min(1, d), hue];
  }

  /* ---------- 短语布局 ----------
     每行 3–6 条短语，位置与短语随机；少量空行 / 缺口，
     使英文约占一半单元格，且分布不均匀 */
  function planPhrases() {
    phraseChar = new Array(total).fill('');
    phraseHue = new Array(total).fill(-1);
    phraseSize = new Array(total).fill(0);

    var narrow = W < 700;
    var pool = narrow
      ? PHRASES.filter(function (p) { return p.length <= 11; })
      : PHRASES;
    var nMax = narrow ? 2 : 6;
    var nMin = narrow ? 1 : 3;

    for (var row = 0; row < rows; row++) {
      if (hash(row * 2.3 + 0.9, 5.1) < (narrow ? 0.3 : 0.14)) continue;   /* 空行，避免过于均匀 */
      /* 沿行推进：随机落在哪一段、间隔多宽、用多长的短语，都不均匀 */
      var col = Math.floor(hash(row * 8.3, 3.7) * 6);
      var step = 0;
      while (col < cols - 6 && step < 24) {
        step++;
        var r = hash(row * 3.3 + col * 0.37 + step * 1.9, 12.9);
        var zone = noise(col * 0.045 + 2.7, row * 0.055 + 4.1);   /* 短语同样成团分布 */
        if (r < 0.30 && zone > 0.33) {
          var ph = pool[Math.floor(hash(row * 5.1 + col * 0.71, 41.3) * pool.length) % pool.length];
          var len = ph.length;
          if (len > cols - col) { col += 3; continue; }
          var hb = Math.floor(hash(row * 1.7 + col * 0.53, 63.1) * 3) % 3;
          var fs = narrow
            ? 10 + Math.floor(hash(row * 2.1 + col * 1.7, 23.9) * 2)
            : 10 + Math.floor(hash(row * 2.1 + col * 1.7, 23.9) * 3);   /* 10 / 11 / 12 */
          for (var k = 0; k < len; k++) {
            var idx = row * cols + col + k;
            phraseChar[idx] = ph.charAt(k);
            phraseHue[idx] = hb;
            phraseSize[idx] = fs;
          }
          col += len + 1 + Math.floor(hash(row * 4.7 + col * 1.3, 88.1) * 4);   /* 词后小间隔 */
        } else {
          col += 3 + Math.floor(hash(row * 6.1 + col * 0.9, 55.5) * 7);          /* 大间隔，形成留白 */
        }
      }
    }
  }

  function paint(i) {
    var col = i % cols, row = (i / cols) | 0;
    var x = col * CW, y = row * CH;
    var f = field(col, row), d = f[0];
    /* 密度 → 档位：越低越容易熄灭（闪烁的来源）；阈值放低、曲线抬平 → 整体更密 */
    var bucket = d < 0.02 ? -1 : Math.min(ALPHAS.length - 1, Math.floor(Math.pow(d, 0.78) * 5.0));
    var ph = phraseChar[i];

    /* 1) 短语单元：同样随密度出现 / 淡出，出现时比符号更清楚一点 */
    if (ph) {
      if (bucket < 0) {
        if (cacheChar[i] !== '') { ctx.clearRect(x, y, CW + 1, CH + 1); cacheChar[i] = ''; cachePal[i] = -1; }
        return;
      }
      var pb = Math.max(2, bucket);
      var ppi = phraseHue[i] * ALPHAS.length + pb;
      if (cacheChar[i] === ph && cachePal[i] === ppi) return;
      ctx.clearRect(x, y, CW + 1, CH + 1);
      var fs = phraseSize[i] || 11;
      ctx.font = '700 ' + fs + 'px ui-monospace, SFMono-Regular, Menlo, "Courier New", monospace';
      ctx.fillStyle = PAL[ppi];
      ctx.fillText(ph, x + CW / 2, y + CH * 0.76);
      ctx.font = FONT;
      cacheChar[i] = ph; cachePal[i] = ppi;
      return;
    }

    /* 2) 符号单元 */
    if (bucket < 0) {
      if (cacheChar[i] !== '') { ctx.clearRect(x, y, CW + 1, CH + 1); cacheChar[i] = ''; cachePal[i] = -1; }
      return;
    }
    var si = Math.floor(hash(col * 2.7 + 0.7, row * 1.9 + 1.1) * SYMBOLS.length) % SYMBOLS.length;
    var hueIdx = f[1] < 0.35 ? 0 : f[1] < 0.68 ? 1 : 2;
    var pi = hueIdx * ALPHAS.length + bucket;
    var ch = SYMBOLS[si];
    if (cacheChar[i] === ch && cachePal[i] === pi) return;
    /* 符号单元加一点静态抖动，避免排成机械的等距栅格；
       紧邻短语单元的符号不抖动，保证短语笔画不被擦到 */
    var nearPhrase = phraseChar[i - 1] || phraseChar[i + 1] ||
                     phraseChar[i - cols] || phraseChar[i + cols];
    var jx = nearPhrase ? 0 : (hash(col * 6.1 + 2.3, row * 5.7 + 4.9) - 0.5) * 4;
    var jy = nearPhrase ? 0 : (hash(col * 3.3 + 8.1, row * 7.9 + 2.7) - 0.5) * 3.4;
    if (jx || jy) {
      ctx.clearRect(x + Math.min(0, jx) - 1, y + Math.min(0, jy) - 1,
                    CW + 2 + Math.abs(jx), CH + 2 + Math.abs(jy));
    } else {
      ctx.clearRect(x, y, CW + 1, CH + 1);
    }
    ctx.fillStyle = PAL[pi];
    ctx.fillText(ch, x + CW / 2 + jx, y + CH * 0.76 + jy);
    cacheChar[i] = ch; cachePal[i] = pi;
  }

  function sweep(n) {
    for (var k = 0; k < n; k++) {
      paint(cursor);
      cursor = (cursor + 1) % total;
    }
  }

  function frame(now) {
    raf = null;
    if (!running) return;
    var dt = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.04);
    lastTime = now;
    // 保留原来的时间尺度：60fps 时约每帧 0.011。
    t += dt * 0.66;
    sweep(perFrame);
    raf = requestAnimationFrame(frame);
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = FONT;
    cols = Math.ceil(W / CW);
    rows = Math.ceil(H / CH);
    total = cols * rows;
    cacheChar = new Array(total).fill('');
    cachePal = new Array(total).fill(-1);
    cursor = 0;
    perFrame = Math.max(280, Math.min(620, Math.ceil(total / 14)));
    ctx.clearRect(0, 0, W, H);
    planPhrases();
    sweep(total);
  }

  var paused = false;
  function start() {
    if (running || paused || reduceQuery.matches || !visible || document.hidden) return;
    running = true; lastTime = null;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null; lastTime = null;
  }
  function visibilityChange() { if (document.hidden) stop(); else start(); }
  function motionChange() { stop(); if (!reduceQuery.matches) start(); }
  buildPalette(); resize();
  var ro = new ResizeObserver(resize); ro.observe(canvas);
  var io = new IntersectionObserver(function(entries) {
    visible = entries[0].isIntersecting;
    if (visible) start(); else stop();
  }, {threshold: 0.02}); io.observe(canvas);
  document.addEventListener('visibilitychange', visibilityChange);
  reduceQuery.addEventListener('change', motionChange);
  start();
  // SPA 集成：卸载标题区时调用该方法。
  return function() {
    stop(); ro.disconnect(); io.disconnect();
    document.removeEventListener('visibilitychange', visibilityChange);
    reduceQuery.removeEventListener('change', motionChange);

  };


}
