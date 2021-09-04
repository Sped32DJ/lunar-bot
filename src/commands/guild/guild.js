import { SlashCommandBuilder } from '@discordjs/builders';
import { SnowflakeUtil, Formatters } from 'discord.js';
import pkg from 'sequelize';
const { Op } = pkg;
import ms from 'ms';
import { demote, historyErrors, invite, kick, mute, logErrors, promote, setRank, topErrors, unmute } from '../../structures/chat_bridge/constants/index.js';
import { EMBED_DESCRIPTION_MAX_CHARS, GUILD_ID_BRIDGER, HISTORY_DATA_KEYS, UNKNOWN_IGN } from '../../constants/index.js';
import { requiredPlayerOption, optionalPlayerOption, pageOption, requiredIgnOption, targetOption, forceOption, buildGuildOption } from '../../structures/commands/commonOptions.js';
import { InteractionUtil, UserUtil } from '../../util/index.js';
import { autocorrect, getIdFromString, logger, removeMcFormatting, stringToMS, trim } from '../../functions/index.js';
import { SlashCommand } from '../../structures/commands/SlashCommand.js';


export default class GuildCommand extends SlashCommand {
	constructor(context) {
		const slash = new SlashCommandBuilder()
			.setDescription('hypixel')
			.addSubcommand(subcommand => subcommand
				.setName('demote')
				.setDescription('demote')
				.addStringOption(requiredPlayerOption),
			)
			.addSubcommand(subcommand => subcommand
				.setName('kick')
				.setDescription('kick')
				.addStringOption(requiredPlayerOption)
				.addStringOption(option => option
					.setName('reason')
					.setDescription('reason')
					.setRequired(true),
				),
			)
			.addSubcommand(subcommand => subcommand
				.setName('history')
				.setDescription('history')
				.addIntegerOption(pageOption),
			)
			.addSubcommand(subcommand => subcommand
				.setName('info')
				.setDescription('info'),
			)
			.addSubcommand(subcommand => subcommand
				.setName('invite')
				.setDescription('invite')
				.addStringOption(requiredIgnOption),
			)
			.addSubcommand(subcommand => subcommand
				.setName('list')
				.setDescription('list'),
			)
			.addSubcommand(subcommand => subcommand
				.setName('log')
				.setDescription('log')
				.addStringOption(optionalPlayerOption)
				.addIntegerOption(pageOption),
			)
			.addSubcommand(subcommand => subcommand
				.setName('member')
				.setDescription('member')
				.addStringOption(optionalPlayerOption),
			)
			.addSubcommand(subcommand => subcommand
				.setName('members')
				.setDescription('members'),
			)
			.addSubcommand(subcommand => subcommand
				.setName('motd')
				.setDescription('motd'),
			)
			.addSubcommand(subcommand => subcommand
				.setName('mute')
				.setDescription('mute')
				.addStringOption(targetOption)
				.addStringOption(option => option
					.setName('duration')
					.setDescription('s[econds] | m[inutes] | h[ours] | d[ays]')
					.setRequired(true),
				),
			)
			.addSubcommand(subcommand => subcommand
				.setName('online')
				.setDescription('online'),
			)
			.addSubcommand(subcommand => subcommand
				.setName('promote')
				.setDescription('promote')
				.addStringOption(requiredPlayerOption),
			)
			.addSubcommand(subcommand => subcommand
				.setName('quest')
				.setDescription('quest'),
			)
			.addSubcommand(subcommand => subcommand
				.setName('setrank')
				.setDescription('setrank')
				.addStringOption(requiredPlayerOption)
				.addStringOption(option => option
					.setName('rank')
					.setDescription('rank name')
					.setRequired(true),
				),
			)
			.addSubcommand(subcommand => subcommand
				.setName('top')
				.setDescription('top')
				.addIntegerOption(option => option
					.setName('days_ago')
					.setDescription('number of days ago')
					.setRequired(false),
				),
			)
			.addSubcommand(subcommand => subcommand
				.setName('unmute')
				.setDescription('unmute')
				.addStringOption(targetOption),
			);
		const guildOption = buildGuildOption(context.client);

		for (const subcommand of slash.options) {
			if (subcommand.options.some(option => option.name === 'player' || option.name === 'target')) subcommand.addBooleanOption(forceOption);
			subcommand.addStringOption(guildOption);
		}

		super(context, {
			aliases: [ 'g' ],
			slash,
			cooldown: 0,
		});
	}

	/**
	 * @param {string} targetInput
	 * @param {?import('discord.js').CommandInteraction} interaction
	 */
	async getMuteTarget(targetInput, interaction) {
		if ([ 'guild', 'everyone' ].includes(targetInput)) {
			return 'everyone';
		}

		if (!interaction) return this.client.players.getByIgn(targetInput) ?? targetInput;

		return InteractionUtil.getPlayer(interaction)
			?? (InteractionUtil.checkForce(interaction)
				? targetInput // use input if force is set
				: (await this.client.players.fetch({ // try to find by ign or uuid
					[Op.or]: [{
						ign: { [Op.iLike]: targetInput },
						minecraftUuid: targetInput,
					}],
					cache: false,
				})
					?? await (async () => { // check if input is a discord id or @mention, find or create player db object if so
						const ID = getIdFromString(targetInput);

						if (!ID) return null;

						try {
							// check if ID is from a member in the guild
							await this.client.lgGuild?.members.fetch(ID);

							return (await this.client.players.model.findOrCreate({
								where: { discordId: ID },
								defaults: {
									minecraftUuid: SnowflakeUtil.generate(),
									guildId: GUILD_ID_BRIDGER,
									ign: UNKNOWN_IGN,
									inDiscord: true,
								},
								attributes: {
									exclude: HISTORY_DATA_KEYS, // don't cache  history arrays
								},
							}))[0];
						} catch (error) {
							return logger.error(error);
						}
					})()
				)
			);
	}

	/**
	 * /g mute
	 * @param {{ target: string | import('../../structures/database/models/Player').Player, duration: number, hypixelGuild?: import('../../structures/database/models/HypixelGuild').HypixelGuild }} param0
	 */
	async runMute({ target, executor, duration, hypixelGuild: hypixelGuildInput }) {
		let hypixelGuild = hypixelGuildInput;

		if (target instanceof this.client.players.model) {
			({ hypixelGuild } = target);

			if (target.guildRankPriority >= (executor?.guildRankPriority ?? -1)) return {
				content: `your guild rank needs to be higher than ${target}'s`,
				ephemeral: true,
			};

			target.mutedTill = Date.now() + duration;
			await target.save();

			if (target.notInGuild) return {
				content: `muted \`${target}\` for \`${duration}\``,
				ephemeral: false,
			};
		} else if (target === 'everyone') {
			hypixelGuild.mutedTill = Date.now() + duration;
			await hypixelGuild.save();
		}

		try {
			const { chatBridge } = hypixelGuild;
			const res = await chatBridge.minecraft.command({
				command: `g mute ${target} ${ms(duration)}`,
				responseRegExp: mute(target === 'everyone' ? 'the guild chat' : `${target}`, chatBridge.bot.username),
			});

			return {
				content: res,
				ephemeral: false,
			};
		} catch (error) {
			return {
				content: `${error}`,
				ephemeral: true,
			};
		}
	}

	/**
	 * @param {import('discord.js').CommandInteraction} interaction
	 * @param {number} duration
	 */
	async runMuteInteraction(interaction, duration) {
		const TARGET_INPUT = interaction.options.getString('target', true).toLowerCase();
		const target = await this.getMuteTarget(TARGET_INPUT, interaction);

		if (!target) return await InteractionUtil.reply(interaction, {
			content: `no player with the IGN \`${TARGET_INPUT}\` found`,
			ephemeral: true,
		});

		const { content, ephemeral } = await this.runMute({
			target,
			executor: UserUtil.getPlayer(interaction.user),
			duration,
			hypixelGuild: InteractionUtil.getHypixelGuild(interaction),
		});

		return await InteractionUtil.reply(interaction, {
			embeds: [
				this.client.defaultEmbed
					.setTitle(`/g mute ${target} ${ms(duration)}`)
					.setDescription(Formatters.codeBlock(content)),
			],
			ephemeral: interaction.options.get('visibility') === null
				? InteractionUtil.CACHE.get(interaction).useEphemeral || ephemeral
				: InteractionUtil.CACHE.get(interaction).useEphemeral,
		});
	}

	/**
	 * @param {{ target: import('../../structures/database/models/Player').Player | string, executor: ?import('../../structures/database/models/Player').Player, hypixelGuild: import('../../structures/database/models/HypixelGuild').HypixelGuild, reason: string }} param0
	 * @returns {Promise<{ content: string, ephemeral: boolean }>}
	 */
	async runKick({ target, executor, hypixelGuild, reason }) {
		if (!executor) return {
			content: 'unable to find a linked player to your discord account',
			ephemeral: true,
		};
		if (!executor.isStaff) return {
			content: 'you need to have an in game staff rank for this command',
			ephemeral: true,
		};
		if (executor.guildId !== hypixelGuild.guildId) return {
			content: `you need to be in ${hypixelGuild.name} to kick a player from there`,
			ephemeral: true,
		};

		if (typeof target === 'string') return {
			content: `no player with the IGN \`${target}\` found`,
			ephemeral: true,
		};
		if (target.guildRankPriority >= executor.guildRankPriority) return {
			content: `your guild rank needs to be higher than ${target}'s`,
			ephemeral: true,
		};

		const TIME_LEFT = this.config.get('LAST_KICK_TIME') + this.config.get('KICK_COOLDOWN') - Date.now();

		if (TIME_LEFT > 0) return {
			content: `kicking is on cooldown for another ${ms(TIME_LEFT, { long: true })}`,
			ephemeral: true,
		};

		try {
			const { chatBridge } = hypixelGuild;
			const res = await chatBridge.minecraft.command({
				command: `g kick ${target} ${reason}`,
				responseRegExp: kick.success(target.ign, chatBridge.bot.username),
				abortRegExp: kick.error(target.ign),
				rejectOnAbort: true,
				timeout: 60_000,
				rejectOnTimeout: true,
			});

			this.config.set('LAST_KICK_TIME', Date.now());

			return {
				content: res,
				ephemeral: false,
			};
		} catch (error) {
			return {
				content: `${error}`,
				ephemeral: true,
			};
		}
	}

	/**
	 * execute the command
	 * @param {import('discord.js').CommandInteraction} interaction
	 * @param {import('../../structures/chat_bridge/managers/MinecraftChatManager').CommandOptions} commandOptions
	 * @param {?import('../../structures/database/models/HypixelGuild').HypixelGuild} [hypixelGuild]
	 */
	async #run(interaction, commandOptions, { chatBridge } = InteractionUtil.getHypixelGuild(interaction)) {
		return await InteractionUtil.reply(interaction, {
			embeds: [
				this.client.defaultEmbed
					.setTitle(`/${commandOptions.command}`)
					.setDescription(Formatters.codeBlock(await chatBridge.minecraft.command(commandOptions))),
			],
		});
	}

	/**
	 * execute the command
	 * @param {import('discord.js').CommandInteraction} interaction
	 * @param {import('../../structures/chat_bridge/managers/MinecraftChatManager').CommandOptions} commandOptions
	 */
	async #runList(interaction, commandOptions) {
		return await InteractionUtil.reply(interaction, {
			embeds: [
				this.client.defaultEmbed
					.setTitle(`/${commandOptions.command}`)
					.setDescription(Formatters.codeBlock(
						trim(
							(await InteractionUtil.getHypixelGuild(interaction).chatBridge.minecraft.command({
								raw: true,
								...commandOptions,
							}))
								.map(msg => (msg.content.includes('●')
									? removeMcFormatting(
										msg.formattedContent
											.replace(/§r§c ●/g, ' 🔴') // prettify emojis
											.replace(/§r§a ●/g, ' 🟢')
											.replace(/\[.+?\] /g, ''), // remove hypixel ranks (helps with staying inside the character limit)
									)
									: msg.content),
								)
								.join('\n'),
							EMBED_DESCRIPTION_MAX_CHARS - 8, // 2 * (3 [```] + 1 [\n])
						),
					)),
			],
		});
	}

	/**
	 * execute the command
	 * @param {import('discord.js').CommandInteraction} interaction
	 */
	async runSlash(interaction) {
		const SUB_COMMAND = interaction.options.getSubcommand();

		switch (SUB_COMMAND) {
			case 'demote': {
				await this.checkPermissions(interaction, {
					roleIds: [ this.config.get('SHRUG_ROLE_ID'), this.config.get('TRIAL_MODERATOR_ROLE_ID'), this.config.get('MODERATOR_ROLE_ID'), this.config.get('DANKER_STAFF_ROLE_ID'), this.config.get('SENIOR_STAFF_ROLE_ID'), this.config.get('MANAGER_ROLE_ID') ],
				});

				const executor = UserUtil.getPlayer(interaction.user);

				if (!executor) return await InteractionUtil.reply(interaction, {
					content: 'unable to find a linked player for your discord account',
					ephemeral: true,
				});
				if (!executor.isStaff) return await InteractionUtil.reply(interaction, {
					content: 'you need to have an in game staff rank for this command',
					ephemeral: true,
				});

				const target = InteractionUtil.getPlayer(interaction);

				if (!target) return await InteractionUtil.reply(interaction, {
					content: `no player with the IGN \`${interaction.options.getString('player', true)}\` found`,
					ephemeral: true,
				});

				if (target.guildRankPriority >= executor.guildRankPriority) return await InteractionUtil.reply(interaction, {
					content: `your guild rank needs to be higher than ${target}'s`,
					ephemeral: true,
				});

				return this.#run(interaction, {
					command: `g demote ${target}`,
					responseRegExp: demote(target.ign),
				});
			}

			case 'kick': {
				await this.checkPermissions(interaction, {
					roleIds: [ this.config.get('MODERATOR_ROLE_ID'), this.config.get('DANKER_STAFF_ROLE_ID'), this.config.get('SENIOR_STAFF_ROLE_ID'), this.config.get('MANAGER_ROLE_ID') ],
				});

				const target = InteractionUtil.getPlayer(interaction) ?? interaction.options.getString('player', true);
				const reason = interaction.options.getString('reason', true);
				const { content, ephemeral } = await this.runKick({
					target,
					executor: UserUtil.getPlayer(interaction.user),
					reason,
					hypixelGuild: target?.hypixelGuild ?? InteractionUtil.getHypixelGuild(interaction),
				});

				return await InteractionUtil.reply(interaction, {
					embeds: [
						this.client.defaultEmbed
							.setTitle(`/g kick ${target} ${reason}`)
							.setDescription(Formatters.codeBlock(content)),
					],
					ephemeral: interaction.options.get('visibility') === null
						? InteractionUtil.CACHE.get(interaction).useEphemeral || ephemeral
						: InteractionUtil.CACHE.get(interaction).useEphemeral,
				});
			}

			case 'history': {
				await this.checkPermissions(interaction, {
					roleIds: [ this.config.get('GUILD_ROLE_ID'), this.config.get('SHRUG_ROLE_ID'), this.config.get('TRIAL_MODERATOR_ROLE_ID'), this.config.get('MODERATOR_ROLE_ID'), this.config.get('DANKER_STAFF_ROLE_ID'), this.config.get('SENIOR_STAFF_ROLE_ID'), this.config.get('MANAGER_ROLE_ID') ],
				});

				return this.#run(interaction, {
					command: `g history ${interaction.options.getInteger('page') ?? ''}`,
					abortRegExp: historyErrors(),
				});
			}

			case 'info':
			case 'motd':
			case 'quest': {
				await this.checkPermissions(interaction, {
					roleIds: [ this.config.get('GUILD_ROLE_ID'), this.config.get('SHRUG_ROLE_ID'), this.config.get('TRIAL_MODERATOR_ROLE_ID'), this.config.get('MODERATOR_ROLE_ID'), this.config.get('DANKER_STAFF_ROLE_ID'), this.config.get('SENIOR_STAFF_ROLE_ID'), this.config.get('MANAGER_ROLE_ID') ],
				});

				return this.#run(interaction, {
					command: `g ${SUB_COMMAND}`,
				});
			}

			case 'top': {
				await this.checkPermissions(interaction, {
					roleIds: [ this.config.get('GUILD_ROLE_ID'), this.config.get('SHRUG_ROLE_ID'), this.config.get('TRIAL_MODERATOR_ROLE_ID'), this.config.get('MODERATOR_ROLE_ID'), this.config.get('DANKER_STAFF_ROLE_ID'), this.config.get('SENIOR_STAFF_ROLE_ID'), this.config.get('MANAGER_ROLE_ID') ],
				});

				return this.#run(interaction, {
					command: `g top ${interaction.options.getInteger('days_ago') ?? ''}`,
					abortRegExp: topErrors(),
				});
			}

			case 'invite': {
				await this.checkPermissions(interaction, {
					roleIds: [ this.config.get('SHRUG_ROLE_ID'), this.config.get('TRIAL_MODERATOR_ROLE_ID'), this.config.get('MODERATOR_ROLE_ID'), this.config.get('DANKER_STAFF_ROLE_ID'), this.config.get('SENIOR_STAFF_ROLE_ID'), this.config.get('MANAGER_ROLE_ID') ],
				});

				const IGN = interaction.options.getString('ign', true);

				return this.#run(interaction, {
					command: `g invite ${IGN}`,
					responseRegExp: invite(IGN),
				});
			}

			case 'list':
			case 'members':
			case 'online': {
				await this.checkPermissions(interaction, {
					roleIds: [ this.config.get('GUILD_ROLE_ID'), this.config.get('BRIDGER_ROLE_ID'), this.config.get('SHRUG_ROLE_ID'), this.config.get('TRIAL_MODERATOR_ROLE_ID'), this.config.get('MODERATOR_ROLE_ID'), this.config.get('DANKER_STAFF_ROLE_ID'), this.config.get('SENIOR_STAFF_ROLE_ID'), this.config.get('MANAGER_ROLE_ID') ],
				});

				return this.#runList(interaction, {
					command: `g ${SUB_COMMAND}`,
				});
			}

			case 'log': {
				await this.checkPermissions(interaction, {
					roleIds: [ this.config.get('SHRUG_ROLE_ID'), this.config.get('TRIAL_MODERATOR_ROLE_ID'), this.config.get('MODERATOR_ROLE_ID'), this.config.get('DANKER_STAFF_ROLE_ID'), this.config.get('SENIOR_STAFF_ROLE_ID'), this.config.get('MANAGER_ROLE_ID') ],
				});

				const IGN = InteractionUtil.getIgn(interaction);
				const PAGE = interaction.options.getInteger('page');

				return this.#run(interaction, {
					command: `g log ${[ IGN, PAGE ].filter(x => x != null).join(' ')}`,
					abortRegExp: logErrors(),
				});
			}

			case 'member': {
				await this.checkPermissions(interaction, {
					roleIds: [ this.config.get('GUILD_ROLE_ID'), this.config.get('SHRUG_ROLE_ID'), this.config.get('TRIAL_MODERATOR_ROLE_ID'), this.config.get('MODERATOR_ROLE_ID'), this.config.get('DANKER_STAFF_ROLE_ID'), this.config.get('SENIOR_STAFF_ROLE_ID'), this.config.get('MANAGER_ROLE_ID') ],
				});

				const IGN = InteractionUtil.getIgn(interaction, true);
				if (!IGN) {
					const IGN_INPUT = interaction.options.getString('player');
					return await InteractionUtil.reply(interaction, {
						content: IGN_INPUT
							? `\`${IGN_INPUT}\` is not in the player db`
							: 'you are not in the player db',
						ephemeral: true,
					});
				}

				return this.#run(interaction, {
					command: `g member ${IGN}`,
				});
			}

			case 'mute': {
				await this.checkPermissions(interaction, {
					roleIds: [ this.config.get('SHRUG_ROLE_ID'), this.config.get('TRIAL_MODERATOR_ROLE_ID'), this.config.get('MODERATOR_ROLE_ID'), this.config.get('DANKER_STAFF_ROLE_ID'), this.config.get('SENIOR_STAFF_ROLE_ID'), this.config.get('MANAGER_ROLE_ID') ],
				});

				const DURATION_INPUT = interaction.options.getString('duration', true);
				const DURATION = stringToMS(DURATION_INPUT);

				if (Number.isNaN(DURATION)) return await InteractionUtil.reply(interaction, {
					content: `\`${DURATION_INPUT}\` is not a valid duration`,
					ephemeral: true,
				});

				return await this.runMuteInteraction(interaction, DURATION);
			}

			case 'promote': {
				await this.checkPermissions(interaction, {
					roleIds: [ this.config.get('SHRUG_ROLE_ID'), this.config.get('TRIAL_MODERATOR_ROLE_ID'), this.config.get('MODERATOR_ROLE_ID'), this.config.get('DANKER_STAFF_ROLE_ID'), this.config.get('SENIOR_STAFF_ROLE_ID'), this.config.get('MANAGER_ROLE_ID') ],
				});

				const executor = UserUtil.getPlayer(interaction.user);

				if (!executor) return await InteractionUtil.reply(interaction, {
					content: 'unable to find a linked player for your discord account',
					ephemeral: true,
				});
				if (!executor.isStaff) return await InteractionUtil.reply(interaction, {
					content: 'you need to have an in game staff rank for this command',
					ephemeral: true,
				});

				const target = InteractionUtil.getPlayer(interaction);

				if (!target) return await InteractionUtil.reply(interaction, {
					content: `no player with the IGN \`${interaction.options.getString('player', true)}\` found`,
					ephemeral: true,
				});

				if (target.guildRankPriority >= executor.guildRankPriority - 1) return await InteractionUtil.reply(interaction, {
					content: 'you can only promote up to your own rank',
					ephemeral: true,
				});

				return this.#run(interaction, {
					command: `g promote ${target}`,
					responseRegExp: promote(target.ign),
				});
			}

			case 'setrank': {
				await this.checkPermissions(interaction, {
					roleIds: [ this.config.get('SHRUG_ROLE_ID'), this.config.get('TRIAL_MODERATOR_ROLE_ID'), this.config.get('MODERATOR_ROLE_ID'), this.config.get('DANKER_STAFF_ROLE_ID'), this.config.get('SENIOR_STAFF_ROLE_ID'), this.config.get('MANAGER_ROLE_ID') ],
				});

				const executor = UserUtil.getPlayer(interaction.user);

				if (!executor) return await InteractionUtil.reply(interaction, {
					content: 'unable to find a linked player for your discord account',
					ephemeral: true,
				});
				if (!executor.isStaff) return await InteractionUtil.reply(interaction, {
					content: 'you need to have an in game staff rank for this command',
					ephemeral: true,
				});

				const target = InteractionUtil.getPlayer(interaction);

				if (!target) return await InteractionUtil.reply(interaction, {
					content: `no player with the IGN \`${interaction.options.getString('player', true)}\` found`,
					ephemeral: true,
				});

				const hypixelGuild = InteractionUtil.getHypixelGuild(interaction);
				const RANK_INPUT = interaction.options.getString('rank', true);
				const { value: rank, similarity } = autocorrect(RANK_INPUT, hypixelGuild.ranks, 'name');

				if (similarity < this.config.get('AUTOCORRECT_THRESHOLD')) return `unknown guild rank '${RANK_INPUT}'`;

				if (target.guildRankPriority >= executor.guildRankPriority || rank.priority >= executor.guildRankPriority) return await InteractionUtil.reply(interaction, {
					content: 'you can only change ranks up to your own rank',
					ephemeral: true,
				});

				return this.#run(interaction, {
					command: `g setrank ${target} ${rank.name}`,
					responseRegExp: setRank(target.ign, undefined, rank.name),
				});
			}

			case 'unmute': {
				await this.checkPermissions(interaction, {
					roleIds: [ this.config.get('SHRUG_ROLE_ID'), this.config.get('TRIAL_MODERATOR_ROLE_ID'), this.config.get('MODERATOR_ROLE_ID'), this.config.get('DANKER_STAFF_ROLE_ID'), this.config.get('SENIOR_STAFF_ROLE_ID'), this.config.get('MANAGER_ROLE_ID') ],
				});

				const TARGET_INPUT = interaction.options.getString('target', true).toLowerCase();

				let hypixelGuild = InteractionUtil.getHypixelGuild(interaction);
				let target;

				if ([ 'guild', 'everyone' ].includes(TARGET_INPUT)) {
					target = 'everyone';
				} else {
					target = InteractionUtil.getPlayer(interaction)
							?? (InteractionUtil.checkForce(interaction)
								? TARGET_INPUT // use input if force is set
								: await (async () => {
									const queryParams = [{
										ign: { [Op.iLike]: TARGET_INPUT },
										minecraftUuid: TARGET_INPUT,
									}];

									// check if input is a discord id or @mention
									const ID = getIdFromString(TARGET_INPUT);
									if (ID) queryParams.push({ discordId: ID });

									return this.client.players.fetch({
										[Op.or]: queryParams,
										cache: false,
									});
								})()
							);

					if (!target) return await InteractionUtil.reply(interaction, {
						content: `no player with the IGN \`${TARGET_INPUT}\` found`,
						ephemeral: true,
					});

					if (target instanceof this.client.players.model) {
						({ hypixelGuild } = target);
					}
				}

				if (target instanceof this.client.players.model) {
					if (target.guildRankPriority >= (UserUtil.getPlayer(interaction.user)?.guildRankPriority ?? 0)) return await InteractionUtil.reply(interaction, {
						content: `your guild rank needs to be higher than ${target}'s`,
						ephemeral: true,
					});

					target.mutedTill = 0;
					await target.save();

					if (target.notInGuild) return await InteractionUtil.reply(interaction, `unmuted \`${target}\``);
				} else if (target === 'everyone') {
					hypixelGuild.mutedTill = 0;
					await hypixelGuild.save();
				}

				return this.#run(interaction, {
					command: `g unmute ${target}`,
					responseRegExp: unmute(target === 'everyone' ? 'the guild chat' : `${target}`, hypixelGuild.chatBridge.bot.username),
				}, hypixelGuild);
			}

			default:
				throw new Error(`unknown subcommand '${SUB_COMMAND}'`);
		}
	}
}
