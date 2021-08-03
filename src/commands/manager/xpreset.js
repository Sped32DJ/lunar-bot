'use strict';

const { Constants } = require('discord.js');
const { Op } = require('sequelize');
const { offsetFlags } = require('../../constants/database');
const { safePromiseAll } = require('../../functions/util');
const SlashCommand = require('../../structures/commands/SlashCommand');
// const logger = require('../../functions/logger');


module.exports = class XpResetCommand extends SlashCommand {
	constructor(data) {
		super(data, {
			aliases: [],
			description: 'reset the competition xp gained',
			options: [{
				name: 'player',
				type: Constants.ApplicationCommandOptionTypes.STRING,
				description: 'IGN | UUID | discord ID | @mention',
				required: false,
			}],
			defaultPermission: true,
			cooldown: 5,
		});
	}

	static OFFSET_TO_RESET = offsetFlags.COMPETITION_START;

	/**
	 * execute the command
	 * @param {import('../../structures/extensions/CommandInteraction')} interaction
	 */
	async run(interaction) {
		const { players } = this.client;
		const PLAYER_INPUT = interaction.options.getString('player');

		let result;

		// individual player
		if (PLAYER_INPUT) {
			/** @type {import('../../structures/database/models/Player')} */
			const player = this.getPlayer(interaction)
				?? await players.fetch({
					guildId: null,
					ign: { [Op.iLike]: PLAYER_INPUT },
					cache: false,
				});


			if (!player) return interaction.reply(`\`${PLAYER_INPUT}\` is not in the player db`);

			await interaction.awaitConfirmation(`reset xp gained from \`${player}\`?`);

			await player.resetXp({ offsetToReset: XpResetCommand.OFFSET_TO_RESET });

			result = `reset xp gained from \`${player}\``;

		// all players
		} else {
			const PLAYER_COUNT = players.size;

			await interaction.awaitConfirmation(`reset competition xp gained from all ${PLAYER_COUNT} guild members?`);

			// delete players who left the guild
			await players.sweepDb();

			await safePromiseAll([
				...players.cache.map(async (player) => {
					if (player.notes === 'skill api disabled') player.notes = null;
					return player.resetXp({ offsetToReset: XpResetCommand.OFFSET_TO_RESET });
				}),
				this.config.set('COMPETITION_START_TIME', Date.now()),
			]);

			result = `reset the competition xp gained from all ${PLAYER_COUNT} guild members`;
		}

		// logging
		this.client.log(this.client.defaultEmbed
			.setTitle('XP Tracking')
			.setDescription(`${interaction.user.tag} | ${interaction.user} ${result}`),
		);

		interaction.reply(result);
	}
};
