import test from "node:test";
import assert from "node:assert/strict";
import CANNON from "cannon";
import { DISH, launchDishDie } from "../src/physics/dishPhysics.js";
import { launchTowerDie } from "../src/physics/towerPhysics.js";
import { PHYSICS, SimulationClock, configureWorld } from "../src/physics/physicsSettings.js";

function makeDie() {
	return new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(0.525, 0.525, 0.525)), linearDamping: PHYSICS.linearDamping, angularDamping: PHYSICS.angularDamping });
}

test("dish launches have horizontal speed, a slight upward arc and visible spin", () => {
	for (const value of [0, 0.5, 1]) {
		for (const total of [1, 2, 15]) {
			for (let index = 0; index < total; index++) {
				const body = makeDie();
				launchDishDie(body, index, total, () => value);
				assert.ok(Math.hypot(body.velocity.x, body.velocity.z) >= 18 - 1e-10);
				assert.ok(body.velocity.y >= 6 && body.velocity.y <= 10);
				assert.ok(body.angularVelocity.length() >= Math.hypot(18, 12));
				if (Math.hypot(body.position.x, body.position.z) > 0.5) {
					assert.ok(body.position.x * body.velocity.x + body.position.z * body.velocity.z < 0, "Throw must point inward");
				}
			}
		}
	}
});

test("tower launches move inward and toward the first baffle with nonzero spin", () => {
	for (const value of [0, 0.5, 1]) {
		for (const index of [0, 1]) {
			const body = makeDie();
			launchTowerDie(body, index, () => value);
			assert.ok(body.position.x * body.velocity.x < 0);
			assert.ok(body.velocity.y < 0);
			assert.ok(body.velocity.z >= 1.5 && body.velocity.z <= 3);
			assert.ok(body.angularVelocity.length() >= Math.hypot(12, 6));
		}
	}
});

test("queued dish throws leave room for the largest die at each spawn", () => {
	const radius = Math.sqrt(3) * 0.75;
	for (let seed = 1; seed <= 16; seed++) {
		let state = seed;
		const random = () => {
			state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
			return state / 4294967296;
		};
		const world = new CANNON.World();
		configureWorld(world);
		const clock = new SimulationClock();
		const dice = [];
		for (let index = 0; index < 15; index++) {
			const body = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(radius), linearDamping: PHYSICS.linearDamping });
			launchDishDie(body, index, 15, random);
			for (const previous of dice) {
				assert.ok(body.position.distanceTo(previous.position) > 2 * radius, `Spawn overlap, seed ${seed}, index ${index}`);
			}
			world.addBody(body);
			dice.push(body);
			clock.advance(DISH.spawnInterval, (step) => world.step(step));
		}
	}
});

test("the first 120 ms of playback visibly translate and rotate freshly thrown dice", () => {
	for (const launch of [(body) => launchDishDie(body, 0, 1, () => 0.5), (body) => launchTowerDie(body, 0, () => 0.5)]) {
		const world = new CANNON.World();
		configureWorld(world);
		const body = makeDie();
		launch(body);
		world.addBody(body);
		const initialPosition = body.position.clone();
		const initialRotation = body.quaternion.clone();
		const initialSpeed = body.velocity.clone();
		new SimulationClock().advancePlayback(0.12, (step) => world.step(step));
		assert.ok(body.position.distanceTo(initialPosition) > 0.5);
		const dot = Math.abs(body.quaternion.x * initialRotation.x + body.quaternion.y * initialRotation.y + body.quaternion.z * initialRotation.z + body.quaternion.w * initialRotation.w);
		assert.ok(2 * Math.acos(Math.min(1, dot)) > 0.7, "Should visibly tumble, even with midpoint random values");
		assert.ok(body.velocity.y < initialSpeed.y, "Gravity, not repeated launch impulses, drives subsequent motion");
	}
});
