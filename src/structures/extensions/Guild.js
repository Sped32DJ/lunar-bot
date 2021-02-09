'use strict';

const { Structures, Guild, Collection } = require('discord.js');
const logger = require('../../functions/logger');


class LunarGuild extends Guild {
	constructor(client, data) {
		super(client, data);
	}

	/**
	 * verifies the roles via guild.roles.cache and sorts them by position, array -> collection
	 * @param {string[]} roleIDs role IDs to verify
	 */
	verifyRoleIDs(roleIDs) {
		const highestBotRole = this.me.roles.highest;

		return new Collection(
			roleIDs
				.map(roleID => [ roleID, this.roles.cache.get(roleID) ])
				.filter(([ roleID, role ]) => {
					if (!role) return logger.warn(`[CHECK ROLE IDS]: '${roleID}' is not a valid role id`);
					if (role.comparePositionTo(highestBotRole) >= 0) return logger.warn(`[CHECK ROLE IDS]: '${role.name}' is higher than the bot's highest role`);
					return true;
				})
				.sort(([, a ], [, b ]) => b.comparePositionTo(a)),
		);
	}
}

Structures.extend('Guild', Guild => LunarGuild); // eslint-disable-line no-shadow, no-unused-vars

module.exports = LunarGuild;
