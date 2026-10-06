import CANNON from "cannon";
import { PHYSICS, contactOptions } from "./physicsSettings.js";

export const TOWER = Object.freeze({
	width: 8,
	depth: 10,
	height: 20,
	wall: 0.3,
	trayHalfWidth: 5,
	trayFront: 12,
	exitHeight: 4.5,
	spawnInterval: 0.2,
	timeStep: PHYSICS.timeStep,
});

// Endpoints describe board centerlines. Positive Z is the direction of the tray.
function ramp(id, rear, front) {
	const dy = front[0] - rear[0];
	const dz = front[1] - rear[1];
	return {
		id,
		finish: "wood",
		size: [TOWER.width + TOWER.wall, 0.4, Math.hypot(dy, dz)],
		position: [0, (rear[0] + front[0]) / 2, (rear[1] + front[1]) / 2],
		rotation: [-Math.atan2(dy, dz), 0, 0],
	};
}

export function getTowerParts() {
	const { width, depth, height, wall, trayHalfWidth, trayFront, exitHeight } = TOWER;
	const trayLength = depth + trayFront + wall * 2;
	const parts = [
		{ id: "felt", finish: "felt", physics: false, size: [trayHalfWidth * 2, 0.16, depth + trayFront], position: [0, -0.08, (trayFront - depth) / 2] },
		{ id: "tray-floor", finish: "felt", size: [trayHalfWidth * 2, 0.2, trayFront - 0.8], position: [0, -0.1, (trayFront + 0.8) / 2] },
		{ id: "tray-left", finish: "wood", size: [wall, 3.2, trayLength], position: [-trayHalfWidth - wall / 2, 1.6, (trayFront - depth) / 2] },
		{ id: "tray-right", finish: "wood", size: [wall, 3.2, trayLength], position: [trayHalfWidth + wall / 2, 1.6, (trayFront - depth) / 2] },
		{ id: "tray-front", finish: "wood", size: [trayHalfWidth * 2 + wall * 2, 3.2, wall], position: [0, 1.6, trayFront + wall / 2] },
		{ id: "tray-back", finish: "wood", size: [trayHalfWidth * 2 + wall * 2, 3.2, wall], position: [0, 1.6, -depth - wall / 2] },
		{ id: "tower-left", finish: "glass", size: [wall, height, depth + wall * 2], position: [-width / 2 - wall / 2, height / 2, -depth / 2] },
		{ id: "tower-right", finish: "glass", size: [wall, height, depth + wall * 2], position: [width / 2 + wall / 2, height / 2, -depth / 2] },
		{ id: "tower-back", finish: "glass", size: [width, height, wall], position: [0, height / 2, -depth - wall / 2] },
		{ id: "tower-front", finish: "glass", size: [width, height - exitHeight, wall], position: [0, (height + exitHeight) / 2, wall / 2] },
		ramp("upper-baffle", [17.6, -depth - 0.12], [13.8, -4]),
		ramp("lower-baffle", [8.1, -6], [11.9, 0.12]),
		ramp("exit-ramp", [5.9, -depth - 0.12], [-0.2, 0.8]),
	];
	return parts;
}

export function createTowerBody(part, material) {
	const body = new CANNON.Body({
		mass: 0,
		shape: new CANNON.Box(new CANNON.Vec3(...part.size.map((n) => n / 2))),
		position: new CANNON.Vec3(...part.position),
		material,
	});
	body.quaternion.setFromEuler(...(part.rotation || [0, 0, 0]));
	body.towerSurface = part.id;
	return body;
}

export function configureTowerContacts(world, dieMaterial) {
	const wood = new CANNON.Material("tower-wood");
	const glass = new CANNON.Material("tower-glass");
	const felt = new CANNON.Material("tower-felt");
	for (const [material, friction, restitution] of [[wood, 0.12, 0.12], [glass, 0.08, 0.1], [felt, 0.3, 0.08], [dieMaterial, 0.12, 0.18]]) {
		world.addContactMaterial(new CANNON.ContactMaterial(dieMaterial, material, contactOptions(friction, restitution)));
	}
	return { wood, glass, felt, diceContact: world.getContactMaterial(dieMaterial, dieMaterial) };
}

export function launchTowerDie(body, index, random = Math.random) {
	body.towerDie = true;
	body.position.set((index % 2 === 0 ? -1.75 : 1.75) + (random() - 0.5) * 0.3, TOWER.height + 1.7, -8 + (random() - 0.5) * 0.3);
	body.quaternion.setFromEuler(random() * Math.PI, random() * Math.PI, random() * Math.PI);
	body.velocity.set(-Math.sign(body.position.x) * (0.6 + random() * 0.4), -1.5, 1.5 + random() * 1.5);
	const spinDirection = random() < 0.5 ? -1 : 1;
	body.angularVelocity.set(spinDirection * (12 + random() * 4), (random() - 0.5) * 8, -spinDirection * (6 + random() * 4));
}
