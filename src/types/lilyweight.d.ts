declare module 'lilyweight' {
	export type CataCompletion = Partial<{
		0: number;
		1: number;
		2: number;
		3: number;
		4: number;
		5: number;
		6: number;
		7: number;
	}>;

	export type MasterCataCompletion = Partial<{
		1: number;
		2: number;
		3: number;
		4: number;
		5: number;
		6: number;
	}>;

	/**
	 * An object containing weights.
	 */
	export interface WeightData {
		total: number;
		slayer: number;
		skill: {
			overflow: number;
			base: number;
		};
		catacombs: {
			completion: {
				base: number;
				master: number;
			};
			experience: number;
		};
	}

	/**
	 * An object containing weights, the UUID and maybe username.
	 */
	export interface PlayerWeightData extends WeightData {
		uuid: string;
		username?: string;
	}

	export default class LilyWeight {
		/**
		 * Creates a new LilyWeight instance.
		 * @param apiKey a Hypixel API key.
		 */
		constructor(apiKey: string);

		/**
		 * Gets the player's raw weight. This makes no API requests.
		 * Order of skills: enchanting, taming, alchemy, mining, farming, foraging, combat, fishing.
		 * Order of slayers: zombie, spider, wolf, enderman.
		 * @param skillLevels Array of skill levels in the order listed above. They all scale up to 60.
		 * @param skillXP Array of skill XP in the order listed above.
		 * @param cataCompl Object of catacombs completion, e.g. { "0": 13, "1": 37, "2": 32, ... }.
		 * @param mCataCompl Object of master catacombs completion, same format as cataCompl.
		 * @param cataXP Catacombs experience.
		 * @param slayerXP Array of slayer experience amounts in the order listed above.
		 * @returns The weights calculated from the data.
		 */
		static getWeightRaw(
			skillLevels: number[],
			skillXP: number[],
			cataCompl: CataCompletion,
			mCataCompl: MasterCataCompletion,
			cataXP: number,
			slayerXP: number[],
		): WeightData;

		/**
		 * Gets the player's weight.
		 * @param uuid Player's Minecraft UUID, can be with dashes.
		 * @param returnUsername Should the function return the player's username.
		 * @returns The weights calculated for the player.
		 */
		async getWeightFromUUID(uuid: string, returnUsername: boolean = false): Promise<PlayerWeightData>;

		/**
		 * Gets the player's weight.
		 * @param username Player's Minecraft username.
		 * @param returnUsername Should the function return the player's username.
		 * @returns The weights calculated for the player.
		 */
		async getWeightFromUsername(username: string, returnUsername: boolean = false): Promise<PlayerWeightData>;

		/**
		 * Gets the player's weight.
		 * @param player Either a Minecraft username or a Minecraft UUID (can be with dashes).
		 * @param returnUsername Should the function return the player's username.
		 * @returns The weights calculated for the player.
		 */
		async getWeight(player: string, returnUsername: boolean = false): Promise<PlayerWeightData>;
	}
}
