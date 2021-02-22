'use strict';

const logger = require('../../../functions/logger');


/**
 * @param {import('../ChatBridge')} chatBridge
 * @param {object} param1
 * @param {string} param1.reason
 */
module.exports = (chatBridge, { reason }) => {
	logger.warn(`[CHATBRIDGE KICKED]: ${chatBridge.logInfo}: disconnect while not logged in, reason: ${reason}`);
};
