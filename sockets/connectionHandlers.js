/**
 * Socket connection handlers
 */

const { fill, gradient } = require('../utils/pixelOps');
const { displayBoard, getStringColumnLength } = require('../utils/displayUtils');
const state = require('../state');
const logger = require('../utils/logger');

/**
 * @typedef {{ interval?: ReturnType<typeof setInterval> }} BoardInterval
 * @typedef {{ message?: string }} SocketError
 * @typedef {{ connect: () => void, emit: (event: string, payload?: unknown) => void }} ClientSocket
 */


/**
 * Handle connection error
 * @param {ClientSocket} socket User socket instance
 * @param {BoardInterval[]} boardIntervals Display interval records for the board
 * @returns {(error: SocketError) => void} Connection error callback
 */
function handleConnectError(socket, boardIntervals) {
	return (error) => {
		if (error.message == 'xhr poll error') logger.debug('No connection - retrying');
		else logger.warn(`Socket connection error: ${error.message}`);

		state.connected = false

		boardIntervals = boardIntervals.filter(boardInterval => {
			clearInterval(boardInterval.interval);
			return false
		})

		if (!isTransientPollTransportError) {
			const { pixels, config, ws281x } = state;
			fill(pixels, 0x000000)
			ws281x.render()
		}

		setTimeout(() => {
			socket.connect()
		}, 5000)
	}
}

/**
 * Handle connect
 * @param {ClientSocket} socket User socket instance
 * @param {BoardInterval[]} boardIntervals Display interval records for the board
 * @returns {() => void} Connect event callback
 */
function handleConnect(socket, boardIntervals) {
	return () => {

		state.connected = true

		socket.emit('getActiveClass', state.config.api);

		const { pixels, config, ws281x } = state;
		let display = displayBoard(pixels, config.formbarUrl.split('://')[1], 0xFFFFFF, 0x000000, config, boardIntervals, ws281x, 0, null, 100)
		if (!display) return
		boardIntervals.push(display)	
	// Set timestamp for default message display
	state.lastDisplayUpdate = new Date().toISOString();	}
}

/**
 * Request active class update
 * @param {ClientSocket} socket User socket instance
 * @returns {() => void} Class update request callback
 */
function handleRequestClassUpdate(socket) {
	return () => {
		socket.emit('getActiveClass', state.config.api);
	}
}


/**
 * Handle set class
 * @param {ClientSocket} socket User socket instance
 * @param {BoardInterval[]} boardIntervals Display interval records for the board
 * @returns {(userClassId: string | null | undefined) => void} Set class callback
 */
function handleSetClass(socket, boardIntervals) {
	return (userClassId) => {
		state.connected = true

		if (userClassId == null) {
			const { pixels, config, ws281x } = state;
			fill(pixels, 0x000000, 0, config.barPixels)

			logger.info('No active class - cleared display');

			let display = displayBoard(pixels, config.formbarUrl.split('://')[1], 0xFFFFFF, 0x000000, config, boardIntervals, ws281x, 0, null, 100)
			if (!display) return
			boardIntervals.push(display)

			ws281x.render()
		} else {
			logger.debug(`Class update received - New class ID: ${userClassId}`);
			socket.emit('classUpdate')
			socket.emit('vbTimer')
		}

		state.classId = userClassId;
	}
}

module.exports = {
	handleConnectError,
	handleConnect,
	handleSetClass,
	handleRequestClassUpdate
};