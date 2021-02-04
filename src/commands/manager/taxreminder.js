'use strict';

const { escapeIgn, checkBotPermissions } = require('../../functions/util');
const { getHypixelGuildFromFlags } = require('../../functions/leaderboardMessages');
const Command = require('../../structures/Command');
const logger = require('../../functions/logger');


module.exports = class TaxReminderCommand extends Command {
	constructor(data) {
		super(data, {
			aliases: [ 'reminder' ],
			description: 'ping all who have not paid',
			guildOnly: true,
			args: false,
			usage: '<`-g` or `--ghostping` to ghost ping>\n<`IGNs` or `IDs` to exclude from the ping>',
			cooldown: 60,
		});
	}

	async run(client, config, message, args, flags, rawArgs) {
		const SHOULD_GHOST_PING = flags.some(arg => [ 'g', 'gp', 'ghost', 'ghostping' ].includes(arg));
		const hGuild = getHypixelGuildFromFlags(client, flags);
		const playersToRemind = (hGuild?.players ?? client.players).filter(player => !player.paid && !args.includes(player.discordID) && !args.some(arg => arg.toLowerCase() === player.ign.toLowerCase()));
		const [ playersPingable, playersOnlyIgn ] = playersToRemind.partition(player => player.inDiscord && /^\d+$/.test(player.discordID));
		const AMOUNT_TO_PING = playersPingable.size;

		if (!flags.some(flag => [ 'f', 'force' ].includes(flag))) {
			const ANSWER = await message.awaitReply(
				`${SHOULD_GHOST_PING ? 'ghost' : ''}ping \`${AMOUNT_TO_PING}\` member${AMOUNT_TO_PING !== 1 ? 's' : ''} from ${hGuild?.name ?? 'all guilds'}?`,
				60,
				{ sameChannel: true },
			);

			if (!config.getArray('REPLY_CONFIRMATION').includes(ANSWER?.toLowerCase())) return message.reply(
				'the command has been cancelled.',
				{ sameChannel: true },
			);
		}

		message.channel.startTyping();

		let pingMessage = '';

		playersPingable.forEach(player => pingMessage += ` <@${player.discordID}>`);
		playersOnlyIgn.forEach(player => pingMessage += ` ${escapeIgn(player.ign)}`);

		// send ping message and split between pings if too many chars
		await message.reply(pingMessage, { reply: false, sameChannel: true, split: { char: ' ' } });

		message.channel.stopTyping();

		// optional ghost ping (delete ping message(s))
		if (!SHOULD_GHOST_PING) return;

		const fetched = await message.channel.messages.fetch({ after: message.id }).catch(error => logger.error(`[TAX REMINDER]: ghost ping: ${error.name}: ${error.message}`));

		if (!fetched) return;
		if (!checkBotPermissions(message.channel, 'MANAGE_MESSAGES')) return fetched.filter(msg => msg.author.id === client.user.id).forEach(msg => msg.delete().catch(logger.error));

		message.channel.bulkDelete([ message.id, ...fetched.filter(fetchedMsg => [ client.user.id, message.author.id ].includes(fetchedMsg.author.id)).keys() ]).catch(logger.error);
	}
};
