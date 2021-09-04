import lilyweight from 'lilyweight';
import {
	DUNGEON_CAP,
	DUNGEON_EXPONENTS,
	DUNGEON_TYPES_AND_CLASSES,
	DUNGEON_XP,
	DUNGEON_XP_TOTAL,
	LILY_CATACOMBS,
	LILY_MASTER_CATACOMBS,
	LILY_SKILLS,
	RUNECRAFTING_XP,
	SKILL_ACHIEVEMENTS,
	SKILL_CAP,
	SKILL_DIVIDER,
	SKILL_EXPONENTS,
	SKILL_XP,
	SKILL_XP_PAST_50,
	SKILL_XP_TOTAL,
	SKILLS,
	SLAYER_DIVIDER,
	SLAYER_MODIFIER,
	SLAYER_XP,
	SLAYERS,
} from '../constants/index.js';
import { hypixel } from '../api/hypixel.js';


/**
 * @typedef {ReturnType<transformAPIData>} skyBlockData
 */

/**
 * extended parameter type until @zikeji/hypixel gets updated
 * @param {import('@zikeji/hypixel').Components.Schemas.SkyBlockProfileMember & { jacob2: { perks: { farming_level_cap: number } } }} [skyblockMember]
 */
export function transformAPIData(skyblockMember = {}) {
	return {
		/**
		 * skills
		 */
		// sorted as expected by getLilyWeightRaw
		enchanting: skyblockMember.experience_skill_enchanting ?? 0,
		taming: skyblockMember.experience_skill_taming ?? 0,
		alchemy: skyblockMember.experience_skill_alchemy ?? 0,
		mining: skyblockMember.experience_skill_mining ?? 0,
		farming: skyblockMember.experience_skill_farming ?? 0,
		foraging: skyblockMember.experience_skill_foraging ?? 0,
		combat: skyblockMember.experience_skill_combat ?? 0,
		fishing: skyblockMember.experience_skill_fishing ?? 0,

		// cosmetic skills
		carpentry: skyblockMember.experience_skill_carpentry ?? 0,
		runecrafting: skyblockMember.experience_skill_runecrafting ?? 0,

		// additional info
		skillApiEnabled: Reflect.has(skyblockMember, 'experience_skill_mining'),
		farmingLevelCap: 50 + (skyblockMember.jacob2?.perks?.farming_level_cap ?? 0),

		/**
		 * slayers
		 */
		zombie: skyblockMember.slayer_bosses?.zombie?.xp ?? 0,
		wolf: skyblockMember.slayer_bosses?.wolf?.xp ?? 0,
		spider: skyblockMember.slayer_bosses?.spider?.xp ?? 0,
		enderman: skyblockMember.slayer_bosses?.enderman?.xp ?? 0,

		/**
		 * dungeons
		 */
		// types
		catacombs: skyblockMember.dungeons?.dungeon_types?.catacombs?.experience ?? 0,

		// classes
		archer: skyblockMember.dungeons?.player_classes?.archer?.experience ?? 0,
		berserk: skyblockMember.dungeons?.player_classes?.berserk?.experience ?? 0,
		healer: skyblockMember.dungeons?.player_classes?.healer?.experience ?? 0,
		mage: skyblockMember.dungeons?.player_classes?.mage?.experience ?? 0,
		tank: skyblockMember.dungeons?.player_classes?.tank?.experience ?? 0,

		// floor completions
		catacombsFloor1: skyblockMember.dungeons?.dungeon_types?.catacombs?.tier_completions?.[1] ?? 0,
		catacombsFloor2: skyblockMember.dungeons?.dungeon_types?.catacombs?.tier_completions?.[2] ?? 0,
		catacombsFloor3: skyblockMember.dungeons?.dungeon_types?.catacombs?.tier_completions?.[3] ?? 0,
		catacombsFloor4: skyblockMember.dungeons?.dungeon_types?.catacombs?.tier_completions?.[4] ?? 0,
		catacombsFloor5: skyblockMember.dungeons?.dungeon_types?.catacombs?.tier_completions?.[5] ?? 0,
		catacombsFloor6: skyblockMember.dungeons?.dungeon_types?.catacombs?.tier_completions?.[6] ?? 0,
		catacombsFloor7: skyblockMember.dungeons?.dungeon_types?.catacombs?.tier_completions?.[7] ?? 0,
		catacombsFloor8: skyblockMember.dungeons?.dungeon_types?.catacombs?.tier_completions?.[8] ?? 0,
		catacombsFloor9: skyblockMember.dungeons?.dungeon_types?.catacombs?.tier_completions?.[9] ?? 0,
		catacombsFloor10: skyblockMember.dungeons?.dungeon_types?.catacombs?.tier_completions?.[10] ?? 0,

		masterCatacombsFloor1: skyblockMember.dungeons?.dungeon_types?.master_catacombs?.tier_completions?.[1] ?? 0,
		masterCatacombsFloor2: skyblockMember.dungeons?.dungeon_types?.master_catacombs?.tier_completions?.[2] ?? 0,
		masterCatacombsFloor3: skyblockMember.dungeons?.dungeon_types?.master_catacombs?.tier_completions?.[3] ?? 0,
		masterCatacombsFloor4: skyblockMember.dungeons?.dungeon_types?.master_catacombs?.tier_completions?.[4] ?? 0,
		masterCatacombsFloor5: skyblockMember.dungeons?.dungeon_types?.master_catacombs?.tier_completions?.[5] ?? 0,
		masterCatacombsFloor6: skyblockMember.dungeons?.dungeon_types?.master_catacombs?.tier_completions?.[6] ?? 0,
		masterCatacombsFloor7: skyblockMember.dungeons?.dungeon_types?.master_catacombs?.tier_completions?.[7] ?? 0,
		masterCatacombsFloor8: skyblockMember.dungeons?.dungeon_types?.master_catacombs?.tier_completions?.[8] ?? 0,
		masterCatacombsFloor9: skyblockMember.dungeons?.dungeon_types?.master_catacombs?.tier_completions?.[9] ?? 0,
		masterCatacombsFloor10: skyblockMember.dungeons?.dungeon_types?.master_catacombs?.tier_completions?.[10] ?? 0,
	};
}

/**
 * adds skill xp calculated from achievements
 * @param {skyBlockData} skyBlockData
 * @param {string} minecraftUuid
 */
export async function addAchievementsData(skyBlockData, minecraftUuid) {
	const { achievements } = await hypixel.player.uuid(minecraftUuid);

	for (const skill of SKILLS) skyBlockData[skill] = SKILL_XP_TOTAL[achievements?.[SKILL_ACHIEVEMENTS[skill]] ?? 0] ?? 0;
}

/**
 * returns the true and progression level for the provided skill type
 * @param {string} type the skill or dungeon type
 * @param {skyBlockData} skyBlockData
 * @param {number} [levelCap] (individual) level cap for the player
 */
export function getSkillLevel(type, skyBlockData, levelCap = type === 'farming' ? skyBlockData.farmingLevelCap : SKILL_CAP[type]) {
	const XP = skyBlockData[type];

	let xpTable;

	if (SKILLS.includes(type) || type === 'carpentry') {
		xpTable = levelCap > 50
			? { ...SKILL_XP_PAST_50, ...SKILL_XP }
			: SKILL_XP;
	} else if (type === 'runecrafting') {
		xpTable = RUNECRAFTING_XP;
	} else if (DUNGEON_TYPES_AND_CLASSES.includes(type)) {
		xpTable = DUNGEON_XP;
	} else {
		throw new Error(`[GET SKILL LEVEL]: unknown type '${type}'`);
	}

	const MAX_LEVEL = Math.max(...Object.keys(xpTable));

	let xpTotal = 0;
	let trueLevel = 0;

	for (let x = 1; x <= MAX_LEVEL; ++x) {
		xpTotal += xpTable[x];

		if (xpTotal > XP) {
			xpTotal -= xpTable[x];
			break;
		} else {
			trueLevel = x;
		}
	}

	if (trueLevel < MAX_LEVEL) {
		const nonFlooredLevel = trueLevel + (Math.floor(XP - xpTotal) / xpTable[trueLevel + 1]);

		return {
			trueLevel,
			progressLevel: Math.floor(nonFlooredLevel * 100) / 100,
			nonFlooredLevel,
		};
	}

	return {
		trueLevel,
		progressLevel: trueLevel,
		nonFlooredLevel: trueLevel,
	};
}

/**
 * returns the slayer level for the provided slayer type
 * @param {string} type the slayer type
 * @param {skyBlockData} skyBlockData
 */
export function getSlayerLevel(type, skyBlockData) {
	const XP = skyBlockData[type];
	const MAX_LEVEL = Math.max(...Object.keys(SLAYER_XP));

	let level = 0;

	for (let x = 1; x <= MAX_LEVEL && SLAYER_XP[x] <= XP; ++x) {
		level = x;
	}

	return level;
}

/**
 * returns the total slayer xp
 * @param {skyBlockData} skyBlockData
 */
export function getTotalSlayerXp(skyBlockData) {
	return SLAYERS.reduce((acc, slayer) => acc + skyBlockData[slayer], 0);
}

/**
 * Senither
 */

/**
 * @param {skyBlockData} skyBlockData
 */
export function getSenitherWeight(skyBlockData) {
	let weight = 0;
	let overflow = 0;

	for (const skill of SKILLS) {
		const { skillWeight, skillOverflow } = getSenitherSkillWeight(skill, skyBlockData);

		weight += skillWeight;
		overflow += skillOverflow;
	}

	for (const slayer of SLAYERS) {
		const { slayerWeight, slayerOverflow } = getSenitherSlayerWeight(slayer, skyBlockData);

		weight += slayerWeight;
		overflow += slayerOverflow;
	}

	for (const type of DUNGEON_TYPES_AND_CLASSES) {
		const { dungeonWeight, dungeonOverflow } = getSenitherDungeonWeight(type, skyBlockData);

		weight += dungeonWeight;
		overflow += dungeonOverflow;
	}

	return {
		skillApiEnabled: skyBlockData.skillApiEnabled,
		weight,
		overflow,
		totalWeight: weight + overflow,
	};
}

/**
 * @param {string} skillType
 * @param {skyBlockData} skyBlockData
 */
export function getSenitherSkillWeight(skillType, skyBlockData) {
	const XP = skyBlockData[skillType];
	const { nonFlooredLevel: LEVEL } = getSkillLevel(skillType, skyBlockData, SKILL_CAP[skillType]);
	const MAX_XP = SKILL_XP_TOTAL[SKILL_CAP[skillType]] ?? Infinity;

	return {
		skillWeight: ((LEVEL * 10) ** (0.5 + (SKILL_EXPONENTS[skillType] ?? -Infinity) + (LEVEL / 100))) / 1250,
		skillOverflow: XP > MAX_XP
			? ((XP - MAX_XP) / (SKILL_DIVIDER[skillType] ?? Infinity)) ** 0.968
			: 0,
	};
}

/**
 * @param {string} slayerType
 * @param {skyBlockData} skyBlockData
 */
export function getSenitherSlayerWeight(slayerType, skyBlockData) {
	const XP = skyBlockData[slayerType];

	if (XP <= 1_000_000) {
		return {
			slayerWeight: XP === 0
				? 0
				: XP / (SLAYER_DIVIDER[slayerType] ?? Infinity),
			slayerOverflow: 0,
		};
	}

	const DIVIDER = SLAYER_DIVIDER[slayerType] ?? Infinity;

	let slayerWeight = 1_000_000 / DIVIDER;

	// calculate overflow
	let remaining = XP - 1_000_000;
	let modifier;

	const BASE_MODIFIER = modifier = SLAYER_MODIFIER[slayerType] ?? 0;

	while (remaining > 0) {
		const LEFT = Math.min(remaining, 1_000_000);

		slayerWeight += (LEFT / (DIVIDER * (1.5 + modifier))) ** 0.942;
		modifier += BASE_MODIFIER;
		remaining -= LEFT;
	}

	return {
		slayerWeight,
		slayerOverflow: 0,
	};
}

/**
 * @param {string} dungeonType
 * @param {skyBlockData} skyBlockData
 */
export function getSenitherDungeonWeight(dungeonType, skyBlockData) {
	const XP = skyBlockData[dungeonType];
	const { nonFlooredLevel: LEVEL } = getSkillLevel(dungeonType, skyBlockData);
	const DUNGEON_WEIGHT = (LEVEL ** 4.5) * (DUNGEON_EXPONENTS[dungeonType] ?? 0);
	const MAX_XP = DUNGEON_XP_TOTAL[DUNGEON_CAP[dungeonType]] ?? Infinity;

	return {
		dungeonWeight: DUNGEON_WEIGHT,
		dungeonOverflow: XP > MAX_XP
			? ((XP - MAX_XP) / (4 * MAX_XP / DUNGEON_WEIGHT)) ** 0.968
			: 0,
	};
}


/**
 * Lily
 */

export const { getWeightRaw: getLilyWeightRaw } = lilyweight();

/**
 * @param {skyBlockData} skyBlockData
 */
export function getLilyWeight(skyBlockData) {
	const { total, skill: { overflow } } = getLilyWeightRaw(
		LILY_SKILLS.map(skill => getSkillLevel(skill, skyBlockData, 60).trueLevel), // skill levels
		LILY_SKILLS.map(skill => skyBlockData[skill]), // skill xp
		LILY_CATACOMBS.map(floor => skyBlockData[`catacombsFloor${floor}`]), // catacombs completions
		LILY_MASTER_CATACOMBS.map(floor => skyBlockData[`masterCatacombsFloor${floor}`]), // master catacombs completions
		skyBlockData.catacombs, // catacombs XP
		SLAYERS.map(slayer => skyBlockData[slayer]), // slayer XP
	);

	return {
		skillApiEnabled: skyBlockData.skillApiEnabled,
		weight: total - overflow,
		overflow,
		totalWeight: total,
	};
}
