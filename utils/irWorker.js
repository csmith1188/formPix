/**
 * IR Worker Thread for FormPix
 * Runs the blocking GPIO read loop in a separate thread
 * so it never blocks the main event loop.
 */

const { parentPort, workerData } = require('worker_threads');

let rpio;
try {
    rpio = require('rpio');
} catch (err) {
    const detail = err && err.message ? err.message : String(err);
    parentPort.postMessage({
        type: 'error',
        message: `rpio failed to load (${detail}). GPIO IR only works on Raspberry Pi with rpio installed; use irPin=-1 in .env to disable.`
    });
    process.exit(1);
}

const pin = workerData.pin || 27;
const verbose = Boolean(workerData && workerData.verbose);

try {
    rpio.init({ gpiomem: true, mapping: 'gpio' });
    rpio.open(pin, rpio.INPUT);
    parentPort.postMessage({ type: 'ready', pin });
} catch (err) {
    parentPort.postMessage({ type: 'error', message: err.message });
    process.exit(1);
}

function timeNow() {
    const [sec, nsec] = process.hrtime();
    return sec + nsec / 1e9;
}

/**
 * Wait for IR signal and return decoded integer value.
 * Direct port of the Python getBinary() function.
 */
function getBinary() {
    // Wait for pin to go LOW (start of IR signal), timeout after 1 second
    const timeout = timeNow() + 1;
    while (rpio.read(pin) === 1 && timeNow() < timeout) {
        rpio.usleep(500);
    }

    if (timeNow() >= timeout) {
        return null;
    }

    if (verbose) {
        parentPort.postMessage({ type: 'debug', message: 'Signal start detected (pin went LOW)' });
    }

    const pulses = [];
    const startTime = timeNow();

    // Read pulses for up to 200ms
    while (timeNow() - startTime < 0.2) {
        if (rpio.read(pin) === 1) {
            const highStart = timeNow();
            while (rpio.read(pin) === 1 && timeNow() - startTime < 0.2) {
                rpio.usleep(10);
            }
            const highDuration = Math.round((timeNow() - highStart) * 1000000);
            if (highDuration > 100) {
                pulses.push(highDuration);
            }
        }
        rpio.usleep(10);
    }

    if (verbose) {
        parentPort.postMessage({ type: 'debug', message: `Captured ${pulses.length} pulses` });
    }

    if (pulses.length < 33) {
        return null;
    }

    const dataPulses = pulses.slice(1, 33);
    let binary = '';
    for (const pulse of dataPulses) {
        binary += pulse > 1000 ? '1' : '0';
    }

    if (binary.length !== 32) {
        if (verbose) {
            parentPort.postMessage({ type: 'debug', message: `Bad binary length: ${binary.length}` });
        }
        return null;
    }

    try {
        const code = parseInt(binary, 2);
        if (verbose) {
            parentPort.postMessage({ type: 'debug', message: `Decoded: 0x${code.toString(16)}` });
        }
        return code;
    } catch (err) {
        return null;
    }
}

// Main loop — setImmediate keeps the worker event loop free to flush messages
function irLoop() {
    const signal = getBinary();
    if (signal !== null) {
        parentPort.postMessage({ type: 'signal', code: signal });
    }
    // Immediately schedule next read (setImmediate lets messages flush)
    setImmediate(irLoop);
}

if (verbose) {
    parentPort.postMessage({ type: 'debug', message: `Pin ${pin} initial read: ${rpio.read(pin)}` });
}

setImmediate(irLoop);
