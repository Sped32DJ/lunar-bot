'use strict';

const Event = require('../structures/events/Event');
const logger = require('../functions/logger');


module.exports = class InvalidatedEvent extends Event {
	constructor(data) {
		super(data, {
			once: false,
			enabled: true,
		});
	}

	/**
	 * event listener callback
	 */
	async run() {
		logger.warn('[INVALIDATED]: the client became invalidated');
		this.client.exit(1);
	}
};
