/* ============================================================================
   AERO X-9 · ui.js
   HUD binding: telemetry, module index, exploded-view labels with leader
   lines, dock controls, tooltip, toasts, boot overlay.
   ========================================================================== */
(function () {
  'use strict';
  var A = window.AERO;

  A.createUI = function (opts) {
    var drone = opts.drone;
    var actions = opts.actions || {};
    var parts = drone.parts;
    var SVGNS = 'http://www.w3.org/2000/svg';

    function $(id) { return document.getElementById(id); }
    var els = {
      boot: $('boot'), bootFill: $('boot-fill'), bootPct: $('boot-pct'),
      bootStage: $('boot-stage'), bootLog: $('boot-log'),
      alt: $('t-alt'), spd: $('t-spd'), bat: $('t-bat'), thr: $('t-thr'),
      barAlt: $('bar-alt'), barSpd: $('bar-spd'), barBat: $('bar-bat'), barThr: $('bar-thr'),
      statBat: $('stat-bat'),
      pitch: $('t-pitch'), roll: $('t-roll'), hdg: $('t-hdg'), rpm: $('t-rpm'),
      attRoll: $('att-roll'), attPitch: $('att-pitch'),
      fps: $('fps'), clock: $('clock'),
      partsList: $('parts-list'),
      piIdx: $('pi-idx'), piName: $('pi-name'), piEn: $('pi-en'), piTag: $('pi-tag'),
      piDesc: $('pi-desc'), piSpecs: $('pi-specs'),
      btnExplode: $('btn-explode'), explodeLabel: $('explode-label'), explodeSub: $('explode-sub'),
      explodePct: $('explode-pct'), explodeRange: $('explode-range'),
      btnFlight: $('btn-flight'), btnCruise: $('btn-cruise'), btnOrbit: $('btn-orbit'),
      btnReset: $('btn-reset'), btnSound: $('btn-sound'),
      sndOn: $('snd-on'), sndOff: $('snd-off'),
      labels: $('labels'), labelLines: $('label-lines'),
      tooltip: $('tooltip'), toast: $('toast'), hud: $('hud'),
      cx: $('cx'), cy: $('cy'), cz: $('cz'), chdg: $('chdg'), cmode: $('cmode')
    };

    var uiState = { selectedId: null, exploded: false, mode: 'observe', cruise: false, autoOrbit: true, sound: false };

    /* ------------------------------------------------------------ label geometry */
    var LABEL_CONF = {
      props: { a: 300 }, motors: { a: 335 }, arms: { a: 15 },
      canopy: { a: 220 }, fc: { a: 178 }, battery: { a: 140 },
      gimbal: { a: 55 }, skids: { a: 95 }, antenna: { a: 255 }
    };
    var labels = [];
    parts.forEach(function (part) {
      var line = document.createElementNS(SVGNS, 'polyline');
      line.setAttribute('class', 'pl-line');
      var dot = document.createElementNS(SVGNS, 'circle');
      dot.setAttribute('class', 'pl-dot');
      dot.setAttribute('r', '2.4');
      var el = document.createElement('div');
      el.className = 'part-label';
      el.innerHTML = '<span class="pl-i">' + part.idx + '</span>' +
        '<span class="pl-t"><b>' + part.cn + '</b><i>' + part.en + '</i></span>';
      els.labelLines.appendChild(line);
      els.labelLines.appendChild(dot);
      els.labels.appendChild(el);
      labels.push({ part: part, line: line, dot: dot, el: el });
    });

    /* ------------------------------------------------------------- parts list */
    parts.forEach(function (part) {
      var row = document.createElement('div');
      row.className = 'mod-row';
      row.dataset.id = part.id;
      row.innerHTML = '<span class="idx">' + part.idx + '</span>' +
        '<div class="nm"><b>' + part.cn + '</b><i>' + part.en + '</i></div>' +
        '<span class="st">OK</span>';
      row.addEventListener('click', function () {
        actions.selectPart && actions.selectPart(part.id, 'list');
      });
      row.addEventListener('mouseenter', function () {
        actions.hoverPart && actions.hoverPart(part.id);
      });
      row.addEventListener('mouseleave', function () {
        actions.hoverPart && actions.hoverPart(null);
      });
      part._row = row;
      els.partsList.appendChild(row);
    });

    /* ---------------------------------------------------------------- controls */
    var range = els.explodeRange;
    function paintRange(pct) {
      range.style.setProperty('--fill', pct + '%');
    }
    els.btnExplode.addEventListener('click', function () { actions.toggleExplode && actions.toggleExplode(); });
    range.addEventListener('input', function () {
      var t = parseFloat(range.value) / 1000;
      actions.setExplode && actions.setExplode(t);
    });
    range.addEventListener('change', function () {
      // release focus so global shortcuts (H/F/E/R...) keep working
      try { range.blur(); } catch (e) { }
    });
    els.btnFlight.addEventListener('click', function () { actions.toggleFlight && actions.toggleFlight(); });
    els.btnCruise.addEventListener('click', function () { actions.toggleCruise && actions.toggleCruise(); });
    els.btnOrbit.addEventListener('click', function () { actions.toggleOrbit && actions.toggleOrbit(); });
    els.btnReset.addEventListener('click', function () { actions.resetView && actions.resetView(); });
    els.btnSound.addEventListener('click', function () { actions.toggleSound && actions.toggleSound(); });

    /* ------------------------------------------------------------- telemetry */
    var cache = {};
    function setText(el, key, value) {
      if (cache[key] === value) return;
      cache[key] = value;
      el.textContent = value;
    }
    function signed(v, digits) {
      var n = v.toFixed(digits === undefined ? 1 : digits);
      return (v >= 0 ? '+' : '') + n;
    }

    var clockStart = performance.now();

    function updateTelemetry(t) {
      setText(els.alt, 'alt', t.alt.toFixed(2));
      setText(els.spd, 'spd', t.spd.toFixed(1));
      setText(els.bat, 'bat', String(Math.round(t.bat)));
      setText(els.thr, 'thr', String(Math.round(t.thr)));
      setText(els.pitch, 'pitch', signed(t.pitch) + '°');
      setText(els.roll, 'roll', signed(t.roll) + '°');
      setText(els.hdg, 'hdg', String(Math.round(((t.hdg % 360) + 360) % 360)).padStart(3, '0') + '°');
      setText(els.rpm, 'rpm', String(Math.round(t.rpm * 8400)));
      setText(els.cx, 'cx', signed(t.pos.x, 2));
      setText(els.cy, 'cy', signed(t.pos.y, 2));
      setText(els.cz, 'cz', signed(t.pos.z, 2));
      setText(els.chdg, 'chdg', String(Math.round(((t.hdg % 360) + 360) % 360)).padStart(3, '0') + '°');

      var altPct = A.clamp(t.alt / 7, 0, 1) * 100;
      var spdPct = A.clamp(t.spd / 7, 0, 1) * 100;
      var thrPct = A.clamp(t.thr, 0, 100);
      if (cache.altPct !== altPct) { cache.altPct = altPct; els.barAlt.style.width = altPct.toFixed(1) + '%'; }
      if (cache.spdPct !== spdPct) { cache.spdPct = spdPct; els.barSpd.style.width = spdPct.toFixed(1) + '%'; }
      if (cache.thrPct !== thrPct) { cache.thrPct = thrPct; els.barThr.style.width = thrPct.toFixed(1) + '%'; }
      if (cache.batPct !== t.bat) {
        cache.batPct = t.bat;
        els.barBat.style.width = A.clamp(t.bat, 0, 100) + '%';
        els.statBat.classList.toggle('warn', t.bat < 22);
      }

      var rollAttr = 'rotate(' + (-t.roll).toFixed(2) + ' 60 56)';
      if (cache.rollAttr !== rollAttr) { cache.rollAttr = rollAttr; els.attRoll.setAttribute('transform', rollAttr); }
      var pitchY = A.clamp(-t.pitch * 1.7, -24, 24).toFixed(2);
      var pitchAttr = 'translate(0 ' + pitchY + ')';
      if (cache.pitchAttr !== pitchAttr) { cache.pitchAttr = pitchAttr; els.attPitch.setAttribute('transform', pitchAttr); }
    }

    var clockTimer = setInterval(function () {
      var secs = Math.floor((performance.now() - clockStart) / 1000);
      var h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s2 = secs % 60;
      els.clock.textContent = A.pad2(h) + ':' + A.pad2(m) + ':' + A.pad2(s2);
    }, 1000);

    /* ---------------------------------------------------------------- updates */
    var tmpV = new THREE.Vector3();
    var labelsVisible = false;

    function updateLabels(camera, factor) {
      var show = factor > 0.1;
      if (show !== labelsVisible) {
        labelsVisible = show;
        els.labels.classList.toggle('show', show);
      }
      if (!show) return;
      var W = window.innerWidth, H = window.innerHeight;
      var wide = W > 1120;
      var mid = W > 820;
      var leftEdge = wide ? 44 + 242 + 26 : (mid ? 22 : 16);
      var rightEdge = wide ? W - 44 - 270 - 26 : (mid ? W - 30 - 238 - 24 : W - 16);
      var centerX = (leftEdge + rightEdge) / 2;

      // project the centre of the exploded assembly
      var center = new THREE.Vector3(drone.root.position.x, drone.root.position.y + 0.55, drone.root.position.z);
      center.project(camera);
      var cx = A.clamp((center.x * 0.5 + 0.5) * W, leftEdge + 60, rightEdge - 60);
      var cy = A.clamp((-center.y * 0.5 + 0.5) * H, 150, H - 200);
      var rx = Math.max(190, Math.min((rightEdge - leftEdge) / 2 - 96, 400));
      var ry = Math.max(150, Math.min(H * 0.3, 258));

      var list = [];
      for (var i = 0; i < labels.length; i++) {
        var L = labels[i];
        drone.getAnchorWorld(L.part, tmpV);
        tmpV.project(camera);
        if (tmpV.z > 1 || tmpV.z < -1) { L.visible = false; continue; }
        var ax = (tmpV.x * 0.5 + 0.5) * W;
        var ay = (-tmpV.y * 0.5 + 0.5) * H;
        if (ax < -140 || ax > W + 140 || ay < -140 || ay > H + 140) { L.visible = false; continue; }
        L.visible = true;
        L.ax = ax; L.ay = ay;
        var conf = LABEL_CONF[L.part.id] || { a: 0 };
        var ang = conf.a * Math.PI / 180;
        L.ang = ang;
        L.lx = cx + Math.cos(ang) * rx;
        L.ly = cy + Math.sin(ang) * ry;
        list.push(L);
      }

      // de-overlap nudges (labels are ringed so only light correction is needed)
      for (var it = 0; it < 3; it++) {
        for (var a = 0; a < list.length; a++) {
          for (var b = a + 1; b < list.length; b++) {
            var LA = list[a], LB = list[b];
            var dx = LA.lx - LB.lx, dy = LA.ly - LB.ly;
            if (Math.abs(dx) < 162 && Math.abs(dy) < 38) {
              var push = (38 - Math.abs(dy)) * 0.5 + 2;
              var sgn = dy >= 0 ? 1 : -1;
              LA.ly += push * sgn;
              LB.ly -= push * sgn;
            }
          }
        }
      }

      for (var k = 0; k < labels.length; k++) {
        var L2 = labels[k];
        if (!L2.visible) {
          L2.el.style.opacity = '0'; L2.line.style.opacity = '0'; L2.dot.style.opacity = '0';
          continue;
        }
        L2.lx = A.clamp(L2.lx, leftEdge + 72, rightEdge - 72);
        L2.ly = A.clamp(L2.ly, 112, H - 156);
        var dx2 = L2.lx - L2.ax, dy2 = L2.ly - L2.ay;
        var len = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
        var ex = L2.ax + dx2 / len * Math.min(34, len * 0.4);
        var ey = L2.ay + dy2 / len * Math.min(34, len * 0.4);
        var tx = L2.lx - dx2 / len * 64;
        var ty = L2.ly - dy2 / len * 64;
        L2.line.setAttribute('points',
          L2.ax.toFixed(1) + ',' + L2.ay.toFixed(1) + ' ' +
          ex.toFixed(1) + ',' + ey.toFixed(1) + ' ' +
          tx.toFixed(1) + ',' + ty.toFixed(1));
        L2.dot.setAttribute('cx', L2.ax.toFixed(1));
        L2.dot.setAttribute('cy', L2.ay.toFixed(1));
        L2.el.style.transform = 'translate3d(' + L2.lx.toFixed(1) + 'px,' + L2.ly.toFixed(1) + 'px,0) translate(-50%,-50%)';
        L2.el.style.opacity = '1';
        L2.line.style.opacity = '1';
        L2.dot.style.opacity = '1';
        L2.el.classList.toggle('lit', L2.part.id === uiState.selectedId);
      }
    }

    /* ------------------------------------------------------------- public API */
    function selectPart(part) {
      uiState.selectedId = part.id;
      parts.forEach(function (p) {
        p._row.classList.toggle('active', p.id === part.id);
        p._row.querySelector('.st').textContent = p.id === part.id ? 'FOCUS' : 'OK';
      });
      els.piIdx.textContent = part.idx;
      els.piName.textContent = part.cn;
      els.piEn.textContent = part.en;
      els.piTag.textContent = part.tag;
      els.piDesc.textContent = part.desc;
      els.piSpecs.innerHTML = part.specs.map(function (sp) {
        return '<div class="pi-spec"><span>' + sp[0] + '</span><b>' + sp[1] + '</b></div>';
      }).join('');
      if (part._row && part._row.scrollIntoView) {
        try { part._row.scrollIntoView({ block: 'nearest' }); } catch (e) { }
      }
    }

    var toastTimer = null;
    function toast(msg, ms) {
      els.toast.textContent = msg;
      els.toast.classList.add('show');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, ms || 1900);
    }

    var tooltipVisible = false;
    function showTooltip(x, y, part) {
      if (!part) {
        if (tooltipVisible) { els.tooltip.style.opacity = '0'; tooltipVisible = false; }
        return;
      }
      els.tooltip.innerHTML = '<b>' + part.idx + '</b> ' + part.cn + ' · ' + part.en;
      var tx = A.clamp(x + 16, 8, window.innerWidth - 260);
      var ty = A.clamp(y + 18, 8, window.innerHeight - 50);
      els.tooltip.style.left = tx + 'px';
      els.tooltip.style.top = ty + 'px';
      els.tooltip.style.opacity = '1';
      tooltipVisible = true;
    }

    function setBoot(pct, stage) {
      els.bootFill.style.width = pct + '%';
      els.bootPct.textContent = A.pad2(Math.round(pct));
      if (stage) els.bootStage.textContent = stage;
    }
    function bootLog(line) {
      var d = document.createElement('div');
      d.innerHTML = '&gt; ' + line;
      els.bootLog.appendChild(d);
    }
    function bootDone() {
      els.boot.classList.add('hide');
    }

    function setExplodeUI(target, factor) {
      uiState.exploded = target > 0.5;
      els.btnExplode.classList.toggle('on', uiState.exploded);
      els.explodeLabel.textContent = uiState.exploded ? '组装结构' : '拆解结构';
      els.explodeSub.textContent = uiState.exploded ? 'ASSEMBLE' : 'DISASSEMBLE';
      var pct = Math.round(factor * 100);
      els.explodePct.textContent = A.pad2(pct) + '%';
      paintRange(pct);
      if (document.activeElement !== range) range.value = String(Math.round(factor * 1000));
    }
    function setModeUI(mode) {
      uiState.mode = mode;
      els.btnFlight.classList.toggle('on', mode === 'flight');
      els.cmode.textContent = mode === 'flight' ? 'FLIGHT' : 'OBSERVE';
      document.body.classList.toggle('flight', mode === 'flight');
    }
    function setCruiseUI(on) {
      uiState.cruise = on;
      els.btnCruise.classList.toggle('on', on);
    }
    function setOrbitUI(on) {
      uiState.autoOrbit = on;
      els.btnOrbit.classList.toggle('on', on);
    }
    function setSoundUI(on) {
      uiState.sound = on;
      els.sndOn.style.opacity = on ? '1' : '0.35';
      els.sndOff.style.opacity = on ? '0' : '0.9';
      els.btnSound.style.color = on ? 'var(--cyan)' : 'rgba(120,190,205,.55)';
    }
    function setFps(n) { els.fps.textContent = String(n); }
    function setHudVisible(v) { els.hud.classList.toggle('hud-off', !v); }

    return {
      updateTelemetry: updateTelemetry,
      updateLabels: updateLabels,
      selectPart: selectPart,
      toast: toast,
      showTooltip: showTooltip,
      setBoot: setBoot,
      bootLog: bootLog,
      bootDone: bootDone,
      setExplodeUI: setExplodeUI,
      setModeUI: setModeUI,
      setCruiseUI: setCruiseUI,
      setOrbitUI: setOrbitUI,
      setSoundUI: setSoundUI,
      setFps: setFps,
      setHudVisible: setHudVisible,
      getSelectedId: function () { return uiState.selectedId; },
      isExploded: function () { return uiState.exploded; },
      dispose: function () { clearInterval(clockTimer); }
    };
  };
})();
