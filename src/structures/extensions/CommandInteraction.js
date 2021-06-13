'use strict';

const { basename } = require('path');
const { Structures, CommandInteraction, Permissions, APIMessage, MessageActionRow, MessageButton, SnowflakeUtil, Constants, MessageEmbed } = require('discord.js');
const { Y_EMOJI, X_EMOJI } = require('../../constants/emojiCharacters');
const logger = require('../../functions/logger');


class LunarCommandInteraction extends CommandInteraction {
	constructor(...args) {
		super(...args);

		/**
		 * wether the first reply was ephemeral
		 */
		this.ephemeral = null;
		/**
		 * deferring promise
		 */
		this._deferring = null;

		const { channel } = this;

		/**
		 * wether to use ephemeral replies and deferring
		 */
		this.useEphemeral = channel !== null && channel.type !== 'dm'
			? !(channel.name.includes('command') || channel.isTicket || !(this.options.get('ephemeral')?.value ?? true)) // guild channel
			: false; // DM channel
	}

	/**
	 * @param {import('discord.js').ApplicationCommandOptionData} option
	 */
	static isSubCommandOption(option) {
		return (option?.type === 'SUB_COMMAND' || option.type === 'SUB_COMMAND_GROUP') ?? false;
	}

	/**
	 * @param {import('discord.js').CommandInteractionOption[]} options
	 */
	static stringifyOptions(options) {
		return options
			?.reduce(
				(acc, cur) => {
					if (LunarCommandInteraction.isSubCommandOption(cur)) {
						return `${acc} ${cur.name}${this.stringifyOptions(cur.options)}`;
					}

					return `${acc} ${cur.name}: ${cur.value}`;
				},
				'',
			)
			?? '';
	}

	get logInfo() {
		return `${this.commandName}${LunarCommandInteraction.stringifyOptions(this.options)}`;
	}

	/**
	 * the user who started the interaction (for compatibility with message methods)
	 */
	get author() {
		return this.user;
	}

	/**
	 * appends the first option name if the command is a sub command or sub command group
	 */
	get fullCommandName() {
		const firstOption = this.options?.first();
		return `${this.commandName}${LunarCommandInteraction.isSubCommandOption(firstOption) ? ` ${firstOption.name}` : ''}`;
	}

	/**
	 * @param {import('discord.js').InteractionDeferOptions} param0
	 */
	async defer({ ephemeral = this.useEphemeral, ...options } = {}) {
		if (this._deferring) return this._deferring;

		this.ephemeral = ephemeral;

		return this._deferring = super.defer({ ephemeral, ...options });
	}

	/**
	 * replies to the interaction, ephemeral if not in an #bot-commands channel and no ephemeral option set
	 * @param {string | import('discord.js').InteractionReplyOptions} contentOrOptions
	 */
	async reply(contentOrOptions) {
		const data = typeof contentOrOptions === 'string'
			? { ephemeral: this.useEphemeral, content: contentOrOptions }
			: { ephemeral: this.useEphemeral, ...contentOrOptions };

		/**
		 * allow split option for CommandInteraction#reply
		 */
		if (data.split) {
			for (const content of APIMessage.create(this, data).makeContent()) {
				await this.reply({ ...data, content, split: false, code: false });
			}
			return;
		}

		await this._deferring;

		if (this.deferred) {
			// ephemeral defer
			if (this.ephemeral) {
				if (data.ephemeral) {
					const message = await this.editReply(data);
					return this._handleReplyMessage(data, message);
				}

				// ephemeral defer and non-ephemeral followUp
				await this.deleteReply();
				const message = await this.followUp(data);
				return this._handleReplyMessage(data, message);
			}

			// non-ephemeral defer
			if (data.ephemeral) {
				await this.deleteReply();
				const message = await this.followUp(data);
				return this._handleReplyMessage(data, message);
			}

			const mesage = await this.editReply(data);
			return this._handleReplyMessage(data, mesage);
		}

		if (this.replied) {
			const message = await this.followUp(data);
			return this._handleReplyMessage(data, message);
		}

		this.ephemeral = data.ephemeral;

		await super.reply(data);
		return this._handleReplyMessage(data);
	}

	/**
	 * forwards non-ephemeral replies to the chat bridges
	 * @param {import('discord.js').InteractionReplyOptions} param0
	 * @param {import('./Message')} [messageInput]
	 */
	async _handleReplyMessage({ ephemeral, content }, messageInput) {
		if (ephemeral || !content || !this.client.chatBridges.channelIDs.has(this.channelID)) return;

		const message = messageInput ?? await this.fetchReply();

		this.client.chatBridges.handleDiscordMessage(
			message,
			{
				player: this.user.player,
				discordMemberOrUser: this.member ?? this.user,
				checkIfNotFromBot: false,
			},
		);
	}

	/**
	 * posts question in same channel and returns content of first reply or null if timeout
	 * @param {string} question the question to ask the message author
	 * @param {number} timeoutSeconds secods before the question timeouts
	 */
	async awaitReply(question, timeoutSeconds = 60) {
		try {
			await this.reply(question);

			const collected = await this.channel.awaitMessages(
				msg => msg.author.id === this.user.id,
				{ max: 1, time: timeoutSeconds * 1_000, errors: [ 'time' ] },
			);

			return collected.first().content;
		} catch {
			return null;
		}
	}

	/**
	 * confirms the action via a button collector
	 * @param {string} [question]
	 * @param {object} [options]
	 * @param {number} [options.timeoutSeconds=60]
	 * @param {string} [options.errorMessage]
	 */
	async awaitConfirmation(question = 'confirm this action?', { timeoutSeconds = 60, errorMessage = 'the command has been cancelled' } = {}) {
		try {
			if (!this.channel) await this.client.channels.fetch(this.channelID);

			const SUCCESS_ID = `confirm:${SnowflakeUtil.generate()}`;
			const CANCLE_ID = `confirm:${SnowflakeUtil.generate()}`;

			await this.reply({
				embeds: [
					this.client.defaultEmbed
						.setDescription(question),
				],
				components: [
					new MessageActionRow()
						.addComponents(
							new MessageButton()
								.setCustomID(SUCCESS_ID)
								.setStyle(Constants.MessageButtonStyles.SUCCESS)
								.setEmoji(Y_EMOJI),
							new MessageButton()
								.setCustomID(CANCLE_ID)
								.setStyle(Constants.MessageButtonStyles.DANGER)
								.setEmoji(X_EMOJI),
						),
				],
			});

			const result = await this.channel.awaitMessageComponentInteraction(
				interaction => (interaction.user.id === this.user.id && [ SUCCESS_ID, CANCLE_ID ].includes(interaction.customID)
					? true
					: (async () => {
						try {
							await interaction.reply({
								content: 'that is not up to you to decide',
								ephemeral: true,
							});
						} catch (error) {
							logger.error(error);
						}
						return false;
					})()),
				timeoutSeconds * 1_000,
			);

			const success = result.customID === SUCCESS_ID;

			result.update({
				embeds: [
					new MessageEmbed()
						.setColor(this.client.config.get(success ? 'EMBED_GREEN' : 'EMBED_RED'))
						.setDescription(success ? 'confirmed' : 'cancelled')
						.setTimestamp(),
				],
				components: [],
			});

			if (!success) throw errorMessage;
		} catch (error) {
			logger.debug(error);
			throw errorMessage;
		}
	}

	/**
	 * react in order if the message is not deleted and the client has 'ADD_REACTIONS', catching promise rejections
	 * @param {import('discord.js').EmojiIdentifierResolvable[]} emojis
	 * @returns {Promise<?import('discord.js').MessageReaction[]>}
	 */
	async react(...emojis) {
		if (this.ephemeral) return null;
		if (!this.channel?.botPermissions.has(Permissions.FLAGS.ADD_REACTIONS)) return null;

		try {
			return (await this.fetchReply()).react(...emojis);
		} catch (error) {
			return logger.error('[MESSAGE REACT]', error);
		}
	}
}

Structures.extend(basename(__filename, '.js'), () => LunarCommandInteraction);

module.exports = LunarCommandInteraction;
