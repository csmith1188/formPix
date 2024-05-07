// Imports
const express = require('express')
const http = require('http')
const fs = require('fs')
const util = require('util');
// formPix - change io to io
const io = require('socket.io-client')
const { letters } = require('../letters.js')
// formPix end


// Setup
var app = express()
const httpServer = http.createServer(app)
const webIo = require('socket.io')(httpServer)

// Set EJS as our view engine
app.set('view engine', 'ejs')
app.set('views', __dirname + '/views')

// Allows express to parse requests
app.use(express.urlencoded({ extended: true }))

// Use a static folder for web page assets
app.use(express.static(__dirname + '/static'))
app.use('/bgm', express.static(__dirname + '/bgm'))
app.use('/sfx', express.static(__dirname + '/sfx'))

const config = JSON.parse(
	fs.readFileSync('settings.json')
)

// formPix
const socket = io(config.formbarUrl, {
	extraHeaders: {
		api: config.api
	}
})
// formPix end


// Constants
const player = {
	play: async (string, options) => {
		let sockets = await webIo.fetchSockets()

		for (let socket of sockets) {
			socket.emit('play', string)
		}
	}
}

const ws281x = {
	render: async () => {
		let sockets = await webIo.fetchSockets()

		for (let socket of sockets) {
			socket.emit('render', new Array(...pixels))
		}
	}
}
// formPix
const PIXELS_PER_LETTER = 5
const BOARD_WIDTH = 32
const BOARD_HEIGHT = 8
const END_POINT_PERMISSIONS = {
	'/api/fill': 'lights',
	'/api/gradient': 'lights',
	'/api/setPixel': 'lights',
	'/api/setPixels': 'lights',
	'/api/say': 'lights',
	'/api/getSounds': 'sounds',
	'/api/playSound': 'sounds'
}

const maxPixels = config.barPixels + config.boards * BOARD_WIDTH * BOARD_HEIGHT
// formPix end


// Variables
let pixels = new Uint32Array(maxPixels).fill(0x000000);
// formPix
let connected = false
let classCode = ''
let pollData = {}
let boardIntervals = []
let timerData = {
	startTime: 0,
	timeLeft: 0,
	active: false,
	sound: false
}
let sounds = {
	bgm: [],
	sfx: []
}

// Setup
sounds.bgm = fs.readdirSync('./bgm')
sounds.sfx = fs.readdirSync('./sfx')
// formPix end


// Functions
// formPix
/**
 * Fills a portion of the pixels array with a specified color.
 *
 * @param {string} color - The color to fill the pixels with.
 * @param {number} [start=0] - The starting index from where to start filling the pixels.
 * @param {number} [length=pixels.length] - The number of pixels to fill with the color.
 * @throws {Error} Will throw an error if an issue occurs during execution.
 */
function fill(color, start = 0, length = pixels.length) {
	// If the length provided is greater than or equal to the length of the pixels array,
	// set the length to the length of the pixels array to avoid out of bounds errors.
	if (length >= pixels.length) length = pixels.length - start;

	// Loop through the specified portion of the pixels array
	for (let i = 0; i < length; i++) {
		// Set each pixel in the specified range to the provided color
		pixels[i + start] = color;
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
 * @throws {Error} Will throw an error if an issue occurs during execution.
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
		if (err.message.toLowerCase().includes('json')) {
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
	// Check if the input is a string
	if (typeof color != 'string') return "Color must be a string";

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
}

/**
 * This function validates the pixel object and calculates its position on the board.
 *
 * @param {Object} pixel - The pixel object with 'x' and 'y' properties.
 * @returns {number|string} The calculated pixel position or an error message if the pixel object is invalid.
 * @throws {Error} If an unexpected error occurs during the validation and calculation process.
 */
function validateAndCalculatePixel(pixel) {
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
}

/**
 * This function parses the pixel input and returns the pixel number.
 *
 * @param {number|string|Object} pixel - The pixel input which can be a number, a string representing a number, a JSON string representing a pixel object, or a pixel object.
 * @returns {number|string} - The pixel number or an error message if the input is a string that cannot be parsed or if the pixel object is invalid.
 * @throws {Error} - If an unexpected error occurs during the parsing and validation process.
 */
function getPixelNumber(pixel) {
	// If pixel is a number or a string representing a number, return it as a number
	if (!isNaN(pixel)) {
		if (typeof pixel == 'number') return pixel;
		else return Number(pixel);
	} else if (typeof pixel == 'string') {
		// If pixel is a string, try to parse it as a JSON string
		pixel = safeJsonParse(pixel);

		// If parsing failed, return the error message
		if (typeof pixel == 'string') return pixel
		if (pixel instanceof Error) throw pixel

		// If parsing succeeded, validate and calculate the pixel number
		return validateAndCalculatePixel(pixel);
	} else if (typeof pixel == 'object' && !Array.isArray(pixel)) {
		// If pixel is an object (and not an array), validate and calculate the pixel number
		return validateAndCalculatePixel(pixel);
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
 * This function displays a string on a board of pixels.
 *
 * @param {Array} boardPixels - The original board pixels.
 * @param {Number} startFrame - The starting frame for the display.
 * @param {String} textColor - The color of the text to be displayed.
 * @param {String} backgroundColor - The color of the background.
 * @param {Number} startPixel - The starting pixel for the display.
 * @param {Number} endPixel - The ending pixel for the display.
 */
function showString(boardPixels, startFrame, textColor, backgroundColor, startPixel, endPixel) {
	// Clone the board pixels
	let newBoardPixels = structuredClone(boardPixels);
	let currentPixel = startPixel;
	let currentColumn = startFrame;
	let maxColumns = newBoardPixels.length;

	// Fill with black color
	fill(0x000000, startPixel, endPixel - startPixel);

	// Reverse every other column, starting from the startFrame column
	for (let i = 0; i < newBoardPixels.length; i++) {
		if (startFrame % 2 === i % 2) {
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

			if (currentPixel >= endPixel) return
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
 * @param {number} [startColumn=0] - The starting column to display the string.
 * @param {number} [endColumn=config.boards * BOARD_WIDTH] - The ending column to display the string.
 */
function displayBoard(string, textColor, backgroundColor, startColumn = 0, endColumn = config.boards * BOARD_WIDTH) {
	// Convert the string to lowercase
	string = string.toLowerCase();
	let stringColumnLength = getStringColumnLength(string);

	let startPixel = config.barPixels + startColumn * 8

	if (stringColumnLength + startColumn < endColumn)
		endColumn = stringColumnLength + startColumn

	let endPixel = config.barPixels + endColumn * 8

	// Initialize the board pixels with an empty row
	let boardPixels = [Array(8).fill(0)];

	// Clear any existing text display interval
	for (let boardInterval of boardIntervals) {
		if (!boardInterval) continue

		if (
			string == boardInterval.string &&
			startColumn == boardInterval.startColumn &&
			endColumn == boardInterval.endColumn
		) return
	}

	boardIntervals = boardIntervals.filter(boardInterval => {
		if (
			startColumn < boardInterval.endColumn &&
			endColumn > boardInterval.startColumn
		) {
			clearInterval(boardInterval.interval);
			return false
		} else return true
	})

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
	if (boardPixels.length - 1 <= endColumn - startColumn) {
		// Show the string on the board
		showString(boardPixels, 0, textColor, backgroundColor, startPixel, endPixel);

		// Render the board
		ws281x.render();

		return {
			string,
			startColumn,
			endColumn
		}
	} else {
		// If the board pixels don't fit on the board

		// Add 2 spaces to the beginning of the board pixels
		for (let i = 0; i < 2 * 6 + 1; i++) {
			boardPixels.unshift([0, 0, 0, 0, 0, 0, 0, 0]);
		}

		// Initialize the start column
		let startFrame = 0;

		// Start an interval to scroll the string on the board
		return {
			string,
			interval: setInterval(() => {
				// Show the string on the board starting from the start column
				showString(boardPixels, startFrame, textColor, backgroundColor, startPixel, endPixel);

				// Move the start column to the right, wrapping around to the start if necessary
				startFrame = (startFrame + 1) % boardPixels.length;

				// Render the board
				ws281x.render();
			}, 200),
			startColumn,
			endColumn
		}
	}
}

/**
 * Calculates the length of a string column based on the number of characters in the text.
 * @param {string} text - The input text.
 * @returns {number} The amount of columns in the string.
 */
function getStringColumnLength(text) {
	return (text.length * (PIXELS_PER_LETTER + 1))
}

/**
 * This function plays a sound file based on the provided parameters.
 *
 * @param {Object} options - The options for playing sound.
 * @param {string} options.bgm - The filename of the background music to play.
 * @param {string} options.sfx - The filename of the sound effect to play.
 * @returns {boolean|string} - Returns true if the sound file was played successfully, otherwise returns an error message.
 */
function playSound({ bgm, sfx }) {
	// If neither bgm nor sfx is provided, return an error message
	if (!bgm && !sfx) return 'Missing bgm or sfx'
	// If both bgm and sfx are provided, return an error message
	if (bgm && sfx) return 'You can not send both bgm and sfx'

	// If bgm is provided
	if (bgm) {
		// Check if the bgm file exists
		if (fs.existsSync(`./bgm/${bgm}`)) {
			// If it exists, play the bgm
			player.play(`./bgm/${bgm}`)
			return true
		} else {
			// If it does not exist, return an error message
			return `The background music ${bgm} does not exist.`
		}
	}
	// If sfx is provided
	if (sfx) {
		// Check if the sfx file exists
		if (fs.existsSync(`./sfx/${sfx}`)) {
			// If it exists, play the sfx
			player.play(`./sfx/${sfx}`)
			return true
		} else {
			// If it does not exist, return an error message
			return `The sound effect ${sfx} does not exist.`
		}
	}

	return 'Unknown error'
}

// formPix end


// Routes
// formPix
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

// permissions check
app.use(async (req, res, next) => {
	try {
		let apiKey = req.headers.api

		if (!req.url) {
			res.status(400).json({ error: 'Missing URL' })
			return
		}

		// Defines users desired endpoint
		let urlPath = req.url

		// Check for ?(urlParams) and removes it from the string
		if (urlPath.indexOf('?') != -1) {
			urlPath = urlPath.slice(0, urlPath.indexOf('?'))
		}
		// Removes the last / if it exists
		if (urlPath[urlPath.length - 1] == '/') {
			urlPath = urlPath.slice(0, urlPath.length - 1)
		}

		if (urlPath == '' || urlPath == 'socket.io/socket.io.js') {
			next()
			return
		}

		if (!apiKey) {
			res.status(400).json({ error: 'Missing API key' })
			return
		}

		if (!END_POINT_PERMISSIONS[urlPath]) {
			res.status(404).json({ error: `The endpoint ${urlPath} does not exist in the permissions` })
			return
		}

		let response = await fetch(`${config.formbarUrl}/api/apiPermissionCheck?api=${apiKey}&permissionType=${END_POINT_PERMISSIONS[urlPath]}`, {
			method: 'GET',
			headers: {
				api: config.api
			}
		})
		data = await response.json();

		if (data.error) {
			res.status(response.status).json({ error: data.error })
			return
		}

		next()
	} catch (err) {
		res.status(500).json({ error: 'There was a server error try again' })
		return
	}
})

// check for multiple of the same query parameter
app.use((req, res, next) => {
	let query = req.query

	for (let key in query) {
		if (Array.isArray(query[key])) {
			res.status(400).json({ error: `You can only have one ${key} parameter` })
			return
		}
	}

	next()
})

// Route to fill the bar with a color
app.post('/api/fill', (req, res) => {
	try {
		// Destructure color, start, and length from the request query
		// If start and length are not provided, default values are set
		let { color, start = 0, length = pixels.length } = req.query

		// Convert the color text to hexadecimal color
		color = textToHexColor(color)

		// If color is a string, send a 400 status code with color as the response
		if (typeof color == 'string') {
			res.status(400).json({ error: color })
			return
		}
		// If color is an instance of Error, throw the error
		if (color instanceof Error) throw color

		// Validate start and length to be integers, if not send a 400 status code with an error message
		if (isNaN(start) || !Number.isInteger(Number(start))) {
			res.status(400).json({ error: 'start must be an integer' })
			return
		}
		if (isNaN(length) || !Number.isInteger(Number(length))) {
			res.status(400).json({ error: 'length must be an integer' })
			return
		}

		// Convert start and length to numbers
		start = Number(start)
		length = Number(length)

		// Fill the bar with the specified color, start, and length
		fill(color, start, length)

		// Render the changes
		ws281x.render()
		// Send a 200 status code with 'ok' as the response
		res.status(200).json({ message: 'ok' })
	} catch (err) {
		// If any error occurs, send a 500 status code with 'error' as the response
		res.status(500).json({ error: 'There was a server error try again' })
	}
})

// Route to fill a gradient on the bar with a color
app.post('/api/gradient', (req, res) => {
	try {
		// Destructure color, start, and length from the request query
		// If start and length are not provided, default values are set
		let { startColor, endColor, start = 0, length = pixels.length } = req.query

		if (!startColor) {
			res.status(400).json({ error: 'missing startColor' })
			return
		}
		if (!endColor) {
			res.status(400).json({ error: 'missing endColor' })
			return
		}

		// Convert the startColor text to hexadecimal color
		startColor = textToHexColor(startColor)

		// If startColor is a string, send a 400 status code with color as the response
		if (typeof startColor == 'string') {
			res.status(400).json({ error: startColor })
			return
		}
		// If startColor is an instance of Error, throw the startColor
		if (startColor instanceof Error) throw startColor

		// Convert the endColor text to hexadecimal color
		endColor = textToHexColor(endColor)

		// If endColor is a string, send a 400 status code with color as the response
		if (typeof endColor == 'string') {
			res.status(400).json({ error: endColor })
			return
		}
		// If endColor is an instance of Error, throw the endColor
		if (endColor instanceof Error) throw endColor

		// Check if is an not integer
		if (isNaN(start) || !Number.isInteger(Number(start))) {
			res.status(400).json({ error: 'start must be an integer' })
			return
		}
		// Check if is an not integer
		if (isNaN(length) || !Number.isInteger(Number(length))) {
			res.status(400).json({ error: 'length must be an integer' })
			return
		}

		// Convert start and length to numbers
		start = Number(start)
		length = Number(length)

		// Fill the bar with the specified startColor, start, and length
		gradient(startColor, endColor, start, length)
		// Render the changes
		ws281x.render()
		// Send a 200 status code with 'ok' as the response
		res.status(200).json({ message: 'ok' })
	} catch (err) {
		// If any error occurs, send a 500 status code with 'error' as the response
		res.status(500).json({ error: 'There was a server error try again' })
	}
})

// Route to set a specific pixel with a color
app.post('/api/setPixel', (req, res) => {
	try {
		// Extract pixel and color from the request query
		let { pixel, color } = req.query

		// Convert color from text to hex
		color = textToHexColor(color)

		// If color is a string or an instance of Error, handle it accordingly
		if (typeof color == 'string') {
			res.status(400).json({ error: color })
			return
		}
		if (color instanceof Error) throw color

		// Convert pixel to pixel number
		let pixelNumber = getPixelNumber(pixel)

		// If pixelNumber is a string or an instance of Error, handle it accordingly
		if (typeof pixelNumber == 'string') {
			res.status(400).json({ error: pixelNumber })
			return
		}
		if (pixelNumber instanceof Error) throw pixelNumber

		// Set the specified pixel with the specified color
		pixels[pixelNumber] = color

		// Render the changes
		ws281x.render()

		// Send a 200 response with 'ok'
		res.status(200).json({ message: 'ok' })
	} catch (err) {
		// If an error occurs, send a 500 response with 'error'
		res.status(500).json({ error: 'There was a server error try again' })
	}
})

// Route to set multiple pixels with colors
app.post('/api/setPixels', (req, res) => {
	try {
		// Extract pixels from the request query
		let inputPixels = req.query.pixels
		// Clone the current pixels array
		let tempPixels = structuredClone(pixels)

		// Flag to check if the board has been changed
		let changedBoard = false

		// If inputPixels is not provided, send a 400 response
		if (!inputPixels) {
			res.status(400).json({ error: 'You did not provide any pixels' })
			return
		}

		// Safely parse the input pixels
		inputPixels = safeJsonParse(inputPixels)

		// If inputPixels is a string or an instance of Error, handle it accordingly
		if (typeof inputPixels == 'string') {
			res.status(400).json({ error: inputPixels })
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
				res.status(400).json({ error: color })
				return
			}
			if (color instanceof Error) throw color

			pixelNumber = getPixelNumber(inputPixel.pixelNumber)

			// If pixelNumber is a string or an instance of Error, handle it accordingly
			if (typeof pixelNumber == 'string') {
				res.status(400).json({ error: pixelNumber })
				return
			}
			if (pixelNumber instanceof Error) throw pixelNumber

			// Set the specified pixel with the specified color
			tempPixels[pixelNumber] = color
		}

		// Set the pixels array with the tempPixels array
		pixels.set(tempPixels)

		// Render the changes
		ws281x.render()

		// Send a 200 response with 'ok'
		res.status(200).json({ message: 'ok' })
	} catch (err) {
		console.log(err);
		// If an error occurs, send a 500 response with 'error'
		res.status(500).json({ error: 'There was a server error try again' })
	}
})

// Route to display a text with a specified text color and background color
app.post('/api/say', (req, res) => {
	try {
		// Extract text, textColor and backgroundColor from the request query
		let { text, textColor, backgroundColor } = req.query

		// If text, textColor or backgroundColor is not provided, send a response indicating the missing parameter
		if (!text) {
			res.status(400).json({ error: 'You did not provide any text' })
			return
		}
		if (!textColor) {
			res.status(400).json({ error: 'You did not provide any textColor' })
			return
		}
		if (!backgroundColor) {
			res.status(400).json({ error: 'You did not provide any backgroundColor' })
			return
		}

		// Convert textColor and backgroundColor from text to hex
		textColor = textToHexColor(textColor)
		backgroundColor = textToHexColor(backgroundColor)

		// If textColor or backgroundColor is a string or an instance of Error, send a 400 response with the problematic color
		if (typeof textColor == 'string') {
			res.status(400).json({ error: textColor })
			return
		}
		if (textColor instanceof Error) throw textColor
		if (typeof backgroundColor == 'string') {
			res.status(400).json({ error: backgroundColor })
			return
		}
		if (backgroundColor instanceof Error) throw backgroundColor

		let display = displayBoard(text, textColor, backgroundColor)
		if (!display) {
			res.status(500).json({ error: 'There was a server error try again' })
			return
		}
		boardIntervals.push(display)

		res.status(200).json({ message: 'ok' })
	} catch (err) {
		// If an error occurs, send a 500 response with 'error'
		res.status(500).json({ error: 'There was a server error try again' })
	}
})

app.post('/api/getSounds', (req, res) => {
	try {
		let type = req.query.type

		if (type == 'bgm') res.status(200).json(sounds.bgm)
		else if (type == 'sfx') res.status(200).json(sounds.sfx)
		else if (type == null) res.status(200).json(sounds)
		else res.status(400).json({ error: 'Invalid type' })
	} catch (err) {
		// If an error occurs, send a 500 response with 'error'
		res.status(500).json({ error: 'There was a server error try again' })
	}
})

app.post('/api/playSound', (req, res) => {
	try {
		let { bgm, sfx } = req.query

		let sound = playSound({ bgm, sfx })

		if (typeof sound == 'string') {
			let status = 400
			if (sound.endsWith(' does not exist.')) status = 404

			res.status(400).json({ error: sound })
		} else if (sound == true) res.status(200).json({ message: 'ok' })
		else res.status(500).json({ error: 'There was a server error try again' })
	} catch (err) {
		// If an error occurs, send a 500 response with 'error'
		console.log(err);
		res.status(500).json({ error: 'There was a server error try again' })
	}
})
// frompix end

app.get('/', (request, response) => {
	response.render('index', {
		config,
		BOARD_WIDTH,
		BOARD_HEIGHT,
		pixels
	})
})

// formPix
// 404 Error
app.use((req, res, next) => {
	try {
		// Defines users desired endpoint
		let urlPath = req.url
		// Checks if url has a / in it and removes it from the string
		if (urlPath.indexOf('/') != -1) {
			urlPath = urlPath.slice(urlPath.indexOf('/') + 1)
		}
		// Check for ?(urlParams) and removes it from the string
		if (urlPath.indexOf('?') != -1) {
			urlPath = urlPath.slice(0, urlPath.indexOf('?'))
		}

		res.status(404).json({ error: `The endpoint ${urlPath} does not exist` })
	} catch (err) {
		res.status(500).json({ error: 'There was a server error try again' })
	}
})
// formPix end


// Socket
// formPix - change socket to socket
// Listen for 'connect_error' event on the socket
socket.on('connect_error', (error) => {
	// If the error message is 'xhr poll error', log 'no connection' to the console
	if (error.message == 'xhr poll error') console.log('no connection');
	// Otherwise, log the error message to the console
	else console.log(error.message);

	// Set the connected flag to false
	connected = false

	// clear all board intervals
	boardIntervals = boardIntervals.filter(boardInterval => {
		clearInterval(boardInterval.interval);
		return false
	})

	fill(0x000000)
	// Render the changes
	ws281x.render()

	// After 5 seconds, try to connect again
	setTimeout(() => {
		socket.connect()
	}, 5000)
})

// Listen for 'connect' event on the socket
socket.on('connect', () => {
	// Log 'connected' to the console
	console.log('connected')

	// Set the connected flag to true
	connected = true

	// Display the board with the IP address, white color, black background, and true for the clear flag
	let display = displayBoard(config.formbarUrl.split('://')[1], 0xFFFFFF, 0x000000)
	if (!display) return
	boardIntervals.push(display)

	// Play the bootup sound effect
	player.play('./sfx/sfx_bootup02.wav')
})

// Listen for 'setClass' event from the socket
socket.on('setClass', (userClass) => {
	// If the userClass is 'noClass'
	if (userClass == 'noClass') {
		// Set classCode to an empty string
		classCode = ''

		// Clear the bar
		fill(0x000000, 0, config.barPixels)

		// Display the board with the specified parameters
		let display = displayBoard(config.formbarUrl.split('://')[1], 0xFFFFFF, 0x000000)
		if (!display) return
		boardIntervals.push(display)

		ws281x.render()
	} else {
		// If the userClass is not 'noClass', set classCode to userClass
		classCode = userClass
		// Emit 'vbUpdate' event to the socket
		socket.emit('vbUpdate')
		socket.emit('vbTimer')
	}
	console.log('Moved to class:', userClass);
})

socket.on('vbUpdate', (newPollData) => {
	let pixelsPerStudent
	let text = ''
	let pollText = 'Poll'
	let pollResponses = 0
	let blind = newPollData.blind
	let specialDisplay = false

	// If new poll data is the same as the old, return
	if (util.isDeepStrictEqual(newPollData, pollData)) return

	// If the poll status is false, clear the display and return
	if (!newPollData.status) {
		fill(0x000000, 0, config.barPixels)

		let display = displayBoard(config.formbarUrl.split('://')[1], 0xFFFFFF, 0x000000)
		if (display) {
			boardIntervals.push(display)
			ws281x.render()
		}

		pollData = newPollData
		return
	}

	// Count total poll responses
	for (let poll of Object.values(newPollData.polls)) {
		pollResponses += poll.responses
	}

	if (!timerData.active) {
		// Set the initial fill color
		fill(0x808080, 0, config.barPixels)

		// Convert colors from hex to integers for each poll
		for (let poll of Object.values(newPollData.polls)) {
			poll.color = parseInt(poll.color.slice(1), 16)
		}

		// If total students equals poll responses, play specific sounds and display messages based on the prompt
		if (pollResponses == newPollData.totalResponders && pollResponses > 0 && !newPollData.multiRes) {
			blind = false

			if (newPollData.prompt == 'Thumbs?') {
				fill(0x000000, config.barPixels)
				specialDisplay = true

				if (newPollData.polls.Up.responses == newPollData.totalResponders) {
					gradient(0x0000FF, 0xFF0000, 0, config.barPixels)
					let display = displayBoard('Max Gamer', 0x00FF00, 0x000000)
					if (!display) return
					boardIntervals.push(display)
					player.play('./sfx/sfx_success01.wav')

					return
				} else if (newPollData.polls.Wiggle.responses == newPollData.totalResponders) {
					player.play('./sfx/bruh.wav')

					let text = [
						'Wiggle Nation: Where democracy meets indecision!',
						'Wiggle-o-mania: The cure for decision-making paralysis!'
					]

					text = text[Math.floor(Math.random() * text.length)]

					let display = displayBoard(text, 0x00FFFF, 0x000000)
					if (!display) return
					boardIntervals.push(display)
				} else if (newPollData.polls.Down.responses == newPollData.totalResponders) {
					player.play('./sfx/wompwomp.wav')
					let display = displayBoard('Git Gud', 0xFF0000, 0x000000)
					if (!display) return
					boardIntervals.push(display)
				}
			}
		}

		// Count non-empty polls
		let nonEmptyPolls = -1
		for (let poll of Object.values(newPollData.polls)) {
			if (poll.responses > 0) {
				nonEmptyPolls++
			}
		}

		// Calculate pixels per student, considering non-empty polls
		if (newPollData.totalResponders <= 0) pixelsPerStudent = 0
		else pixelsPerStudent = Math.floor((config.barPixels - nonEmptyPolls) / newPollData.totalResponders) - 1

		// Add polls to the display
		let currentPixel = 0
		let pollNumber = 0
		for (let poll of Object.values(newPollData.polls)) {
			// For each response
			for (let responseNumber = 0; responseNumber < poll.responses; responseNumber++) {
				let color = poll.color
				if (blind) color = 0xFF8000

				// Set response to color
				fill(color, currentPixel, pixelsPerStudent)
				currentPixel += pixelsPerStudent

				// Set spacers
				if (
					responseNumber < poll.responses - 1 ||
					pollNumber < nonEmptyPolls
				) {
					pixels[currentPixel] = 0xFF0080
					currentPixel++
				}
			}

			// If not in blind mode and there are responses, increment current pixel
			if (
				!blind &&
				poll.responses > 0
			) currentPixel++
			pollNumber++
		}
	}

	// Set the display text based on the prompt and poll responses
	if (!specialDisplay) {
		text = `${pollResponses}/${newPollData.totalResponders} `
		if (newPollData.prompt) pollText = newPollData.prompt

		fill(0x000000, config.barPixels + getStringColumnLength(text + pollText) * BOARD_HEIGHT)

		let display = displayBoard(text, 0xFFFFFF, 0x000000)
		if (display) boardIntervals.push(display)

		display = displayBoard(pollText, 0xFFFFFF, 0x000000, getStringColumnLength(text))
		if (display) boardIntervals.push(display)
	}

	// Update poll data
	pollData = newPollData

	// Render the changes
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

// Listen for 'vbTimer' event from the socket
socket.on('vbTimer', (newTimerData) => {
	// Return if no new timer data is received
	if (!newTimerData) return

	// If timer is not active, reset the display and update the timer data
	if (!newTimerData.active) {
		if (timerData.active) {
			fill(0x000000, 0, config.barPixels)
			ws281x.render()
			socket.emit('vbUpdate')
			timerData = newTimerData
		}
		return
	}

	// If timer is active, calculate and display the time left
	// If no time is left, display the timer as expired
	if (newTimerData.timeLeft > 0) {
		let timeLeftPixels = Math.round(config.barPixels * (newTimerData.timeLeft / newTimerData.startTime))
		fill(0x0000ff, 0, timeLeftPixels)
		fill(0xffffff, timeLeftPixels, config.barPixels - timeLeftPixels)
	} else {
		fill(0xff0000, 0, config.barPixels)
	}

	// Update the timer data and render the changes
	timerData = newTimerData
	ws281x.render()
})

socket.on('timerSound', () => {
	player.play('./sfx/alarmClock.mp3')
})
// formPix end


// Start the HTTP server and listen on the port specified in the configuration
httpServer.listen(config.port, async () => {
	// Log a message to the console indicating the port number the server is running on
	console.log(`Server running on port: ${config.port}`)
})
