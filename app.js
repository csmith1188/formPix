const ws281x = require('rpi-ws281x-native') // this changes the pixels
const { io } = require('socket.io-client')
const fs = require('fs')
const { letters } = require('./letters.js')
const util = require('util');
const player = require('play-sound')({ player: 'omxplayer' })


// Constants
const BOARD_WIDTH = 32
const BOARD_HEIGHT = 8


// Config
const config = JSON.parse(
	fs.readFileSync('settings.json')
)
const maxPixels = config.barPixels + config.boards * BOARD_WIDTH * BOARD_HEIGHT


// set up strip settings
let strip = ws281x(maxPixels, {
	dma: 10,
	freq: 800000,
	gpio: config.pin,
	invert: false,
	brightness: config.brightness,
	stripType: ws281x.stripType[config.stripType]
})


// Variables
let pixels = strip.array
let classCode = 'noClass'
let pollData = {}
let textInterval = null
let currentText = ''


// Functions
// fill strip with color
// by default start is 0 and length is the whole strip
/**
 * Fills a portion of the pixel array with a specified color.
 *
 * @param {string} color - The color to fill with.
 * @param {number} [start=0] - The starting index in the pixel array.
 * @param {number} [length=pixels.length] - The number of pixels to fill.
 */
function fill(color, start = 0, length = pixels.length) {
	if (length >= pixels.length) length = pixels.length;

	for (let i = 0; i < length; i++) {
		pixels[i + start] = color;
	}
}

/**
 * Converts a hexadecimal color value to an RGB array.
 *
 * @param {number} hex - The hexadecimal color value.
 * @returns {Array.<number>} The RGB color value as an array.
 */
function hexToRgb(hex) {
	// Shift the bits of the hex value to get the red, green, and blue values.
	// The "& 255" operation is used to ensure we only get the last 8 bits (one byte) of the result.
	// This is because each color component in an RGB value is represented by one byte.
	return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/**
 * Converts an RGB array to a hexadecimal color value.
 *
 * @param {Array.<number>} rgb - The RGB color value as an array.
 * @returns {number} The hexadecimal color value.
 */
function rgbToHex(rgb) {
	// Shift the bits of the RGB values to get the hexadecimal color value.
	// The "| (bitwise OR)" operation is used to combine the three color components into a single hexadecimal value.
	return ((rgb[0] << 16) | (rgb[1] << 8) | rgb[2]);
}

/**
 * Generates a gradient from a start color to an end color over a certain length.
 *
 * @param {number} startColor - The start color of the gradient in hexadecimal format.
 * @param {number} endColor - The end color of the gradient in hexadecimal format.
 * @param {number} [start=0] - The start position of the gradient.
 * @param {number} [length=pixels.length] - The length of the gradient.
 */
function gradient(startColor, endColor, start = 0, length = pixels.length) {
	// Convert the start and end colors from hexadecimal to RGB format
	startColor = hexToRgb(startColor)
	endColor = hexToRgb(endColor)

	// Initialize the current color to the start color
	let currentColor = startColor

	// If the specified length is greater than the length of the pixels array, set it to the length of the pixels array
	if (length >= pixels.length) length = pixels.length


	// Calculate the step color, which is the amount of change in each color component per step
	let stepColor = startColor.map((start, i) => (endColor[i] - start) / length)

	// Loop over the length of the gradient
	for (let i = 0; i < length; i++) {
		// Set the pixel at the current position to the current color
		pixels[i + start] = rgbToHex(currentColor);

		// Update the current color by adding the step color to the start color
		currentColor = startColor.map((start, j) => {
			let colorValue = Math.round(currentColor[j] + stepColor[j])

			if (colorValue > 255) colorValue = 255
			if (colorValue < 0) colorValue = 0
			return colorValue
		})
	}
}

/**
 * Displays a string on the board.
 *
 * @param {Array} boardPixels - The pixels of the board.
 * @param {number} start - The starting position for displaying the string.
 * @param {string} textColor - The color of the text.
 * @param {string} backgroundColor - The color of the background.
 */
function showString(boardPixels, start, textColor, backgroundColor) {
	// Clone the board pixels
	let newBoardPixels = structuredClone(boardPixels);
	let currentPixel = config.barPixels;
	let currentColumn = start;
	let maxColumns = newBoardPixels.length;

	// Fill with black color
	fill(0x000000, config.barPixels);

	// Reverse every other column, starting from the start column
	for (let i = 0; i < newBoardPixels.length; i++) {
		if (start % 2 === i % 2) {
			newBoardPixels[i] = newBoardPixels[i].reverse();
		}
	}

	// Iterate over each column
	for (let i = 0; i < maxColumns; i++) {
		let col = newBoardPixels[currentColumn];

		// Set the color of each pixel in the column
		for (let pixel of col) {
			pixels[currentPixel] = pixel ? textColor : backgroundColor;
			currentPixel++;
		}

		// Move to the next column, wrapping around if necessary
		currentColumn = (currentColumn + 1) % newBoardPixels.length;
	}
}

/**
 * Displays a string on the board with specified text and background colors.
 *
 * @param {string} string - The string to display.
 * @param {string} textColor - The color of the text.
 * @param {string} backgroundColor - The color of the background.
 */
function displayBoard(string, textColor, backgroundColor, forced = false) {
	string = string.toLowerCase();
	let boardPixels = [Array(8).fill(0)];

	if (currentText == string && !forced) return

	currentText = string

	clearInterval(textInterval);

	// Convert each letter in the string to its pixel representation
	for (let letter of string) {
		if (!letters[letter]) continue
		let letterImage = letters[letter].map(arr => arr.slice());

		// Add the letter's pixels to the board
		for (let col of letterImage) {
			boardPixels.push(col);
		}

		// Add a column of blank pixels after each letter
		boardPixels.push(Array(8).fill(0));
	}

	// If the board is wide enough to display the entire string at once
	if (boardPixels.length <= config.boards * BOARD_WIDTH) {
		showString(boardPixels, 0, textColor, backgroundColor);
		ws281x.render();
	} else {
		for (let col of letters[' '].map(arr => arr.slice())) {
			boardPixels.push(col);
		}
		// Otherwise, scroll the string across the board
		let startColumn = 0;

		textInterval = setInterval(() => {
			showString(boardPixels, startColumn, textColor, backgroundColor);

			// Move to the next column, wrapping around if necessary
			startColumn = (startColumn + 1) % boardPixels.length;

			ws281x.render();
		}, 250);
	}
}


// clear pixels
fill(0x000000)
ws281x.render()


// set web socket url
const socket = io(config.ip, {
	extraHeaders: {
		api: config.api
	}
})


// when there is a connection error it tys to reconnect
socket.on('connect_error', (error) => {
	if (error.message == 'xhr poll error') console.log('no connection');
	else console.log(error.message);

	fill(0x000000)
	ws281x.render()

	setTimeout(() => {
		socket.connect()
	}, 5000)
})

// when it connects to formBar it ask for the bars data
socket.on('connect', () => {
	console.log('connected')
	displayBoard(config.ip.split('://')[1], 0xFFFFFF, 0x000000, true)
	player.play('./sfx/sfx_bootup02.wav')
})

socket.on('setClass', (userClass) => {
	if (userClass == 'noClass') {
		classCode = ''
		fill(0x000000)
		displayBoard(config.ip.split('://')[1], 0xFFFFFF, 0x000000, true)
		ws281x.render()
	} else {
		classCode = userClass
		socket.emit('vbUpdate')
	}
})

// when the bar changes
socket.on('vbUpdate', (newPollData) => {
	let pixelsPerStudent
	let text = ''
	let pollResponses = 0

	// if no poll clear pixels
	if (!newPollData.status) {
		displayBoard(config.ip.split('://')[1], 0xFFFFFF, 0x000000)
		ws281x.render()
		pollData = newPollData
		return
	}

	fill(0x808080, 0, config.barPixels)

	// convert colors from hex to integers
	for (let poll of Object.values(newPollData.polls)) {
		poll.color = parseInt(poll.color.slice(1), 16)
	}


	// count poll responses
	for (let poll of Object.values(newPollData.polls)) {
		pollResponses += poll.responses
	}

	// if totalStudents = pollResponses turn off blind mode
	if (newPollData.totalStudents == pollResponses) {
		newPollData.blind = false
	}

	if (util.isDeepStrictEqual(newPollData, pollData)) return

	if (newPollData.totalStudents == pollResponses) {
		if (newPollData.prompt == 'Thumbs?') {
			if (newPollData.polls.Up.responses == newPollData.totalStudents) {
				gradient(0x0000FF, 0xFF0000, 0, config.barPixels)
				displayBoard('Max Gamer', 0xFF0000, 0x000000)
				player.play('./sfx/sfx_success01.wav')
				pollData = newPollData
				return
			} else if (newPollData.polls.Wiggle.responses == newPollData.totalStudents) {
				player.play('./sfx/bruh.wav')
			} else if (newPollData.polls.Down.responses == newPollData.totalStudents) {
				player.play('./sfx/wompwomp.wav')
				displayBoard('Git Gud', 0xFF0000, 0x000000)
			}
		}
	}

	if (newPollData.prompt) text += newPollData.prompt
	else text += 'Poll'

	text += ` ${pollResponses}/${newPollData.totalStudents}`

	displayBoard(text, 0xFFFFFF, 0x000000)

	// count non-empty polls
	let nonEmptyPolls = -1
	for (let poll of Object.values(newPollData.polls)) {
		if (poll.responses > 0) {
			nonEmptyPolls++
		}
	}

	if (newPollData.totalStudents <= 0) pixelsPerStudent = 0
	else pixelsPerStudent = Math.floor((config.barPixels - nonEmptyPolls) / newPollData.totalStudents) //- nonEmptyPolls

	// add polls
	let currentPixel = 0
	let pollNumber = 0

	for (let [name, poll] of Object.entries(newPollData.polls)) {
		// for each response
		for (let responseNumber = 0; responseNumber < poll.responses; responseNumber++) {
			let color = poll.color
			if (newPollData.blind) color = 0xFF8000

			// set response to color
			fill(color, currentPixel, pixelsPerStudent)

			currentPixel += pixelsPerStudent

			// set spacers
			if (
				responseNumber < poll.responses - 1 ||
				pollNumber < nonEmptyPolls
			) {
				pixels[currentPixel] = 0xFF0080
				currentPixel++
			}
		}

		if (
			!newPollData.blind &&
			poll.responses > 0
		) currentPixel++
		pollNumber++
	}

	pollData = newPollData

	ws281x.render()
})

socket.on('helpSound', () => {
	player.play('./sfx/sfx_up04.wav')
})

socket.on('breakSound', () => {
	player.play('./sfx/sfx_pickup02.wav')
})

socket.on('pollSound', () => {
	player.play('./sfx/sfx_blip01.wav')
})

socket.on('removePollSound', () => {
	player.play('./sfx/sfx_hit01.wav')
})

socket.on('joinSound', () => {
	player.play('./sfx/sfx_up02.wav')
})

socket.on('leaveSound', () => {
	player.play('./sfx/sfx_laser01.wav')
})

socket.on('kickStudentsSound', () => {
	player.play('./sfx/sfx_splash01.wav')
})

socket.on('endClassSound', () => {
	player.play('./sfx/sfx_explode01.wav')
})