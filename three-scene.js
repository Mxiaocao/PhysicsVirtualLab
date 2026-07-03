const container = document.getElementById("threeInstrument");
const instrumentCard = container?.closest(".instrument-card");
const telescopeInput = document.getElementById("telescopeAngle");
const stageInput = document.getElementById("stageAngle");
const resetButton = document.getElementById("resetBtn");

let scene;
let camera;
let renderer;
let controls;
let telescopeGroup;
let stageGroup;
let vernierGroup;
let reflectedBeam;
let splitBeam;
let resizeObserver;

if (container && telescopeInput && stageInput && window.THREE && THREE.OrbitControls) {
  initSpectrometer3D();
} else {
  console.warn("Three.js 或 OrbitControls 未加载，已保留 Canvas fallback。");
  instrumentCard?.classList.add("three-failed");
}

function initSpectrometer3D() {
  try {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8edf2);

    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(5.6, 4.2, 6.4);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.75, 0);
    controls.enableDamping = true;
    controls.minDistance = 4.5;
    controls.maxDistance = 12;
    controls.maxPolarAngle = Math.PI * 0.47;

    addLights();
    addRoomBase();
    buildSpectrometerModel();
    bind3DControls();
    resizeRenderer();
    syncFromInputs();
    animate();

    instrumentCard?.classList.add("three-ready");
    window.Spectrometer3D = { syncFromInputs };
  } catch (error) {
    console.warn("Three.js 分光计初始化失败，已保留 Canvas fallback。", error);
    instrumentCard?.classList.add("three-failed");
  }
}

function addLights() {
  const ambient = new THREE.HemisphereLight(0xffffff, 0x9fb0bf, 1.9);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xc8f5ff, 0.7);
  fill.position.set(-5, 3, -4);
  scene.add(fill);
}

function addRoomBase() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8e1e8, roughness: 0.74, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.03;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(10, 20, 0x90a4b8, 0xc0ccd6);
  grid.position.y = 0.005;
  grid.material.opacity = 0.28;
  grid.material.transparent = true;
  scene.add(grid);
}

function buildSpectrometerModel() {
  const metal = new THREE.MeshStandardMaterial({ color: 0xbfc7cf, roughness: 0.34, metalness: 0.58 });
  const brightMetal = new THREE.MeshStandardMaterial({ color: 0xe9edf0, roughness: 0.3, metalness: 0.42 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d2732, roughness: 0.48, metalness: 0.36 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x95e6ff, roughness: 0.08, metalness: 0, transmission: 0.38, transparent: true, opacity: 0.58 });

  // 圆形底座：承载整个分光计的重型金属底盘。
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.55, 0.28, 96), metal);
  base.position.y = 0.14;
  base.castShadow = true;
  base.receiveShadow = true;
  scene.add(base);

  // 刻度盘：外圈用细刻线模拟 0-360 度圆盘。
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(2.08, 2.08, 0.08, 128), brightMetal);
  disk.position.y = 0.36;
  disk.castShadow = true;
  scene.add(disk);
  addScaleTicks();

  // 简化游标：固定在刻度盘外缘，用于提示读数位置。
  vernierGroup = new THREE.Group();
  const vernier = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.72), dark);
  vernier.position.set(0, 0.52, -2.17);
  vernierGroup.add(vernier);
  scene.add(vernierGroup);

  // 支架：中心立柱和横向支撑臂。
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.25, 48), metal);
  pillar.position.y = 0.95;
  pillar.castShadow = true;
  scene.add(pillar);

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 0.18), metal);
  bridge.position.set(0, 1.05, 0);
  bridge.castShadow = true;
  scene.add(bridge);

  stageGroup = new THREE.Group();
  scene.add(stageGroup);

  // 载物台：可随载物台滑条绕竖直轴旋转。
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.02, 0.18, 80), brightMetal);
  stage.position.y = 0.68;
  stage.castShadow = true;
  stage.receiveShadow = true;
  stageGroup.add(stage);

  const stagePlate = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.1, 1.0), brightMetal);
  stagePlate.position.y = 0.84;
  stagePlate.castShadow = true;
  stageGroup.add(stagePlate);

  // 三棱镜：放在载物台上，跟随载物台一起转动。
  const prism = createPrism(glass);
  prism.position.set(0, 1.08, 0);
  prism.castShadow = true;
  stageGroup.add(prism);

  // 平行光管镜筒：固定在左侧，表示入射平行光来源。
  const collimator = createTube("collimator", metal, dark);
  collimator.position.set(-3.0, 1.05, 0);
  collimator.rotation.z = Math.PI / 2;
  scene.add(collimator);

  telescopeGroup = new THREE.Group();
  scene.add(telescopeGroup);

  // 望远镜镜筒：随望远镜角度滑条绕中心旋转。
  const telescope = createTube("telescope", metal, dark);
  telescope.position.set(2.55, 1.05, 0);
  telescope.rotation.z = Math.PI / 2;
  telescopeGroup.add(telescope);

  const eyepiece = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.36, 48), dark);
  eyepiece.position.set(4.0, 1.05, 0);
  eyepiece.rotation.z = Math.PI / 2;
  telescopeGroup.add(eyepiece);

  addKnobs(dark, metal);
  addLightPaths();
}

function addScaleTicks() {
  const majorMaterial = new THREE.MeshBasicMaterial({ color: 0x2b3540 });
  const minorMaterial = new THREE.MeshBasicMaterial({ color: 0x697683 });

  for (let degree = 0; degree < 360; degree += 5) {
    const major = degree % 30 === 0;
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(major ? 0.026 : 0.014, 0.032, major ? 0.24 : 0.14),
      major ? majorMaterial : minorMaterial
    );
    const angle = THREE.MathUtils.degToRad(degree);
    tick.position.set(Math.cos(angle) * 1.96, 0.44, Math.sin(angle) * 1.96);
    tick.rotation.y = -angle;
    scene.add(tick);
  }
}

function createTube(name, metal, dark) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, name === "telescope" ? 2.6 : 2.45, 64), metal);
  body.castShadow = true;
  group.add(body);

  const front = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.28, 64), new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.25, metalness: 0.35 }));
  front.position.y = 1.32;
  front.castShadow = true;
  group.add(front);

  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.04, 48), dark);
  lens.position.y = 1.48;
  group.add(lens);

  return group;
}

function createPrism(material) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.55);
  shape.lineTo(-0.58, -0.42);
  shape.lineTo(0.58, -0.42);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.75, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 1 });
  geometry.center();
  const prism = new THREE.Mesh(geometry, material);
  prism.rotation.x = -Math.PI / 2;
  return prism;
}

function addKnobs(dark, metal) {
  const positions = [
    [-1.9, 0.72, 1.5],
    [1.9, 0.72, 1.5],
    [0, 1.72, -1.36]
  ];

  positions.forEach(([x, y, z]) => {
    // 调节旋钮：用黑色齿轮状圆柱表示微调、制动和升降旋钮。
    const knob = new THREE.Group();
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.18, 32), dark);
    core.rotation.x = Math.PI / 2;
    core.castShadow = true;
    knob.add(core);

    for (let i = 0; i < 12; i += 1) {
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.08), metal);
      const a = i * Math.PI / 6;
      ridge.position.set(Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0);
      ridge.rotation.z = a;
      knob.add(ridge);
    }

    knob.position.set(x, y, z);
    scene.add(knob);
  });
}

function addLightPaths() {
  // 入射光、反射光和分光示意光路，用发光色线帮助理解反射法测量。
  const incoming = makeBeam(new THREE.Vector3(-4.2, 1.15, 0), new THREE.Vector3(-0.35, 1.15, 0), 0xff4058);
  scene.add(incoming);

  reflectedBeam = makeBeam(new THREE.Vector3(0.25, 1.18, 0), new THREE.Vector3(3.7, 1.18, 0), 0x39d98a);
  scene.add(reflectedBeam);

  splitBeam = makeBeam(new THREE.Vector3(0.15, 1.22, 0), new THREE.Vector3(2.3, 1.22, -1.05), 0x3ba7ff);
  scene.add(splitBeam);
}

function makeBeam(start, end, color) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(0.025, 0.025, length, 16);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88 });
  const beam = new THREE.Mesh(geometry, material);

  beam.position.copy(start).add(end).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return beam;
}

function bind3DControls() {
  telescopeInput.addEventListener("input", syncFromInputs);
  stageInput.addEventListener("input", syncFromInputs);

  resetButton?.addEventListener("click", () => {
    window.setTimeout(syncFromInputs, 0);
  });

  resizeObserver = new ResizeObserver(resizeRenderer);
  resizeObserver.observe(container);
  window.addEventListener("resize", resizeRenderer);
}

function syncFromInputs() {
  const telescopeAngle = parseFloat(telescopeInput.value) || 0;
  const stageAngle = parseFloat(stageInput.value) || 0;
  const telescopeRad = THREE.MathUtils.degToRad(telescopeAngle);
  const stageRad = THREE.MathUtils.degToRad(stageAngle);

  if (telescopeGroup) {
    telescopeGroup.rotation.y = -telescopeRad;
  }

  if (stageGroup) {
    stageGroup.rotation.y = -stageRad;
  }

  if (vernierGroup) {
    vernierGroup.rotation.y = -telescopeRad;
  }

  if (reflectedBeam) {
    reflectedBeam.rotation.y = -telescopeRad;
  }

  if (splitBeam) {
    splitBeam.rotation.y = -telescopeRad - 0.28;
  }
}

function resizeRenderer() {
  if (!container || !renderer || !camera) return;

  const width = Math.max(container.clientWidth, 1);
  const height = Math.max(container.clientHeight, 1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  controls?.update();
  renderer.render(scene, camera);
}