// Modernization levels: 1..5 mapped to per-1000 personnel cost between $1M and $2B
export function perThousandCost(modLevel) {
	const min = 1_000_000;
	const max = 2_000_000_000;
	const lvl = Math.min(5, Math.max(1, Math.floor(modLevel)));
	const t = (lvl - 1) / 4;
	return Math.round(min + (max - min) * t);
}

// Determine military tier by population (simple buckets)
export function militaryTier(population) {
	if (population <= 10_000) return 1;
	if (population <= 50_000) return 2;
	if (population <= 200_000) return 3;
	if (population <= 1_000_000) return 4;
	return 5;
}

// Compute total cost given population and modernization level
export function computeMilitaryCost(population, modLevel) {
	const units = Math.max(0, Math.floor(population / 1000));
	return units * perThousandCost(modLevel);
}

// Territory sale price: population * GDP * 0.7
export function territorySalePrice(population, gdpPerCapita) {
	// treat gdpPerCapita as GDP per person (or total-GDP/pop); price = population * gdp * 0.7
	return population * gdpPerCapita * 0.7;
}

export function recruitCostPerTenThousand(modLevel) {
	const lvl = Math.min(5, Math.max(1, Math.floor(modLevel)));
	if (lvl === 1) return 50_000_000;
	if (lvl === 2) return 10_000_000;
	return 10_000_000 * Math.pow(2, lvl - 2);
}

export function recruitCost(modLevel, unitsOfTenThousand = 1) {
	const units = Math.max(1, Math.floor(unitsOfTenThousand));
	return recruitCostPerTenThousand(modLevel) * units;
}

export function computeUpgradeCost(totalTroops, avgGdpPerCapita, currentLevel) {
	const lvl = Math.min(5, Math.max(1, Math.floor(currentLevel)));
	const targetLevel = lvl + 1;
	const troopsFactor = Math.max(1, totalTroops / 10_000);
	const gdpFactor = Math.max(1, avgGdpPerCapita / 10_000);
	return Math.floor(troopsFactor * gdpFactor * 25_000_000 * targetLevel);
}

// Apply battle losses: winner's losses reduced by 60%
export function applyBattleLosses(attackerPop, defenderPop, attackerWon, baseLossFraction = 0.25) {
	// baseLossFraction = portion of engaged forces lost by loser
	const engaged = Math.min(attackerPop, defenderPop);
	const loserLoss = Math.round(engaged * baseLossFraction);
	const winnerRawLoss = Math.round(engaged * baseLossFraction * 0.5); // winners typically lose less
	const winnerLoss = Math.round(winnerRawLoss * (1 - 0.6)); // reduce winner losses by 60%
	if (attackerWon) {
		return {
			attackerRemaining: Math.max(0, attackerPop - winnerLoss),
			defenderRemaining: Math.max(0, defenderPop - loserLoss)
		};
	} else {
		return {
			attackerRemaining: Math.max(0, attackerPop - loserLoss),
			defenderRemaining: Math.max(0, defenderPop - winnerLoss)
		};
	}
}

// New: helper to get official population via World Bank (ISO2/ISO3)
import { fetchPopulationISO, fetchPopulationAll } from "../data/worldBank.js";

// New: fetch all countries over a year range (e.g. 2020..2029)
export async function getAllOfficialPopulations(yearStart = 2020, yearEnd = 2023) {
	return await fetchPopulationAll(yearStart, yearEnd);
}

// New: helper to get official population via World Bank (ISO2/ISO3)
export async function getOfficialPopulation(isoCode, year = 2020) {
	// returns number || null
	return await fetchPopulationISO(isoCode, year);
}
