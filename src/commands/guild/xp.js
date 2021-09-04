import { SlashCommandBuilder } from '@discordjs/builders';
import { MessageEmbed, Formatters } from 'discord.js';
import { oneLine, stripIndents } from 'common-tags';
import {
	COSMETIC_SKILLS,
	DUNGEON_TYPES_AND_CLASSES,
	SKILLS,
	SLAYERS,
	X_EMOJI,
	XP_OFFSETS_CONVERTER,
	XP_OFFSETS_TIME,
} from '../../constants/index.js';
import { optionalPlayerOption, pageOption, offsetOption } from '../../structures/commands/commonOptions.js';
import { InteractionUtil, MessageEmbedUtil } from '../../util/index.js';
import { logger, getDefaultOffset, upperCaseFirstChar } from '../../functions/index.js';
import { SlashCommand } from '../../structures/commands/SlashCommand.js';


export default class XpCommand extends SlashCommand {
	constructor(context) {
		super(context, {
			aliases: [],
			slash: new SlashCommandBuilder()
				.setDescription('check a player\'s xp gained')
				.addStringOption(optionalPlayerOption)
				.addIntegerOption(pageOption)
				.addStringOption(offsetOption)
				.addBooleanOption(option => option
					.setName('update')
					.setDescription('update xp before running the command')
					.setRequired(false),
				),
			cooldown: 0,
		});
	}

	/**
	 * execute the command
	 * @param {import('discord.js').CommandInteraction} interaction
	 */
	async runSlash(interaction) {
		const OFFSET = interaction.options.getString('offset') ?? getDefaultOffset(this.config);
		const player = InteractionUtil.getPlayer(interaction, true);

		if (!player?.skyBlockData) {
			return await InteractionUtil.reply(interaction, oneLine`${interaction.options.get('player')
				? `\`${interaction.options.getString('player')}\` is`
				: 'you are'
			} not being tracked by the bot`);
		}

		// update db?
		if (interaction.options.getBoolean('update')) await player.updateXp();

		const embeds = [];
		const { skillAverage, trueAverage } = player.getSkillAverage();
		const { skillAverage: skillAverageOffset, trueAverage: trueAverageOffset } = player.getSkillAverage(OFFSET);

		let embed = new MessageEmbed()
			.setColor(this.config.get('EMBED_BLUE'))
			.setAuthor(`${player}${player.mainProfileName ? ` (${player.mainProfileName})` : ''}`, await player.imageURL, player.url)
			.setDescription(`${`Δ: change since ${Formatters.time(new Date(Math.max(this.config.get(XP_OFFSETS_TIME[OFFSET]), player.createdAt)))} (${upperCaseFirstChar(XP_OFFSETS_CONVERTER[OFFSET])})`.padEnd(105, '\xa0')}\u200b`)
			.addFields({
				name: '\u200b',
				value: stripIndents`
					${Formatters.codeBlock('Skills')}
					Average skill level: ${Formatters.bold(this.client.formatDecimalNumber(skillAverage))} [${Formatters.bold(this.client.formatDecimalNumber(trueAverage))}] - ${Formatters.bold('Δ')}: ${Formatters.bold(this.client.formatDecimalNumber(skillAverage - skillAverageOffset))} [${Formatters.bold(this.client.formatDecimalNumber(trueAverage - trueAverageOffset))}]
					${player.skyBlockData.skillApiEnabled ? '' : `${X_EMOJI} API disabled`}
				`,
			});

		// skills
		for (const skill of SKILLS) {
			logger.debug(player[`skyBlockData${OFFSET}`], player[`skyBlockData${OFFSET}`][skill], OFFSET, skill)

			embed.addFields({
				name: upperCaseFirstChar(skill),
				value: stripIndents`
					${Formatters.bold('Lvl:')} ${player.getSkillLevel(skill).progressLevel}
					${Formatters.bold('XP:')} ${this.client.formatNumber(player.skyBlockData[skill], 0, Math.round)}
					${Formatters.bold('Δ:')} ${this.client.formatNumber(player.skyBlockData[skill] - player[`skyBlockData${OFFSET}`][skill], 0, Math.round)}
				`,
				inline: true,
			});
		}

		MessageEmbedUtil.padFields(embed);

		for (const skill of COSMETIC_SKILLS) {
			embed.addFields({
				name: upperCaseFirstChar(skill),
				value: stripIndents`
					${Formatters.bold('Lvl:')} ${player.getSkillLevel(skill).progressLevel}
					${Formatters.bold('XP:')} ${this.client.formatNumber(player.skyBlockData[skill], 0, Math.round)}
					${Formatters.bold('Δ:')} ${this.client.formatNumber(player.skyBlockData[skill] - player[`skyBlockData${OFFSET}`][skill], 0, Math.round)}
				`,
				inline: true,
			});
		}

		MessageEmbedUtil.padFields(embed);

		// slayer
		const TOTAL_SLAYER_XP = player.getSlayerTotal();

		embed.addFields({
			name: '\u200b',
			value: stripIndents`
				${Formatters.codeBlock('Slayer')}
				Total slayer xp: ${Formatters.bold(this.client.formatNumber(TOTAL_SLAYER_XP))} - ${Formatters.bold('Δ')}: ${Formatters.bold(this.client.formatNumber(TOTAL_SLAYER_XP - player.getSlayerTotal(OFFSET)))}
			`,
			inline: false,
		});

		for (const slayer of SLAYERS) {
			embed.addFields({
				name: upperCaseFirstChar(slayer),
				value: stripIndents`
					${Formatters.bold('Lvl:')} ${player.getSlayerLevel(slayer)}
					${Formatters.bold('XP:')} ${this.client.formatNumber(player.skyBlockData[slayer])}
					${Formatters.bold('Δ:')} ${this.client.formatNumber(player.skyBlockData[slayer] - player[`skyBlockData${OFFSET}`][slayer], 0, Math.round)}
				`,
				inline: true,
			});
		}

		embeds.push(embed);

		embed = this.client.defaultEmbed
			.setDescription(`\u200b${''.padEnd(171, '\xa0')}\u200b\n${Formatters.codeBlock('Dungeons')}`)
			.setFooter('\u200b\nUpdated at')
			.setTimestamp(player.xpLastUpdatedAt);

		// dungeons
		for (const type of DUNGEON_TYPES_AND_CLASSES) {
			embed.addFields({
				name: upperCaseFirstChar(type),
				value: stripIndents`
					${Formatters.bold('Lvl:')} ${player.getSkillLevel(type).progressLevel}
					${Formatters.bold('XP:')} ${this.client.formatNumber(player.skyBlockData[type], 0, Math.round)}
					${Formatters.bold('Δ:')} ${this.client.formatNumber(player.skyBlockData[type] - player[`skyBlockData${OFFSET}`][type], 0, Math.round)}
				`,
				inline: true,
			});
		}

		const { totalWeight: senitherTotalWeight, weight: senitherWeight, overflow: senitherOverflow } = player.getSenitherWeight();
		const { totalWeight: senitherTotalWeightOffet, weight: senitherWeightOffset, overflow: senitherOverflowOffset } = player.getSenitherWeight(OFFSET);
		const { totalWeight: lilyTotalWeight, weight: lilyWeight, overflow: lilyOverflow } = player.getLilyWeight();
		const { totalWeight: lilyTotalWeightOffet, weight: lilyWeightOffset, overflow: lilyOverflowOffset } = player.getLilyWeight(OFFSET);

		MessageEmbedUtil.padFields(embed)
			.addFields({
				name: '\u200b',
				value: `${Formatters.codeBlock('Miscellaneous')}\u200b`,
				inline: false,
			}, {
				name: 'Hypixel Guild XP',
				value: stripIndents`
					${Formatters.bold('Total:')} ${this.client.formatNumber(player.guildXp)}
					${Formatters.bold('Δ:')} ${this.client.formatNumber(player.guildXp - player[`guildXp${OFFSET}`])}
				`,
				inline: true,
			}, {
				name: 'Senither Weight',
				value: stripIndents`
					${Formatters.bold('Total')}: ${this.client.formatDecimalNumber(senitherTotalWeight)} [ ${this.client.formatDecimalNumber(senitherWeight)} + ${this.client.formatDecimalNumber(senitherOverflow)} ]
					${Formatters.bold('Δ:')} ${this.client.formatDecimalNumber(senitherTotalWeight - senitherTotalWeightOffet)} [ ${this.client.formatDecimalNumber(senitherWeight - senitherWeightOffset)} + ${this.client.formatDecimalNumber(senitherOverflow - senitherOverflowOffset)} ]
				`,
				inline: true,
			}, {
				name: 'Lily Weight',
				value: stripIndents`
					${Formatters.bold('Total')}: ${this.client.formatDecimalNumber(lilyTotalWeight)} [ ${this.client.formatDecimalNumber(lilyWeight)} + ${this.client.formatDecimalNumber(lilyOverflow)} ]
					${Formatters.bold('Δ:')} ${this.client.formatDecimalNumber(lilyTotalWeight - lilyTotalWeightOffet)} [ ${this.client.formatDecimalNumber(lilyWeight - lilyWeightOffset)} + ${this.client.formatDecimalNumber(lilyOverflow - lilyOverflowOffset)} ]
				`,
				inline: true,
			});

		embeds.push(MessageEmbedUtil.padFields(embed));

		return await InteractionUtil.reply(interaction, { embeds });
	}
}
