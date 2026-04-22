/**
 * Middleware for blocking non-formbar pixel and display activity while a poll is active
 */

const logger = require('../utils/logger');

function isFormbarRequest(req) {
	const source = req.headers['x-formpix-source'] || req.headers['x-formbar-source'] || req.headers['x-request-source'];
	return typeof source === 'string' && source.toLowerCase() === 'formbar';
}

function pollLockMiddleware(req, res, next) {
	const { pollLockActive } = require('../state');

	if (!pollLockActive || isFormbarRequest(req)) {
		next();
		return;
	}

	logger.warn('Request blocked during active poll lock', {
		method: req.method,
		url: req.url,
		source: req.headers['x-formpix-source'] || req.headers['x-formbar-source'] || req.headers['x-request-source'] || 'unknown'
	});

	res.status(423).json({
		source: 'Formpix',
		error: 'Poll display is locked to formbar while a poll is active'
	});
}

module.exports = pollLockMiddleware;