/**
 * Middleware for checking permissions
 */

const logger = require('../utils/logger');

/**
 * Check user permissions
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next callback.
 * @returns {Promise<void>} Resolves when middleware finishes.
 */
async function checkPermissions(req, res, next) {
	try {
		const { config, REQUIRED_PERMISSION, classId } = require('../state');
		
		let apiKey = req.headers.api

		if (!req.url) {
			logger.warn('Permission check failed: Missing URL');
			res.status(400).json({ error: 'Missing URL' })
			return
		}

		let urlPath = req.url

		// Clean up URL path by removing query parameters and trailing slash
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
			logger.warn('Permission check failed: Missing API key', { url: req.url });
			res.status(400).json({ error: 'Missing API key' })
			return
		}

		// Verify API key permissions with the Formbar service
		let response = await fetch(`${config.formbarUrl}/api/apiPermissionCheck?api=${apiKey}&permissionType=${REQUIRED_PERMISSION}&classId=${classId}`, {
			method: 'GET',
			headers: {
				api: config.api
			}
		});

		let data = await response.json();
		// Check for permission errors in the response
		if (data.error) {
			logger.warn('Permission check failed', { error: data.error, url: req.url, apiKey });
			res.status(response.status).json({ status: data.error })
			return
		}

		if (response.status !== 200) {
			res.status(response.status).json({ message: response.statusText, data })
			return
		}

		next()
	} catch (err) {
		res.status(500).json({ error: 'There was a server error try again' })
		return
	}
}

module.exports = checkPermissions;
