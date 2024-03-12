const ws281x = require('rpi-ws281x-native') // this changes the pixels
const http = require('http');
const express = require('express')
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
let connected = false
let classCode = ''
let pollData = {}
let textInterval = null
let currentText = ''


// Set Up
// clear pixels
fill(0x000000)
ws281x.render()

// set web socket url
const app = express()
const httpServer = http.createServer(app)

const socket = io(config.ip, {
	extraHeaders: {
		api: config.api
	}
})


// Functions
/**
 * Fills a portion of the pixels array with a specified color.
 *
 * @param {string} color - The color to fill the pixels with.
 * @param {number} [start=0] - The starting index from where to start filling the pixels.
 * @param {number} [length=pixels.length] - The number of pixels to fill with the color.
 * @throws {Error} Will throw an error if an issue occurs during execution.
 */
function fill(color, start = 0, length = pixels.length) {
	try {
		// If the length provided is greater than or equal to the length of the pixels array,
		// set the length to the length of the pixels array to avoid out of bounds errors.
		if (length >= pixels.length) length = pixels.length;

		// Loop through the specified portion of the pixels array
		for (let i = 0; i < length; i++) {
			// Set each pixel in the specified range to the provided color
			pixels[i + start] = color;
		}
	} catch (err) {
		// If an error occurs, re-throw it to be handled by the caller
		throw err;
	}
}

/**
 * Converts a hexadecimal color value to an RGB array.
 *
 * @param {number} hex - The hexadecimal color value.
 * @returns {Array.<number>} The RGB color value as an array.
 * @throws {Error} Will throw an error if an issue occurs during execution.
 */
function hexToRgb(hex) {
	try {
		// Shift the bits of the hex value to get the red, green, and blue values.
		// The "& 255" operation is used to ensure we only get the last 8 bits (one byte) of the result.
		// This is because each color component in an RGB value is represented by one byte.
		return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
	} catch (err) {
		throw err
	}
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
 * This function safely parses a JSON string and returns the parsed object.
 *
 * @param {string} string - The JSON string to parse.
 * @returns {object|string} - The parsed object or an error message.
 * @throws {Error} - If an error other than invalid JSON string occurs.
 */
function safeJsonParse(string) {
	try {
		// Check if input is a string
		if (typeof string !== 'string') return "Input must be a string";

		// Parse the JSON string
		let value = JSON.parse(string);

		// Check if parsed value is an object
		if (typeof value === 'object') return value;
		else return "Parsed value is not an object";
	} catch (err) {
		// Check if error is due to invalid JSON
		if (err.message.endsWith('is not valid JSON')) {
			return "Input is not a valid JSON string";
		} else throw err;  // Throw any other error
	}
}

/**
 * This function converts a color from text format to hexadecimal format.
 *
 * @param {string} color - The input can be a string representing a color in hexadecimal format or a JSON string representing a color in RGB format.
 * @returns {number|string} - The color in hexadecimal format, or an error message if the input is not valid.
 * @throws {Error} - If an error other than invalid input occurs.
 */
function textToHexColor(color) {
	try {
		// Check if the input is a string
		if (typeof color != 'string') return "Input must be a string";

		// Check if the color is in hexadecimal format
		if (color.startsWith('#')) {
			// Remove the '#' from the start of the color
			color = color.slice(1);

			// Check if the color is 6 characters long
			if (color.length != 6) return "Hex color must be 6 characters long";

			// Convert the color to a number and return it
			return Number.parseInt(color, 16)
		}

		// Try to parse the color as a JSON string
		color = safeJsonParse(color);

		if (typeof color == 'string') return color;
		if (color instanceof Error) throw color;

		let red, green, blue;

		// Get the keys of the color object
		keys = Object.keys(color)

		// Check if the keys are 'red', 'green', and 'blue'
		if (keys.every(item => ['red', 'green', 'blue'].includes(item))) {
			red = color.red
			green = color.green
			blue = color.blue
			// Check if the keys are 'r', 'g', and 'b'
		} else if (keys.every(item => ['r', 'g', 'b'].includes(item))) {
			red = color.r
			green = color.g
			blue = color.b
		} else return "Invalid color keys";

		// Check if the color values are integers between 0 and 255
		if ([red, green, blue].some(item =>
			item < 0 || item > 255 || !Number.isInteger(item)
		)) return "Color values must be integers between 0 and 255";

		// Convert the color to hexadecimal format and return it
		return rgbToHex([red, green, blue])
	} catch (err) {
		// Throw any other error that might occur
		throw err
	}
}

/**
 * This function validates the pixel object and calculates its position on the board.
 *
 * @param {Object} pixel - The pixel object with 'x' and 'y' properties.
 * @returns {number|string} The calculated pixel position or an error message if the pixel object is invalid.
 * @throws {Error} If an unexpected error occurs during the validation and calculation process.
 */
function validateAndCalculatePixel(pixel) {
	try {
		// Check if pixel object has 'x' and 'y' properties
		if (Object.keys(pixel).every(item => !['x', 'y'].includes(item))) return 'invalid pixel format';

		// Extract 'x' and 'y' properties from pixel object
		let x = pixel.x;
		let y = pixel.y;

		// Validate 'x' and 'y' properties
		if (!x && x != 0) return 'no x';
		if (!y && y != 0) return 'no y';
		if (typeof x != 'number') return 'x not a number';
		if (typeof y != 'number') return 'y not a number';
		if (!Number.isInteger(x)) return 'x not an integer';
		if (!Number.isInteger(y)) return 'y not an integer';
		if (x < 0 || x >= BOARD_WIDTH * config.boards) return 'x out of bounds';
		if (y < 0 || y >= BOARD_HEIGHT) return 'y out of bounds';

		// Calculate pixel position on the board
		pixel = config.barPixels;
		pixel += x * BOARD_HEIGHT;

		// Adjust pixel position based on 'x' property
		if (x % 2 == 1) {
			pixel += BOARD_HEIGHT - 1;
			pixel -= y;
		} else pixel += y;

		// Return calculated pixel position
		return pixel;
	} catch (err) {
		// Throw any unexpected error that might occur
		throw err
	}
}

/**
 * This function parses the pixel input and returns the pixel number.
 *
 * @param {number|string|Object} pixel - The pixel input which can be a number, a string representing a number, a JSON string representing a pixel object, or a pixel object.
 * @returns {number|string} - The pixel number or an error message if the input is a string that cannot be parsed or if the pixel object is invalid.
 * @throws {Error} - If an unexpected error occurs during the parsing and validation process.
 */
function getPixelNumber(pixel) {
	try {
		// If pixel is a number or a string representing a number, return it as a number
		if (Number(pixel)) {
			return Number(pixel);
		} else if (typeof pixel == 'string') {
			// If pixel is a string, try to parse it as a JSON string
			pixel = safeJsonParse(pixel);

			// If parsing failed, return the error message
			if (typeof pixel == 'string' || pixel instanceof Error) return pixel;

			// If parsing succeeded, validate and calculate the pixel number
			return validateAndCalculatePixel(pixel);
		} else if (typeof pixel == 'object' && !Array.isArray(pixel)) {
			// If pixel is an object (and not an array), validate and calculate the pixel number
			return validateAndCalculatePixel(pixel);
		}
	} catch (err) {
		// If an unexpected error occurs, throw it
		throw err
	}
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
	length = Math.floor(length)
	if (length >= pixels.length - start) length = pixels.length - start

	// Calculate the step color, which is the amount of change in each color component per step
	let stepColor = startColor.map((start, i) => (endColor[i] - start) / (length - 1))

	// Loop over the length of the gradient
	for (let i = 0; i < length; i++) {
		// Set the pixel at the current position to the current color
		pixels[i + start] = rgbToHex(currentColor.map(color => Math.round(color)));

		// Update the current color by adding the step color to the start color
		currentColor = startColor.map((start, j) => {
			let colorValue = currentColor[j] + stepColor[j]

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
 * Display a string on a LED board.
 *
 * @param {string} string - The string to display.
 * @param {string} textColor - The color of the text.
 * @param {string} backgroundColor - The color of the background.
 * @param {boolean} [forced=false] - Force the display of the string even if it's the same as the current one.
 */
function displayBoard(string, textColor, backgroundColor, forced = false) {
	// Convert the string to lowercase
	string = string.toLowerCase();

	// Initialize the board pixels with an empty row
	let boardPixels = [Array(8).fill(0)];

	// If the current text is the same as the input string and the display is not forced, return
	if (currentText == string && !forced) return

	// Set the current text to the input string
	currentText = string

	// Clear any existing text display interval
	clearInterval(textInterval)
	textInterval = null;

	// For each letter in the string
	for (let letter of string) {
		// If the letter is not in the letters object, skip it
		if (!letters[letter]) continue

		// Get a copy of the letter image
		let letterImage = letters[letter].map(arr => arr.slice());

		// Add the letter image to the board pixels
		for (let col of letterImage) {
			boardPixels.push(col);
		}

		// Add an empty row after the letter
		boardPixels.push(Array(8).fill(0));
	}

	// If the board pixels fit on the board
	if (boardPixels.length <= config.boards * BOARD_WIDTH) {
		// Show the string on the board
		showString(boardPixels, 0, textColor, backgroundColor);

		// Render the board
		ws281x.render();
	} else {
		// If the board pixels don't fit on the board

		// Add a space to the end of the board pixels
		for (let col of letters[' '].map(arr => arr.slice())) {
			boardPixels.push(col);
		}

		// Initialize the start column
		let startColumn = 0;

		// Start an interval to scroll the string on the board
		textInterval = setInterval(() => {
			// Show the string on the board starting from the start column
			showString(boardPixels, startColumn, textColor, backgroundColor);

			// Move the start column to the right, wrapping around to the start if necessary
			startColumn = (startColumn + 1) % boardPixels.length;

			// Render the board
			ws281x.render();
		}, 250);
	}
}


// express api
/**
 * Middleware function to check if the application is connected to a formBar.
 *
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 * @param {function} next - The next middleware function.
 */
app.use((req, res, next) => {
	// If the application is not connected to a formBar
	if (!connected) {
		// Respond with an error message
		res.json({ error: 'This formPix is not connected to a formBar' })
		// End the request-response cycle
		return
	}

	// If the application is connected to a formBar, proceed to the next middleware function
	next()
})

app.get('/fill', (req, res) => {
	try {
		let { color, start = 0, length = pixels.length } = req.query

		color = textToHexColor(color)

		if (typeof color == 'string') {
			res.status(400).send(color)
			return
		}
		if (color instanceof Error) throw color

		if (isNaN(start) || !Number.isInteger(Number(start))) {
			res.status(400).send('start must be an integer')
			return
		}
		if (isNaN(length) || !Number.isInteger(Number(length))) {
			res.status(400).send('length must be an integer')
			return
		}

		start = Number(start)
		length = Number(length)

		if (textInterval && start + length > config.barPixels) {
			clearInterval(textInterval)
			textInterval = null
			fill(0x000000, config.barPixels)
		}

		fill(color, start, length)

		ws281x.render()
		res.status(200).send('ok')
	} catch (err) {
		res.status(500).send('error')
	}
})

// Route to set a specific pixel with a color
app.get('/setPixel', (req, res) => {
	try {
		// Extract pixel and color from the request query
		let { pixel, color } = req.query

		// Convert color from text to hex
		color = textToHexColor(color)

		// If color is a string or an instance of Error, handle it accordingly
		if (typeof color == 'string') {
			res.status(400).send(color)
			return
		}
		if (color instanceof Error) throw color

		// Convert pixel to pixel number
		let pixelNumber = getPixelNumber(pixel)

		// If pixelNumber is a string or an instance of Error, handle it accordingly
		if (typeof pixelNumber == 'string') {
			res.status(400).send(pixelNumber)
			return
		}
		if (pixelNumber instanceof Error) throw pixelNumber

		// If textInterval exists and pixelNumber is greater than or equal to the number of bar pixels, clear the interval and fill the bar with black color
		if (textInterval && pixelNumber >= config.barPixels) {
			clearInterval(textInterval);
			textInterval = null;
			fill(0x000000, config.barPixels);
		}

		// Set the specified pixel with the specified color
		pixels[pixelNumber] = color
		// Render the changes
		ws281x.render()
		// Send a 200 response with 'ok'
		res.status(200).send('ok')
	} catch (err) {
		// If an error occurs, send a 500 response with 'error'
		res.status(500).send('error')
	}
})

// Route to set multiple pixels with colors
app.get('/setPixels', (req, res) => {
	try {
		// Extract pixels from the request query
		let inputPixels = req.query.pixels
		// Clone the current pixels array
		let tempPixels = structuredClone(pixels)

		// Flag to check if the board has been changed
		let changedBoard = false

		// Safely parse the input pixels
		inputPixels = safeJsonParse(inputPixels)

		// If inputPixels is a string or an instance of Error, handle it accordingly
		if (typeof inputPixels == 'string') {
			res.status(400).send(inputPixels)
			return
		}
		if (inputPixels instanceof Error) throw inputPixels

		// Iterate over each input pixel
		for (let inputPixel of inputPixels) {
			// Convert color from text to hex
			let color = textToHexColor(inputPixel.color)
			let pixelNumber

			// If color is a string or an instance of Error, handle it accordingly
			if (typeof color == 'string') {
				res.status(400).send(color)
				return
			}
			if (color instanceof Error) throw color

			// Get the pixel number from the input pixel's pixelNumber or x and y coordinates
			console.log(inputPixel);
			if (inputPixel.pixelNumber || inputPixel.pixelNumber == 0) pixelNumber = inputPixel.pixelNumber
			else pixelNumber = getPixelNumber({ x: inputPixel.x, y: inputPixel.y })

			// If pixelNumber is a string or an instance of Error, handle it accordingly
			if (typeof pixelNumber == 'string') {
				res.status(400).send(pixelNumber)
				return
			}
			if (pixelNumber instanceof Error) throw pixelNumber

			// If textInterval exists and pixelNumber is greater than or equal to the number of bar pixels, clear the pixels on the board
			if (textInterval && pixelNumber >= config.barPixels && !changedBoard) {
				changedBoard = true

				for (let i = config.barPixels; i < tempPixels.length; i++) {
					tempPixels[i] = 0x000000
				}
			}

			// Set the specified pixel with the specified color
			tempPixels[pixelNumber] = color
		}

		// If the board has been changed, clear the text interval
		if (changedBoard) {
			clearInterval(textInterval);
			textInterval = null;
		}

		// Set the pixels array with the tempPixels array
		pixels.set(tempPixels)

		// Render the changes
		ws281x.render()

		// Send a 200 response with the input pixels, temp pixels, and whether the board has been changed
		res.status(200).json({ inputPixels, tempPixels, changedBoard })
	} catch (err) {
		// If an error occurs, log the error and send a 500 response with 'error'
		res.status(500).send('error')
	}
})

// Route to display a string with a specified text color and background color
app.get('/say', (req, res) => {
	try {
		// Extract string, textColor and backgroundColor from the request query
		let { string, textColor, backgroundColor } = req.query

		// If string, textColor or backgroundColor is not provided, send a response indicating the missing parameter
		if (!string) {
			res.send('no string')
			return
		}
		if (!textColor) {
			res.send('no textColor')
			return
		}
		if (!backgroundColor) {
			res.send('no backgroundColor')
			return
		}

		// Convert textColor and backgroundColor from text to hex
		textColor = textToHexColor(textColor)
		backgroundColor = textToHexColor(backgroundColor)

		// If textColor or backgroundColor is a string or an instance of Error, send a 400 response with the problematic color
		if (typeof textColor == 'string') {
			res.status(400).send(textColor)
			return
		}
		if (textColor instanceof Error) throw textColor
		if (typeof backgroundColor == 'string') {
			res.status(400).send(backgroundColor)
			return
		}
		if (backgroundColor instanceof Error) throw backgroundColor

		// Call the displayBoard function with the string, textColor, and backgroundColor to display the string with the specified colors
		displayBoard(string, textColor, backgroundColor)
		// Send a 200 response with 'ok' to indicate successful operation
		res.status(200).send('ok')
	} catch (err) {
		// If an error occurs, send a 500 response with 'error'
		res.status(500).send('error')
	}
})

// sockets
// when there is a connection error it tys to reconnect
socket.on('connect_error', (error) => {
	if (error.message == 'xhr poll error') console.log('no connection');
	else console.log(error.message);

	connected = false

	fill(0x000000)
	ws281x.render()

	setTimeout(() => {
		socket.connect()
	}, 5000)
})

// when it connects to formBar it ask for the bars data
socket.on('connect', () => {
	console.log('connected')

	connected = true

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

httpServer.listen(config.port, async () => {
	console.log(`Running on port: ${config.port}`)
})
