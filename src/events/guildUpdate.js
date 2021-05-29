'use strict';

const logger = require('../functions/logger');


/*
	doesn't emit in all cases, so it's pretty useless, code from: S:\pi\lunar_bot_dev\node_modules\discord.js\src\client\websocket\handlers\GUILD_CREATE.js
 */

/**
 * guildUpdate
 * @param {import('../structures/LunarClient')} client
 * @param {import('../structures/extensions/Guild')} oldGuild
 * @param {import('../structures/extensions/Guild')} newGuild
 */
module.exports = async (client, oldGuild, newGuild) => {
	// Fetch all members in a newly available guild
	if (client.options.fetchAllMembers && !oldGuild.available && newGuild.available) {
		try {
			await newGuild.members.fetch();
			logger.debug(`[GUILD UPDATE]: ${newGuild.name}: fetched all members`);
		} catch (error) {
			logger.error(`[GUILD UPDATE]: ${newGuild.name}: failed to fetch all members`, error);
		}
	}

	// sync the bot's avatar with the discord server icon
	if (newGuild.id === client.config.get('DISCORD_GUILD_ID') && oldGuild.iconURL() !== newGuild.iconURL()) {
		try {
			await client.user.setAvatar(newGuild.iconURL());
			logger.info(`[GUILD UPDATE]: updated bot avatar to ${newGuild.iconURL()}`);
		} catch (error) {
			logger.error(`[GUILD UPDATE]: error updating bot avatar to ${newGuild.iconURL()}`, error);
		}
	}
};
