const ws281x = require('rpi-ws281x-native') // this changes the pixels
const { io } = require('socket.io-client')
const fs = require('fs')
const { letters } = require('./letters.js')
const util = require('util');
const player = require('play-sound')()

let classCode = 'noClass'

// config
const config = JSON.parse(
	fs.readFileSync('settings.json')
)

// const maxPixels = config.barPixels + config.board.height * config.board.width
const maxPixels = config.barPixels

// set up strip settings
let strip = ws281x(maxPixels, {
	dma: 10,
	freq: 800000,
	gpio: config.pin,
	invert: false,
	brightness: config.brightness,
	stripType: ws281x.stripType[config.stripType]
})

// variables
let pixels = strip.array
let pollData = {}

// Functions
// fill strip with color
// by default start is 0 and length is the whole strip
function fill(color, start = 0, length = pixels.length) {
	if (length >= pixels.length) length = pixels.length

	for (let i = 0; i < length; i++) {
		pixels[i + start] = color
	}
}

function showString(boardPixels, start, textColor, backgroundColor, repeat) {
	let currentPixel = config.barPixels
	let currentColumn = start
	let maxColumns = 0

	if (start % 2 == 1) {
		for (let col of boardPixels) {
			col.reverse()
		}
	}


	if (repeat) {
		maxColumns = config.board.width
	}
	else maxColumns = boardPixels.length

	for (let i = 0; i < maxColumns; i++) {
		let col = boardPixels[currentColumn]

		for (let pixel of col) {
			if (pixel)
				pixels[currentPixel] = textColor
			else
				pixels[currentPixel] = backgroundColor
			currentPixel++
		}

		currentColumn++
		if (currentColumn >= boardPixels.length) currentColumn = 0
	}
}

function displayBoard(string, textColor, backgroundColor) {
	string = string.toLowerCase()

	let boardPixels = []
	for (let i = 0; i < string.length; i++) {
		let letter = string[i]
		let letterImage = letters[letter]

		for (let col of letterImage) {
			boardPixels.push(col)
		}
		boardPixels.push(Array(8).fill(0))
	}

	for (let i = 0; i < boardPixels.length; i++) {
		let col = boardPixels[i]

		if (i % 2 == 0)
			col = col.reverse()
	}

	if (boardPixels.length < config.board.width) {
		showString(boardPixels, 0, textColor, backgroundColor, false)

		ws281x.render()
	} else {
		let startColumn = 0

		setInterval(() => {
			showString(boardPixels, startColumn, textColor, backgroundColor, true)

			startColumn++
			if (startColumn >= boardPixels.length) startColumn = 0

			ws281x.render()
		}, 1000);
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
})

socket.on('setClass', (userClass) => {
	if (userClass == 'noClass') {
		classCode = ''
		fill(0x000000)
		ws281x.render()
	} else {
		classCode = userClass
		socket.emit('vbUpdate')
	}
})

// when the bar changes
socket.on('vbUpdate', (newPollData) => {
	let pixelsPerStudent

	// if no poll clear pixels
	if (!newPollData.status) {
		fill(0x000000)
		// displayBoard(config.ip, 0xFFFFFF, 0x000000)
		ws281x.render()
		return
	}

	fill(0x808080, 0, config.barPixels)

	// convert colors from hex to integers
	for (let poll of Object.values(newPollData.polls)) {
		poll.color = parseInt(poll.color.slice(1), 16)
	}

	let pollResponses = 0


	// count poll responses
	for (let poll of Object.values(newPollData.polls)) {
		pollResponses += poll.responses
	}

	// if totalStudents = pollResponses turn off blind mode
	if (newPollData.totalStudents == pollResponses) {
		newPollData.blind = false
	}

	if (!util.isDeepStrictEqual(newPollData.polls, pollData.polls)) {
		if (newPollData.prompt == 'Thumbs?') {
			if (newPollData.polls.Up.responses == newPollData.totalStudents) {
				player.play('./sfx/sfx_success01.wav')
			} else if (newPollData.polls.Wiggle.responses == newPollData.totalStudents) {
				player.play('./sfx/bruh.wav')
			} else if (newPollData.polls.Down.responses == newPollData.totalStudents) {
				player.play('./sfx/wompwomp.wav')
			}
		}
	}

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

socket.on('joinSound', () => {
	player.play('./sfx/sfx_up02.wav')
})