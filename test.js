const player = require('play-sound')({ player: 'omxplayer' })

let originalPlayer = { ...player };

player.play = (what, options = {}) => {
	options.omxplayer = ['-o', 'local'];

	originalPlayer.play(what, options);
}


player.play('./bgm/amongusdrip.mp3')
// player.play('./bgm/amongusdrip.mp3', { omxplayer: ['-o', 'local'] })