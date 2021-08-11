'use strict';

const { Constants } = require('discord.js');
const DualCommand = require('../../structures/commands/DualCommand');
const logger = require('../../functions/logger');


module.exports = class PingMuteCommand extends DualCommand {
	constructor(data, param1, param2) {
		super(
			data,
			param1 ?? {
				aliases: [],
				description: 'prevent a guild member from @mentioning via the chat bridge',
				options: [{
					name: 'player',
					type: Constants.ApplicationCommandOptionTypes.STRING,
					description: 'IGN | UUID | discord ID | @mention',
					required: true,
				}],
				cooldown: 0,
			},
			param2 ?? {
				aliases: [],
				args: 1,
				usage: '[`IGN`|`UUID`|`discord ID`|`@mention`]',
			},
		);
	}

	/**
	 * @param {import('../../structures/database/models/Player')} player
	 */
	async _generateReply(player) {
		try {
			player.hasDiscordPingPermission = false;
			await player.save();

			return `\`${player}\` can no longer ping members via the chat bridge`;
		} catch (error) {
			logger.error(error);
			return `an error occurred while trying to remove \`${player}\`'s ping permissions`;
		}
	}

	/**
	 * execute the command
	 * @param {import('../../structures/extensions/CommandInteraction')} interaction
	 */
	async run(interaction) {
		return await interaction.reply(await this._generateReply(this.getPlayer(interaction)));
	}

	/**
	 * execute the command
	 * @param {import('../../structures/chat_bridge/HypixelMessage')} message
	 */
	async runInGame(message) {
		const [ INPUT ] = message.commandData.args;
		const player = this.client.players.getById(INPUT) ?? this.client.players.getByIgn(INPUT);

		if (!player) return await message.reply(`\`${INPUT}\` not in the player db`);

		return await message.reply(await this._generateReply(player));
	}
};
