'use strict';

const { stripIndents, oneLineCommaListsOr, oneLine } = require('common-tags');
const { checkIfDiscordTag } = require('../../functions/util');
const Command = require('../../structures/commands/Command');
const logger = require('../../functions/logger');


module.exports = class UnlinkCommand extends Command {
	constructor(data) {
		super(data, {
			aliases: [],
			description: 'delete a link between a discord user and a minecraft ign',
			args: true,
			usage: '[`IGN`|`discord id`|`discord tag`|`@mention`]',
			cooldown: 1,
		});
	}

	/**
	 * execute the command
	 * @param {import('../../structures/LunarClient')} client
	 * @param {import('../../structures/database/ConfigHandler')} config
	 * @param {import('../../structures/extensions/Message')} message message that triggered the command
	 * @param {string[]} args command arguments
	 * @param {string[]} flags command flags
	 * @param {string[]} rawArgs arguments and flags
	 */
	async run(client, config, message, args, flags, rawArgs) {
		const { players } = client;

		/**
		 * @type {import('../../structures/database/models/Player')}
		 */
		let player;

		// message includes @mention
		if (message.mentions.users.size) {
			player = message.author.player;

		// no @mentions
		} else {
			for (const arg of args) {
				// discord tag
				if (checkIfDiscordTag(arg)) {
					const discordMember = await client.lgGuild?.findMemberByTag(arg);

					if (!discordMember) continue;

					player = discordMember.player;

				// no discord tag -> ign or discord id
				} else {
					player = players.getByIGN(arg) ?? players.getByID(arg);
				}

				if (player) break;
			}
		}

		// no player to unlink found
		if (!player) return message.reply(stripIndents`
			${oneLineCommaListsOr`${args.map(arg => `\`${arg}\``)}`} does not contain a known IGN, discord id, discord tag or @mention.
		`);

		if (!player.discordID) return message.reply(`\`${player.ign}\` is not linked.`);

		const { discordID: OLD_LINKED_ID } = player;
		const currentLinkedMember = await player.discordMember;
		const WAS_SUCCESSFUL = await player.unlink(`unlinked by ${message.author.tag}`);

		message.reply(
			oneLine`
				\`${player.ign}\` is no longer linked to ${currentLinkedMember ?? `\`${OLD_LINKED_ID}\``}
				${WAS_SUCCESSFUL ? '' : ' (unable to update the currently linked member)'}
			`,
			{ allowedMentions: { parse: [] } },
		);
	}
};
