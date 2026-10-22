/* ============================================================================
   AERO X-9 · main.js
   Boot sequence, render loop, flight physics, exploded logic, picking, audio.
   ========================================================================== */
(function () {
  'use strict';
  var A = window.AERO;
  if (!A || typeof THREE === 'undefined') return;
  var T = THREE;

  window.__ERRORS = [];
  window.addEventListener('error', function (e) { window.__ERRORS.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { window.__ERRORS.push('rejection: ' + (e.reason && e.reason.message || e.reason)); });

  var SHOT = A.flag('shot', false);
  var SKIP_BOOT = SHOT || A.flag('noboot', false);
  var BOOT_SHOT = SHOT && A.flag('bootshot', false);

  /* ---------------------------------------------------------------- renderer */
  var stage = document.getElementById('stage');
  var renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
  } catch (e) {
    document.getElementById('boot').innerHTML = '<div style="font-family:Consolas,monospace;color:#ff5568;font-size:14px;letter-spacing:.1em">WEBGL UNAVAILABLE / 无法初始化 WebGL</div>';
    return;
  }
  var dpr = SHOT ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  stage.appendChild(renderer.domElement);

  var scene = new T.Scene();
  var camera = new T.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.08, 220);
  camera.position.set(3.4, 2.9, 4.2);

  /* ------------------------------------------------------------- world build */
  var env = A.makeEnvironment(renderer);
  scene.environment = env;
  var world = A.createWorld(scene, renderer, camera);
  var mats = A.makeMaterials();
  var drone = A.createDrone(scene, mats);
  var controls = A.createControls(camera, renderer.domElement);
  var postfx = A.createPostFX(renderer, scene, camera, {});
  if (!postfx.enabled) {
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
  }

  /* -------------------------------------------------------------------- state */
  var state = {
    mode: 'observe',
    explodeTarget: 0,
    explodeFactor: 0,
    exploded: false,
    cruise: false,
    cruisePhase: 0,
    cruiseRadius: 2.6,
    autoOrbitPref: true,
    returning: false,
    hoverBaseY: 1.55,
    battery: 98,
    rpm: 0.3,
    rpmTarget: 0.3,
    throttle: 18,
    velocity: new T.Vector3(),
    prevPos: new T.Vector3(0, 1.55, 0),
    speed: 0,
    yaw: 0.35,
    pitch: 0,
    roll: 0,
    sound: false,
    hudVisible: true,
    keys: { w: false, a: false, s: false, d: false, up: false, down: false, space: false, shift: false },
    selectedId: null,
    ready: false
  };
  drone.root.position.set(0, 1.55, 0);
  drone.root.rotation.y = state.yaw;

  /* --------------------------------------------------------------- audio Fx */
  var audio = {
    ctx: null, master: null, rotorGain: null, oscA: null, oscB: null, whine: null,
    filter: null, filterW: null, enabled: false,
    init: function () {
      if (this.ctx) return;
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      try {
        var ctx = new Ctx();
        this.ctx = ctx;
        var master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
        this.master = master;
        var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 0.8; f.connect(master);
        this.filter = f;
        var g = ctx.createGain(); g.gain.value = 0.0; g.connect(f);
        this.rotorGain = g;
        var a = ctx.createOscillator(); a.type = 'sawtooth'; a.frequency.value = 46; a.connect(g); a.start();
        var b = ctx.createOscillator(); b.type = 'triangle'; b.frequency.value = 92.5; b.detune.value = 7; b.connect(g); b.start();
        this.oscA = a; this.oscB = b;
        var wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 620; wf.Q.value = 1.4;
        var wg = ctx.createGain(); wg.gain.value = 0.0;
        var w = ctx.createOscillator(); w.type = 'sine'; w.frequency.value = 480;
        w.connect(wf); wf.connect(wg); wg.connect(master); w.start();
        this.whine = w; this.whineGain = wg;
        // airy noise bed
        var len = ctx.sampleRate * 2;
        var buf = ctx.createBuffer(1, len, ctx.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.35;
        var src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        var nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.6;
        var ng = ctx.createGain(); ng.gain.value = 0.0;
        src.connect(nf); nf.connect(ng); ng.connect(master); src.start();
        this.noiseGain = ng;
        this.setEnabled(false);
      } catch (e) { }
    },
    setEnabled: function (on) {
      this.enabled = !!on;
      if (!this.ctx) return;
      try {
        if (on && this.ctx.state === 'suspended') this.ctx.resume();
        var t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.linearRampToValueAtTime(on ? 0.36 : 0.0, t + 0.4);
      } catch (e) { }
    },
    update: function (rpm) {
      if (!this.ctx || !this.enabled) return;
      try {
        var t = this.ctx.currentTime;
        var base = 32 + rpm * 120;
        this.oscA.frequency.setTargetAtTime(base, t, 0.1);
        this.oscB.frequency.setTargetAtTime(base * 2.01, t, 0.1);
        this.filter.frequency.setTargetAtTime(220 + rpm * 900, t, 0.1);
        this.rotorGain.gain.setTargetAtTime(0.02 + rpm * 0.055, t, 0.15);
        this.whine.frequency.setTargetAtTime(340 + rpm * 1100, t, 0.1);
        this.whineGain.gain.setTargetAtTime(0.004 + rpm * 0.012, t, 0.2);
        this.noiseGain.gain.setTargetAtTime(0.004 + rpm * 0.008, t, 0.2);
      } catch (e) { }
    },
    beep: function (freq, dur, gain) {
      if (!this.ctx || !this.enabled) return;
      try {
        var ctx = this.ctx, t = ctx.currentTime;
        var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq || 1200;
        var g = ctx.createGain(); g.gain.value = 0;
        o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gain || 0.03, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.06));
        o.start(t); o.stop(t + (dur || 0.06) + 0.02);
      } catch (e) { }
    }
  };

  /* -------------------------------------------------------------------- UI */
  var ui = A.createUI({
    drone: drone,
    actions: {
      toggleExplode: function () { toggleExplode(); },
      setExplode: function (t) { setExplodeDirect(t); },
      toggleFlight: function () { toggleFlight(); },
      toggleCruise: function () { toggleCruise(); },
      toggleOrbit: function () { toggleOrbit(); },
      resetView: function () { resetView(); },
      toggleSound: function () { toggleSound(); },
      selectPart: function (id) { selectPart(id); },
      hoverPart: function (id) { }
    }
  });

  /* ------------------------------------------------------------- app actions */
  function selectPart(id) {
    var part = drone.partMap[id];
    if (!part) return;
    state.selectedId = id;
    drone.select(id);
    ui.selectPart(part);
  }

  function setExplodeDirect(t) {
    t = A.clamp(t, 0, 1);
    state.explodeTarget = t;
    state.explodeFactor = t;
    state.exploded = t > 0.5;
    drone.setExplode(t);
    ui.setExplodeUI(t, t);
    if (state.mode === 'flight' && t > 0.1) setMode('observe');
    if (state.cruise && t > 0.1) setCruise(false);
  }

  function toggleExplode() {
    var target = state.exploded ? 0 : 1;
    if (target === 1) {
      if (state.mode === 'flight') setMode('observe');
      if (state.cruise) setCruise(false);
      controls.zoomTo(5.35);
      controls.setView(controls.getAngles().theta, 1.18, 5.35);
      ui.toast('结构分解 · EXPLODED VIEW / 点击部件查看详情');
      audio.beep(880, 0.07, 0.025);
    } else {
      controls.zoomTo(4.1);
      ui.toast('结构重组 · ASSEMBLY RESTORED');
      audio.beep(520, 0.08, 0.025);
    }
    state.explodeTarget = target;
    state.exploded = target > 0.5;
    ui.setExplodeUI(target, state.explodeFactor);
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    if (mode === 'flight') {
      state.returning = false;
      setCruise(false);
      if (state.explodeTarget > 0) { state.explodeTarget = 0; state.exploded = false; ui.setExplodeUI(0, state.explodeFactor); }
      state.autoOrbitPref = controls.getAutoOrbit();
      controls.setAutoOrbit(false);
      ui.setOrbitUI(false);
      controls.zoomTo(4.3);
      ui.toast('飞行控制已接管 · FLIGHT CONTROL ENGAGED');
      audio.beep(1040, 0.08, 0.03);
    } else {
      var p = drone.root.position;
      state.hoverBaseY = A.clamp(p.y, 0.7, 6);
      state.returning = true;
      state.velocity.set(0, 0, 0);
      controls.setAutoOrbit(state.autoOrbitPref);
      ui.setOrbitUI(state.autoOrbitPref);
      controls.zoomTo(3.9);
      ui.toast('悬停稳定 · HOLD POSITION');
      audio.beep(700, 0.08, 0.03);
    }
    ui.setModeUI(mode);
  }
  function toggleFlight() { setMode(state.mode === 'flight' ? 'observe' : 'flight'); }

  function setCruise(on) {
    if (state.cruise === on) return;
    state.cruise = on;
    ui.setCruiseUI(on);
    if (on) {
      state.returning = false;
      var p = drone.root.position;
      state.cruisePhase = Math.atan2(p.z, p.x);
      state.cruiseRadius = Math.max(1.8, Math.hypot(p.x, p.z));
      if (state.explodeTarget > 0) { state.explodeTarget = 0; state.exploded = false; ui.setExplodeUI(0, state.explodeFactor); }
      ui.toast('自动巡航启用 · AUTO CRUISE ONLINE');
      audio.beep(980, 0.06, 0.025);
    } else {
      state.hoverBaseY = A.clamp(drone.root.position.y, 0.7, 6);
      state.returning = false;
      ui.toast('自动巡航关闭 · MANUAL HOLD');
    }
  }
  function toggleCruise() { setCruise(!state.cruise); }

  function toggleOrbit() {
    state.autoOrbitPref = !state.autoOrbitPref;
    controls.setAutoOrbit(state.mode === 'flight' ? false : state.autoOrbitPref);
    ui.setOrbitUI(state.autoOrbitPref);
    ui.toast(state.autoOrbitPref ? '自动环绕开启 · AUTO ORBIT' : '自动环绕关闭 · FREE CAMERA');
  }

  function resetView() {
    controls.reset();
    ui.toast('视角复位 · VIEW RESET');
  }

  function toggleSound() {
    state.sound = !state.sound;
    if (state.sound) {
      audio.init();
      audio.setEnabled(true);
      ui.toast('音频系统上线 · AUDIO ONLINE');
    } else {
      audio.setEnabled(false);
      ui.toast('音频静音 · AUDIO MUTED');
    }
    ui.setSoundUI(state.sound);
  }

  function toggleHud() {
    state.hudVisible = !state.hudVisible;
    ui.setHudVisible(state.hudVisible);
  }

  /* ------------------------------------------------------------- explosion */
  function updateExplode(dt) {
    var prev = state.explodeFactor;
    var prevTarget = state._lastExplodeTarget;
    if (Math.abs(state.explodeFactor - state.explodeTarget) > 0.0005) {
      state.explodeFactor = A.damp(state.explodeFactor, state.explodeTarget, 3.4, dt);
    } else {
      state.explodeFactor = state.explodeTarget;
    }
    if (prev !== state.explodeFactor || prevTarget !== state.explodeTarget) {
      drone.setExplode(state.explodeFactor);
      ui.setExplodeUI(state.explodeTarget, state.explodeFactor);
      state._lastExplodeTarget = state.explodeTarget;
    }
  }

  /* ---------------------------------------------------------------- flight */
  var fwd = new T.Vector3(), right = new T.Vector3(), up = new T.Vector3(0, 1, 0);
  var inputV = new T.Vector3();
  var tmpP = new T.Vector3();

  function dampAngle(cur, target, lambda, dt) {
    var d = Math.atan2(Math.sin(target - cur), Math.cos(target - cur));
    return cur + d * (1 - Math.exp(-lambda * dt));
  }

  function updateMotion(dt, time) {
    var p = drone.root.position;
    var k = state.keys;
    var manual = (k.w || k.a || k.s || k.d || k.space || k.shift);

    if (state.cruise) {
      if (state.mode === 'flight' && manual) {
        setCruise(false);
      } else {
        state.cruisePhase += dt * 0.4;
        var targetR = 2.7;
        state.cruiseRadius = A.damp(state.cruiseRadius, targetR, 1.2, dt);
        var a = state.cruisePhase;
        var tx = Math.cos(a) * state.cruiseRadius;
        var tz = Math.sin(a) * state.cruiseRadius;
        var ty = 1.95 + Math.sin(time * 0.62) * 0.34;
        p.x = A.damp(p.x, tx, 1.9, dt);
        p.z = A.damp(p.z, tz, 1.9, dt);
        p.y = A.damp(p.y, ty, 2.3, dt);
        var vx = -Math.sin(a) * state.cruiseRadius * 0.4;
        var vz = Math.cos(a) * state.cruiseRadius * 0.4;
        state.velocity.set(vx, 0, vz);
        state.speed = Math.hypot(vx, vz);
        state.yaw = dampAngle(state.yaw, Math.atan2(vx, vz), 2.2, dt);
        state.pitch = A.damp(state.pitch, 0.07, 3, dt);
        state.roll = A.damp(state.roll, -0.22, 3, dt);
        state.rpmTarget = 0.55;
        drone.root.rotation.y = state.yaw;
        drone.model.rotation.x = state.pitch;
        drone.model.rotation.z = state.roll;
        return;
      }
    }

    if (state.mode === 'flight') {
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() < 0.0001) fwd.set(0, 0, -1);
      fwd.normalize();
      right.crossVectors(fwd, up).normalize();
      inputV.set(0, 0, 0);
      inputV.addScaledVector(fwd, (k.w ? 1 : 0) - (k.s ? 1 : 0));
      inputV.addScaledVector(right, (k.d ? 1 : 0) - (k.a ? 1 : 0));
      if (inputV.lengthSq() > 1) inputV.normalize();
      var maxSpd = 3.4;
      var targetVx = inputV.x * maxSpd;
      var targetVz = inputV.z * maxSpd;
      var targetVy = ((k.space ? 1 : 0) - (k.shift ? 1 : 0)) * 2.0;
      state.velocity.x = A.damp(state.velocity.x, targetVx, 4.2, dt);
      state.velocity.z = A.damp(state.velocity.z, targetVz, 4.2, dt);
      state.velocity.y = A.damp(state.velocity.y, targetVy, 4.6, dt);
      p.addScaledVector(state.velocity, dt);
      p.x = A.clamp(p.x, -6.8, 6.8);
      p.z = A.clamp(p.z, -6.8, 6.8);
      p.y = A.clamp(p.y, 0.58, 6.2);
      if (p.y <= 0.5801 && state.velocity.y < 0) state.velocity.y = 0;
      var hspd = Math.hypot(state.velocity.x, state.velocity.z);
      state.speed = Math.hypot(hspd, state.velocity.y);
      if (hspd > 0.18) {
        state.yaw = dampAngle(state.yaw, Math.atan2(state.velocity.x, state.velocity.z), 3.4, dt);
      }
      var localFwd = Math.sin(state.yaw) * state.velocity.x + Math.cos(state.yaw) * state.velocity.z;
      var localRight = Math.cos(state.yaw) * state.velocity.x - Math.sin(state.yaw) * state.velocity.z;
      var pitchT = A.clamp(localFwd * 0.075, -0.27, 0.27);
      var rollT = A.clamp(-localRight * 0.09, -0.24, 0.24);
      state.pitch = A.damp(state.pitch, pitchT + 0.02, 5, dt);
      state.roll = A.damp(state.roll, rollT, 5, dt);
      state.rpmTarget = A.clamp(0.42 + state.speed * 0.085 + Math.abs(state.velocity.y) * 0.05, 0.35, 1);
    } else {
      // observe / hover
      if (state.returning) {
        p.x = A.damp(p.x, 0, 2.2, dt);
        p.z = A.damp(p.z, 0, 2.2, dt);
        p.y = A.damp(p.y, 1.55, 2.4, dt);
        state.yaw = dampAngle(state.yaw, 0.35, 1.8, dt);
        state.pitch = A.damp(state.pitch, 0.02, 2, dt);
        state.roll = A.damp(state.roll, -0.02, 2, dt);
        if (Math.abs(p.x) < 0.02 && Math.abs(p.z) < 0.02 && Math.abs(p.y - 1.55) < 0.02) {
          state.returning = false;
          state.hoverBaseY = 1.55;
        }
        state.speed = 0;
        state.rpmTarget = 0.36;
      } else {
        var bob = Math.sin(time * 0.85) * 0.05;
        p.y = A.damp(p.y, state.hoverBaseY + bob, 2.2, dt);
        state.pitch = A.damp(state.pitch, Math.sin(time * 0.52) * 0.018, 2, dt);
        state.roll = A.damp(state.roll, Math.cos(time * 0.43) * 0.026, 2, dt);
        state.yaw = dampAngle(state.yaw, 0.35 + Math.sin(time * 0.24) * 0.1, 1.2, dt);
        state.speed = 0;
        state.rpmTarget = 0.32;
      }
    }
    drone.root.rotation.y = state.yaw;
    drone.model.rotation.x = state.pitch;
    drone.model.rotation.z = state.roll;
  }

  /* ------------------------------------------------------------- boot & loop */
  var bootT0 = performance.now();
  var bootFinished = false;
  var bootLogIdx = 0;
  var BOOT_LOGS = [
    { at: 2, t: 'BOOT AERO-X9 FLIGHT OS v4.21 <b>OK</b>' },
    { at: 22, t: 'RENDER PIPELINE / HDR COMPOSITE <b>OK</b>' },
    { at: 46, t: 'HOLOGRAPHIC ENVIRONMENT / GRID <b>OK</b>' },
    { at: 68, t: 'AIRFRAME TOPOLOGY / 9 MODULES <b>OK</b>' },
    { at: 86, t: 'IMU · GNSS · GIMBAL CALIBRATION <b>OK</b>' },
    { at: 96, t: 'SECURE LINK ESTABLISHED / UNIT 09 <b>READY</b>' }
  ];

  function bootStageFor(pct) {
    if (pct < 24) return 'INITIALIZING FLIGHT OS';
    if (pct < 52) return 'BUILDING RENDER PIPELINE';
    if (pct < 76) return 'LOADING AIRFRAME TOPOLOGY';
    if (pct < 94) return 'CALIBRATING IMU / GIMBAL';
    return 'LINK ESTABLISHED';
  }

  function updateBoot() {
    if (bootFinished) return;
    if (BOOT_SHOT) {
      while (bootLogIdx < 5) {
        ui.bootLog(BOOT_LOGS[bootLogIdx].t);
        bootLogIdx++;
      }
      ui.setBoot(68, 'CALIBRATING IMU / GIMBAL');
      bootFinished = true;
      return;
    }
    var dur = SKIP_BOOT ? 260 : 1600;
    var raw = A.clamp((performance.now() - bootT0) / dur, 0, 1);
    var pct = SKIP_BOOT ? Math.round(raw * 100) : Math.round(A.easeOutCubic(raw) * 100);
    ui.setBoot(pct, bootStageFor(pct));
    while (bootLogIdx < BOOT_LOGS.length && pct >= BOOT_LOGS[bootLogIdx].at) {
      ui.bootLog(BOOT_LOGS[bootLogIdx].t);
      bootLogIdx++;
    }
    if (raw >= 1) {
      bootFinished = true;
      ui.bootDone();
      if (SKIP_BOOT) {
        var b = document.getElementById('boot');
        setTimeout(function () { b.style.display = 'none'; }, 40);
      }
    }
  }

  var clock = new T.Clock();
  var fpsFrames = 0, fpsLast = performance.now(), fpsShown = 60;
  var lastTel = 0, frames = 0;
  var bootFinishTime = 0;
  var readySet = false;

  function updateTelemetry(time) {
    var p = drone.root.position;
    var yawDeg = A.deg(state.yaw);
    var tele = {
      alt: p.y,
      spd: state.speed,
      bat: state.battery,
      thr: state.throttle,
      rpm: state.rpm,
      pitch: A.deg(state.pitch * 0.6),
      roll: A.deg(state.roll * 0.6),
      hdg: yawDeg,
      pos: p
    };
    ui.updateTelemetry(tele);
  }

  function frame() {
    requestAnimationFrame(frame);
    var rawDt = Math.min(clock.getDelta(), 0.5);
    var dt = Math.min(rawDt, 0.05);
    var time = clock.elapsedTime;

    updateBoot();
    updateMotion(dt, time);
    updateExplode(Math.min(rawDt, 0.22));

    // R.P.M. damping + throttle + battery
    state.rpm = A.damp(state.rpm, state.rpmTarget, 2.4, dt);
    state.throttle = A.clamp(14 + state.rpm * 46 + state.speed * 4, 0, 100);
    if (state.mode === 'flight' || state.cruise) {
      state.battery = A.clamp(state.battery - dt * (0.035 + state.speed * 0.012), 8, 100);
    } else {
      state.battery = A.clamp(state.battery - dt * 0.004, 8, 100);
    }
    audio.update(state.rpm);

    // camera follows drone
    tmpP.copy(drone.root.position);
    tmpP.y += 0.12 + state.explodeFactor * 0.26;
    controls.setFollow(tmpP);
    controls.update(dt);

    // world & drone fx
    world.update(dt, time, { dronePos: drone.root.position, cameraPos: camera.position });
    drone.root.updateMatrixWorld(true);
    drone.update(dt, time, {
      rpm: state.rpm,
      cameraPos: camera.position,
      gimbalLook: state.mode !== 'flight'
    });

    // HUD
    if (time - lastTel > 0.08) {
      lastTel = time;
      updateTelemetry(time);
    }
    ui.updateLabels(camera, state.explodeFactor);

    // render
    renderer.info.reset();
    postfx.render(time);

    frames++;
    fpsFrames++;
    var now = performance.now();
    if (now - fpsLast > 500) {
      fpsShown = Math.round(fpsFrames * 1000 / (now - fpsLast));
      ui.setFps(fpsShown);
      fpsFrames = 0; fpsLast = now;
    }

    // ready signal for automated QA
    if (bootFinished && !readySet) {
      if (!bootFinishTime) bootFinishTime = now;
      if ((SKIP_BOOT && frames >= 4) || (!SKIP_BOOT && now - bootFinishTime > 1000)) {
        readySet = true;
        state.ready = true;
        window.__READY = true;
        window.__INFO = {
          parts: drone.parts.length,
          mode: state.mode,
          exploded: state.exploded,
          hdr: postfx.hdr,
          fps: fpsShown,
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          errors: window.__ERRORS.length
        };
      }
    }
  }

  /* ---------------------------------------------------------------- picking */
  var raycaster = new T.Raycaster();
  var mouse = new T.Vector2();
  var hoveredId = null;
  var pointerDown = { x: 0, y: 0, moved: false };

  function pickAt(clientX, clientY) {
    var rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    var hits = raycaster.intersectObjects(drone.pickables, false);
    if (hits.length) return hits[0].object.userData.partId || null;
    return null;
  }

  renderer.domElement.addEventListener('pointermove', function (e) {
    var id = pickAt(e.clientX, e.clientY);
    if (id !== hoveredId) {
      hoveredId = id;
      renderer.domElement.style.cursor = id ? 'pointer' : (controls.isDragging() ? 'grabbing' : 'grab');
    }
    ui.showTooltip(e.clientX, e.clientY, id ? drone.partMap[id] : null);
  });
  renderer.domElement.addEventListener('pointerleave', function () {
    hoveredId = null;
    ui.showTooltip(0, 0, null);
  });
  renderer.domElement.addEventListener('pointerdown', function (e) {
    pointerDown.x = e.clientX; pointerDown.y = e.clientY; pointerDown.moved = false;
  });
  renderer.domElement.addEventListener('pointermove', function (e) {
    if (Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 6) pointerDown.moved = true;
  });
  renderer.domElement.addEventListener('pointerup', function (e) {
    if (pointerDown.moved) return;
    var id = pickAt(e.clientX, e.clientY);
    if (id) selectPart(id);
  });
  renderer.domElement.addEventListener('dblclick', function (e) {
    var id = pickAt(e.clientX, e.clientY);
    if (id) {
      selectPart(id);
      toggleExplode();
    } else {
      resetView();
    }
  });

  /* --------------------------------------------------------------- keyboard */
  window.addEventListener('keydown', function (e) {
    if (e.target && (e.target.isContentEditable || e.target.tagName === 'TEXTAREA')) return;
    var c = e.code;
    var arrow = (c === 'ArrowUp' || c === 'ArrowDown' || c === 'ArrowLeft' || c === 'ArrowRight');
    // let a focused range input handle its own arrow keys, but keep global shortcuts alive
    if (e.target && e.target.tagName === 'INPUT' && arrow) return;
    if (c === 'KeyW' || c === 'ArrowUp') { state.keys.w = true; e.preventDefault(); }
    else if (c === 'KeyS' || c === 'ArrowDown') { state.keys.s = true; e.preventDefault(); }
    else if (c === 'KeyA' || c === 'ArrowLeft') { state.keys.a = true; e.preventDefault(); }
    else if (c === 'KeyD' || c === 'ArrowRight') { state.keys.d = true; e.preventDefault(); }
    else if (c === 'Space') { state.keys.space = true; e.preventDefault(); }
    else if (c === 'ShiftLeft' || c === 'ShiftRight') { state.keys.shift = true; }
    else if (c === 'KeyF') { toggleFlight(); }
    else if (c === 'KeyE') { toggleExplode(); }
    else if (c === 'KeyR') { resetView(); }
    else if (c === 'KeyH') { toggleHud(); }
    else if (c === 'KeyM') { toggleSound(); }
    else if (c.indexOf('Digit') === 0) {
      var n = parseInt(c.slice(5), 10);
      if (n >= 1 && n <= 9) selectPart(drone.parts[n - 1].id);
    }
  });
  window.addEventListener('keyup', function (e) {
    var c = e.code;
    if (c === 'KeyW' || c === 'ArrowUp') state.keys.w = false;
    else if (c === 'KeyS' || c === 'ArrowDown') state.keys.s = false;
    else if (c === 'KeyA' || c === 'ArrowLeft') state.keys.a = false;
    else if (c === 'KeyD' || c === 'ArrowRight') state.keys.d = false;
    else if (c === 'Space') state.keys.space = false;
    else if (c === 'ShiftLeft' || c === 'ShiftRight') state.keys.shift = false;
  });
  window.addEventListener('blur', function () {
    state.keys.w = state.keys.a = state.keys.s = state.keys.d = false;
    state.keys.space = state.keys.shift = false;
  });

  /* ------------------------------------------------------------------ resize */
  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    var size = new T.Vector2();
    renderer.getDrawingBufferSize(size);
    postfx.resize(size.x, size.y);
  }
  window.addEventListener('resize', resize);
  resize();

  /* ------------------------------------------------------------ query tuning */
  (function applyQuery() {
    var sel = A.query.sel;
    var explodeQ = A.flag('explode', false);
    if (explodeQ) {
      state.explodeTarget = 1; state.explodeFactor = 1; state.exploded = true;
      drone.setExplode(1);
      controls.setView(A.num('camtheta', controls.getAngles().theta), 1.18, A.num('camradius', 5.35));
    }
    if (A.query.cam) {
      var c = String(A.query.cam).split(',').map(parseFloat);
      if (c.length >= 3) controls.setView(c[0], c[1], c[2]);
    }
    var camTheta = A.num('camtheta', null);
    var camPhi = A.num('camphi', null);
    var camRadius = A.num('camradius', null);
    if (camTheta !== null || camPhi !== null || camRadius !== null) {
      controls.setView(camTheta, camPhi, camRadius);
    }
    if (A.query.mode === 'flight') { setMode('flight'); }
    if (A.flag('cruise', false)) setCruise(true);
    if (A.flag('auto', true) === false) { state.autoOrbitPref = false; controls.setAutoOrbit(false); }
    if (A.query.x || A.query.y || A.query.z) {
      drone.root.position.set(A.num('x', 0), A.num('y', 1.55), A.num('z', 0));
      state.hoverBaseY = drone.root.position.y;
      state.returning = false;
    }
    if (A.flag('ui', true) === false) { state.hudVisible = false; ui.setHudVisible(false); }
    ui.setModeUI(state.mode);
    ui.setOrbitUI(controls.getAutoOrbit());
    ui.setSoundUI(false);
    ui.setCruiseUI(state.cruise);
    ui.setExplodeUI(state.explodeTarget, state.explodeFactor);
    selectPart(sel && drone.partMap[sel] ? sel : 'canopy');
  })();

  /* --------------------------------------------------------------- debug api */
  window.AERO.APP = {
    state: state,
    drone: drone,
    controls: controls,
    camera: camera,
    renderer: renderer,
    scene: scene,
    world: world,
    ui: ui,
    postfx: postfx,
    selectPart: selectPart,
    toggleExplode: toggleExplode,
    setExplode: setExplodeDirect,
    setMode: setMode,
    toggleCruise: toggleCruise,
    toggleOrbit: toggleOrbit,
    resetView: resetView,
    jumpCamera: function (theta, phi, radius) { controls.setView(theta, phi, radius); },
    frameCount: function () { return frames; },
    waitFrames: function (n, timeout) {
      n = n || 2;
      var start = frames;
      return new Promise(function (resolve) {
        var to = setTimeout(function () { resolve(false); }, timeout || 6000);
        function check() {
          if (frames - start >= n) { clearTimeout(to); resolve(true); }
          else requestAnimationFrame(check);
        }
        requestAnimationFrame(check);
      });
    }
  };

  /* Any first user gesture unlocks audio (if enabled later) */
  window.addEventListener('pointerdown', function once() {
    window.removeEventListener('pointerdown', once);
  }, { once: true });

  bootT0 = performance.now();
  frame();
})();
