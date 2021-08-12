'use strict';

const { Formatters, Constants } = require('discord.js');
const ms = require('ms');
const { logErrors } = require('../../structures/chat_bridge/constants/commandResponses');
const { escapeIgn } = require('../../functions/util');
const DualCommand = require('../../structures/commands/DualCommand');
const logger = require('../../functions/logger');


/**
 * @typedef {object} JoinInfo
 * @property {string} ign
 * @property {Date} date
 * @property {number} timestamp
 */

module.exports = class JoinDateCommand extends DualCommand {
	constructor(data) {
		super(
			data,
			{
				aliases: [],
				description: 'guild member join date, parsed from `/g log ign`',
				options: [
					{
						name: 'player',
						type: Constants.ApplicationCommandOptionTypes.STRING,
						description: 'IGN | UUID | discord ID | @mention',
						required: false,
					},
					DualCommand.FORCE_OPTION,
					DualCommand.guildOptionBuilder(data.client),
				],
				cooldown: 0,
			},
			{
				aliases: [ 'joined' ],
				args: false,
				usage: '<`IGN`>',
			},
		);
	}

	static running = new Set();

	static JOINED_REGEXP = /(?<time>.+): \w{1,16} (?:joined|created the guild)(?:\n.+: \w{1,16} invited \w{1,16})*$/;

	/**
	 * @param {import('../../structures/chat_bridge/ChatBridge')} chatBridge
	 * @param {string} ign
	 * @returns {Promise<JoinInfo>}
	 */
	static async #getJoinDate(chatBridge, ign) {
		// get first page
		let logEntry = await this.#getLogEntry(chatBridge, ign, 1);
		let lastPage = Number(logEntry.match(/\(Page 1 of (\d+)\)/)?.[1]);

		// log has more than 1 page -> get latest page
		if (lastPage !== 1) logEntry = await this.#getLogEntry(chatBridge, ign, lastPage);

		let matched = logEntry.match(JoinDateCommand.JOINED_REGEXP);

		// last page didn't contain join, get next-to-last page
		while (!matched && lastPage >= 1) {
			matched = (await this.#getLogEntry(chatBridge, ign, --lastPage)).match(JoinDateCommand.JOINED_REGEXP);

			// entry does not end with invited message -> no joined / created message at all
			if (!new RegExp(`\\n.+: \\w{1,16} invited ${ign}$`).test(logEntry)) break;
		}

		const date = new Date(matched?.groups.time);

		return {
			ign,
			date,
			timestamp: date.getTime(),
		};
	}

	/**
	 * @param {import('../../structures/chat_bridge/ChatBridge')} chatBridge
	 * @param {string} ign
	 * @param {number} page
	 */
	static #getLogEntry(chatBridge, ign, page) {
		return chatBridge.minecraft.command({
			command: `g log ${ign} ${page}`,
			abortRegExp: logErrors(ign),
			rejectOnAbort: true,
		});
	}

	/**
	 * execute the command
	 * @param {import('../../structures/chat_bridge/ChatBridge')} chatBridge
	 * @param {import('../../structures/database/models/Player')} ignInput
	 */
	// eslint-disable-next-line class-methods-use-this
	async #generateReply(chatBridge, ignInput) {
		try {
			const { ign, date, timestamp } = await JoinDateCommand.#getJoinDate(chatBridge, ignInput);
			return `${ign}: joined at ${!Number.isNaN(timestamp) ? Formatters.time(date) : 'an unknown date'}`;
		} catch {
			return `${ignInput}: never joined ${chatBridge.hypixelGuild.name}`;
		}
	}

	/**
	 * execute the command
	 * @param {import('discord.js').CommandInteraction} interaction
	 */
	async run(interaction) {
		this.deferReply(interaction);

		const { chatBridge } = this.getHypixelGuild(interaction);
		const IGN = this.getIgn(interaction, !(await this.client.lgGuild?.members.fetch(interaction.user.id).catch(logger.error))?.roles.cache.has(this.config.get('MANAGER_ROLE_ID')));

		if (!IGN) {
			// all players
			if (JoinDateCommand.running.has(chatBridge.hypixelGuild.guildId)) return await this.reply(interaction, {
				content: 'the command is already running',
				ephemeral: true,
			});

			const joinInfos = [];

			try {
				JoinDateCommand.running.add(chatBridge.hypixelGuild.guildId);

				await this.awaitConfirmation(interaction, `the command will take approximately ${ms(chatBridge.hypixelGuild.playerCount * 2 * chatBridge.minecraft.constructor.SAFE_DELAY, { long: true })}. Confirm?`);

				for (const { ign } of chatBridge.hypixelGuild.players.values()) {
					joinInfos.push(await JoinDateCommand.#getJoinDate(chatBridge, ign));
				}
			} finally {
				JoinDateCommand.running.delete(chatBridge.hypixelGuild.guildId);
			}

			return await this.reply(interaction, {
				content: `${Formatters.bold(chatBridge.hypixelGuild.name)} join dates:\n${joinInfos
					.sort((a, b) => a.timestamp - b.timestamp)
					.map(({ ign, date, timestamp }) => `${!Number.isNaN(timestamp) ? Formatters.time(date) : 'unknown date'}: ${escapeIgn(ign)}`)
					.join('\n')}`,
				split: true,
			});
		}

		return await this.reply(interaction, await this.#generateReply(chatBridge, IGN));
	}

	/**
	 * execute the command
	 * @param {import('../../structures/chat_bridge/HypixelMessage')} message
	 */
	async runInGame(message) {
		return await message.reply(await this.#generateReply(
			message.chatBridge,
			message.commandData.args[0] ?? message.author.ign,
		));
	}
};
