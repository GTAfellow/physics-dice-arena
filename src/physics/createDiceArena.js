import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import CANNON from "cannon";
import { getDiceSpec, getDiceSize } from "./diceGeometry.js";
import { TOWER, getTowerParts, createTowerBody, configureTowerContacts, launchTowerDie } from "./towerPhysics.js";
import { DISH, createDishBodies, configureDishContacts, launchDishDie } from "./dishPhysics.js";
import { PHYSICS, configureWorld, SimulationClock } from "./physicsSettings.js";

export function createDiceArena(canvas, { onRollFinish = () => {} } = {}) {
		let diceOpacity = 0.8;
		let arenaMode = "dish";
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
		let stableTime = 0;
		let rollStart = 0;
		let nextSpawnAt = 0;
		const clock = new SimulationClock();

		function frameScene(points, target, direction, minimumDistance) {
			const width = window.innerWidth;
			const height = window.innerHeight;
			const panel = document.querySelector(".panel")?.getBoundingClientRect();
			const mobile = width <= 600;
			const left = !mobile && panel ? panel.right + 24 : 0;
			const availableWidth = Math.max(160, width - left);
			const availableHeight = mobile && panel ? Math.max(160, panel.top - 16) : height;
			let distance = minimumDistance;
			controls.target.copy(target);
			camera.clearViewOffset();
			let bounds;
			// Fit real geometry and release positions into the area clear of controls.
			for (let attempt = 0; attempt < 6; attempt++) {
				controls.maxDistance = Math.max(75, distance * 1.3);
				camera.far = Math.max(160, distance * 3);
				camera.position.copy(controls.target).addScaledVector(direction, distance);
				controls.update();
				camera.updateProjectionMatrix();
				camera.updateMatrixWorld();
				const projected = points.map((point) => point.clone().project(camera));
				bounds = {
					left: Math.min(...projected.map((p) => (p.x + 1) * width / 2)),
					right: Math.max(...projected.map((p) => (p.x + 1) * width / 2)),
					top: Math.min(...projected.map((p) => (1 - p.y) * height / 2)),
					bottom: Math.max(...projected.map((p) => (1 - p.y) * height / 2)),
				};
				const scale = Math.max((bounds.right - bounds.left) / (availableWidth - 32), (bounds.bottom - bounds.top) / (availableHeight - 32));
				if (scale <= 1) break;
				distance *= scale * 1.04;
			}
			camera.setViewOffset(width, height, (bounds.left + bounds.right - left - width) / 2, (bounds.top + bounds.bottom - availableHeight) / 2, width, height);
		}

		function frameTower() {
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
			for (const x of [-7, 7]) for (const z of [-4.5, 4.5]) points.push(new THREE.Vector3(x, DISH.spawnHeight + 1.7, z));
			frameScene(points, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.9, 1).normalize(), 24);
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

		function computeFaceNormals(vertices, faces) {
			const normals = [];
			for (const face of faces) {
				const a = vertices[face[0]];
				const b = vertices[face[1]];
				const c = vertices[face[2]];
				const ab = b.vsub(a);
				const ac = c.vsub(a);
				const n = ab.cross(ac);
				n.normalize();
				normals.push(n);
			}
			return normals;
		}

		function createFaceTexture(text, textColor) {
			const size = 256;
			const c = document.createElement("canvas");
			c.width = size;
			c.height = size;
			const ctx = c.getContext("2d");
			const label = String(text);
			ctx.clearRect(0, 0, size, size);
			ctx.fillStyle = textColor;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.font = "700 172px Space Grotesk, sans-serif";
			ctx.strokeStyle = "rgba(255,255,255,0.7)";
			ctx.lineWidth = 14;
			ctx.strokeText(label, size / 2, size / 2 + 4);
			ctx.fillText(label, size / 2, size / 2 + 4);

			if (/[69]/.test(label)) {
				const metrics = ctx.measureText(label);
				const lineWidth = Math.max(30, metrics.width * 0.86);
				const x1 = size / 2 - lineWidth / 2;
				const x2 = size / 2 + lineWidth / 2;
				const y = size * 0.78;
				ctx.beginPath();
				ctx.strokeStyle = "rgba(255,255,255,0.9)";
				ctx.lineWidth = 16;
				ctx.moveTo(x1, y);
				ctx.lineTo(x2, y);
				ctx.stroke();

				ctx.beginPath();
				ctx.strokeStyle = textColor;
				ctx.lineWidth = 8;
				ctx.moveTo(x1, y);
				ctx.lineTo(x2, y);
				ctx.stroke();
			}
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

		function isPercentileType(type) {
			return type === "d100-ones" || type === "d100-tens";
		}

		function addFaceLabels(mesh, spec, scaledVertices, baseColor, dieType) {
			if (!spec || !spec.faces || !spec.values) {
				return;
			}
			const normals = computeFaceNormals(scaledVertices, spec.faces);
			const dark = new THREE.Color(baseColor).multiplyScalar(0.52).getStyle();
			const mode = labelModeForType(dieType);
			for (let i = 0; i < spec.faces.length; i++) {
				const face = spec.faces[i];
				const center = new THREE.Vector3();
				for (let j = 0; j < face.length; j++) {
					const v = scaledVertices[face[j]];
					center.x += v.x;
					center.y += v.y;
					center.z += v.z;
				}
				center.multiplyScalar(1 / face.length);

				const n = normals[i];
				const normal = new THREE.Vector3(n.x, n.y, n.z).normalize();
				const map = mode === "pip"
					? createPipTexture(spec.values[i], dark)
					: createFaceTexture(spec.values[i], dark);
				const labelSize = mode === "pip" ? 0.78 : 0.66;
				const label = new THREE.Mesh(
					new THREE.PlaneGeometry(labelSize, labelSize),
					new THREE.MeshBasicMaterial({
						map,
						transparent: true,
						alphaTest: 0.08,
						depthWrite: false,
						side: THREE.DoubleSide,
					})
				);
				label.position.copy(center.addScaledVector(normal, 0.035));
				label.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
				mesh.add(label);
			}
		}

		function addVertexLabels(mesh, spec, scaledVertices, baseColor) {
			if (!spec || !spec.vertexValues) {
				return;
			}
			const dark = new THREE.Color(baseColor).multiplyScalar(0.52).getStyle();
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
					const pos = corner.clone().lerp(oppositeMid, 0.38).addScaledVector(normal, 0.015);
					const altitudeDir = oppositeMid.clone().sub(corner).normalize();
					const upAxis = altitudeDir.lengthSq() > 1e-6
						? altitudeDir
						: new THREE.Vector3(0, 1, 0).projectOnPlane(normal).normalize();
					const rightAxis = new THREE.Vector3().crossVectors(upAxis, normal).normalize();
					const basis = new THREE.Matrix4().makeBasis(rightAxis, upAxis, normal);
					const label = new THREE.Mesh(
						new THREE.PlaneGeometry(0.7, 0.7),
						new THREE.MeshBasicMaterial({
							map: createFaceTexture(spec.vertexValues[vidx], dark),
							transparent: true,
							alphaTest: 0.08,
							depthWrite: false,
							side: THREE.DoubleSide,
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

			if (type === "d100") {
				const radius = size * 0.9;
				body = new CANNON.Body({
					mass: 1,
					material: dieMat,
					shape: new CANNON.Sphere(radius),
					linearDamping: PHYSICS.linearDamping,
					angularDamping: PHYSICS.angularDamping,
				});
				mesh = new THREE.Mesh(
					new THREE.SphereGeometry(radius, 40, 30),
					new THREE.MeshStandardMaterial({
						color,
						roughness: 0.45,
						metalness: 0.2,
						transparent: diceOpacity < 1,
						opacity: diceOpacity,
					})
				);
				const tag = new THREE.Mesh(
					new THREE.PlaneGeometry(0.9, 0.9),
					new THREE.MeshBasicMaterial({
						map: createFaceTexture("100", "#4c1d95"),
						transparent: true,
						alphaTest: 0.08,
						depthWrite: false,
						side: THREE.DoubleSide,
					})
				);
				tag.position.set(0, radius + 0.02, 0);
				tag.rotation.x = -Math.PI / 2;
				mesh.add(tag);
			} else {
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
				if (isPercentileType(type)) {
					const sideTag = new THREE.Mesh(
						new THREE.PlaneGeometry(0.46, 0.46),
						new THREE.MeshBasicMaterial({
							map: createFaceTexture(type === "d100-tens" ? "10s" : "1s", "#0f172a"),
							transparent: true,
							alphaTest: 0.08,
							depthWrite: false,
							side: THREE.DoubleSide,
						})
					);
					sideTag.position.set(0, 0.02, 0);
					sideTag.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
					mesh.add(sideTag);
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
			stableTime = 0;
		}

		function getTopValue(die) {
			if (die.type === "d100") {
				return Math.floor(Math.random() * 100) + 1;
			}
			if (die.type === "d4") {
				let bestIdx = 0;
				let bestUp = -Infinity;
				const scaled = die.spec.vertices.map((p) => new CANNON.Vec3(p.x * die.size, p.y * die.size, p.z * die.size));
				for (let i = 0; i < scaled.length; i++) {
					const worldV = die.body.quaternion.vmult(scaled[i]);
					if (worldV.y > bestUp) {
						bestUp = worldV.y;
						bestIdx = i;
					}
				}
				return die.spec.vertexValues[bestIdx] ?? 0;
			}
			const { normals, values } = die.spec;
			let bestIdx = 0;
			let bestUp = -Infinity;
			for (let i = 0; i < normals.length; i++) {
				const worldN = die.body.quaternion.vmult(normals[i]);
				if (worldN.y > bestUp) {
					bestUp = worldN.y;
					bestIdx = i;
				}
			}
			return values[bestIdx] ?? 0;
		}

		function finishRoll() {
			const percentileOnes = diceState.find((d) => d.type === "d100-ones");
			const percentileTens = diceState.find((d) => d.type === "d100-tens");
			if (percentileOnes && percentileTens && diceState.length === 2) {
				const ones = getTopValue(percentileOnes);
				const tens = getTopValue(percentileTens);
				let total = ones + tens;
				if (ones === 0 && tens === 0) {
					total = 100;
				}
				onRollFinish({ kind: "percentile", ones, tens, total });
				rolling = false;
				return;
			}

			const values = diceState.map((d) => getTopValue(d));
			const sum = values.reduce((a, b) => a + b, 0);
			onRollFinish({ kind: "sum", values, sum });
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
			stableTime = 0;
			rollStart = clock.elapsed;
			nextSpawnAt = rollStart;
		}

		function spawnNextDie(now) {
			if (!rolling || spawnQueue.length === 0 || now < nextSpawnAt) {
				return;
			}

			const next = spawnQueue.shift();
			diceState.push(makeDie(next.type, next.index, next.total));
			nextSpawnAt = now + (arenaMode === "tower" ? TOWER.spawnInterval : DISH.spawnInterval);
			stableTime = 0;
		}

		function stepSimulation(dt) {
			clock.advancePlayback(dt, (fixedTimeStep, simulationTime) => {
				spawnNextDie(simulationTime);
				world.step(fixedTimeStep);
				for (const d of diceState) {
					if (arenaMode === "tower" && d.body.position.z > d.body.boundingRadius && d.body.position.y < TOWER.exitHeight) d.exited = true;
				}
				if (rolling && diceState.length > 0 && spawnQueue.length === 0) {
					const allSlow = simulationTime - rollStart > 0.9 && diceState.every((d) =>
						d.body.velocity.length() < 0.12 && d.body.angularVelocity.length() < 0.12
						&& (arenaMode !== "tower" || (d.exited && d.body.position.z > 0))
						&& (arenaMode !== "dish" || d.body.position.y < DISH.depth)
					);
					stableTime = allSlow ? stableTime + fixedTimeStep : 0;
					if (stableTime > 0.65) finishRoll();
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
		frameDish();
		animate();

		return {
			roll,
			clear: clearDice,
			setDiceTranslucent,
			setArenaMode,
			dispose() {
				cancelAnimationFrame(animationId);
				window.removeEventListener("resize", onResize);
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
				};
			},
		};
}
