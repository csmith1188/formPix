/**
 * Display and text rendering functions for simulation
 */

const { letters } = require ('../letters');
const { fill } = require('./pixelOps');

const PIXELS_PER_LETTER = 5;
const BOARD_HEIGHT = 8;

/**
 * Shows a string on the board
 * @param {Array} boardPixels - The board pixels
 * @param {number} startFrame - Starting frame
 * @param {number} textColor - Text color in hex
 * @param {number} backgroundColor - Background color in hex
 * @param {number} startPixel - Starting pixel index
 * @param {number} endPixel - Ending pixel index
 * @param {Uint32Array} pixels - The pixels array
 */
function showString(boardPixels, startFrame, textColor, backgroundColor, pixels, startPixel, endPixel) {
	let currentPixel = startPixel;
	let currentColumn = startFrame;
	const maxColumns = boardPixels.length;

	// Render pixel columns starting from startFrame, wrapping around if needed
	for (let i = 0; i < maxColumns; i++) {
		const colIndex = currentColumn;
		const col = boardPixels[colIndex];
		const reverse = (startFrame % 2 === colIndex % 2);

		for (let row = 0; row < BOARD_HEIGHT; row++) {
			const sourceRow = reverse ? (BOARD_HEIGHT - 1 - row) : row;
			const pixelOn = col[sourceRow];
			pixels[currentPixel] = pixelOn ? textColor : backgroundColor;
			currentPixel++;

			if (currentPixel >= endPixel) return;
		}
		currentColumn = (currentColumn + 1) % maxColumns;
	}
}

/**
 * Calculates the length of a string column
 * @param {string} text - The input text.
 * @returns {number} The amount of columns in the string.
 */
function getStringColumnLength(text) {
	// Each letter takes PIXELS_PER_LETTER columns plus one for spacing
	return (text.length * (PIXELS_PER_LETTER + 1))
}

/**
 * Display a string on a LED board.
 * @param {Uint32Array} pixels - The pixels array
 * @param {string} string - The string to display.
 * @param {number} textColor - The color of the text.
 * @param {number} backgroundColor - The color of the background.
 * @param {Object} config - Configuration object
 * @param {Array} boardIntervals - Array of active board intervals
 * @param {Object} ws281x - WebSocket renderer object
 * @param {number} [startColumn=0] - The starting column to display the string.
 * @param {number} [endColumn] - The ending column to display the string.
 * @param {number} [scroll=100] - The speed of scrolling in milliseconds.
 */
function displayBoard(pixels, string, textColor, backgroundColor, config, boardIntervals, ws281x, startColumn = 0, endColumn = null, scroll = 100) {
	if (endColumn === null) {
		endColumn = config.boards * 32;
	}

	let stringColumnLength = getStringColumnLength(string);

	let startPixel = config.barPixels + startColumn * BOARD_HEIGHT

	if (stringColumnLength + startColumn < endColumn)
		endColumn = stringColumnLength + startColumn

	let endPixel = config.barPixels + endColumn * BOARD_HEIGHT

	let boardPixels = [Array(8).fill(0)];
	const buildBoardPixels = () => {
		let builtPixels = [Array(8).fill(0)];

		for (let letter of string) {
			if (!letters[letter]) continue

			let letterImage = letters[letter].map(arr => arr.slice());
			for (let col of letterImage) {
				builtPixels.push(col);
			}

			const unspacedLetters = ['\u266A', '\u26CA', '\u26C9'];
			if (!unspacedLetters.includes(letter)) builtPixels.push(Array(8).fill(0));
		}

		return builtPixels;
	}
	const isStaticDisplay = stringColumnLength <= endColumn - startColumn;

	for (let boardInterval of boardIntervals) {
		if (!boardInterval) continue

		if (
			string == boardInterval.string &&
			startColumn == boardInterval.startColumn &&
			endColumn == boardInterval.endColumn &&
			textColor == boardInterval.textColor &&
			backgroundColor == boardInterval.backgroundColor &&
			scroll == boardInterval.scroll
		) {
			// Static displays need repaint when callers clear board pixels before calling displayBoard.
			if (!boardInterval.interval && isStaticDisplay) {
				showString(buildBoardPixels(), 0, textColor, backgroundColor, pixels, startPixel, endPixel);
				ws281x.render();
			}
			return
		}
	}

	// Clear overlapping intervals by mutating the array in place
	for (let i = boardIntervals.length - 1; i >= 0; i--) {
		let boardInterval = boardIntervals[i];
		if (
			startColumn < boardInterval.endColumn &&
			endColumn > boardInterval.startColumn
		) {
			clearInterval(boardInterval.interval);
			// Clear the pixels this interval was controlling
			if (boardInterval.startPixel !== undefined && boardInterval.endPixel !== undefined) {
				fill(pixels, 0x000000, boardInterval.startPixel, boardInterval.endPixel - boardInterval.startPixel);
			}
			boardIntervals.splice(i, 1);
		}
	}

	boardPixels = buildBoardPixels();

	if (boardPixels.length - 1 <= endColumn - startColumn) {
		showString(boardPixels, 0, textColor, backgroundColor, pixels, startPixel, endPixel);
		ws281x.render();

		return {
			string,
			startColumn,
			endColumn,
			startPixel,
			endPixel,
			textColor,
			backgroundColor,
			scroll
		}
	} else {
		for (let i = 0; i < 2 * 6 + 1; i++) {
			boardPixels.unshift([0, 0, 0, 0, 0, 0, 0, 0]);
		}

		let startFrame = 0;
		let lastFrameTime = Date.now();

		return {
			string,
			interval: setInterval(() => {
				const now = Date.now();
				let delta = now - lastFrameTime;
				lastFrameTime = now;
				if (!delta || delta < 0) delta = scroll;
				const frameStep = Math.max(1, Math.round(delta / scroll));

				showString(boardPixels, startFrame, textColor, backgroundColor, pixels, startPixel, endPixel);
				startFrame = (startFrame + frameStep) % boardPixels.length;
				ws281x.render();
			}, scroll),
			startColumn,
			endColumn,
			startPixel,
			endPixel,
			textColor,
			backgroundColor,
			scroll
		}
	}
}

module.exports = {
	showString,
	getStringColumnLength,
	displayBoard
};
