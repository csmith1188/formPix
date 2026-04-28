/**
 * Socket event handler for poll updates
 */

const logger = require('../utils/logger');
const util = require('util');
const { fill, gradient } = require('../utils/pixelOps');
const { displayBoard, getStringColumnLength } = require('../utils/displayUtils');
const PIXELS_PER_LETTER = 5;

/**
 * Stop active animations and clear the full display (bar + boards).
 * @param {import('../state')} state - Global state object
 */
function stopAnimationsAndClearDisplay(state) {
	const { pixels, ws281x, boardIntervals } = state
	const raveController = require('../controllers/raveControllers')
	const pixelControllers = require('../controllers/pixelControllers')

	if (raveController.currentRaveInterval) {
		clearInterval(raveController.currentRaveInterval)
		raveController.currentRaveInterval = null
	}

	pixelControllers.stopProgressAnimation()

	for (let boardInterval of boardIntervals) {
		if (boardInterval && boardInterval.interval) {
			clearInterval(boardInterval.interval)
		}
	}
	boardIntervals.length = 0

	fill(pixels, 0x000000, 0, pixels.length)
	ws281x.render()
}

/**
 * @typedef {{fetchSockets: () => Promise<Array<{emit: (event: string, payload?: unknown) => void}>>}} WebIo
 * @typedef {{ poll: Record<string, unknown> }} ClassroomData
 */

/**
 * Emit a sound file to all connected browser clients.
 * @param {WebIo} webIo - Socket.io server instance.
 * @param {string} file - Relative sound file path.
 * @returns {Promise<void>} Resolves after all emits complete.
 */
async function emitSoundToWebClients(webIo, file) {
	let sockets = await webIo.fetchSockets()
	for (let socket of sockets) socket.emit('play', file)
}

/**
 * Handle class update with poll data
 * @param {WebIo} webIo socket.io server instance
 * @returns {(classroomData: ClassroomData) => void} Class update callback
 */
function handleClassUpdate(webIo) {
	return (classroomData) => {
		const state = require('../state');
		const { pixels, config, boardIntervals, ws281x, pollData, timerData } = state;
		const newPollData = classroomData.poll
		let text = ''
		let pollText = 'Poll'
		let pollResponses = 0
		let blind = newPollData.blind
		let specialDisplay = false

		if (util.isDeepStrictEqual(newPollData, pollData)) return

		const responseCount = newPollData.responses ? Object.keys(newPollData.responses).length : 0;
		logger.debug(`Formbar classUpdate: status=${newPollData.status}, prompt="${newPollData.prompt || ''}", responses=${newPollData.totalResponses}/${newPollData.totalResponders}, options=${responseCount}, timerActive=${timerData.active}`);
		const wasPollVisible = !!(pollData.status || (pollData.responses && Object.keys(pollData.responses).length > 0));
		const pollIsVisible = !!(newPollData.status || (newPollData.responses && Object.keys(newPollData.responses).length > 0));
		state.pollLockActive = pollIsVisible;

		// On poll start, kill animations and clear the whole display first.
		if (!wasPollVisible && pollIsVisible) {
			stopAnimationsAndClearDisplay(state)
		}

		// Only clear the bar when poll is cleared (no responses), not when it's just ended
		if (!newPollData.status && (!newPollData.responses || Object.keys(newPollData.responses).length === 0)) {
			state.pollLockActive = false;
			state.lastPollBoardRenderKey = null
			if (wasPollVisible) {
				fill(pixels, 0x000000, 0, config.barPixels)

				let display = displayBoard(pixels, config.formbarUrl.split('://')[1], 0xFFFFFF, 0x000000, config, boardIntervals, ws281x)
				if (display) {
					boardIntervals.push(display)
					ws281x.render()
				}
			}

			state.pollData = newPollData
			return
		}

		// Continue processing if poll has responses (whether active or ended)
		if (newPollData.status || (newPollData.responses && Object.keys(newPollData.responses).length > 0)) {
			/**
			 * Normalize poll responses to array format.
			 * @returns {Array<{answer?: string, responses: number, color?: string|number}>} Poll responses array.
			 */
			const getResponsesArray = () => {
				if (Array.isArray(newPollData.responses)) {
					return newPollData.responses
				} else {
					return Object.values(newPollData.responses)
				}
			}

			const responsesArray = getResponsesArray()

			for (let poll of Object.values(newPollData.responses)) {
				pollResponses += poll.responses
			}

			if (newPollData.totalResponses === 4 && newPollData.totalResponders === 20) {
				emitSoundToWebClients(webIo, './sfx/memeSFX/snoop.wav')
			}

			if (newPollData.totalResponses === 6 && newPollData.totalResponders === 9) {
				emitSoundToWebClients(webIo, './sfx/memeSFX/noice.wav')
			}

			if (newPollData.totalResponses === 6 && newPollData.totalResponders === 7) {
				emitSoundToWebClients(webIo, './sfx/memeSFX/brainrot.wav')
			}

			if (!timerData.active) {
				fill(pixels, 0x808080, 0, config.barPixels)

				for (let poll of Object.values(newPollData.responses)) {
					poll.color = parseInt(poll.color.slice(1), 16)
				}

				if (pollResponses == newPollData.totalResponders && pollResponses > 0 && !newPollData.multiRes) {
					blind = false

					if (newPollData.prompt == 'Thumbs?') {
						fill(pixels, 0x000000, config.barPixels)

						/**
						 * Find a response object by answer text.
						 * @param {string} answerText - Answer label to match.
						 * @returns {{answer?: string, responses: number, color?: string|number}|undefined} Matching response.
						 */
						const findResponse = (answerText) => {
							return responsesArray.find(r => r.answer === answerText)
						}

						const upResponses = findResponse('Up')
						if (upResponses && upResponses.responses == newPollData.totalResponders && newPollData.totalResponders > 0) {
							gradient(pixels, 0x0000FF, 0xFF0000, 0, config.barPixels)
							let text = ['Max Gamer', 'Skibidi Rizz!']
							let display = displayBoard(pixels, text[Math.floor(Math.random() * text.length)], 0x00FF00, 0x000000, config, boardIntervals, ws281x)
							if (!display) return
							boardIntervals.push(display)

							emitSoundToWebClients(webIo, './sfx/formbarSFX/sfx_success01.wav')

							specialDisplay = true
							return
						}

						const wiggleResponse = findResponse('Wiggle')
						if (wiggleResponse && wiggleResponse.responses == newPollData.totalResponders) {
							emitSoundToWebClients(webIo, './sfx/memeSFX/bruh.wav')

							let text = [
								'Wiggle Nation: Where democracy meets indecision!',
								'Wiggle-o-mania: The cure for decision-making paralysis!'
							]

							text = text[Math.floor(Math.random() * text.length)]

							let display = displayBoard(pixels, text, 0x00FFFF, 0x000000, config, boardIntervals, ws281x)
							if (!display) return
							boardIntervals.push(display)

							specialDisplay = true
						}

						const downResponse = findResponse('Down')
						if (downResponse && downResponse.responses == newPollData.totalResponders) {
							emitSoundToWebClients(webIo, './sfx/memeSFX/wompwomp.wav')
							let text = [
								'Git Gud',
								'Skill Issue',
								'L + Ratio'
							]
							let display = displayBoard(pixels, text[Math.floor(Math.random() * text.length)], 0xFF0000, 0x000000, config, boardIntervals, ws281x)
							if (!display) return
							boardIntervals.push(display)

							specialDisplay = true
						}
					}
				}

				let nonEmptyPolls = -1
				for (let poll of Object.values(newPollData.responses)) {
					if (poll.responses > 0) {
						nonEmptyPolls++
					}
				}

				let totalResponses = 0
				for (let poll of Object.values(newPollData.responses)) {
					totalResponses += poll.responses
				}

				// Reserve one visible slot per responder so unanswered votes stay empty on the bar.
				const totalVoteSlots = Number(newPollData.totalResponders) || 0
				const dividerCount = totalVoteSlots > 0 ? totalVoteSlots - 1 : 0
				const availablePixelsForResponses = Math.max(0, config.barPixels - dividerCount)
				const pixelsPerStudent = totalVoteSlots > 0 ? Math.floor(availablePixelsForResponses / totalVoteSlots) : 0
				let remainingVoteSlots = totalVoteSlots

				let currentPixel = 0
				let pollNumber = 0
				for (let poll of Object.values(newPollData.responses)) {
					for (let responseNumber = 0; responseNumber < poll.responses; responseNumber++) {
						if (remainingVoteSlots <= 0) break
						let color = poll.color

						if (blind) color = 0xFF8000

						let pixelsToFill = Math.min(pixelsPerStudent, config.barPixels - currentPixel)

						if (pixelsToFill <= 0) break

						fill(pixels, color, currentPixel, pixelsToFill)

						currentPixel += pixelsToFill
						remainingVoteSlots--

						const isLastResponse = responseNumber === poll.responses - 1 && pollNumber >= nonEmptyPolls
						if (!blind && !isLastResponse) {
							if (currentPixel < config.barPixels) {
								pixels[currentPixel] = 0xFF0080
								currentPixel++
							}
						}
					}
					pollNumber++
				}

				if (!specialDisplay) {
					const calculatedTotalResponses = Object.values(newPollData.responses || {}).reduce((sum, poll) => {
						return sum + (Number(poll.responses) || 0)
					}, 0)
					const normalizedTotalResponses = Number.isFinite(Number(newPollData.totalResponses))
						? Number(newPollData.totalResponses)
						: calculatedTotalResponses
					const normalizedTotalResponders = Number.isFinite(Number(newPollData.totalResponders))
						? Number(newPollData.totalResponders)
						: Number(pollData.totalResponders) || calculatedTotalResponses

					text = `${normalizedTotalResponses}/${normalizedTotalResponders} `
					if (newPollData.prompt) pollText = newPollData.prompt
					const nextBoardRenderKey = `${text}|${pollText}`
					const counterColumns = getStringColumnLength(text)
					let display = displayBoard(pixels, text, 0xFFFFFF, 0x000000, config, boardIntervals, ws281x)
					if (display) boardIntervals.push(display)

					const hasPollPromptDisplay = boardIntervals.some((boardInterval) => {
						return boardInterval
							&& boardInterval.string === pollText
							&& boardInterval.startColumn === counterColumns
					})
					const shouldRedrawBoard =
						state.lastPollBoardRenderKey !== nextBoardRenderKey
						|| boardIntervals.length === 0
						|| !hasPollPromptDisplay

					if (shouldRedrawBoard) {
						display = displayBoard(pixels, pollText, 0xFFFFFF, 0x000000, config, boardIntervals, ws281x, counterColumns)
						if (display) boardIntervals.push(display)

						state.lastPollBoardRenderKey = nextBoardRenderKey
					}
				} else {
					state.lastPollBoardRenderKey = null
				}

				state.pollData = newPollData

				ws281x.render()
			}
		}
	}
}

module.exports = {
	handleClassUpdate
};