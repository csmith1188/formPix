/**
 * Socket event handler for timer updates
 */

const logger = require('../utils/logger');
const { fill } = require('../utils/pixelOps');

/**
 * Handle timer updates
 * @returns {(newTimerData: {timeLeft: number, startTime: number, active: boolean, sound?: boolean}) => void} Timer event callback.
 */
function handleVBTimer() {
	/**
	 * Apply incoming timer state to the LED bar.
	 * @param {{timeLeft: number, startTime: number, active: boolean, sound?: boolean}} newTimerData - Timer payload.
	 * @returns {void}
	 */
	return (newTimerData) => {
		const state = require('../state');
		const { pixels, config, ws281x, socket } = state;
		
		if (!newTimerData) return

		// Handle timer deactivation: clear bar if it was active
		if (!newTimerData.active) {
			if (state.timerData.active) {
				logger.info('Timer ended');
				fill(pixels, 0x000000, 0, config.barPixels)
				ws281x.render()

				state.pollData = {}
				socket.emit('classUpdate')
				
				state.timerData = newTimerData
			}
			return
		}

		logger.debug(`Formbar vbTimer: timeLeft=${newTimerData.timeLeft}s / ${newTimerData.startTime}s`);

		if (newTimerData.timeLeft > 0) {
			// Calculate pixels to fill based on remaining time ratio
			let timeLeftPixels = Math.round(config.barPixels * (newTimerData.timeLeft / newTimerData.startTime))
			fill(pixels, 0x0000ff, 0, timeLeftPixels)
			fill(pixels, 0xffffff, timeLeftPixels, config.barPixels - timeLeftPixels)
		} else {
			// Time is up: fill bar with red
			fill(pixels, 0xff0000, 0, config.barPixels)
		}

		state.timerData = newTimerData
		ws281x.render()
	}
}

module.exports = {
	handleVBTimer
};
