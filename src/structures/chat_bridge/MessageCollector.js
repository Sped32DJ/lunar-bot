'use strict';

const EventEmitter = require('events');
const logger = require('../../functions/logger');

/**
 * Filter to be applied to the collector.
 * @typedef {Function} CollectorFilter
 * @param {import('./HypixelMessage')} message
 * @param {import('./HypixelMessage')[]} collection The items collected by this collector
 * @returns {boolean|Promise<boolean>}
 */

/**
 * Options to be applied to the collector.
 * @typedef {object} MessageCollectorOptions
 * @property {?number} [time] How long to run the collector for in milliseconds
 * @property {?number} [idle] How long to stop the collector after inactivity in milliseconds
 * @property {?number} [max] maximum amount of messages that pass the filter
 * @property {?number} [maxProcessed] maximum amount of messages to filter
 */


/**
 * MessageCollector
 */
class MessageCollector extends EventEmitter {
	/**
	 * @param {import('./ChatBridge')} chatBridge
	 * @param {CollectorFilter} filter
	 * @param {MessageCollectorOptions} options
	 */
	constructor(chatBridge, filter, options = {}) {
		super();

		/**
		 * The chatBridge that instantiated this Collector
		 */
		this.chatBridge = chatBridge;

		/**
		 * The filter applied to this collector
		 * @type {CollectorFilter}
		 */
		this.filter = filter;

		/**
		 * The options of this collector
		 * @type {MessageCollectorOptions}
		 */
		this.options = options;

		/**
		 * The items collected by this collector
		 * @type {import('./HypixelMessage')[]}
		 */
		this.collected = [];

		/**
		 * Whether this collector has finished collecting
		 * @type {boolean}
		 */
		this.ended = false;

		/**
		 * Timeout for cleanup
		 * @type {?Timeout}
		 * @private
		 */
		this._timeout = null;

		/**
		 * Timeout for cleanup due to inactivity
		 * @type {?Timeout}
		 * @private
		 */
		this._idletimeout = null;

		if (typeof filter !== 'function') {
			throw new TypeError('INVALID_TYPE: filter is not a function');
		}

		/**
		 * Total number of messages that were received from the bot during message collection
		 * @type {number}
		 */
		this.received = 0;

		this.handleCollect = this.handleCollect.bind(this);
		this._handleBotDisconnection = this._handleBotDisconnection.bind(this);

		this.chatBridge.on('message', this.handleCollect);
		this.chatBridge.bot.on('end', this._handleBotDisconnection);

		this.once('end', () => {
			this.chatBridge.removeListener('message', this.handleCollect);
			this.chatBridge.bot.removeListener('end', this._handleBotDisconnection);
		});

		if (options.time) this._timeout = setTimeout(() => this.stop('time'), options.time);
		if (options.idle) this._idletimeout = setTimeout(() => this.stop('idle'), options.idle);
	}

	/**
	 * Call this to handle an event as a collectable element
	 * @param {import('./HypixelMessage')} message
	 * @emits Collector#collect
	 */
	async handleCollect(message) {
		++this.received;

		if (await this.filter(message, this.collected)) {
			this.collected.push(message);

			/**
			 * Emitted whenever an element is collected.
			 * @event Collector#collect
			 * @param {import('./HypixelMessage')} message
			 */
			this.emit('collect', message);

			if (this._idletimeout) {
				clearTimeout(this._idletimeout);
				this._idletimeout = setTimeout(() => this.stop('idle'), this.options.idle);
			}
		}
		this.checkEnd();
	}

	/**
	 * Returns a promise that resolves with the next collected element;
	 * rejects with collected elements if the collector finishes without receiving a next element
	 * @type {Promise}
	 * @readonly
	 */
	get next() {
		return new Promise((resolve, reject) => {
			if (this.ended) {
				reject(this.collected);
				return;
			}

			const cleanup = () => {
				this.removeListener('collect', onCollect);
				this.removeListener('end', onEnd);
			};

			const onCollect = item => {
				cleanup();
				resolve(item);
			};

			const onEnd = () => {
				cleanup();
				reject(this.collected);
			};

			this.on('collect', onCollect);
			this.on('end', onEnd);
		});
	}

	/**
	 * Stops this collector and emits the `end` event.
	 * @param {string} [reason='user'] The reason this collector is ending
	 * @emits Collector#end
	 */
	stop(reason = 'user') {
		if (this.ended) return;

		if (this._timeout) {
			clearTimeout(this._timeout);
			this._timeout = null;
		}
		if (this._idletimeout) {
			clearTimeout(this._idletimeout);
			this._idletimeout = null;
		}
		this.ended = true;

		/**
		 * Emitted when the collector is finished collecting.
		 * @event Collector#end
		 * @param {import('./HypixelMessage')[]} collected The elements collected by the collector
		 * @param {string} reason The reason the collector ended
		 */
		this.emit('end', this.collected, reason);
	}

	/**
	 * Resets the collectors timeout and idle timer.
	 * @param {Object} [options] Options
	 * @param {number} [options.time] How long to run the collector for in milliseconds
	 * @param {number} [options.idle] How long to stop the collector after inactivity in milliseconds
	 */
	resetTimer({ time, idle } = {}) {
		if (this._timeout) {
			clearTimeout(this._timeout);
			this._timeout = setTimeout(() => this.stop('time'), time || this.options.time);
		}
		if (this._idletimeout) {
			clearTimeout(this._idletimeout);
			this._idletimeout = setTimeout(() => this.stop('idle'), idle || this.options.idle);
		}
	}

	/**
	 * Checks whether the collector should end, and if so, ends it.
	 */
	checkEnd() {
		const reason = this.endReason();
		if (reason) this.stop(reason);
	}

	/**
	 * Allows collectors to be consumed with for-await-of loops
	 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of}
	 */
	async *[Symbol.asyncIterator]() {
		const queue = [];
		const onCollect = item => queue.push(item);
		this.on('collect', onCollect);

		try {
			while (queue.length || !this.ended) {
				if (queue.length) {
					yield queue.shift();
				} else {
					await new Promise(resolve => {
						const tick = () => {
							this.removeListener('collect', tick);
							this.removeListener('end', tick);
							return resolve();
						};
						this.on('collect', tick);
						this.on('end', tick);
					});
				}
			}
		} finally {
			this.removeListener('collect', onCollect);
		}
	}

	/**
	 * Checks after un/collection to see if the collector is done.
	 * @returns {?string}
	 * @private
	 */
	endReason() {
		if (this.options.max && this.collected.length >= this.options.max) return 'limit';
		if (this.options.maxProcessed && this.received === this.options.maxProcessed) return 'processedLimit';
		return null;
	}

	/**
	 * handles stopping the collector when the bot got disconnected
	 */
	_handleBotDisconnection() {
		this.stop('botDisconnected');
	}
}

module.exports = MessageCollector;
