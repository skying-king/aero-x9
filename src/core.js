/* ============================================================================
   AERO X-9 · core.js
   Shared utilities, procedural environment map, materials, textures.
   ========================================================================== */
window.AERO = window.AERO || {};
(function () {
  'use strict';
  var A = window.AERO;
  if (typeof THREE === 'undefined') { A.FATAL = 'THREE missing'; return; }
  var T = THREE;

  /* ------------------------------------------------------------- query args */
  A.query = (function () {
    var out = {};
    try {
      var search = location.search || '';
      search.replace(/^\?/, '').split('&').forEach(function (kv) {
        if (!kv) return;
        var p = kv.split('=');
        out[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '1');
      });
    } catch (e) { }
    return out;
  })();
  A.flag = function (name, def) {
    if (!(name in A.query)) return !!def;
    var v = A.query[name];
    return v === '1' || v === 'true' || v === '' ? true : (v === '0' || v === 'false' ? false : v);
  };
  A.num = function (name, def) {
    var v = A.query[name];
    if (v === undefined) return def;
    var n = parseFloat(v);
    return isFinite(n) ? n : def;
  };

  /* ---------------------------------------------------------------- helpers */
  A.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  A.lerp = function (a, b, t) { return a + (b - a) * t; };
  A.damp = function (a, b, lambda, dt) { return A.lerp(a, b, 1 - Math.exp(-lambda * dt)); };
  A.smoothstep = function (a, b, x) {
    var t = A.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  A.easeOutCubic = function (t) { t = A.clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };
  A.easeInOutCubic = function (t) {
    t = A.clamp(t, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  A.easeOutExpo = function (t) { t = A.clamp(t, 0, 1); return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); };
  A.pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  A.rad = function (d) { return d * Math.PI / 180; };
  A.deg = function (r) { return r * 180 / Math.PI; };

  A.rng = function (seed) {
    var s = (seed || 1) >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };

  /* --------------------------------------------------------------- textures */
  var texCache = {};

  function canvas2d(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return { c: c, ctx: c.getContext('2d') };
  }

  A.textures = {};
  Object.defineProperties(A.textures, {
    glow: {
      get: function () {
        if (texCache.glow) return texCache.glow;
        var d = canvas2d(128, 128), g = d.ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.18, 'rgba(255,255,255,.9)');
        g.addColorStop(0.42, 'rgba(255,255,255,.28)');
        g.addColorStop(0.72, 'rgba(255,255,255,.06)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        d.ctx.fillStyle = g; d.ctx.fillRect(0, 0, 128, 128);
        texCache.glow = new T.CanvasTexture(d.c);
        return texCache.glow;
      }
    },
    glowSoft: {
      get: function () {
        if (texCache.glowSoft) return texCache.glowSoft;
        var d = canvas2d(256, 256), g = d.ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        g.addColorStop(0, 'rgba(255,255,255,.85)');
        g.addColorStop(0.3, 'rgba(255,255,255,.32)');
        g.addColorStop(0.65, 'rgba(255,255,255,.07)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        d.ctx.fillStyle = g; d.ctx.fillRect(0, 0, 256, 256);
        texCache.glowSoft = new T.CanvasTexture(d.c);
        return texCache.glowSoft;
      }
    },
    propBlur: {
      get: function () {
        if (texCache.propBlur) return texCache.propBlur;
        var S = 256, d = canvas2d(S, S), ctx = d.ctx, cx = S / 2, cy = S / 2;
        var g = ctx.createRadialGradient(cx, cy, S * 0.04, cx, cy, S * 0.5);
        g.addColorStop(0, 'rgba(255,255,255,.02)');
        g.addColorStop(0.18, 'rgba(255,255,255,.10)');
        g.addColorStop(0.55, 'rgba(255,255,255,.20)');
        g.addColorStop(0.82, 'rgba(255,255,255,.34)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, S * 0.5, 0, Math.PI * 2); ctx.fill();
        // faint swept streaks
        ctx.globalCompositeOperation = 'lighter';
        for (var i = 0; i < 26; i++) {
          var a0 = (i / 26) * Math.PI * 2 + Math.random() * 0.06;
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.02 + Math.random() * 0.05) + ')';
          ctx.lineWidth = 1 + Math.random() * 2.5;
          ctx.beginPath();
          ctx.arc(cx, cy, S * (0.2 + Math.random() * 0.28), a0, a0 + 0.4 + Math.random() * 0.8);
          ctx.stroke();
        }
        texCache.propBlur = new T.CanvasTexture(d.c);
        return texCache.propBlur;
      }
    }
  });

  /* Small transparent text decal texture. lines: [{t,size,color,weight,spacing}] */
  A.textTexture = function (lines, opts) {
    opts = opts || {};
    var W = opts.w || 512, H = opts.h || 128;
    var d = canvas2d(W, H), ctx = d.ctx;
    if (opts.bg) { ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, W, H); }
    ctx.textBaseline = 'middle';
    ctx.textAlign = opts.align || 'left';
    var x = opts.align === 'center' ? W / 2 : (opts.align === 'right' ? W - 8 : 8);
    var total = 0;
    lines.forEach(function (l) { total += (l.size || 20) * 1.36; });
    var y = (H - total) / 2 + (lines[0] ? (lines[0].size || 20) * 0.68 : 0);
    lines.forEach(function (l) {
      var size = l.size || 20;
      ctx.font = (l.weight || 500) + ' ' + size + 'px ' + (l.font || 'Consolas, monospace');
      ctx.fillStyle = l.color || 'rgba(255,255,255,.8)';
      if (l.spacing) {
        var txt = l.t, cx = x;
        ctx.textAlign = 'left';
        for (var i = 0; i < txt.length; i++) {
          ctx.fillText(txt[i], cx, y);
          cx += ctx.measureText(txt[i]).width + l.spacing;
        }
      } else {
        ctx.fillText(l.t, x, y);
      }
      y += size * 1.36;
    });
    var tex = new T.CanvasTexture(d.c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };

  A.decal = function (tex, w, h, opts) {
    opts = opts || {};
    var mat = new T.MeshBasicMaterial({
      map: tex, transparent: true, opacity: opts.opacity === undefined ? 0.85 : opts.opacity,
      depthWrite: false, depthTest: true, side: T.DoubleSide,
      blending: opts.additive ? T.AdditiveBlending : T.NormalBlending
    });
    var mesh = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    mesh.renderOrder = 2;
    return mesh;
  };

  /* ------------------------------------------------------------- environment */
  A.makeEnvironment = function (renderer) {
    var W = 1024, H = 512;
    var d = canvas2d(W, H), ctx = d.ctx;
    // base vertical gradient
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0.0, '#0a2433');
    g.addColorStop(0.38, '#06131c');
    g.addColorStop(0.52, '#0d3644');
    g.addColorStop(0.56, '#041018');
    g.addColorStop(1.0, '#010205');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // soft studio boxes
    function soft(x, y, w, h, color, blur) {
      ctx.save();
      ctx.filter = 'blur(' + blur + 'px)';
      ctx.fillStyle = color;
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.restore();
    }
    soft(W * 0.50, H * 0.10, W * 0.46, H * 0.13, 'rgba(225,250,255,1)', 36);    // overhead key
    soft(W * 0.13, H * 0.40, W * 0.12, H * 0.30, 'rgba(70,230,255,.8)', 30);     // cyan left
    soft(W * 0.87, H * 0.40, W * 0.10, H * 0.26, 'rgba(255,160,70,.55)', 30);    // warm right
    soft(W * 0.50, H * 0.60, W * 0.60, H * 0.06, 'rgba(90,210,240,.5)', 26);     // horizon strip
    soft(W * 0.74, H * 0.16, W * 0.12, H * 0.06, 'rgba(170,250,255,.65)', 22);
    soft(W * 0.24, H * 0.20, W * 0.04, H * 0.05, 'rgba(255,255,255,.6)', 12);
    soft(W * 0.5, H * 0.85, W * 0.7, H * 0.1, 'rgba(30,90,110,.35)', 40);

    var tex = new T.CanvasTexture(d.c);
    tex.mapping = T.EquirectangularReflectionMapping;
    tex.colorSpace = T.SRGBColorSpace;

    var pmrem = new T.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    var rt = pmrem.fromEquirectangular(tex);
    pmrem.dispose();
    tex.dispose();
    return rt.texture;
  };

  /* --------------------------------------------------------------- materials */
  A.makeMaterials = function () {
    var mats = {};
    mats.carbon = new T.MeshPhysicalMaterial({
      color: 0x1a242c, metalness: 0.55, roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.34, envMapIntensity: 1.0
    });
    mats.shell = new T.MeshPhysicalMaterial({
      color: 0x3a4c5a, metalness: 0.82, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 1.5
    });
    mats.shellWarm = new T.MeshPhysicalMaterial({
      color: 0x4a4036, metalness: 0.82, roughness: 0.34, clearcoat: 0.6, envMapIntensity: 1.2
    });
    mats.alu = new T.MeshStandardMaterial({
      color: 0xb4c4cf, metalness: 1.0, roughness: 0.24, envMapIntensity: 1.5
    });
    mats.darkMetal = new T.MeshStandardMaterial({
      color: 0x1a222a, metalness: 0.85, roughness: 0.42, envMapIntensity: 0.9
    });
    mats.motor = new T.MeshStandardMaterial({
      color: 0x475a66, metalness: 0.92, roughness: 0.28, envMapIntensity: 1.4
    });
    mats.rubber = new T.MeshStandardMaterial({
      color: 0x050709, metalness: 0.0, roughness: 0.92
    });
    mats.glass = new T.MeshPhysicalMaterial({
      color: 0x2a6373, metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.3,
      envMapIntensity: 0.9, clearcoat: 0.9, clearcoatRoughness: 0.05, side: T.DoubleSide, depthWrite: false
    });
    mats.prop = new T.MeshPhysicalMaterial({
      color: 0x20282f, metalness: 0.5, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.3, side: T.DoubleSide
    });
    mats.copper = new T.MeshStandardMaterial({
      color: 0xc07a3c, metalness: 1.0, roughness: 0.33, envMapIntensity: 1.3
    });
    mats.pcb = new T.MeshStandardMaterial({
      color: 0x061a17, metalness: 0.2, roughness: 0.62
    });
    mats.chip = new T.MeshStandardMaterial({
      color: 0x0c1116, metalness: 0.7, roughness: 0.45
    });

    function emissive(color, intensity, base) {
      return new T.MeshStandardMaterial({
        color: base === undefined ? 0x020608 : base,
        emissive: color,
        emissiveIntensity: intensity,
        metalness: 0.2,
        roughness: 0.32,
        envMapIntensity: 0.4
      });
    }
    mats.cyan = emissive(0x35e8ff, 3.4, 0x03181d);
    mats.cyanSoft = emissive(0x1fbfe0, 1.6, 0x03151a);
    mats.amber = emissive(0xff8d24, 2.6, 0x1a0c02);
    mats.red = emissive(0xff3d52, 2.6, 0x1a0407);
    mats.green = emissive(0x51ffb0, 2.2, 0x03170e);
    mats.white = emissive(0xdffbff, 3.0, 0x0a1416);

    // HDR-ish basic glow materials (values > 1 feed the bloom pass)
    function basic(color, intensity) {
      var c = new T.Color(color).multiplyScalar(intensity);
      return new T.MeshBasicMaterial({ color: c, toneMapped: false, fog: false });
    }
    mats.basicCyan = basic(0x62f3ff, 2.4);
    mats.basicCyanDim = basic(0x62f3ff, 1.25);
    mats.basicWhite = basic(0xe8feff, 2.8);
    mats.basicAmber = basic(0xffa348, 1.9);
    mats.basicRed = basic(0xff4058, 2.0);
    mats.basicGreen = basic(0x6fffc2, 1.7);

    return mats;
  };

  /* --------------------------------------------------------------- geometry */
  A.roundRectShape = function (w, h, r) {
    var hw = w / 2, hh = h / 2;
    r = Math.min(r, Math.min(hw, hh) * 0.98);
    var s = new T.Shape();
    s.moveTo(-hw + r, -hh);
    s.lineTo(hw - r, -hh);
    s.quadraticCurveTo(hw, -hh, hw, -hh + r);
    s.lineTo(hw, hh - r);
    s.quadraticCurveTo(hw, hh, hw - r, hh);
    s.lineTo(-hw + r, hh);
    s.quadraticCurveTo(-hw, hh, -hw, hh - r);
    s.lineTo(-hw, -hh + r);
    s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
    return s;
  };

  /* Plate in XY plane extruded along +Z, centred. width=x, height=y, depth=z */
  A.plate = function (w, h, d, r, bevel) {
    bevel = bevel === undefined ? Math.min(0.008, d * 0.24) : bevel;
    r = r || 0;
    var shape = r > 0 ? A.roundRectShape(Math.max(0.001, w - bevel * 2), Math.max(0.001, h - bevel * 2), Math.max(0.001, r - bevel)) : (function () {
      var s = new T.Shape();
      s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.closePath();
      return s;
    })();
    var depth = Math.max(0.001, d - bevel * 2);
    var geo = new T.ExtrudeGeometry(shape, {
      depth: depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
      bevelSegments: 2, curveSegments: 8, steps: 1
    });
    geo.center();
    return geo;
  };

  /* Horizontal plate: width=x, depth=z, thickness=y */
  A.plateXZ = function (w, d, h, r, bevel) {
    var geo = A.plate(w, d, h, r, bevel);
    geo.rotateX(-Math.PI / 2);
    geo.center();
    return geo;
  };

  A.mesh = function (geo, mat, cast, receive) {
    var m = new T.Mesh(geo, mat);
    m.castShadow = cast !== false;
    m.receiveShadow = receive !== false;
    return m;
  };

  A.glowSprite = function (color, size, opacity, soft) {
    var mat = new T.SpriteMaterial({
      map: soft ? A.textures.glowSoft : A.textures.glow,
      color: color,
      transparent: true,
      opacity: opacity === undefined ? 0.9 : opacity,
      blending: T.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false
    });
    var s = new T.Sprite(mat);
    s.scale.set(size, size, 1);
    s.renderOrder = 3;
    return s;
  };

  A.disposeObject = function (obj) {
    obj.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        var list = Array.isArray(o.material) ? o.material : [o.material];
        list.forEach(function (m) { if (m && m.dispose) m.dispose(); });
      }
    });
  };
})();
