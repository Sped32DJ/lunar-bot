import { EventEmitter } from 'events';
import { setTimeout as sleep } from 'timers/promises';
import { HISTORY_DATA_KEYS } from '../../constants/index.js';
import { CHAT_FUNCTION_BY_TYPE, INVISIBLE_CHARACTERS, MESSAGE_TYPES, PREFIX_BY_TYPE } from './constants/index.js';
import { MinecraftChatManager } from './managers/MinecraftChatManager.js';
import { DiscordManager } from './managers/DiscordManager.js';
import { EventCollection } from '../events/EventCollection.js';
import { logger } from '../../functions/index.js';


/**
 * @typedef {object} ChatOptions
 * @property {string} content
 * @property {string} [prefix='']
 * @property {number} [maxParts=10]
 * @property {import('discord.js').Message} [discordMessage]
 */

/**
 * @typedef {object} BroadcastOptions
 * @property {string | import('./managers/DiscordChatManager').DiscordChatManager} type
 * @property {import('./HypixelMessage').HypixelMessage} hypixelMessage
 * @property {DiscordMessageOptions} discord
 * @property {ChatOptions} minecraft
 */

/**
 * @typedef {import('discord.js').MessageOptions & { prefix: string }} DiscordMessageOptions
 */

/**
 * @typedef {object} MessageForwardOptions
 * @property {import('../database/models/Player').Player} [player] player for muted and isStaff check
 * @property {boolean} [isEdit=false] wether the message is an edit instead of a new message
 */


export class ChatBridge extends EventEmitter {
	/**
	 * increases each link cycle
	 */
	#guildLinkAttempts = 0;

	/**
	 * @param {import('../LunarClient').LunarClient} client
	 */
	constructor(client, mcAccount) {
		super();

		/**
		 * client that instantiated the chat bridge
		 */
		this.client = client;
		/**
		 * position in the mcAccount array
		 * @type {number}
		 */
		this.mcAccount = mcAccount;
		/**
		 * @type {import('../database/models/HypixelGuild').HypixelGuild}
		 */
		this.hypixelGuild = null;
		/**
		 * wether to retry linking the chat bridge to a guild
		 */
		this.shouldRetryLinking = true;
		/**
		 * timestamp of the end of the current poll, if existing
		 * @type {?number}
		 */
		this.pollUntil = null;
		/**
		 * minecraft related functions
		 */
		this.minecraft = new MinecraftChatManager(this);
		/**
		 * discord related functions
		 */
		this.discord = new DiscordManager(this);

		this.events = new EventCollection(this, new URL('./events', import.meta.url));

		this.events.loadAll();
	}

	/**
	 * wether the minecraft bot and all discord channel managers (webhooks) are ready
	 */
	get ready() {
		return this.minecraft.ready && this.discord.ready;
	}

	/**
	 * bot ign | guild name
	 */
	get logInfo() {
		return `${this.bot?.username ?? 'no bot'} | ${this.hypixelGuild?.name ?? 'no guild'}`;
	}

	/**
	 * wether the guild has the chatBridge feature enabled
	 */
	get enabled() {
		return this.hypixelGuild?.chatBridgeEnabled ?? false;
	}

	/**
	 * player object associated with the chatBridge's bot
	 * @type {import('../database/models/Player').Player}
	 */
	get player() {
		return this.bot?.player ?? null;
	}

	/**
	 * minecraft bot
	 */
	get bot() {
		return this.minecraft.bot;
	}

	/**
	 * create and log the bot into hypixel
	 * @type {Function}
	 */
	async connect() {
		await this.minecraft.connect();
		return this;
	}

	/**
	 * destroys the connection to the guild and reconnects the bot
	 * @type {Function}
	 */
	get reconnect() {
		return this.minecraft.reconnect.bind(this.minecraft);
	}

	/**
	 * disconnects the bot and resets the chatBridge
	 * @type {Function}
	 */
	disconnect() {
		this.unlink();
		this.minecraft.disconnect();
		return this;
	}

	/**
	 * links this chatBridge with the bot's guild
	 * @param {?string} guildName
	 * @returns {Promise<this>}
	 */
	async link(guildName = null) {
		try {
			// link bot to db entry (create if non existant)
			this.minecraft.botPlayer ??= await (async () => {
				const [ player, created ] = await this.client.players.model.findOrCreate({
					where: { minecraftUuid: this.minecraft.botUuid },
					defaults: {
						ign: this.bot.username,
					},
					attributes: {
						exclude: HISTORY_DATA_KEYS, // don't cache  history arrays
					},
				});

				if (created) this.client.players.set(player.minecraftUuid, player);

				return player;
			})();

			// guild to link to
			const hypixelGuild = guildName
				? this.client.hypixelGuilds.cache.find(({ name }) => name === guildName)
				: this.client.hypixelGuilds.cache.find(({ players }) => players.has(this.minecraft.botUuid));

			// no guild found
			if (!hypixelGuild) {
				this.unlink();

				logger.error(`[CHATBRIDGE]: ${this.bot.username}: no matching guild found`);
				return this;
			}

			// already linked to this guild
			if (hypixelGuild.guildId === this.hypixelGuild?.guildId) {
				logger.debug(`[CHATBRIDGE]: ${this.logInfo}: already linked`);
				return this;
			}

			hypixelGuild.chatBridge = this;
			this.hypixelGuild = hypixelGuild;

			logger.debug(`[CHATBRIDGE]: ${hypixelGuild.name}: linked to ${this.bot.username}`);

			// instantiate DiscordChannelManagers
			await this.discord.init();

			this.#guildLinkAttempts = 0;

			return this;
		} catch (error) {
			logger.error(`[CHATBRIDGE LINK]: #${this.mcAccount}`, error);

			if (!this.shouldRetryLinking) {
				logger.error(`[CHATBRIDGE LINK]: #${this.mcAccount}: aborting retry due to a critical error`);
				return this;
			}

			await sleep(Math.min(++this.#guildLinkAttempts * 5_000, 300_000));

			return this.link(guildName);
		}
	}

	/**
	 * unlinks the chatBridge from the linked guild
	 */
	unlink() {
		this.discord.ready = false;
		if (this.hypixelGuild) this.hypixelGuild.chatBridge = null;
		this.hypixelGuild = null;

		// clear DiscordChatManagers
		// this.discord.channelsByIds.clear();
		// this.discord.channelsByType.clear();

		return this;
	}

	/**
	 * Increments max listeners by one, if they are not zero.
	 */
	incrementMaxListeners() {
		const maxListeners = this.getMaxListeners();

		if (maxListeners !== 0) this.setMaxListeners(maxListeners + 1);
	}

	/**
	 * Decrements max listeners by one, if they are not zero.
	 */
	decrementMaxListeners() {
		const maxListeners = this.getMaxListeners();

		if (maxListeners !== 0) this.setMaxListeners(maxListeners - 1);
	}

	/**
	 * forwards the discord message to minecraft chat if the ChatBridge has a DiscordChatManager for the message's channel, returning true if so, false otherwise
	 * @param {import('discord.js').Message} message
	 * @param {MessageForwardOptions} [options]
	 */
	handleDiscordMessage(message, { link = this.discord.get(message.channelId), ...options }) {
		return (this.discord.resolve(link)?.forwardToMinecraft(message, options) && true) ?? false;
	}

	/**
	 * send a message both to discord and the in game guild chat, parsing both
	 * @param {string | BroadcastOptions} contentOrOptions
	 * @returns {Promise<[boolean, ?import('discord.js').Message | import('discord.js').Message[]]>}
	 */
	async broadcast(contentOrOptions) {
		const { content, hypixelMessage, type = hypixelMessage?.type ?? MESSAGE_TYPES.GUILD, discord = {}, minecraft: { prefix: minecraftPrefix = '', maxParts = Infinity, ...options } = {} } = typeof contentOrOptions === 'string'
			? { content: contentOrOptions }
			: contentOrOptions;
		const discordChatManager = this.discord.resolve(type);

		return Promise.all([
			// minecraft
			this.minecraft[CHAT_FUNCTION_BY_TYPE[(discordChatManager?.type ?? type)]]?.({ content, prefix: minecraftPrefix, maxParts, ...options })
				?? this.minecraft.chat({
					content,
					prefix: `${discordChatManager?.prefix ?? PREFIX_BY_TYPE[(discordChatManager?.type ?? type)]} ${minecraftPrefix}${minecraftPrefix.length ? ' ' : INVISIBLE_CHARACTERS[0]}`,
					maxParts,
					...options,
				}),

			// discord
			discordChatManager?.sendViaBot({
				content,
				hypixelMessage,
				...discord,
			}),
		]);
	}
}
