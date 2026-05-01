/**
 * FormPixSim - LED Display Simulator
 * Main application file with organized routes and middleware
 */

const express = require('express');
const http = require('http');

// Load application state
const state = require('./state');

// Import middleware
const checkConnection = require('./middleware/checkConnection');
const checkPermissions = require('./middleware/checkPermissions');
const validateQueryParams = require('./middleware/validateQueryParams');
const handle404 = require('./middleware/handle404');

// Import routes
const pixelRoutes = require('./routes/pixelRoutes');
const displayRoutes = require('./routes/displayRoutes');
const soundRoutes = require('./routes/soundRoutes');
const infoRoutes = require('./routes/infoRoutes');

// Import socket handlers
const { handleConnectError, handleConnect, handleSetClass, handleRequestClassUpdate } = require('./sockets/connectionHandlers');
const {
	handleHelpSound,
	handleBreakSound,
	handlePollSound,
	handleRemovePollSound,
	handleJoinSound,
	handleLeaveSound,
	handleKickStudentsSound,
	handleEndClassSound,
	handleTimerSound
} = require('./sockets/soundHandlers');
const { getRandomBootupSound, playSound } = require('./utils/soundUtils');
const { handleClassUpdate } = require('./sockets/pollHandlers');
const { handleVBTimer } = require('./sockets/timerHandlers');
const path = require('path');
const fs = require('fs');

// ============================================================================
// EXPRESS SETUP
// ============================================================================

const app = express();
const httpServer = http.createServer(app);
const webIo = require('socket.io')(httpServer);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/static'));
app.use('/sfx', express.static(__dirname + '/sfx'));


// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

/**
 * Render the current pixel buffer to all connected browser clients.
 * @returns {Promise<void>} Resolves when all socket emits are queued.
 */
async function renderToWebClients() {
	let sockets = await webIo.fetchSockets();
	for (let socket of sockets) {
		socket.emit('render', new Array(...state.pixels));
	}
}

/**
 * Render the simulator index page.
 * @param {import('express').Request} request - Express request object.
 * @param {import('express').Response} response - Express response object.
 * @returns {void}
 */
function renderIndexPage(request, response) {
	response.render('index', {
		config: state.config,
		BOARD_WIDTH: state.BOARD_WIDTH,
		BOARD_HEIGHT: state.BOARD_HEIGHT,
		pixels: state.pixels
	});
}

/**
 * Handle browser websocket client connections.
 * @param {{id?: string}} socket - Connected browser socket.
 * @returns {void}
 */
function handleBrowserConnection(socket) {
	console.log('Browser client connected');
	if (!bootupPlayed) {
		bootupPlayed = true;
		const bootupSound = getRandomBootupSound();
		playSound({ formbar: bootupSound.split('/').pop() });
	}
}

/**
 * Log server startup information.
 * @returns {Promise<void>} Resolves once startup logging is complete.
 */
async function onServerStarted() {
	console.log(`Server running on port: ${state.config.port}`);
}

// Store webIo in state for event handlers
state.webIo = webIo;
state.ws281x.render = renderToWebClients;

// Main page
app.get('/', renderIndexPage);

// API Routes
app.use('/api', checkConnection);
app.use('/api', checkPermissions);
app.use('/api', validateQueryParams);
app.use('/api', pixelRoutes);
app.use('/api', displayRoutes);
app.use('/api', soundRoutes(webIo));
app.use('/api', infoRoutes);

// Error handling
app.use(handle404);

// ============================================================================
// SOCKET.IO SETUP (WebSocket for browser clients)
// ============================================================================

let bootupPlayed = false;
webIo.on('connection', handleBrowserConnection);

// ============================================================================
// FORMBAR SOCKET.IO SETUP
// ============================================================================

const socket = state.socket;

// Connection events
socket.on('connect_error', handleConnectError(socket, state.boardIntervals));
socket.on('connect', handleConnect(socket, state.boardIntervals));
socket.on('setClass', handleSetClass(socket, state.boardIntervals));
socket.on('requestClassUpdate', handleRequestClassUpdate(socket));

// Sound events
socket.on('helpSound', handleHelpSound(webIo));
socket.on('breakSound', handleBreakSound(webIo));
socket.on('pollSound', handlePollSound(webIo));
socket.on('removePollSound', handleRemovePollSound(webIo));
socket.on('joinSound', handleJoinSound(webIo));
socket.on('leaveSound', handleLeaveSound(webIo));
socket.on('kickStudentsSound', handleKickStudentsSound(webIo));
socket.on('endClassSound', handleEndClassSound(webIo));
socket.on('timerSound', handleTimerSound(webIo));

// Poll and timer events
socket.on('classUpdate', handleClassUpdate(webIo));
socket.on('vbTimer', handleVBTimer());

// ============================================================================
// SERVER START
// ============================================================================

httpServer.listen(state.config.port, onServerStarted);