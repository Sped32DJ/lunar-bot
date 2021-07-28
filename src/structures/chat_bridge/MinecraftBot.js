'use strict';

const { Client, createClient } = require('minecraft-protocol');
const { join, basename } = require('path');
const { spawnEvents } = require('./constants/chatBridge');
const { getAllJsFiles } = require('../../functions/files');
const Player = require('../database/models/Player');
const logger = require('../../functions/logger');


Object.defineProperties(Client.prototype, {
	/**
	 * @type {Function}
	 * @param {string} reason
	 */
	quit: {
		value(reason = 'disconnect.quitting') {
			this.ready = false;
			return this.end(reason);
		},
	},

	/**
	 * the bot's cached player object
	 */
	_player: {
		value: null,
		writable: true,
	},

	/**
	 * the bot's player object
	 */
	player: {
		get() {
			return this._player ??= this.client.players.cache.get(this.uuid) ?? null;
		},
		set(value) {
			if (!(value instanceof Player)) throw new TypeError(`[BOT]: player must be a Player but received '${value}'`);

			this._player = value;
		},
	},

	ign: {
		get() {
			return this.username;
		},
	},

	/**
	 * wether the bot is logged in and ready to receive and send chat messages
	 */
	ready: {
		value: false,
		writable: true,
	},

	/**
	 * Increments max listeners by one, if they are not zero.
	 */
	incrementMaxListeners: {
		value() {
			const maxListeners = this.getMaxListeners();

			if (maxListeners !== 0) this.setMaxListeners(maxListeners + 1);
		},
	},

	/**
	 * Decrements max listeners by one, if they are not zero.
	 */
	decrementMaxListeners: {
		value() {
			const maxListeners = this.getMaxListeners();

			if (maxListeners !== 0) this.setMaxListeners(maxListeners - 1);
		},
	},
});


/**
 * returns a mc bot client
 * @param {import('./ChatBridge')} chatBridge
 * @param {import('minecraft-protocol').ClientOptions} options
 */
module.exports = async (chatBridge, options) => {
	const bot = createClient(options);

	Object.defineProperty(bot, 'client', { value: chatBridge.client });

	/**
	 * load bot events
	 */
	const eventFiles = await getAllJsFiles(join(__dirname, 'bot_events'));

	for (const file of eventFiles) {
		const event = require(file);
		const EVENT_NAME = basename(file, '.js');

		bot[spawnEvents.includes(EVENT_NAME) ? 'once' : 'on'](EVENT_NAME, event.bind(null, chatBridge));
	}

	logger.debug(`[CHATBRIDGE BOT EVENTS]: ${eventFiles.length} event${eventFiles.length !== 1 ? 's' : ''} loaded`);

	return bot;
};
