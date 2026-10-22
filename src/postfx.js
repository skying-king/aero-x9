/* ============================================================================
   AERO X-9 · postfx.js
   Hand-rolled HDR pipeline: scene -> HDR target -> bright pass -> 3 mip
   gaussian bloom -> composite (ACES tonemap, chromatic aberration, grade,
   vignette, grain, manual sRGB encode).
   ========================================================================== */
(function () {
  'use strict';
  var A = window.AERO;
  if (typeof THREE === 'undefined') return;
  var T = THREE;

  var VERT = [
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = uv;',
    '  gl_Position = vec4(position.xy, 0.0, 1.0);',
    '}'
  ].join('\n');

  var BRIGHT_FRAG = [
    'varying vec2 vUv;',
    'uniform sampler2D tDiffuse;',
    'uniform float threshold;',
    'uniform float knee;',
    'void main(){',
    '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
    '  float br = max(c.r, max(c.g, c.b));',
    '  float k = max(knee, 0.0001);',
    '  float soft = clamp(br - threshold + k, 0.0, 2.0 * k);',
    '  soft = soft * soft / (4.0 * k + 0.0001);',
    '  float contrib = max(soft, br - threshold) / max(br, 0.0001);',
    '  gl_FragColor = vec4(c * contrib, 1.0);',
    '}'
  ].join('\n');

  var BLUR_FRAG = [
    'varying vec2 vUv;',
    'uniform sampler2D tDiffuse;',
    'uniform vec2 dir;',
    'uniform vec2 texel;',
    'void main(){',
    '  vec2 o = texel * dir;',
    '  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227027;',
    '  c += texture2D(tDiffuse, vUv + o * 1.384615).rgb * 0.316216;',
    '  c += texture2D(tDiffuse, vUv - o * 1.384615).rgb * 0.316216;',
    '  c += texture2D(tDiffuse, vUv + o * 3.230769).rgb * 0.070270;',
    '  c += texture2D(tDiffuse, vUv - o * 3.230769).rgb * 0.070270;',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');

  var DOWN_FRAG = [
    'varying vec2 vUv;',
    'uniform sampler2D tDiffuse;',
    'uniform vec2 texel;',
    'void main(){',
    '  vec3 c = texture2D(tDiffuse, vUv + texel * vec2(-1.0, -1.0)).rgb;',
    '  c += texture2D(tDiffuse, vUv + texel * vec2( 1.0, -1.0)).rgb;',
    '  c += texture2D(tDiffuse, vUv + texel * vec2(-1.0,  1.0)).rgb;',
    '  c += texture2D(tDiffuse, vUv + texel * vec2( 1.0,  1.0)).rgb;',
    '  gl_FragColor = vec4(c * 0.25, 1.0);',
    '}'
  ].join('\n');

  var COMP_FRAG = [
    'varying vec2 vUv;',
    'uniform sampler2D tScene;',
    'uniform sampler2D tB0;',
    'uniform sampler2D tB1;',
    'uniform sampler2D tB2;',
    'uniform vec2 resolution;',
    'uniform float time;',
    'uniform float exposure;',
    'uniform float bloomStrength;',
    'uniform float aberr;',
    'uniform float vignette;',
    'uniform float grain;',
    'float hash12(vec2 p){',
    '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    'vec3 linearToSRGB(vec3 c){',
    '  return mix(1.055 * pow(max(c, vec3(0.0)), vec3(1.0/2.4)) - 0.055, c * 12.92, step(c, vec3(0.0031308)));',
    '}',
    'void main(){',
    '  vec2 uv = vUv;',
    '  vec2 d = uv - 0.5;',
    '  float ca = dot(d, d) * aberr;',
    '  vec3 base;',
    '  base.r = texture2D(tScene, uv + d * ca).r;',
    '  base.g = texture2D(tScene, uv).g;',
    '  base.b = texture2D(tScene, uv - d * ca).b;',
    '  vec3 bloom = texture2D(tB0, uv).rgb * 0.42 + texture2D(tB1, uv).rgb * 0.34 + texture2D(tB2, uv).rgb * 0.24;',
    '  vec3 col = base + bloom * bloomStrength;',
    '  col *= exposure;',
    '  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);',
    '  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '  col = mix(col, col * vec3(0.93, 1.03, 1.09), 0.34);',
    '  col += vec3(0.0, 0.003, 0.007) * (1.0 - lum);',
    '  col = mix(vec3(lum), col, 1.06);',
    '  float v = smoothstep(1.22, 0.22, length(d) * 1.92);',
    '  col *= mix(1.0, v, vignette);',
    '  float n = hash12(uv * resolution.xy * 0.5 + fract(time) * 91.7) - 0.5;',
    '  col += n * grain;',
    '  col = linearToSRGB(max(col, 0.0));',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  A.createPostFX = function (renderer, scene, camera, opts) {
    opts = opts || {};
    var gl = renderer.getContext();
    var isWebGL2 = renderer.capabilities.isWebGL2;
    var hdr = false;
    try {
      hdr = !!(isWebGL2 && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float')));
    } catch (e) { hdr = false; }
    var RT_TYPE = hdr ? T.HalfFloatType : T.UnsignedByteType;

    var enabled = !A.flag('nofx', false);
    var size = { w: 4, h: 4 };
    var levels = [];
    var sceneRT = null;
    var BLOOM_LEVELS = 3;
    var bloomScale = 0.5;

    var quadScene = new T.Scene();
    var quadCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var quad = new T.Mesh(new T.PlaneGeometry(2, 2), null);
    quad.frustumCulled = false;
    quadScene.add(quad);

    function makeRT(w, h, withDepth) {
      var rt = new T.WebGLRenderTarget(Math.max(2, w | 0), Math.max(2, h | 0), {
        minFilter: T.LinearFilter,
        magFilter: T.LinearFilter,
        format: T.RGBAFormat,
        type: RT_TYPE,
        depthBuffer: !!withDepth,
        stencilBuffer: false,
        generateMipmaps: false
      });
      rt.texture.generateMipmaps = false;
      return rt;
    }

    function disposeRT(rt) { if (rt) { try { rt.dispose(); } catch (e) { } } }

    function mat(frag, uniforms, extra) {
      var base = {
        uniforms: uniforms,
        vertexShader: VERT,
        fragmentShader: frag,
        depthTest: false,
        depthWrite: false,
        blending: T.NoBlending,
        fog: false
      };
      if (extra) for (var k in extra) base[k] = extra[k];
      return new T.ShaderMaterial(base);
    }

    var brightMat = mat(BRIGHT_FRAG, {
      tDiffuse: { value: null },
      threshold: { value: opts.threshold || 1.05 },
      knee: { value: 0.3 }
    });
    var blurMat = mat(BLUR_FRAG, {
      tDiffuse: { value: null },
      dir: { value: new T.Vector2(1, 0) },
      texel: { value: new T.Vector2(1 / 512, 1 / 512) }
    });
    var downMat = mat(DOWN_FRAG, {
      tDiffuse: { value: null },
      texel: { value: new T.Vector2(1 / 512, 1 / 512) }
    });
    var compMat = mat(COMP_FRAG, {
      tScene: { value: null },
      tB0: { value: null },
      tB1: { value: null },
      tB2: { value: null },
      resolution: { value: new T.Vector2(1280, 720) },
      time: { value: 0 },
      exposure: { value: opts.exposure || 1.0 },
      bloomStrength: { value: opts.bloomStrength || 0.4 },
      aberr: { value: opts.aberr || 0.012 },
      vignette: { value: opts.vignette || 0.5 },
      grain: { value: opts.grain || 0.008 }
    });

    function blit(material, target) {
      quad.material = material;
      renderer.setRenderTarget(target || null);
      renderer.clear();
      renderer.render(quadScene, quadCam);
    }

    function blur(src, tmp, dst, w, h) {
      blurMat.uniforms.tDiffuse.value = src.texture;
      blurMat.uniforms.dir.value.set(1, 0);
      blurMat.uniforms.texel.value.set(1 / w, 1 / h);
      blit(blurMat, tmp);
      blurMat.uniforms.tDiffuse.value = tmp.texture;
      blurMat.uniforms.dir.value.set(0, 1);
      blit(blurMat, dst);
    }

    function build(w, h) {
      disposeAll();
      size.w = Math.max(4, w | 0);
      size.h = Math.max(4, h | 0);
      sceneRT = makeRT(size.w, size.h, true);
      var bw = Math.max(2, Math.round(size.w * bloomScale));
      var bh = Math.max(2, Math.round(size.h * bloomScale));
      levels = [];
      for (var i = 0; i < BLOOM_LEVELS; i++) {
        var lw = Math.max(2, bw), lh = Math.max(2, bh);
        levels.push({
          w: lw, h: lh,
          rt: makeRT(lw, lh, false),
          tmp: makeRT(lw, lh, false)
        });
        bw = Math.max(2, Math.round(bw * 0.5));
        bh = Math.max(2, Math.round(bh * 0.5));
      }
      compMat.uniforms.resolution.value.set(size.w, size.h);
    }

    function disposeAll() {
      disposeRT(sceneRT); sceneRT = null;
      levels.forEach(function (l) { disposeRT(l.rt); disposeRT(l.tmp); });
      levels = [];
    }

    function render(time) {
      if (!enabled) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      renderer.setRenderTarget(sceneRT);
      renderer.clear();
      renderer.render(scene, camera);

      // bright pass -> level 0 base
      brightMat.uniforms.tDiffuse.value = sceneRT.texture;
      blit(brightMat, levels[0].rt);
      blur(levels[0].rt, levels[0].tmp, levels[0].rt, levels[0].w, levels[0].h);

      // downsample + blur for wider mips
      for (var i = 1; i < BLOOM_LEVELS; i++) {
        downMat.uniforms.tDiffuse.value = levels[i - 1].rt.texture;
        downMat.uniforms.texel.value.set(0.5 / levels[i - 1].w, 0.5 / levels[i - 1].h);
        blit(downMat, levels[i].rt);
        blur(levels[i].rt, levels[i].tmp, levels[i].rt, levels[i].w, levels[i].h);
      }

      compMat.uniforms.tScene.value = sceneRT.texture;
      compMat.uniforms.tB0.value = levels[0].rt.texture;
      compMat.uniforms.tB1.value = levels[1].rt.texture;
      compMat.uniforms.tB2.value = levels[2].rt.texture;
      compMat.uniforms.time.value = time || 0;
      blit(compMat, null);
    }

    build(4, 4);

    return {
      enabled: enabled,
      hdr: hdr,
      resize: function (w, h) { build(w, h); },
      render: render,
      params: compMat.uniforms,
      getSize: function () { return size; },
      dispose: function () { disposeAll(); quad.geometry.dispose(); brightMat.dispose(); blurMat.dispose(); downMat.dispose(); compMat.dispose(); }
    };
  };
})();
