'use strict';

const { stripIndents } = require('common-tags');
const { autocorrect } = require('../../functions/util');
const { addPageReactions, getOffsetFromFlags, createGainedStatsEmbed } = require('../../functions/leaderboardMessages');
const { SKILLS, COSMETIC_SKILLS, SLAYERS, DUNGEON_TYPES, DUNGEON_CLASSES } = require('../../constants/skyblock');
const { XP_OFFSETS_SHORT } = require('../../constants/database');
const Command = require('../../structures/commands/Command');
const logger = require('../../functions/logger');


module.exports = class LeaderboardCommand extends Command {
	constructor(data) {
		super(data, {
			aliases: [ 'lb' ],
			description: 'guild member leaderboard for skill / slayer xp gained',
			usage: () => stripIndents`
				<\`type\`> <page \`number\`> <${this.client.hypixelGuilds.guildNameFlags}|\`-all\`> <${Object.keys(XP_OFFSETS_SHORT).map(offset => `\`-${offset}\``).join('|')}>

				currently supported types:
				skill, ${SKILLS.join(', ')}
				${COSMETIC_SKILLS.join(', ')}
				slayer, revenant, tarantula, sven, ${SLAYERS.join(', ')}
				dungeon, ${[ ...DUNGEON_TYPES, ...DUNGEON_CLASSES ].join(', ')}
				guildxp
				weight
			`,
			cooldown: 1,
		});
	}

	/**
	 * execute the command
	 * @param {import('../../structures/LunarClient')} client
	 * @param {import('../../structures/database/managers/ConfigManager')} config
	 * @param {import('../../structures/extensions/Message')} message message that triggered the command
	 * @param {string[]} args command arguments
	 * @param {string[]} flags command flags
	 * @param {string[]} rawArgs arguments and flags
	 */
	async run(client, config, message, args, flags, rawArgs) {
		const { id: userID } = message.author;

		let type;
		let page;

		args.forEach(arg => /^\D/.test(arg)
			? (type ??= arg.toLowerCase())
			: (page ??= parseInt(arg, 10)),
		);

		// type input
		if (type) {
			const result = autocorrect(type, [ ...SKILLS, ...COSMETIC_SKILLS, ...SLAYERS, ...DUNGEON_TYPES, ...DUNGEON_CLASSES, 'skill', 'slayer', 'revenant', 'tarantula', 'sven', 'dungeon', 'guild', 'gxp', 'weight' ]);

			if (result.similarity < config.get('AUTOCORRECT_THRESHOLD') && !flags.some(flag => [ 'f', 'force' ].includes(flag))) {
				const ANSWER = await message.awaitReply(`there is currently no lb for \`${type}\`. Did you mean \`${result.value}\`?`, 30);

				if (!config.getArray('REPLY_CONFIRMATION').includes(ANSWER?.toLowerCase())) return;
			}

			switch (result.value) {
				case 'revenant':
					type = 'zombie';
					break;

				case 'tarantula':
					type = 'spider';
					break;

				case 'sven':
					type = 'wolf';
					break;

				case 'dungeon':
					type = 'catacombs';
					break;

				case 'gxp':
					type = 'guild';
					break;

				default:
					type = result.value;
			}
		} else {
			type = config.get('CURRENT_COMPETITION');
		}

		const reply = await message.reply(createGainedStatsEmbed(client, {
			userID,
			hypixelGuild: client.hypixelGuilds.getFromArray(flags),
			type,
			offset: getOffsetFromFlags(config, flags),
			shouldShowOnlyBelowReqs: flags.some(flag => [ 't', 'track' ].includes(flag)),
			page: page > 0 ? page : 1,
		}));

		addPageReactions(reply);
	}
};
