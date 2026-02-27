import { getRegionData } from './data.js';

export const state = {
    playerMoney: 0,
    playerModLevel: 1, // 1 to 5
    regions: {}, // id: { owner: 'neutral'|'player'|'enemy', population, gdp, troops }
    alliances: new Set(), // Set of allied owner IDs
    enemies: ['enemy1', 'enemy2', 'enemy3', 'enemy4'],
    enemyModLevels: {
        'enemy1': 1, 'enemy2': 1, 'enemy3': 1, 'enemy4': 1
    }
};

// Listeners for UI updates
const listeners = [];
export function subscribe(listener) {
    listeners.push(listener);
}
export function notify() {
    listeners.forEach(l => l(state));
}

// Format numbers nicely
export function formatCurrency(num) {
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    return '$' + Math.floor(num).toLocaleString();
}

export function formatNumber(num) {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    return Math.floor(num).toLocaleString();
}

// Initialize region with fake but realistic-looking data based on geo area or random
export function initRegion(id, name, isSubdivision = false) {
    const data = getRegionData(name, isSubdivision);
    const population = data.pop;
    const gdp = data.gdp;

    // 5% of population as standing army
    const troops = Math.floor(population * 0.05);

    state.regions[id] = {
        id,
        name,
        owner: 'neutral', // Starts neutral, some will be assigned to enemies later
        population,
        gdp,
        troops
    };
}

export function assignInitialFactions(playerStartId) {
    if (state.regions[playerStartId]) {
        state.regions[playerStartId].owner = 'player';
    }

    // Assign random regions to AI enemies
    const regionIds = Object.keys(state.regions).filter(id => id !== playerStartId);
    const shuffled = regionIds.sort(() => 0.5 - Math.random());

    // Give 5 regions to each enemy
    let i = 0;
    for (const enemy of state.enemies) {
        for (let j = 0; j < 5; j++) {
            if (shuffled[i]) {
                state.regions[shuffled[i]].owner = enemy;
                i++;
            }
        }
    }

    notify();
}

// Game Loop: Economic & Troop Growth simulation
export function startEconomyLoop() {
    // Game mechanic: 1 minute = automatic funds.
    // For better pacing, we process every 1 second (1/60th of a minute) and give 1/60th of the formula
    setInterval(() => {
        let income = 0;
        for (const [id, region] of Object.entries(state.regions)) {
            if (region.owner === 'player') {
                // Formula: population * GDP * (1/60) per minute -> (1/3600) per second
                income += (region.population * region.gdp) / 3600;
            }
            // Snowball troops: 1% increase per minute -> (1% * 1/60) per second
            // For smoother UI, we add fractional troops but Display floors it, 
            // OR we increase every second slightly
            const troopIncrease = region.troops * (0.01 / 60);
            region.troops += troopIncrease;
        }
        if (income > 0) {
            state.playerMoney += income;
            notify();
        }
    }, 1000);
}

// Modernization
export function getUpgradeCost() {
    if (state.playerModLevel >= 5) return Infinity;
    let totalTroops = 0;
    let avgGdp = 0;
    let count = 0;
    for (const r of Object.values(state.regions)) {
        if (r.owner === 'player') {
            totalTroops += r.troops;
            avgGdp += r.gdp;
            count++;
        }
    }
    if (count === 0) return 0;
    avgGdp /= count;

    const targetLevel = state.playerModLevel + 1;
    return totalTroops * avgGdp * targetLevel;
}

export function upgradeModernization() {
    const cost = getUpgradeCost();
    if (state.playerModLevel < 5 && state.playerMoney >= cost) {
        state.playerMoney -= cost;
        state.playerModLevel++;
        notify();
        return true;
    }
    return false;
}

export function getTotalPlayerTroops() {
    return Object.values(state.regions)
        .filter(r => r.owner === 'player')
        .reduce((sum, r) => sum + r.troops, 0);
}

// AI Loop: Enemies take actions
export function startAILoop() {
    setInterval(() => {
        // Every 5 seconds, each enemy tries to do something
        for (const enemy of state.enemies) {
            const enemyRegions = Object.values(state.regions).filter(r => r.owner === enemy);
            if (enemyRegions.length === 0) continue; // Enemy is dead

            // Randomly upgrade mod level
            const moneyEstimate = enemyRegions.reduce((sum, r) => sum + (r.population * r.gdp / 1000000), 0);
            if (Math.random() < 0.2 && state.enemyModLevels[enemy] < 5) {
                state.enemyModLevels[enemy]++;
                notify();
            }

            // Decide to attack
            if (Math.random() < 0.4) {
                // Find a region with enough troops
                const attacker = enemyRegions.sort((a, b) => b.troops - a.troops)[0];
                if (attacker.troops > 10000) {
                    // Pick a random target that is not their own and not allied (if AI had alliances)
                    const possibleTargets = Object.values(state.regions).filter(r => r.owner !== enemy);
                    if (possibleTargets.length > 0) {
                        const target = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];

                        // We import resolveCombat to actually do the fight, 
                        // but to avoid circular deps with combat.js we could dispatch an event or just do raw logic here.
                        // For simplicity, let's expose an `aiAttack` function via combat.js or import combat here.
                        import('./combat.js').then(({ attemptActionAIVsAny }) => {
                            attemptActionAIVsAny(attacker.id, target.id);
                        });
                    }
                }
            }
        }
    }, 5000);
}
