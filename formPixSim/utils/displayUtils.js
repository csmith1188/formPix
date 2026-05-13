/**
 * Display and text rendering functions for simulation
 */

const { letters } = require ('../../letters');
const { fill } = require('./pixelOps');

const PIXELS_PER_LETTER = 5;
const BOARD_HEIGHT = 8;
const boardPixelCache = new Map();

/**
 * Build (or fetch from cache) pixel columns for a rendered string.
 * @param {string} string - Text to convert into board pixel columns.
 * @returns {number[][]} Pixel columns where each column has 8 rows.
 */
function getBoardPixelsForString(string) {
	let cached = boardPixelCache.get(string);
	if (cached) return cached;

	const builtPixels = [Array(8).fill(0)];
	// Build pixel columns for each letter, adding spacing between letters
	for (let letter of string) {
		if (!letters[letter]) continue;

		let letterImage = letters[letter].map(arr => arr.slice());
		for (let col of letterImage) {
			builtPixels.push(col);
		}

		const unspacedLetters = ['\u266A', '\u26CA', '\u26C9'];
		if (!unspacedLetters.includes(letter)) builtPixels.push(Array(8).fill(0));
	}

	boardPixelCache.set(string, builtPixels);
	if (boardPixelCache.size > 128) {
		const firstKey = boardPixelCache.keys().next().value;
		boardPixelCache.delete(firstKey);
	}

	return builtPixels;
}

/**
 * Shows a string on the board
 * @param {number[][]} boardPixels - The board pixel columns.
 * @param {number} startFrame - Starting frame
 * @param {number} textColor - Text color in hex
 * @param {number} backgroundColor - Background color in hex
 * @param {Uint32Array} pixels - The pixels array
 * @param {number} startPixel - Starting pixel index
 * @param {number} endPixel - Ending pixel index
 * @returns {void}
 */
function showString(boardPixels, startFrame, textColor, backgroundColor, pixels, startPixel, endPixel) {
	let currentPixel = startPixel;
	let currentColumn = startFrame;
	let maxColumns = boardPixels.length;

	fill(pixels, 0x000000, startPixel, endPixel - startPixel);

	// Render columns starting from startFrame, wrapping around if needed
	for (let i = 0; i < maxColumns; i++) {
		let col = boardPixels[currentColumn];
		const useReversed = (startFrame % 2) === (currentColumn % 2);

		for (let row = 0; row < col.length; row++) {
			const pixel = useReversed ? col[col.length - 1 - row] : col[row];
			pixels[currentPixel] = pixel ? textColor : backgroundColor;
			currentPixel++;

			if (currentPixel >= endPixel) return;
		}
		currentColumn = (currentColumn + 1) % boardPixels.length;
	}
}

/**
 * Calculates the length of a string column
 * @param {string} text - The input text.
 * @returns {number} The amount of columns in the string.
 */
function getStringColumnLength(text) {
	return (text.length * (PIXELS_PER_LETTER + 1))
}

/**
 * Display a string on a LED board.
 * @param {Uint32Array} pixels - The pixels array
 * @param {string} string - The string to display.
 * @param {number} textColor - The color of the text.
 * @param {number} backgroundColor - The color of the background.
 * @param {{barPixels: number, boards: number}} config - Configuration object.
 * @param {Array<Object>} boardIntervals - Array of active board intervals.
 * @param {Object} ws281x - WebSocket renderer object
 * @param {number} [startColumn=0] - The starting column to display the string.
 * @param {number} [endColumn] - The ending column to display the string.
 * @param {number} [scroll=100] - The speed of scrolling in milliseconds.
 * @returns {{string: string, interval?: ReturnType<typeof setInterval>, startColumn: number, endColumn: number, startPixel: number, endPixel: number, textColor: number, backgroundColor: number, scroll: number}|undefined}
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
	const isStaticDisplay = stringColumnLength <= endColumn - startColumn;

	// Check if this display is already active
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
				showString(getBoardPixelsForString(string), 0, textColor, backgroundColor, pixels, startPixel, endPixel);
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

	boardPixels = getBoardPixelsForString(string);

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
		// Text is longer than display area: set up scrolling
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
