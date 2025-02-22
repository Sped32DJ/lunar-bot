import { MessageEmbed, DiscordAPIError, MessageCollector, Permissions, Formatters } from 'discord.js';
import { PREFIX_BY_TYPE, DISCORD_CDN_URL_REGEXP } from '../constants';
import { X_EMOJI, MUTED_EMOJI, STOP_EMOJI, WEBHOOKS_MAX_PER_CHANNEL } from '../../../constants';
import { ChannelUtil, MessageUtil, UserUtil } from '../../../util';
import { WebhookError } from '../../errors/WebhookError';
import { cache, imgur } from '../../../api';
import { hours, logger } from '../../../functions';
import { ChatManager } from './ChatManager';
import type {
	Collection,
	Message,
	MessageAttachment,
	MessageCollectorOptions,
	MessageOptions,
	Snowflake,
	TextChannel,
	Webhook,
	WebhookMessageOptions,
} from 'discord.js';
import type { ChatBridge, MessageForwardOptions } from '../ChatBridge';
import type { ChatBridgeChannel } from '../../database/models/HypixelGuild';
import type { Player } from '../../database/models/Player';
import type { HypixelMessage } from '../HypixelMessage';

interface SendViaBotOptions extends MessageOptions {
	content: string;
	prefix?: string;
	hypixelMessage?: HypixelMessage | null;
}

export class DiscordChatManager extends ChatManager {
	/**
	 * hypixel message type
	 */
	type: keyof typeof PREFIX_BY_TYPE;
	/**
	 * discord channel id
	 */
	channelId: Snowflake;
	/**
	 * hypixel chat prefix
	 */
	prefix: string;
	/**
	 * channel webhook
	 */
	webhook: Webhook | null = null;
	/**
	 * chat bridge status
	 */
	ready = false;

	/**
	 * @param chatBridge
	 * @param channel
	 */
	constructor(chatBridge: ChatBridge, { type, channelId }: ChatBridgeChannel) {
		super(chatBridge);

		this.type = type;
		this.channelId = channelId;
		this.prefix = PREFIX_BY_TYPE[type];
	}

	/**
	 * player ign or member displayName or author username, *blocked* if BLOCKED_WORDS_REGEXP check doesn't pass
	 * @param message
	 */
	static getPlayerName(message: Message) {
		return this.formatAtMention(
			MessageUtil.isNormalWebhookMessage(message)
				? UserUtil.getPlayer(
						message.guild?.members.cache.find(({ displayName }) => displayName === message.author.username)?.user,
				  )?.ign ?? message.author.username
				: UserUtil.getPlayer(message.author)?.ign ?? message.member?.displayName ?? message.author.username,
		);
	}

	/**
	 * returns @name if the name passes the BLOCKED_WORDS_REGEXP
	 * @param name
	 */
	static formatAtMention(name: string) {
		return this.BLOCKED_WORDS_REGEXP.test(name) ? '*blocked name*' : name;
	}

	/**
	 * tries to upload all image attachments to imgur, replacing all successfully uploaded URLs with the imgur URLs
	 * @param attachments
	 */
	async #uploadAttachments(attachments: Collection<Snowflake, MessageAttachment>) {
		if (!this.client.config.get('IMGUR_UPLOADER_ENABLED')) return attachments.map(({ url }) => url);

		const urls: string[] = [];

		let hasError = false;

		for (const { contentType, url, size } of attachments.values()) {
			// only images can be uploaded by URL https://apidocs.imgur.com/#c85c9dfc-7487-4de2-9ecd-66f727cf3139
			if (
				!hasError &&
				this.client.config.get('IMGUR_UPLOADER_CONTENT_TYPE').some((type) => contentType?.startsWith(type)) &&
				size <= 1e7
			) {
				try {
					urls.push((await imgur.upload(url)).data.link);
				} catch (error) {
					logger.error(error, '[UPLOAD ATTACHMENTS]');
					urls.push(url);
					hasError = true;
				}

				continue;
			}

			urls.push(url); // no image (e.g. video)
		}

		return urls;
	}

	/**
	 * DMs the message author with the content if they have not been DMed in the last hour
	 * @param message
	 * @param player
	 * @param content
	 */
	static async #dmMuteInfo(message: Message, player: Player | null, content: string) {
		if (message.editable) return; // message was sent by the bot
		if (await cache.get(`chatbridge:muted:dm:${message.author.id}`)) return;

		UserUtil.sendDM(message.author, content);

		logger.info(`[DM MUTE INFO]: ${player?.logInfo ?? ''}: DMed muted user`);

		cache.set(`chatbridge:muted:dm:${message.author.id}`, true, hours(1)); // prevent DMing again in the next hour
	}

	/**
	 * chat bridge channel
	 */
	get channel() {
		return this.client.channels.cache.get(this.channelId) as TextChannel;
	}

	/**
	 * MinecraftChatManager
	 */
	get minecraft() {
		return this.chatBridge.minecraft;
	}

	/**
	 * asserts that the webhook is present
	 */
	isReady(): this is this & { webhook: Webhook } {
		return this.ready;
	}

	/**
	 * initialise the discord chat manager
	 */
	init() {
		return this.#fetchOrCreateWebhook();
	}

	/**
	 * fetches or creates the webhook for the channel
	 */
	async #fetchOrCreateWebhook() {
		if (this.webhook) {
			this.ready = true;
			return this;
		}

		this.ready = false;

		if (!this.hypixelGuild) {
			logger.warn(`[CHATBRIDGE]: chatBridge #${this.mcAccount}: no guild to fetch webhook`);
			return this;
		}

		try {
			const { channel } = this;

			if (!channel) {
				throw new WebhookError('unknown channel', channel, this.hypixelGuild);
			}

			if (!ChannelUtil.botPermissions(channel).has(Permissions.FLAGS.MANAGE_WEBHOOKS)) {
				throw new WebhookError('missing `MANAGE_WEBHOOKS`', channel, this.hypixelGuild);
			}

			const webhooks = await channel.fetchWebhooks();

			this.webhook =
				webhooks.find(({ type, owner }) => type === 'Incoming' && owner?.id === this.client.user!.id) ?? null;

			if (!this.webhook) {
				if (webhooks.size >= WEBHOOKS_MAX_PER_CHANNEL) {
					throw new WebhookError('cannot create more webhooks', channel, this.hypixelGuild);
				}

				this.webhook = await channel.createWebhook(`${this.hypixelGuild} Chat Bridge`, {
					avatar: (channel.guild?.me ?? this.client.user!).displayAvatarURL(),
					reason: 'no Webhooks in Chat Bridge Channel found',
				});

				this.client.log(
					new MessageEmbed()
						.setColor(this.client.config.get('EMBED_GREEN'))
						.setTitle(`${this.hypixelGuild} Chat Bridge`)
						.setDescription(`${Formatters.bold('Webhook')}: created in ${channel}`)
						.setTimestamp(),
				);
			}

			this.ready = true;

			logger.debug(`[CHATBRIDGE]: ${this.hypixelGuild}: #${channel.name} webhook fetched and cached`);
			return this;
		} catch (error) {
			if (error instanceof WebhookError) {
				this.chatBridge.shouldRetryLinking = false;

				this.client.log(
					new MessageEmbed()
						.setColor(this.client.config.get('EMBED_RED'))
						.setTitle(`${error.hypixelGuild} Chat Bridge`)
						.setDescription(
							`${Formatters.bold('Error')}: ${error.message}${error.channel ? ` in ${error.channel}` : ''}`,
						)
						.setTimestamp(),
				);
			}

			throw error;
		}
	}

	/**
	 * uncaches the webhook
	 */
	#uncacheWebhook() {
		this.webhook = null;
		this.ready = false;

		return this;
	}

	/**
	 * sends a message via the chatBridge webhook
	 * @param contentOrOptions
	 */
	async sendViaWebhook(contentOrOptions: string | WebhookMessageOptions) {
		if (!this.chatBridge.isEnabled() || !this.isReady()) {
			throw new Error(`[CHATBRIDGE WEBHOOK]: ${this.logInfo}: not enabled / ready`);
		}

		const { content, ...options } =
			typeof contentOrOptions === 'string' ? { content: contentOrOptions } : contentOrOptions;

		if (!content) throw new Error(`[CHATBRIDGE WEBHOOK]: ${this.logInfo}: no content`);

		await this.queue.wait();

		try {
			return (await this.webhook.send({
				content: this.chatBridge.discord.parseContent(content),
				...options,
			})) as Message;
		} catch (error) {
			logger.error(error, `[CHATBRIDGE WEBHOOK]: ${this.logInfo}`);

			if (error instanceof DiscordAPIError && error.httpStatus === 404) {
				this.#uncacheWebhook();
				this.#fetchOrCreateWebhook();
			}

			throw error;
		} finally {
			this.queue.shift();
		}
	}

	/**
	 * sends a message via the bot in the chatBridge channel
	 * @param contentOrOptions
	 */
	async sendViaBot(contentOrOptions: string | SendViaBotOptions): Promise<Message | null> {
		if (!this.chatBridge.isEnabled()) return null;

		const {
			content,
			prefix = '',
			hypixelMessage,
			...options
		} = typeof contentOrOptions === 'string' ? ({ content: contentOrOptions } as SendViaBotOptions) : contentOrOptions;

		await this.queue.wait();

		const discordMessage = await hypixelMessage?.discordMessage.catch((error) => logger.error(error));

		try {
			return await ChannelUtil.send(this.channel, {
				content: this.chatBridge.discord.parseContent(
					`${
						discordMessage || !hypixelMessage ? '' : `${hypixelMessage.member ?? `@${hypixelMessage.author}`}, `
					}${prefix}${content}`,
				),
				reply: {
					messageReference: discordMessage as Message,
				},
				...options,
			});
		} finally {
			this.queue.shift();
		}
	}

	/**
	 * forwards a discord message to in game guild chat, prettifying discord markdown, if neither the player nor the whole guild chat is muted
	 * @param message
	 * @param options
	 */
	async forwardToMinecraft(message: Message, { player: playerInput, isEdit = false }: MessageForwardOptions = {}) {
		if (message.webhookId === this.webhook?.id) return; // message was sent by the ChatBridge's webhook
		if (!this.chatBridge.isEnabled() || !this.minecraft.isReady()) return MessageUtil.react(message, X_EMOJI);

		const player =
			playerInput ??
			UserUtil.getPlayer(message.interaction?.user ?? message.author) ?? // cached player
			(await this.client.players.fetch({ discordId: message.interaction?.user.id ?? message.author.id })); // uncached player

		// check if player is muted
		if (player?.muted) {
			DiscordChatManager.#dmMuteInfo(
				message,
				player,
				`your mute expires ${Formatters.time(new Date(player.mutedTill), Formatters.TimestampStyles.RelativeTime)}`,
			);
			return MessageUtil.react(message, MUTED_EMOJI);
		}

		// check if the player is auto muted
		if ((player?.infractions ?? -1) >= this.client.config.get('CHATBRIDGE_AUTOMUTE_MAX_INFRACTIONS')) {
			DiscordChatManager.#dmMuteInfo(message, player, 'you are currently muted due to continues infractions');
			return MessageUtil.react(message, MUTED_EMOJI);
		}

		// check if guild chat is muted
		if (this.hypixelGuild!.muted && !player?.isStaff) {
			DiscordChatManager.#dmMuteInfo(
				message,
				player,
				`${this.hypixelGuild!.name}'s guild chat mute expires ${Formatters.time(
					new Date(this.hypixelGuild!.mutedTill),
					Formatters.TimestampStyles.RelativeTime,
				)}`,
			);
			return MessageUtil.react(message, MUTED_EMOJI);
		}

		// check if the chatBridge bot is muted
		if (this.minecraft.botPlayer?.muted) {
			DiscordChatManager.#dmMuteInfo(
				message,
				player,
				`the bot's mute expires ${Formatters.time(
					new Date(this.minecraft.botPlayer.mutedTill),
					Formatters.TimestampStyles.RelativeTime,
				)}`,
			);
			return MessageUtil.react(message, MUTED_EMOJI);
		}

		// build content
		const contentParts: string[] = [];

		// actual content
		let messageContent =
			isEdit && !message.interaction && message.content && !message.content.endsWith('*')
				? `${message.content}*` // add a trailing '*' to indicate an edit if not already present
				: message.content;

		if (messageContent) {
			// parse discord attachment links and replace with imgur uploaded link
			if (this.client.config.get('IMGUR_UPLOADER_ENABLED')) {
				let offset = 0;

				for (const match of messageContent.matchAll(DISCORD_CDN_URL_REGEXP)) {
					const [FULL_URL, URL_WITHOUT_QUERY_PARAMS] = match;
					const [[START, END]] =
						// @ts-expect-error
						match.indices;

					try {
						// try to upload URL without query parameters
						const IMGUR_URL = (await imgur.upload(URL_WITHOUT_QUERY_PARAMS)).data.link;

						messageContent = `${messageContent.slice(0, START - offset)}${IMGUR_URL}${messageContent.slice(
							END - offset,
						)}`; // replace discord with imgur link
						offset += FULL_URL.length - IMGUR_URL.length; // since indices are relative to the original string
					} catch (error) {
						logger.error(error);
						break;
					}
				}
			}

			contentParts.push(messageContent);
		}

		// stickers
		if (message.stickers.size) contentParts.push(...message.stickers.map(({ name }) => `:${name}:`));

		// links of attachments
		if (message.attachments.size) contentParts.push(...(await this.#uploadAttachments(message.attachments)));

		// empty message (e.g. only embeds)
		if (!contentParts.length) return MessageUtil.react(message, STOP_EMOJI);

		// @referencedMessageAuthor if normal reply
		if (MessageUtil.isNormalReplyMessage(message)) {
			try {
				const referencedMessage = await message.fetchReference();

				// author found and author is not already pinged
				if (referencedMessage.author && !new RegExp(`<@!?${referencedMessage.author.id}>`).test(message.content)) {
					contentParts.unshift(`@${DiscordChatManager.getPlayerName(referencedMessage)}`);
				}
			} catch (error) {
				logger.error(error, '[FORWARD DC TO MC]: error fetching reference');
			}
		}

		// send interaction "command" for initial application command reply
		if (message.interaction && !message.editedTimestamp) {
			const interaction = this.client.chatBridges.interactionCache.get(message.interaction.id);

			this.minecraft.chat({
				content: interaction?.toString() ?? `/${message.interaction.commandName}`,
				prefix: `${this.prefix} ${DiscordChatManager.formatAtMention(
					player?.ign ?? message.interaction.user.username,
				)}: `,
			});
		}

		// send content
		return this.minecraft.chat({
			content: contentParts.join(' '),
			prefix: `${this.prefix} ${message.editable ? '' : `${DiscordChatManager.getPlayerName(message)}: `}`,
			discordMessage: message,
		});
	}

	/**
	 * collects chat messages from the bot
	 * @param options
	 */
	override createMessageCollector(options?: MessageCollectorOptions) {
		return new MessageCollector(this.channel, options);
	}
}
