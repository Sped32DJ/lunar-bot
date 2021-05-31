'use strict';

const { basename } = require('path');
const { Structures, User } = require('discord.js');
// const logger = require('../../functions/logger');


class LunarUser extends User {
	constructor(...args) {
		super(...args);

		/**
		 * @type {import('../database/models/Player')}
		 */
		this._player = null;
	}

	/**
	 * player object associated with the discord user
	 */
	get player() {
		return this._player ??= this.client.players.getByID(this.id);
	}

	/**
	 * player object associated with the discord user
	 */
	set player(value) {
		this._player = value;
	}

	/**
	 * hypixelGuild object associated with the discord user
	 */
	get hypixelGuild() {
		return this.player?.guild ?? null;
	}
}

Structures.extend(basename(__filename, '.js'), () => LunarUser);

module.exports = LunarUser;
