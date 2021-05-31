'use strict';

/**
 * @typedef {import('discord.js').ApplicationCommandData & { aliases: ?string[], permissions: import('discord.js').ApplicationCommandPermissions, cooldown: ?number }} CommandData
 */


module.exports = class SlashCommand {
	/**
	 * create a new command
	 * @param {object} param0
	 * @param {import('../LunarClient')} param0.client discord this.client that instantiated this command
	 * @param {import('./CommandCollection')} param0.collection
	 * @param {string} param0.name command name
	 * @param {CommandData} param1
	 */
	constructor({ client, collection, name }, { aliases, description, options, defaultPermission, permissions, cooldown }) {
		this.client = client;
		this.collection = collection;
		this.name = name;
		/** @type {?string} */
		this.id = null;
		this.aliases = aliases?.length ? aliases.filter(Boolean) : null;

		this.description = description?.length ? description : null;
		this.options = options ?? null;
		this.defaultPermission = defaultPermission ?? true;

		this.permissions = permissions ?? null;
		if (this.permissions?.length) this.permissions.push({
			id: this.client.ownerID,
			type: 'USER',
			permission: true,
		});

		this.cooldown = cooldown ?? null;
	}

	/**
	 * wether the force option was set to true
	 * @param {import('discord.js').CommandInteractionOption[]} options
	 * @returns {boolean}
	 */
	static checkForce(options) {
		return options?.find(({ name }) => name === 'force')?.value ?? false;
	}

	/**
	 * @returns {import('discord.js').ApplicationCommandData}
	 */
	get data() {
		return {
			name: this.name,
			description: this.description,
			options: this.options,
			defaultPermission: this.defaultPermission,
		};
	}

	/**
	 * client config
	 */
	get config() {
		return this.client.config;
	}

	/**
	 * loads the command and possible aliases into their collections
	 */
	load() {
		this.collection.set(this.name.toLowerCase(), this);
		this.aliases?.forEach(alias => this.collection.set(alias.toLowerCase(), this));
	}

	/**
	 * removes all aliases and the command from the commandsCollection
	 */
	unload() {
		this.collection.delete(this.name.toLowerCase());
		this.aliases?.forEach(alias => this.collection.delete(alias.toLowerCase()));

		for (const path of Object.keys(require.cache).filter(filePath => !filePath.includes('node_modules') && !filePath.includes('functions') && filePath.includes('commands') && filePath.endsWith(`${this.name}.js`))) {
			delete require.cache[path];
		}
	}

	/**
	 * execute the command
	 * @param {import('../structures/extensions/CommandInteraction')} interaction
	 */
	async run(interaction) { // eslint-disable-line no-unused-vars
		throw new Error('no run function specified');
	}
};
