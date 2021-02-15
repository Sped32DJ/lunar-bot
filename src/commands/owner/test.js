'use strict';

const Command = require('../../structures/Command');
const logger = require('../../functions/logger');


module.exports = class TestCommand extends Command {
	constructor(data) {
		super(data, {
			aliases: [ 'debug' ],
			description: 'dynamic test function',
			args: false,
			usage: '<test arguments>',
			cooldown: 0,
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
		return;
	}
};
