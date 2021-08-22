import loader from 'prismarine-chat';
import { INVISIBLE_CHARACTER_REGEXP, MC_CLIENT_VERSION, MESSAGE_TYPES, spamMessages } from './constants/index.js';
import { NO_PING_EMOJI } from '../../constants/index.js';
import { HypixelMessageAuthor } from './HypixelMessageAuthor.js';
import { MessageUtil } from '../../util/index.js';
import { mojang } from '../../api/mojang.js';
import { escapeRegex, logger, uuidToImgurBustURL } from '../../functions/index.js';

/**
 * @typedef {string} HypixelMessageType
 * * `guild`
 * * `party`
 * * `whisper`
 */

export const ChatMessage = loader(MC_CLIENT_VERSION);


export class HypixelMessage {
	/**
	 * @param {import('./ChatBridge').ChatBridge} chatBridge
	 * @param {import('./bot_events/chat').ChatPacket} packet
	 */
	constructor(chatBridge, { message, position }) {
		let prismarineMessage;

		try {
			prismarineMessage = new ChatMessage(JSON.parse(message));
		} catch (error) {
			logger.error('[MINECRAFT BOT CHAT]', error);
			prismarineMessage = new ChatMessage(message);
		}

		/**
		 * the chat bridge that instantiated the message
		 */
		this.chatBridge = chatBridge;
		/**
		 * the prismarine-parsed message
		 */
		this.prismarineMessage = prismarineMessage;
		/**
		 * @type {?HypixelMessageType}
		 */
		this.position = { 0: 'chat', 1: 'system', 2: 'gameInfo' }[position] ?? null;
		/**
		 * forwarded message
		 * @type {Promise<?import('discord.js').Message>}
		 */
		this.discordMessage = Promise.resolve(null);
		/**
		 * raw content string
		 */
		this.rawContent = prismarineMessage.toString();
		/**
		 * content with invis chars removed
		 */
		this.cleanedContent = this.rawContent.replace(INVISIBLE_CHARACTER_REGEXP, '').trim();

		/**
		 * Guild > [HypixelRank] ign [GuildRank]: message
		 * Party > [HypixelRank] ign [GuildRank]: message
		 * Officer > [HypixelRank] ign [GuildRank]: message
		 * From [HypixelRank] ign: message
		 */
		const matched = this.cleanedContent.match(/^(?:(?<type>Guild|Officer|Party) > |(?<whisper>From|To) )(?:\[.+?\] )?(?<ign>\w+)(?: \[(?<guildRank>\w+)\])?: /);

		if (matched) {
			this.type = matched.groups.type?.toLowerCase() ?? (matched.groups.whisper ? MESSAGE_TYPES.WHISPER : null);
			this.author = new HypixelMessageAuthor(
				this.chatBridge,
				matched.groups.whisper !== 'To'
					? {
						ign: matched.groups.ign,
						guildRank: matched.groups.guildRank,
						uuid: matched.groups.type
							? prismarineMessage.extra?.[0].clickEvent?.value.slice(13).replace(/-/g, '') // clickEvent: { action: 'run_command', value: '/viewprofile 2144e244-7653-4635-8245-a63d8b276786' }
							: null,
					}
					: {
						ign: this.chatBridge.bot.username,
						guildRank: null,
						uuid: this.chatBridge.minecraft.botUuid,
					},
			);
			this.content = this.cleanedContent.slice(matched[0].length).trimLeft();
			this.spam = false;

			// message was sent from the bot -> don't parse input
			if (this.me) {
				this.commandData = {};
				return;
			}

			const prefixMatched = new RegExp(
				`^(?:${[ ...this.client.config.get('PREFIXES').map(x => escapeRegex(x)), `@${this.chatBridge.bot.username}` ].join('|')})`,
				'i',
			).exec(this.content)?.[0]; // PREFIXES, @mention

			/** @type {string[]} */
			const args = this.content // command arguments
				.slice(prefixMatched?.length ?? 0)
				.trim()
				.split(/ +/);
			const COMMAND_NAME = args.shift(); // extract first word

			// no command, only ping or prefix
			if ((!prefixMatched && this.type !== MESSAGE_TYPES.WHISPER) || !COMMAND_NAME) {
				this.commandData = {
					name: null,
					command: null,
					args,
					prefix: prefixMatched,
				};
			} else {
				this.commandData = {
					name: COMMAND_NAME,
					command: this.client.chatBridges.commands.getByName(COMMAND_NAME.toLowerCase()),
					args,
					prefix: prefixMatched,
				};
			}
		} else {
			this.type = null;
			this.author = null;
			this.content = this.cleanedContent;
			this.spam = spamMessages.test(this.content);
			this.commandData = null;
		}
	}

	get logInfo() {
		return this.author.ign ?? 'unknown author';
	}

	get prefixReplacedContent() {
		return this.commandData?.command
			? this.content
				.replace(this.commandData.prefix, '/')
				.replace(this.commandData.name, this.commandData.command.name)
			: this.content;
	}

	/**
	 * discord client that instantiated the chatBridge
	 */
	get client() {
		return this.chatBridge.client;
	}

	/**
	 * wether the message was sent by the bot
	 */
	get me() {
		return this.author?.ign === this.chatBridge.bot.username;
	}

	/**
	 * wether the message was sent by a non-bot user
	 */
	get isUserMessage() {
		return this.type && !this.me;
	}

	/**
	 * the message author's player object
	 */
	get player() {
		return this.author?.player ?? null;
	}

	/**
	 * the message author's guild object, if the message was sent in guild chat
	 */
	get hypixelGuild() {
		return this.chatBridge.hypixelGuild ?? this.player?.hypixelGuild ?? null;
	}

	/**
	 * content with minecraft formatting codes
	 */
	get formattedContent() {
		return this.prismarineMessage.toMotd().trim();
	}

	/**
	 * to make methods for dc messages compatible with mc messages
	 */
	get member() {
		return this.author?.member;
	}

	/**
	 * fetch all missing data
	 */
	async init() {
		await this.author?.init();
		return this;
	}

	/**
	 * replies in game (and on discord if guild chat) to the message
	 * @param {string | import('./ChatBridge').BroadcastOptions & import('./ChatBridge').ChatOptions } contentOrOptions
	 */
	async reply(contentOrOptions) {
		const { ephemeral, ...options } = typeof contentOrOptions === 'string'
			? { content: contentOrOptions }
			: contentOrOptions;

		// to be compatible to Interactions
		if (ephemeral) return this.author.send({
			maxParts: Infinity,
			...options,
		});

		switch (this.type) {
			case MESSAGE_TYPES.GUILD:
			case MESSAGE_TYPES.OFFICER: {
				const result = await this.chatBridge.broadcast({
					hypixelMessage: this,
					discord: {
						allowedMentions: { parse: [] },
					},
					...options,
				});

				// DM author the message if sending to gchat failed
				if (!result[0]) this.author.send(`an error occurred while replying in ${this.type} chat\n${options.content ?? ''}`);

				return result;
			}

			case MESSAGE_TYPES.PARTY:
				return this.chatBridge.minecraft.pchat({
					maxParts: Infinity,
					...options,
				});

			case MESSAGE_TYPES.WHISPER:
				return this.author.send({
					maxParts: Infinity,
					...options,
				});

			default:
				throw new Error(`unknown type to reply to: ${this.type}: ${this.rawContent}`);
		}
	}

	/**
	 * forwards the message to discord via the chatBridge's webhook, if the guild has the chatBridge enabled
	 */
	async forwardToDiscord() {
		const discordChatManager = this.chatBridge.discord.get(this.type);

		if (!discordChatManager) return null;

		try {
			if (this.author) {
				const { player, member } = this;
				const discordMessage = await (this.discordMessage = discordChatManager.sendViaWebhook({
					content: this.prefixReplacedContent,
					username: member?.displayName
						?? player?.ign
						?? this.author.ign,
					avatarURL: member?.user.displayAvatarURL({ dynamic: true })
						?? await player?.imageURL
						?? await mojang.ign(this.author.ign).then(
							({ uuid }) => uuidToImgurBustURL(this.client, uuid),
							error => logger.error('[FORWARD TO DC]', error),
						)
						?? this.client.user.displayAvatarURL({ dynamic: true }),
					allowedMentions: {
						parse: player?.hasDiscordPingPermission ? [ 'users' ] : [],
					},
				}));

				// inform user if user and role pings don't actually ping (can't use message.mentions to detect cause that is empty)
				if (/<@&\d{17,19}>/.test(discordMessage.content)) {
					this.author.send('you do not have permission to ping roles from in game chat');
					MessageUtil.react(discordMessage, NO_PING_EMOJI);
				} else if ((!player?.hasDiscordPingPermission && /<@!?\d{17,19}>/.test(discordMessage.content))) {
					this.author.send('you do not have permission to ping users from in game chat');
					MessageUtil.react(discordMessage, NO_PING_EMOJI);
				}

				return discordMessage;
			}

			return await (this.discordMessage = discordChatManager.sendViaBot({
				content: this.content,
				allowedMentions: { parse: [] },
			}));
		} catch (error) {
			logger.error('[FORWARD TO DC]', error);
		}
	}

	/**
	 * confirms the action via a button collector
	 * @param {import('./ChatBridge').BroadcastOptions & import('./ChatBridge').ChatOptions & { question: string, timeoutSeconds: number, errorMessage: string }} [questionOrOptions]
	 */
	async awaitConfirmation(questionOrOptions = {}) {
		const { question = 'confirm this action?', timeoutSeconds = 60, errorMessage = 'the command has been cancelled', ...options } = typeof questionOrOptions === 'string'
			? { question: questionOrOptions }
			: questionOrOptions;

		this.reply({
			content: question,
			...options,
		});

		const result = await this.chatBridge.minecraft.awaitMessages({
			filter: hypixelMessage => hypixelMessage.author?.ign === this.author.ign,
			max: 1,
			time: timeoutSeconds * 1_000,
		});

		if (this.client.config.get('REPLY_CONFIRMATION').includes(result[0]?.content.toLowerCase())) return;

		throw errorMessage;
	}
}
