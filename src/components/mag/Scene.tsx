import { Canvas, useFrame, useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import { Line, OrbitControls, Stars } from "@react-three/drei";
import { createContext, Suspense, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitImpl } from "three-stdlib";
import { shueRadius, sunGeometry } from "@/lib/space/model";
import type { FieldGrid, LatLon, PoleMotion } from "@/lib/space/igrf";
import { FIELD_DETAIL, type FieldDetail } from "@/lib/space/visuals";

export interface CoreField { grid: FieldGrid; north: PoleMotion; south: PoleMotion; geomag: LatLon; year: number }

export type LayerKey = "saa" | "poles" | "mp" | "bs" | "fl" | "tail" | "wind" | "aurora" | "axes" | "geo" | "labels" | "efield" | "goes";
export type Preset = "global" | "earth" | "tail" | "saa" | "arctic" | "conus";

export interface SceneProps {
  layers: Record<LayerKey, boolean>;
  r0: number;
  alpha: number;
  speed: number | null;
  time: number;
  aurora: [number, number, number][] | null;
  preset: Preset;
  presetNonce: number;
  cinematic: boolean;
  reducedMotion: boolean;
  lowPower: boolean;
  /** Drawn paths only; not the resolution or quality of a magnetic model. */
  fieldDetail: FieldDetail;
  baseline: boolean;
  core: CoreField | null;
  /** Earth-only picking: geographic latitude/longitude in degrees. */
  onGlobePick?: (lat: number, lon: number) => void;
  selected?: { lat: number; lon: number } | null;
  /** NOAA/USGS geoelectric map points: lon, lat, colour position 0–1 (log |E|). */
  efield?: [number, number, number][] | null;
  /** GOES magnetometer satellites at their NOAA-listed slots (degrees west). */
  goes?: { sat: number; lonWest: number; state: string; hp: number | null }[] | null;
}

const D2R = Math.PI / 180;
const CYAN = new THREE.Color("#5ff2e0");
const ORANGE = new THREE.Color("#ff9a4a");
const BLUE = new THREE.Color("#4aa8ff");

/** Earth-fixed geographic direction (matches three.js SphereGeometry UV layout). */
function geoDir(latDeg: number, lonDeg: number, r = 1) {
  const la = latDeg * D2R, lo = lonDeg * D2R;
  return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo));
}

function earthFrame(time: number, geomag: LatLon = { lat: 80.8, lon: -72.6 }) {
  const { declDeg, subsolarLonDeg } = sunGeometry(time);
  const rotY = -subsolarLonDeg * D2R;
  const rotZ = -declDeg * D2R;
  // Geomagnetic north pole (IGRF ~2025: 80.8N, 72.6W), transformed to scene frame
  const axis = geoDir(geomag.lat, geomag.lon).applyEuler(new THREE.Euler(0, rotY, 0)).applyEuler(new THREE.Euler(0, 0, rotZ));
  const tilt = Math.atan2(-axis.x, axis.y); // dipole tilt in the Sun-north plane
  return { rotY, rotZ, tilt, declDeg };
}

function toScene(lat: number, lon: number, r: number, time: number) {
  const f = earthFrame(time);
  return geoDir(lat, lon, r).applyEuler(new THREE.Euler(0, f.rotY, 0)).applyEuler(new THREE.Euler(0, 0, f.rotZ));
}

function FieldMap({ grid }: { grid: FieldGrid }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = grid.w; c.height = grid.h;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(grid.w, grid.h);
    for (let i = 0; i < grid.w * grid.h; i++) {
      const F = grid.F[i]!;
      const k = Math.min(Math.max((32000 - F) / 9000, 0), 1); // 0 at 32k nT, 1 at ~23k nT
      const edge = Math.min(Math.max((34000 - F) / 2000, 0), 1); // soft rim 34k->32k
      const r = 255, g = Math.round(150 - 80 * k), b = Math.round(90 + 90 * k);
      const a = Math.round(edge * (40 + 120 * k));
      img.data.set([r, g, b, a], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter;
    return t;
  }, [grid]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh>
      <sphereGeometry args={[1.006, 96, 64]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

function SaaLabel({ grid }: { grid: FieldGrid }) {
  const pos = useMemo(() => geoDir(grid.min.lat, grid.min.lon, 1.08), [grid]);
  return <Label surface position={pos} tone="orange">South Atlantic Anomaly · {Math.round(grid.min.F).toLocaleString("en-US")} nT</Label>;
}

function PoleTrack({ m, color, label, showLabel }: { m: PoleMotion; color: string; label: string; showLabel: boolean }) {
  const pts = useMemo(() => m.path.map(({ p }) => geoDir(p.lat, p.lon, 1.014)), [m]);
  const head = geoDir(m.now.lat, m.now.lon, 1.02);
  const start = m.path[0]!;
  return (
    <group>
      <Line points={pts} color={color} lineWidth={2} transparent opacity={0.9} />
      {m.path.map(({ year, p }) => (
        <mesh key={year} position={geoDir(p.lat, p.lon, 1.014)}>
          <sphereGeometry args={[year % 25 === 0 ? 0.011 : 0.006, 8, 6]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
      <mesh position={head}>
        <sphereGeometry args={[0.022, 16, 12]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {showLabel && (
        <>
          <Label surface position={head.clone().multiplyScalar(1.06)} tone="cyan">{label} · {m.speedKmYr.toFixed(1)} km/yr</Label>
          <Label surface position={geoDir(start.p.lat, start.p.lon, 1.03)} tone="muted">{start.year}</Label>
        </>
      )}
    </group>
  );
}

const globeVert = /* glsl */ `
varying vec2 vUv; varying vec3 vN;
void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const globeFrag = /* glsl */ `
uniform sampler2D dayMap; uniform sampler2D nightMap; uniform vec3 sunDir;
varying vec2 vUv; varying vec3 vN;
void main(){
  float d = dot(normalize(vN), sunDir);
  float m = smoothstep(-0.12, 0.18, d);
  vec3 day = texture2D(dayMap, vUv).rgb * (0.22 + 1.6 * max(d, 0.0));
  vec3 night = texture2D(nightMap, vUv).rgb * vec3(1.0, 0.82, 0.55) * 1.3 + vec3(0.004,0.008,0.02);
  vec3 col = mix(night, day, m);
  col += vec3(1.0,0.45,0.2) * 0.05 * (1.0 - abs(d) * 6.0) * step(abs(d), 0.17);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

function Globe() {
  const [day, night] = useLoader(THREE.TextureLoader, [import.meta.env.BASE_URL + "textures/earth_atmos_2048.jpg", import.meta.env.BASE_URL + "textures/earth_lights_2048.png"]) as [THREE.Texture, THREE.Texture];
  day.colorSpace = THREE.SRGBColorSpace;
  night.colorSpace = THREE.SRGBColorSpace;
  day.anisotropy = 4;
  useEffect(() => {
    // R3F Canvas creation is NOT evidence the NASA globe textures have loaded.
    // Wait for two painted frames before dismissing the on-screen loading state.
    const wrap = document.getElementById("scene-wrap");
    if (!wrap) return;
    let first = 0, second = 0;
    first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        wrap.setAttribute("data-globe-ready", "true");
      });
    });
    return () => {
      cancelAnimationFrame(first); cancelAnimationFrame(second);
      wrap.removeAttribute("data-globe-ready");
    };
  }, [day, night]);
  const uniforms = useMemo(() => ({ dayMap: { value: day }, nightMap: { value: night }, sunDir: { value: new THREE.Vector3(1, 0, 0) } }), [day, night]);
  return (
    <mesh>
      <sphereGeometry args={[1, 96, 64]} />
      <shaderMaterial vertexShader={globeVert} fragmentShader={globeFrag} uniforms={uniforms} />
    </mesh>
  );
}

function Atmosphere() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
        vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
        fragmentShader: `varying vec3 vN; varying vec3 vW; void main(){ vec3 v = normalize(cameraPosition - vW); float f = pow(1.0 - abs(dot(v, vN)), 3.0); float lit = 0.35 + 0.65*smoothstep(-0.3,0.5,dot(normalize(vW), vec3(1.0,0.0,0.0))); gl_FragColor = vec4(vec3(0.3,0.62,1.0)*f*lit*1.4, f); }`,
      }),
    [],
  );
  return (
    <mesh material={mat}>
      <sphereGeometry args={[1.06, 64, 48]} />
    </mesh>
  );
}

function rimMaterial(color: THREE.Color, strength: number) {
  return new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { color: { value: color }, strength: { value: strength } },
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 color; uniform float strength; varying vec3 vN; varying vec3 vW; void main(){ vec3 v = normalize(cameraPosition - vW); float f = pow(1.0 - abs(dot(v, normalize(vN))), 2.2); float fade = smoothstep(-48.0, -20.0, vW.x) * smoothstep(4.0, 9.0, length(cameraPosition)); gl_FragColor = vec4(color*(0.012+0.55*f*f)*strength*fade, 1.0); }`,
  });
}

function ShueSurface({ r0, alpha, color, strength }: { r0: number; alpha: number; color: THREE.Color; strength: number }) {
  const geom = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 120; i++) {
      const th = (i / 120) * (Math.PI * 0.92);
      const r = shueRadius(r0, alpha, th);
      const x = r * Math.cos(th);
      if (x < -48) break;
      pts.push(new THREE.Vector2(r * Math.sin(th), x));
    }
    return new THREE.LatheGeometry(pts, 96);
  }, [r0, alpha]);
  const mat = useMemo(() => rimMaterial(color, strength), [color, strength]);
  useEffect(() => () => geom.dispose(), [geom]);
  return <mesh geometry={geom} material={mat} rotation={[0, 0, -Math.PI / 2]} />;
}

function FieldLines({ r0, detail }: { r0: number; detail: FieldDetail }) {
  const settings = FIELD_DETAIL[detail];
  const lines = useMemo(() => {
    const out: { pts: THREE.Vector3[]; open: boolean }[] = [];
    const kDay = r0 / 10.5;
    for (let p = 0; p < settings.azimuthSamples; p++) {
      const phi = (p / settings.azimuthSamples) * Math.PI * 2;
      for (const L of settings.shells) {
        const pts: THREE.Vector3[] = [];
        const lmax = Math.acos(Math.sqrt(1 / L));
        let ok = true;
        for (let i = 0; i <= 60; i++) {
          const lam = -lmax + (2 * lmax * i) / 60;
          const r = L * Math.cos(lam) ** 2;
          let x = r * Math.cos(lam) * Math.cos(phi);
          const y = r * Math.sin(lam);
          let z = r * Math.cos(lam) * Math.sin(phi);
          if (x > 0) x *= kDay; else x *= 1 + 0.06 * L;
          z *= x > 0 ? 1 : 1.05;
          if (x > r0 * 0.93) ok = false;
          pts.push(new THREE.Vector3(x, y, z));
        }
        if (ok) out.push({ pts, open: false });
      }
    }
    // Open lobe lines (schematic): polar cap -> stretched tail
    for (const s of [1, -1]) {
      for (const lat of settings.openLatitudes) {
        for (const zz of settings.openOffsets) {
          const start = new THREE.Vector3(-Math.cos(lat * D2R) * 0.9, s * Math.sin(lat * D2R), zz * 0.04);
          const c = new THREE.CatmullRomCurve3([
            start,
            new THREE.Vector3(-2, s * 3.2 * (lat / 75), zz * 0.3),
            new THREE.Vector3(-12, s * (3 + (lat - 68) * 0.35), zz * 0.9),
            new THREE.Vector3(-46, s * (1.2 + (lat - 68) * 0.45), zz * 1.2),
          ]);
          out.push({ pts: c.getPoints(48), open: true });
        }
      }
    }
    return out;
  }, [r0, settings]);
  return (
    <group>
      {lines.map((l, i) => (
        <Line key={i} points={l.pts} color={l.open ? "#3fb8c9" : "#7ffbe6"} lineWidth={l.open ? settings.openWidth : settings.closedWidth} transparent opacity={l.open ? settings.openOpacity : settings.closedOpacity} />
      ))}
    </group>
  );
}

function PlasmaSheet() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `varying vec2 vUv; void main(){ float a = smoothstep(0.0,0.15,vUv.x)*smoothstep(1.0,0.4,vUv.x)*(1.0-pow(abs(vUv.y-0.5)*2.0,2.0)); gl_FragColor=vec4(vec3(1.0,0.55,0.75)*a*0.22,1.0);}`,
      }),
    [],
  );
  return (
    <mesh material={mat} position={[-27, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[38, 18]} />
    </mesh>
  );
}

function SolarWind({ speed, bs0, bsAlpha, count, frozen }: { speed: number; bs0: number; bsAlpha: number; count: number; frozen: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      a[i * 3] = -45 + ((i * 97.13) % 90);
      const ang = i * 2.39996, rad = 24 * Math.sqrt(((i * 0.618) % 1));
      a[i * 3 + 1] = Math.sin(ang) * rad;
      a[i * 3 + 2] = Math.cos(ang) * rad;
    }
    return a;
  }, [count]);
  useFrame((_, dRaw) => {
    if (frozen || !ref.current) return;
    const dt = Math.min(dRaw, 0.05);
    const vx = (speed / 400) * 9 * dt;
    const attr = ref.current.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      let x = arr[i * 3]! - vx; let y = arr[i * 3 + 1]!; let z = arr[i * 3 + 2]!;
      if (x < -46) { x = 46; }
      const rho = Math.hypot(y, z) || 1e-3;
      const r = Math.hypot(x, rho);
      const rb = shueRadius(bs0, bsAlpha, Math.acos(x / r));
      if (r < rb) {
        const target = Math.sqrt(Math.max(rb * rb - x * x, 0)) + 0.05;
        const k = Math.max(target / rho, 1);
        y *= k; z *= k;
      }
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
    }
    attr.needsUpdate = true;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={ORANGE} size={0.18} sizeAttenuation transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function AuroraDots({ points }: { points: [number, number, number][] }) {
  const geom = useMemo(() => {
    const pos = new Float32Array(points.length * 3);
    const col = new Float32Array(points.length * 3);
    const g = new THREE.Color("#4dff9a"), r = new THREE.Color("#ff4d7a"), c = new THREE.Color();
    points.forEach(([lon, lat, p], i) => {
      geoDir(lat, lon, 1.015).toArray(pos, i * 3);
      c.copy(g).lerp(r, Math.min(Math.max((p - 20) / 60, 0), 1)).multiplyScalar(0.12 + 0.5 * Math.min(p / 60, 1));
      c.toArray(col, i * 3);
    });
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    bg.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return bg;
  }, [points]);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <points geometry={geom}>
      <pointsMaterial vertexColors size={0.02} sizeAttenuation transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/** Geoelectric field: three-stop ramp (deep blue → amber → red) on a log scale; renderer only. */
function EfieldDots({ points }: { points: [number, number, number][] }) {
  const geom = useMemo(() => {
    const pos = new Float32Array(points.length * 3), col = new Float32Array(points.length * 3);
    const a = new THREE.Color("#1d3b8f"), b = new THREE.Color("#ffb347"), c = new THREE.Color("#ff2d55"), k = new THREE.Color();
    points.forEach(([lon, lat, t], i) => {
      geoDir(lat, lon, 1.006).toArray(pos, i * 3);
      if (t < 0.6) k.copy(a).lerp(b, t / 0.6); else k.copy(b).lerp(c, (t - 0.6) / 0.4);
      k.toArray(col, i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [points]);
  useEffect(() => () => geom.dispose(), [geom]);
  return <points geometry={geom}><pointsMaterial vertexColors size={0.016} sizeAttenuation transparent opacity={0.95} depthWrite={false} /></points>;
}

const GOES_TONE: Record<string, string> = { inside: "#5ff2e0", "near-boundary": "#ffb347", "possible-crossing": "#ff2d55", nightside: "#7f8aa3", "no-data": "#555b66" };
function GoesSats({ sats, labels }: { sats: NonNullable<SceneProps["goes"]>; labels: boolean }) {
  return <>{sats.map(s => {
    const p = geoDir(0, -s.lonWest, 6.62);
    return <group key={s.sat}>
      <mesh position={p}><octahedronGeometry args={[0.09, 0]} /><meshBasicMaterial color={GOES_TONE[s.state] ?? "#888"} /></mesh>
      {labels && <Label position={geoDir(0.9, -s.lonWest, 6.62)} tone={s.state === "possible-crossing" ? "orange" : "cyan"}>GOES-{s.sat} · {s.hp === null ? "no data" : `Hp ${Math.round(s.hp)} nT`} · {s.state.replace("-", " ")}</Label>}
    </group>;
  })}</>;
}

type Tone = "cyan" | "orange" | "blue" | "muted";
interface LabelEntry { obj: THREE.Object3D; surface: boolean; el: HTMLDivElement | null }
interface LabelItem { id: string; tone: Tone; content: React.ReactNode }
interface LabelStore { entries: Map<string, LabelEntry>; set: (id: string, item: LabelItem | null) => void }
const LabelCtx = createContext<LabelStore | null>(null);

function textOf(n: React.ReactNode): string {
  if (n === null || n === undefined || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (typeof n === "object" && "props" in n) return textOf((n.props as { children?: React.ReactNode }).children);
  return "";
}

/** Scene-anchored HUD label, drawn by a DOM overlay (avoids per-label React roots). */
function Label({ position, children, tone = "cyan", surface = false }: { position: [number, number, number] | THREE.Vector3; children: React.ReactNode; tone?: Tone; surface?: boolean }) {
  const store = useContext(LabelCtx);
  const g = useRef<THREE.Group>(null);
  const id = useId();
  const sig = textOf(children) + tone;
  useLayoutEffect(() => {
    if (!store || !g.current) return;
    const prev = store.entries.get(id);
    store.entries.set(id, { obj: g.current, surface, el: prev?.el ?? null });
    store.set(id, { id, tone, content: children });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, id, sig, surface]);
  useEffect(() => () => { store?.entries.delete(id); store?.set(id, null); }, [store, id]);
  const pos = Array.isArray(position) ? position : (position.toArray() as [number, number, number]);
  return <group ref={g} position={pos} />;
}

function LabelProjector() {
  const store = useContext(LabelCtx);
  const w = useMemo(() => new THREE.Vector3(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    if (!store) return;
    for (const e of store.entries.values()) {
      if (!e.el) continue;
      e.obj.getWorldPosition(w);
      let visible = true;
      if (e.surface) { v.copy(camera.position).sub(w).normalize(); visible = w.clone().normalize().dot(v) > 0.08; }
      const p = w.clone().project(camera);
      if (p.z > 1 || p.z < -1) visible = false;
      e.el.style.opacity = visible ? "1" : "0";
      e.el.style.transform = `translate(-50%, -50%) translate(${((p.x + 1) / 2) * size.width}px, ${((1 - p.y) / 2) * size.height}px)`;
    }
  });
  return null;
}

function LabelOverlay({ items, store }: { items: LabelItem[]; store: LabelStore }) {
  return (
    <div className="label-layer" aria-hidden>
      {items.map((it) => (
        <div key={it.id} className={`hud-label hud-${it.tone}`} ref={(el) => { const e = store.entries.get(it.id); if (e) e.el = el; }}>{it.content}</div>
      ))}
    </div>
  );
}

const PRESETS: Record<Preset, { pos: [number, number, number]; target: [number, number, number] }> = {
  global: { pos: [26, 22, 48], target: [-4, 0, 0] },
  earth: { pos: [3.2, 1.6, 4.2], target: [0, 0, 0] },
  tail: { pos: [-78, 38, 74], target: [-14, 0, 0] },
  saa: { pos: [0, 0, 0], target: [0, 0, 0] },
  arctic: { pos: [0, 0, 0], target: [0, 0, 0] },
  conus: { pos: [0, 0, 0], target: [0, 0, 0] },
};

function CameraRig({ preset, nonce, cinematic, time, core }: { preset: Preset; nonce: number; cinematic: boolean; time: number; core: CoreField | null }) {
  const ref = useRef<OrbitImpl>(null);
  const { camera } = useThree();
  useEffect(() => {
    if (preset === "conus") {
      // Close over the contiguous US for the geoelectric layer.
      camera.position.copy(toScene(32, -97, 3.3, time));
      ref.current?.target.set(0, 0, 0);
    } else if (preset === "saa" || preset === "arctic") {
      const t = preset === "saa" ? core?.grid.min ?? { lat: -26, lon: -60 } : core?.north.now ?? { lat: 86, lon: 136 };
      const d = toScene(preset === "saa" ? t.lat : Math.min(t.lat, 80), t.lon, preset === "saa" ? 3.1 : 2.9, time);
      camera.position.copy(d);
      ref.current?.target.set(0, 0, 0);
    } else {
      const p = PRESETS[preset];
      camera.position.set(...p.pos);
      ref.current?.target.set(...p.target);
    }
    ref.current?.update();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, nonce, camera]);
  return <OrbitControls ref={ref} makeDefault enableDamping dampingFactor={0.08} minDistance={1.6} maxDistance={140} autoRotate={cinematic} autoRotateSpeed={0.25} />;
}

function World(p: SceneProps) {
  const frame = useMemo(() => earthFrame(p.time, p.core?.geomag), [p.time, p.core]);
  const bs0 = p.r0 * 1.32;
  const bsAlpha = Math.min(p.alpha + 0.2, 0.95);
  const L = p.layers;
  return (
    <>
      <ambientLight intensity={0.15} />
      <Stars radius={300} depth={80} count={p.lowPower ? 2000 : 5000} factor={4} saturation={0} fade speed={p.reducedMotion ? 0 : 0.3} />
      <mesh position={[160, 0, 0]}>
        <sphereGeometry args={[4, 32, 16]} />
        <meshBasicMaterial color="#ffd28a" />
      </mesh>
      <group rotation={[0, 0, frame.rotZ]}>
        <group rotation={[0, frame.rotY, 0]} onClick={(e: ThreeEvent<MouseEvent>) => {
          if (!p.onGlobePick || e.delta > 6) return; // orbit drags must not select locations
          const local = e.eventObject.worldToLocal(e.point.clone());
          if (local.length() > 1.22) return; // ignore satellite or orbit references
          e.stopPropagation();
          const unit = local.normalize();
          const lat = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(unit.y, -1, 1)));
          const lon = THREE.MathUtils.radToDeg(Math.atan2(-unit.z, unit.x));
          p.onGlobePick(lat, lon);
        }}>
          <Suspense fallback={null}><Globe /></Suspense>
          {p.selected && (
            <group>
              <mesh position={geoDir(p.selected.lat, p.selected.lon, 1.045)}>
                <sphereGeometry args={[0.027, 16, 12]} />
                <meshBasicMaterial color="#ffe58c" />
              </mesh>
              {L.labels && (
                <Label surface position={geoDir(p.selected.lat, p.selected.lon, 1.12)} tone="orange">
                  Selected · {Math.abs(p.selected.lat).toFixed(2)}°{p.selected.lat >= 0 ? "N" : "S"}, {Math.abs(p.selected.lon).toFixed(2)}°{p.selected.lon >= 0 ? "E" : "W"}
                </Label>
              )}
            </group>
          )}
          {L.aurora && p.aurora && <AuroraDots points={p.aurora} />}
          {L.efield && p.efield && <EfieldDots points={p.efield} />}
          {L.goes && p.goes && <GoesSats sats={p.goes} labels={L.labels} />}
          {L.saa && p.core && <FieldMap grid={p.core.grid} />}
          {L.saa && p.core && L.labels && <SaaLabel grid={p.core.grid} />}
          {L.poles && p.core && (
            <>
              <PoleTrack m={p.core.north} color="#7ffbe6" label="N dip pole" showLabel={L.labels} />
              <PoleTrack m={p.core.south} color="#ffb36b" label="S dip pole" showLabel={L.labels} />
              <mesh position={geoDir(p.core.geomag.lat, p.core.geomag.lon, 1.015)}>
                <torusGeometry args={[0.03, 0.006, 6, 24]} />
                <meshBasicMaterial color="#4aa8ff" />
              </mesh>
            </>
          )}
        </group>
        {L.geo && (
          <group rotation={[Math.PI / 2, 0, 0]}>
            <mesh><torusGeometry args={[6.62, 0.015, 6, 180]} /><meshBasicMaterial color={BLUE} transparent opacity={0.55} /></mesh>
          </group>
        )}
      </group>
      <Atmosphere />
      <group rotation={[0, 0, frame.tilt]}>
        {L.fl && <FieldLines r0={p.r0} detail={p.fieldDetail} />}
        {L.tail && <PlasmaSheet />}
      </group>
      {L.mp && <ShueSurface r0={p.r0} alpha={p.alpha} color={BLUE} strength={p.baseline ? 0.5 : 0.85} />}
      {L.bs && <ShueSurface r0={bs0} alpha={bsAlpha} color={ORANGE} strength={0.55} />}
      {L.wind && p.speed !== null && <SolarWind speed={p.speed} bs0={bs0} bsAlpha={bsAlpha} count={p.lowPower ? 500 : 1600} frozen={p.reducedMotion} />}
      {L.axes && (
        <group>
          <Line points={[[0, 0, 0], [24, 0, 0]]} color="#ff9a4a" lineWidth={1} transparent opacity={0.6} />
          <Line points={[[0, 0, 0], [0, 10, 0]]} color="#7ffbe6" lineWidth={1} transparent opacity={0.6} />
          <Line points={[[0, 0, 0], [0, 0, 10]]} color="#4aa8ff" lineWidth={1} transparent opacity={0.6} />
          {L.labels && <><Label position={[25, 0, 0]} tone="orange">+X · Sun</Label><Label position={[0, 10.6, 0]}>+Z · north</Label><Label position={[0, 0, 10.8]} tone="blue">dusk</Label></>}
        </group>
      )}
      {L.labels && (
        <>
          {L.mp && <Label position={[p.r0, 1.2, 0]} tone="blue">Magnetopause · Shue model · {p.r0.toFixed(1)} R<sub>E</sub></Label>}
          {L.bs && <Label position={[bs0 + 1, -2.2, 0]} tone="orange">Bow shock · schematic</Label>}
          {L.tail && <Label position={[-30, 2.6, 0]} tone="muted">Magnetotail / plasma sheet · schematic</Label>}
          {L.geo && <Label position={[0, -0.9, 7.4]} tone="blue">GEO 6.6 R<sub>E</sub></Label>}
          {L.wind && p.speed !== null && <Label position={[38, 8, 0]} tone="orange">Solar wind · {Math.round(p.speed)} km/s</Label>}
        </>
      )}
    </>
  );
}

export default function Scene(props: SceneProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<LabelItem[]>([]);
  const store = useMemo<LabelStore>(() => {
    const pending = new Map<string, LabelItem | null>();
    let raf = 0;
    return {
      entries: new Map(),
      set: (id, item) => {
        pending.set(id, item);
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const batch = new Map(pending); pending.clear();
          setItems((cur) => {
            const m = new Map(cur.map((x) => [x.id, x] as const));
            for (const [k, it] of batch) { if (it) m.set(k, it); else m.delete(k); }
            return [...m.values()];
          });
        });
      },
    };
  }, []);
  return (
    <div ref={wrapRef} className="absolute inset-0" id="scene-wrap">
      <Canvas
        dpr={props.lowPower ? [1, 1.25] : [1, 2]}
        camera={{ fov: 42, near: 0.05, far: 2000, position: (props.preset === "earth" ? PRESETS.earth : PRESETS.global).pos }}
        gl={{ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor("#030814");
          requestAnimationFrame(() => wrapRef.current?.setAttribute("data-scene-ready", "true"));
        }}
      >
        <LabelCtx.Provider value={store}>
        <LabelProjector />
        <CameraRig preset={props.preset} nonce={props.presetNonce} cinematic={props.cinematic && !props.reducedMotion} time={props.time} core={props.core} />
        <World {...props} />
        </LabelCtx.Provider>
      </Canvas>
      <div className="globe-loading" role="status" aria-live="polite">
        <span className="globe-loading-orbit" aria-hidden="true" />
        <strong>PREPARING EARTH</strong>
        <small>Loading geographic textures and initializing the globe…</small>
        <small className="globe-loading-hint">If this persists, check WebGL support and network access.</small>
      </div>
      {props.layers.labels && <LabelOverlay items={items} store={store} />}
    </div>
  );
}