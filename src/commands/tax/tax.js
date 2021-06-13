'use strict';

const { Permissions, Constants } = require('discord.js');
const { Op } = require('sequelize');
const { validateNumber } = require('../../functions/stringValidators');
const { escapeIgn, safePromiseAll } = require('../../functions/util');
const SlashCommand = require('../../structures/commands/SlashCommand');
const logger = require('../../functions/logger');


module.exports = class TaxCommand extends SlashCommand {
	constructor(data) {
		super(data, {
			aliases: [],
			description: 'guild tax',
			options: [{
				name: 'ah',
				type: Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
				description: 'add / remove a player as tax collector',
				options: [{
					name: 'action',
					type: Constants.ApplicationCommandOptionTypes.STRING,
					description: 'add / remove',
					required: true,
					choices: [ 'add', 'remove' ].map(name => ({ name, value: name })),
				}, {
					name: 'player',
					type: Constants.ApplicationCommandOptionTypes.STRING,
					description: 'IGN | minecraftUUID | discordID | @mention',
					required: true,
				}],
			}, {
				name: 'amount',
				type: Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
				description: 'set the tax amount',
				options: [{
					name: 'amount',
					type: Constants.ApplicationCommandOptionTypes.INTEGER,
					description: 'new tax amount',
					required: true,
				}],
			}, {
				name: 'collected',
				type: Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
				description: 'show a list of taxahs and their collected tax amount',
				options: [],
			}, {
				name: 'paid',
				type: Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
				description: 'manually set a player to paid',
				options: [{
					name: 'player',
					type: Constants.ApplicationCommandOptionTypes.STRING,
					description: 'IGN | minecraftUUID | discordID | @mention',
					required: true,
				}, {
					name: 'amount',
					type: Constants.ApplicationCommandOptionTypes.INTEGER,
					description: 'amount to overwrite the current tax amount',
					required: false,
				}],
			}, {
				name: 'reminder',
				type: Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
				description: 'ping all guild members who have not paid',
				options: [{
					name: 'ghostping',
					type: Constants.ApplicationCommandOptionTypes.BOOLEAN,
					description: 'wether to immediatly delete the pings after sending them',
					required: false,
				}, SlashCommand.guildOptionBuilder(data.client), {
					name: 'exclude',
					type: Constants.ApplicationCommandOptionTypes.STRING,
					description: 'IGNs to exclude from the ping',
					required: false,
				}],
			}, {
				name: 'reset',
				type: Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
				description: 'reset the tax database',
				options: [{
					name: 'player',
					type: Constants.ApplicationCommandOptionTypes.STRING,
					description: 'IGN | minecraftUUID | discordID | @mention',
					required: false,
				}],
			}],
			defaultPermission: true,
			cooldown: 0,
		});
	}

	/**
	 * execute the command
	 * @param {import('../../structures/extensions/CommandInteraction')} interaction
	 */
	async run(interaction) {
		// destructure sub command
		const { name, options } = interaction.options.first();

		switch (name) {
			case 'ah': {
				const player = this.getPlayer(options);

				if (!player) {
					return interaction.reply(`\`${interaction.options.get('player').value}\` is not in the player db`);
				}

				const action = options.get('action').value;

				let log;

				switch (action) {
					case 'add':
						if (this.client.taxCollectors.cache.get(player.minecraftUUID)?.isCollecting) return interaction.reply(`\`${player.ign}\` is already a tax collector`);

						await this.client.taxCollectors.add(player);
						if (!player.paid) player.setToPaid(); // let collector collect their own tax if they have not paid already
						log = `\`${player.ign}\` is now a tax collector`;
						break;

					case 'remove': {
						const taxCollector = this.client.taxCollectors.cache.get(player.minecraftUUID);

						if (!taxCollector?.isCollecting) return interaction.reply(`\`${player.ign}\` is not a tax collector`);

						// remove self paid if only the collector paid the default amount at his own ah
						if (taxCollector.collectedTax === this.config.getNumber('TAX_AMOUNT') && player.collectedBy === player.minecraftUUID) {
							logger.info(`[TAX AH]: ${player.ign}: removed and reset tax paid`);
							await player.resetTax();
							await taxCollector.remove();
						} else {
							taxCollector.isCollecting = false;
							taxCollector.save();
						}

						log = `\`${taxCollector.ign}\` is no longer a tax collector`;
						break;
					}

					default:
						throw new Error('unknown command');
				}

				this.client.log(this.client.defaultEmbed
					.setTitle('Guild Tax')
					.setDescription(log),
				);

				return interaction.reply(log);
			}

			case 'amount': {
				const NEW_AMOUNT = options.get('amount').value;

				if (NEW_AMOUNT < 0) return interaction.reply({
					content: 'tax amount must be a non-negative number',
					ephemeral: true,
				});

				const OLD_AMOUNT = this.config.getNumber('TAX_AMOUNT');

				await safePromiseAll([
					// update tax amount
					this.config.set('TAX_AMOUNT', NEW_AMOUNT),

					// update tax collectors
					...this.client.taxCollectors.activeCollectors.map(async (taxCollector) => {
						taxCollector.collectedTax += NEW_AMOUNT - OLD_AMOUNT;
						return taxCollector.save();
					}),
				]);

				// logging
				this.client.log(this.client.defaultEmbed
					.setTitle('Guild Tax')
					.setDescription(`${interaction.user.tag} | ${interaction.user} changed the guild tax amount`)
					.addFields(
						{ name: 'Old amount', value: `\`\`\`\n${this.client.formatNumber(OLD_AMOUNT)}\`\`\``, inline: true },
						{ name: 'New amount', value: `\`\`\`\n${this.client.formatNumber(NEW_AMOUNT)}\`\`\``, inline: true },
					),
				);

				return interaction.reply(`changed the guild tax amount from \`${this.client.formatNumber(OLD_AMOUNT)}\` to \`${this.client.formatNumber(NEW_AMOUNT)}\``);
			}

			case 'collected': {
				return interaction.reply({
					embeds: [ this.client.taxCollectors.createTaxCollectedEmbed() ],
				});
			}

			case 'paid': {
				const collector = this.client.taxCollectors.getByID(interaction.user.id);

				if (!collector?.isCollecting) return interaction.reply({
					content: 'this command is restricted to tax collectors',
					ephemeral: true,
				});

				const player = this.getPlayer(options);

				if (!player) {
					return interaction.reply(`\`${interaction.options.get('player').value}\` is not in the player db`);
				}

				if (player.paid) {
					await interaction.awaitConfirmation(`\`${player.ign}\` is already set to paid with an amount of \`${this.client.formatNumber(await player.taxAmount ?? NaN)}\`. Overwrite this?`);
					await player.resetTax();
				}

				const AMOUNT = options.get('amount')?.value ?? this.config.getNumber('TAX_AMOUNT');

				await player.setToPaid({
					amount: AMOUNT,
					collectedBy: collector.minecraftUUID,
				});

				this.client.log(this.client.defaultEmbed
					.setTitle('Guild Tax')
					.addField(`/ah ${collector.ign}`, `\`\`\`\n${player.ign}: ${this.client.formatNumber(AMOUNT)} (manually)\`\`\``),
				);

				return interaction.reply(`\`${player.ign}\` manually set to paid with ${AMOUNT === this.config.getNumber('TAX_AMOUNT') ? 'the default' : 'a custom'} amount of \`${this.client.formatNumber(AMOUNT)}\``);
			}

			case 'reminder': {
				const SHOULD_GHOST_PING = options?.get('ghostping')?.value ?? false;
				const hypixelGuild = options?.has('guild')
					? this.getHypixelGuild(options, interaction)
					: null;
				const excluded = options?.get('exclude')?.value.split(/\W/g).flatMap(x => (x ? x.toLowerCase() : [])); // lower case IGN array
				const playersToRemind = (hypixelGuild?.players ?? this.client.players.inGuild)
					.filter(({ paid, ign }) => !paid && excluded?.includes(ign.toLowerCase()));
				const [ playersPingable, playersOnlyIgn ] = playersToRemind.partition(({ inDiscord, discordID }) => inDiscord && validateNumber(discordID));
				const AMOUNT_TO_PING = playersPingable.size;

				if (!AMOUNT_TO_PING) return interaction.reply({
					content: `no members to ping from ${hypixelGuild?.name ?? 'all guilds'}`,
					ephemeral: true,
				});

				await interaction.awaitConfirmation(`${SHOULD_GHOST_PING ? 'ghost' : ''}ping \`${AMOUNT_TO_PING}\` member${AMOUNT_TO_PING !== 1 ? 's' : ''} from ${hypixelGuild?.name ?? 'all guilds'}?`);

				let pingMessage = '';

				for (const player of playersPingable) pingMessage += ` <@${player.discordID}>`;
				for (const player of playersOnlyIgn) pingMessage += ` ${escapeIgn(player.ign)}`;

				// send ping message and split between pings if too many chars
				await interaction.reply({
					content: pingMessage,
					split: { char: ' ' },
					ephemeral: false,
				});

				// optional ghost ping (delete ping message(s))
				if (!SHOULD_GHOST_PING) return;

				const replyMessage = await interaction.fetchReply();
				const fetched = await interaction.channel?.messages.fetch({ after: replyMessage.id }).catch(error => logger.error('[TAX REMINDER]: ghost ping', error));
				if (!fetched) return;

				return interaction.channel.deleteMessages([
					replyMessage.id,
					...fetched.filter(({ author: { id } }) => [ this.client.user.id, interaction.user.id ].includes(id)).keys(),
				]);
			}

			case 'reset': {
				const { players, taxCollectors } = this.client;

				let currentTaxEmbed;
				let currentTaxCollectedEmbed;
				let result;

				// individual player
				if (options?.has('player')) {
					const player = this.getPlayer(options)
						?? await players.model.findOne({
							where: {
								guildID: null,
								ign: { [Op.iLike]: `%${options.get('player').value}%` },
							},
						});

					if (!player) {
						return interaction.reply(`\`${options.get('player').value}\` is not in the player db`);
					}

					if (!player.paid) return interaction.reply(`\`${player.ign}\` is not set to paid`);

					const OLD_AMOUNT = await player.taxAmount;

					await interaction.awaitConfirmation(`reset tax paid from \`${player.ign}\` (amount: ${OLD_AMOUNT ? this.client.formatNumber(OLD_AMOUNT) : 'unknown'})?`);
					await player.resetTax();

					result = `reset tax paid from \`${player.ign}\` (amount: ${OLD_AMOUNT ? this.client.formatNumber(OLD_AMOUNT) : 'unknown'})`;

				// all players
				} else {
					await interaction.awaitConfirmation('reset tax paid from all guild members?');

					// get current tax embed from #guild-tax channel
					currentTaxEmbed = await (async () => {
						const taxChannel = this.client.lgGuild?.channels.cache.get(this.config.get('TAX_CHANNEL_ID'));

						if (!taxChannel) return logger.warn('[TAX RESET] tax channel error');

						const taxMessage = await taxChannel.messages.fetch(this.config.get('TAX_MESSAGE_ID')).catch(logger.error);

						if (!taxMessage) return logger.warn('[TAX RESET] TAX_MESSAGE fetch error');

						return taxMessage.embeds[0];
					})();

					if (!currentTaxEmbed) {
						await interaction.awaitConfirmation(`unable to retrieve the current tax embed from ${this.client.lgGuild?.channels.cache.get(this.config.get('TAX_CHANNEL_ID')) ?? '#guild-tax'} to log it. Create a new one and continue?`);

						currentTaxEmbed = this.client.db.createTaxEmbed();
					}

					currentTaxCollectedEmbed = taxCollectors.createTaxCollectedEmbed();


					// update database
					await safePromiseAll([
						...taxCollectors.cache.map(async (taxCollector) => { // remove retired collectors and reset active ones
							if (!taxCollector.isCollecting) return taxCollector.remove();
							return safePromiseAll([
								taxCollector.resetAmount('tax'),
								taxCollector.resetAmount('donation'),
							]);
						}),
						this.client.db.Sequelize.Model.update.call(players.model, // reset players that left
							{ paid: false },
							{
								where: {
									guildID: null,
									paid: true,
								},
							},
						),
						...players.cache.map(async (player) => { // reset current players
							player.paid = false;
							return player.save();
						}),
						this.config.set('TAX_AUCTIONS_START_TIME', Date.now()), // ignore all auctions up until now
					]);

					await safePromiseAll(taxCollectors.cache.map(async ({ player }) => player?.setToPaid()));

					// delete players who left the guild
					players.sweepDb();

					result = 'reset the tax database. All auctions up until now will be ignored';
				}

				// logging
				(async () => {
					try {
						/** @type {import('../../structures/extensions/Message')} */
						const logMessage = await this.client.log(
							currentTaxEmbed,
							currentTaxCollectedEmbed,
							this.client.defaultEmbed
								.setTitle('Guild Tax')
								.setDescription(`${interaction.user.tag} | ${interaction.user} ${result}`),
						);

						if (!currentTaxEmbed) return;
						if (!logMessage.channel.botPermissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) return;

						const pinnedMessages = await logMessage.channel.messages.fetchPinned();

						if (pinnedMessages.size >= 50) await pinnedMessages.last().unpin({ reason: 'reached max pin amount' });

						logger.info('[TAX RESET]: unpinned old tax embed');

						await logMessage.pin({ reason: '#sheet-logs' });
					} catch (error) {
						logger.error('[TAX RESET]: logging', error);
					}
				})();

				return interaction.reply(result);
			}


			default:
				throw new Error('unknown command');
		}
	}
};
