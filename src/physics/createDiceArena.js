import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import CANNON from "cannon";
import { computeFaceNormals, faceLabelSize, getDiceSpec, getDiceSize, triangleLabelLayout } from "./diceGeometry.js";
import { buildRollResult, readDie, RollSettler } from "./diceResults.js";
import { drawFaceLabel, getDieInkColor } from "./diceLabels.js";
import { TOWER, getTowerParts, createTowerBody, configureTowerContacts, launchTowerDie } from "./towerPhysics.js";
import { DISH, createDishBodies, configureDishContacts, launchDishDie } from "./dishPhysics.js";
import { PHYSICS, configureWorld, SimulationClock } from "./physicsSettings.js";
import { MOBILE_LAYOUT_QUERY } from "../ui/device.js";

export function createDiceArena(canvas, { onRollFinish = () => {} } = {}) {
		let diceOpacity = 0.8;
		let arenaMode = "dish";
		const mobileLayout = window.matchMedia(MOBILE_LAYOUT_QUERY);
		const scene = new THREE.Scene();

		const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 160);
		camera.position.set(0, 9, 16);

		const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setSize(window.innerWidth, window.innerHeight);

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.maxPolarAngle = Math.PI * 0.49;
		controls.minDistance = 8;
		controls.maxDistance = 75;
		controls.target.set(0, 0, 0);

		const ambient = new THREE.AmbientLight(0xffffff, 0.8);
		scene.add(ambient);

		const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
		keyLight.position.set(10, 16, 8);
		scene.add(keyLight);

		const fillLight = new THREE.DirectionalLight(0xbfe8ff, 0.5);
		fillLight.position.set(-11, 7, -8);
		scene.add(fillLight);

		const dishGroup = new THREE.Group();
		scene.add(dishGroup);
		const world = new CANNON.World();
		configureWorld(world);
		world.defaultContactMaterial.friction = 0.12;
		world.defaultContactMaterial.restitution = 0.18;
		const dieMat = new CANNON.Material("die");
		const towerMaterials = configureTowerContacts(world, dieMat);
		const dishMaterials = configureDishContacts(world, dieMat);

		const towerGroup = new THREE.Group();
		towerGroup.visible = false;
		scene.add(towerGroup);

		const towerBodies = [];
		const dishBodies = createDishBodies(dishMaterials);
		const woodTextureCanvas = document.createElement("canvas");
		woodTextureCanvas.width = woodTextureCanvas.height = 512;
		const woodContext = woodTextureCanvas.getContext("2d");
		woodContext.fillStyle = "#c9b59f";
		woodContext.fillRect(0, 0, 512, 512);
		for (let i = 0; i < 230; i++) {
			const x = i * 2.3;
			woodContext.strokeStyle = `rgba(80, 47, 28, ${0.06 + (Math.sin(i * 2.7) + 1) * 0.035})`;
			woodContext.lineWidth = 0.6 + (Math.sin(i * 1.8) + 1) * 0.7;
			woodContext.beginPath();
			woodContext.moveTo(x, 0);
			woodContext.bezierCurveTo(x + Math.sin(i * 0.13) * 16, 170, x + Math.sin(i * 0.13 + 1) * 20, 340, x, 512);
			woodContext.stroke();
		}
		const woodTexture = new THREE.CanvasTexture(woodTextureCanvas);
		const dishWoodTexture = woodTexture.clone();
		dishWoodTexture.needsUpdate = true;
		dishWoodTexture.wrapS = dishWoodTexture.wrapT = THREE.RepeatWrapping;
		dishWoodTexture.center.set(0.5, 0.5);
		dishWoodTexture.rotation = Math.PI / 2;
		dishWoodTexture.repeat.set(4, 1);
		const dishWoodMat = new THREE.MeshStandardMaterial({ color: 0xc3a079, map: dishWoodTexture, roughness: 0.76, metalness: 0 });
		const feltCanvas = document.createElement("canvas");
		feltCanvas.width = feltCanvas.height = 256;
		const feltContext = feltCanvas.getContext("2d");
		const feltImage = feltContext.createImageData(256, 256);
		let noise = 23;
		for (let i = 0; i < feltImage.data.length; i += 4) {
			noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
			const level = 185 + (noise >>> 27);
			feltImage.data[i] = feltImage.data[i + 1] = feltImage.data[i + 2] = level;
			feltImage.data[i + 3] = 255;
		}
		feltContext.putImageData(feltImage, 0, 0);
		const feltTexture = new THREE.CanvasTexture(feltCanvas);
		const woodMat = new THREE.MeshStandardMaterial({
			color: 0x9a7259,
			map: woodTexture,
			roughness: 0.68,
			metalness: 0.02,
		});
		const feltMat = new THREE.MeshStandardMaterial({
			color: 0x141618,
			map: feltTexture,
			bumpMap: feltTexture,
			bumpScale: 0.012,
			roughness: 0.92,
			metalness: 0,
		});
		const darkWoodMat = new THREE.MeshStandardMaterial({
			color: 0x906049,
			map: woodTexture,
			roughness: 0.72,
			metalness: 0.02,
		});

		const glassMat = new THREE.MeshStandardMaterial({
			color: 0xb9d8d6, transparent: true, opacity: 0.1,
			depthWrite: false, roughness: 0.15, metalness: 0.05,
		});

		function addStaticBox(group, {
			size,
			position,
			rotation = [0, 0, 0],
			material,
		}) {
			const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
			mesh.position.set(position[0], position[1], position[2]);
			mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
			mesh.receiveShadow = true;
			mesh.castShadow = true;
			group.add(mesh);

			return mesh;
		}

		function setBodiesActive(bodies, active) {
			for (const body of bodies) {
				if (active && world.bodies.indexOf(body) === -1) {
					world.addBody(body);
				} else if (!active && world.bodies.indexOf(body) !== -1) {
					world.removeBody(body);
				}
			}
		}

		function buildTower() {
			for (const part of getTowerParts()) {
				const material = part.finish === "glass" ? glassMat : part.finish === "felt" ? feltMat : part.id.includes("tray") ? woodMat : darkWoodMat;
				const mesh = addStaticBox(towerGroup, { ...part, material });
				if (part.physics !== false) towerBodies.push(createTowerBody(part, towerMaterials[part.finish]));
				if (part.finish === "glass") {
					mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x719b9a, transparent: true, opacity: 0.48 })));
				}
			}
		}

		function buildDish() {
			const bottom = new THREE.Mesh(new THREE.CylinderGeometry(DISH.radius, DISH.radius, DISH.baseThickness, DISH.segments), feltMat);
			bottom.position.y = -DISH.baseThickness / 2;
			dishGroup.add(bottom);
			const { radius, wallThickness, depth, baseThickness } = DISH;
			const profile = [[radius, -baseThickness], [radius + wallThickness, -baseThickness], [radius + wallThickness, depth], [radius, depth], [radius, -baseThickness]];
			const ring = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), DISH.segments), dishWoodMat);
			dishGroup.add(ring);
		}

		buildDish();
		setBodiesActive(dishBodies, true);
		buildTower();

		function setArenaMode(mode) {
			const nextMode = mode === "tower" ? "tower" : "dish";
			if (nextMode === arenaMode) return;
			clearDice();
			arenaMode = nextMode;
			const towerActive = arenaMode === "tower";
			dishGroup.visible = !towerActive;
			towerGroup.visible = towerActive;
			setBodiesActive(dishBodies, !towerActive);
			setBodiesActive(towerBodies, towerActive);

			if (towerActive) {
				frameTower();
			} else {
				frameDish();
			}
			camera.updateProjectionMatrix();
		}

		const diceState = [];
		const spawnQueue = [];
		let rolling = false;
		const settler = new RollSettler();
		let nextSpawnAt = 0;
		const clock = new SimulationClock();

		function frameScene(points, target, direction, minimumDistance) {
			const width = window.innerWidth;
			const height = window.innerHeight;
			const panel = document.querySelector(".controls-dock")?.getBoundingClientRect();
			const mobile = mobileLayout.matches;
			const left = !mobile && panel ? panel.right + 24 : 0;
			const availableWidth = Math.max(160, width - left);
			const availableHeight = mobile && panel ? Math.max(100, panel.top - 8) : height;
			// Flush OrbitControls' damping before establishing a new default view.
			const damping = controls.enableDamping;
			controls.enableDamping = false;
			controls.update();
			controls.enableDamping = damping;
			controls.target.copy(target);
			camera.clearViewOffset();
			const padding = mobile ? 16 : 32;
			const projectedBounds = (distance) => {
				camera.position.copy(controls.target).addScaledVector(direction, distance);
				camera.lookAt(target);
				camera.far = Math.max(160, distance * 3);
				camera.updateProjectionMatrix();
				camera.updateMatrixWorld();
				const projected = points.map((point) => point.clone().project(camera));
				return {
					left: Math.min(...projected.map((p) => (p.x + 1) * width / 2)),
					right: Math.max(...projected.map((p) => (p.x + 1) * width / 2)),
					top: Math.min(...projected.map((p) => (1 - p.y) * height / 2)),
					bottom: Math.max(...projected.map((p) => (1 - p.y) * height / 2)),
				};
			};
			const fits = (bounds) => bounds.right - bounds.left <= availableWidth - padding && bounds.bottom - bounds.top <= availableHeight - padding;
			let near = Math.max(minimumDistance, ...points.map((point) => point.clone().sub(target).dot(direction) + camera.near + 0.5));
			let far = near;
			while (!fits(projectedBounds(far))) far *= 1.5;
			// Binary search can zoom back in after the initial perspective overshoot.
			for (let attempt = 0; attempt < 20; attempt++) {
				const mid = (near + far) / 2;
				if (fits(projectedBounds(mid))) far = mid;
				else near = mid;
			}
			const bounds = projectedBounds(far);
			controls.maxDistance = Math.max(75, far * 1.3);
			controls.update();
			camera.setViewOffset(width, height, (bounds.left + bounds.right - left - width) / 2, (bounds.top + bounds.bottom - availableHeight) / 2, width, height);
		}

		function frameTower() {
			if (mobileLayout.matches) {
				// On phones, prioritize the tray; the tower top may extend offscreen.
				const points = [];
				for (const x of [-5.3, 5.3]) for (const y of [0, 3.2]) for (const z of [0.8, 12.3]) points.push(new THREE.Vector3(x, y, z));
				frameScene(points, new THREE.Vector3(0, 1.3, 6), new THREE.Vector3(1, 4.5, 0.35).normalize(), 12);
				return;
			}
			const points = getTowerParts().flatMap((part) => {
				const rotation = new THREE.Euler(...(part.rotation || [0, 0, 0]));
				const corners = [];
				for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
					corners.push(new THREE.Vector3(x * part.size[0] / 2, y * part.size[1] / 2, z * part.size[2] / 2).applyEuler(rotation).add(new THREE.Vector3(...part.position)));
				}
				return corners;
			});
			points.push(new THREE.Vector3(-3, 23.1, -8), new THREE.Vector3(3, 23.1, -8));
			frameScene(points, new THREE.Vector3(0, 8, 0), new THREE.Vector3(0.38, 0.65, 1).normalize(), 32);
		}

		function frameDish() {
			const points = [];
			for (let i = 0; i < DISH.segments; i++) {
				const angle = i * Math.PI * 2 / DISH.segments;
				for (const y of [-DISH.baseThickness, DISH.depth]) points.push(new THREE.Vector3(Math.cos(angle) * (DISH.radius + DISH.wallThickness), y, Math.sin(angle) * (DISH.radius + DISH.wallThickness)));
			}
			if (!mobileLayout.matches) {
				for (const x of [-5.5, 5.5]) for (const z of [-2.8, 2.8]) points.push(new THREE.Vector3(x, DISH.spawnHeight + 1.65, z));
			}
			const direction = new THREE.Vector3(0, mobileLayout.matches ? 3.8 : 1.1, 1).normalize();
			frameScene(points, new THREE.Vector3(0, 0.8, 0), direction, 12);
		}


		function toThreeVecArray(verts) {
			return verts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
		}


		function createTriangulatedGeometry(vertices, faces) {
			const positions = [];
			const verts = toThreeVecArray(vertices);
			for (const face of faces) {
				for (let i = 1; i < face.length - 1; i++) {
					const a = verts[face[0]];
					const b = verts[face[i]];
					const c = verts[face[i + 1]];
					positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
				}
			}
			const geo = new THREE.BufferGeometry();
			geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
			geo.computeVertexNormals();
			return geo;
		}

		function createFaceTexture(text, textColor, fate = false, layout = null) {
			const size = 256;
			const c = document.createElement("canvas");
			const ratio = layout ? layout.width / layout.height : 1;
			c.width = layout ? Math.round(512 * Math.min(1, ratio)) : size;
			c.height = layout ? Math.round(512 / Math.max(1, ratio)) : size;
			const ctx = c.getContext("2d");
			drawFaceLabel(ctx, text, textColor, size, fate, layout ? { ...layout, width: c.width, height: c.height } : null);
			const tex = new THREE.CanvasTexture(c);
			tex.needsUpdate = true;
			return tex;
		}

		function createPipTexture(value, pipColor) {
			const size = 256;
			const c = document.createElement("canvas");
			c.width = size;
			c.height = size;
			const ctx = c.getContext("2d");
			ctx.clearRect(0, 0, size, size);

			const pipRadius = 30;
			const map = {
				0: [],
				1: [[0.5, 0.5]],
				2: [[0.3, 0.3], [0.7, 0.7]],
				3: [[0.3, 0.3], [0.5, 0.5], [0.7, 0.7]],
				4: [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]],
				5: [[0.3, 0.3], [0.7, 0.3], [0.5, 0.5], [0.3, 0.7], [0.7, 0.7]],
				6: [[0.3, 0.25], [0.7, 0.25], [0.3, 0.5], [0.7, 0.5], [0.3, 0.75], [0.7, 0.75]],
			};

			const points = map[value] || [];
			ctx.fillStyle = pipColor;
			ctx.strokeStyle = "rgba(255,255,255,0.75)";
			ctx.lineWidth = 5;
			for (let i = 0; i < points.length; i++) {
				const p = points[i];
				ctx.beginPath();
				ctx.arc(p[0] * size, p[1] * size, pipRadius, 0, Math.PI * 2);
				ctx.stroke();
				ctx.fill();
			}

			const tex = new THREE.CanvasTexture(c);
			tex.needsUpdate = true;
			return tex;
		}

		function labelModeForType(type) {
			return type === "d6" || type === "d012" ? "pip" : "number";
		}

		function addFaceLabels(mesh, spec, scaledVertices, baseColor, dieType) {
			if (!spec || !spec.faces || !spec.values) {
				return;
			}
			const normals = computeFaceNormals(scaledVertices, spec.faces);
			const ink = getDieInkColor(baseColor);
			const mode = labelModeForType(dieType);
			for (let i = 0; i < spec.faces.length; i++) {
				const face = spec.faces[i];
				const layout = dieType === "d8" || dieType === "d20" ? triangleLabelLayout(scaledVertices, face) : null;
				const center = new THREE.Vector3();
				for (let j = 0; j < face.length; j++) {
					const v = scaledVertices[face[j]];
					center.x += v.x;
					center.y += v.y;
					center.z += v.z;
				}
				center.multiplyScalar(1 / face.length);
				if (layout) center.set(layout.center.x, layout.center.y, layout.center.z);

				const n = normals[i];
				const normal = new THREE.Vector3(n.x, n.y, n.z).normalize();
				const map = mode === "pip"
					? createPipTexture(spec.values[i], ink)
					: createFaceTexture(spec.faceLabels?.[i] ?? spec.values[i], ink, dieType === "df", layout);
				const labelSize = faceLabelSize(scaledVertices, face, dieType === "df" ? 0.92 : mode === "pip" ? 0.78 : 0.66);
				const label = new THREE.Mesh(
					new THREE.PlaneGeometry(layout?.width ?? labelSize, layout?.height ?? labelSize),
					new THREE.MeshBasicMaterial({
						map,
						transparent: true,
						alphaTest: 0.08,
						depthWrite: false,
						side: THREE.FrontSide,
					})
				);
				label.position.copy(center.addScaledVector(normal, 0.035));
				if (layout) {
					const right = new THREE.Vector3(layout.right.x, layout.right.y, layout.right.z);
					const up = new THREE.Vector3(layout.up.x, layout.up.y, layout.up.z);
					label.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
				} else {
					label.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
				}
				mesh.add(label);
			}
		}

		function addVertexLabels(mesh, spec, scaledVertices, baseColor) {
			if (!spec || !spec.vertexValues) {
				return;
			}
			const ink = getDieInkColor(baseColor);
			const normals = computeFaceNormals(scaledVertices, spec.faces);
			for (let i = 0; i < spec.faces.length; i++) {
				const face = spec.faces[i];
				const n = normals[i];
				const normal = new THREE.Vector3(n.x, n.y, n.z).normalize();
				for (let j = 0; j < face.length; j++) {
					const vidx = face[j];
					const o1idx = face[(j + 1) % 3];
					const o2idx = face[(j + 2) % 3];
					const corner = new THREE.Vector3(
						scaledVertices[vidx].x,
						scaledVertices[vidx].y,
						scaledVertices[vidx].z
					);
					const oppositeMid = new THREE.Vector3(
						(scaledVertices[o1idx].x + scaledVertices[o2idx].x) * 0.5,
						(scaledVertices[o1idx].y + scaledVertices[o2idx].y) * 0.5,
						(scaledVertices[o1idx].z + scaledVertices[o2idx].z) * 0.5
					);

					// Put the label on the triangle altitude (corner -> opposite edge midpoint), inside face.
					const surfacePoint = corner.clone().lerp(oppositeMid, 0.38);
					const labelSize = faceLabelSize(scaledVertices, face, 0.7, surfacePoint);
					const pos = surfacePoint.addScaledVector(normal, 0.015);
					const altitudeDir = oppositeMid.clone().sub(corner).normalize();
					const upAxis = altitudeDir.lengthSq() > 1e-6
						? altitudeDir
						: new THREE.Vector3(0, 1, 0).projectOnPlane(normal).normalize();
					const rightAxis = new THREE.Vector3().crossVectors(upAxis, normal).normalize();
					const basis = new THREE.Matrix4().makeBasis(rightAxis, upAxis, normal);
					const label = new THREE.Mesh(
						new THREE.PlaneGeometry(labelSize, labelSize),
						new THREE.MeshBasicMaterial({
							map: createFaceTexture(spec.vertexValues[vidx], ink, false, { width: labelSize, height: labelSize }),
							transparent: true,
							alphaTest: 0.08,
							depthWrite: false,
							side: THREE.FrontSide,
						})
					);
					label.position.copy(pos);
					label.quaternion.setFromRotationMatrix(basis);
					label.rotateZ(Math.PI);
					mesh.add(label);
				}
			}
		}


		function makeDie(type, index, total) {
			const palette = {
				d2: 0x06b6d4,
				d3: 0x84cc16,
				df: 0xf8fafc,
				d4: 0xef4444,
				d6: 0x0ea5e9,
				d8: 0x14b8a6,
				d10: 0xf59e0b,
				d12: 0xec4899,
				d20: 0xe11d48,
				d012: 0x22c55e,
				d100: 0x7c3aed,
				"d100-ones": 0x8b5cf6,
				"d100-tens": 0x4f46e5,
			};

			const color = palette[type] ?? 0x0ea5e9;
			const size = getDiceSize(type);
			const spec = getDiceSpec(type);
			let body;
			let mesh;

			if (!spec.vertices) throw new Error("Percentile rolls must use two D10 dice");
			{
				const scaledVertices = spec.vertices.map((p) => new CANNON.Vec3(p.x * size, p.y * size, p.z * size));
				const shape = new CANNON.ConvexPolyhedron(scaledVertices, spec.faces);
				body = new CANNON.Body({
					mass: 1,
					shape,
					material: dieMat,
					linearDamping: PHYSICS.linearDamping,
					angularDamping: PHYSICS.angularDamping,
				});

				const geo = createTriangulatedGeometry(scaledVertices, spec.faces);
				mesh = new THREE.Mesh(
					geo,
					new THREE.MeshStandardMaterial({
						color,
						roughness: 0.42,
						metalness: 0.12,
						transparent: diceOpacity < 1,
						opacity: diceOpacity,
					})
				);
				const wire = new THREE.LineSegments(
					new THREE.EdgesGeometry(geo),
					new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.22 })
				);
				mesh.add(wire);
				spec.normals = computeFaceNormals(spec.vertices, spec.faces);
				if (type === "d4") {
					addVertexLabels(mesh, spec, scaledVertices, color);
				} else {
					addFaceLabels(mesh, spec, scaledVertices, color, type);
				}
			}

			if (arenaMode === "tower") {
				launchTowerDie(body, index);
			} else {
				launchDishDie(body, index, total);
			}
			const surfaces = new Set();
			body.addEventListener("collide", ({ body: other }) => {
				const surface = other.towerSurface || other.arenaSurface;
				if (surface) surfaces.add(surface);
			});

			world.addBody(body);
			scene.add(mesh);

			return { type, spec, body, mesh, size, surfaces, exited: false };
		}

		function applyDiceOpacity(mesh) {
			mesh.traverse((child) => {
				if (!child.material?.isMeshStandardMaterial) {
					return;
				}
				child.material.transparent = diceOpacity < 1;
				child.material.opacity = diceOpacity;
				child.material.depthWrite = diceOpacity >= 1;
				child.material.needsUpdate = true;
			});
		}

		function setDiceTranslucent(enabled) {
			diceOpacity = enabled ? 0.8 : 1;
			for (const die of diceState) {
				applyDiceOpacity(die.mesh);
			}
		}

		function clearDice() {
			clock.reset();
			spawnQueue.length = 0;
			while (diceState.length > 0) {
				const d = diceState.pop();
				world.removeBody(d.body);
				scene.remove(d.mesh);
				d.mesh.traverse((child) => {
					child.geometry?.dispose();
					for (const material of child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : []) {
						material.map?.dispose();
						material.dispose();
					}
				});
			}
			rolling = false;
			settler.reset();
		}

		function getTopValue(die) {
			return readDie(die).value;
		}

		function finishRoll() {
			onRollFinish(buildRollResult(diceState));
			rolling = false;
		}

		function roll(type, count) {
			clearDice();
			lastTime = performance.now() / 1000;
			if (type === "d100") {
				spawnQueue.push(
					{ type: "d100-ones", index: 0, total: 2 },
					{ type: "d100-tens", index: 1, total: 2 }
				);
			} else {
				for (let i = 0; i < count; i++) {
					spawnQueue.push({ type, index: i, total: count });
				}
			}

			rolling = true;
			settler.reset();
			nextSpawnAt = clock.elapsed;
		}

		function spawnNextDie(now) {
			if (!rolling || spawnQueue.length === 0 || now < nextSpawnAt) {
				return;
			}

			const next = spawnQueue.shift();
			diceState.push(makeDie(next.type, next.index, next.total));
			nextSpawnAt = now + (arenaMode === "tower" ? TOWER.spawnInterval : DISH.spawnInterval);
			settler.reset();
		}

		function stepSimulation(dt) {
			clock.advancePlayback(dt, (fixedTimeStep, simulationTime) => {
				spawnNextDie(simulationTime);
				world.step(fixedTimeStep);
				for (const d of diceState) {
					if (arenaMode === "tower" && d.body.position.z > d.body.boundingRadius && d.body.position.y < TOWER.exitHeight) d.exited = true;
				}
				if (rolling) {
					const ready = spawnQueue.length === 0 && diceState.every((d) =>
						(arenaMode !== "tower" || (d.exited && d.body.position.z > 0))
						&& (arenaMode !== "dish" || d.body.position.y < DISH.depth));
					if (settler.update(fixedTimeStep / PHYSICS.playbackSpeed, diceState, ready)) finishRoll();
				}
			}, 96);
		}

		let lastTime = performance.now() / 1000;
		let animationId;
		const onVisibilityChange = () => {
			lastTime = performance.now() / 1000;
		};
		document.addEventListener("visibilitychange", onVisibilityChange);
		function animate() {
			animationId = requestAnimationFrame(animate);
			const now = performance.now() / 1000;
			const dt = now - lastTime;
			lastTime = now;
			if (!document.hidden && (rolling || diceState.some((d) => d.body.sleepState !== CANNON.Body.SLEEPING))) stepSimulation(dt);
			for (const d of diceState) {
				d.mesh.position.copy(d.body.position);
				d.mesh.quaternion.copy(d.body.quaternion);
			}
			controls.update();
			renderer.render(scene, camera);
		}

		const onResize = () => {
			camera.aspect = window.innerWidth / window.innerHeight;
			if (arenaMode === "tower") frameTower();
			else frameDish();
			camera.updateProjectionMatrix();
			renderer.setSize(window.innerWidth, window.innerHeight);
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		};
		window.addEventListener("resize", onResize);
		const panelObserver = new ResizeObserver(() => {
			if (arenaMode === "tower") frameTower();
			else frameDish();
		});
		const dock = document.querySelector(".controls-dock");
		if (dock) panelObserver.observe(dock);
		frameDish();
		animate();

		return {
			roll,
			clear: clearDice,
			setDiceTranslucent,
			setArenaMode,
			resetView() {
				if (arenaMode === "tower") frameTower();
				else frameDish();
			},
			dispose() {
				cancelAnimationFrame(animationId);
				window.removeEventListener("resize", onResize);
				panelObserver.disconnect();
				document.removeEventListener("visibilitychange", onVisibilityChange);
				clearDice();
				controls.dispose();
				const geometries = new Set();
				const materials = new Set();
				const textures = new Set();
				scene.traverse((object) => {
					if (object.geometry) geometries.add(object.geometry);
					for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
						materials.add(material);
						if (material.map) textures.add(material.map);
						if (material.bumpMap) textures.add(material.bumpMap);
					}
				});
				for (const resource of [...geometries, ...materials, ...textures]) resource.dispose();
				renderer.dispose();
			},
			getDebugState() {
				return diceState.map((die) => ({
					type: die.type,
					radius: die.body.boundingRadius,
					surfaces: [...die.surfaces],
					exited: die.exited,
					position: {
						x: die.body.position.x,
						y: die.body.position.y,
						z: die.body.position.z,
					},
					speed: die.body.velocity.length(),
					spin: die.body.angularVelocity.length(),
					sleepState: die.body.sleepState,
					value: getTopValue(die),
					quaternion: { x: die.body.quaternion.x, y: die.body.quaternion.y, z: die.body.quaternion.z, w: die.body.quaternion.w },
				}));
			},
			getPhysicsState() {
				return {
					mode: arenaMode,
					gravityMetersPerSecondSquared: -world.gravity.y * PHYSICS.metersPerUnit,
					metersPerUnit: PHYSICS.metersPerUnit,
					playbackSpeed: PHYSICS.playbackSpeed,
					simulationSeconds: clock.elapsed,
					pendingSeconds: clock.accumulator,
					queuedDice: spawnQueue.length,
					rolling,
					stablePlaybackSeconds: settler.elapsed,
				};
			},
			getViewState() {
				const project = (point) => {
					const p = point.clone().project(camera);
					return { x: (p.x + 1) * window.innerWidth / 2, y: (1 - p.y) * window.innerHeight / 2 };
				};
				return {
					position: camera.position.toArray(),
					target: controls.target.toArray(),
					dice: diceState.map((die) => project(new THREE.Vector3(die.body.position.x, die.body.position.y, die.body.position.z))),
					tray: [-5.3, 5.3].flatMap((x) => [0, 3.2].flatMap((y) => [0.8, 12.3].map((z) => project(new THREE.Vector3(x, y, z))))),
				};
			},
		};
}
