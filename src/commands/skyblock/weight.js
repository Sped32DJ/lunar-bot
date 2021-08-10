'use strict';

const { Constants } = require('discord.js');
const { getSenitherWeight } = require('../../functions/skyblock');
const BaseWeightCommand = require('./~base-weight');
// const logger = require('../../functions/logger');


module.exports = class WeightCommand extends BaseWeightCommand {
	constructor(data) {
		super(
			data,
			{
				aliases: [],
				description: 'shows a player\'s senither weight: total, weight and overflow',
				options: [{
					name: 'ign',
					type: Constants.ApplicationCommandOptionTypes.STRING,
					description: 'IGN | UUID',
					required: false,
				}, BaseWeightCommand.SKYBLOCK_PROFILE_OPTION ],
				cooldown: 1,
			},
			{
				aliases: [ 'w' ],
				args: false,
				usage: '<`IGN`> <`profile` name>',
			},
		);
	}

	/**
	 * @param {import('@zikeji/hypixel').Components.Schemas.SkyBlockProfileMember} skyblockMember
	 */
	getWeight(skyblockMember) { // eslint-disable-line class-methods-use-this
		return getSenitherWeight(skyblockMember);
	}
};
