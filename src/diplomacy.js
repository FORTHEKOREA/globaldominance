// src/diplomacy.js
import { state, notify } from './gameState.js';

export function toggleAlliance(ownerId) {
    if (ownerId === 'player' || ownerId === 'neutral') return { success: false, msg: 'Cannot ally with this region' };

    if (state.alliances.has(ownerId)) {
        // Break alliance
        state.alliances.delete(ownerId);
        notify();
        return { success: true, msg: `Alliance with ${ownerId.toUpperCase()} broken.`, type: 'warning' };
    } else {
        // Form alliance (for this simulation, they always accept)
        state.alliances.add(ownerId);
        notify();
        return { success: true, msg: `Alliance formed with ${ownerId.toUpperCase()}.`, type: 'success' };
    }
}

export function isAlly(ownerId) {
    return state.alliances.has(ownerId);
}
