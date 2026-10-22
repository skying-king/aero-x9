/* ============================================================================
   AERO X-9 · controls.js
   Custom orbit rig: damped spherical orbit with auto-orbit idle, pointer drag,
   wheel zoom, pinch zoom, smooth follow of the drone.
   ========================================================================== */
(function () {
  'use strict';
  var A = window.AERO;
  if (typeof THREE === 'undefined') return;
  var T = THREE;

  A.createControls = function (camera, dom) {
    dom.style.touchAction = 'none';
    dom.style.cursor = 'grab';

    var DEF = { theta: 0.5, phi: 1.42, radius: 2.95 };
    var s = {
      theta: DEF.theta, phi: DEF.phi, radius: DEF.radius,
      desiredTheta: DEF.theta, desiredPhi: DEF.phi, desiredRadius: DEF.radius,
      minRadius: 1.9, maxRadius: 8.8,
      minPhi: 0.55, maxPhi: 1.46,
      follow: new T.Vector3(0, 1.55, 0),
      followTarget: new T.Vector3(0, 1.55, 0),
      autoOrbit: true,
      dragging: false,
      lastInput: performance.now(),
      pointers: new Map(),
      pinchDist: 0
    };

    function markInput() { s.lastInput = performance.now(); }

    function onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dom.setPointerCapture && dom.setPointerCapture(e.pointerId);
      s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (s.pointers.size === 1) {
        s.dragging = true;
        s._px = e.clientX; s._py = e.clientY;
        dom.style.cursor = 'grabbing';
      } else if (s.pointers.size === 2) {
        var pts = Array.from(s.pointers.values());
        s.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
      markInput();
    }

    function onPointerMove(e) {
      if (!s.pointers.has(e.pointerId)) return;
      var p = s.pointers.get(e.pointerId);
      p.x = e.clientX; p.y = e.clientY;
      if (s.pointers.size >= 2) {
        var pts = Array.from(s.pointers.values());
        var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (s.pinchDist > 0) {
          s.desiredRadius = A.clamp(s.desiredRadius * (s.pinchDist / Math.max(1, dist)), s.minRadius, s.maxRadius);
        }
        s.pinchDist = dist;
        markInput();
        return;
      }
      if (!s.dragging) return;
      var dx = e.clientX - s._px, dy = e.clientY - s._py;
      s._px = e.clientX; s._py = e.clientY;
      s.desiredTheta -= dx * 0.0052;
      s.desiredPhi = A.clamp(s.desiredPhi - dy * 0.0042, s.minPhi, s.maxPhi);
      markInput();
    }

    function onPointerUp(e) {
      s.pointers.delete(e.pointerId);
      if (s.pointers.size === 0) {
        s.dragging = false;
        dom.style.cursor = 'grab';
      }
      s.pinchDist = 0;
    }

    function onWheel(e) {
      e.preventDefault();
      var d = e.deltaY;
      if (e.deltaMode === 1) d *= 16;
      s.desiredRadius = A.clamp(s.desiredRadius * (1 + d * 0.0011), s.minRadius, s.maxRadius);
      markInput();
    }

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    function update(dt) {
      s.follow.lerp(s.followTarget, 1 - Math.exp(-6.5 * dt));
      var idle = (performance.now() - s.lastInput) / 1000;
      if (s.autoOrbit && !s.dragging && idle > 1.8) {
        s.desiredTheta += dt * 0.075;
      }
      s.theta = A.damp(s.theta, s.desiredTheta, 7, dt);
      s.phi = A.damp(s.phi, s.desiredPhi, 7, dt);
      s.radius = A.damp(s.radius, s.desiredRadius, 7, dt);

      var sinPhi = Math.sin(s.phi);
      camera.position.set(
        s.follow.x + s.radius * sinPhi * Math.sin(s.theta),
        s.follow.y + s.radius * Math.cos(s.phi),
        s.follow.z + s.radius * sinPhi * Math.cos(s.theta)
      );
      camera.lookAt(s.follow);
      camera.updateMatrixWorld();
    }

    return {
      update: update,
      setFollow: function (v) { s.followTarget.copy(v); },
      getFollow: function () { return s.follow; },
      setAutoOrbit: function (v) { s.autoOrbit = !!v; if (v) markInput(); },
      getAutoOrbit: function () { return s.autoOrbit; },
      isDragging: function () { return s.dragging; },
      reset: function () {
        s.desiredTheta = DEF.theta;
        s.desiredPhi = DEF.phi;
        s.desiredRadius = DEF.radius;
        s.lastInput = performance.now();
      },
      setView: function (theta, phi, radius) {
        if (typeof theta === 'number') s.desiredTheta = theta;
        if (typeof phi === 'number') s.desiredPhi = A.clamp(phi, s.minPhi, s.maxPhi);
        if (typeof radius === 'number') s.desiredRadius = A.clamp(radius, s.minRadius, s.maxRadius);
        markInput();
      },
      zoomTo: function (r) { s.desiredRadius = A.clamp(r, s.minRadius, s.maxRadius); },
      getRadius: function () { return s.radius; },
      getAngles: function () { return { theta: s.theta, phi: s.phi, radius: s.radius }; },
      dispose: function () {
        dom.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        dom.removeEventListener('wheel', onWheel);
      }
    };
  };
})();
