import CANNON from "cannon";
import { getDiceSize } from "./diceGeometry.js";

// Calibrate the existing mesh scale to a 16 mm D6, without rescaling meshes.
const metersPerUnit = 0.016 / (2 * getDiceSize("d6"));
export const PHYSICS = Object.freeze({
	metersPerUnit,
	gravity: 9.80665 / metersPerUnit,
	// Slow presentation without changing collision trajectories or gravity.
	playbackSpeed: 0.5,
	timeStep: 1 / 960,
	linearDamping: 0.01,
	angularDamping: 0.04,
	contactStiffness: 1e7,
});

export function contactOptions(friction, restitution) {
	return { friction, restitution, contactEquationStiffness: PHYSICS.contactStiffness, contactEquationRelaxation: 3 };
}

export class ArenaSolver extends CANNON.GSSolver {
	solve(dt, world) {
		// Cannon 0.6.2 clamps impulse lambda using force limits without multiplying
		// by dt. Share a body's friction budget across its contact points; retaining
		// those points (rather than a single centroid) also resists twisting dice.
		const counts = new Map();
		const pairKey = (equation) => `${Math.min(equation.bi.id, equation.bj.id)}:${Math.max(equation.bi.id, equation.bj.id)}`;
		for (const equation of world.frictionEquations) {
			const key = pairKey(equation);
			counts.set(key, (counts.get(key) || 0) + 1);
		}
		for (const equation of world.frictionEquations) {
			const impulseScale = dt * 2 / counts.get(pairKey(equation));
			equation.minForce *= impulseScale;
			equation.maxForce *= impulseScale;
		}
		return super.solve(dt, world);
	}
}

export function configureWorld(world) {
	world.gravity.set(0, -PHYSICS.gravity, 0);
	world.allowSleep = true;
	world.broadphase = new CANNON.SAPBroadphase(world);
	world.solver = new ArenaSolver();
	world.solver.iterations = 20;
	world.solver.tolerance = 0.001;
	world.narrowphase.enableFrictionReduction = false;
	world.defaultContactMaterial.contactEquationStiffness = PHYSICS.contactStiffness;
	world.defaultContactMaterial.contactEquationRelaxation = 3;
}

export class SimulationClock {
	elapsed = 0;
	accumulator = 0;

	reset() {
		this.elapsed = 0;
		this.accumulator = 0;
	}

	advancePlayback(seconds, step, maxSteps = Infinity) {
		this.advance(seconds * PHYSICS.playbackSpeed, step, maxSteps);
	}

	advance(seconds, step, maxSteps = Infinity) {
		if (!Number.isFinite(seconds) || seconds <= 0) return;
		this.accumulator += seconds;
		let steps = 0;
		while (steps < maxSteps && this.accumulator + 1e-10 >= PHYSICS.timeStep) {
			this.accumulator -= PHYSICS.timeStep;
			this.elapsed += PHYSICS.timeStep;
			step(PHYSICS.timeStep, this.elapsed);
			steps++;
		}
	}
}
