// src/firebase/firebaseService.js
// Full multiplayer service layer using Firebase Firestore.
// All game actions (attack, move, alliance) write to Firestore.
// Real-time listeners (onSnapshot) push changes down to all clients.

import {
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    writeBatch,
    collection,
    onSnapshot,
    runTransaction,
    addDoc,
    serverTimestamp,
    query,
    where,
    increment,
} from 'firebase/firestore';
import { db, auth } from '../firebase.js';
import { applyBattleLosses, computeUpgradeCost, recruitCost } from '../game/military.js';

// ─────────────────────── helpers ──────────────────────────

/** Current authenticated user UID.  Available after auth resolves. */
export const getCurrentUid = () => auth.currentUser?.uid ?? null;

// ──────────────────────── Step 1 ───────────────────────────
// Player session

/**
 * Register / refresh the current player document in Firestore.
 * Call once after auth resolves, passing the chosen nation ID as nicknameBase.
 */
export async function initGameSession(nationName) {
    const uid = getCurrentUid();
    if (!uid) throw new Error('Not authenticated yet.');

    const nickname = nationName || `Player-${uid.slice(0, 5)}`;
    const playerRef = doc(db, 'players', uid);
    const snap = await getDoc(playerRef);

    if (!snap.exists()) {
        await setDoc(playerRef, {
            uid,
            nickname,
            funds: 0,
            modLevel: 1,
            alliances: [],
            createdAt: serverTimestamp(),
            lastSeen: serverTimestamp(),
        });
    } else {
        await setDoc(playerRef, { lastSeen: serverTimestamp() }, { merge: true });
    }
    return { uid, nickname };
}

export async function touchPlayer() {
    const uid = getCurrentUid();
    if (!uid) return;
    await setDoc(doc(db, 'players', uid), { lastSeen: serverTimestamp() }, { merge: true });
}

// ──────────────────────── Step 2 ───────────────────────────
// Listeners

/**
 * Subscribe to ALL territory documents.
 * Callback receives an array of { id, owner, troops, modLevel }.
 * Returns the unsubscribe function.
 */
export function listenToTerritories(callback) {
    return onSnapshot(collection(db, 'territories'), (snapshot) => {
        const territories = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(territories);
    });
}

/**
 * Subscribe to the current player's document.
 * Callback receives the player data object.
 */
export function listenToPlayer(callback) {
    const uid = getCurrentUid();
    if (!uid) return () => { };
    return onSnapshot(doc(db, 'players', uid), (snap) => {
        if (snap.exists()) callback(snap.data());
    });
}

/**
 * Subscribe to incoming alliance requests for the current player.
 * Callback receives each new request document { fromUid, fromNickname, status }.
 */
export function listenToAllianceRequests(callback) {
    const uid = getCurrentUid();
    if (!uid) return () => { };
    const q = query(
        collection(db, 'players', uid, 'requests'),
        where('status', '==', 'pending')
    );
    return onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                callback({ reqId: change.doc.id, ...change.doc.data() });
            }
        });
    });
}

// ──────────────────────── Step 3 ───────────────────────────
// Write actions

/**
 * Initialise a territory document if it doesn't already exist.
 * Called once per territory during map load.
 */
export async function ensureTerritory(id, { owner = 'neutral', troops, modLevel = 1 }) {
    const ref = doc(db, 'territories', String(id));
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        await setDoc(ref, { owner, troops, modLevel });
    }
}

/**
 * Forcibly assign a territory to a player, overwriting whatever was there.
 * Called during game start to give the player their starting region.
 */
export async function setPlayerTerritory(id, ownerUid, troops) {
    const ref = doc(db, 'territories', String(id));
    await setDoc(ref, { owner: ownerUid, troops, modLevel: 1 }, { merge: false });
}

export async function setTerritoryTroops(id, troops) {
    const ref = doc(db, 'territories', String(id));
    await setDoc(ref, { troops: Math.max(1, Math.floor(troops)) }, { merge: true });
}

/**
 * Atomically resolve combat between territories using a Firestore Transaction.
 * The winner takes ownership; loser suffers casualties.
 *
 * @param {string} sourceId   - Attacking territory ID
 * @param {string} targetId   - Defending territory ID
 * @param {string} attackerUid - UID of the attacking player
 * @param {number} attackerModLevel - Attacker's mod level
 * @returns {{ success: boolean, msg: string, type: string }}
 */
export async function attackTerritory(sourceId, targetId, attackerUid, attackerModLevel) {
    try {
        const result = await runTransaction(db, async (tx) => {
            const srcRef = doc(db, 'territories', String(sourceId));
            const tgtRef = doc(db, 'territories', String(targetId));

            const [srcSnap, tgtSnap] = await Promise.all([tx.get(srcRef), tx.get(tgtRef)]);
            if (!srcSnap.exists() || !tgtSnap.exists()) throw new Error('Territory not found');

            const src = srcSnap.data();
            const tgt = tgtSnap.data();

            // Only the owner may attack from a territory
            if (src.owner !== attackerUid) throw new Error('Not your territory');
            // Friendly-fire guard
            if (tgt.owner === attackerUid) throw new Error('Cannot attack own territory');
            if (tgt.owner !== 'neutral') {
                const attackerPlayerRef = doc(db, 'players', String(attackerUid));
                const attackerPlayerSnap = await tx.get(attackerPlayerRef);
                const alliances = attackerPlayerSnap.exists() ? (attackerPlayerSnap.data().alliances || []) : [];
                if (alliances.includes(tgt.owner)) throw new Error('Cannot attack an allied territory');
            }
            if (src.troops < 2) throw new Error('Not enough troops (need at least 2)');

            const attackingForce = Math.floor(src.troops / 2);
            const defendingForce = tgt.troops;

            const atkPower = attackingForce * attackerModLevel;
            const defPower = defendingForce * (tgt.modLevel || 1);
            const attackerWon = atkPower > defPower;

            const { attackerRemaining, defenderRemaining } = applyBattleLosses(attackingForce, defendingForce, attackerWon);

            if (attackerWon) {
                // Attacker won. Source territory keeps non-attacking troops.
                const sourceRemaining = src.troops - attackingForce;
                tx.update(srcRef, { troops: Math.max(1, sourceRemaining) });
                // Target territory is captured and occupied by the attacker's survivors.
                tx.update(tgtRef, { owner: attackerUid, troops: Math.max(1, attackerRemaining), modLevel: attackerModLevel });
                return { success: true, msg: `Victory! Captured ${targetId}.`, type: 'success' };
            } else {
                // Attacker lost. Surviving attackers retreat to the source territory.
                const sourceFinalTroops = (src.troops - attackingForce) + attackerRemaining;
                tx.update(srcRef, { troops: Math.max(1, sourceFinalTroops) });
                // The defending territory keeps its surviving troops.
                tx.update(tgtRef, { troops: Math.max(1, defenderRemaining) });
                return { success: false, msg: `Defeat! Attack on ${targetId} failed.`, type: 'danger' };
            }
        });
        return result;
    } catch (err) {
        return { success: false, msg: err.message, type: 'warning' };
    }
}

/**
 * Move troops from one owned territory to another.
 */
export async function moveTroops(sourceId, targetId, attackerUid) {
    try {
        const result = await runTransaction(db, async (tx) => {
            const srcRef = doc(db, 'territories', String(sourceId));
            const tgtRef = doc(db, 'territories', String(targetId));

            const [srcSnap, tgtSnap] = await Promise.all([tx.get(srcRef), tx.get(tgtRef)]);
            const src = srcSnap.data();
            const tgt = tgtSnap.data();

            if (src.owner !== attackerUid || tgt.owner !== attackerUid) throw new Error('Both territories must be yours');
            if (src.troops <= 1) throw new Error('Not enough troops to move');

            const moving = Math.floor(src.troops / 2);
            tx.update(srcRef, { troops: src.troops - moving });
            tx.update(tgtRef, { troops: tgt.troops + moving });
            return { success: true, msg: `Moved ${moving.toLocaleString()} troops.`, type: 'success' };
        });
        return result;
    } catch (err) {
        return { success: false, msg: err.message, type: 'warning' };
    }
}

export async function getTerritoriesByOwner(ownerUid, validRegionIds = null) {
    const q = query(collection(db, 'territories'), where('owner', '==', ownerUid));
    const snap = await getDocs(q);
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!validRegionIds) return rows;
    const valid = new Set(validRegionIds.map(String));
    return rows.filter(r => valid.has(String(r.id)));
}

export async function pickNeutralTerritoryId(regionIds = []) {
    const q = query(collection(db, 'territories'), where('owner', '==', 'neutral'));
    const snap = await getDocs(q);
    const valid = new Set(regionIds.map(String));
    const neutralIds = snap.docs.map(d => String(d.id)).filter(id => valid.has(id));
    const candidates = neutralIds.length ? neutralIds : regionIds.map(String);
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Sell a player-owned territory back to neutral control for funds.
 */
export async function sellTerritory(regionId, sellerUid, population, gdpPerCapita) {
    try {
        const result = await runTransaction(db, async (tx) => {
            const territoryRef = doc(db, 'territories', String(regionId));
            const playerRef = doc(db, 'players', String(sellerUid));

            const [territorySnap, playerSnap] = await Promise.all([
                tx.get(territoryRef),
                tx.get(playerRef),
            ]);

            if (!territorySnap.exists()) throw new Error('Territory not found');
            if (!playerSnap.exists()) throw new Error('Player not found');

            const territory = territorySnap.data();
            const player = playerSnap.data();

            if (territory.owner !== sellerUid) throw new Error('You do not own this territory');

            const price = Math.max(0, Math.floor((population || 0) * (gdpPerCapita || 0) * 0.7));
            const newFunds = (player.funds || 0) + price;

            tx.update(territoryRef, {
                owner: 'neutral',
                troops: Math.max(1, Math.floor((population || 1000) * 0.01)),
                modLevel: 1,
            });
            tx.update(playerRef, { funds: newFunds });

            return {
                success: true,
                msg: `Territory sold for $${price.toLocaleString()}.`,
                type: 'success',
                newFunds,
            };
        });
        return result;
    } catch (err) {
        return { success: false, msg: err.message, type: 'warning' };
    }
}

/**
 * Upgrade the current player's modernization level and persist to Firestore.
 */
export async function upgradeModernization(totalTroops, avgGdp, currentLevel, currentFunds) {
    if (currentLevel >= 5) return { success: false, msg: 'Already at max level.' };
    const cost = computeUpgradeCost(totalTroops, avgGdp, currentLevel);
    if (currentFunds < cost) return { success: false, msg: 'Insufficient funds.' };

    const uid = getCurrentUid();
    await updateDoc(doc(db, 'players', uid), {
        modLevel: currentLevel + 1,
        funds: currentFunds - cost,
    });
    return { success: true, newLevel: currentLevel + 1, cost };
}

export async function recruitTroops(regionId, buyerUid, modLevel, unitsOfTenThousand = 1) {
    try {
        const result = await runTransaction(db, async (tx) => {
            const territoryRef = doc(db, 'territories', String(regionId));
            const playerRef = doc(db, 'players', String(buyerUid));

            const [territorySnap, playerSnap] = await Promise.all([
                tx.get(territoryRef),
                tx.get(playerRef),
            ]);
            if (!territorySnap.exists()) throw new Error('Territory not found');
            if (!playerSnap.exists()) throw new Error('Player not found');

            const territory = territorySnap.data();
            const player = playerSnap.data();
            if (territory.owner !== buyerUid) throw new Error('You do not own this territory');

            const units = Math.max(1, Math.floor(unitsOfTenThousand));
            const cost = recruitCost(modLevel, units);
            const currentFunds = player.funds || 0;
            if (currentFunds < cost) throw new Error('Insufficient funds');

            const addedTroops = units * 10_000;
            tx.update(playerRef, { funds: currentFunds - cost });
            tx.update(territoryRef, { troops: (territory.troops || 0) + addedTroops });

            return {
                success: true,
                msg: `Recruited ${addedTroops.toLocaleString()} troops.`,
                type: 'success',
                cost,
                newFunds: currentFunds - cost,
            };
        });
        return result;
    } catch (err) {
        return { success: false, msg: err.message, type: 'warning' };
    }
}

/**
 * Add income to the player's fund balance in Firestore.
 * Uses atomic increment – safe against concurrent writes and works even
 * before the first onSnapshot fires (no runTransaction needed).
 */
export async function addFunds(amount) {
    const uid = getCurrentUid();
    if (!uid || amount <= 0) return;
    const ref = doc(db, 'players', uid);
    await updateDoc(ref, { funds: increment(amount) }).catch(err => {
        // If the doc somehow doesn't exist yet, create it with initial funds
        if (err.code === 'not-found') {
            return setDoc(ref, { uid, funds: amount, modLevel: 1, alliances: [] }, { merge: true });
        }
        console.warn('[addFunds]', err.message);
    });
}

// ──────────────────────── Step 4 ───────────────────────────
// Diplomacy

/**
 * Send an alliance request to another player.
 * The target's onSnapshot listener picks this up and shows a popup.
 */
export async function sendAllianceRequest(toUid) {
    const uid = getCurrentUid();
    if (!uid || uid === toUid) return;

    const playerSnap = await getDoc(doc(db, 'players', uid));
    const nickname = playerSnap.exists() ? playerSnap.data().nickname : uid;

    await addDoc(collection(db, 'players', toUid, 'requests'), {
        fromUid: uid,
        fromNickname: nickname,
        status: 'pending',
        sentAt: serverTimestamp(),
    });
}

/**
 * Accept or reject an alliance request.
 * If accepted, both players' `alliances` arrays are updated.
 */
export async function respondToAllianceRequest(reqId, fromUid, accept) {
    const uid = getCurrentUid();
    const reqRef = doc(db, 'players', uid, 'requests', reqId);

    await updateDoc(reqRef, { status: accept ? 'accepted' : 'rejected' });

    if (accept) {
        // Mutual alliance
        await runTransaction(db, async (tx) => {
            const myRef = doc(db, 'players', uid);
            const theirRef = doc(db, 'players', fromUid);
            const [mySnap, theirSnap] = await Promise.all([tx.get(myRef), tx.get(theirRef)]);

            const myAlliances = mySnap.data().alliances || [];
            const theirAlliances = theirSnap.data().alliances || [];

            if (!myAlliances.includes(fromUid)) {
                tx.update(myRef, { alliances: [...myAlliances, fromUid] });
            }
            if (!theirAlliances.includes(uid)) {
                tx.update(theirRef, { alliances: [...theirAlliances, uid] });
            }
        });
    }
}

/**
 * Break an existing alliance with another player (mutual).
 */
export async function breakAlliance(otherUid) {
    const uid = getCurrentUid();
    await runTransaction(db, async (tx) => {
        const myRef = doc(db, 'players', uid);
        const theirRef = doc(db, 'players', otherUid);
        const [mySnap, theirSnap] = await Promise.all([tx.get(myRef), tx.get(theirRef)]);

        tx.update(myRef, { alliances: (mySnap.data().alliances || []).filter(id => id !== otherUid) });
        tx.update(theirRef, { alliances: (theirSnap.data().alliances || []).filter(id => id !== uid) });
    });
}

export async function reassignTerritoriesToAI(ownerUid, aiIds = []) {
    if (!ownerUid || !aiIds.length) return 0;
    const territories = await getTerritoriesByOwner(ownerUid);
    if (!territories.length) return 0;

    const batch = writeBatch(db);
    territories.forEach((t, idx) => {
        const newOwner = aiIds[idx % aiIds.length];
        const troops = Math.max(1, Math.floor((t.troops || 1000) * 0.9));
        batch.update(doc(db, 'territories', t.id), { owner: newOwner, troops });
    });
    batch.set(doc(db, 'players', ownerUid), { eliminated: true, lastSeen: serverTimestamp() }, { merge: true });
    await batch.commit();
    return territories.length;
}

export async function resetGameWorld(regionIds = [], regionStateMap = {}, aiIds = []) {
    const ids = regionIds.map(String);
    if (!ids.length) return { success: false, msg: 'No regions to reset.' };

    const aiCount = Math.max(0, Math.min(aiIds.length, Math.floor(ids.length * 0.35)));
    const shuffled = [...ids].sort(() => Math.random() - 0.5);
    const aiAssigned = new Set(shuffled.slice(0, aiCount));

    for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db);
        const chunk = ids.slice(i, i + 400);
        for (const id of chunk) {
            const r = regionStateMap[id] || {};
            const expectedTroops = Math.max(1, Math.floor((r.population || 1_000_000) * 0.05));
            const owner = aiAssigned.has(id) ? aiIds[Math.floor(Math.random() * aiIds.length)] : 'neutral';
            batch.set(doc(db, 'territories', id), {
                owner,
                troops: expectedTroops,
                modLevel: 1,
            }, { merge: true });
        }
        await batch.commit();
    }

    const playersSnap = await getDocs(collection(db, 'players'));
    const playerDocs = playersSnap.docs.map(d => d.id);
    for (let i = 0; i < playerDocs.length; i += 400) {
        const batch = writeBatch(db);
        const chunk = playerDocs.slice(i, i + 400);
        for (const pid of chunk) {
            batch.set(doc(db, 'players', pid), {
                funds: 0,
                modLevel: 1,
                alliances: [],
                eliminated: false,
                resetAt: serverTimestamp(),
            }, { merge: true });
        }
        await batch.commit();
    }

    return { success: true, msg: 'Game world reset completed.' };
}
