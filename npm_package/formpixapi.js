var FORM_PIX_URL = 'http://localhost:3000';
var API_KEY = null;

function getPostOptions() {
	return {
		method: 'POST',
		headers: {
			'API': API_KEY,
			'Content-Type': 'application/json'
		}
	};
}

function getGetOptions() {
	return {
		method: 'GET',
		headers: {
			'API': API_KEY,
			'Content-Type': 'application/json'
		}
	};
}

function login(url, key) {
	FORM_PIX_URL = url;
	API_KEY = key;
}

function sendCommand(command, params, options) {
	return fetch(`${FORM_PIX_URL}/api/${command}?${params}`, options)
		.then((response) => {
			return response.json();
		})
		.then((data) => {
			return data;
		})
		.catch((err) => {
			if (err) console.log('connection closed due to errors:', err);
		});
}

function fill(color, start, length) {
	let params = new URLSearchParams({
		color: color,
		start: start,
		length: length
	}).toString();

	return sendCommand('fill', params, getPostOptions());
}

function fillByPercent(percent, fillColor, bgColor, length) {
	let paramObj = {
		percent: percent,
		fillColor: fillColor,
		bgColor: bgColor
	};
	if (length !== undefined) paramObj.length = length;

	let params = new URLSearchParams(paramObj).toString();
	return sendCommand('fillByPercent', params, getPostOptions());
}

function gradient(startColor, endColor, start, length) {
	let params = new URLSearchParams({
		startColor: startColor,
		endColor: endColor,
		start: start,
		length: length
	}).toString();

	return sendCommand('gradient', params, getPostOptions());
}

function setPixel(pixel, color) {
	let params = new URLSearchParams({
		pixel: pixel,
		color: color
	}).toString();

	return sendCommand('setPixel', params, getPostOptions());
}

function setPixels(pixels) {
	let params = new URLSearchParams({
		pixels: JSON.stringify(pixels)
	}).toString();

	return sendCommand('setPixels', params, getPostOptions());
}

function progress(options) {
	let paramObj = {};
	if (options.bg1 !== undefined) paramObj.bg1 = options.bg1;
	if (options.bg2 !== undefined) paramObj.bg2 = options.bg2;
	if (options.fg1 !== undefined) paramObj.fg1 = options.fg1;
	if (options.fg2 !== undefined) paramObj.fg2 = options.fg2;
	if (options.start !== undefined) paramObj.start = options.start;
	if (options.length !== undefined) paramObj.length = options.length;
	if (options.startingFill !== undefined) paramObj.startingFill = options.startingFill;
	if (options.duration !== undefined) paramObj.duration = options.duration;
	if (options.easing !== undefined) paramObj.easing = options.easing;
	if (options.interval !== undefined) paramObj.interval = options.interval;

	let params = new URLSearchParams(paramObj).toString();
	return sendCommand('progress', params, getPostOptions());
}

function rave(options = {}) {
	let paramObj = {};
	if (options.speed !== undefined) paramObj.speed = options.speed;
	if (options.mode !== undefined) paramObj.mode = options.mode;
	if (options.intensity !== undefined) paramObj.intensity = options.intensity;
	if (options.bpm !== undefined) paramObj.bpm = options.bpm;

	let params = new URLSearchParams(paramObj).toString();
	return sendCommand('rave', params, getPostOptions());
}

function raveStop() {
	return sendCommand('rave/stop', '', getPostOptions());
}

function say(text, color, bgcolor, scroll) {
	let paramObj = {
		text: text,
		textColor: color,
		backgroundColor: bgcolor
	};
	if (scroll !== undefined) paramObj.scroll = scroll;

	let params = new URLSearchParams(paramObj).toString();
	return sendCommand('say', params, getPostOptions());
}

function getDisplay() {
	return sendCommand('getDisplay', '', getGetOptions());
}

function getSounds(type) {
	let paramObj = {};
	if (type !== undefined) paramObj.type = type;

	let params = new URLSearchParams(paramObj).toString();
	return sendCommand('getSounds', params, getGetOptions());
}

function playSound(formbar, meme) {
	let paramObj = {};
	if (formbar !== undefined) paramObj.formbar = formbar;
	if (meme !== undefined) paramObj.meme = meme;

	let params = new URLSearchParams(paramObj).toString();
	return sendCommand('playSound', params, getPostOptions());
}

module.exports = {
	login, fill, fillByPercent, gradient, setPixel, setPixels,
	progress, rave, raveStop, say, getDisplay, getSounds, playSound
};