import CANNON from "cannon";
import { ensureOutwardFaces } from "./diceGeometry.js";
import { contactOptions } from "./physicsSettings.js";

export const DISH = Object.freeze({
	radius: 8.5,
	wallThickness: 0.7,
	depth: 2.6,
	baseThickness: 0.24,
	segments: 64,
	spawnHeight: 6.8,
	// Let each thrown die descend clear of the next spawn volume.
	spawnInterval: 0.12,
	spawnSpacing: 2.7,
});

export function configureDishContacts(world, dieMaterial) {
	const wood = new CANNON.Material("dish-wood");
	const felt = new CANNON.Material("dish-felt");
	world.addContactMaterial(new CANNON.ContactMaterial(dieMaterial, wood, contactOptions(0.18, 0.2)));
	world.addContactMaterial(new CANNON.ContactMaterial(dieMaterial, felt, contactOptions(0.3, 0.08)));
	return { wood, felt };
}

export function createDishBodies(materials) {
	const bodies = [];
	const { radius, wallThickness, depth, segments } = DISH;
	// A plane gives stable support inside the closed ring. Cannon's thin-cylinder
	// cap clipping produces spurious contacts for flat polyhedral dice.
	const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: materials.felt });
	floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
	floor.arenaSurface = "dish-floor";
	bodies.push(floor);
	for (let i = 0; i < segments; i++) {
		const a = i * Math.PI * 2 / segments;
		const b = (i + 1) * Math.PI * 2 / segments;
		const mid = (a + b) / 2;
		const center = new CANNON.Vec3(Math.cos(mid) * (radius + wallThickness / 2), depth / 2, Math.sin(mid) * (radius + wallThickness / 2));
		const vertices = [];
		for (const y of [0, depth]) {
			for (const [r, angle] of [[radius, a], [radius + wallThickness, a], [radius + wallThickness, b], [radius, b]]) {
				vertices.push(new CANNON.Vec3(Math.cos(angle) * r - center.x, y - center.y, Math.sin(angle) * r - center.z));
			}
		}
		const faces = ensureOutwardFaces(vertices, [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]);
		const body = new CANNON.Body({ mass: 0, shape: new CANNON.ConvexPolyhedron(vertices, faces), material: materials.wood, position: center });
		body.arenaSurface = "dish-wall";
		bodies.push(body);
	}
	return bodies;
}

export function launchDishDie(body, index, total, random = Math.random) {
	const columns = Math.min(total, 5);
	const column = index % 5;
	const row = Math.floor(index / 5);
	body.position.set(
		(column - (columns - 1) / 2) * DISH.spawnSpacing + (random() - 0.5) * 0.18,
		DISH.spawnHeight + random() * 0.35,
		(row - Math.floor((total - 1) / 5) / 2) * DISH.spawnSpacing + (random() - 0.5) * 0.18
	);
	body.quaternion.setFromEuler(random() * Math.PI, random() * Math.PI, random() * Math.PI);
	// Aim outer spawn positions inward, so the throw cannot clear the rim.
	const direction = (Math.hypot(body.position.x, body.position.z) > 0.5
		? Math.atan2(-body.position.z, -body.position.x)
		: random() * Math.PI * 2) + (random() - 0.5) * 0.7;
	const speed = 18 + random() * 6;
	body.velocity.set(Math.cos(direction) * speed, 6 + random() * 4, Math.sin(direction) * speed);
	const spinDirection = random() < 0.5 ? -1 : 1;
	body.angularVelocity.set(spinDirection * (18 + random() * 8), (random() - 0.5) * 12, -spinDirection * (12 + random() * 8));
}
