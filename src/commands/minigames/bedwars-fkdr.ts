import { SlashCommandBuilder } from '@discordjs/builders';
import { optionalIgnOption } from '../../structures/commands/commonOptions';
import { seconds } from '../../functions';
import BaseStatsCommand from './~base-stats-command';
import type { CommandContext } from '../../structures/commands/BaseCommand';
import type { FetchedData } from './~base-stats-command';

export default class BedWarsFkdrCommand extends BaseStatsCommand {
	constructor(context: CommandContext) {
		super(
			context,
			{
				slash: new SlashCommandBuilder()
					.setDescription("shows a player's BedWars fkdr")
					.addStringOption(optionalIgnOption),
				cooldown: seconds(1),
			},
			{
				aliases: ['fkdr'],
				args: false,
				usage: '<`IGN`>',
			},
		);
	}

	override _generateReply({ ign, playerData }: FetchedData) {
		if (!playerData?.stats?.Bedwars) return `\`${ign}\` has no BedWars stats`;

		try {
			const kds = (
				[
					{ name: 'Overall', key: '' },
					{ name: 'Solo', key: 'eight_one_' },
					{ name: 'Doubles', key: 'eight_two_' },
					{ name: '3s', key: 'four_three_' },
					{ name: '4s', key: 'four_four_' },
				] as const
			).flatMap(({ name, key }) => {
				const kd = this.calculateKD(
					playerData.stats.Bedwars![`${key}final_kills_bedwars`] as number,
					playerData.stats.Bedwars![`${key}final_deaths_bedwars`] as number,
				);

				return kd !== null ? { name, kd } : [];
			});

			if (!kds.length) return `\`${ign}\` has no BedWars stats`;

			return `${ign}: BedWars: ${kds.map(({ name, kd }) => `${name}: ${kd}`).join(', ')}`;
		} catch {
			return `\`${ign}\` has no BedWars stats`;
		}
	}
}
