import { cache } from './cache.js';
import { MOJANG_KEY } from '../constants/index.js';
import { Mojang } from '../structures/Mojang.js';


export const mojang = new Mojang({
	cache: {
		get(key) {
			return cache.get(`${MOJANG_KEY}:${key}`);
		},
		set(type, key, value) {
			if (value.error) return cache.set(`${MOJANG_KEY}:${type}:${key}`, value, 60 * 60_000); // 1 hour for errors
			return cache.set(`${MOJANG_KEY}:${type}:${key}`, value, (type === 'ign' ? 24 : 1) * 60 * 60_000); // 24 hours for successful requests (changed IGNs are reserved for 37 days (30 days name change cooldown + 1 week))
		},
	},
});
