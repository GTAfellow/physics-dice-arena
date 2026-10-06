import test from "node:test";
import assert from "node:assert/strict";
import CANNON from "cannon";
import { computeFaceNormals, faceLabelSize, getDiceSize, getDiceSpec, triangleLabelLayout } from "../src/physics/diceGeometry.js";
import { readDie, percentileTotal } from "../src/physics/diceResults.js";
import { DICE_OPTIONS, I18N } from "../src/i18n.js";

const solids = { d4: [4, 3, 70.5287793655], d6: [6, 4, 90], d8: [8, 3, 109.4712206345], d12: [12, 5, 116.5650511771], d20: [20, 3, 138.1896851042] };

function faceArea(spec, face) {
	const first = spec.vertices[face[0]];
	let area = 0;
	for (let i = 1; i < face.length - 1; i++) area += spec.vertices[face[i]].vsub(first).cross(spec.vertices[face[i + 1]].vsub(first)).length() / 2;
	return area;
}

test("all physical dice are closed, outward, planar convex polyhedra with equal-area faces", () => {
	for (const type of [...DICE_OPTIONS.filter((t) => t !== "d100"), "d100-ones"]) {
		const spec = getDiceSpec(type);
		const normals = computeFaceNormals(spec.vertices, spec.faces);
		const edges = new Map();
		const areas = spec.faces.map((face) => faceArea(spec, face));
		assert.ok(Math.max(...areas) - Math.min(...areas) < 1e-8, type);
		for (let i = 0; i < spec.faces.length; i++) {
			const face = spec.faces[i];
			const origin = spec.vertices[face[0]];
			const normal = normals[i];
			assert.ok(normal.dot(origin) > 0, `${type}: inward normal`);
			for (const index of face) assert.ok(Math.abs(normal.dot(spec.vertices[index].vsub(origin))) < 1e-8, `${type}: non-planar face`);
			for (const vertex of spec.vertices) assert.ok(normal.dot(vertex.vsub(origin)) < 1e-8, `${type}: non-convex surface`);
			for (let j = 0; j < face.length; j++) {
				const a = face[j], b = face[(j + 1) % face.length];
				const key = [a, b].sort((x, y) => x - y).join(",");
				const incidences = edges.get(key) || [];
				incidences.push({ face: i, a, b });
				edges.set(key, incidences);
			}
		}
		assert.equal(spec.vertices.length - edges.size + spec.faces.length, 2, type);
		for (const incidents of edges.values()) {
			assert.equal(incidents.length, 2, type);
			assert.equal(incidents[0].a, incidents[1].b, `${type}: inconsistent winding`);
			if (solids[type]) {
				const [a, b] = incidents.map((edge) => edge.face);
				const angle = 180 - Math.acos(normals[a].dot(normals[b])) * 180 / Math.PI;
				assert.ok(Math.abs(angle - solids[type][2]) < 1e-8, `${type}: dihedral ${angle}`);
			}
		}
		if (solids[type]) {
			assert.equal(spec.faces.length, solids[type][0]);
			const lengths = [...edges.values()].map(([{ a, b }]) => spec.vertices[a].distanceTo(spec.vertices[b]));
			assert.ok(Math.max(...lengths) - Math.min(...lengths) < 1e-8, `${type}: unequal edge lengths`);
			assert.ok(spec.faces.every((face) => face.length === solids[type][1]));
			const expected = 180 - 360 / solids[type][1];
			for (const face of spec.faces) {
				for (let j = 0; j < face.length; j++) {
					const vertex = spec.vertices[face[j]];
					const before = spec.vertices[face[(j + face.length - 1) % face.length]].vsub(vertex).unit();
					const after = spec.vertices[face[(j + 1) % face.length]].vsub(vertex).unit();
					assert.ok(Math.abs(Math.acos(before.dot(after)) * 180 / Math.PI - expected) < 1e-8, `${type}: irregular face angle`);
				}
			}
		}
	}
});

test("D10 has ten congruent kites, two poles and a realistic compact aspect ratio", () => {
	const spec = getDiceSpec("d10");
	assert.equal(spec.vertices.length, 12);
	assert.equal(spec.faces.length, 10);
	assert.equal(spec.vertices.filter((v) => Math.hypot(v.x, v.z) < 1e-8).length, 2);
	let reference;
	for (const face of spec.faces) {
		assert.equal(face.length, 4);
		const edges = face.map((index, j) => spec.vertices[index].distanceTo(spec.vertices[face[(j + 1) % 4]])).sort((a, b) => a - b);
		assert.ok(Math.abs(edges[0] - edges[1]) < 1e-8);
		assert.ok(Math.abs(edges[2] - edges[3]) < 1e-8);
		if (!reference) reference = edges;
		else assert.ok(edges.every((length, index) => Math.abs(length - reference[index]) < 1e-8));
	}
	const height = Math.max(...spec.vertices.map((v) => v.y)) - Math.min(...spec.vertices.map((v) => v.y));
	const width = Math.max(...spec.vertices.map((v) => v.x)) - Math.min(...spec.vertices.map((v) => v.x));
	assert.ok(height / width > 0.8 && height / width < 1.3);
});

test("numbered dice cover their full range and use complementary opposite labels", () => {
	for (const [type, sides, first, step] of [["d6", 6, 1, 1], ["d8", 8, 1, 1], ["d12", 12, 1, 1], ["d20", 20, 1, 1], ["d10", 10, 0, 1], ["d100-ones", 10, 0, 1], ["d100-tens", 10, 0, 10]]) {
		const spec = getDiceSpec(type), normals = computeFaceNormals(spec.vertices, spec.faces);
		const labels = (spec.faceLabels || spec.values).map(Number);
		assert.deepEqual([...labels].sort((a, b) => a - b), Array.from({ length: sides }, (_, i) => first + i * step));
		for (let i = 0; i < sides; i++) {
			const opposite = normals.findIndex((n) => n.dot(normals[i]) < -1 + 1e-8);
			assert.ok(opposite >= 0);
			assert.equal(labels[i] + labels[opposite], 2 * first + (sides - 1) * step, type);
		}
	}
});

test("each face or D4 apex reads the value actually printed on it", () => {
	for (const type of [...DICE_OPTIONS.filter((t) => t !== "d100"), "d100-ones"]) {
		const spec = getDiceSpec(type);
		const directions = spec.vertexValues ? spec.vertices : computeFaceNormals(spec.vertices, spec.faces);
		for (let i = 0; i < directions.length; i++) {
			const body = new CANNON.Body({ mass: 1 });
			body.quaternion.setFromVectors(directions[i].unit(), new CANNON.Vec3(0, 1, 0));
			const reading = readDie({ type, spec, body });
			assert.equal(reading.index, i, `${type}: incorrect upward direction`);
			assert.equal(reading.value, (spec.vertexValues || spec.values)[i]);
			assert.ok(reading.gap > 0.1);
			if (type === "d10") assert.equal(reading.value, Number(spec.faceLabels[i]) || 10);
		}
	}
});

test("D2, D3 and Fate use balanced D6 faces, with bilingual options", () => {
	for (const [type, outcomes, repeats] of [["d2", [1, 2], 3], ["d3", [1, 2, 3], 2], ["df", [-1, 0, 1], 2]]) {
		const spec = getDiceSpec(type);
		for (const outcome of outcomes) assert.equal(spec.values.filter((value) => value === outcome).length, repeats);
	}
	for (const option of DICE_OPTIONS) {
		assert.ok(I18N.zh.options[option]);
		assert.ok(I18N.en.options[option]);
	}
});

test("percentile combinations cover 1 through 100 exactly once; 00 + 0 is 100", () => {
	const results = [];
	for (let tens = 0; tens < 100; tens += 10) for (let ones = 0; ones < 10; ones++) results.push(percentileTotal(ones, tens));
	assert.deepEqual(results.sort((a, b) => a - b), Array.from({ length: 100 }, (_, i) => i + 1));
	assert.equal(percentileTotal(0, 0), 100);
	assert.equal(percentileTotal(0, 90), 90);
	assert.equal(percentileTotal(7, 0), 7);
});

test("label squares fit within every face, including D4 corner labels", () => {
	for (const type of DICE_OPTIONS.filter((t) => t !== "d100")) {
		const spec = getDiceSpec(type), vertices = spec.vertices.map((v) => v.scale(getDiceSize(type)));
		for (const face of spec.faces) {
			const center = face.reduce((sum, index) => sum.vadd(vertices[index]), new CANNON.Vec3()).scale(1 / face.length);
			const positions = type !== "d4" ? [center] : face.map((index) => vertices[index].scale(0.43).vadd(center.scale(0.57)));
			for (const position of positions) {
				const side = faceLabelSize(vertices, face, 0.78, position);
				assert.ok(side > 0 && side <= 0.78);
				for (let i = 0; i < face.length; i++) {
					const start = vertices[face[i]], edge = vertices[face[(i + 1) % face.length]].vsub(start);
					const clearance = edge.cross(position.vsub(start)).length() / edge.length();
					assert.ok(side / Math.SQRT2 < clearance, `${type}: label crosses a face boundary`);
				}
			}
		}
	}
});

test("D8 and D20 label rectangles fit their faces and center the number at the centroid", () => {
	for (const type of ["d8", "d20"]) {
		const spec = getDiceSpec(type), vertices = spec.vertices.map((v) => v.scale(getDiceSize(type)));
		for (const face of spec.faces) {
			const { center, right, up, normal, width, height, numberCenterY, dotCenterY, dotRadius } = triangleLabelLayout(vertices, face);
			assert.ok(right.cross(up).dot(normal) > 1 - 1e-8);
			assert.ok(width > faceLabelSize(vertices, face, 0.66) * 1.1);
			const centroid = face.reduce((sum, index) => sum.vadd(vertices[index]), new CANNON.Vec3()).scale(1 / 3);
			const glyphCenter = center.vadd(up.scale(height * (0.5 - numberCenterY)));
			assert.ok(glyphCenter.distanceTo(centroid) < 1e-8, `${type}: number is off-center`);
			assert.ok(dotCenterY - dotRadius > numberCenterY);
			assert.ok(dotCenterY + dotRadius < 1);
			assert.ok(height * dotRadius > 0.04 * vertices[face[0]].distanceTo(vertices[face[1]]));
			for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) {
				const corner = center.vadd(right.scale(width * x)).vadd(up.scale(height * y));
				assert.ok(Math.abs(corner.vsub(vertices[face[0]]).dot(normal)) < 1e-8);
				for (let i = 0; i < face.length; i++) {
					const start = vertices[face[i]], edge = vertices[face[(i + 1) % face.length]].vsub(start);
					assert.ok(edge.cross(corner.vsub(start)).dot(normal) > 0, `${type}: label crosses an edge`);
				}
			}
		}
	}
});
