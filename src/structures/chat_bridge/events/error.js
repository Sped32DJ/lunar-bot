'use strict';

const ChatBridgeEvent = require('../ChatBridgeEvent');
const logger = require('../../../functions/logger');


module.exports = class ErrorChatBridgeEvent extends ChatBridgeEvent {
	constructor(data) {
		super(data, {
			once: false,
			enabled: true,
		});
	}

	/**
	 * event listener callback
	 * @param {Error} error
	 */
	async run(error) {
		logger.error('[CHATBRIDGE ERROR]', error);

		if (error.message.includes('Invalid credentials')) {
			this.chatBridge.minecraft.shouldReconnect = false;
			this.chatBridge.minecraft.disconnect();

			return logger.error('[CHATBRIDGE ERROR]: invalid credentials detected');
		}

		this.chatBridge.minecraft.reconnect();
	}
};
