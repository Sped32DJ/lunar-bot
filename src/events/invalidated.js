'use strict';

const LunarClient = require('../structures/LunarClient');
const logger = require('../functions/logger');


/**
 * invalidated
 * @param {LunarClient} client
 */
module.exports = async client => {
	logger.warn('[INVALIDATED]: the client became invalidated');
	client.db.closeConnectionAndExit();
};
