import test from "node:test";
import assert from "node:assert/strict";
import CANNON from "cannon";
import { getDiceSpec } from "../src/physics/diceGeometry.js";
import { buildRollResult, RollSettler } from "../src/physics/diceResults.js";

function die() {
	return { spec: getDiceSpec("d6"), body: new CANNON.Body({ mass: 1 }) };
}

test("settled results need only 150 ms of playback confirmation at all frame rates", () => {
	for (const fps of [15, 30, 60, 144]) {
		const tracker = new RollSettler(), dice = [die()];
		let frames = 0;
		while (!tracker.update(1 / fps, dice, true)) frames++;
		const elapsed = (frames + 1) / fps;
		assert.ok(elapsed >= 0.15 && elapsed <= 0.15 + 1 / fps + 1e-10);
	}
});

test("unspawned, airborne or tower-bound dice cannot finish a roll", () => {
	const tracker = new RollSettler();
	assert.equal(tracker.update(1, [], true), false);
	assert.equal(tracker.update(1, [die()], false), false);
	assert.equal(tracker.elapsed, 0);
});

test("linear motion, spinning, pose drift and changed face values restart confirmation", () => {
	for (const change of [
		(d) => { d.body.velocity.x = 1; },
		(d) => { d.body.angularVelocity.z = 1; },
		(d) => { d.body.position.x = 0.03; },
		(d) => { d.body.quaternion.setFromEuler(0.1, 0, 0); },
		(d) => { d.body.quaternion.setFromEuler(Math.PI, 0, 0); },
	]) {
		const tracker = new RollSettler(), d = die();
		assert.equal(tracker.update(0.1, [d], true), false);
		change(d);
		assert.equal(tracker.update(0.06, [d], true), false);
		assert.ok(tracker.elapsed <= 0.06);
	}
});

test("sleep is not required and jitter within sub-pixel bounds does not block results", () => {
	const tracker = new RollSettler(), d = die();
	d.body.velocity.x = 0.01;
	assert.equal(tracker.update(0.1, [d], true), false);
	d.body.position.x = 0.001;
	d.body.quaternion.setFromEuler(0.001, 0, 0);
	assert.equal(tracker.update(0.06, [d], true), true);
	assert.equal(d.body.sleepState, CANNON.Body.AWAKE);
	tracker.reset();
	assert.equal(tracker.update(0.1, [d], true), false);
});

test("cocked dice warn instead of inventing a face value or a misleading sum", () => {
	const d = die();
	d.body.quaternion.setFromEuler(Math.PI / 4, 0, 0);
	assert.deepEqual(buildRollResult([d]), { kind: "cocked", indices: [1] });
	assert.deepEqual(buildRollResult([die(), d]), { kind: "cocked", indices: [2] });
	assert.deepEqual(buildRollResult([die()]), { kind: "sum", values: [2], sum: 2 });
});
