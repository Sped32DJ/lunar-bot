'use strict';

const ChatMessage = require('prismarine-chat')(require('./constants/settings').MC_CLIENT_VERSION);
const { messageTypes: { WHISPER, GUILD, OFFICER, PARTY } } = require('./constants/chatBridge');
const { NO_BELL } = require('../../constants/emojiCharacters');
const mojang = require('../../api/mojang');
const HypixelMessageAuthor = require('./HypixelMessageAuthor');
const logger = require('../../functions/logger');

/**
 * @typedef {string} HypixelMessageType
 * * `guild`
 * * `party`
 * * `whisper`
 */


class HypixelMessage extends ChatMessage {
	/**
	 * @param {import('./ChatBridge')} chatBridge
	 * @param {number} position
	 * @param {} message
	 * @param {?boolean} displayWarning
	 */
	constructor(chatBridge, position, message, displayWarning) {
		super(message, displayWarning);

		this.chatBridge = chatBridge;
		/**
		 * @type {?HypixelMessageType}
		 */
		this.position = { 0: 'chat', 1: 'system', 2: 'gameInfo' }[position] ?? null;
		/**
		 * raw content string
		 */
		this.rawContent = this.toString();
		/**
		 * content with invis chars removed
		 */
		this.cleanedContent = this.rawContent.replace(/ࠀ|⭍/g, '').trim();

		/**
		 * Guild > [HypixelRank] ign [GuildRank]: message
		 * Party > [HypixelRank] ign [GuildRank]: message
		 * Officer > [HypixelRank] ign [GuildRank]: message
		 * From [HypixelRank] ign: message
		 */
		const matched = this.cleanedContent.match(/^(?:(?<type>Guild|Officer|Party) > |(?<whisper>From) )(?:\[(?<hypixelRank>.+?)\] )?(?<ign>\w+)(?: \[(?<guildRank>\w+)\])?: /);

		if (matched) {
			this.author = new HypixelMessageAuthor(this.chatBridge, {
				hypixelRank: matched.groups.hypixelRank,
				ign: matched.groups.ign,
				guildRank: matched.groups.guildRank,
			});
			this.type = matched.groups.type?.toLowerCase() ?? (matched.groups.whisper ? WHISPER : null);
			this.content = this.cleanedContent.slice(matched[0].length).trimLeft();
		} else {
			this.author = null;
			this.type = null;
			this.content = this.cleanedContent;
		}
	}

	get logInfo() {
		return this.author.ign ?? 'unknown author';
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
	 * @returns {import('../database/models/Player')}
	 */
	get player() {
		return this.author?.player ?? null;
	}

	/**
	 * the message author's guild object, if the message was sent in guild chat
	 */
	get guild() {
		return this.type === GUILD ? this.player?.guild : null;
	}

	/**
	 * prettify message for discord, tries to replace :emoji: and others with the actually working discord render string
	 */
	get parsedContent() {
		return this.chatBridge._parseMinecraftMessageToDiscord(this.content);
	}

	/**
	 * content with minecraft formatting codes
	 */
	get formattedContent() {
		return this.toMotd().trim();
	}

	/**
	 * to make methods for dc messages compatible with mc messages
	 * @returns {null}
	 */
	get member() {
		return null;
	}

	/**
	 * alias for reply, to make methods for dc messages compatible with mc messages
	 */
	get reactSafely() {
		return this.reply;
	}

	/**
	 * replies ingame (and on discord if guild chat) to the message
	 * @param {string} message
	 */
	async reply(message) {
		switch (this.type) {
			case GUILD: {
				const result = await this.chatBridge.broadcast(message, { discord: { prefix: `${await this.player?.discordMember ?? `@${this.author.ign}`}, `, allowedMentions: { parse: [] } } });

				// DM author the message if sending to gchat failed
				if (!result[0]) this.author.send(`an error occurred while replying in gchat\n${message}`);

				return result;
			}

			case OFFICER:
				return this.chatBridge.ochat(message);

			case PARTY:
				return this.chatBridge.pchat(message, { maxParts: Infinity });

			case WHISPER:
				return this.author.send(message, { maxParts: Infinity });

			default:
				throw new Error(`unknown type to reply to: ${this.type}: ${this.rawContent}`);
		}
	}

	/**
	 * forwards the message to discord via the chatBridge's webhook, if the guild has the chatBridge enabled
	 */
	async forwardToDiscord() {
		await this.chatBridge.discordQueue.wait();

		try {
			if (this.author) {
				const { player } = this;
				const member = await player?.discordMember;
				const message = await this.chatBridge.sendViaWebhook({
					username: member?.displayName
						?? player?.ign
						?? this.author.ign,
					avatarURL: member?.user.displayAvatarURL({ dynamic: true })
						?? player?.image
						?? await mojang.ign(this.author.ign).then(({ uuid }) => `https://visage.surgeplay.com/bust/${uuid}`, error => logger.error(`[FORWARD TO DC]: ${error}`))
						?? this.client.user.displayAvatarURL({ dynamic: true }),
					content: this.parsedContent,
					allowedMentions: {
						parse: player?.hasDiscordPingPermission ? [ 'users' ] : [],
					},
				});

				// inform user if user and role pings don't actually ping (can't use message.mentions to detect cause that is empty)
				if (/<@&\d+>/.test(message.content)) {
					this.author.send('you do not have permission to @ roles from in game chat');
					message.reactSafely(NO_BELL);
				} else if ((!player?.hasDiscordPingPermission && /<@!?\d+>/.test(message.content))) {
					this.author.send('you do not have permission to @ users from in game chat since you were muted via \'lg!mute\' in the past');
					message.reactSafely(NO_BELL);
				}

				return message;
			}

			return await this.chatBridge.sendViaWebhook({
				username: this.chatBridge.guild?.name ?? this.client.user.username,
				avatarURL: this.client.user.displayAvatarURL({ dynamic: true }),
				content: this.content,
				allowedMentions: { parse: [] },
			});
		} catch (error) {
			logger.error(`[FORWARD TO DC]: ${error}`);
		} finally {
			this.chatBridge.discordQueue.shift();
		}
	}
}

module.exports = HypixelMessage;
