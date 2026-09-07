/* ============================================================
   SkyPro X1 — drone.js
   Sets up the Three.js scene, builds a stylized pro drone from
   primitives, and runs the hero animation loop.

   Public API:
     createDroneScene(container, { onReady, onError })
       -> { setScrollProgress, handleResize, dispose }
   ============================================================ */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ---------- Shared palette / materials ---------- */
const COLORS = {
  body:   0x262a31,   // dark gray fuselage
  dark:   0x14161a,   // near-black plastic
  metal:  0xb8bec8,   // brushed metal highlights
  accent: 0xff6a3d,   // signature orange
  blade:  0x1a1d22,
  glass:  0x05070a,
};

const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function makeMaterials() {
  return {
    body: new THREE.MeshStandardMaterial({ color: COLORS.body, metalness: 0.55, roughness: 0.42 }),
    dark: new THREE.MeshStandardMaterial({ color: COLORS.dark, metalness: 0.4, roughness: 0.6 }),
    metal: new THREE.MeshStandardMaterial({ color: COLORS.metal, metalness: 1.0, roughness: 0.28 }),
    accent: new THREE.MeshStandardMaterial({
      color: COLORS.accent, metalness: 0.35, roughness: 0.4,
      emissive: COLORS.accent, emissiveIntensity: 0.08,
    }),
    blade: new THREE.MeshStandardMaterial({ color: COLORS.blade, metalness: 0.35, roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: COLORS.glass, metalness: 1.0, roughness: 0.08 }),
    propDisc: new THREE.MeshBasicMaterial({
      color: 0xbfc6d1, transparent: true, opacity: 0.07,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  };
}

/* ---------- Drone construction (primitives only) ---------- */

// One propeller blade: a tapered shape, extruded thin and given prop pitch.
function makeBlade(material) {
  const s = new THREE.Shape();
  s.moveTo(0, 0.06);
  s.quadraticCurveTo(0.085, 0.4, 0.05, 0.88);
  s.quadraticCurveTo(0.03, 1.0, 0, 1.02);
  s.quadraticCurveTo(-0.035, 1.0, -0.06, 0.85);
  s.quadraticCurveTo(-0.085, 0.38, 0, 0.06);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.016, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.007, bevelSegments: 2,
  });
  geo.rotateX(-Math.PI / 2);          // lay the blade flat (length along Z)
  geo.scale(0.92, 0.92, 0.92);
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.z = 0.16;             // slight pitch for realism
  mesh.castShadow = true;
  return mesh;
}

// Motor + propeller assembly. Returns a group whose .rotation.y is the spin.
function makePropeller(m, spinDirection) {
  const prop = new THREE.Group();

  // hub
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.07, 20), m.metal);
  hub.castShadow = true;
  prop.add(hub);

  // two blades, opposite each other
  for (const angle of [0, Math.PI]) {
    const blade = makeBlade(m.blade);
    blade.rotation.y = angle;
    prop.add(blade);
  }

  // faint translucent disc suggesting motion blur
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.0, 40), m.propDisc);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -0.02;
  prop.add(disc);

  prop.userData.spin = spinDirection;
  return prop;
}

function buildDrone() {
  const m = makeMaterials();
  const drone = new THREE.Group();
  const propellers = [];

  const castShadow = (mesh) => { mesh.castShadow = true; return mesh; };

  /* Fuselage — a flattened capsule lying nose-forward along +Z. */
  const fuselage = castShadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.0, 8, 28), m.body));
  fuselage.rotation.x = Math.PI / 2;
  fuselage.scale.set(1, 1, 0.72); // (x, length-axis is Y pre-rotation -> flatten via z after rotation)
  drone.add(fuselage);

  /* Top hatch + accent stripe. */
  const hatch = castShadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.55, 6, 20), m.dark));
  hatch.rotation.x = Math.PI / 2;
  hatch.scale.set(1, 1, 0.6);
  hatch.position.y = 0.28;
  drone.add(hatch);

  // accent "vents" on both flanks of the fuselage
  [-1, 1].forEach((side) => {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.5), m.accent);
    vent.position.set(side * 0.485, 0.06, 0.1);
    drone.add(vent);
  });

  /* Rear fin/antenna. */
  const fin = castShadow(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.22, 0.3), m.dark));
  fin.position.set(0, 0.36, -0.78);
  fin.rotation.x = -0.35;
  drone.add(fin);

  /* Four arms at 45° intervals, motors slightly raised. */
  const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
  const armLen = 1.1;
  const motorDist = 1.6;
  const motorY = 0.34;

  armAngles.forEach((angle, i) => {
    const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));

    // arm: cylinder from body edge up to motor pod
    const start = dir.clone().multiplyScalar(0.5).setY(0.08);
    const end = dir.clone().multiplyScalar(motorDist).setY(motorY);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const len = start.distanceTo(end);

    const arm = castShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, len, 14), m.body));
    arm.position.copy(mid);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
    drone.add(arm);

    // accent collar where the arm meets the motor pod
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 10, 28), m.accent);
    ring.position.copy(end).y += 0.02;
    ring.rotation.x = Math.PI / 2;
    drone.add(ring);

    // motor pod
    const pod = castShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.22, 22), m.dark));
    pod.position.set(end.x, motorY, end.z);
    drone.add(pod);

    const podCap = castShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.08, 18), m.metal));
    podCap.position.set(end.x, motorY + 0.15, end.z);
    drone.add(podCap);

    // propeller guard (torus around the disc)
    const guard = castShadow(new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.026, 10, 48), m.dark));
    guard.position.set(end.x, motorY + 0.18, end.z);
    guard.rotation.x = Math.PI / 2;
    drone.add(guard);

    // nav lights: red (left) / green (right) on the front pair
    if (i < 2) {
      const lightMat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        emissive: i === 0 ? 0xff3b30 : 0x30d158,
        emissiveIntensity: 1.4,
      });
      const nav = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), lightMat);
      nav.position.set(end.x, motorY - 0.14, end.z);
      drone.add(nav);
    }

    // propeller (spins in alternating directions)
    const prop = makePropeller(m, i % 2 === 0 ? 1 : -1);
    prop.position.set(end.x, motorY + 0.24, end.z);
    drone.add(prop);
    propellers.push(prop);
  });

  /* Camera gimbal under the nose. */
  const mount = castShadow(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.24), m.dark));
  mount.position.set(0, -0.42, 0.55);
  drone.add(mount);

  const gimbalGroup = new THREE.Group();
  gimbalGroup.position.set(0, -0.58, 0.6);

  const housing = castShadow(new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 18), m.body));
  housing.scale.set(1, 1, 0.85);
  gimbalGroup.add(housing);

  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.1, 24), m.glass);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.16;
  gimbalGroup.add(lens);

  const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.014, 10, 28), m.accent);
  lensRing.position.z = 0.215;
  gimbalGroup.add(lensRing);

  drone.add(gimbalGroup);

  /* Landing gear: two angled legs + skids per side. */
  [-1, 1].forEach((side) => {
    const legGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.95, 12);
    [-0.28, 0.28].forEach((zOff) => {
      const leg = castShadow(new THREE.Mesh(legGeo, m.dark));
      leg.position.set(side * 0.42, -0.72, zOff);
      leg.rotation.z = side * 0.38; // splay outward
      drone.add(leg);
    });
    const skid = castShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.05, 12), m.metal));
    skid.rotation.x = Math.PI / 2;
    skid.position.set(side * 0.58, -1.12, 0);
    drone.add(skid);
  });

  /* Rear strobe light (blinks in the animation loop). */
  const strobeMat = new THREE.MeshStandardMaterial({
    color: 0x111111, emissive: 0xffffff, emissiveIntensity: 0.6,
  });
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), strobeMat);
  strobe.position.set(0, 0.12, -0.95);
  drone.add(strobe);

  return { drone, propellers, strobeMat, gimbalGroup };
}

/* ---------- Scene factory ---------- */
export function createDroneScene(container, { onReady, onError } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (err) {
    onError?.(err);
    return null;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const BASE_CAM_DIR = new THREE.Vector3(3.0, 1.7, 5.4).normalize();
  const BASE_CAM_DIST = 7.9;
  const LOOK_AT = new THREE.Vector3(0.35, -0.1, 0);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  container.appendChild(renderer.domElement);

  // Studio-like environment for metallic reflections (no external assets).
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  /* Lights: ambient fill + key (shadows) + cool rim + warm accent point. */
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  scene.add(new THREE.HemisphereLight(0x8fa3bf, 0x0b0d10, 0.5));

  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(4, 6.5, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -4.5;
  key.shadow.camera.right = key.shadow.camera.top = 4.5;
  key.shadow.camera.far = 20;
  key.shadow.bias = -0.0004;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x6ea8ff, 1.0);
  rim.position.set(-5, 3, -4);
  scene.add(rim);

  const glow = new THREE.PointLight(0xff8a5c, 9, 12, 2);
  glow.position.set(2.4, -0.6, 2.6);
  scene.add(glow);

  /* Ground: shadow catcher + two faint "landing pad" rings. */
  const groundY = -1.35;
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(7, 48),
    new THREE.ShadowMaterial({ opacity: 0.32 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = groundY;
  ground.receiveShadow = true;
  scene.add(ground);

  const ring1 = new THREE.Mesh(
    new THREE.RingGeometry(2.25, 2.29, 72),
    new THREE.MeshBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
  );
  ring1.rotation.x = -Math.PI / 2;
  ring1.position.y = groundY + 0.01;
  scene.add(ring1);

  const ring2 = new THREE.Mesh(
    new THREE.RingGeometry(3.6, 3.62, 72),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, side: THREE.DoubleSide })
  );
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.y = groundY + 0.01;
  scene.add(ring2);

  /* Drone rig: `rig` handles tilt/position, `drone` handles the Y spin. */
  const { drone, propellers, strobeMat, gimbalGroup } = buildDrone();
  const rig = new THREE.Group();
  rig.add(drone);
  scene.add(rig);

  /* ---------- State ---------- */
  const clock = new THREE.Clock();
  let elapsed = 0;
  let rafId = null;
  let running = false;
  let readySent = false;

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 }; // parallax (smoothed / target)
  let scrollProgress = 0;

  /* ---------- Layout / resize ---------- */
  function layout(width) {
    // Desktop: text left, drone right. Tablet/mobile: centered, scaled down.
    if (width >= 1024) { rig.position.x = 1.55; rig.scale.setScalar(1); }
    else if (width >= 640) { rig.position.x = 1.0; rig.scale.setScalar(0.9); }
    else { rig.position.x = 0; rig.scale.setScalar(0.68); }
    ground.position.x = ring1.position.x = ring2.position.x = rig.position.x;
  }

  function handleResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 640 ? 52 : w < 1024 ? 46 : 40;
    camera.updateProjectionMatrix();
    const dist = camera.aspect < 0.9 ? BASE_CAM_DIST * 1.35 : BASE_CAM_DIST;
    camera.position.copy(BASE_CAM_DIR).multiplyScalar(dist);
    layout(w);
  }
  handleResize();

  const resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(container);

  /* ---------- Interaction ---------- */
  const onPointerMove = (e) => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  if (!reducedMotion) window.addEventListener('pointermove', onPointerMove, { passive: true });

  // Render only while the hero is on screen.
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    entry.isIntersecting ? start() : stop();
  }, { threshold: 0.02 });
  visibilityObserver.observe(container);

  function start() {
    if (running) return;
    running = true;
    clock.getDelta(); // discard stale delta
    rafId = requestAnimationFrame(tick);
  }
  function stop() {
    running = false;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  /* ---------- Animation loop ---------- */
  const BASE_SPIN = reducedMotion ? 0.04 : 0.28;     // rad/s idle yaw
  const PROP_SPIN = reducedMotion ? 6 : 30;          // rad/s prop speed
  const HOVER_BASE = 0.15;

  function tick() {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;

    // Continuous yaw + extra rotation as the page scrolls away.
    drone.rotation.y += (BASE_SPIN + scrollProgress * 1.4) * dt;

    // Propellers (alternating directions).
    for (const prop of propellers) prop.rotation.y += PROP_SPIN * prop.userData.spin * dt;

    // Gentle hover bob + rise as the user scrolls.
    rig.position.y = HOVER_BASE + Math.sin(elapsed * 1.3) * 0.06 + scrollProgress * 1.7;

    // Subtle gimbal sway so the camera feels powered.
    gimbalGroup.rotation.y = Math.sin(elapsed * 0.6) * 0.06;

    // Rear strobe blink.
    strobeMat.emissiveIntensity = Math.sin(elapsed * 5) > 0.92 ? 2.4 : 0.5;

    // Mouse parallax: tilt the rig and drift the camera (smoothed).
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 4);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 4);
    rig.rotation.x = THREE.MathUtils.lerp(rig.rotation.x, pointer.y * 0.07, dt * 3);
    rig.rotation.z = THREE.MathUtils.lerp(rig.rotation.z, -pointer.x * 0.05, dt * 3);
    const camTarget = BASE_CAM_DIR.clone()
      .multiplyScalar(camera.aspect < 0.9 ? BASE_CAM_DIST * 1.35 : BASE_CAM_DIST)
      .add(new THREE.Vector3(pointer.x * 0.45, -pointer.y * 0.28, 0));
    camera.position.lerp(camTarget, Math.min(1, dt * 3));
    camera.lookAt(LOOK_AT);

    renderer.render(scene, camera);

    if (!readySent) {
      readySent = true;
      onReady?.();
    }
  }

  start();

  /* ---------- Public API ---------- */
  return {
    /** p in [0, 1] — how far the user has scrolled through the hero. */
    setScrollProgress(p) { scrollProgress = THREE.MathUtils.clamp(p, 0, 1); },
    handleResize,
    dispose() {
      stop();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((mat) => mat.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
