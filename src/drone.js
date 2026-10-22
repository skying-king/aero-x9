/* ============================================================================
   AERO X-9 · drone.js
   Fully procedural quadrotor: carbon chassis, glass canopy, flight controller,
   smart battery, gimbal camera, skids, antenna, four arms / motors / props.
   Exposes a part registry for exploded views, picking and HUD labels.
   ========================================================================== */
(function () {
  'use strict';
  var A = window.AERO;
  if (typeof THREE === 'undefined') return;
  var T = THREE;

  /* ------------------------------------------------------------- part data */
  var PART_DEFS = [
    {
      id: 'props', idx: '01', cn: '螺旋桨组', en: 'PROPELLER ARRAY ×4', tag: 'AERO',
      desc: '三叶低噪折叠桨，碳纤/玻纤复合层压成型。高速旋转时桨尖产生稳定升力，配合折叠结构便于收纳与运输。',
      specs: [['材质', 'CFRP + 玻纤'], ['直径', '472 mm'], ['转速', '0 – 8,400 RPM'], ['状态', '待命 / STANDBY']],
      offset: new T.Vector3(0, 0.8, 0), order: 0
    },
    {
      id: 'motors', idx: '02', cn: '无刷电机组', en: 'BRUSHLESS MOTOR ×4', tag: 'POWER',
      desc: '外转子无刷直流电机，双轴承支撑与钕磁钢转子。FOC 电调闭环控制，提供毫秒级扭矩响应。',
      specs: [['型号', 'X9-4208 KV380'], ['峰值功率', '4 × 720 W'], ['轴承', '双 NSK 陶瓷'], ['状态', '待命 / STANDBY']],
      offset: new T.Vector3(0, 0.38, 0), order: 1
    },
    {
      id: 'arms', idx: '03', cn: '碳纤维机臂', en: 'CARBON FIBER ARMS ×4', tag: 'STRUCT',
      desc: '一体成型碳纤维管状机臂，内部走线并集成状态灯带。溃缩式根部结构可在碰撞时吸收冲击。',
      specs: [['材质', 'T800 碳纤维'], ['厚度', '2.4 mm'], ['刚度', '18.6 GPa'], ['状态', '锁止 / LOCKED']],
      offset: new T.Vector3(0.46, 0.05, 0), order: 2
    },
    {
      id: 'canopy', idx: '04', cn: '复合装甲上盖', en: 'CANOPY SHELL', tag: 'AERO',
      desc: '半透明聚碳酸酯座舱盖与装甲骨架。内层镀有导电膜，可屏蔽电磁干扰并保护内部飞控。',
      specs: [['材质', 'PC + 碳骨架'], ['透光率', '62 %'], ['防护等级', 'IP54'], ['状态', '锁闭 / SEALED']],
      offset: new T.Vector3(0, 0.68, 0), order: 3
    },
    {
      id: 'fc', idx: '05', cn: '飞控核心', en: 'FLIGHT CONTROLLER', tag: 'AVIONICS',
      desc: '双冗余飞控计算机，集成三轴 IMU、气压计与 GNSS 组合导航。每秒 8,000 次姿态解算。',
      specs: [['处理器', 'Dual-Core 480 MHz'], ['IMU', '3 × 冗余'], ['解算率', '8 kHz'], ['状态', '在线 / ONLINE']],
      offset: new T.Vector3(0, 0.42, 0), order: 4
    },
    {
      id: 'battery', idx: '06', cn: '智能电池组', en: 'SMART BATTERY', tag: 'POWER',
      desc: '高密度锂聚合物电池，内置 BMS 与自加热系统。快拆滑轨结构，支持热插拔更换。',
      specs: [['容量', '6S 4200 mAh'], ['续航', '38 min'], ['循环', '300 次'], ['电量', '98 %']],
      offset: new T.Vector3(0, -0.78, 0), order: 5
    },
    {
      id: 'gimbal', idx: '07', cn: '三轴云台相机', en: 'GIMBAL CAMERA', tag: 'OPTICS',
      desc: '1 英寸 CMOS 三轴机械增稳云台，支持 4K/120fps 与 10-bit D-Log。磁阻尼减震结构隔离机体振动。',
      specs: [['传感器', '1" CMOS'], ['视频', '4K / 120 fps'], ['稳像', '3 轴机械'], ['状态', '校准 / READY']],
      offset: new T.Vector3(0, -0.26, 0.6), order: 6
    },
    {
      id: 'skids', idx: '08', cn: '起落滑橇', en: 'LANDING SKIDS', tag: 'LAND',
      desc: '弹性碳纤起落滑橇，末端集成减震脚垫与触地传感器。可快速拆装以适应不同任务载荷。',
      specs: [['材质', '弹性碳纤'], ['减震', 'TPU 脚垫'], ['传感器', '触地检测'], ['状态', '展开 / DOWN']],
      offset: new T.Vector3(0, -0.94, 0), order: 7
    },
    {
      id: 'antenna', idx: '09', cn: '图传天线', en: 'VIDEO LINK ANTENNA', tag: 'LINK',
      desc: '双频全向图传天线，支持 2.4 / 5.8 GHz 自适应跳频。理论图传距离 15 km，延迟低于 28 ms。',
      specs: [['频段', '2.4 / 5.8 GHz'], ['增益', '3.2 dBi'], ['延迟', '< 28 ms'], ['状态', '同步 / SYNC']],
      offset: new T.Vector3(0, 0.34, -0.54), order: 8
    }
  ];

  /* ---------------------------------------------------------------- helpers */
  function plateGeo(w, h, d, r, bevel) { return A.plate(w, h, d, r, bevel); }

  function extrudeRaw(shape, depth, bevel, curveSegments) {
    return new T.ExtrudeGeometry(shape, {
      depth: Math.max(0.001, depth - bevel * 2),
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: curveSegments || 10,
      steps: 1
    });
  }

  function roundRectPath(path, w, h, r) {
    var hw = w / 2, hh = h / 2;
    r = Math.min(r, Math.min(hw, hh) * 0.98);
    path.moveTo(-hw + r, -hh);
    path.lineTo(hw - r, -hh);
    path.quadraticCurveTo(hw, -hh, hw, -hh + r);
    path.lineTo(hw, hh - r);
    path.quadraticCurveTo(hw, hh, hw - r, hh);
    path.lineTo(-hw + r, hh);
    path.quadraticCurveTo(-hw, hh, -hw, hh - r);
    path.lineTo(-hw, -hh + r);
    path.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
    return path;
  }

  function rimGeo(w, d, holeW, holeD, thick, r) {
    var shape = A.roundRectShape(w, d, r);
    var hole = roundRectPath(new T.Path(), holeW, holeD, r * 0.7);
    shape.holes.push(hole);
    var geo = extrudeRaw(shape, thick, 0.002, 10);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -thick / 2, 0);
    return geo;
  }

  function armShape() {
    var s = new T.Shape();
    s.moveTo(0.085, -0.055);
    s.lineTo(0.34, -0.05);
    s.quadraticCurveTo(0.47, -0.046, 0.552, -0.024);
    s.lineTo(0.552, 0.024);
    s.quadraticCurveTo(0.47, 0.046, 0.34, 0.05);
    s.lineTo(0.085, 0.055);
    s.closePath();
    return s;
  }

  function bladeShape() {
    var s = new T.Shape();
      s.moveTo(0.02, -0.014);
    s.quadraticCurveTo(0.055, -0.03, 0.11, -0.032);
    s.quadraticCurveTo(0.165, -0.032, 0.196, -0.018);
    s.quadraticCurveTo(0.222, -0.008, 0.226, 0.0);
    s.quadraticCurveTo(0.202, 0.014, 0.15, 0.021);
    s.quadraticCurveTo(0.085, 0.026, 0.02, 0.014);
    s.closePath();
    return s;
  }

  function boxGeo(w, h, d) { return new T.BoxGeometry(w, h, d); }

  function tubeFromPoints(points, radius, segments) {
    var curve = new T.CatmullRomCurve3(points);
    return new T.TubeGeometry(curve, segments || 24, radius, 8, false);
  }

  /* ==================================================================== */
  A.createDrone = function (scene, mats) {
    var root = new T.Group();
    root.position.set(0, 1.55, 0);
    root.rotation.order = 'YXZ';
    var model = new T.Group();
    model.rotation.order = 'YXZ';
    root.add(model);
    scene.add(root);

    var pickables = [];
    var parts = [];
    var partMap = {};
    var screwGeo = new T.CylinderGeometry(0.0062, 0.0062, 0.0038, 10);
    var discMats = [];
    var propGroups = [];
    var propDirs = [1, -1, 1, -1];
    var navSkins = {};
    var headGlow, tailL, tailR;
    var gimbalYaw, gimbalPitch;
    var selectionObjs = [];

    function mesh(parent, geo, mat, cast, receive) {
      var m = new T.Mesh(geo, mat);
      m.castShadow = cast !== false;
      m.receiveShadow = receive !== false;
      parent.add(m);
      return m;
    }
    function screw(parent, x, y, z) {
      var m = mesh(parent, screwGeo, mats.alu);
      m.position.set(x, y, z);
      m.castShadow = false;
      return m;
    }
    function addGlow(parent, color, size, opacity, x, y, z, soft) {
      var s = A.glowSprite(color, size, opacity, soft);
      s.position.set(x, y, z);
      parent.add(s);
      return s;
    }

    /* ============================================================ chassis */
    var chassis = new T.Group();
    model.add(chassis);

    var bottomPlate = mesh(chassis, A.plateXZ(0.30, 0.44, 0.026, 0.075, 0.006), mats.carbon);
    bottomPlate.position.y = -0.058;
    var body = mesh(chassis, A.plateXZ(0.315, 0.46, 0.086, 0.09, 0.012), mats.shell);
    body.position.y = -0.006;
    var deck = mesh(chassis, rimGeo(0.26, 0.35, 0.195, 0.29, 0.014, 0.075), mats.carbon);
    deck.position.set(0, 0.052, 0.006);
    var belly = mesh(chassis, A.plateXZ(0.235, 0.34, 0.02, 0.07, 0.005), mats.darkMetal);
    belly.position.y = -0.052;

    // side intake slats + LED rails
    for (var s = -1; s <= 1; s += 2) {
      for (var i = 0; i < 3; i++) {
        var slat = mesh(chassis, boxGeo(0.008, 0.026, 0.075), mats.darkMetal);
        slat.position.set(s * 0.156, -0.012, 0.075 - i * 0.075);
        slat.rotation.x = 0.32;
      }
      var rail = mesh(chassis, boxGeo(0.0045, 0.008, 0.22), mats.cyan);
      rail.position.set(s * 0.159, 0.018, -0.01);
      rail.castShadow = false;
      var railGlow = addGlow(chassis, 0x3fe6ff, 0.15, 0.22, s * 0.163, 0.018, -0.09, true);
      railGlow.material.depthTest = true;

      // side decal
      var sideTex = A.textTexture([
        { t: 'AERO X-9', size: 52, weight: 700, color: 'rgba(215,248,255,.9)', spacing: 3 },
        { t: 'UNIT 09 · CFRP AIRFRAME', size: 21, color: 'rgba(150,220,240,.6)', spacing: 2 }
      ], { w: 512, h: 180 });
      var sideDecal = A.decal(sideTex, 0.2, 0.07, { opacity: 0.8 });
      sideDecal.position.set(s * 0.1595, 0.0, -0.055);
      sideDecal.rotation.y = s * Math.PI / 2;
      chassis.add(sideDecal);
    }

    // front nose + headlights
    var nose = mesh(chassis, plateGeo(0.17, 0.09, 0.03, 0.02, 0.005), mats.carbon);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, -0.012, 0.216);
    for (var hh = -1; hh <= 1; hh += 2) {
      var lamp = mesh(chassis, new T.CylinderGeometry(0.0125, 0.0125, 0.008, 16), mats.basicWhite);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(hh * 0.068, 0.0, 0.233);
      lamp.castShadow = false;
      addGlow(chassis, 0xdffcff, 0.065, 0.28, hh * 0.068, 0.0, 0.238, false);
    }
    // downward sensor
    var sensor = mesh(chassis, new T.CylinderGeometry(0.021, 0.026, 0.012, 20), mats.darkMetal);
    sensor.position.set(0, -0.075, 0.05);
    var sensorEye = mesh(chassis, new T.CylinderGeometry(0.013, 0.013, 0.004, 16), mats.cyanSoft);
    sensorEye.position.set(0, -0.082, 0.05);
    sensorEye.castShadow = false;

    // rear tail lights + heat sink
    for (var tl = -1; tl <= 1; tl += 2) {
      var tail = mesh(chassis, boxGeo(0.02, 0.008, 0.006), tl < 0 ? mats.basicRed : mats.basicGreen);
      tail.position.set(tl * 0.14, 0.01, -0.225);
      tail.castShadow = false;
      var tg = addGlow(chassis, tl < 0 ? 0xff4a5a : 0x65ffb8, 0.1, 0.4, tl * 0.14, 0.01, -0.23, true);
      if (tl < 0) tailL = tg; else tailR = tg;
    }
    var tailDecal = A.decal(A.textTexture([
      { t: 'X9-0421', size: 44, weight: 700, color: 'rgba(200,240,255,.75)', spacing: 3 }
    ], { w: 256, h: 96, align: 'center' }), 0.13, 0.05, { opacity: 0.6 });
    tailDecal.position.set(0, 0.022, -0.228);
    tailDecal.rotation.y = Math.PI;
    chassis.add(tailDecal);

    // top rear heat sink
    for (var f = 0; f < 4; f++) {
      var fin = mesh(chassis, boxGeo(0.1, 0.006, 0.008), mats.darkMetal);
      fin.position.set(0, 0.062 + f * 0.002, -0.1 - f * 0.018);
      fin.rotation.x = -0.12;
    }

    // forward landing / search light
    var headlight = new T.SpotLight(0xe6fbff, 2.4, 7.5, 0.52, 0.7, 1.35);
    headlight.position.set(0, -0.01, 0.22);
    headlight.castShadow = false;
    headlight.target.position.set(0, -0.55, 3.0);
    model.add(headlight);
    model.add(headlight.target);
    // screws
    screw(chassis, 0.12, 0.061, 0.145);
    screw(chassis, -0.12, 0.061, 0.145);
    screw(chassis, 0.12, 0.061, -0.075);
    screw(chassis, -0.12, 0.061, -0.075);

    // hidden internal frame ring (visible when exploded)
    var innerFrame = mesh(chassis, rimGeo(0.185, 0.27, 0.13, 0.2, 0.02, 0.05), mats.darkMetal);
    innerFrame.position.set(0, 0.032, 0.006);

    /* ============================================================= canopy */
    var canopy = new T.Group();
    model.add(canopy);
    var canopyRim = mesh(canopy, rimGeo(0.245, 0.36, 0.195, 0.30, 0.012, 0.085), mats.carbon);
    canopyRim.position.set(0, 0.056, 0.006);

    var domeGeo = new T.SphereGeometry(1, 40, 22, 0, Math.PI * 2, 0, Math.PI / 2);
    domeGeo.scale(0.103, 0.072, 0.158);
    var dome = new T.Mesh(domeGeo, mats.glass);
    dome.position.set(0, 0.056, 0.012);
    dome.castShadow = false;
    dome.receiveShadow = false;
    dome.renderOrder = 3;
    canopy.add(dome);

    // canopy spine
    var spinePts = [];
    for (var sp = 0; sp < 9; sp++) {
      var zz = -0.135 + sp * (0.29 / 8);
      var yy = 0.056 + 0.072 * Math.sqrt(Math.max(0, 1 - Math.pow((zz - 0.012) / 0.158, 2))) + 0.002;
      spinePts.push(new T.Vector3(0, yy, zz));
    }
    var spine = mesh(canopy, tubeFromPoints(spinePts, 0.0045, 24), mats.carbon);
    spine.castShadow = true;

    // lateral canopy hoop + rear hinges
    var hoops = [];
    for (var hop = 0; hop < 9; hop++) {
      var hx = -0.1 + hop * (0.2 / 8);
      var hy = 0.056 + 0.072 * Math.sqrt(Math.max(0, 1 - Math.pow(hx / 0.103, 2))) + 0.002;
      hoops.push(new T.Vector3(hx, hy, 0.012));
    }
    var hoop = mesh(canopy, tubeFromPoints(hoops, 0.0035, 20), mats.carbon);
    hoop.castShadow = true;

    // faint cyan rim light around the canopy base
    var rimPts = [];
    for (var rp = 0; rp < 48; rp++) {
      var ra = rp / 48 * Math.PI * 2;
      rimPts.push(new T.Vector3(Math.cos(ra) * 0.199, 0.0595, Math.sin(ra) * 0.306 + 0.006));
    }
    var rimGlowLine = mesh(canopy, new T.TubeGeometry(new T.CatmullRomCurve3(rimPts, true), 64, 0.0018, 6, true), mats.basicCyanDim);
    rimGlowLine.castShadow = false;
    for (var hg = -1; hg <= 1; hg += 2) {
      var hinge = mesh(canopy, new T.CylinderGeometry(0.008, 0.008, 0.026, 12), mats.alu);
      hinge.rotation.z = Math.PI / 2;
      hinge.position.set(hg * 0.082, 0.058, -0.132);
    }

    // canopy front sensor pod
    var pod = mesh(canopy, boxGeo(0.05, 0.022, 0.045), mats.darkMetal);
    pod.position.set(0, 0.075, 0.135);
    pod.rotation.x = 0.4;
    var podEye = mesh(canopy, new T.CylinderGeometry(0.008, 0.008, 0.004, 12), mats.cyanSoft);
    podEye.rotation.x = Math.PI / 2 + 0.4;
    podEye.position.set(0, 0.083, 0.158);
    podEye.castShadow = false;
    // tiny canopy latch lights
    for (var cl = -1; cl <= 1; cl += 2) {
      var latch = mesh(canopy, boxGeo(0.018, 0.004, 0.006), mats.basicCyan);
      latch.position.set(cl * 0.1, 0.063, -0.14);
      latch.castShadow = false;
    }

    /* ===================================================== flight controller */
    var fc = new T.Group();
    model.add(fc);
    var pcb = mesh(fc, A.plateXZ(0.165, 0.235, 0.008, 0.02, 0.0025), mats.pcb);
    pcb.position.set(0, 0.045, 0.006);
    // main processor
    var cpu = mesh(fc, boxGeo(0.038, 0.008, 0.038), mats.chip);
    cpu.position.set(-0.02, 0.053, 0.03);
    var imu = mesh(fc, boxGeo(0.02, 0.01, 0.02), mats.chip);
    imu.position.set(0.04, 0.054, -0.03);
    var baro = mesh(fc, boxGeo(0.012, 0.006, 0.012), mats.chip);
    baro.position.set(0.03, 0.052, 0.06);
    // connector rows
    for (var cr = 0; cr < 6; cr++) {
      var pin = mesh(fc, boxGeo(0.004, 0.006, 0.014), mats.alu);
      pin.position.set(-0.062 + cr * 0.024, 0.052, -0.09);
      pin.castShadow = false;
    }
    // status LEDs
    var ledColors = [0x5ff2ff, 0x6dffc2, 0xffae52];
    for (var l = 0; l < 3; l++) {
      var led = mesh(fc, boxGeo(0.008, 0.003, 0.005), l === 1 ? mats.basicGreen : (l === 2 ? mats.basicAmber : mats.basicCyan));
      led.position.set(0.055 - l * 0.014, 0.051, 0.085);
      led.castShadow = false;
      addGlow(fc, ledColors[l], 0.1, 0.4, led.position.x, 0.054, led.position.z, true);
    }
    var fcDecal = A.decal(A.textTexture([
      { t: 'FLIGHT CORE X9', size: 44, weight: 700, color: 'rgba(170,245,255,.85)', spacing: 2 },
      { t: 'DUAL-REDUNDANT · 8kHz', size: 20, color: 'rgba(150,220,240,.6)', spacing: 1 }
    ], { w: 512, h: 160, align: 'center' }), 0.15, 0.045, { opacity: 0.75 });
    fcDecal.rotation.x = -Math.PI / 2;
    fcDecal.position.set(0, 0.0495, 0.006);
    fc.add(fcDecal);
    var fcShield = mesh(fc, boxGeo(0.09, 0.014, 0.055), mats.alu);
    fcShield.position.set(0, 0.056, -0.035);

    /* ============================================================ battery */
    var battery = new T.Group();
    model.add(battery);
    var pack = mesh(battery, A.plateXZ(0.20, 0.30, 0.055, 0.032, 0.006), mats.shell);
    pack.position.set(0, -0.079, 0.006);
    var packBase = mesh(battery, A.plateXZ(0.185, 0.285, 0.012, 0.028, 0.004), mats.darkMetal);
    packBase.position.set(0, -0.108, 0.006);
    // amber charge strips
    for (var bs = -1; bs <= 1; bs += 2) {
      for (var b = 0; b < 3; b++) {
        var seg = mesh(battery, boxGeo(0.006, 0.005, 0.055), mats.basicAmber);
        seg.position.set(bs * 0.101, -0.079, -0.06 + b * 0.066);
        seg.castShadow = false;
      }
    }
    var connector = mesh(battery, boxGeo(0.036, 0.016, 0.014), mats.copper);
    connector.position.set(0, -0.079, -0.152);
    for (var ln = -1; ln <= 1; ln += 2) {
      var latchClip = mesh(battery, boxGeo(0.016, 0.03, 0.03), mats.shellWarm);
      latchClip.position.set(ln * 0.103, -0.065, 0.02);
    }
    var battDecal = A.decal(A.textTexture([
      { t: 'SMART BATTERY 6S', size: 40, weight: 700, color: 'rgba(255,214,150,.9)', spacing: 2 },
      { t: '4200mAh · 98% · BMS', size: 20, color: 'rgba(255,190,120,.65)', spacing: 1 }
    ], { w: 512, h: 170, align: 'center' }), 0.19, 0.062, { opacity: 0.85 });
    battDecal.rotation.x = -Math.PI / 2;
    battDecal.position.set(0, -0.111, 0.006);
    battery.add(battDecal);

    /* ============================================================ gimbal */
    var gimbal = new T.Group();
    gimbal.position.set(0, -0.035, 0.195);
    model.add(gimbal);
    var gimbalMount = mesh(gimbal, boxGeo(0.115, 0.014, 0.06), mats.carbon);
    gimbalMount.position.set(0, 0.026, 0);
    for (var gs = -1; gs <= 1; gs += 2) {
      var sideArm = mesh(gimbal, boxGeo(0.012, 0.075, 0.045), mats.shell);
      sideArm.position.set(gs * 0.052, -0.012, 0);
    }
    gimbalYaw = new T.Group();
    gimbalYaw.position.set(0, -0.012, 0.012);
    gimbal.add(gimbalYaw);
    var ball = mesh(gimbalYaw, new T.SphereGeometry(0.043, 26, 20), mats.shell);
    ball.position.set(0, -0.03, 0.02);
    gimbalPitch = new T.Group();
    gimbalPitch.position.set(0, -0.03, 0.02);
    gimbalYaw.add(gimbalPitch);
    var lensRing = mesh(gimbalPitch, new T.TorusGeometry(0.03, 0.006, 10, 32), mats.alu);
    lensRing.position.set(0, 0, 0.038);
    var lensInner = mesh(gimbalPitch, new T.TorusGeometry(0.019, 0.0022, 8, 28), mats.basicCyan);
    lensInner.position.set(0, 0, 0.043);
    lensInner.castShadow = false;
    var lensGlass = new T.Mesh(new T.CircleGeometry(0.0195, 28), new T.MeshPhysicalMaterial({
      color: 0x041018, metalness: 0.35, roughness: 0.08, envMapIntensity: 2.4, clearcoat: 1
    }));
    lensGlass.position.set(0, 0, 0.042);
    lensGlass.castShadow = false;
    gimbalPitch.add(lensGlass);
    var gimbalGlow = addGlow(gimbalPitch, 0x54eaff, 0.07, 0.3, 0, 0, 0.048, false);
    var gimbalLed = mesh(gimbalPitch, boxGeo(0.005, 0.005, 0.005), mats.basicAmber);
    gimbalLed.position.set(0.028, 0.02, 0.033);
    gimbalLed.castShadow = false;

    /* ============================================================= skids */
    var skids = new T.Group();
    model.add(skids);
    for (var sk = -1; sk <= 1; sk += 2) {
      var x = sk * 0.118;
      var railPts = [
        new T.Vector3(x, -0.152, -0.21),
        new T.Vector3(x, -0.172, -0.13),
        new T.Vector3(x, -0.174, 0.0),
        new T.Vector3(x, -0.172, 0.13),
        new T.Vector3(x, -0.152, 0.21)
      ];
      var rail = mesh(skids, tubeFromPoints(railPts, 0.013, 32), mats.carbon);
      rail.castShadow = true;
      for (var fp = 0; fp < 2; fp++) {
        var footZ = fp === 0 ? -0.19 : 0.19;
        var foot = mesh(skids, new T.CylinderGeometry(0.022, 0.026, 0.014, 16), mats.rubber);
        foot.position.set(x, -0.158, footZ);
      }
      // struts
      for (var st = -1; st <= 1; st += 2) {
        var strut = mesh(skids, tubeFromPoints([
          new T.Vector3(x * 0.85, -0.048, st * 0.095),
          new T.Vector3(x, -0.17, st * 0.11)
        ], 0.0075, 12), mats.alu);
      }
    }

    /* ============================================================ antenna */
    var antenna = new T.Group();
    model.add(antenna);
    var antBase = mesh(antenna, new T.CylinderGeometry(0.016, 0.02, 0.024, 14), mats.darkMetal);
    antBase.position.set(0, 0.02, -0.195);
    var antRod = mesh(antenna, new T.CylinderGeometry(0.0035, 0.0045, 0.17, 8), mats.shell);
    antRod.position.set(0, 0.1, -0.235);
    antRod.rotation.x = -0.62;
    var antTip = mesh(antenna, new T.SphereGeometry(0.012, 14, 10), mats.amber);
    antTip.position.set(0, 0.172, -0.284);
    var antGlow = addGlow(antenna, 0xffa040, 0.075, 0.22, 0, 0.172, -0.284, true);
    var antStripe = mesh(antenna, boxGeo(0.006, 0.09, 0.006), mats.cyan);
    antStripe.position.set(0, 0.055, -0.212);
    antStripe.rotation.x = -0.62;
    antStripe.castShadow = false;

    /* ======================================================== arms + motors */
    var armGroups = [];
    var motorGroups = [];
    var armTops = [];
    for (var a = 0; a < 4; a++) {
      var angle = Math.PI / 4 + a * Math.PI / 2;
      var armGroup = new T.Group();
      armGroup.rotation.y = -angle;
      armGroup.position.y = 0.004;
      model.add(armGroup);

      var armGeo = extrudeRaw(armShape(), 0.024, 0.004, 12);
      armGeo.rotateX(-Math.PI / 2);
      armGeo.translate(0, -0.012, 0);
      var armMesh = mesh(armGroup, armGeo, mats.carbon);
      armMesh.castShadow = true;

      // arm light strip
      var strip = mesh(armGroup, boxGeo(0.28, 0.0028, 0.009), mats.cyanSoft);
      strip.position.set(0.33, 0.0125, 0);
      strip.castShadow = false;
      var stripTip = mesh(armGroup, boxGeo(0.03, 0.003, 0.012), mats.basicAmber);
      stripTip.position.set(0.495, 0.0125, 0);
      stripTip.castShadow = false;
      addGlow(armGroup, 0xffa040, 0.07, 0.3, 0.5, 0.014, 0, true);

      // arm root collar
      var collar = mesh(armGroup, new T.CylinderGeometry(0.052, 0.058, 0.026, 20), mats.shell);
      collar.rotation.z = Math.PI / 2;
      collar.position.set(0.115, 0.0, 0);

      // motor mount
      var mount = mesh(armGroup, new T.CylinderGeometry(0.052, 0.058, 0.016, 24), mats.carbon);
      mount.position.set(0.548, 0.006, 0);

      // ---------------- motor ----------------
      var motor = new T.Group();
      motor.position.set(0.548, 0.019, 0);
      armGroup.add(motor);
      var mBase = mesh(motor, new T.CylinderGeometry(0.047, 0.05, 0.012, 24), mats.darkMetal);
      var mBell = mesh(motor, new T.CylinderGeometry(0.052, 0.05, 0.048, 28), mats.motor);
      mBell.position.y = 0.032;
      var mCap = mesh(motor, new T.CylinderGeometry(0.031, 0.034, 0.014, 22), mats.darkMetal);
      mCap.position.y = 0.061;
      var mRing = mesh(motor, new T.TorusGeometry(0.048, 0.0032, 8, 40), mats.cyan);
      mRing.rotation.x = Math.PI / 2;
      mRing.position.y = 0.047;
      mRing.castShadow = false;
      var mShaft = mesh(motor, new T.CylinderGeometry(0.006, 0.006, 0.018, 10), mats.alu);
      mShaft.position.y = 0.072;
      // cooling fins
      for (var cf = 0; cf < 4; cf++) {
        var finAng = cf / 4 * Math.PI * 2;
        var finM = mesh(motor, boxGeo(0.008, 0.028, 0.02), mats.shell);
        finM.position.set(Math.cos(finAng) * 0.048, 0.033, Math.sin(finAng) * 0.048);
        finM.rotation.y = -finAng;
        finM.castShadow = false;
      }
      for (var ms = 0; ms < 3; ms++) {
        var mScrew = mesh(motor, screwGeo, mats.alu);
        var msAng = ms / 3 * Math.PI * 2;
        mScrew.position.set(Math.cos(msAng) * 0.022, 0.069, Math.sin(msAng) * 0.022);
        mScrew.castShadow = false;
      }
      addGlow(motor, 0x3fe6ff, 0.12, 0.2, 0, 0.05, 0, true);

      // ---------------- propeller ----------------
      var prop = new T.Group();
      prop.position.set(0.548, 0.095, 0);
      armGroup.add(prop);
      var hub = mesh(prop, new T.CylinderGeometry(0.02, 0.023, 0.018, 18), mats.alu);
      hub.position.y = 0.006;
      var hubTop = mesh(prop, new T.SphereGeometry(0.018, 14, 10), mats.shell);
      hubTop.position.y = 0.016;
      hubTop.scale.y = 0.55;
      for (var bl = 0; bl < 3; bl++) {
        var bladePivot = new T.Group();
        bladePivot.rotation.y = bl / 3 * Math.PI * 2;
        prop.add(bladePivot);
        var bGeo = extrudeRaw(bladeShape(), 0.006, 0.0015, 14);
        bGeo.rotateX(-Math.PI / 2);
        bGeo.translate(0, -0.003, 0);
        bGeo.rotateX(-0.28);
        var blade = mesh(bladePivot, bGeo, mats.prop, true, false);
        var tip = mesh(bladePivot, boxGeo(0.014, 0.0022, 0.01), mats.basicAmber);
        tip.position.set(0.216, 0.004, 0);
        tip.castShadow = false;
      }
      var discMat = new T.MeshBasicMaterial({
        map: A.textures.propBlur, color: 0x9feaff, transparent: true, opacity: 0,
        blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false, fog: false
      });
      var disc = new T.Mesh(new T.CircleGeometry(0.222, 48), discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.002;
      disc.renderOrder = 4;
      prop.add(disc);
      discMats.push(discMat);

      armGroups.push(armGroup);
      motorGroups.push(motor);
      propGroups.push(prop);
      armTops.push(stripTip);
    }

    /* ======================================================== registration */
    function register(def, groups) {
      var part = {
        id: def.id, idx: def.idx, cn: def.cn, en: def.en, tag: def.tag,
        desc: def.desc, specs: def.specs, order: def.order,
        instances: [], groups: groups
      };
      groups.forEach(function (g) {
        var base = g.position.clone();
        part.instances.push({ group: g, base: base, offset: def.offset.clone(), localBox: null, anchor: null });
      });
      parts.push(part);
      partMap[part.id] = part;
      return part;
    }
    register(PART_DEFS[0], propGroups);
    register(PART_DEFS[1], motorGroups);
    register(PART_DEFS[2], armGroups);
    register(PART_DEFS[3], [canopy]);
    register(PART_DEFS[4], [fc]);
    register(PART_DEFS[5], [battery]);
    register(PART_DEFS[6], [gimbal]);
    register(PART_DEFS[7], [skids]);
    register(PART_DEFS[8], [antenna]);

    parts.forEach(function (part) {
      part.instances.forEach(function (inst) {
        inst.group.traverse(function (o) {
          if (o.isMesh) {
            o.userData.partId = part.id;
            pickables.push(o);
          }
        });
      });
    });

    // local space bounding boxes / label anchors for each instance
    root.updateMatrixWorld(true);
    parts.forEach(function (part) {
      part.instances.forEach(function (inst) {
        var g = inst.group;
        var inv = new T.Matrix4().copy(g.matrixWorld).invert();
        var box = new T.Box3();
        g.traverse(function (o) {
          if (o.isMesh && o.material && !o.material.transparent) {
            o.geometry.computeBoundingBox();
            var b = o.geometry.boundingBox.clone();
            b.applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld));
            box.union(b);
          }
        });
        if (box.isEmpty()) box.setFromCenterAndSize(new T.Vector3(), new T.Vector3(0.1, 0.1, 0.1));
        inst.localBox = box;
        inst.anchor = box.getCenter(new T.Vector3());
      });
    });

    /* ========================================================== selection */
    function clearSelection() {
      selectionObjs.forEach(function (obj) {
        if (obj.parent) obj.parent.remove(obj);
        obj.geometry.dispose();
        obj.material.dispose();
      });
      selectionObjs = [];
    }

    function buildBoxEdges(box) {
      var min = box.min, max = box.max;
      var v = [
        new T.Vector3(min.x, min.y, min.z), new T.Vector3(max.x, min.y, min.z),
        new T.Vector3(max.x, min.y, max.z), new T.Vector3(min.x, min.y, max.z),
        new T.Vector3(min.x, max.y, min.z), new T.Vector3(max.x, max.y, min.z),
        new T.Vector3(max.x, max.y, max.z), new T.Vector3(min.x, max.y, max.z)
      ];
      var edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
      var arr = [];
      var va = new T.Vector3(), vb = new T.Vector3(), dir = new T.Vector3();
      edges.forEach(function (e) {
        va.copy(v[e[0]]); vb.copy(v[e[1]]);
        dir.copy(vb).sub(va);
        var len = dir.length();
        dir.normalize();
        var seg = Math.min(len * 0.26, 0.038);
        var a2 = va.clone().addScaledVector(dir, seg);
        var b2 = vb.clone().addScaledVector(dir, -seg);
        arr.push(va.x, va.y, va.z, a2.x, a2.y, a2.z);
        arr.push(b2.x, b2.y, b2.z, vb.x, vb.y, vb.z);
      });
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(arr, 3));
      return geo;
    }

    var selectedId = null;
    var selectPulse = [];

    function select(id) {
      if (selectedId === id) return partMap[id] || null;
      clearSelection();
      selectedId = id;
      var part = partMap[id];
      if (!part) return null;
      part.instances.forEach(function (inst) {
        var pad = 0.012;
        var box = inst.localBox.clone().expandByScalar(pad);
        var line = new T.LineSegments(buildBoxEdges(box), new T.LineBasicMaterial({
          color: 0x6ff6ff, transparent: true, opacity: 0.85, blending: T.AdditiveBlending,
          depthTest: true, depthWrite: false, toneMapped: false
        }));
        line.renderOrder = 5;
        inst.group.add(line);
        selectionObjs.push(line);
        selectPulse.push(Math.random() * Math.PI * 2);
      });
      return part;
    }

    /* ============================================================ exploded */
    var explode = 0;
    var explodeApplied = -1;

    function setExplode(t) {
      explode = t;
      if (Math.abs(explodeApplied - t) < 0.0004) return;
      explodeApplied = t;
      parts.forEach(function (part) {
        part.instances.forEach(function (inst) {
          var start = part.order;
          var local = A.smoothstep(start * 0.055, start * 0.055 + 0.52, t);
          inst.group.position.copy(inst.base).addScaledVector(inst.offset, local);
        });
      });
    }

    /* ------------------------------------------------------------ helpers2 */
    var tmpMatrix = new T.Matrix4();
    var tmpVec = new T.Vector3();

    var api = {
      root: root,
      model: model,
      chassis: chassis,
      parts: parts,
      partMap: partMap,
      pickables: pickables,
      props: propGroups,
      propDirs: propDirs,
      discs: discMats,
      select: select,
      getSelectedId: function () { return selectedId; },
      clearSelection: clearSelection,
      setExplode: setExplode,
      getExplode: function () { return explode; },
      rotorAngle: 0,

      update: function (dt, time, state) {
        // props
        var rpm = state.rpm || 0;
        var speed = (10 + rpm * 42) * (1 - explode * 0.55);
        api.rotorAngle += speed * dt;
        for (var i = 0; i < propGroups.length; i++) {
          propGroups[i].rotation.y = api.rotorAngle * propDirs[i];
        }
        var discOpacity = A.smoothstep(0.25, 0.9, rpm) * 0.28 * (1 - explode * 0.75);
        for (var d = 0; d < discMats.length; d++) discMats[d].opacity = discOpacity;

        // gimbal look
        if (state.gimbalLook && state.cameraPos) {
          tmpVec.copy(state.cameraPos);
          model.worldToLocal(tmpVec);
          var dx = tmpVec.x, dz = tmpVec.z - 0.2, dy = tmpVec.y - (-0.03);
          var yaw = Math.atan2(dx, Math.max(0.001, Math.abs(dz)) * Math.sign(dz || 1));
          yaw = A.clamp(Math.atan2(dx, dz), -1.15, 1.15);
          var horiz = Math.sqrt(dx * dx + dz * dz) || 1;
          var pitch = A.clamp(-Math.atan2(dy, horiz), -0.6, 0.5);
          gimbalYaw.rotation.y = A.damp(gimbalYaw.rotation.y, yaw, 3.2, dt);
          gimbalPitch.rotation.x = A.damp(gimbalPitch.rotation.x, pitch, 3.2, dt);
        } else {
          gimbalYaw.rotation.y = A.damp(gimbalYaw.rotation.y, 0, 3, dt);
          gimbalPitch.rotation.x = A.damp(gimbalPitch.rotation.x, 0, 3, dt);
        }

        // nav lights
        var blink = Math.sin(time * 3.1) > 0 ? 1 : 0.2;
        if (tailL) tailL.material.opacity = 0.35 + blink * 0.35;
        if (tailR) tailR.material.opacity = 0.35 + (1.2 - blink) * 0.3;
        if (antGlow) antGlow.material.opacity = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(time * 2.2));

        // selection pulse
        for (var k = 0; k < selectionObjs.length; k++) {
          selectionObjs[k].material.opacity = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(time * 4 + k));
        }
      },

      getAnchorWorld: function (part, out) {
        var inst = part.instances[0];
        if (!inst) return out.set(0, 0, 0);
        return inst.group.localToWorld(out.copy(inst.anchor));
      },

      setVisible: function (v) { root.visible = v; }
    };

    return api;
  };
})();
