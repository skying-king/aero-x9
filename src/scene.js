/* ============================================================================
   AERO X-9 · scene.js
   The hangar: procedural sky, reflective pad, holographic grid, pylons,
   particles, stars and a cinematic lighting rig that follows the drone.
   ========================================================================== */
(function () {
  'use strict';
  var A = window.AERO;
  if (typeof THREE === 'undefined') return;
  var T = THREE;

  function canvas2d(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return { c: c, ctx: c.getContext('2d') };
  }

  /* ------------------------------------------------------------- pad decal */
  function makePadTexture() {
    var S = 1024, d = canvas2d(S, S), ctx = d.ctx, C = S / 2;
    ctx.translate(C, C);
    function circle(r, color, width, dash) {
      ctx.beginPath();
      ctx.setLineDash(dash || []);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    circle(468, 'rgba(110,235,255,.5)', 2, []);
    circle(452, 'rgba(110,235,255,.22)', 1, [5, 12]);
    circle(318, 'rgba(110,235,255,.3)', 1.5, []);
    circle(304, 'rgba(110,235,255,.14)', 1, []);
    circle(210, 'rgba(110,235,255,.16)', 1, [18, 14]);
    // tick ring
    ctx.save();
    for (var i = 0; i < 96; i++) {
      var a = i / 96 * Math.PI * 2;
      var long = i % 8 === 0;
      var r0 = 396, r1 = long ? 440 : 424;
      ctx.strokeStyle = long ? 'rgba(120,240,255,.5)' : 'rgba(120,240,255,.2)';
      ctx.lineWidth = long ? 2.4 : 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
    // cross hair
    ctx.strokeStyle = 'rgba(110,235,255,.2)';
    ctx.lineWidth = 1;
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (v) {
      ctx.beginPath();
      ctx.moveTo(v[0] * 230, v[1] * 230);
      ctx.lineTo(v[0] * 320, v[1] * 320);
      ctx.stroke();
    });
    // arc labels
    ctx.fillStyle = 'rgba(150,240,255,.42)';
    ctx.font = '600 16px Bahnschrift, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('L A N D I N G   Z O N E   0 9', 0, -360);
    ctx.font = '500 12px Consolas, monospace';
    ctx.fillStyle = 'rgba(150,240,255,.3)';
    ctx.fillText('AERODYNE DYNAMICS · PAD 09 · X9-0421', 0, 372);
    // big faint X9
    ctx.font = '700 170px Bahnschrift, Segoe UI, sans-serif';
    ctx.fillStyle = 'rgba(110,235,255,.055)';
    ctx.fillText('X9', 0, 60);
    // small cross
    ctx.strokeStyle = 'rgba(150,240,255,.4)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(26, 0); ctx.moveTo(0, -26); ctx.lineTo(0, 26); ctx.stroke();

    var tex = new T.CanvasTexture(d.c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  /* ------------------------------------------------------------------- sky */
  var SKY_VERT = [
    'varying vec3 vDir;',
    'void main(){',
    '  vDir = normalize(position);',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');
  var SKY_FRAG = [
    'varying vec3 vDir;',
    'void main(){',
    '  float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);',
    '  vec3 bottom = vec3(0.002, 0.006, 0.010);',
    '  vec3 mid = vec3(0.012, 0.045, 0.062);',
    '  vec3 top = vec3(0.004, 0.013, 0.024);',
    '  vec3 col = mix(bottom, mid, smoothstep(0.42, 0.56, h));',
    '  col = mix(col, top, smoothstep(0.56, 0.96, h));',
    '  float band = pow(max(0.0, 1.0 - abs(vDir.y) * 3.6), 7.0);',
    '  col += vec3(0.012, 0.048, 0.058) * band * 0.6;',
    '  float low = pow(max(0.0, 1.0 - abs(vDir.y - 0.02) * 10.0), 11.0);',
    '  col += vec3(0.012, 0.045, 0.055) * low * 0.35;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* ------------------------------------------------------------------ grid */
  var GRID_VERT = [
    'varying vec3 vWorld;',
    'void main(){',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vWorld = wp.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');
  var GRID_FRAG = [
    'uniform float uTime;',
    'uniform vec3 uColorA;',
    'uniform vec3 uColorB;',
    'varying vec3 vWorld;',
    'float gridLine(vec2 p, float scale){',
    '  vec2 q = p / scale;',
    '  vec2 g = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(0.00001));',
    '  return 1.0 - min(min(g.x, g.y), 1.0);',
    '}',
    'void main(){',
    '  vec2 p = vWorld.xz;',
    '  float dist = length(p);',
    '  float fade = smoothstep(32.0, 3.0, dist);',
    '  float fine = gridLine(p, 0.5);',
    '  float mid = gridLine(p, 2.5);',
    '  float coarse = gridLine(p, 10.0);',
    '  float pulseR = 1.2 + fract(uTime * 0.065) * 30.0;',
    '  float pulse = smoothstep(1.1, 0.0, abs(dist - pulseR)) * smoothstep(26.0, 2.0, dist);',
    '  vec3 col = uColorA * fine * 0.16 + uColorB * mid * 0.30 + uColorB * coarse * 0.42;',
    '  col += vec3(0.20, 0.90, 1.0) * pulse * 0.20;',
    '  float a = (fine * 0.20 + mid * 0.42 + coarse * 0.62 + pulse * 0.4) * fade;',
    '  gl_FragColor = vec4(col * fade, a);',
    '}'
  ].join('\n');

  A.createWorld = function (scene, renderer, camera) {
    var world = {};

    /* ---------------------------------------------------------- background */
    scene.background = new T.Color(0x020508);
    scene.fog = new T.FogExp2(0x041119, 0.031);

    var sky = new T.Mesh(
      new T.SphereGeometry(72, 40, 24),
      new T.ShaderMaterial({
        vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
        side: T.BackSide, depthWrite: false, fog: false, toneMapped: false
      })
    );
    sky.renderOrder = -100;
    scene.add(sky);

    /* --------------------------------------------------------------- stars */
    var starRng = A.rng(9241);
    var starPos = [], starCol = [];
    for (var i = 0; i < 1200; i++) {
      var theta = starRng() * Math.PI * 2;
      var phi = Math.acos(2 * starRng() - 1);
      var r = 34 + starRng() * 30;
      var x = r * Math.sin(phi) * Math.cos(theta);
      var y = r * Math.cos(phi) * 0.9 + 6;
      var z = r * Math.sin(phi) * Math.sin(theta);
      if (y < -2) y = -y * 0.4;
      starPos.push(x, y, z);
      var warm = starRng();
      var col = new T.Color().setHSL(warm > 0.8 ? 0.09 : 0.52, warm > 0.8 ? 0.7 : 0.35, 0.5 + starRng() * 0.4);
      starCol.push(col.r, col.g, col.b);
    }
    var starGeo = new T.BufferGeometry();
    starGeo.setAttribute('position', new T.Float32BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new T.Float32BufferAttribute(starCol, 3));
    var stars = new T.Points(starGeo, new T.PointsMaterial({
      size: 0.22, sizeAttenuation: true, transparent: true, opacity: 0.9,
      vertexColors: true, depthWrite: false, blending: T.AdditiveBlending, fog: false
    }));
    scene.add(stars);

    // distant orbital arc for sci-fi depth
    var orbitGroup = new T.Group();
    var orbitMat = new T.MeshBasicMaterial({
      color: new T.Color(0x2f9fb5).multiplyScalar(0.9), transparent: true, opacity: 0.24,
      blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide
    });
    var orbitMat2 = orbitMat.clone();
    orbitMat2.opacity = 0.1;
    var orbitA = new T.Mesh(new T.TorusGeometry(21, 0.055, 6, 160, Math.PI * 1.35), orbitMat);
    var orbitB = new T.Mesh(new T.TorusGeometry(21.9, 0.028, 6, 160, Math.PI * 1.05), orbitMat2);
    orbitGroup.add(orbitA, orbitB);
    orbitGroup.position.set(-2, 10, -30);
    orbitGroup.rotation.set(1.18, 0.2, -0.3);
    scene.add(orbitGroup);

    /* --------------------------------------------------------------- floor */
    var floorMat = new T.MeshStandardMaterial({
      color: 0x020608, metalness: 0.05, roughness: 0.84, envMapIntensity: 0.02
    });
    var floor = new T.Mesh(new T.CircleGeometry(34, 96), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    scene.add(floor);

    // outer apron ring to ground the space
    var apron = new T.Mesh(
      new T.RingGeometry(33.5, 34, 96),
      new T.MeshBasicMaterial({ color: new T.Color(0x1b6b80).multiplyScalar(0.5), transparent: true, opacity: 0.5, blending: T.AdditiveBlending, side: T.DoubleSide, depthWrite: false, fog: true })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.01;
    scene.add(apron);

    var gridMat = new T.ShaderMaterial({
      vertexShader: GRID_VERT, fragmentShader: GRID_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new T.Color(0x1a5f78) },
        uColorB: { value: new T.Color(0x2a8ba8) }
      },
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false, toneMapped: false
    });
    var grid = new T.Mesh(new T.PlaneGeometry(70, 70), gridMat);
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = 0.001;
    grid.renderOrder = 1;
    scene.add(grid);

    /* ----------------------------------------------------------- pad decal */
    var padTex = makePadTexture();
    var pad = new T.Mesh(new T.PlaneGeometry(8.2, 8.2), new T.MeshBasicMaterial({
      map: padTex, transparent: true, opacity: 0.32, blending: T.AdditiveBlending,
      depthWrite: false, toneMapped: false, fog: true
    }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.004;
    pad.renderOrder = 2;
    scene.add(pad);

    /* ---------------------------------------------------- holographic rings */
    var holo = new T.Group();
    scene.add(holo);
    var ringMat = new T.MeshBasicMaterial({
      color: new T.Color(0x2fbfd8).multiplyScalar(0.75), transparent: true, opacity: 0.38,
      blending: T.AdditiveBlending, side: T.DoubleSide, depthWrite: false, toneMapped: false, fog: false
    });
    var ringMatDim = new T.MeshBasicMaterial({
      color: new T.Color(0x1d7f96).multiplyScalar(0.6), transparent: true, opacity: 0.22,
      blending: T.AdditiveBlending, side: T.DoubleSide, depthWrite: false, toneMapped: false, fog: false
    });
    function flatRing(rIn, rOut, mat, y) {
      var m = new T.Mesh(new T.RingGeometry(rIn, rOut, 96), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = y || 0.006;
      return m;
    }
    var ringA = flatRing(2.26, 2.275, ringMat, 0.008);
    var ringB = flatRing(1.34, 1.347, ringMatDim, 0.007);
    holo.add(ringA, ringB);

    // ticks ring
    var tickPos = [];
    for (var t = 0; t < 72; t++) {
      var ang = t / 72 * Math.PI * 2;
      var r0 = 1.68, r1 = t % 6 === 0 ? 1.80 : 1.74;
      tickPos.push(Math.cos(ang) * r0, 0.01, Math.sin(ang) * r0);
      tickPos.push(Math.cos(ang) * r1, 0.01, Math.sin(ang) * r1);
    }
    var tickGeo = new T.BufferGeometry();
    tickGeo.setAttribute('position', new T.Float32BufferAttribute(tickPos, 3));
    var ticks = new T.LineSegments(tickGeo, new T.LineBasicMaterial({
      color: 0x3fd8f0, transparent: true, opacity: 0.42, blending: T.AdditiveBlending, depthWrite: false, fog: false
    }));
    holo.add(ticks);

    // rotating arc rings (dashed look)
    function arcRing(r, width, count, span, offset) {
      var g = new T.Group();
      for (var i = 0; i < count; i++) {
        var start = offset + i * (Math.PI * 2 / count);
        var m = new T.Mesh(new T.RingGeometry(r, r + width, 24, 1, start, span), ringMatDim);
        m.rotation.x = -Math.PI / 2;
        m.position.y = 0.009;
        g.add(m);
      }
      return g;
    }
    var arcsA = arcRing(2.55, 0.012, 3, 1.1, 0);
    var arcsB = arcRing(2.9, 0.008, 5, 0.62, 0.4);
    holo.add(arcsA, arcsB);

    // pad corner emitters
    var pylonMat = new T.MeshStandardMaterial({ color: 0x0d161c, metalness: 0.9, roughness: 0.35, envMapIntensity: 1.0 });
    var pylons = [];
    for (var p = 0; p < 4; p++) {
      var a = Math.PI / 4 + p * Math.PI / 2;
      var px = Math.cos(a) * 5.6, pz = Math.sin(a) * 5.6;
      var g = new T.Group();
      g.position.set(px, 0, pz);
      var base = A.mesh(new T.CylinderGeometry(0.11, 0.15, 0.06, 16), pylonMat);
      base.position.y = 0.03;
      var post = A.mesh(new T.BoxGeometry(0.045, 0.46, 0.045), pylonMat);
      post.position.y = 0.27;
      var cap = new T.Mesh(new T.BoxGeometry(0.055, 0.014, 0.055), ringMat);
      cap.position.y = 0.51;
      var glow = A.glowSprite(0x54ecff, 0.32, 0.22, true);
      glow.position.y = 0.52;
      var strip = new T.Mesh(new T.BoxGeometry(0.01, 0.34, 0.008), new T.MeshBasicMaterial({
        color: new T.Color(0x44dff5).multiplyScalar(1.2), toneMapped: false
      }));
      strip.position.set(0.028, 0.3, 0.028);
      g.add(base, post, cap, glow, strip);
      g.rotation.y = a;
      g.userData.phase = p * 1.7;
      scene.add(g);
      pylons.push(g);
    }

    /* ------------------------------------------------------------- dust */
    var dustRng = A.rng(7812);
    var DUST = 240;
    var dustBase = new Float32Array(DUST * 3);
    var dustPhase = new Float32Array(DUST);
    var dPos = [];
    for (var q = 0; q < DUST; q++) {
      var rr = 1.5 + dustRng() * 7.5;
      var aa = dustRng() * Math.PI * 2;
      var yy = 0.15 + dustRng() * 4.2;
      dustBase[q * 3] = Math.cos(aa) * rr;
      dustBase[q * 3 + 1] = yy;
      dustBase[q * 3 + 2] = Math.sin(aa) * rr;
      dustPhase[q] = dustRng() * Math.PI * 2;
      dPos.push(dustBase[q * 3], yy, dustBase[q * 3 + 2]);
    }
    var dustGeo = new T.BufferGeometry();
    dustGeo.setAttribute('position', new T.Float32BufferAttribute(dPos, 3));
    var dustMat = new T.PointsMaterial({
      size: 0.032, sizeAttenuation: true, transparent: true, opacity: 0.55,
      color: 0x8fe8ff, map: A.textures.glow, depthWrite: false, blending: T.AdditiveBlending, fog: false, toneMapped: false
    });
    var dust = new T.Points(dustGeo, dustMat);
    scene.add(dust);

    // atmospheric backdrop haze for volumetric depth
    var haze = [];
    [[0.0, 4.2, -9.0, 17.0, 0.028]].forEach(function (h) {
      var sp = A.glowSprite(0x2f9fb5, h[3], h[4], true);
      sp.position.set(h[0], h[1], h[2]);
      sp.material.depthWrite = false;
      scene.add(sp);
      haze.push(sp);
    });

    /* --------------------------------------------------------------- lights */
    var hemi = new T.HemisphereLight(0xa8dcff, 0x030609, 1.1);
    scene.add(hemi);

    var key = new T.DirectionalLight(0xd8f4ff, 4.0);
    key.position.set(4.0, 8.0, 4.0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 24;
    key.shadow.camera.left = -2.3;
    key.shadow.camera.right = 2.3;
    key.shadow.camera.top = 2.3;
    key.shadow.camera.bottom = -2.3;
    key.shadow.bias = -0.0008;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    scene.add(key.target);

    var fill = new T.DirectionalLight(0x8fd8ff, 1.2);
    fill.position.set(1.5, 3.2, 6.5);
    scene.add(fill);

    var rim = new T.DirectionalLight(0x2fd4ff, 2.0);
    rim.position.set(-5.5, 3.2, -4.5);
    scene.add(rim);

    var warm = new T.DirectionalLight(0xff9a44, 1.25);
    warm.position.set(2.5, 2.4, -6);
    scene.add(warm);

    // camera-attached studio fill so the airframe reads from every orbit angle
    var cameraFill = new T.DirectionalLight(0xcfefff, 2.3);
    cameraFill.position.set(3.4, 2.9, 4.2);
    scene.add(cameraFill);
    scene.add(cameraFill.target);

    var padLight = new T.PointLight(0x2ee6ff, 0.7, 7, 1.9);
    padLight.position.set(0, 0.35, 0);
    scene.add(padLight);

    var droneGlow = new T.PointLight(0x3ce9ff, 0.85, 3.0, 1.7);
    droneGlow.position.set(0, 1, 0);
    scene.add(droneGlow);

    /* --------------------------------------------- drone target / pool glow */
    var targetRing = new T.Group();    var trMat = new T.MeshBasicMaterial({
      color: new T.Color(0x49e8ff).multiplyScalar(1.1), transparent: true, opacity: 0.85,
      blending: T.AdditiveBlending, side: T.DoubleSide, depthWrite: false, toneMapped: false, fog: false
    });
    var tr1 = new T.Mesh(new T.RingGeometry(0.4, 0.425, 64), trMat);
    tr1.rotation.x = -Math.PI / 2;
    tr1.position.y = 0.014;
    var tr2 = new T.Mesh(new T.RingGeometry(0.6, 0.607, 64, 1, 0.2, 4.2), trMat);
    tr2.rotation.x = -Math.PI / 2;
    tr2.position.y = 0.014;
    targetRing.add(tr1, tr2);
    scene.add(targetRing);

    var poolTex = A.textures.glowSoft;
    var pool = new T.Mesh(new T.PlaneGeometry(4.0, 4.0), new T.MeshBasicMaterial({
      map: poolTex, color: 0x0a313c, transparent: true, opacity: 0.16,
      blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, fog: true
    }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.012;
    scene.add(pool);

    // soft contact shadow blob (anchors the drone even in the dark)
    var blobCanvas = canvas2d(256, 256);
    var bg = blobCanvas.ctx.createRadialGradient(128, 128, 10, 128, 128, 126);
    bg.addColorStop(0, 'rgba(0,0,0,.85)');
    bg.addColorStop(0.45, 'rgba(0,0,0,.5)');
    bg.addColorStop(0.78, 'rgba(0,0,0,.14)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    blobCanvas.ctx.fillStyle = bg;
    blobCanvas.ctx.fillRect(0, 0, 256, 256);
    var blobTex = new T.CanvasTexture(blobCanvas.c);
    var contact = new T.Mesh(new T.PlaneGeometry(2.4, 2.4), new T.MeshBasicMaterial({
      map: blobTex, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, fog: false
    }));
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.009;
    contact.renderOrder = 3;
    scene.add(contact);

    /* --------------------------------------------------------------- update */
    var tmpColor = new T.Color();
    world.lights = { key: key, rim: rim, warm: warm, hemi: hemi, padLight: padLight, droneGlow: droneGlow };
    world.sky = sky;
    world.env = null;

    world.update = function (dt, time, state) {
      var dp = state.dronePos || new T.Vector3(0, 1.55, 0);
      var alt = Math.max(0.4, dp.y);

      gridMat.uniforms.uTime.value = time;
      stars.rotation.y = time * 0.0035;
      sky.rotation.y = time * 0.002;
      orbitGroup.rotation.z = -0.3 + time * 0.004;

      holo.rotation.y = time * 0.05;
      arcsA.rotation.y = -time * 0.12;
      arcsB.rotation.y = time * 0.09;
      ticks.rotation.y = time * 0.02;
      pad.material.opacity = 0.4 + Math.sin(time * 0.6) * 0.06;

      for (var i = 0; i < pylons.length; i++) {
        var pg = pylons[i];
        pg.children[3].material.opacity = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(time * 1.7 + pg.userData.phase));
      }
      for (var j = 0; j < pylons.length; j++) {
        var pg = pylons[j];
        pg.children[3].material.opacity = 0.2 + 0.2 * (0.5 + 0.5 * Math.sin(time * 1.7 + pg.userData.phase));
      }

      // dust drift
      var pos = dustGeo.attributes.position;
      for (var k = 0; k < DUST; k++) {
        var ph = dustPhase[k];
        pos.array[k * 3 + 1] = dustBase[k * 3 + 1] + Math.sin(time * 0.22 + ph) * 0.35;
        pos.array[k * 3] = dustBase[k * 3] + Math.sin(time * 0.13 + ph) * 0.18;
      }
      pos.needsUpdate = true;
      dust.rotation.y = time * 0.012;

      // light rig follows the drone so shadows stay crisp
      key.position.set(dp.x + 4.0, 8.0, dp.z + 4.0);
      key.target.position.set(dp.x, Math.max(0.6, dp.y - 0.6), dp.z);
      key.target.updateMatrixWorld();
      droneGlow.position.set(dp.x, Math.max(0.25, dp.y - 0.55), dp.z);
      if (state.cameraPos) {
        cameraFill.position.copy(state.cameraPos);
        cameraFill.target.position.copy(dp);
        cameraFill.target.updateMatrixWorld();
      }

      // target ring + light pool under drone
      targetRing.position.set(dp.x, 0, dp.z);
      var hf = A.clamp((alt - 1.1) / 3.5, 0, 1);
      targetRing.scale.setScalar(1 + hf * 0.55);
      tr1.material.opacity = 0.38;
      tr2.rotation.z = time * 0.5;
      targetRing.rotation.y = 0;
      pool.position.set(dp.x, 0.011, dp.z);
      var poolScale = 0.7 + hf * 0.6;
      pool.scale.setScalar(poolScale);
      pool.material.opacity = 0.22 * (1 - hf * 0.45);

      contact.position.set(dp.x, 0.009, dp.z);
      var cScale = 1.0 + hf * 0.7;
      contact.scale.setScalar(cScale);
      contact.material.opacity = 0.62 * (1 - hf * 0.5);

      state._world = world;
    };

    world.setEnv = function (env) {
      scene.environment = env;
      world.env = env;
    };

    return world;
  };
})();
