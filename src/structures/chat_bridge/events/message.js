'use strict';

const { DiscordAPIError } = require('discord.js');
const ms = require('ms');
const logger = require('../../../functions/logger');

/**
 * @typedef {object} TextComponent
 * @property {object} json
 * @property {string} text
 * @property {any[]} extra
 * @property {*} bold
 * @property {*} italic
 * @property {*} underlined
 * @property {*} strikethrough
 * @property {*} obfuscated
 * @property {string} color
 */

/**
 * @typedef {string} ChatPosition
 * * `chat`
 * * `system`
 * * `game_info`
 */


/**
 * @param {import('../ChatBridge')} chatBridge
 * @param {TextComponent[]} jsonMessage chat message from the server
 * @param {ChatPosition} position
 */
module.exports = async (chatBridge, jsonMessage, position) => {
	if (!chatBridge.client.config.getBoolean('CHATBRIDGE_ENABLED')) return;

	const message = jsonMessage.toString().trim();

	if (chatBridge.client.config.getBoolean('EXTENDED_LOGGING')) logger.debug({ position, message });


	// non-player message
	if (!message.includes(':')) {

		/**
		 * auto '/gc welcome'
		 * [HypixelRank] IGN joined the guild!
		 */
		if (message.includes('joined the guild')) {
			return chatBridge.chat(chatBridge.hypixelSpamBypass('/gc welcome'));
		}

		/**
		 * [HypixelRank] IGN left the guild!
		 */
		if (message.includes('left the guild!')) {
			return;
		}


		/**
		 * auto '/gc gg' for promotions / quest completions
		 * [HypixelRank] IGN was promoted from PREV to NOW
		 * The guild has completed Tier 3 of this week's Guild Quest!
		 */
		if (message.includes('was promoted from') || message.startsWith('The guild has completed ')) {
			return chatBridge.chat(chatBridge.hypixelSpamBypass('/gc gg'));
		}

		/**
		 * [HypixelRank] IGN was demoted from PREV to NOW
		 */
		if (message.includes('was demoted from')) {
			return;
		}

		/**
		 * accept f reqs from guild members
		 * Friend request from [HypixelRank] IGN\n
		 */
		const friendReqMatched = message.match(/Friend request from (?:\[.+\] )?(\w+)/);

		if (friendReqMatched) {
			const [, ign ] = friendReqMatched;
			const player = chatBridge.client.players.cache.find(p => p.ign === ign);

			if (!player?.guildID) return;

			logger.info(`[CHATBRIDGE MESSAGE]: accepting f request from ${ign}`);
			return chatBridge.chat(`/f add ${ign}`);
		}

		/**
		 * auto chatBridge mute
		 * [HypixelRank] IGN has muted [HypixelRank] IGN for 10s
		 * [HypixelRank] IGN has muted the guild chat for 10M
		 */
		const muteMatched = message.match(/(?:\[.+\] )?\w+ has muted (?:\[.+\] )?(the guild chat|\w+) for (\w+)/);

		if (muteMatched) {
			const [, target, duration ] = muteMatched;

			if (target === 'the guild chat') {
				const guild = chatBridge.guild;

				guild.chatMutedUntil = Date.now() + ms(duration);
				guild.save();

				return logger.info(`[CHATBRIDGE MESSAGE]: ${guild.name}'s guild chat was muted for ${duration}`);
			}

			const player = chatBridge.client.players.cache.find(p => p.ign === target);

			if (!player) return;

			const msDuration = ms(duration);

			if (!msDuration) return;

			player.chatBridgeMutedUntil = Date.now() + msDuration;
			player.save();

			return logger.info(`[CHATBRIDGE MESSAGE]: ${target} was muted for ${duration}`);
		}

		/**
		 * auto chatBridge unmute
		 * [HypixelRank] IGN has unmuted [HypixelRank] IGN
		 * [HypixelRank] IGN has unmuted the guild chat!
		 */
		const unMuteMatched = message.match(/(?:\[.+\] )?\w+ has unmuted (?:\[.+\] )?(the guild chat|\w+)/);

		if (unMuteMatched) {
			const [, target ] = unMuteMatched;

			if (target === 'the guild chat') {
				const guild = chatBridge.guild;

				guild.chatMutedUntil = 0;
				guild.save();

				return logger.info(`[CHATBRIDGE MESSAGE]: ${guild.name}'s guild chat was unmuted`);
			}

			const player = chatBridge.client.players.cache.find(p => p.ign === target);

			if (!player) return;

			player.chatBridgeMutedUntil = 0;
			player.save();

			return logger.info(`[CHATBRIDGE MESSAGE]: ${target} was unmuted`);
		}
	}


	const messageParts = message.split(':');
	const sender = messageParts.shift().replace(/§./g, '').trim(); // remove mc-chat markdown
	const content = messageParts.join(':').replace(/ࠀ|⭍/g, '').trim();

	if (!content.length) return;


	// guild message
	const guildMatch = sender.match(/^Guild > (?:\[.+\] )?(\w+)(?: \[\w+\])?/); // 'Guild > [HypixelRank] ign [GuildRank]'

	if (guildMatch) {
		const [, ign ] = guildMatch;

		if (ign === chatBridge.bot.username) return; // ignore own messages

		const player = chatBridge.client.players.cache.find(p => p.ign === ign);
		const member = await player?.discordMember;

		if (!chatBridge.webhook) return logger.warn('[CHATBRIDGE MESSAGE]: webhook unavailable');

		try {
			await chatBridge.webhook.send({
				username: member?.displayName ?? player?.ign ?? ign,
				avatarURL: member?.user.displayAvatarURL({ dynamic: true }) ?? player?.image ?? chatBridge.client.user.displayAvatarURL({ dynamic: true }),
				content: chatBridge.parseMinecraftMessageToDiscord(content),
				allowedMentions: { parse: player?.hasDiscordPingPermission ? [ 'users' ] : [] },
			});
		} catch (error) {
			logger.error(`[CHATBRIDGE MESSAGE]: ${error.name}: ${error.message}`);
			if (error instanceof DiscordAPIError && error.method === 'get' && error.code === 0 && error.httpStatus === 404) {
				chatBridge.uncacheWebhook();
				chatBridge.reconnect();
			}
		}

		return;
	}


	// whisper message
	const whisperMatch = sender.match(/^From (?:\[.+\] )?(\w+)/); // 'From [HypixelRank] ign'

	if (whisperMatch) {
		const [, ign ] = whisperMatch;

		if (chatBridge.client.config.getBoolean('EXTENDED_LOGGING')) logger.debug(`[CHATBRIDGE MESSAGE]: whisper from ${ign}`);

		// auto 'o/' reply
		if (/\( ﾟ◡ﾟ\)\/|o\//.test(content)) return chatBridge.chat(chatBridge.hypixelSpamBypass(`/w ${ign} o/`));
	}
};
