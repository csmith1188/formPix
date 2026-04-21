/**
 * Controllers for LED pixel routes
 */

const logger = require('../utils/logger');
const { textToHexColor } = require('../utils/colorUtils');
const { fill, gradient } = require('../utils/pixelOps');
const { getPixelNumber } = require('../utils/pixelUtils');
const raveController = require('./raveControllers');

/**
 * Helper function to cancel any ongoing rave animation
 * @returns {void}
 */
function cancelRave() {
	if (raveController.currentRaveInterval) {
		clearInterval(raveController.currentRaveInterval);
		raveController.currentRaveInterval = null;
	}
}

/**
 * POST /api/percentage - Fill a percentage of the LED strip with a color
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {void}
 */
function percentageController(req, res) {
	try {
		const { pixels, config, ws281x } = require('../state');

		let { percent, color } = req.query
		color = textToHexColor(color)
		percent = Number(percent)
		if (typeof color == 'string') {
			res.status(400).json({ error: color })
			return
		}
		if (color instanceof Error) throw color
		if (isNaN(percent) || percent < 0 || percent > 100) {
			res.status(400).json({ error: 'percent must be a number between 0 and 100' })
			return
		}
		let length = Math.floor((percent / 100) * pixels.length)
		fill(pixels, color, 0, length)
		ws281x.render()
		logger.info('Percentage fill completed', { percent, color: color.toString(16), length });
		res.status(200).json({ message: 'ok' })
	} catch (err) {
		logger.error('Error in percentageController', { error: err.message, stack: err.stack, query: req.query });
		res.status(500).json({ error: 'There was a server error try again' })
	}
}

/**	
 * POST /api/progress - Fill a progress bar on the LED strip
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */

let currentProgressInterval = null;


async function progressController(req, res) {
	try {
		const { pixels, config, ws281x } = require('../state');
		let {
			bg1,
			bg2,
			fg1,
			fg2,
			start = 0,
			length = config.barPixels,
			startingFill = 0,
			duration,
			easing = 'linear',
			interval = 50
		} = req.query;

		if (!bg1) {
			bg1 = '#000000';
		}

		if (!bg2) {
			bg2 = bg1;
		}

		if (!fg1) {
			fg1 = '#FFFFFF';
		}

		if (!fg2) {
			fg2 = fg1;
		}

		bg1 = textToHexColor(bg1);
		bg2 = textToHexColor(bg2);
		fg1 = textToHexColor(fg1);
		fg2 = textToHexColor(fg2);

		// Validate colors
		if (typeof bg1 == 'string') {
			res.status(400).json({ error: bg1 });
			return;
		}
		if (bg1 instanceof Error) throw bg1;

		if (typeof bg2 == 'string') {
			res.status(400).json({ error: bg2 });
			return;
		}
		if (bg2 instanceof Error) throw bg2;

		if (typeof fg1 == 'string') {
			res.status(400).json({ error: fg1 });
			return;
		}
		if (fg1 instanceof Error) throw fg1;

		if (typeof fg2 == 'string') {
			res.status(400).json({ error: fg2 });
			return;
		}
		if (fg2 instanceof Error) throw fg2;

		// Validate numeric parameters
		start = Number(start);
		length = Number(length);
		startingFill = Number(startingFill);
		interval = Number(interval);

		if (isNaN(start) || !Number.isInteger(start)) {
			res.status(400).json({ error: 'start must be an integer' });
			return;
		}
		if (isNaN(length) || !Number.isInteger(length)) {
			res.status(400).json({ error: 'length must be an integer' });
			return;
		}
		if (isNaN(startingFill) || startingFill < 0 || startingFill > 100) {
			res.status(400).json({ error: 'startingFill must be a number between 0 and 100' });
			return;
		}

		// Validate duration if provided
		if (duration !== undefined) {
			duration = Number(duration);
			if (isNaN(duration) || duration <= 0) {
				res.status(400).json({ error: 'duration must be a positive number' });
				return;
			}
		}

		// Cancel any existing progress animation
		if (currentProgressInterval) {
			clearInterval(currentProgressInterval);
			currentProgressInterval = null;
		}

		// Clear the bar section before starting animation
		fill(pixels, 0x000000, start, length);
		ws281x.render();

		animateProgress(start, length, startingFill, duration, interval, bg1, bg2, fg1, fg2);

		res.status(200).json({ message: 'ok' });
	} catch (err) {
		res.status(500).json({ error: 'There was a server error try again' });
	}
}

/**
 * @typedef {Object} RgbObject
 * @property {number} r
 * @property {number} g
 * @property {number} b
 */

/**
 * Animate the progress bar from startingFill to 100%
 * @param {number} start - Starting pixel index.
 * @param {number} length - Number of pixels in the progress segment.
 * @param {number} startingFill - Initial fill percentage from 0 to 100.
 * @param {number|undefined} duration - Animation duration in milliseconds.
 * @param {number} interval - Frame interval in milliseconds.
 * @param {number} bg1 - Background start color.
 * @param {number} bg2 - Background end color.
 * @param {number} fg1 - Foreground start color.
 * @param {number} fg2 - Foreground end color.
 * @returns {void}
 */
function animateProgress(start, length, startingFill, duration, interval, bg1, bg2, fg1, fg2) {
	const { pixels, ws281x } = require('../state');
	const { hexToRgb, rgbToHex } = require('../utils/colorUtils');

	if (start < 0) start = 0;
	if (start >= pixels.length) return;
	if (start + length > pixels.length) length = pixels.length - start;

	const fg1Rgb = hexToRgb(fg1);
	const fg2Rgb = hexToRgb(fg2);
	const fgGradientColors = new Uint32Array(length);
	const bgGradientColors = new Uint32Array(length);
	const stepColor = length > 1 ? fg1Rgb.map((c, i) => (fg2Rgb[i] - c) / (length - 1)) : [0, 0, 0];
	
	for (let i = 0; i < length; i++) {
		fgGradientColors[i] = rgbToHex([
			Math.round(fg1Rgb[0] + stepColor[0] * i),
			Math.round(fg1Rgb[1] + stepColor[1] * i),
			Math.round(fg1Rgb[2] + stepColor[2] * i)
		]);
	}
	gradient(bgGradientColors, bg1, bg2, 0, length);

	if (duration === undefined) {
		//fills the bar if no duration is provided
		pixels.set(bgGradientColors, start);
		for (let i = 0; i < length; i++) {
			pixels[start + i] = fgGradientColors[i];
		}
		ws281x.render();
		return;
	}

	const startTime = Date.now();
	const startPercent = startingFill;
	const endPercent = 100;

	currentProgressInterval = setInterval(() => {
		const elapsed = Date.now() - startTime;
		const progress = Math.min(elapsed / duration, 1);

		// Apply easing (linear for now, can add more later)
		const easedProgress = progress;

		// Calculate current fill percentage
		const currentPercent = startPercent + (endPercent - startPercent) * easedProgress;
		const fillLength = Math.floor((currentPercent / 100) * length);

		// Draw background gradient
		pixels.set(bgGradientColors, start);

		// Draw foreground using pre-calculated gradient colors (reveals the gradient as it fills)
		for (let i = 0; i < fillLength; i++) {
			pixels[start + i] = fgGradientColors[i];
		}

		ws281x.render();

		// Stop when animation is complete
		if (progress >= 1) {
			clearInterval(currentProgressInterval);
			currentProgressInterval = null;
		}
	}, interval);
}

/**
 * POST /api/fillByPercent - Fill a percentage of the LED strip with a fill color and background color
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
async function fillByPercentController(req, res) {
	try {
		const { pixels, config, ws281x } = require('../state');

		let { percent, fillColor, bgColor, length = config.barPixels } = req.query;

		fillColor = textToHexColor(fillColor);
		bgColor = textToHexColor(bgColor);

		// Validate fill colors
		if (typeof fillColor == 'string') {
			res.status(400).json({ error: fillColor });
			return;
		}
		if (fillColor instanceof Error) throw fillColor;

		if (typeof bgColor == 'string') {
			res.status(400).json({ error: bgColor });
			return;
		}
		if (bgColor instanceof Error) throw bgColor;

		// Validate percent
		percent = Number(percent);
		if (isNaN(percent) || percent < 0 || percent > 100) {
			res.status(400).json({ error: 'percent must be a number between 0 and 100' });
			return;
		}

		// Validate length
		length = Number(length);
		if (isNaN(length) || !Number.isInteger(length)) {
			res.status(400).json({ error: 'length must be an integer' });
			return;
		}

		// Use only the barPixels strip which starts at 0
		const startPos = 0;
		const stripLength = config.barPixels;

		// Make sure to clear the strip
		fill(pixels, 0x000000, startPos, stripLength);

		length = Math.min(length, stripLength);

		// Calculate length based on percent given
		let fillLength = Math.floor((percent / 100) * length);

		// Fill the strip
		fill(pixels, bgColor, startPos, length);
		fill(pixels, fillColor, startPos, fillLength);

		ws281x.render();
		logger.info('Fill by percent completed', { percent, fillColor: fillColor.toString(16), bgColor: bgColor.toString(16), length });
		res.status(200).json({ message: 'ok' });
	} catch (err) {
		logger.error('Error in fillByPercentController', { error: err.message, stack: err.stack, query: req.query });
		res.status(500).json({ error: 'There was a server error try again' });
	}
}

/**
 * POST /api/fill - Fill LED strip with a color
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
async function fillController(req, res) {
	try {
		const { pixels, config, ws281x } = require('../state');

		let { color, start = 0, length = config.barPixels } = req.query

		color = textToHexColor(color)

		if (typeof color == 'string') {
			res.status(400).json({ error: color })
			return
		}
		if (color instanceof Error) throw color

		if (isNaN(start) || !Number.isInteger(Number(start))) {
			res.status(400).json({ error: 'start must be an integer' })
			return
		}
		if (isNaN(length) || !Number.isInteger(Number(length))) {
			res.status(400).json({ error: 'length must be an integer' })
			return
		}

		start = Number(start)
		length = Number(length)

		const barLength = config.barPixels;
		if (start < 0) start = 0;
		if (start >= barLength) {
			res.status(400).json({ error: 'start must be within barPixels' });
			return;
		}
		if (length < 0) length = 0;
		if (start + length > barLength) {
			length = barLength - start;
		}

		fill(pixels, color, start, length)
		ws281x.render()
		logger.info('Fill completed', { color: color.toString(16), start, length });
		res.status(200).json({ message: 'ok' })
	} catch (err) {
		logger.error('Error in fillController', { error: err.message, stack: err.stack, query: req.query });
		res.status(500).json({ error: 'There was a server error try again' })
	}
}

/**
 * POST /api/gradient - Fill LED strip with a gradient
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
async function gradientController(req, res) {
	try {
		const { pixels, config, ws281x } = require('../state');

		let { startColor, endColor, start = 0, length = pixels.length } = req.query

		if (!startColor) {
			res.status(400).json({ error: 'missing startColor' })
			return
		}
		if (!endColor) {
			res.status(400).json({ error: 'missing endColor' })
			return
		}

		startColor = textToHexColor(startColor)

		if (typeof startColor == 'string') {
			res.status(400).json({ error: startColor })
			return
		}
		if (startColor instanceof Error) throw startColor

		endColor = textToHexColor(endColor)

		if (typeof endColor == 'string') {
			res.status(400).json({ error: endColor })
			return
		}
		if (endColor instanceof Error) throw endColor

		if (isNaN(start) || !Number.isInteger(Number(start))) {
			res.status(400).json({ error: 'start must be an integer' })
			return
		}
		if (isNaN(length) || !Number.isInteger(Number(length))) {
			res.status(400).json({ error: 'length must be an integer' })
			return
		}

		start = Number(start)
		length = Number(length)

		gradient(pixels, startColor, endColor, start, length)
		ws281x.render()
		logger.info('Gradient completed', { startColor: startColor.toString(16), endColor: endColor.toString(16), start, length });
		res.status(200).json({ message: 'ok' })
	} catch (err) {
		logger.error('Error in gradientController', { error: err.message, stack: err.stack, query: req.query });
		res.status(500).json({ error: 'There was a server error try again' })
	}
}

/**
 * POST /api/setPixel - Set a single pixel color
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
async function setPixelController(req, res) {
	try {
		const { pixels, config, ws281x } = require('../state');

		let { pixel, color } = req.query

		color = textToHexColor(color)

		if (typeof color == 'string') {
			res.status(400).json({ error: color })
			return
		}
		if (color instanceof Error) throw color

		let pixelNumber = getPixelNumber(pixel, config.barPixels, config.boards)

		if (typeof pixelNumber == 'string') {
			res.status(400).json({ error: pixelNumber })
			return
		}
		if (pixelNumber instanceof Error) throw pixelNumber

		pixels[pixelNumber] = color

		ws281x.render()

		logger.info('Set pixel completed', { pixel, pixelNumber, color: color.toString(16) });
		res.status(200).json({ message: 'ok' })
	} catch (err) {
		logger.error('Error in setPixelController', { error: err.message, stack: err.stack, query: req.query });
		res.status(500).json({ error: 'There was a server error try again' })
	}
}

/**
 * POST /api/setPixels - Set multiple pixel colors
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
async function setPixelsController(req, res) {
	try {
		const { pixels, config, ws281x } = require('../state');
		const { safeJsonParse } = require('../utils/colorUtils');

		let inputPixels = req.query.pixels
		let tempPixels = structuredClone(pixels)

		if (!inputPixels) {
			res.status(400).json({ error: 'You did not provide any pixels' })
			return
		}
		
		inputPixels = safeJsonParse(inputPixels)

		if (typeof inputPixels == 'string') {
			res.status(400).json({ error: inputPixels })
			return
		}
		if (inputPixels instanceof Error) throw inputPixels

		for (let inputPixel of inputPixels) {
			let color = textToHexColor(inputPixel.color)
			let pixelNumber

			if (typeof color == 'string') {
				res.status(400).json({ error: color })
				return
			}
			if (color instanceof Error) throw color

			pixelNumber = getPixelNumber(inputPixel.pixelNumber, config.barPixels, config.boards)

			if (typeof pixelNumber == 'string') {
				res.status(400).json({ error: pixelNumber })
				return
			}
			if (pixelNumber instanceof Error) throw pixelNumber

			tempPixels[pixelNumber] = color
		}

		pixels.set(tempPixels)

		ws281x.render()

		logger.info('Set pixels completed', { count: inputPixels.length });
		res.status(200).json({ message: 'ok' })
	} catch (err) {
		logger.error('Error in setPixelsController', { error: err.message, stack: err.stack, query: req.query });
		res.status(500).json({ error: 'There was a server error try again' })
	}
}

/**
 * Stop any active progress animation
 */
function stopProgressAnimation() {
	if (currentProgressInterval) {
		clearInterval(currentProgressInterval);
		currentProgressInterval = null;
	}
}

module.exports = {
	fillController,
	fillByPercentController,
	gradientController,
	setPixelController,
	setPixelsController,
	progressController,
	currentProgressInterval,
	stopProgressAnimation
};