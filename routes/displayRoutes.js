/**
 * Routes for display and text operations
 */

const express = require('express');
const router = express.Router();
const { sayController, getDisplayController } = require('../controllers/displayControllers');
const pollLock = require('../middleware/pollLock');

// Route to display a text with a specified text color and background color
router.post('/say', pollLock, sayController);

// Route to get the current display message
router.get('/getDisplay', getDisplayController);

module.exports = router;