import test from "node:test";
import assert from "node:assert/strict";
import { drawFaceLabel, getDieInkColor } from "../src/physics/diceLabels.js";
import { faceLabelSize, getDiceSpec, getDiceSize, triangleLabelLayout } from "../src/physics/diceGeometry.js";

function recordingContext() {
	const calls = [];
	const ctx = { calls };
	for (const method of ["clearRect", "fillRect", "strokeText", "fillText", "beginPath", "arc", "fill"]) {
		ctx[method] = (...args) => calls.push({ method, args, ink: ctx.fillStyle });
	}
	ctx.measureText = (label) => {
		const size = Number(ctx.font.match(/([\d.]+)px/)[1]);
		return { actualBoundingBoxLeft: -size * 0.02, actualBoundingBoxRight: label.length * size * 0.58, actualBoundingBoxAscent: size * 0.72, actualBoundingBoxDescent: size * 0.02 };
	};
	return ctx;
}

test("dark dice use white ink while light dice keep dark ink", () => {
	for (const color of [0x000000, 0xe11d48, 0x7c3aed, 0x8b5cf6, 0x4f46e5]) assert.equal(getDieInkColor(color), "#ffffff");
	for (const color of [0xffffff, 0xf8fafc, 0xf59e0b, 0x84cc16]) assert.equal(getDieInkColor(color), "#111827");
});

test("Fate marks are large thick centered bars and zero remains blank", () => {
	for (const [label, bars] of [["+", 2], ["-", 1], ["", 0]]) {
		const ctx = recordingContext();
		drawFaceLabel(ctx, label, "#111827", 256, true);
		const rectangles = ctx.calls.filter((call) => call.method === "fillRect");
		assert.equal(rectangles.length, bars);
		assert.equal(ctx.calls.filter((call) => call.method === "fillText").length, 0);
		for (const { args: [x, y, width, height] } of rectangles) {
			assert.ok(Math.abs(x + width / 2 - 128) < 1e-8);
			assert.ok(Math.abs(y + height / 2 - 128) < 1e-8);
			assert.ok(Math.max(width, height) > 180 && Math.min(width, height) > 40);
		}
	}
	const spec = getDiceSpec("df");
	const vertices = spec.vertices.map((v) => v.scale(getDiceSize("df")));
	for (const face of spec.faces) {
		assert.ok(faceLabelSize(vertices, face, 0.92) > faceLabelSize(vertices, face, 0.66));
		assert.ok(faceLabelSize(vertices, face, 0.92) <= getDiceSize("df") * 2);
	}
});

test("6 and 9 receive a same-ink bottom dot, including multi-digit labels", () => {
	for (const label of ["6", "9", "16", "19", "60", "90"]) {
		const ctx = recordingContext();
		drawFaceLabel(ctx, label, "#ffffff");
		const dots = ctx.calls.filter((call) => call.method === "arc");
		assert.equal(dots.length, 1, label);
		assert.equal(dots[0].args[0], 128);
		assert.equal(dots[0].args[2], 256 * 0.07);
		assert.ok(dots[0].args[1] + dots[0].args[2] < 256);
		assert.equal(dots[0].ink, "#ffffff");
		assert.equal(ctx.strokeStyle, "#ffffff");
	}
	for (const label of ["1", "8", "10", "20", "00"]) {
		const ctx = recordingContext();
		drawFaceLabel(ctx, label, "#111827");
		assert.equal(ctx.calls.filter((call) => call.method === "arc").length, 0);
	}
});

test("numbers remain centered independently of dots without clipping or touching them", () => {
	const spec = getDiceSpec("d20");
	const layout = triangleLabelLayout(spec.vertices, spec.faces[0]);
	const triangle = { ...layout, width: 512, height: Math.round(512 * layout.height / layout.width) };
	for (const bounds of [null, { width: 512, height: 512 }, triangle]) {
		const width = bounds?.width ?? 256, height = bounds?.height ?? 256;
		const labels = bounds === triangle ? Array.from({ length: 20 }, (_, i) => i + 1) : [1, 4, 6, 9, 16, 19, 60, 90];
		for (const label of labels) {
			const ctx = recordingContext();
			drawFaceLabel(ctx, label, "#ffffff", 256, false, bounds);
			const { args: [text, x, y] } = ctx.calls.find((call) => call.method === "fillText");
			const metrics = ctx.measureText(text), stroke = ctx.lineWidth / 2;
			assert.ok(x - metrics.actualBoundingBoxLeft - stroke > 0);
			assert.ok(x + metrics.actualBoundingBoxRight + stroke < width);
			assert.ok(y - metrics.actualBoundingBoxAscent - stroke > 0);
			assert.ok(y + metrics.actualBoundingBoxDescent + stroke < height);
			assert.ok(Math.abs(x + (metrics.actualBoundingBoxRight - metrics.actualBoundingBoxLeft) / 2 - width / 2) < 1e-8);
			assert.ok(Math.abs(y + (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) / 2 - height * (bounds?.numberCenterY ?? 0.5)) < 1e-8);
			const dot = ctx.calls.find((call) => call.method === "arc");
			if (dot) {
				assert.ok(y + metrics.actualBoundingBoxDescent + stroke < dot.args[1] - dot.args[2]);
				assert.ok(dot.args[1] + dot.args[2] < height);
				assert.ok(dot.args[2] >= height * 0.07);
			}
		}
	}
});
