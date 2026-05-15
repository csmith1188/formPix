/**
 * Global application state
 */

const fs = require('fs');
const ws281x = require('rpi-ws281x-native');
const { loadSounds } = require('./utils/soundUtils');
const env = require('dotenv');
const { io } = require('socket.io-client');
env.config();

/**
 * Seconds of no /api or Formbar socket activity before the idle bar animation. Unset → 300 (5 min); 0 → disabled.
 * Env: idleTimeoutSeconds or IDLE_TIMEOUT_SECONDS.
 * @returns {number} whole seconds (0 = off)
 */
function parseIdleTimeoutSeconds() {
	const raw = process.env.idleTimeoutSeconds ?? process.env.IDLE_TIMEOUT_SECONDS;
	if (raw === undefined || String(raw).trim() === '') {
		return 300;
	}
	const s = parseInt(String(raw).trim(), 10);
	if (!Number.isFinite(s)) {
		return 300;
	}
	if (s <= 0) {
		return 0;
	}
	return s;
}

const idleTimeoutSeconds = parseIdleTimeoutSeconds();

// Load config from the .env
const config = {
    formbarUrl: process.env.formbarUrl || '',
    api: process.env.api || '',
    brightness: parseInt(process.env.brightness) || 0,
    pin: parseInt(process.env.pin) || 0,
    stripType: process.env.stripType || 'WS2812',
    barPixels: parseInt(process.env.barPixels) || 0,
    boards: parseInt(process.env.boards) || 0,
    port: parseInt(process.env.port) || 421,
    irPin: process.env.irPin ? parseInt(process.env.irPin) : -1,
    idleTimeoutSeconds,
    idleTimeoutMs: idleTimeoutSeconds > 0 ? idleTimeoutSeconds * 1000 : 0
};

// Constants
const BOARD_WIDTH = 32;
const BOARD_HEIGHT = 8;
const REQUIRED_PERMISSION = 'auxiliary';

// Initialize strip
const maxPixels = config.barPixels + config.boards * BOARD_WIDTH * BOARD_HEIGHT;
let strip = ws281x(maxPixels, {
	dma: 10,
	freq: 800000,
	gpio: config.pin,
	invert: false,
	brightness: config.brightness,
	stripType: ws281x.stripType[config.stripType]
});

// Clear pixels
let pixels = strip.array;
for (let i = 0; i < pixels.length; i++) {
	pixels[i] = 0x000000;
}
ws281x.render();

// Initialize socket.io client connection to formbar
const socket = io(config.formbarUrl, {
	extraHeaders: {
		api: config.api
	}
});

// Initialize folders if not found
if (!fs.existsSync('sfx')) {
	fs.mkdirSync('sfx');
}
if (!fs.existsSync('sfx/formbarSFX')) {
	fs.mkdirSync('sfx/formbarSFX');
}
if (!fs.existsSync('sfx/memeSFX')) {
	fs.mkdirSync('sfx/memeSFX');
}

// State
let state = {
	config,
	pixels,
	ws281x,
	connected: false,
	socket,
	classId: null,
	pollData: {},
	pollLockActive: false,
	boardIntervals: [],
	currentDisplayMessage: null,
	lastDisplayUpdate: null,
	lastDisplaySentById: null,
	lastDisplaySentByEmail: null,
	timerData: {
		startTime: 0,
		timeLeft: 0,
		active: false,
		sound: false
	},
	sounds: loadSounds(),
	isPlayingSound: false,
	/** @type {ReturnType<typeof setTimeout> | null} */
	idleDeadlineTimer: null,
	/** @type {ReturnType<typeof setInterval> | null} */
	idleAnimationInterval: null,
	/** @type {{ tick: number, zones: Array<{ hueOffset: number, hueSpeed: number }>, hueNoise: number[], numLeds: number } | null} */
	idleAnimContext: null,
	BOARD_WIDTH,
	BOARD_HEIGHT,
	REQUIRED_PERMISSION
};

module.exports = state;