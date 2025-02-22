import { BROADCAST_EMOJI } from '../constants';
import { MessageUtil, UserUtil } from '../util';
import { Event } from '../structures/events/Event';
import type { Message } from 'discord.js';
import type { EventContext, EventData } from '../structures/events/BaseEvent';

export default class MessageCreateEvent extends Event {
	constructor(context: EventContext, data?: EventData) {
		super(
			context,
			data ?? {
				once: false,
				enabled: true,
			},
		);
	}

	/**
	 * @param message
	 * @param isEdit
	 */
	_handleDiscordMessage(message: Message, isEdit = false) {
		// chat bridge
		this.client.chatBridges.handleDiscordMessage(message, { isEdit });

		// channel specific triggers
		if (message.channelId === this.config.get('GUILD_ANNOUNCEMENTS_CHANNEL_ID')) {
			MessageUtil.react(message, BROADCAST_EMOJI);
		}

		// player activity
		UserUtil.getPlayer(message.author)?.update({ lastActivityAt: new Date() });
	}

	/**
	 * event listener callback
	 * @param message
	 */
	override run(message: Message) {
		return this._handleDiscordMessage(message, false);
	}
}
