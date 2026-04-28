/**
 * Global application state
 */

const fs = require('fs');

/**
 * Create a mock LED strip object for simulation.
 * @param {number} numPixels - Number of pixels to allocate.
 * @returns {{array: Uint32Array}} Mock strip object.
 */
function createMockStrip(numPixels) {
	return { array: new Uint32Array(numPixels) };
}

/**
 * Resolve strip type key from proxy access.
 * @param {Record<string, string>} _target - Proxy target object.
 * @param {string|symbol} key - Accessed property key.
 * @returns {string|symbol} Same key for compatibility with callers.
 */
function getMockStripType(_target, key) {
	return key;
}

/**
 * No-op render function used by simulator state before app wires websocket rendering.
 * @returns {void}
 */
function noopRender() { }

// Mock rpi-ws281x-native for the simulator environment
const ws281x = Object.assign(
	createMockStrip,
	{
		stripType: new Proxy({}, { get: getMockStripType }),
		render: noopRender
	}
);

const { loadSounds } = require('./utils/soundUtils');
const env = require('dotenv');
const { io } = require('socket.io-client');
env.config();


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
	irPin: process.env.irPin ? parseInt(process.env.irPin) : -1
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
	timerData: {
		startTime: 0,
		timeLeft: 0,
		active: false,
		sound: false
	},
	sounds: loadSounds(),
	BOARD_WIDTH,
	BOARD_HEIGHT,
	REQUIRED_PERMISSION
};

module.exports = state;