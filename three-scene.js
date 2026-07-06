const container = document.getElementById("threeInstrument");
const instrumentCard = container?.closest(".instrument-card");
const telescopeInput = document.getElementById("telescopeAngle");
const stageInput = document.getElementById("stageAngle");
const resetButton = document.getElementById("resetBtn");

const MODEL_URL = "./assets/models/spectrometer_solidworks.glb?v=solidworks-real-1";
const MODEL_TARGET_SIZE = 4.6;

let scene;
let camera;
let renderer;
let controls;
let spectrometerModel;
let resizeObserver;
let animationFrameId;
let lastTelescopeAngle = null;
let lastStageAngle = null;

if (container && telescopeInput && stageInput && window.THREE && THREE.OrbitControls && THREE.GLTFLoader) {
  initSpectrometer3D();
} else {
  console.warn("Three.js, OrbitControls, or GLTFLoader is not loaded. Canvas fallback is preserved.");
  showCanvasFallback();
}

function initSpectrometer3D() {
  try {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8edf2);

    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
    camera.position.set(5.6, 4.2, 6.4);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.75, 0);
    controls.enableDamping = true;
    controls.minDistance = 1.5;
    controls.maxDistance = 20;
    controls.maxPolarAngle = Math.PI * 0.49;

    addLights();
    addRoomBase();
    bind3DControls();
    resizeRenderer();
    animate();
    loadSpectrometerModel();

    window.Spectrometer3D = {
      syncFromInputs,
      updateTelescopeRotation,
      updateStageRotation,
      getModel: () => spectrometerModel
    };
  } catch (error) {
    console.warn("Three.js spectrometer initialization failed. Canvas fallback is preserved.", error);
    showCanvasFallback();
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
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(10, 20, 0x90a4b8, 0xc0ccd6);
  grid.position.y = 0.006;
  grid.material.opacity = 0.28;
  grid.material.transparent = true;
  scene.add(grid);
}

function loadSpectrometerModel() {
  const loader = new THREE.GLTFLoader();

  loader.load(
    MODEL_URL,
    (gltf) => {
      spectrometerModel = gltf.scene || gltf.scenes?.[0];

      if (!spectrometerModel) {
        throw new Error("GLB loaded, but no scene was found in the file.");
      }

      prepareModelMaterials(spectrometerModel);
      centerAndScaleModel(spectrometerModel);
      scene.add(spectrometerModel);
      fitCameraToModel(spectrometerModel);
      const nodeCount = logModelNodes(spectrometerModel);
      syncFromInputs();

      instrumentCard?.classList.remove("three-failed");
      instrumentCard?.classList.add("three-ready");
      console.log("Loaded model URL:", MODEL_URL);
      console.log("SolidWorks spectrometer GLB loaded");
      console.log("Model node count:", nodeCount);
    },
    (event) => {
      if (!event.total) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      console.info(`Loading spectrometer GLB: ${percent}%`);
    },
    (error) => {
      console.error("Failed to load spectrometer GLB. Canvas fallback is preserved.", error);
      showCanvasFallback();
    }
  );
}

function prepareModelMaterials(model) {
  model.traverse((node) => {
    if (!node.isMesh) return;

    node.castShadow = true;
    node.receiveShadow = true;

    if (node.material) {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        material.side = THREE.DoubleSide;
        material.needsUpdate = true;
      });
    }
  });
}

function centerAndScaleModel(model) {
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);

  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    console.warn("Spectrometer GLB has an invalid bounding box; using original transform.");
    return;
  }

  model.position.sub(center);
  model.scale.setScalar(MODEL_TARGET_SIZE / maxDimension);
  model.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(model);
  model.position.y += -scaledBox.min.y + 0.04;
  model.updateMatrixWorld(true);
}

function fitCameraToModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const target = sphere.center.clone();
  const radius = Math.max(sphere.radius, 1);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const distance = (radius / Math.sin(fov / 2)) * 1.25;
  const direction = new THREE.Vector3(1.1, 0.72, 1.1).normalize();

  camera.near = Math.max(distance / 100, 0.01);
  camera.far = distance * 100;
  camera.position.copy(target).add(direction.multiplyScalar(distance));
  camera.lookAt(target);
  camera.updateProjectionMatrix();

  controls.target.copy(target);
  controls.minDistance = Math.max(radius * 0.45, 0.5);
  controls.maxDistance = Math.max(radius * 6, 8);
  controls.update();
}

function logModelNodes(model) {
  const rows = [];

  model.traverse((node) => {
    if (node.name) console.log("[GLB node]", node.name);

    rows.push({
      name: node.name || "(unnamed)",
      type: node.type,
      isMesh: Boolean(node.isMesh),
      material: node.material ? getMaterialName(node.material) : ""
    });
  });

  console.groupCollapsed(`Spectrometer GLB node list (${rows.length} nodes)`);
  rows.forEach((row, index) => {
    console.log(`${index}: ${row.name} | ${row.type}${row.isMesh ? " | mesh" : ""}${row.material ? ` | material: ${row.material}` : ""}`);
  });
  console.table(rows);
  console.groupEnd();

  return rows.length;
}

function getMaterialName(material) {
  if (Array.isArray(material)) {
    return material.map((item) => item?.name || "(unnamed material)").join(", ");
  }

  return material.name || "(unnamed material)";
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

  updateTelescopeRotation(telescopeAngle);
  updateStageRotation(stageAngle);
}

function updateTelescopeRotation(angle) {
  if (angle === lastTelescopeAngle) return;
  lastTelescopeAngle = angle;

  console.debug("updateTelescopeRotation reserved until GLB telescope node is mapped.", {
    angle,
    modelLoaded: Boolean(spectrometerModel)
  });
}

function updateStageRotation(angle) {
  if (angle === lastStageAngle) return;
  lastStageAngle = angle;

  console.debug("updateStageRotation reserved until GLB stage node is mapped.", {
    angle,
    modelLoaded: Boolean(spectrometerModel)
  });
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
  animationFrameId = requestAnimationFrame(animate);
  controls?.update();

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

function showCanvasFallback() {
  instrumentCard?.classList.remove("three-ready");
  instrumentCard?.classList.add("three-failed");

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}
