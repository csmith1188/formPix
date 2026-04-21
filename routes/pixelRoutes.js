/**
 * Routes for pixel operations
 */

const express = require('express');
const router = express.Router();
const { fillController, fillByPercentController, gradientController, setPixelController, setPixelsController, progressController } = require('../controllers/pixelControllers');
const { raveController, raveStopController } = require('../controllers/raveControllers');
const cancelRave = require('../middleware/cancelRave');

router.post('/fill', cancelRave, fillController);
router.post('/fillByPercent', cancelRave, fillByPercentController);
router.post('/gradient', cancelRave, gradientController);
router.post('/setPixel', cancelRave, setPixelController);
router.post('/setPixels', cancelRave, setPixelsController);
router.post('/progress', cancelRave, progressController);
router.post('/rave', raveController);
router.post('/rave/stop', raveStopController);

module.exports = router;
