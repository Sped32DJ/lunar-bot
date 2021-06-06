'use strict';

const { basename } = require('path');
const { Structures, CommandInteraction } = require('discord.js');
// const logger = require('../../functions/logger');


class LunarCommandInteraction extends CommandInteraction {
	constructor(...args) {
		super(...args);

		/**
		 * wether the first reply was ephemeral
		 */
		this.ephemeral = null;
		/**
		 * deferring promise
		 */
		this._deferring = null;

		const { channel } = this;

		/**
		 * wether to use ephemeral replies and deferring
		 */
		this.useEphemeral = channel !== null && channel.type !== 'dm'
			? !(channel.name.includes('command') || channel.isTicket || !(this.options.get('ephemeral')?.value ?? true)) // guild channel
			: false; // DM channel
	}

	/**
	 * @param {import('discord.js').CommandInteractionOption[]} options
	 */
	static stringifyOptions(options) {
		return options
			?.reduce(
				(acc, cur) => {
					if (cur.type === 'SUB_COMMAND' || cur.type === 'SUB_COMMAND_GROUP') {
						return `${acc} ${cur.name}${this.stringifyOptions(cur.options)}`;
					}

					return `${acc} ${cur.name}: ${cur.value}`;
				},
				'',
			)
			?? '';
	}

	get logInfo() {
		return `${this.commandName}${LunarCommandInteraction.stringifyOptions(this.options)}`;
	}

	/**
	 * appends the first option name if the command is a sub command or sub command group
	 */
	get fullCommandName() {
		const firstOption = this.options?.first();
		return `${this.commandName}${firstOption?.type === 'SUB_COMMAND' || firstOption.type === 'SUB_COMMAND_GROUP' ? ` ${firstOption.name}` : ''}`;
	}

	/**
	 * @param {import('discord.js').InteractionDeferOptions} param0
	 */
	async defer({ ephemeral = this.useEphemeral, ...options } = {}) {
		this.ephemeral = ephemeral;

		return this._deferring = super.defer({ ephemeral, ...options });
	}

	/**
	 *
	 * @param {string | import('discord.js').InteractionReplyOptions} contentOrOptions
	 */
	async reply(contentOrOptions) {
		const data = typeof contentOrOptions === 'string'
			? { ephemeral: this.useEphemeral, content: contentOrOptions }
			: { ephemeral: this.useEphemeral, ...contentOrOptions };

		await this._deferring;

		if (this.deferred) {
			// ephemeral defer
			if (this.ephemeral) {
				if (data.ephemeral) return this.editReply(data);

				// ephemeral defer and non-ephemeral followUp
				await this.deleteReply();
				return this.followUp(data);
			}

			// non-ephemeral defer
			if (data.ephemeral) {
				await this.deleteReply();
				return this.followUp(data);
			}

			return this.editReply(data);
		}

		if (this.replied) return this.followUp(data);

		this.ephemeral = data.ephemeral;

		return super.reply(data);
	}
}

Structures.extend(basename(__filename, '.js'), () => LunarCommandInteraction);

module.exports = LunarCommandInteraction;
