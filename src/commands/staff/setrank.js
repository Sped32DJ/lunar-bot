'use strict';

const { stripIndent } = require('common-tags');
const { setRank: { regExp: setRank } } = require('../../structures/chat_bridge/constants/commandResponses');
const Command = require('../../structures/commands/Command');
const logger = require('../../functions/logger');


module.exports = class DemoteCommand extends Command {
	constructor(data) {
		super(data, {
			aliases: [],
			description: 'set a rank of a guild member',
			args: 2,
			usage: '[`ign`|`discord id`|`@mention`] [`rank` name] <`-f`|`--force` to disable IGN autocorrection>',
			cooldown: 0,
		});
	}

	/**
	 * execute the command
	 * @param {import('../../structures/extensions/Message')} message message that triggered the command
	 * @param {string[]} args command arguments
	 * @param {string[]} flags command flags
	 * @param {string[]} rawArgs arguments and flags
	 */
	async run(message, args, flags, rawArgs) { // eslint-disable-line no-unused-vars
		/**
		 * @type {import('../../structures/database/models/HypixelGuild')}
		 */
		const hypixelGuild = this.client.hypixelGuilds.getFromArray(args) ?? message.author.player?.guild;

		if (!hypixelGuild) return message.reply('unable to find your guild.');

		const { chatBridge } = hypixelGuild;
		const IGN = message.mentions.users.size
			? message.messages.users.first().player?.ign
			: (this.force(flags) ? args[0] : this.client.players.getByIGN(args[0])?.ign ?? this.client.players.getByID(args[0])?.ign ?? args[0]);

		try {
			const response = await chatBridge.command({
				command: `g setrank ${IGN} ${args[1]}`,
				responseRegex: setRank(IGN, undefined, args[1]),
			});

			message.reply(stripIndent`
				\`/g setrank ${IGN} ${args[1]}\`
				 > ${response}
			`);
		} catch (error) {
			logger.error(error);
			message.reply(`an unknown error occurred while executing setrank \`${IGN}\` ${args[1]}.`);
		}
	}
};
