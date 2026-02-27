// src/combat.js
import { state, notify } from './gameState.js';
import { isAlly } from './diplomacy.js';

export function attemptAction(sourceId, targetId) {
    const source = state.regions[sourceId];
    const target = state.regions[targetId];

    if (!source || !target) return { success: false, msg: 'Invalid region.' };

    // Can only attack from a region you own
    if (source.owner !== 'player') {
        return { success: false, msg: 'You do not control the source region.' };
    }

    // Same owner -> Move troops
    if (target.owner === 'player') {
        return moveTroops(source, target);
    }

    // Target is ally -> Friendly fire blocked
    if (isAlly(target.owner)) {
        return { success: false, msg: 'Cannot attack an allied region.', type: 'danger' };
    }

    // Attack
    return resolveCombat(source, target);
}

function moveTroops(source, target) {
    if (source.troops <= 1) {
        return { success: false, msg: 'Not enough troops to move. (Must leave at least 1)' };
    }

    // Move 50% of source troops to target
    const movingTroops = Math.floor(source.troops / 2);
    source.troops -= movingTroops;
    target.troops += movingTroops;

    notify();
    return { success: true, msg: `Moved ${movingTroops.toLocaleString()} troops to ${target.name}.`, type: 'success' };
}

function resolveCombat(attacker, defender) {
    if (attacker.troops <= 1) {
        return { success: false, msg: 'Not enough troops to wage war. (Must leave at least 1)' };
    }

    // Attacker sends 50% of troops
    const attackingTroops = Math.floor(attacker.troops / 2);
    attacker.troops -= attackingTroops;

    const attackerModLevel = attacker.owner === 'player' ? state.playerModLevel : (state.enemyModLevels[attacker.owner] || 1);
    const attackerPower = attackingTroops * attackerModLevel;

    const enemyModLevel = defender.owner === 'player' ? state.playerModLevel : (state.enemyModLevels[defender.owner] || 1);
    const defenderPower = defender.troops * enemyModLevel;

    if (attackerPower > defenderPower) {
        // Attack wins
        const remainingAttacking = attackerPower / enemyModLevel - defender.troops;

        // Change ownership
        const oldOwner = defender.owner;
        defender.owner = attacker.owner;
        defender.troops = Math.max(1, remainingAttacking); // Survivor troops occupy city

        notify();
        return {
            success: true,
            msg: `Victory! ${attacker.name} captured ${defender.name}.`,
            type: 'success'
        };
    } else {
        // Attack fails (troops lost)
        // Defender also loses troops based on attacker power
        const defenderCasualties = Math.floor(attackerPower / enemyModLevel);
        defender.troops = Math.max(1, defender.troops - defenderCasualties);

        notify();
        return {
            success: true,
            msg: `Defeat! ${attacker.name}'s attack on ${defender.name} failed.`,
            type: 'danger'
        };
    }
}

// AI Auto-attack handler
export function attemptActionAIVsAny(sourceId, targetId) {
    const source = state.regions[sourceId];
    const target = state.regions[targetId];
    if (!source || !target) return;

    // Simplistic handling
    resolveCombat(source, target);
}
