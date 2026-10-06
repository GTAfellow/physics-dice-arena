import test from "node:test";
import assert from "node:assert/strict";
import CANNON from "cannon";
import { getDiceSpec, getDiceSize } from "../src/physics/diceGeometry.js";
import { TOWER, getTowerParts, createTowerBody, configureTowerContacts, launchTowerDie } from "../src/physics/towerPhysics.js";
import { PHYSICS, configureWorld } from "../src/physics/physicsSettings.js";

function seededRandom(seed) {
	return () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed / 4294967296;
	};
}

function simulate(types, seed) {
	const world = new CANNON.World();
	configureWorld(world);
	const dieMaterial = new CANNON.Material("die");
	const materials = configureTowerContacts(world, dieMaterial);
	for (const part of getTowerParts()) {
		if (part.physics !== false) world.addBody(createTowerBody(part, materials[part.finish]));
	}
	const random = seededRandom(seed);
	const dice = [];
	const separation = new CANNON.Vec3();
	let nextIndex = 0;
	let nextSpawn = 0;
	let stableTime = 0;
	for (let step = 0; step < 15 / TOWER.timeStep; step++) {
		const now = step * TOWER.timeStep;
		if (nextIndex < types.length && now + 1e-9 >= nextSpawn) {
			const type = types[nextIndex];
			const spec = getDiceSpec(type);
			const size = getDiceSize(type);
			const shape = new CANNON.ConvexPolyhedron(spec.vertices.map((v) => v.scale(size)), spec.faces);
			const body = new CANNON.Body({ mass: 1, shape, material: dieMaterial, linearDamping: PHYSICS.linearDamping, angularDamping: PHYSICS.angularDamping });
			launchTowerDie(body, nextIndex, random);
			const die = { type, body, surfaces: new Set(), exited: false };
			body.addEventListener("collide", ({ body: other }) => {
				if (other.towerSurface) die.surfaces.add(other.towerSurface);
			});
			dice.push(die);
			world.addBody(body);
			nextIndex++;
			nextSpawn = now + TOWER.spawnInterval;
		}
		world.step(TOWER.timeStep);
		for (const contact of world.contacts) {
			if (!contact.bi.towerSurface && !contact.bj.towerSurface) continue;
			contact.bj.position.vadd(contact.rj, separation);
			separation.vsub(contact.bi.position, separation);
			separation.vsub(contact.ri, separation);
			const penetration = -contact.ni.dot(separation);
			assert.ok(penetration < 0.18, `Deep penetration through ${contact.bi.towerSurface || contact.bj.towerSurface}: ${penetration}`);
		}
		for (const die of dice) {
			const { x, y, z } = die.body.position;
			assert.ok(Number.isFinite(x + y + z), "Invalid physics state");
			assert.ok(Math.abs(x) < TOWER.trayHalfWidth + 0.2 && z > -TOWER.depth - 0.2 && z < TOWER.trayFront + 0.2 && y > -0.1, `${die.type} escaped the tower/tray: ${JSON.stringify({ x, y, z })}`);
			if (z > die.body.boundingRadius && y < TOWER.exitHeight) die.exited = true;
		}
		const settled = nextIndex === types.length && dice.every((d) => d.exited && d.body.position.z > 0 && d.body.velocity.length() < 0.12 && d.body.angularVelocity.length() < 0.12);
		stableTime = settled ? stableTime + TOWER.timeStep : 0;
		if (stableTime > 0.65) {
			return { dice, duration: now };
		}
	}
	assert.fail(`Jam with seed ${seed}: ${JSON.stringify(dice.map((d) => ({ type: d.type, position: d.body.position, speed: d.body.velocity.length(), spin: d.body.angularVelocity.length(), exited: d.exited, surfaces: [...d.surfaces] })))}`);
}

const types = ["d2", "d3", "df", "d4", "d6", "d8", "d10", "d12", "d20", "d012", "d100-ones", "d100-tens"];

test("single dice hit both alternating baffles and the exit ramp", () => {
	for (const type of types) {
		for (let seed = 1; seed <= 8; seed++) {
			const { dice } = simulate([type], seed);
			for (const surface of ["upper-baffle", "lower-baffle", "exit-ramp"]) {
				assert.ok(dice[0].surfaces.has(surface), `${type}, seed ${seed}, missed ${surface}`);
			}
		}
	}
});

test("15 dice of every type drain naturally without teleports or forced sleep", () => {
	for (const type of types) {
		for (let seed = 1; seed <= 5; seed++) {
			const { dice } = simulate(Array(15).fill(type), seed);
			assert.equal(dice.length, 15);
		}
	}
});

test("mixed sizes and percentile pairs drain naturally", () => {
	for (let seed = 1; seed <= 8; seed++) {
		simulate(Array.from({ length: 15 }, (_, i) => types[i % types.length]), seed);
		simulate(["d100-ones", "d100-tens"], seed);
	}
});
