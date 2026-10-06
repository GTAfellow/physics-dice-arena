import test from "node:test";
import assert from "node:assert/strict";
import CANNON from "cannon";
import { getDiceSize } from "../src/physics/diceGeometry.js";
import { PHYSICS, configureWorld, SimulationClock } from "../src/physics/physicsSettings.js";

function fall(frames) {
	const world = new CANNON.World();
	configureWorld(world);
	const body = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(0.5), linearDamping: PHYSICS.linearDamping });
	body.position.y = 2 / PHYSICS.metersPerUnit;
	world.addBody(body);
	const clock = new SimulationClock();
	const initialY = body.position.y;
	let dropTime;
	for (const dt of frames) {
		clock.advance(dt, (step, now) => {
			world.step(step);
			if (dropTime === undefined && (initialY - body.position.y) * PHYSICS.metersPerUnit >= 0.1) dropTime = now;
		});
	}
	return { body, clock, dropTime };
}

test("D6 scale and scene gravity represent 16 mm and standard Earth gravity", () => {
	assert.ok(Math.abs(2 * getDiceSize("d6") * PHYSICS.metersPerUnit - 0.016) < 1e-12);
	assert.ok(Math.abs(PHYSICS.gravity * PHYSICS.metersPerUnit - 9.80665) < 1e-12);
});

test("a 10 cm free fall matches sqrt(2h/g) at 15, 30, 60 and 144 fps", () => {
	const expected = Math.sqrt(2 * 0.1 / 9.80665);
	for (const fps of [15, 30, 60, 144]) {
		const { dropTime } = fall(Array(fps).fill(1 / fps));
		assert.ok(Math.abs(dropTime - expected) <= PHYSICS.timeStep * 2, `${fps} fps: ${dropTime}, expected ${expected}`);
	}
});

test("foreground frame stalls do not discard simulation time or slow the fall", () => {
	const smooth = fall(Array(60).fill(1 / 60));
	const stalled = fall([0.2, 0.1, 0.4, 0.3]);
	assert.ok(Math.abs(stalled.clock.elapsed - 1) < 1e-10);
	assert.ok(Math.abs(stalled.body.position.y - smooth.body.position.y) < 1e-10);
	assert.equal(stalled.dropTime, smooth.dropTime);
});

test("half-speed playback preserves physical free fall across frame rates", () => {
	const expected = Math.sqrt(2 * 0.1 / 9.80665) / PHYSICS.playbackSpeed;
	for (const fps of [15, 30, 60, 144]) {
		const world = new CANNON.World();
		configureWorld(world);
		const body = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(0.5), linearDamping: PHYSICS.linearDamping });
		const initialY = 2 / PHYSICS.metersPerUnit;
		body.position.y = initialY;
		world.addBody(body);
		const clock = new SimulationClock();
		let playbackDropTime;
		for (let frame = 0; frame < fps; frame++) {
			clock.advancePlayback(1 / fps, (step, now) => {
				world.step(step);
				if (playbackDropTime === undefined && (initialY - body.position.y) * PHYSICS.metersPerUnit >= 0.1) {
					playbackDropTime = now / PHYSICS.playbackSpeed;
				}
			});
		}
		assert.ok(Math.abs(playbackDropTime - expected) <= PHYSICS.timeStep * 2 / PHYSICS.playbackSpeed, `${fps} fps: ${playbackDropTime}`);
		assert.ok(Math.abs(clock.elapsed - PHYSICS.playbackSpeed) < 1e-10);
	}
});

test("playback scales foreground stalls and retains catch-up debt", () => {
	const smooth = new SimulationClock();
	const stalled = new SimulationClock();
	for (let i = 0; i < 60; i++) smooth.advancePlayback(1 / 60, () => {});
	stalled.advancePlayback(1, () => {}, 96);
	assert.ok(Math.abs(stalled.elapsed - 0.1) < 1e-10);
	assert.ok(Math.abs(stalled.accumulator - 0.4) < 1e-10);
	stalled.advancePlayback(PHYSICS.timeStep, () => {});
	assert.ok(Math.abs(stalled.elapsed - smooth.elapsed) < 1e-10);
});

test("Cannon friction limits are converted from forces to per-step impulses", () => {
	const world = new CANNON.World();
	configureWorld(world);
	world.defaultContactMaterial.friction = 0.3;
	const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
	floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
	const die = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(0.5) });
	die.position.y = 0.49;
	world.addBody(floor);
	world.addBody(die);
	world.step(PHYSICS.timeStep);
	assert.ok(world.frictionEquations.length > 0);
	for (const equation of world.frictionEquations) {
		assert.ok(Math.abs(equation.maxForce - 0.3 * PHYSICS.gravity * PHYSICS.timeStep) < 1e-10);
	}
});

test("bounded catch-up retains its debt instead of discarding elapsed time", () => {
	const clock = new SimulationClock();
	let steps = 0;
	const step = () => steps++;
	clock.advance(0.4, step, 96);
	assert.equal(steps, 96);
	assert.ok(Math.abs(clock.accumulator - 0.3) < 1e-10);
	for (let i = 0; i < 6; i++) clock.advance(1 / 60, step, 96);
	assert.ok(Math.abs(clock.elapsed - 0.5) < 1e-10);
	assert.ok(Math.abs(clock.accumulator) < 1e-10);
});

test("a new roll does not inherit pending simulation time from an old roll", () => {
	const clock = new SimulationClock();
	clock.advance(0.4, () => {}, 96);
	clock.reset();
	let steps = 0;
	clock.advance(1 / 60, () => steps++);
	assert.equal(steps, 16);
	assert.ok(Math.abs(clock.elapsed - 1 / 60) < 1e-10);
});
