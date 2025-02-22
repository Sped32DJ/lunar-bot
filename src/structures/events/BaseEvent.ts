import type { EventEmitter } from 'node:events';
import type { LunarClient } from '../LunarClient';

export interface EventContext {
	emitter: EventEmitter;
	name: string;
}

export interface EventData {
	once?: boolean;
	enabled?: boolean;
}

export class BaseEvent {
	emitter: EventEmitter;
	name: string;
	once: boolean;
	enabled: boolean;
	callback = this.run.bind(this);

	/**
	 * @param context
	 * @param data
	 */
	constructor({ emitter, name }: EventContext, { once, enabled }: EventData = {}) {
		this.emitter = emitter;
		this.name = name;

		this.once = once ?? false;
		this.enabled = enabled ?? true;
	}

	/**
	 * client config
	 */
	get config() {
		return (
			// @ts-expect-error
			(this.client as LunarClient).config
		);
	}

	/**
	 * add the event listener
	 * @param force wether to also load disabled events
	 */
	load(force = false) {
		if (this.enabled || force) this.emitter[this.once ? 'once' : 'on'](this.name, this.callback);
		return this;
	}

	/**
	 * remove the event listener
	 */
	unload() {
		this.emitter.off(this.name, this.callback);
		return this;
	}

	/**
	 * event listener callback
	 */
	run(...args: unknown[]): void;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars, require-await
	async run(...args: unknown[]) {
		throw new Error('no run function specified');
	}
}
