/**
 * IR Remote Controller for FormPix
 * Node.js conversion of the Python IR remote scripts
 * Uses a Worker Thread for blocking GPIO reads so the main
 * event loop stays free for lights, server, and sockets.
 */

const { Worker } = require('worker_threads');
const path = require('path');
const state = require('../state');

// IR button codes (hex values)
const BUTTONS = {
    'power': 0xffa25d,
    'vol_up': 0xff629d,
    'func': 0xffe21d,
    'rewind': 0xff22dd,
    'play_pause': 0xff02fd,
    'forward': 0xffc23d,
    'down': 0xffe01f,
    'vol_down': 0xffa857,
    'up': 0xff906f,
    '0': 0xff6897,
    'eq': 0xff9867,
    'repeat': 0xffb04f,
    '1': 0xff30cf,
    '2': 0xff18e7,
    '3': 0xff7a85,
    '4': 0xff10ef,
    '5': 0xff38c7,
    '6': 0xff5aa5,
    '7': 0xff42bd,
    '8': 0xff4ab5,
    '9': 0xff52ad
};

// Poll presets for each button
const POLL_PRESETS = {
    '1': {
        title: 'Done/Ready',
        answers: [{ answer: 'Done/ready?', weight: 1, color: '#00ff00' }]
    },
    '2': {
        title: 'True/False',
        answers: [
            { answer: 'True', weight: 1, color: '#00ff00' },
            { answer: 'False', weight: 1, color: '#ff0000' }
        ]
    },
    '3': {
        title: 'TUTD',
        answers: [
            { answer: 'Up', weight: 1, color: '#00ff00' },
            { answer: 'Wiggle', weight: 1, color: '#00ffff' },
            { answer: 'Down', weight: 1, color: '#ff0000' }
        ]
    },
    '4': {
        title: 'Multiple Choice',
        answers: [
            { answer: 'A', weight: 1, color: '#ff0000' },
            { answer: 'B', weight: 1, color: '#00ff00' },
            { answer: 'C', weight: 1, color: '#ffff00' },
            { answer: 'D', weight: 1, color: '#0000ff' }
        ]
    },
    '5': {
        title: 'Essay',
        answers: [{ answer: 'Submit Text', weight: 1, color: '#ff0000' }],
        type: 1 // Essay type
    }
};

class IRRemote {
    constructor(socket, pin = 27) {
        this.socket = socket;
        this.pin = pin;
        this.lastCode = null;
        this.lastPressTime = 0;
        this.debounceMs = 200;
        this.running = false;
        this.worker = null;
    }

    /**
     * Initialize the IR remote listener
     */
    start() {
        const parsedPin = Number.parseInt(this.pin, 10);
        if (!Number.isInteger(parsedPin) || parsedPin < 0) {
            console.error(`[IR Remote] Invalid pin "${this.pin}" - skipping IR initialization`);
            return false;
        }
        this.pin = parsedPin;

        try {
            try {
                require.resolve('rpio');
            } catch {
                console.warn(
                    '[IR Remote] Disabled: rpio is not installed (skipped optional dependency or wrong platform). ' +
                    'On a Raspberry Pi run `npm install`. Set irPin=-1 in .env to silence this.'
                );
                return false;
            }

            this.worker = new Worker(path.join(__dirname, 'irWorker.js'), {
                workerData: { pin: this.pin }
            });

            this.worker.on('message', (msg) => {
                if (msg.type === 'ready') {
                    this.running = true;
                    console.log(`[IR Remote] Listening on GPIO pin ${msg.pin}`);
                } else if (msg.type === 'error') {
                    console.error(`[IR Remote] Worker error: ${msg.message}`);
                } else if (msg.type === 'debug') {
                    console.log(`[IR Remote] ${msg.message}`);
                } else if (msg.type === 'signal') {
                    this._handleSignal(msg.code);
                }
            });

            this.worker.on('error', (err) => {
                console.error(`[IR Remote] Worker crashed: ${err.message}`);
                this.running = false;
            });

            this.worker.on('exit', (code) => {
                if (code !== 0) {
                    console.error(`[IR Remote] Worker exited with code ${code}`);
                }
                this.running = false;
            });

            return true;
        } catch (err) {
            console.error(`[IR Remote] Failed to start: ${err.message}`);
            return false;
        }
    }

    /**
     * Handle a decoded IR signal from the worker
     */
    _handleSignal(binarySignal) {
        const hexSignal = '0x' + binarySignal.toString(16);
        console.log(`[IR Remote] Received: ${hexSignal}`);

        // Debounce
        const now = Date.now();
        if (binarySignal === this.lastCode && now - this.lastPressTime < this.debounceMs) {
            return;
        }
        this.lastCode = binarySignal;
        this.lastPressTime = now;

        // Find matching button
        for (const [name, code] of Object.entries(BUTTONS)) {
            if (binarySignal === code) {
                console.log(`[IR Remote] Button: ${name}`);
                this.executeAction(name);
                return;
            }
        }

        console.log(`[IR Remote] Unknown code: ${hexSignal}`);
    }

    /**
     * Execute action for a button press
     */
    executeAction(buttonName) {
        if (!this.socket || !this.socket.connected) {
            console.log('[IR Remote] Socket not connected - cannot execute action');
            return;
        }

        const preset = POLL_PRESETS[buttonName];

        if (preset) {
            try {
                // Object form (preferred): matches formbar startPoll API
                this.socket.emit('startPoll', {
                    prompt: preset.title,
                    answers: preset.answers,
                    blind: false,
                    weight: 1,
                    tags: [],
                    excludedRespondents: [],
                    indeterminate: [],
                    allowVoteChanges: true,
                    allowTextResponses: preset.type === 1,
                    allowMultipleResponses: true
                });
                console.log(`[IR Remote] Started poll: ${preset.title}`);
            } catch (err) {
                console.error('[IR Remote] Failed to emit "startPoll":', err);
            }
        } else if (buttonName === 'play_pause') {
            try {
                const pollEnded = state.pollData && state.pollData.status === false;
                if (pollEnded) {
                    this.socket.emit('updatePoll', {});
                    console.log('[IR Remote] updatePoll {} (poll already ended)');
                } else {
                    this.socket.emit('updatePoll', { status: false });
                    console.log('[IR Remote] updatePoll { status: false } (end poll)');
                }
            } catch (err) {
                console.error('[IR Remote] Failed to emit "updatePoll":', err);
            }
        }
    }

    /**
     * Stop the IR remote listener
     */
    stop() {
        this.running = false;

        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }

        console.log('[IR Remote] Stopped');
    }
}

module.exports = { IRRemote, BUTTONS, POLL_PRESETS };
