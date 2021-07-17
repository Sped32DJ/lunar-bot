'use strict';

const { Constants } = require('discord.js');
const DualCommand = require('../../structures/commands/DualCommand');
// const logger = require('../../functions/logger');


module.exports = class SmiteCommand extends DualCommand {
	constructor(data) {
		super(
			data,
			{
				aliases: [],
				description: 'guild mute for 10 minutes',
				options: [{
					name: 'target',
					type: Constants.ApplicationCommandOptionTypes.STRING,
					description: 'IGN | uuid | discordID | @mention | \'guild\' | \'everyone\'',
					required: true,
				},
				DualCommand.guildOptionBuilder(data.client, false),
				],
				defaultPermission: true,
				cooldown: 0,
			},
			{
				aliases: [],
				args: 1,
				usage: '[`IGN`]',
			},
		);
	}

	/**
	 * execute the command
	 * @param {import('../../structures/extensions/CommandInteraction')} interaction
	 */
	async run(interaction) {
		return this.client.commands.get('guild').runMute(interaction, {
			targetInput: interaction.options.get('target').value.toLowerCase(),
			duration: 10 * 60_000,
		});
	}

	/**
	 * execute the command
	 * @param {import('../../structures/chat_bridge/HypixelMessage')} message message that triggered the command
	 */
	async runInGame(message) {
		return this.client.commands.get('guild').runMute(message, {
			targetInput: message.commandData.args[0],
			duration: 10 * 60_000,
			hypixelGuildInput: message.chatBridge.guild,
		});
	}
};
