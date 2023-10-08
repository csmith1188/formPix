const ws281x = require('rpi-ws281x-native') // this changes the pixels
const { io } = require('socket.io-client')
const sharp = require('sharp') // this converts text to an image
const fs = require('fs')

// config
const config = JSON.parse(
	fs.readFileSync('settings.json')
)

const maxPixels = config.barPixels + config.board.height * config.board.width

// set up strip settings
let strip = ws281x(maxPixels, {
	dma: 10,
	freq: 800000,
	gpio: config.pin,
	invert: false,
	brightness: config.brightness,
	stripType: ws281x.stripType[config.stripType]
})
let pixels = strip.array

// fill strip with color
// by default start is 0 and length is the whole strip
function fill(color, start = 0, length = pixels.length) {
	if (length >= pixels.length) length = pixels.length

	for (let i = 0; i < length; i++) {
		pixels[i + start] = color
	}
}

// skips every x item in an array
function skipNumber(array, skipAmount) {
	let result = []

	for (let i = 0; i < array.length; i += skipAmount) {
		result.push(array[i])
	}

	return result
}

// This function converts a 1D array into a 2D array with a specified height and width
function convertTo2DArray(oneDArray, height, width) {
	// Initialize a 2D array with the specified height and width, filled with 0s
	let twoDArray = new Array(height).fill(null).map(() => new Array(width).fill(0))
	// Initialize an index to keep track of the current element in the 1D array
	let index = 0

	// Iterate over the columns of the 2D array
	for (let col = 0; col < width; col++) {
		// Iterate over the rows of the 2D array
		for (let row = 0; row < height; row++) {
			// If the current index is within the bounds of the 1D array,
			if (index < oneDArray.length) {
				// assign the current element to the current position in the 2D array
				twoDArray[row][col] = oneDArray[index]
				// increment the index
				index++
			} else {
				// If the current index is out of bounds of the 1D array,
				// assign null to the current position in the 2D array
				twoDArray[row][col] = null
			}
		}
	}

	// Return the 2D array
	return twoDArray
}

// This function reverses the order of elements in each odd-indexed row of a 2D array
function reverseOddRowsIn2DArray(twoDArray) {
	// Iterate over each row in the 2D array
	for (let row = 0; row < twoDArray.length; row++) {
		// If the row index is odd (i.e., row is an odd-indexed row)
		if (row % 2 == 1) {
			// Reverse the order of elements in the row
			twoDArray[row].reverse()
		}
	}
	// Return the modified 2D array
	return twoDArray
}

// This function transposes a 2D array, i.e., it swaps its rows and columns
function transposeArray(array, height, width) {
	// Initialize a new 2D array filled with 0s, with dimensions (width x height)
	let transposedArray = Array.from({ length: width }, () => Array(height).fill(0))
	// Iterate over each row in the original 2D array
	for (let row = 0; row < height; row++) {
		// Iterate over each column in the original 2D array
		for (let col = 0; col < width; col++) {
			// Copy the element from the original 2D array to the transposed 2D array
			// but in a transposed manner, i.e., array[row][col] becomes transposedArray[col][row]
			transposedArray[col][row] = array[row][col]
		}
	}
	// Return the transposed 2D array
	return transposedArray
}

// convert string to image
async function displayBoard(string, textColor, backgroundColor) {
	let boardPixels = []

	try {
		// convert the string to an image
		let image = await sharp({
			text: {
				text: string,
				font: 'Consolas',
				height: config.board.height,
				width: config.board.width,
			}
		})
			.threshold() // makes the image binary black/white

		if (config.board.rotate)
			image = image.rotate(config.board.rotate)
		if (
			config.board.flip == 'vertical' ||
			config.board.flip == 'v' ||
			config.board.flip == 'both'
		)
			image = image.flip()
		else if (
			config.board.flip == 'horizontal' ||
			config.board.flip == 'h' ||
			config.board.flip == 'both'
		)
			image = image.flop()


		let metadata = await image.metadata()
		image.toFile(`./test.png`) // test

		// get bytes of image
		let buffer = await image.toBuffer()

		let x = 0
		let y = 0
		fs.writeFileSync('test.json', JSON.stringify({
			metadata: metadata,
			buffer: buffer
		}))

		boardPixels = skipNumber(buffer, 3)
		boardPixels = convertTo2DArray(boardPixels, config.board.height, config.board.width)
		boardPixels = transposeArray(boardPixels, config.board.height, config.board.width)
		boardPixels = reverseOddRowsIn2DArray(boardPixels)
		boardPixels = boardPixels.flat()

		for (let pixel = 0; pixel < boardPixels.length; pixel++) {
			if (boardPixels[pixel] == 255) boardPixels[pixel] = textColor
			else if (boardPixels[pixel] == 0) boardPixels[pixel] = backgroundColor
			else boardPixels[pixel] = 0x000000
		}

		for (let currentPixel = 0; currentPixel < boardPixels.length; currentPixel++) {
			pixels[currentPixel + config.barPixels + 8] = boardPixels[currentPixel]
		}
		ws281x.render()

	} catch (error) {
		console.log(string, error)
	}
}

// clear pixels
fill(0x000000)
ws281x.render()

// set web socket url
const socket = io(config.ip, {
	query: {
		api: config.api,
		classCode: config.classCode
	}
})

// when there is a connection error it tys to reconnect
socket.on('connect_error', (err) => {
	console.log('connection error')

	fill(0x000000)
	ws281x.render()

	setTimeout(() => {
		socket.connect()
	}, 5000)
})

// when it connects to formBar it ask for the bars data
socket.on('connect', () => {
	console.log('connected')
	socket.emit('vbUpdate')
})

// when the bar changes
socket.on('vbUpdate', (pollsData) => {
	let pixelsPerStudent

	// if no poll clear pixels
	if (!pollsData.pollStatus) {
		fill(0x000000)
		ws281x.render()
		return
	}

	fill(0x808080, 0, config.barPixels)
	fill(0x000000, config.barPixels, config.board.height * config.board.width)

	// convert colors from hex to integers
	for (let pollData of Object.values(pollsData.polls)) {
		pollData.color = parseInt(pollData.color.slice(1), 16)
	}

	let pollResponses = 0

	// count poll responses
	for (let poll of Object.values(pollsData.polls)) {
		pollResponses += poll.responses
	}

	// if totalStudents = pollResponses turn off blind mode
	if (pollsData.totalStudents == pollResponses) {
		pollsData.blindPoll = false
		displayBoard('POGS', 0xFF0000, 0x0000FF)
	}

	// count non-empty polls
	let nonEmptyPolls = -1
	for (let poll of Object.values(pollsData.polls)) {
		if (poll.responses > 0) {
			nonEmptyPolls++
		}
	}

	if (pollsData.totalStudents <= 0) pixelsPerStudent = 0
	else pixelsPerStudent = Math.floor((config.barPixels - nonEmptyPolls) / pollsData.totalStudents) //- nonEmptyPolls

	// add polls
	let currentPixel = 0
	let pollNumber = 0

	for (let [name, poll] of Object.entries(pollsData.polls)) {
		// for each response
		for (let responseNumber = 0; responseNumber < poll.responses; responseNumber++) {
			let color = poll.color
			if (pollsData.blindPoll) color = 0xFF8000

			// set response to color
			fill(
				color,
				currentPixel,
				pixelsPerStudent
			)

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
			!pollsData.blindPoll &&
			poll.responses > 0
		) currentPixel++
		pollNumber++
	}

	ws281x.render()
})