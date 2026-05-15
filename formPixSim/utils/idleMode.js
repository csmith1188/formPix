/**
 * Automatic idle bar animation after a period with no FormPix "activity":
 * HTTP `/api` requests (see middleware) and incoming Formbar Socket.IO events
 * both call the same bump (exit idle + reschedule deadline).
 */

const { hsvToRgb } = require('./hsv');
const { fill } = require('./pixelOps');

const TICK_MS = 20;
const NUM_ZONES = 8;
const MIN_BRIGHTNESS = 0.35;
const WAVE1_SPATIAL = 6;
const WAVE1_SPEED = 0.12;
const WAVE2_SPATIAL = 4;
const WAVE2_SPEED = -0.07;
const BEAT_PERIOD = 100;

/** Server→client events that should not reset idle (noisy / not real Formbar activity). */
const SOCKET_EVENTS_IGNORED_FOR_IDLE = new Set(['connect_error']);

let idleInterval = null;
let idleDeadlineTimer = null;

/** @type {{ tick: number, zones: Array<{ hueOffset: number, hueSpeed: number }>, hueNoise: number[], numLeds: number } | null} */
let idleAnimState = null;

/**
 * @param {number} numLeds
 */
function createIdleAnimState(numLeds) {
	const zones = Array.from({ length: NUM_ZONES }, (_, i) => ({
		hueOffset: i * (360 / NUM_ZONES),
		hueSpeed: 2.5 + (i % 2 === 0 ? 1.5 : -1.0)
	}));
	const hueNoise = Array.from({ length: numLeds }, () => (Math.random() - 0.5) * 40);
	return { tick: 0, zones, hueNoise, numLeds };
}

/**
 * One animation frame for the idle bar strip (indices 0 .. barPixels - 1 only).
 */
function idle() {
	const ctx = idleAnimState;
	if (!ctx) return;

	const state = require('../state');
	const { pixels, config, ws281x } = state;
	const numLeds = Math.min(ctx.numLeds, config.barPixels);
	if (numLeds <= 0) return;

	const zoneSize = Math.max(1, Math.floor(numLeds / NUM_ZONES));
	const { tick, zones, hueNoise } = ctx;

	const beatPhase = (tick % BEAT_PERIOD) / BEAT_PERIOD;
	const beatEnvelope = beatPhase < 0.125
		? beatPhase / 0.125
		: 1 - ((beatPhase - 0.125) / 0.875);
	const globalBrightness = MIN_BRIGHTNESS + (1 - MIN_BRIGHTNESS) * beatEnvelope;

	for (let i = 0; i < numLeds; i++) {
		const zoneIndex = Math.min(Math.floor(i / zoneSize), NUM_ZONES - 1);
		const zone = zones[zoneIndex];

		const hue = (zone.hueOffset + tick * zone.hueSpeed + hueNoise[i] + i * 0.8) % 360;

		const wave1 = Math.sin(i * (Math.PI * 2 * WAVE1_SPATIAL / numLeds) + tick * WAVE1_SPEED);
		const wave2 = Math.sin(i * (Math.PI * 2 * WAVE2_SPATIAL / numLeds) + tick * WAVE2_SPEED);
		const spatialBrightness = 0.65 + 0.35 * ((wave1 + wave2) / 2);

		const v = Math.min(1, globalBrightness * spatialBrightness);
		const rgb = hsvToRgb((hue + 360) % 360, 1, v);
		pixels[i] = (rgb.r << 16) | (rgb.g << 8) | rgb.b;
	}

	zones.forEach(z => {
		z.hueOffset = (z.hueOffset + z.hueSpeed) % 360;
	});

	ctx.tick++;
	ws281x.render();
}

function stopCompetingAnimations() {
	const raveModule = require('../controllers/raveControllers');
	if (raveModule.currentRaveInterval) {
		clearInterval(raveModule.currentRaveInterval);
		raveModule.currentRaveInterval = null;
	}
	const progressModule = require('../controllers/pixelControllers');
	if (progressModule.currentProgressInterval) {
		clearInterval(progressModule.currentProgressInterval);
		progressModule.currentProgressInterval = null;
	}
}

function scheduleNextIdleDeadline() {
	if (idleDeadlineTimer) {
		clearTimeout(idleDeadlineTimer);
		idleDeadlineTimer = null;
	}
	const { config } = require('../state');
	if (config.idleTimeoutMs <= 0 || config.barPixels <= 0) return;

	idleDeadlineTimer = setTimeout(() => {
		idleDeadlineTimer = null;
		enterIdle();
	}, config.idleTimeoutMs);
}

function enterIdle() {
	const { config } = require('../state');
	if (config.idleTimeoutMs <= 0 || config.barPixels <= 0) return;
	if (idleInterval) return;

	stopCompetingAnimations();
	idleAnimState = createIdleAnimState(config.barPixels);
	idleInterval = setInterval(idle, TICK_MS);
}

function exitIdleIfActive() {
	if (!idleInterval) return;
	clearInterval(idleInterval);
	idleInterval = null;
	idleAnimState = null;

	const state = require('../state');
	const { pixels, config, ws281x } = state;
	fill(pixels, 0x000000, 0, config.barPixels);
	ws281x.render();
}

function bumpActivity() {
	if (idleDeadlineTimer) {
		clearTimeout(idleDeadlineTimer);
		idleDeadlineTimer = null;
	}
	exitIdleIfActive();
	scheduleNextIdleDeadline();
}

/** @deprecated Use bumpActivity; kept for callers that name HTTP explicitly. */
const bumpApiActivity = bumpActivity;

/**
 * When Formbar emits to this Socket.IO client, treat it like `/api` traffic for idle purposes.
 * @param {{ onAny?: (fn: (eventName: string, ...args: unknown[]) => void) => void }} socket
 */
function registerFormbarSocketIdleReset(socket) {
	if (!socket || typeof socket.onAny !== 'function') return;
	socket.onAny((eventName) => {
		if (SOCKET_EVENTS_IGNORED_FOR_IDLE.has(eventName)) return;
		bumpActivity();
	});
}

function initIdleMode() {
	scheduleNextIdleDeadline();
}

module.exports = {
	idle,
	initIdleMode,
	bumpActivity,
	bumpApiActivity,
	registerFormbarSocketIdleReset,
	exitIdleIfActive,
	enterIdle
};
