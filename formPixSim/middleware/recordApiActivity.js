/**
 * Reset idle timeout and exit idle animation when the bar receives `/api` traffic
 * (same bump as Formbar socket events — see utils/idleMode.js).
 *
 * Idle countdown starts when the HTTP response **finishes**, so a stale deadline
 * cannot fire in the middle of handling a request.
 */

const { onHttpApiActivityStart, onHttpApiActivityEnd } = require('../utils/idleMode');

/**
 * True for FormPix HTTP API routes. Uses originalUrl because when this middleware is
 * mounted with app.use('/api', ...), req.path is only the suffix (e.g. "/fill"), not "/api/...".
 * @param {import('express').Request} req
 */
function isFormPixApiRequest(req) {
	const raw = req.originalUrl || req.url || '';
	const pathOnly = raw.split('?')[0];
	return pathOnly === '/api' || pathOnly.startsWith('/api/');
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function recordApiActivity(req, res, next) {
	if (!isFormPixApiRequest(req)) {
		next();
		return;
	}
	onHttpApiActivityStart();
	if (!res.__formPixIdleHttpDoneHook) {
		res.__formPixIdleHttpDoneHook = true;
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			onHttpApiActivityEnd();
		};
		res.on('finish', finish);
		res.on('close', finish);
	}
	next();
}

module.exports = recordApiActivity;
