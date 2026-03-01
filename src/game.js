import './style.css';
import { auth } from './firebase.js';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { initMap, updateMapColors, updateMapColorsFirebase, getBorderingRegionIds } from './mapRenderer.js';
import {
  state,
  subscribe,
  formatCurrency,
  formatNumber,
  assignInitialFactions,
  startEconomyLoop,
  getUpgradeCost,
  upgradeModernization,
  sellTerritory as sellTerritoryLocal,
  recruitTroops as recruitTroopsLocal,
} from './gameState.js';
import { attemptAction, attemptActionAIVsAny } from './combat.js';
import { toggleAlliance } from './diplomacy.js';
import { computeUpgradeCost, recruitCostPerTenThousand } from './game/military.js';
import {
  initGameSession,
  touchPlayer,
  listenToTerritories,
  listenToPlayer,
  listenToAllianceRequests,
  ensureTerritory,
  setPlayerTerritory,
  setTerritoryTroops,
  getTerritoriesByOwner,
  pickNeutralTerritoryId,
  attackTerritory,
  sellTerritory as sellTerritoryFirebase,
  recruitTroops as recruitTroopsFirebase,
  moveTroops as fbMoveTroops,
  upgradeModernization as fbUpgrade,
  addFunds,
  sendAllianceRequest,
  respondToAllianceRequest,
  breakAlliance,
  reassignTerritoriesToAI,
  resetGameWorld,
} from './firebase/firebaseService.js';
import { launchMissile } from './animations/missile.js';

const el = {
  loadingOverlay: document.getElementById('loading-overlay'),
  loadingMsg: document.getElementById('loading-msg'),
  loadingBar: document.getElementById('loading-bar'),

  statNickname: document.getElementById('stat-nickname'),
  statFunds: document.getElementById('stat-funds'),
  statTerritories: document.getElementById('stat-territories'),
  statTroops: document.getElementById('stat-troops'),
  statModLevel: document.getElementById('stat-mod-level'),
  modProgressFill: document.getElementById('mod-progress-fill'),
  btnUpgrade: document.getElementById('btn-upgrade'),
  btnEndTurn: document.getElementById('btn-end-turn'),

  infoPanel: document.getElementById('info-panel'),
  regionName: document.getElementById('region-name'),
  regionOwnerBadge: document.getElementById('region-owner-badge'),
  regionPopulation: document.getElementById('region-population'),
  regionGdp: document.getElementById('region-gdp'),
  regionTroops: document.getElementById('region-troops'),
  regionIncome: document.getElementById('region-income'),

  btnAttack: document.getElementById('btn-attack'),
  btnMove: document.getElementById('btn-move'),
  btnRecruit: document.getElementById('btn-recruit'),
  btnSell: document.getElementById('btn-sell'),
  btnAlliance: document.getElementById('btn-alliance'),

  notificationArea: document.getElementById('notification-area'),
  alliancePopup: document.getElementById('alliance-popup'),
  alliancePopupMsg: document.getElementById('alliance-popup-msg'),
  btnAcceptAlliance: document.getElementById('btn-accept-alliance'),
  btnRejectAlliance: document.getElementById('btn-reject-alliance'),
};

let myUid = null;
let myNickname = '';
let myModLevel = 1;
let myFunds = 0;
let myAlliances = [];
let selectedRegionId = null;
let sourceRegionId = null;
let pendingAllianceReq = null;
let firestoreMode = false;
let allRegionIds = [];
let fbTerritories = {};
const aiMoney = Object.create(null);
let leaving = false;

function expectedTroopsByPopulation(population) {
  return Math.max(1, Math.floor((population || 0) * 0.05));
}

function needsTroopCorrection(currentTroops, expectedTroops) {
  if (!Number.isFinite(currentTroops) || currentTroops <= 0) return true;
  if (expectedTroops <= 0) return false;
  return currentTroops < expectedTroops * 0.1 || currentTroops > expectedTroops * 10;
}

function setLoading(msg, pct) {
  if (el.loadingMsg) el.loadingMsg.textContent = msg;
  if (el.loadingBar) el.loadingBar.style.width = `${pct}%`;
}

function hideLoading() {
  if (!el.loadingOverlay) return;
  el.loadingOverlay.style.opacity = '0';
  el.loadingOverlay.style.transition = 'opacity 0.6s ease';
  setTimeout(() => {
    el.loadingOverlay.style.display = 'none';
  }, 650);
}

function showToast(msg, type = 'info', duration = 3000) {
  if (!el.notificationArea) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  el.notificationArea.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 500);
  }, duration);
}

function playerOwnerId() {
  return firestoreMode && myUid ? myUid : 'player';
}

function getOwnedRegions(ownerId) {
  return Object.values(state.regions).filter((r) => r.owner === ownerId);
}

function refreshStats() {
  const ownerId = playerOwnerId();
  const playerRegions = getOwnedRegions(ownerId);

  el.statNickname.textContent = myNickname;
  el.statFunds.textContent = formatCurrency(myFunds);
  el.statTerritories.textContent = playerRegions.length;
  el.statTroops.textContent = formatNumber(playerRegions.reduce((s, r) => s + Math.floor(r.troops), 0));
  el.statModLevel.textContent = `Lv.${myModLevel}`;
  el.modProgressFill.className = `progress-fill lv-${myModLevel}`;

  if (myModLevel >= 5) {
    el.btnUpgrade.textContent = 'MAX';
    el.btnUpgrade.disabled = true;
  } else {
    const cost = firestoreMode
      ? (() => {
          const totalTroops = playerRegions.reduce((s, r) => s + r.troops, 0);
          const avgGdp = playerRegions.length ? playerRegions.reduce((s, r) => s + r.gdp, 0) / playerRegions.length : 0;
          return computeUpgradeCost(totalTroops, avgGdp, myModLevel);
        })()
      : getUpgradeCost();
    el.btnUpgrade.textContent = `Upgrade (${formatCurrency(cost)})`;
    el.btnUpgrade.disabled = myFunds < cost;
  }
}

function openInfoPanel(regionId) {
  selectedRegionId = regionId;
  const region = state.regions[regionId];
  if (!region) return closeInfoPanel();

  const ownerId = playerOwnerId();
  const ownerIsMe = region.owner === ownerId;
  const ownerIsAlly = myAlliances.includes(region.owner) || state.alliances.has(region.owner);
  const ownerIsEnemy = !ownerIsMe && !ownerIsAlly && region.owner !== 'neutral';

  el.infoPanel.classList.remove('hidden');
  el.regionName.textContent = region.name || regionId;
  el.regionOwnerBadge.textContent = ownerIsMe ? 'Yours' : ownerIsAlly ? 'Ally' : ownerIsEnemy ? 'Enemy' : 'Neutral';
  el.regionOwnerBadge.className = `badge ${ownerIsMe ? 'player' : ownerIsAlly ? 'ally' : ownerIsEnemy ? 'enemy' : ''}`;
  el.regionPopulation.textContent = formatNumber(region.population);
  el.regionGdp.textContent = '$' + Math.floor(region.gdp || 0).toLocaleString();
  el.regionTroops.textContent = formatNumber(Math.floor(region.troops));

  const incomePerSec = ownerIsMe ? (region.population * region.gdp) / 3600 : 0;
  el.regionIncome.textContent = ownerIsMe ? `${formatCurrency(incomePerSec)}/s` : '-';

  el.btnAttack.classList.add('hidden');
  el.btnMove.classList.add('hidden');
  el.btnRecruit.classList.add('hidden');
  el.btnSell.classList.add('hidden');
  el.btnAlliance.classList.add('hidden');

  if (ownerIsMe) {
    el.btnMove.classList.remove('hidden');
    el.btnMove.textContent = sourceRegionId
      ? `Move here from ${state.regions[sourceRegionId]?.name || sourceRegionId}`
      : 'Select as Move Source';

    el.btnRecruit.classList.remove('hidden');
    const costPer10k = recruitCostPerTenThousand(myModLevel);
    el.btnRecruit.textContent = `Recruit (10k: ${formatCurrency(costPer10k)})`;

    el.btnSell.classList.remove('hidden');
    el.btnSell.textContent = 'Sell Territory';
  } else if (ownerIsAlly) {
    el.btnAlliance.classList.remove('hidden');
    el.btnAlliance.textContent = 'Break Alliance';
  } else {
    el.btnAttack.classList.remove('hidden');
    if (region.owner !== 'neutral') {
      el.btnAlliance.classList.remove('hidden');
      el.btnAlliance.textContent = 'Form Alliance';
    }
  }
}

function closeInfoPanel() {
  selectedRegionId = null;
  el.infoPanel.classList.add('hidden');
}

async function handleAttack() {
  if (!selectedRegionId) return;

  const ownerId = playerOwnerId();
  const playerRegions = getOwnedRegions(ownerId);
  if (!playerRegions.length) return showToast('You have no territories.', 'danger');

  const strongest = playerRegions.sort((a, b) => b.troops - a.troops)[0];
  const sourceElem = document.getElementById(`region-${strongest.id}`);
  const targetElem = document.getElementById(`region-${selectedRegionId}`);
  if (sourceElem && targetElem) launchMissile(sourceElem, targetElem);

  let result;
  if (firestoreMode && myUid) {
    result = await attackTerritory(strongest.id, selectedRegionId, myUid, myModLevel);
  } else {
    result = attemptAction(strongest.id, selectedRegionId);
    updateMapColors();
  }

  showToast(result.msg, result.type || (result.success ? 'success' : 'danger'));
  refreshStats();
  if (selectedRegionId) openInfoPanel(selectedRegionId);
}

async function handleSellTerritory() {
  if (!selectedRegionId) return;
  const region = state.regions[selectedRegionId];
  if (!region) return;

  if (firestoreMode && myUid) {
    const result = await sellTerritoryFirebase(selectedRegionId, myUid, region.population, region.gdp);
    showToast(result.msg, result.success ? 'success' : 'danger');
    if (result.success) myFunds = result.newFunds;
  } else {
    const result = sellTerritoryLocal(selectedRegionId);
    showToast(result.msg, result.type || 'info');
  }

  closeInfoPanel();
  refreshStats();
}

async function handleRecruit() {
  if (!selectedRegionId) return;
  const unitsRaw = window.prompt('How many 10,000-unit bundles to recruit?', '1');
  if (!unitsRaw) return;
  const units = Math.max(1, parseInt(unitsRaw, 10) || 1);

  if (firestoreMode && myUid) {
    const result = await recruitTroopsFirebase(selectedRegionId, myUid, myModLevel, units);
    showToast(result.msg, result.success ? 'success' : 'danger');
    if (result.success) {
      myFunds = result.newFunds;
      if (state.regions[selectedRegionId]) {
        state.regions[selectedRegionId].troops += units * 10000;
      }
    }
  } else {
    const result = recruitTroopsLocal(selectedRegionId, units);
    showToast(result.msg, result.type || 'info');
    myFunds = state.playerMoney;
  }

  if (selectedRegionId) openInfoPanel(selectedRegionId);
  refreshStats();
}

async function handleMove() {
  if (!selectedRegionId) return;
  const region = state.regions[selectedRegionId];
  const ownerIsMe = region?.owner === playerOwnerId();
  if (!ownerIsMe) return showToast('Select one of your territories.', 'warning');

  if (!sourceRegionId) {
    sourceRegionId = selectedRegionId;
    openInfoPanel(selectedRegionId);
    return showToast(`Source set: ${region.name}`, 'info', 2000);
  }

  if (sourceRegionId === selectedRegionId) {
    sourceRegionId = null;
    openInfoPanel(selectedRegionId);
    return showToast('Move cancelled.', 'warning');
  }

  let result;
  if (firestoreMode && myUid) {
    result = await fbMoveTroops(sourceRegionId, selectedRegionId, myUid);
  } else {
    result = attemptAction(sourceRegionId, selectedRegionId);
    updateMapColors();
  }

  sourceRegionId = null;
  showToast(result.msg, result.type || (result.success ? 'success' : 'danger'));
  if (selectedRegionId) openInfoPanel(selectedRegionId);
  refreshStats();
}

async function handleAlliance() {
  if (!selectedRegionId) return;
  const region = state.regions[selectedRegionId];
  if (!region || region.owner === 'neutral' || region.owner === playerOwnerId()) return;

  if (firestoreMode && myUid) {
    if (myAlliances.includes(region.owner)) {
      await breakAlliance(region.owner);
      showToast('Alliance broken.', 'warning');
    } else {
      await sendAllianceRequest(region.owner);
      showToast('Alliance request sent.', 'success');
    }
  } else {
    const result = toggleAlliance(region.owner);
    showToast(result.msg, result.type || 'info');
    updateMapColors();
  }

  if (selectedRegionId) openInfoPanel(selectedRegionId);
}

function showAlliancePopup(req) {
  pendingAllianceReq = req;
  el.alliancePopupMsg.textContent = `${req.fromNickname || req.fromUid} wants to form an alliance with you.`;
  el.alliancePopup.style.display = 'block';
}

function hideAlliancePopup() {
  el.alliancePopup.style.display = 'none';
  pendingAllianceReq = null;
}

el.btnAcceptAlliance.addEventListener('click', async () => {
  if (!pendingAllianceReq) return;
  await respondToAllianceRequest(pendingAllianceReq.reqId, pendingAllianceReq.fromUid, true);
  showToast('Alliance formed.', 'success');
  hideAlliancePopup();
});

el.btnRejectAlliance.addEventListener('click', async () => {
  if (!pendingAllianceReq) return;
  await respondToAllianceRequest(pendingAllianceReq.reqId, pendingAllianceReq.fromUid, false);
  showToast('Alliance request rejected.', 'warning');
  hideAlliancePopup();
});

el.btnUpgrade.addEventListener('click', async () => {
  if (firestoreMode && myUid) {
    const playerRegions = getOwnedRegions(myUid);
    const totalTroops = playerRegions.reduce((s, r) => s + r.troops, 0);
    const avgGdp = playerRegions.length ? playerRegions.reduce((s, r) => s + r.gdp, 0) / playerRegions.length : 0;
    const result = await fbUpgrade(totalTroops, avgGdp, myModLevel, myFunds);
    if (!result.success) return showToast(result.msg, 'danger');

    myModLevel = result.newLevel;
    myFunds = myFunds - result.cost;
    showToast(`Modernization upgraded to Lv.${myModLevel}.`, 'success');
  } else {
    const ok = upgradeModernization();
    if (!ok) return showToast('Insufficient funds.', 'danger');
    myModLevel = state.playerModLevel;
    myFunds = state.playerMoney;
    showToast(`Modernization upgraded to Lv.${myModLevel}.`, 'success');
  }
  refreshStats();
});

el.btnEndTurn.addEventListener('click', async () => {
  const input = window.prompt('Enter admin password to reset game:', '');
  if (input === null) return;
  if (!/^\d+$/.test(input)) {
    showToast('Reset failed: numbers only.', 'danger');
    return;
  }
  if (input !== '123456') {
    showToast('Reset failed: wrong password.', 'danger');
    return;
  }

  if (!firestoreMode) {
    window.location.href = '/';
    return;
  }

  leaving = true;
  setLoading('Resetting game world...', 100);
  try {
    const regionStateMap = Object.fromEntries(
      allRegionIds.map((id) => [String(id), state.regions[id] || {}])
    );
    await resetGameWorld(allRegionIds, regionStateMap, state.enemies);
  } catch (err) {
    console.warn('[resetGameWorld]', err);
  } finally {
    window.location.href = '/';
  }
});

el.btnAttack.addEventListener('click', handleAttack);
el.btnMove.addEventListener('click', handleMove);
el.btnRecruit.addEventListener('click', handleRecruit);
el.btnAlliance.addEventListener('click', handleAlliance);
el.btnSell.addEventListener('click', handleSellTerritory);

subscribe((s) => {
  myFunds = s.playerMoney;
  myModLevel = s.playerModLevel;
  refreshStats();
  updateMapColors();
  if (selectedRegionId) openInfoPanel(selectedRegionId);
});

function startFirestoreSync() {
  listenToTerritories((territories) => {
    fbTerritories = {};
    for (const t of territories) {
      fbTerritories[t.id] = t;
      if (state.regions[t.id]) {
        state.regions[t.id].owner = t.owner;
        const expectedTroops = expectedTroopsByPopulation(state.regions[t.id].population);
        const correctedTroops = needsTroopCorrection(t.troops, expectedTroops) ? expectedTroops : t.troops;
        state.regions[t.id].troops = correctedTroops;
        if (correctedTroops !== t.troops) {
          setTerritoryTroops(t.id, correctedTroops).catch(() => {});
        }
      }
    }

    updateMapColorsFirebase(fbTerritories, myUid, myAlliances);
    refreshStats();
    if (selectedRegionId) openInfoPanel(selectedRegionId);
  });

  listenToPlayer((playerData) => {
    myFunds = playerData.funds ?? 0;
    myModLevel = playerData.modLevel ?? 1;
    myAlliances = playerData.alliances ?? [];
    myNickname = playerData.nickname || myNickname;
    refreshStats();
  });

  listenToAllianceRequests(showAlliancePopup);

  setInterval(async () => {
    const playerRegions = getOwnedRegions(myUid);
    const income = playerRegions.reduce((sum, r) => sum + (r.population * r.gdp) / 3600 * 5 * 0.5, 0);
    if (income > 0) await addFunds(income);
  }, 5000);

  setInterval(() => {
    touchPlayer().catch(() => {});
  }, 10000);
}

function buildAiAssignments(regionIds, excludedId) {
  const assignments = Object.create(null);
  const shuffled = regionIds.filter((id) => id !== excludedId).sort(() => Math.random() - 0.5);

  let idx = 0;
  for (const enemy of state.enemies) {
    for (let n = 0; n < 3 && idx < shuffled.length; n++, idx++) {
      assignments[shuffled[idx]] = enemy;
    }
  }
  return assignments;
}

async function assignStartingTerritory(regionIds) {
  const startId = regionIds[Math.floor(Math.random() * regionIds.length)];

  if (firestoreMode && myUid) {
    const mine = await getTerritoriesByOwner(myUid, regionIds);
    if (mine.length > 0) {
      return mine[0].id;
    }

    const aiAssignments = buildAiAssignments(regionIds, null);
    setLoading('Initialising territories...', 85);
    const BATCH = 20;
    const ids = [...regionIds];
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      await Promise.all(chunk.map((id) => {
        const r = state.regions[id];
        const owner = aiAssignments[id] || 'neutral';
        if (r && !r.owner) r.owner = owner;
        return ensureTerritory(id, {
          owner,
          troops: r ? expectedTroopsByPopulation(r.population) : 1000,
          modLevel: 1,
        });
      }));
    }

    const pickedNeutral = await pickNeutralTerritoryId(regionIds);
    const claimedId = pickedNeutral || startId;
    const startRegion = state.regions[claimedId];
    const troops = startRegion ? expectedTroopsByPopulation(startRegion.population) : 10000;
    await setPlayerTerritory(claimedId, myUid, troops);
    return claimedId;
  } else {
    assignInitialFactions(startId);
    state.regions[startId].owner = 'player';
    for (const id of Object.keys(state.regions)) {
      state.regions[id].troops = expectedTroopsByPopulation(state.regions[id].population);
    }
  }

  return startId;
}

function startNpcLoop() {
  for (const enemy of state.enemies) {
    if (aiMoney[enemy] == null) aiMoney[enemy] = 0;
  }

  setInterval(async () => {
    for (const enemy of state.enemies) {
      const owned = getOwnedRegions(enemy);
      if (!owned.length) continue;

      const income20s = owned.reduce((s, r) => s + (r.population * r.gdp) / 3600 * 20 * 0.5, 0);
      aiMoney[enemy] += income20s;

      while ((state.enemyModLevels[enemy] || 1) < 5) {
        const lvl = state.enemyModLevels[enemy] || 1;
        const totalTroops = owned.reduce((s, r) => s + r.troops, 0);
        const avgGdp = owned.reduce((s, r) => s + r.gdp, 0) / Math.max(1, owned.length);
        const cost = computeUpgradeCost(totalTroops, avgGdp, lvl);
        if (aiMoney[enemy] < cost) break;
        aiMoney[enemy] -= cost;
        state.enemyModLevels[enemy] = lvl + 1;
      }

      let best = null;
      for (const src of owned) {
        if (src.troops < 2) continue;
        for (const neighborId of getBorderingRegionIds(src.id)) {
          const trg = state.regions[neighborId];
          if (!trg || trg.owner === enemy) continue;
          if (best === null || trg.population < best.target.population) {
            best = { source: src, target: trg };
          }
        }
      }

      if (!best) continue;

      if (firestoreMode) {
        await attackTerritory(best.source.id, best.target.id, enemy, state.enemyModLevels[enemy] || 1);
      } else {
        attemptActionAIVsAny(best.source.id, best.target.id);
      }
    }

    if (!firestoreMode) {
      updateMapColors();
      refreshStats();
      if (selectedRegionId) openInfoPanel(selectedRegionId);
    }
  }, 20000);
}

function registerExitHooks() {
  if (!firestoreMode || !myUid) return;
  const cleanup = async () => {
    if (leaving) return;
    leaving = true;
    try {
      await reassignTerritoriesToAI(myUid, state.enemies);
    } catch {
      // best-effort cleanup
    }
  };
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('pagehide', cleanup);
}

async function main() {
  setLoading('Connecting to Firebase...', 10);

  try {
    await new Promise((resolve, reject) => {
      const unsub = onAuthStateChanged(auth, (user) => {
        unsub();
        if (user) {
          myUid = user.uid;
          resolve(user);
        } else {
          signInAnonymously(auth)
            .then((cred) => {
              myUid = cred.user.uid;
              resolve(cred.user);
            })
            .catch(reject);
        }
      });
    });

    firestoreMode = true;
    setLoading('Authenticated', 20);
  } catch (e) {
    setLoading('Firebase auth failed. Returning to lobby...', 100);
    setTimeout(() => { window.location.href = '/'; }, 1000);
    return;
  }

  myNickname = localStorage.getItem('gd_nickname') || `Player-${(myUid || 'local').slice(0, 5)}`;
  el.statNickname.textContent = myNickname;

  if (firestoreMode && myUid) {
    try {
      await initGameSession(myNickname);
      setLoading('Session initialised', 30);
      registerExitHooks();
    } catch {
      setLoading('Session init failed. Returning to lobby...', 100);
      setTimeout(() => { window.location.href = '/'; }, 1000);
      return;
    }
  }

  setLoading('Loading world map...', 40);
  allRegionIds = await initMap('#map-container', (regionId) => {
    if (regionId === null) return closeInfoPanel();
    openInfoPanel(regionId);
  });
  setLoading('Map loaded', 70);

  setLoading('Assigning starting territory...', 75);
  const startId = await assignStartingTerritory(allRegionIds);
  showToast(`You start in: ${state.regions[startId]?.name || startId}`, 'success', 5000);

  setLoading('Starting loops...', 90);
  startFirestoreSync();
  startNpcLoop();

  updateMapColors();
  refreshStats();

  setLoading('Ready!', 100);
  setTimeout(hideLoading, 400);
}

main().catch((err) => {
  console.error('[main]', err);
  setLoading('Error loading game. Check console.', 100);
});
