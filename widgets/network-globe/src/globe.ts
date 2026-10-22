// Copyright 2026 Labyricorn. SPDX-License-Identifier: Apache-2.0

import * as THREE from "three";
import { greatCircleArc, LatLon, latLonToVec, shortestAngleDelta, yawToFace } from "./geo";
import { GlobeView, MaxArcsDrawn, Palette, PinView } from "./view";

const MaxPinsDrawn = 300;
const ArcSegments = 36;
const SpinRadiansPerMs = 0.00009;
const PacketCycleMs = 3200;
const FocusEase = 0.09;

function toVector(v: { x: number; y: number; z: number }): THREE.Vector3 {
    return new THREE.Vector3(v.x, v.y, v.z);
}

type Arc = { ip: string; points: THREE.Vector3[]; phase: number };

export function createWebglGlobe(container: HTMLElement, initial: Palette): GlobeView {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    if (!renderer.getContext()) {
        throw new Error("WebGL is not available");
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;cursor:grab;touch-action:none";
    renderer.domElement.setAttribute("aria-label", "Rotating globe showing where your connections go");
    container.appendChild(renderer.domElement);

    let palette = initial;
    let motion = true;
    let satellitesVisible = true;
    let you: LatLon | null = null;
    let selectedIp: string | null = null;
    let pins: PinView[] = [];
    let arcs: Arc[] = [];
    let elapsed = 0;
    let dragging = false;
    let targetYaw: number | null = null;
    let targetTilt = 0;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 0, 4.3);
    const tilt = new THREE.Group();
    const spin = new THREE.Group();
    tilt.add(spin);
    scene.add(tilt);

    const oceanMat = new THREE.MeshBasicMaterial({ color: palette.ocean, transparent: true, opacity: 0.92 });
    spin.add(new THREE.Mesh(new THREE.SphereGeometry(0.992, 48, 32), oceanMat));

    const glowMat = new THREE.MeshBasicMaterial({
        color: palette.glow,
        transparent: true,
        opacity: 0.08,
        side: THREE.BackSide,
    });
    tilt.add(new THREE.Mesh(new THREE.SphereGeometry(1.07, 48, 32), glowMat));

    const gridPositions: number[] = [];
    const addLine = (a: LatLon, b: LatLon) => {
        const va = latLonToVec(a.lat, a.lon, 1.002);
        const vb = latLonToVec(b.lat, b.lon, 1.002);
        gridPositions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
    };
    for (let lat = -60; lat <= 60; lat += 30) {
        for (let lon = -180; lon < 180; lon += 6) addLine({ lat, lon }, { lat, lon: lon + 6 });
    }
    for (let lon = -180; lon < 180; lon += 30) {
        for (let lat = -84; lat < 84; lat += 6) addLine({ lat, lon }, { lat: lat + 6, lon });
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridPositions, 3));
    const gridMat = new THREE.LineBasicMaterial({ color: palette.grid, transparent: true, opacity: 0.22 });
    spin.add(new THREE.LineSegments(gridGeo, gridMat));

    const landMat = new THREE.PointsMaterial({ color: palette.land, size: 0.012, sizeAttenuation: true });
    let landPoints: THREE.Points | null = null;

    const pinGeo = new THREE.SphereGeometry(0.014, 10, 8);
    const pinMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pinMesh = new THREE.InstancedMesh(pinGeo, pinMat, MaxPinsDrawn);
    pinMesh.count = 0;
    spin.add(pinMesh);

    const arcMat = new THREE.LineBasicMaterial({ color: palette.arc, transparent: true, opacity: 0.35 });
    const arcLines = new THREE.LineSegments(new THREE.BufferGeometry(), arcMat);
    spin.add(arcLines);
    const selectedMat = new THREE.LineBasicMaterial({ color: palette.arcSelected });
    const selectedLine = new THREE.Line(new THREE.BufferGeometry(), selectedMat);
    selectedLine.visible = false;
    spin.add(selectedLine);

    const packetGeo = new THREE.BufferGeometry();
    packetGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MaxArcsDrawn * 3), 3));
    const packetMat = new THREE.PointsMaterial({ color: palette.arcSelected, size: 0.022, sizeAttenuation: true });
    const packets = new THREE.Points(packetGeo, packetMat);
    packets.frustumCulled = false;
    packetGeo.setDrawRange(0, 0);
    spin.add(packets);

    const youMat = new THREE.MeshBasicMaterial({ color: palette.you });
    const youMesh = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 12), youMat);
    youMesh.visible = false;
    spin.add(youMesh);
    const pulseMat = new THREE.MeshBasicMaterial({
        color: palette.you,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
    });
    const pulse = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.037, 36), pulseMat);
    pulse.visible = false;
    spin.add(pulse);

    const orbits = new THREE.Group();
    scene.add(orbits);
    const ringMat = new THREE.LineBasicMaterial({ color: palette.ring, transparent: true, opacity: 0.45 });
    const satMat = new THREE.MeshBasicMaterial({ color: palette.satellite });
    const rings: { radius: number; tiltX: number; tiltZ: number; group: THREE.Group }[] = [];
    const satellites: { ring: number; phase: number; speed: number; mesh: THREE.Mesh }[] = [];
    [
        { radius: 1.3, tiltX: 0.55, tiltZ: 0.2, sats: [0.2, 3.4] },
        { radius: 1.5, tiltX: -0.95, tiltZ: -0.35, sats: [1.7, 4.9, 5.8] },
    ].forEach((def, index) => {
        const group = new THREE.Group();
        group.rotation.x = def.tiltX;
        group.rotation.z = def.tiltZ;
        const loopPoints: THREE.Vector3[] = [];
        for (let i = 0; i < 96; i++) {
            const a = (i / 96) * Math.PI * 2;
            loopPoints.push(new THREE.Vector3(Math.cos(a) * def.radius, 0, Math.sin(a) * def.radius));
        }
        group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(loopPoints), ringMat));
        orbits.add(group);
        rings.push({ radius: def.radius, tiltX: def.tiltX, tiltZ: def.tiltZ, group });
        def.sats.forEach((phase, i) => {
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), satMat);
            group.add(mesh);
            satellites.push({ ring: index, phase, speed: 0.00018 + i * 0.00005, mesh });
        });
    });

    const dummy = new THREE.Object3D();
    const tmpColor = new THREE.Color();

    function rebuildArcs() {
        arcs = [];
        if (you == null) {
            arcLines.geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
            packetGeo.setDrawRange(0, 0);
            return;
        }
        const segments: number[] = [];
        pins.slice(0, MaxArcsDrawn).forEach((pin, index) => {
            const pts = greatCircleArc(you!, pin, ArcSegments, 0.35).map(toVector);
            arcs.push({ ip: pin.ip, points: pts, phase: (index * 0.173) % 1 });
            for (let i = 0; i < pts.length - 1; i++) {
                segments.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
            }
        });
        arcLines.geometry.dispose();
        arcLines.geometry = new THREE.BufferGeometry();
        arcLines.geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
        packetGeo.setDrawRange(0, arcs.length);
    }

    function applySelection() {
        const arc = selectedIp ? arcs.find((a) => a.ip === selectedIp) : null;
        selectedLine.visible = arc != null;
        if (arc) {
            selectedLine.geometry.dispose();
            selectedLine.geometry = new THREE.BufferGeometry().setFromPoints(arc.points);
        }
        pins.forEach((pin, i) => {
            tmpColor.set(pin.ip === selectedIp ? palette.pinSelected : palette.pin);
            pinMesh.setColorAt(i, tmpColor);
        });
        if (pinMesh.instanceColor) pinMesh.instanceColor.needsUpdate = true;
        const target = selectedIp ? pins.find((p) => p.ip === selectedIp) : null;
        if (target) {
            targetYaw = yawToFace(target.lon);
            targetTilt = (target.lat * Math.PI) / 180;
        }
    }

    function updatePacketPositions() {
        const attr = packetGeo.getAttribute("position") as THREE.BufferAttribute;
        arcs.forEach((arc, i) => {
            const t = ((elapsed / PacketCycleMs + arc.phase) % 1) * (arc.points.length - 1);
            const lo = Math.floor(t);
            const hi = Math.min(arc.points.length - 1, lo + 1);
            const f = t - lo;
            const a = arc.points[lo];
            const b = arc.points[hi];
            attr.setXYZ(i, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
        });
        attr.needsUpdate = true;
    }

    const onPointerDown = (e: PointerEvent) => {
        dragging = true;
        targetYaw = null;
        renderer.domElement.setPointerCapture(e.pointerId);
        renderer.domElement.style.cursor = "grabbing";
    };
    const onPointerMove = (e: PointerEvent) => {
        if (!dragging) return;
        spin.rotation.y += e.movementX * 0.006;
        tilt.rotation.x = Math.max(-1.2, Math.min(1.2, tilt.rotation.x + e.movementY * 0.004));
    };
    const onPointerUp = (e: PointerEvent) => {
        dragging = false;
        renderer.domElement.style.cursor = "grab";
        if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);

    const view: GlobeView = {
        kind: "webgl",
        setLand(points) {
            landPoints?.geometry.dispose();
            if (landPoints) spin.remove(landPoints);
            const positions = new Float32Array((points.length / 2) * 3);
            for (let i = 0; i < points.length / 2; i++) {
                const v = latLonToVec(points[i * 2], points[i * 2 + 1], 1.001);
                positions.set([v.x, v.y, v.z], i * 3);
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
            landPoints = new THREE.Points(geo, landMat);
            spin.add(landPoints);
        },
        setYou(place) {
            you = place;
            youMesh.visible = pulse.visible = place != null;
            if (place) {
                const v = latLonToVec(place.lat, place.lon, 1.004);
                youMesh.position.set(v.x, v.y, v.z);
                pulse.position.copy(youMesh.position);
                pulse.lookAt(youMesh.position.clone().multiplyScalar(2));
                if (targetYaw == null && selectedIp == null) {
                    spin.rotation.y = yawToFace(place.lon);
                    tilt.rotation.x = (place.lat * Math.PI) / 180;
                }
            }
            rebuildArcs();
            applySelection();
        },
        setPins(next) {
            pins = next.slice(0, MaxPinsDrawn);
            pinMesh.count = pins.length;
            pins.forEach((pin, i) => {
                const v = latLonToVec(pin.lat, pin.lon, 1.006);
                dummy.position.set(v.x, v.y, v.z);
                const scale = 1 + Math.min(2, Math.log2(pin.count));
                dummy.scale.setScalar(scale);
                dummy.updateMatrix();
                pinMesh.setMatrixAt(i, dummy.matrix);
            });
            pinMesh.instanceMatrix.needsUpdate = true;
            rebuildArcs();
            applySelection();
        },
        setSelected(ip) {
            selectedIp = ip;
            applySelection();
        },
        setSatellites(visible) {
            satellitesVisible = visible;
            orbits.visible = visible;
        },
        setMotion(on) {
            motion = on;
        },
        setPalette(next) {
            palette = next;
            oceanMat.color.set(next.ocean);
            glowMat.color.set(next.glow);
            gridMat.color.set(next.grid);
            landMat.color.set(next.land);
            arcMat.color.set(next.arc);
            selectedMat.color.set(next.arcSelected);
            packetMat.color.set(next.arcSelected);
            youMat.color.set(next.you);
            pulseMat.color.set(next.you);
            ringMat.color.set(next.ring);
            satMat.color.set(next.satellite);
            applySelection();
        },
        resize() {
            const w = Math.max(1, container.clientWidth);
            const h = Math.max(1, container.clientHeight);
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.fov = w / h < 0.9 ? 40 : 32;
            camera.updateProjectionMatrix();
        },
        render(deltaMs) {
            elapsed += deltaMs;
            if (targetYaw != null && !dragging) {
                spin.rotation.y += shortestAngleDelta(spin.rotation.y, targetYaw) * FocusEase;
                tilt.rotation.x += (targetTilt - tilt.rotation.x) * FocusEase;
                if (Math.abs(shortestAngleDelta(spin.rotation.y, targetYaw)) < 0.002) targetYaw = null;
            } else if (motion && !dragging && selectedIp == null) {
                spin.rotation.y += deltaMs * SpinRadiansPerMs;
            }
            if (motion) {
                rings.forEach((r, i) => {
                    r.group.rotation.y += deltaMs * 0.00004 * (i % 2 === 0 ? 1 : -1);
                });
                satellites.forEach((s) => {
                    const a = s.phase + elapsed * s.speed;
                    s.mesh.position.set(Math.cos(a) * rings[s.ring].radius, 0, Math.sin(a) * rings[s.ring].radius);
                });
                const p = (elapsed % 2200) / 2200;
                pulse.scale.setScalar(1 + p * 1.8);
                pulseMat.opacity = 0.6 * (1 - p);
                updatePacketPositions();
            }
            packets.visible = motion && arcs.length > 0;
            renderer.render(scene, camera);
        },
        stats() {
            return { pins: pins.length, arcs: arcs.length };
        },
        dispose() {
            renderer.domElement.removeEventListener("pointerdown", onPointerDown);
            renderer.domElement.removeEventListener("pointermove", onPointerMove);
            renderer.domElement.removeEventListener("pointerup", onPointerUp);
            renderer.domElement.removeEventListener("pointercancel", onPointerUp);
            scene.traverse((obj) => {
                const mesh = obj as THREE.Mesh;
                mesh.geometry?.dispose?.();
            });
            renderer.dispose();
            renderer.domElement.remove();
        },
    };
    view.setSatellites(satellitesVisible);
    view.resize();
    return view;
}
