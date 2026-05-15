/**
 * HSV to RGB (shared by idle bar animation and rave controller).
 */

/**
 * @param {number} h
 * @param {number} s
 * @param {number} v
 * @returns {{r: number, g: number, b: number}}
 */
function hsvToRgbInternal(h, s, v) {
	const c = v * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = v - c;

	let r = 0; let g = 0; let b = 0;

	if (h >= 0 && h < 60) {
		r = c; g = x; b = 0;
	} else if (h >= 60 && h < 120) {
		r = x; g = c; b = 0;
	} else if (h >= 120 && h < 180) {
		r = 0; g = c; b = x;
	} else if (h >= 180 && h < 240) {
		r = 0; g = x; b = c;
	} else if (h >= 240 && h < 300) {
		r = x; g = 0; b = c;
	} else if (h >= 300 && h < 360) {
		r = c; g = 0; b = x;
	}

	return {
		r: Math.round((r + m) * 255),
		g: Math.round((g + m) * 255),
		b: Math.round((b + m) * 255)
	};
}

const HUE_LUT_FULL_SAT = (() => {
	const lut = new Array(360);
	for (let h = 0; h < 360; h++) {
		lut[h] = hsvToRgbInternal(h, 1, 1);
	}
	return lut;
})();

/**
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-1)
 * @param {number} v - Value (0-1)
 * @returns {{r: number, g: number, b: number}}
 */
function hsvToRgb(h, s, v) {
	if (s === 1 && v >= 0 && v <= 1) {
		let hueIndex = Math.round(h) % 360;
		if (hueIndex < 0) hueIndex += 360;
		const base = HUE_LUT_FULL_SAT[hueIndex];
		return {
			r: Math.round(base.r * v),
			g: Math.round(base.g * v),
			b: Math.round(base.b * v)
		};
	}
	return hsvToRgbInternal(h, s, v);
}

module.exports = { hsvToRgb, hsvToRgbInternal };
