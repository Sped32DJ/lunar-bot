import { SlashCommandBuilder } from '@discordjs/builders';
import { optionalIgnOption, skyblockProfileOption } from '../../structures/commands/commonOptions';
import { getLilyWeight, seconds } from '../../functions';
import BaseWeightCommand from './~base-weight';
import type { Components } from '@zikeji/hypixel';
import type { CommandContext } from '../../structures/commands/BaseCommand';

export default class LilyWeightCommand extends BaseWeightCommand {
	constructor(context: CommandContext) {
		super(
			context,
			{
				aliases: ['weight'],
				slash: new SlashCommandBuilder()
					.setDescription("shows a player's lily weight: total, weight and overflow")
					.addStringOption(optionalIgnOption)
					.addStringOption(skyblockProfileOption),
				cooldown: seconds(1),
			},
			{
				aliases: ['w', 'weight', 'lily'],
				args: false,
				usage: '<`IGN`> <`profile` name>',
			},
		);
	}

	/**
	 * @param skyblockMember
	 */
	// eslint-disable-next-line class-methods-use-this
	override getWeight(skyblockMember: Components.Schemas.SkyBlockProfileMember) {
		return getLilyWeight(skyblockMember);
	}
}
