/**
 * Routes for pixel operations
 */

const express = require('express');
const router = express.Router();
const { fillController, fillByPercentController, gradientController, setPixelController, setPixelsController, progressController } = require('../controllers/pixelControllers');
const { raveController, raveStopController } = require('../controllers/raveControllers');
const cancelRave = require('../middleware/cancelRave');
const pollLock = require('../middleware/pollLock');

router.post('/fill', pollLock, cancelRave, fillController);
router.post('/fillByPercent', pollLock, cancelRave, fillByPercentController);
router.post('/gradient', pollLock, cancelRave, gradientController);
router.post('/setPixel', pollLock, cancelRave, setPixelController);
router.post('/setPixels', pollLock, cancelRave, setPixelsController);
router.post('/progress', pollLock, cancelRave, progressController);
router.post('/rave', pollLock, raveController);
router.post('/rave/stop', pollLock, raveStopController);

module.exports = router;