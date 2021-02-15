'use strict';

const { CronJob } = require('cron');
const ModelHandler = require('./ModelHandler');
const logger = require('../../functions/logger');


class CronJobHandler extends ModelHandler {
	constructor(options) {
		super(options);

		/**
		 * @type {import('discord.js').Collection<string, import('./models/CronJob')}
		 */
		this.cache;
		/**
		 * @type {import('./models/CronJob')}
		 */
		this.model;
	}

	async add({ name, date, command, authorID, messageID, channelID, args, flags }) {
		// create db entry
		await this.model.create({
			name,
			date: date.getTime(),
			command: command.name,
			authorID,
			messageID,
			channelID,
			args: args?.length ? args.join(' ') : null,
			flags: flags?.length ? flags.join(' ') : null,
		});

		// create cronJob and add to collection
		this.cache.set(name, new CronJob({
			cronTime: date,
			onTick: async () => {
				command.run(this.client, this.client.config, await (await this.model.findOne({ where: { name } })).restoreCommandMessage(), args, flags).catch(logger.error);
				this.cache.delete(name);
				this.model.destroy({ where: { name } });
				logger.info(`[CRONJOB]: ${name}`);
			},
			start: true,
		}));
	}

	async remove(instanceOrId) {
		const cronJob = this.resolve(instanceOrId);

		if (!cronJob) return logger.debug(`[CRONJOB REMOVE]: unknown entry: ${instanceOrId}`);

		cronJob.stop();

		return super.remove(cronJob);
	}
}

module.exports = CronJobHandler;
