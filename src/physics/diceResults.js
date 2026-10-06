import { computeFaceNormals } from "./diceGeometry.js";

export function readDie(die) {
	const { spec, body } = die;
	const directions = spec.vertexValues ? spec.vertices : (spec.normals || computeFaceNormals(spec.vertices, spec.faces));
	const values = spec.vertexValues || spec.values;
	let best = -Infinity;
	let second = -Infinity;
	let index = 0;
	for (let i = 0; i < directions.length; i++) {
		const up = body.quaternion.vmult(directions[i]).y;
		if (up > best) {
			second = best;
			best = up;
			index = i;
		} else second = Math.max(second, up);
	}
	return { value: values[index], index, gap: best - second };
}

export function percentileTotal(ones, tens) {
	return ones === 0 && tens === 0 ? 100 : ones + tens;
}

export function buildRollResult(dice) {
	const readings = dice.map(readDie);
	const cocked = readings.flatMap((reading, index) => reading.gap < 0.03 ? [index + 1] : []);
	if (cocked.length) return { kind: "cocked", indices: cocked };
	const onesIndex = dice.findIndex((die) => die.type === "d100-ones");
	const tensIndex = dice.findIndex((die) => die.type === "d100-tens");
	if (dice.length === 2 && onesIndex >= 0 && tensIndex >= 0) {
		const ones = readings[onesIndex].value, tens = readings[tensIndex].value;
		return { kind: "percentile", ones, tens, total: percentileTotal(ones, tens) };
	}
	const values = readings.map((reading) => reading.value);
	return { kind: "sum", values, sum: values.reduce((sum, value) => sum + value, 0) };
}

export class RollSettler {
	elapsed = 0;
	baseline = null;

	reset() {
		this.elapsed = 0;
		this.baseline = null;
	}

	update(playbackSeconds, dice, ready) {
		if (!ready || dice.length === 0 || dice.some(({ body }) => body.velocity.length() > 0.4 || body.angularVelocity.length() > 0.5)) {
			this.reset();
			return false;
		}
		const readings = dice.map(readDie);
		const unchanged = this.baseline?.length === dice.length && dice.every(({ body }, i) => {
			const previous = this.baseline[i];
			const rotation = body.quaternion;
			const dot = Math.abs(rotation.x * previous.rotation.x + rotation.y * previous.rotation.y + rotation.z * previous.rotation.z + rotation.w * previous.rotation.w);
			return readings[i].value === previous.value && body.position.distanceTo(previous.position) < 0.02 && dot > Math.cos(0.015 / 2);
		});
		if (!unchanged) {
			this.elapsed = 0;
			this.baseline = dice.map(({ body }, i) => ({ value: readings[i].value, position: body.position.clone(), rotation: body.quaternion.clone() }));
		}
		this.elapsed += playbackSeconds;
		return this.elapsed >= 0.15;
	}
}
