import test from "node:test";
import assert from "node:assert/strict";
import CANNON from "cannon";
import { DISH, createDishBodies, configureDishContacts, launchDishDie } from "../src/physics/dishPhysics.js";
import { getDiceSpec, getDiceSize } from "../src/physics/diceGeometry.js";
import { PHYSICS, configureWorld, contactOptions } from "../src/physics/physicsSettings.js";

function simulate(types, seed) {
	const originalSeed = seed;
	const random = () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed / 4294967296;
	};
	const world = new CANNON.World();
	configureWorld(world);
	const dieMaterial = new CANNON.Material("die");
	const materials = configureDishContacts(world, dieMaterial);
	world.addContactMaterial(new CANNON.ContactMaterial(dieMaterial, dieMaterial, contactOptions(0.12, 0.18)));
	for (const body of createDishBodies(materials)) world.addBody(body);
	const dice = [];
	const separationAxis = new CANNON.Vec3();
	let nextIndex = 0;
	let nextSpawn = 0;
	let stableTime = 0;
	for (let step = 0; step < 10 / PHYSICS.timeStep; step++) {
		const now = step * PHYSICS.timeStep;
		if (nextIndex < types.length && now + 1e-9 >= nextSpawn) {
			const type = types[nextIndex];
			const spec = getDiceSpec(type);
			const shape = new CANNON.ConvexPolyhedron(spec.vertices.map((v) => v.scale(getDiceSize(type))), spec.faces);
			const body = new CANNON.Body({ mass: 1, shape, material: dieMaterial, linearDamping: PHYSICS.linearDamping, angularDamping: PHYSICS.angularDamping });
			body.dieType = type;
			launchDishDie(body, nextIndex, types.length, random);
			world.addBody(body);
			dice.push(body);
			nextIndex++;
			nextSpawn = now + DISH.spawnInterval;
		}
		world.step(PHYSICS.timeStep);
		for (const body of dice) {
			const { x, y, z } = body.position;
			assert.ok(Number.isFinite(x + y + z));
			assert.ok(Math.hypot(x, z) < DISH.radius + DISH.wallThickness && y > -0.1, `Escaped ${body.dieType}, seed ${originalSeed}: ${JSON.stringify(body.position)}`);
		}
		for (const contact of world.contacts) {
			if (!contact.bi.arenaSurface && !contact.bj.arenaSurface) continue;
			const dynamic = contact.bi.mass > 0 ? contact.bi : contact.bj;
			const surface = contact.bi.mass > 0 ? contact.bj : contact.bi;
			const shape = dynamic.shapes[0];
			// Solver contacts retain pre-integration offsets. Check actual geometry,
			// not those cached points after the die has moved and rotated.
			if (surface.arenaSurface === "dish-floor") {
				const minimumY = Math.min(...shape.vertices.map((v) => dynamic.quaternion.vmult(v).y + dynamic.position.y));
				assert.ok(minimumY > -0.18, `Floor penetration: ${-minimumY}`);
			} else if (shape.findSeparatingAxis(surface.shapes[0], dynamic.position, dynamic.quaternion, surface.position, surface.quaternion, separationAxis)) {
				const depth = shape.testSepAxis(separationAxis, surface.shapes[0], dynamic.position, dynamic.quaternion, surface.position, surface.quaternion);
				assert.ok(depth < 0.18, `Wall penetration: ${depth}`);
			}
		}
		const settled = nextIndex === types.length && dice.every((d) => d.position.y < DISH.depth && d.velocity.length() < 0.12 && d.angularVelocity.length() < 0.12);
		stableTime = settled ? stableTime + PHYSICS.timeStep : 0;
		if (stableTime > 0.65) return;
	}
	assert.fail(`Not settled, seed ${originalSeed}: ${JSON.stringify(dice.map((d) => ({ type: d.dieType, position: d.position, speed: d.velocity.length(), spin: d.angularVelocity.length() })))}`);
}

test("black-bottom wooden bowl contains and settles all dice types, including 15 dice", () => {
	for (const type of ["d4", "d6", "d8", "d10", "d12", "d20", "d012", "d100-ones", "d100-tens"]) {
		for (let seed = 1; seed <= 3; seed++) {
			simulate([type], seed);
			simulate(Array(15).fill(type), seed);
		}
	}
});

test("mixed sizes and percentile pairs settle in the bowl without recovery teleports", () => {
	for (let seed = 1; seed <= 5; seed++) {
		simulate(Array.from({ length: 15 }, (_, i) => ["d4", "d6", "d8", "d10", "d12", "d20"][i % 6]), seed);
		simulate(["d100-ones", "d100-tens"], seed);
	}
});

test("wooden walls stop outward-moving dice at faces and segment seams", () => {
	for (let direction = 0; direction < 8; direction++) {
		for (const offset of [0, Math.PI / DISH.segments]) {
			const angle = direction * Math.PI / 4 + offset;
			const world = new CANNON.World();
			configureWorld(world);
			const dieMaterial = new CANNON.Material("die");
			for (const body of createDishBodies(configureDishContacts(world, dieMaterial))) world.addBody(body);
			const die = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(0.525, 0.525, 0.525)), material: dieMaterial });
			die.position.set(Math.cos(angle) * 7.2, 1.2, Math.sin(angle) * 7.2);
			die.velocity.set(Math.cos(angle) * 45, 0, Math.sin(angle) * 45);
			let hitWall = false;
			die.addEventListener("collide", ({ body }) => { if (body.arenaSurface === "dish-wall") hitWall = true; });
			world.addBody(die);
			for (let step = 0; step < 1 / PHYSICS.timeStep; step++) {
				world.step(PHYSICS.timeStep);
				assert.ok(Math.hypot(die.position.x, die.position.z) < DISH.radius + DISH.wallThickness);
			}
			assert.ok(hitWall, `No wall collision at ${angle}`);
		}
	}
});
