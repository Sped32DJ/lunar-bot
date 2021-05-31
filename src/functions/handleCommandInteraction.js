'use strict';

const { Collection } = require('discord.js');
const { commaListsOr } = require('common-tags');
const ms = require('ms');
const ChatBridgeError = require('../structures/errors/ChatBridgeError');
const MissingPermissionsError = require('../structures/errors/MissingPermissionsError');
const logger = require('./logger');


/**
 * command handler
 * @param {import('../structures/extensions/CommandInteraction')} interaction
 */
module.exports = async (interaction) => {
	const { client } = interaction;

	try {
		const command = client.slashCommands.get(interaction.commandName);

		if (!command) return;

		// command cooldowns
		if (command.cooldown) {
			if	(!client.commands.cooldowns.has(command.name)) client.commands.cooldowns.set(command.name, new Collection());

			const NOW = Date.now();
			const timestamps = client.commands.cooldowns.get(command.name);
			const COOLDOWN_TIME = (command.cooldown ?? client.config.getNumber('COMMAND_COOLDOWN_DEFAULT')) * 1000;

			if (timestamps.has(interaction.user.id)) {
				const expirationTime = timestamps.get(interaction.user.id) + COOLDOWN_TIME;

				if (NOW < expirationTime) {
					const timeLeft = ms(expirationTime - NOW, { long: true });

					logger.info(`[CMD HANDLER]: ${interaction.user.tag}${interaction.guildID ? ` | ${interaction.member.displayName}` : ''} tried to execute '${interaction.logInfo}' in ${interaction.guildID ? `#${interaction.channel.name} | ${interaction.guild.name}` : 'DMs'} ${timeLeft} before the cooldown expires`);

					return interaction.reply(
						`\`${command.name}\` is on cooldown for another \`${timeLeft}\``,
						{
							ephemeral: true,
						},
					);
				}
			}

			timestamps.set(interaction.user.id, NOW);
			setTimeout(() => timestamps.delete(interaction.user.id), COOLDOWN_TIME);
		}

		logger.info(`[CMD HANDLER]: '${interaction.logInfo}' was executed by ${interaction.user.tag}${interaction.guildID ? ` | ${interaction.member.displayName}` : ''} in ${interaction.guildID ? `#${interaction.channel.name} | ${interaction.guild.name}` : 'DMs'}`);

		await command.run(interaction);
	} catch (error) {
		logger.error(error);

		try {
			if (error instanceof MissingPermissionsError) {
				const requiredRoles = error.requiredRoles.map(roleID => client.lgGuild?.roles.cache.get(roleID) ?? roleID);

				await interaction.reply(
					commaListsOr`missing permissions for \`${error.command}\` (${interaction.guildID === client.config.get('MAIN_GUILD_ID') ? requiredRoles.map(r => `${r}`) : requiredRoles.map(r => r.name ?? r)}): ${error.message}`,
					{
						ephemeral: true,
					},
				);
			} else if (error instanceof ChatBridgeError) {
				await interaction.reply(
					`${error}`,
					{
						ephemeral: true,
					},
				);
			} else {
				await interaction.reply(
					`an error occurred while executing the command: ${error}`,
					{
						ephemeral: true,
					},
				);
			}
		} catch (err) {
			logger.error(err);
		}
	}
};
