// src/firebase/firebaseService.js
// Full multiplayer service layer using Firebase Firestore.
// All game actions (attack, move, alliance) write to Firestore.
// Real-time listeners (onSnapshot) push changes down to all clients.

import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    onSnapshot,
    runTransaction,
    addDoc,
    serverTimestamp,
    query,
    where,
} from 'firebase/firestore';
import { db, auth } from './firebaseConfig.js';

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
        });
    }
    return { uid, nickname };
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
            if (src.troops <= 1) throw new Error('Not enough troops');

            const attacking = Math.floor(src.troops / 2);
            const atkPower = attacking * attackerModLevel;
            const defPower = tgt.troops * (tgt.modLevel || 1);

            tx.update(srcRef, { troops: src.troops - attacking });

            if (atkPower > defPower) {
                const remaining = Math.max(1, attacking - Math.floor(defPower / attackerModLevel));
                tx.update(tgtRef, { owner: attackerUid, troops: remaining, modLevel: attackerModLevel });
                return { success: true, msg: `Victory! Captured territory (${targetId}).`, type: 'success' };
            } else {
                const casualties = Math.floor(atkPower / (tgt.modLevel || 1));
                tx.update(tgtRef, { troops: Math.max(1, tgt.troops - casualties) });
                return { success: false, msg: `Defeat! Attack on territory (${targetId}) failed.`, type: 'danger' };
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

/**
 * Upgrade the current player's modernization level and persist to Firestore.
 */
export async function upgradeModernization(totalTroops, avgGdp, currentLevel, currentFunds) {
    if (currentLevel >= 5) return { success: false, msg: 'Already at max level.' };
    const cost = totalTroops * avgGdp * (currentLevel + 1);
    if (currentFunds < cost) return { success: false, msg: 'Insufficient funds.' };

    const uid = getCurrentUid();
    await updateDoc(doc(db, 'players', uid), {
        modLevel: currentLevel + 1,
        funds: currentFunds - cost,
    });
    return { success: true, newLevel: currentLevel + 1, cost };
}

/**
 * Add income to the player's fund balance in Firestore.
 * Called by the economy timer on the client.
 */
export async function addFunds(amount) {
    const uid = getCurrentUid();
    if (!uid || amount <= 0) return;
    // Increment using a transaction to avoid overwrite races
    await runTransaction(db, async (tx) => {
        const ref = doc(db, 'players', uid);
        const snap = await tx.get(ref);
        if (snap.exists()) {
            tx.update(ref, { funds: (snap.data().funds || 0) + amount });
        }
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
