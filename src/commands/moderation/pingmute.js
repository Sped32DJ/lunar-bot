'use strict';

const { Constants } = require('discord.js');
const DualCommand = require('../../structures/commands/DualCommand');
// const logger = require('../../functions/logger');


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
					description: 'IGN | uuid | discordID | @mention',
					required: true,
				}],
				defaultPermission: true,
				cooldown: 0,
			},
			param2 ?? {
				aliases: [],
				args: 1,
				usage: '[`IGN`|`minecraftUuid`|`discordId`|`@mention`]',
			},
		);
	}

	/**
	 * execute the command
	 * @param {import('../../structures/extensions/CommandInteraction') | import('../../structures/chat_bridge/HypixelMessage')} ctx
	 * @param {import('../../structures/database/models/Player')} player
	 */
	async _run(ctx, player) {
		player.hasDiscordPingPermission = false;
		await player.save();

		return ctx.reply(`\`${player.ign}\` can no longer ping members via the chat bridge`);
	}

	/**
	 * execute the command
	 * @param {import('../../structures/extensions/CommandInteraction')} interaction
	 */
	async run(interaction) {
		return this._run(interaction, this.getPlayer(interaction));
	}

	/**
	 * execute the command
	 * @param {import('../../structures/chat_bridge/HypixelMessage')} message message that triggered the command
	 */
	async runInGame(message) {
		const [ INPUT ] = message.commandData.args;
		const player = this.client.players.getById(INPUT) ?? this.client.players.getByIgn(INPUT);

		if (!player) return message.reply(`\`${INPUT}\` not in the player db`);

		return this._run(message, player);
	}
};
