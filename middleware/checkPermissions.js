/**
 * Middleware for checking permissions
 */

const logger = require('../utils/logger');

/**
 * Check user permissions
 */
async function checkPermissions(req, res, next) {
	try {
		const { config, REQUIRED_PERMISSION, classId, permissionCache } = require('../state');
		
		let apiKey = req.headers.api

		if (!req.url) {
			res.status(400).json({ source: 'Formpix', error: 'Missing URL' })
			logger.warn('Permission check failed: Missing URL');
			return
		}

		let urlPath = req.url

		if (urlPath.indexOf('?') != -1) {
			urlPath = urlPath.slice(0, urlPath.indexOf('?'))
		}
		if (urlPath[urlPath.length - 1] == '/') {
			urlPath = urlPath.slice(0, urlPath.length - 1)
		}

		if (urlPath == '' || urlPath == 'socket.io/socket.io.js' || urlPath == '/') {
			next()
			return
		}

		if (!apiKey) {
			res.status(400).json({ source: 'Formpix', error: 'Missing API key' })
			logger.warn('Permission check failed: Missing API key', { url: req.url });
			res.status(400).json({ error: 'Missing API key' })
			return
		}

		// Allow trusted server-to-server formbar requests without remote permission checks.
		if (apiKey === config.api) {
			next()
			return
		}

		const now = Date.now()
		const cacheHit = permissionCache.apiKey === apiKey &&
			permissionCache.classId === classId &&
			permissionCache.expiresAt > now
		if (cacheHit) {
			next()
			return
		}

		let response = await fetch(`${config.formbarUrl}/api/apiPermissionCheck?api=${apiKey}&permissionType=${REQUIRED_PERMISSION}&classId=${classId}`, {
			method: 'GET',
			headers: {
				api: config.api
			}
		});

		let data = await response.json();
		if (data.error) {
			res.status(response.status).json({ source: 'Formbar', status: data.error })
			logger.warn('Permission check failed', { error: data.error, url: req.url, apiKey });
			res.status(response.status).json({ status: data.error })
			return
		}

		if (response.status !== 200) {
			res.status(response.status).json({ source: 'Formbar', message: response.statusText, data })
			return
		}

		permissionCache.apiKey = apiKey
		permissionCache.classId = classId
		permissionCache.expiresAt = now + 10000

		next()
	} catch (err) {
		res.status(500).json({ source: 'Formpix', error: 'There was a server error try again' })
		return
	}
}

module.exports = checkPermissions;