/**
 * Socket event handler for poll updates
 */

const logger = require('../utils/logger');
const util = require('util');
const { fill, gradient } = require('../utils/pixelOps');
const { displayBoard, getStringColumnLength } = require('../utils/displayUtils');
const { playSound, player } = require('../utils/soundUtils');
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
 * @typedef {{ poll: Record<string, unknown> }} ClassroomData
 */

/**
 * Handle class update with poll data
 * @returns {(classroomData: ClassroomData) => void} Class update callback
 */
function handleClassUpdate() {
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

		logger.debug('Class update received', { pollStatus: newPollData.status, pollPrompt: newPollData.prompt });
		const wasPollVisible = !!(pollData.status || (pollData.responses && Object.keys(pollData.responses).length > 0));
		const pollIsVisible = !!(newPollData.status || (newPollData.responses && Object.keys(newPollData.responses).length > 0));
		state.pollLockActive = pollIsVisible;

		// On poll start, kill animations and clear the whole display first.
		if (!wasPollVisible && pollIsVisible) {
			stopAnimationsAndClearDisplay(state)
		}

		// Only clear the bar when poll is cleared (by the teacher), not when it's just ended
		if (!newPollData.status && (!newPollData.responses || Object.keys(newPollData.responses).length === 0)) {
			state.pollLockActive = false;
			state.lastPollBoardRenderKey = null
			fill(pixels, 0x000000, 0, config.barPixels)

			let display = displayBoard(pixels, config.formbarUrl.split('://')[1], 0xFFFFFF, 0x000000, config, boardIntervals, ws281x)
			if (display) {
				boardIntervals.push(display)
				ws281x.render()
			}

			state.pollData = newPollData
			return
		}

		// Continue processing if poll has responses (whether active or ended)
		if (newPollData.status || (newPollData.responses && Object.keys(newPollData.responses).length > 0)) {
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

			// if (newPollData.totalResponses === 6 && newPollData.totalResponders === 9) {
			// 	if (player) player.play('./sfx/memeSFX/noice.wav')
			// }

			// if (newPollData.totalResponses === 6 && newPollData.totalResponders === 7) {
			// 	if (player) player.play('./sfx/memeSFX/brainrot.wav')
			// }

			// if (newPollData.totalResponses === 4 && newPollData.totalResponders === 20) {
			// 	if (player) player.play('./sfx/memeSFX/snoop.wav')
			if (!timerData.active) {
				fill(pixels, 0x808080, 0, config.barPixels)

				for (let poll of Object.values(newPollData.responses)) {
					poll.color = parseInt(poll.color.slice(1), 16)
				}

				if (pollResponses == newPollData.totalResponders && pollResponses > 0 && !newPollData.multiRes) {
					blind = false

					if (newPollData.prompt == 'Thumbs?') {
						fill(pixels, 0x000000, config.barPixels)

						const findResponse = (answerText) => {
							return responsesArray.find(r => r.answer === answerText)
						}

						const upResponses = findResponse('Up')
						if (upResponses && upResponses.responses == newPollData.totalResponders) {
							gradient(pixels, 0x0000FF, 0xFF0000, 0, config.barPixels)
							let text = [
								'Max Gamer',
								'Skibidi Rizz!',
								'Plus 100 Aura'
							]
							let display = displayBoard(pixels, text[Math.floor(Math.random() * text.length)], 0x00FF00, 0x000000, config, boardIntervals, ws281x)
							if (!display) return
							boardIntervals.push(display)

							playSound({ formbar: 'sfx_success01.wav' });

							specialDisplay = true
							return
						}

						const wiggleResponse = findResponse('Wiggle')
						if (wiggleResponse && wiggleResponse.responses == newPollData.totalResponders) {
							playSound({ meme: 'bruh.wav' });

							let text = [
								'Wiggle Nation: Where democracy meets indecision!',
								'Wiggle-o-mania: The cure for decision-making paralysis!',
								'Wiggle Wiggle Wiggle'
							]

							text = text[Math.floor(Math.random() * text.length)]

							let display = displayBoard(pixels, text, 0x00FFFF, 0x000000, config, boardIntervals, ws281x)
							if (!display) return
							boardIntervals.push(display)
							specialDisplay = true
						}

						const downResponse = findResponse('Down')
						if (downResponse && downResponse.responses == newPollData.totalResponders) {
							playSound({ meme: 'womp-womp.wav' });
							let text = [
								'Git Gud lol',
								'Skill Issue',
								'Guh, Buh, Fluh, do better',
								'Imagine getting all downs, could never be me'
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
			}
		}

		if (!specialDisplay) {
			text = `${newPollData.totalResponses}/${newPollData.totalResponders} `
			if (newPollData.prompt) pollText = newPollData.prompt
			const nextBoardRenderKey = `${text}|${pollText}`
			const shouldRedrawBoard = state.lastPollBoardRenderKey !== nextBoardRenderKey || boardIntervals.length === 0

			if (shouldRedrawBoard) {
				const boardStartPixel = config.barPixels
				const boardLength = config.boards * 32 * 8
				fill(pixels, 0x000000, boardStartPixel, boardLength)

				let display = displayBoard(pixels, text, 0xFFFFFF, 0x000000, config, boardIntervals, ws281x)
				if (display) boardIntervals.push(display)

				display = displayBoard(pixels, pollText, 0xFFFFFF, 0x000000, config, boardIntervals, ws281x, getStringColumnLength(text))
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


module.exports = {
	handleClassUpdate
};