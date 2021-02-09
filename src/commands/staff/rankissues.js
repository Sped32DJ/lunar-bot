'use strict';

const { MessageEmbed } = require('discord.js');
const { escapeIgn, trim } = require('../../functions/util');
const ConfigCollection = require('../../structures/collections/ConfigCollection');
const LunarMessage = require('../../structures/extensions/Message');
const LunarClient = require('../../structures/LunarClient');
const Command = require('../../structures/Command');
const logger = require('../../functions/logger');


module.exports = class RankIssuesCommand extends Command {
	constructor(data) {
		super(data, {
			aliases: [],
			description: 'list ingame guild rank discrepancies',
			cooldown: 0,
		});
	}

	/**
	 * execute the command
	 * @param {LunarClient} client
	 * @param {ConfigCollection} config
	 * @param {LunarMessage} message message that triggered the command
	 * @param {string[]} args command arguments
	 * @param {string[]} flags command flags
	 * @param {string[]} rawArgs arguments and flags
	 */
	async run(client, config, message, args, flags, rawArgs) {
		const { hypixelGuilds } = client;
		const embed = new MessageEmbed()
			.setColor(config.get('EMBED_BLUE'))
			.setTimestamp();

		let issuesAmount = 0;

		for (const [, hypixelGuild] of hypixelGuilds) {
			const belowWeightReq = [];

			for (const [, player] of hypixelGuild.players) {
				const rank = player.guildRank;

				if (!rank?.roleID) continue; // non-requestable rank

				const { totalWeight } = player.getWeight();

				if (totalWeight >= rank.weightReq) continue;

				belowWeightReq.push({
					player,
					totalWeight,
					rank,
				});
			}

			const BELOW_WEIGHT_REQ_AMOUNT = belowWeightReq.length;

			issuesAmount += BELOW_WEIGHT_REQ_AMOUNT;

			embed.addFields(
				BELOW_WEIGHT_REQ_AMOUNT
					? {
						name: `${hypixelGuild.name}: (${BELOW_WEIGHT_REQ_AMOUNT})`,
						value: trim(
							belowWeightReq
								.sort((a, b) => a.rank.name.toLowerCase().localeCompare(b.rank.name.toLowerCase()))
								.map(({ player, totalWeight, rank }) => `${escapeIgn(player.ign)}: ${client.formatDecimalNumber(totalWeight)}/${client.formatDecimalNumber(rank.weightReq)} [${rank.name}]`)
								.join('\n'),
							1024,
						),
					}
					: {
						name: `${hypixelGuild.name}:`,
						value: 'none',
					},
			);
		}

		message.reply(embed
			.setTitle(`Rank Issues${issuesAmount ? ` (${issuesAmount})` : ''}`),
		);
	}
};
