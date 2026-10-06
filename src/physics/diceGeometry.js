import * as THREE from "three";
import CANNON from "cannon";

function v3(x, y, z) {
	return new CANNON.Vec3(x, y, z);
}

export function computeFaceNormals(vertices, faces) {
	return faces.map((face) => {
		const normal = vertices[face[1]].vsub(vertices[face[0]]).cross(vertices[face[2]].vsub(vertices[face[0]]));
		normal.normalize();
		return normal;
	});
}

export function faceLabelSize(vertices, face, maximum, at) {
	const center = at ? new CANNON.Vec3(at.x, at.y, at.z) : new CANNON.Vec3();
	if (!at) {
		for (const index of face) center.vadd(vertices[index], center);
		center.scale(1 / face.length, center);
	}
	let radius = Infinity;
	for (let i = 0; i < face.length; i++) {
		const start = vertices[face[i]], edge = vertices[face[(i + 1) % face.length]].vsub(start);
		radius = Math.min(radius, edge.cross(center.vsub(start)).length() / edge.length());
	}
	return Math.min(maximum, radius * Math.SQRT2 * 0.96);
}

export function triangleLabelLayout(vertices, face) {
	const start = vertices[face[0]], end = vertices[face[1]], apex = vertices[face[2]];
	const edge = end.vsub(start);
	const length = edge.length();
	const right = edge.scale(1 / length);
	const normal = edge.cross(apex.vsub(start));
	normal.normalize();
	const up = normal.cross(right);
	const midpoint = start.vadd(end).scale(0.5);
	const altitude = apex.vsub(midpoint).dot(up);
	// The texture includes space below the number for a dot; the glyph stays at the face centroid.
	const top = 1 / 3 + 0.18, bottom = 0.02;
	const height = top - bottom;
	return {
		center: midpoint.vadd(up.scale(altitude * (top + bottom) / 2)),
		right, up, normal,
		width: length * 0.45,
		height: altitude * height,
		numberCenterY: (top - 1 / 3) / height,
		numberHeight: 0.36 / height,
		dotCenterY: (top - 0.08) / height,
		dotRadius: 0.055 / height,
	};
}

function oppositeValues(geometry, first = 1, step = 1) {
	const normals = computeFaceNormals(geometry.vertices, geometry.faces);
	const values = Array(normals.length);
	const total = 2 * first + (normals.length - 1) * step;
	let next = first;
	for (let i = 0; i < normals.length; i++) {
		if (values[i] !== undefined) continue;
		const opposite = normals.findIndex((normal, j) => j !== i && normal.dot(normals[i]) < -1 + 1e-8);
		if (opposite < 0) throw new Error("Die has no opposite face");
		values[i] = next;
		values[opposite] = total - next;
		next += step;
	}
	return values;
}

export function ensureOutwardFaces(vertices, faces) {
	const fixed = [];
	for (const face of faces) {
		const a = vertices[face[0]];
		const b = vertices[face[1]];
		const c = vertices[face[2]];
		const ab = b.vsub(a);
		const ac = c.vsub(a);
		const normal = ab.cross(ac);

		const center = new CANNON.Vec3(0, 0, 0);
		for (const idx of face) {
			center.vadd(vertices[idx], center);
		}
		center.scale(1 / face.length, center);
		const outward = normal.dot(center) >= 0;
		fixed.push(outward ? [...face] : [...face].reverse());
	}
	return fixed;
}

function cubeSpec(values) {
	const vertices = [
		v3(-1, -1, -1), v3(1, -1, -1), v3(1, 1, -1), v3(-1, 1, -1),
		v3(-1, -1, 1), v3(1, -1, 1), v3(1, 1, 1), v3(-1, 1, 1),
	];
	const faces = [
		[1, 2, 6, 5],
		[0, 4, 7, 3],
		[3, 7, 6, 2],
		[0, 1, 5, 4],
		[4, 5, 6, 7],
		[0, 3, 2, 1],
	];
	const outwardFaces = ensureOutwardFaces(vertices, faces);
	return {
		vertices,
		faces: outwardFaces,
		values,
	};
}

function d10Geometry() {
	const n = 5;
	const r = 1;
	const h = 0.62;
	const waistScale = 1.12;
	const heightScale = 0.72;

	const antiVerts = [];
	for (let i = 0; i < n; i++) {
		const a = (Math.PI * 2 * i) / n;
		antiVerts.push(new THREE.Vector3(r * Math.cos(a), h, r * Math.sin(a)));
	}
	for (let i = 0; i < n; i++) {
		const a = (Math.PI * 2 * (i + 0.5)) / n;
		antiVerts.push(new THREE.Vector3(r * Math.cos(a), -h, r * Math.sin(a)));
	}

	const antiFaces = [];
	antiFaces.push([0, 1, 2, 3, 4]);
	antiFaces.push([5, 9, 8, 7, 6]);
	for (let i = 0; i < n; i++) {
		const t0 = i;
		const t1 = (i + 1) % n;
		const b0 = n + i;
		const b1 = n + ((i + 1) % n);
		antiFaces.push([t0, b0, t1]);
		antiFaces.push([t1, b0, b1]);
	}

	function dualPoint(face) {
		const a = antiVerts[face[0]];
		const b = antiVerts[face[1]];
		const c = antiVerts[face[2]];
		const center = new THREE.Vector3();
		for (let i = 0; i < face.length; i++) {
			center.add(antiVerts[face[i]]);
		}
		center.multiplyScalar(1 / face.length);

		const normal = new THREE.Vector3()
			.subVectors(b, a)
			.cross(new THREE.Vector3().subVectors(c, a))
			.normalize();
		if (normal.dot(center) < 0) {
			normal.multiplyScalar(-1);
		}
		const d = normal.dot(a);
		const safeD = Math.abs(d) < 1e-5 ? (d < 0 ? -1e-5 : 1e-5) : d;
		return normal.multiplyScalar(1 / safeD);
	}

	const dualVerts = antiFaces.map((f) => {
		const p = dualPoint(f).multiplyScalar(0.92);
		p.x *= waistScale;
		p.y *= heightScale;
		p.z *= waistScale;
		return p;
	});

	const faces = [];
	for (let vi = 0; vi < antiVerts.length; vi++) {
		const adjacent = [];
		for (let fi = 0; fi < antiFaces.length; fi++) {
			if (antiFaces[fi].indexOf(vi) !== -1) {
				adjacent.push(fi);
			}
		}

		const axis = antiVerts[vi].clone().normalize();
		const tmp = Math.abs(axis.y) < 0.9
			? new THREE.Vector3(0, 1, 0)
			: new THREE.Vector3(1, 0, 0);
		const u = tmp.clone().sub(axis.clone().multiplyScalar(tmp.dot(axis))).normalize();
		const v = new THREE.Vector3().crossVectors(axis, u).normalize();

		adjacent.sort((fa, fb) => {
			const pa = dualVerts[fa].clone();
			const pb = dualVerts[fb].clone();
			const paProj = pa.sub(axis.clone().multiplyScalar(pa.dot(axis)));
			const pbProj = pb.sub(axis.clone().multiplyScalar(pb.dot(axis)));
			const aa = Math.atan2(paProj.dot(v), paProj.dot(u));
			const ab = Math.atan2(pbProj.dot(v), pbProj.dot(u));
			return aa - ab;
		});

		faces.push(adjacent);
	}

	const vertices = dualVerts.map((p) => v3(p.x, p.y, p.z));
	return { vertices, faces: ensureOutwardFaces(vertices, faces) };
}

function d12Geometry() {
	const phi = (1 + Math.sqrt(5)) / 2;
	const baseVerts = [
		new THREE.Vector3(-1, phi, 0),
		new THREE.Vector3(1, phi, 0),
		new THREE.Vector3(-1, -phi, 0),
		new THREE.Vector3(1, -phi, 0),
		new THREE.Vector3(0, -1, phi),
		new THREE.Vector3(0, 1, phi),
		new THREE.Vector3(0, -1, -phi),
		new THREE.Vector3(0, 1, -phi),
		new THREE.Vector3(phi, 0, -1),
		new THREE.Vector3(phi, 0, 1),
		new THREE.Vector3(-phi, 0, -1),
		new THREE.Vector3(-phi, 0, 1),
	];

	const baseFaces = [
		[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
		[1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
		[3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
		[4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
	];

	function dualPoint(face) {
		const a = baseVerts[face[0]];
		const b = baseVerts[face[1]];
		const c = baseVerts[face[2]];
		const center = a.clone().add(b).add(c).multiplyScalar(1 / 3);

		const normal = new THREE.Vector3()
			.subVectors(b, a)
			.cross(new THREE.Vector3().subVectors(c, a))
			.normalize();
		if (normal.dot(center) < 0) {
			normal.multiplyScalar(-1);
		}
		const d = normal.dot(a);
		const safeD = Math.abs(d) < 1e-5 ? (d < 0 ? -1e-5 : 1e-5) : d;
		return normal.multiplyScalar(1 / safeD);
	}

	const dualVerts = baseFaces.map((f) => dualPoint(f).multiplyScalar(0.9));

	const faces = [];
	for (let vi = 0; vi < baseVerts.length; vi++) {
		const adjacent = [];
		for (let fi = 0; fi < baseFaces.length; fi++) {
			if (baseFaces[fi].indexOf(vi) !== -1) {
				adjacent.push(fi);
			}
		}

		const axis = baseVerts[vi].clone().normalize();
		const tmp = Math.abs(axis.y) < 0.9
			? new THREE.Vector3(0, 1, 0)
			: new THREE.Vector3(1, 0, 0);
		const u = tmp.clone().sub(axis.clone().multiplyScalar(tmp.dot(axis))).normalize();
		const v = new THREE.Vector3().crossVectors(axis, u).normalize();

		adjacent.sort((fa, fb) => {
			const pa = dualVerts[fa].clone();
			const pb = dualVerts[fb].clone();
			const paProj = pa.sub(axis.clone().multiplyScalar(pa.dot(axis)));
			const pbProj = pb.sub(axis.clone().multiplyScalar(pb.dot(axis)));
			const aa = Math.atan2(paProj.dot(v), paProj.dot(u));
			const ab = Math.atan2(pbProj.dot(v), pbProj.dot(u));
			return aa - ab;
		});

		faces.push(adjacent);
	}

	const vertices = dualVerts.map((p) => v3(p.x, p.y, p.z));
	return { vertices, faces: ensureOutwardFaces(vertices, faces) };
}

function d20Geometry() {
	const phi = (1 + Math.sqrt(5)) / 2;
	const vertices = [
		v3(-1, phi, 0), v3(1, phi, 0), v3(-1, -phi, 0), v3(1, -phi, 0),
		v3(0, -1, phi), v3(0, 1, phi), v3(0, -1, -phi), v3(0, 1, -phi),
		v3(phi, 0, -1), v3(phi, 0, 1), v3(-phi, 0, -1), v3(-phi, 0, 1),
	];
	const faces = [
		[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
		[1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
		[3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
		[4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
	];
	return { vertices, faces: ensureOutwardFaces(vertices, faces) };
}

export function getDiceSpec(type) {
	if (type === "d4") {
		const vertices = [v3(1, 1, 1), v3(-1, -1, 1), v3(-1, 1, -1), v3(1, -1, -1)];
		const faces = ensureOutwardFaces(vertices, [
			[0, 2, 1],
			[0, 1, 3],
			[0, 3, 2],
			[1, 2, 3],
		]);
		return { vertices, faces, values: [1, 2, 3, 4], vertexValues: [1, 2, 3, 4], label: "d4" };
	}
	if (type === "d6") {
		return { ...cubeSpec([1, 6, 2, 5, 3, 4]), label: "d6" };
	}
	if (type === "d2" || type === "d3") {
		const divisor = type === "d2" ? 3 : 2;
		return { ...cubeSpec([1, 6, 2, 5, 3, 4].map((value) => Math.ceil(value / divisor))), label: type };
	}
	if (type === "df") {
		const values = [-1, 1, 0, 0, 1, -1];
		return { ...cubeSpec(values), faceLabels: values.map((value) => value > 0 ? "+" : value < 0 ? "-" : ""), label: "df" };
	}
	if (type === "d8") {
		const vertices = [v3(1, 0, 0), v3(-1, 0, 0), v3(0, 1, 0), v3(0, -1, 0), v3(0, 0, 1), v3(0, 0, -1)];
		const faces = ensureOutwardFaces(vertices, [
			[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
			[2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5],
		]);
		return { vertices, faces, values: oppositeValues({ vertices, faces }), label: "d8" };
	}
	if (type === "d10") {
		const geom = d10Geometry();
		const faceLabels = oppositeValues(geom, 0);
		return {
			vertices: geom.vertices,
			faces: geom.faces,
			values: faceLabels.map((value) => value === 0 ? 10 : value),
			faceLabels,
			label: "d10",
		};
	}
	if (type === "d12") {
		const geom = d12Geometry();
		return {
			vertices: geom.vertices,
			faces: geom.faces,
			values: oppositeValues(geom),
			label: "d12",
		};
	}
	if (type === "d20") {
		const geom = d20Geometry();
		return {
			vertices: geom.vertices,
			faces: geom.faces,
			values: oppositeValues(geom),
			label: "d20",
		};
	}
	if (type === "d100-ones") {
		const geom = d10Geometry();
		return {
			vertices: geom.vertices,
			faces: geom.faces,
			values: oppositeValues(geom, 0),
			label: "d100-ones",
		};
	}
	if (type === "d100-tens") {
		const geom = d10Geometry();
		const values = oppositeValues(geom, 0, 10);
		return {
			vertices: geom.vertices,
			faces: geom.faces,
			values,
			faceLabels: values.map((value) => String(value).padStart(2, "0")),
			label: "d100-tens",
		};
	}
	if (type === "d012") {
		return { ...cubeSpec([0, 1, 2, 0, 1, 2]), label: "d012" };
	}
	if (type === "d100") return { label: "d100", paired: true };
	throw new Error(`Unsupported die type: ${type}`);
}

export function getDiceSize(type) {
	const base = 0.75;
	return ["d2", "d3", "d6", "df", "d012", "d20"].includes(type) ? base * 0.7 : type === "d12" ? base * 1.5 : base;
}
