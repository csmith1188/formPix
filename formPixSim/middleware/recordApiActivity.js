/**
 * Reset idle timeout and exit idle animation when the bar receives `/api` traffic
 * (same bump as Formbar socket events — see utils/idleMode.js).
 */

const { bumpActivity } = require('../utils/idleMode');

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function recordApiActivity(req, res, next) {
	if (!req.path.startsWith('/api')) {
		next();
		return;
	}
	bumpActivity();
	next();
}

module.exports = recordApiActivity;
