import { SlashCommandBuilder } from '@discordjs/builders';
import { pageOption, buildGuildOption } from '../../structures/commands/commonOptions.js';
import { InteractionUtil } from '../../util/index.js';
import { handleLeaderboardCommandInteraction } from '../../functions/index.js';
import { SlashCommand } from '../../structures/commands/SlashCommand.js';


export default class PurgeListCommand extends SlashCommand {
	constructor(context) {
		super(context, {
			aliases: [],
			slash: new SlashCommandBuilder()
				.setDescription('guild members below requirements, sorted by total and gained weight')
				.addIntegerOption(pageOption)
				.addStringOption(buildGuildOption(context.client, true)),
			cooldown: 1,
		});
	}

	/**
	 * execute the command
	 * @param {import('discord.js').CommandInteraction} interaction
	 */
	async runSlash(interaction) {
		return await handleLeaderboardCommandInteraction(interaction, {
			lbType: 'gained',
			xpType: 'purge',
			page: interaction.options.getInteger('page') ?? 1,
			offset: interaction.options.getString('offset') ?? '',
			hypixelGuild: InteractionUtil.getHypixelGuild(interaction),
			user: interaction.user,
		});
	}
}
