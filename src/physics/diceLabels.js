export function getDieInkColor(color) {
	const channels = [(color >> 16) & 255, (color >> 8) & 255, color & 255].map((value) => {
		const s = value / 255;
		return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
	const darkContrast = (luminance + 0.05) / (0.0092 + 0.05);
	const lightContrast = (1 + 0.05) / (luminance + 0.05);
	return lightContrast > darkContrast ? "#ffffff" : "#111827";
}

export function drawFaceLabel(ctx, text, ink, size = 256, fate = false, bounds = null) {
	const label = String(text);
	const width = bounds?.width ?? size, height = bounds?.height ?? size;
	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = ink;
	if (fate) {
		if (label !== "+" && label !== "-") return;
		const length = size * 0.72;
		const thickness = size * 0.16;
		ctx.fillRect((size - length) / 2, (size - thickness) / 2, length, thickness);
		if (label === "+") ctx.fillRect((size - thickness) / 2, (size - length) / 2, thickness, length);
		return;
	}
	if (!label) return;
	const needsDot = /[69]/.test(label);
	const padding = Math.min(width, height) * 0.06;
	const centerY = height * (bounds?.numberCenterY ?? 0.5);
	const numberHeight = height * (bounds?.numberHeight ?? 1);
	const dotRadius = bounds?.dotRadius ? height * bounds.dotRadius : Math.min(width, height) * 0.07;
	const fixedDotY = bounds?.dotCenterY != null ? height * bounds.dotCenterY : null;
	const dotGap = height * 0.035;
	ctx.lineWidth = height * 0.024;
	ctx.strokeStyle = ink;
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	const availableWidth = width - 2 * padding - ctx.lineWidth;
	let availableHeight = numberHeight * 0.88 - ctx.lineWidth;
	if (needsDot) {
		const bottomLimit = fixedDotY == null ? height - padding - 2 * dotRadius : fixedDotY - dotRadius;
		availableHeight = Math.min(availableHeight, 2 * (bottomLimit - dotGap - centerY) - ctx.lineWidth);
	}
	const initialSize = bounds ? numberHeight : size * 172 / 256;
	ctx.font = `700 ${initialSize}px Space Grotesk, sans-serif`;
	const initial = ctx.measureText(label);
	const scale = Math.min(
		bounds ? Infinity : 1,
		availableWidth / (initial.actualBoundingBoxLeft + initial.actualBoundingBoxRight),
		availableHeight / (initial.actualBoundingBoxAscent + initial.actualBoundingBoxDescent)
	);
	ctx.font = `700 ${initialSize * scale}px Space Grotesk, sans-serif`;
	const metrics = ctx.measureText(label);
	const x = width / 2 + (metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2;
	const y = centerY + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
	ctx.strokeText(label, x, y);
	ctx.fillText(label, x, y);
	if (needsDot) {
		const dotY = fixedDotY ?? y + metrics.actualBoundingBoxDescent + ctx.lineWidth / 2 + dotGap + dotRadius;
		ctx.beginPath();
		ctx.arc(width / 2, dotY, dotRadius, 0, Math.PI * 2);
		ctx.fill();
	}
}
