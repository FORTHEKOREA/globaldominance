// src/main.js  –  Global Dominance – Firebase-backed multiplayer entry point
//
// Architecture:
//  • Firebase Auth   → Anonymous sign-in → gives each browser session a unique UID
//  • Firestore        → 'territories' collection (shared map state)
//                       'players'     collection (each player's funds / modLevel / alliances)
//  • D3 map           → Re-renders colors when onSnapshot fires
//  • Local game loop  → Economy timer runs on client; writes incremental funds to Firestore
//
// HOW TO USE:
//  1. Copy .env.example → .env and fill in your Firebase credentials.
//  2. Open Firebase Console → Firestore → create database in production mode.
//  3. Add the following Firestore security rules (for development):
//     rules_version = '2';
//     service cloud.firestore {
//       match /databases/{database}/documents {
//         match /{document=**} { allow read, write: if request.auth != null; }
//       }
//     }

import './style.css';
import { initMap, updateMapColorsFirebase } from './mapRenderer.js';
import { state as localState, initRegion, formatCurrency, formatNumber } from './gameState.js';
import { auth, onAuthStateChanged } from './firebase/firebaseConfig.js';
import {
  initGameSession,
  listenToTerritories,
  listenToPlayer,
  listenToAllianceRequests,
  ensureTerritory,
  attackTerritory,
  moveTroops,
  upgradeModernization,
  addFunds,
  sendAllianceRequest,
  respondToAllianceRequest,
  breakAlliance,
  getCurrentUid,
} from './firebase/firebaseService.js';

// ── Runtime state ──────────────────────────────────────────────────
let myUid = null;
let myNickname = null;
let playerData = { funds: 0, modLevel: 1, alliances: [] };
let territoriesCache = {};   // id → { owner, troops, modLevel }
let selectedRegionId = null;
let sourceRegionId   = null; // First click for attack-from selection
let unsubTerritories = null;
let unsubPlayer = null;
let unsubRequests = null;

// ── Auth gate ──────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  myUid = user.uid;
  document.body.style.cursor = 'wait';

  // Pick a random nation name as nickname (can be replaced with a name picker)
  const nations = ['Atlantis', 'Valorian', 'Nordheim', 'Solaris', 'Draken', 'Ironia'];
  const fallbackName = nations[Math.floor(Math.random() * nations.length)];
  const session = await initGameSession(fallbackName);
  myNickname = session.nickname;

  // Init Map – loads GeoJSON, seeds territories in Firestore, wires click
  const regionIds = await initMap('#map-container', handleMapClick);

  if (regionIds.length > 0) {
    // Seed territories in Firestore (no-op if they already exist)
    for (const id of regionIds) {
      const r = localState.regions[id];
      if (r) {
        await ensureTerritory(id, {
          owner: 'neutral',
          troops: r.troops,
          modLevel: 1,
        });
      }
    }

    // Make one random territory belong to this player (first player gets a random start)
    const myStart = regionIds[Math.floor(Math.random() * regionIds.length)];
    await ensureTerritory(myStart, {
      owner: myUid,
      troops: localState.regions[myStart]?.troops || 100000,
      modLevel: 1,
    });

    // Real-time listeners
    unsubTerritories = listenToTerritories(onTerritoriesUpdate);
    unsubPlayer      = listenToPlayer(onPlayerUpdate);
    unsubRequests    = listenToAllianceRequests(onAllianceRequest);

    // Economy loop (runs locally, writes to Firestore once per tick)
    startEconomyLoop();
  }

  document.body.style.cursor = '';
  setupUI();
});

// ── Real-time callbacks ────────────────────────────────────────────

function onTerritoriesUpdate(territories) {
  territoriesCache = {};
  territories.forEach(t => { territoriesCache[t.id] = t; });
  updateMapColorsFirebase(territoriesCache, myUid, playerData.alliances || []);
  if (selectedRegionId) refreshSidePanel(selectedRegionId);
  refreshTopBar();
}

function onPlayerUpdate(data) {
  playerData = data;
  refreshTopBar();
  if (selectedRegionId) refreshSidePanel(selectedRegionId);
}

function onAllianceRequest({ reqId, fromUid, fromNickname }) {
  showModal({
    title: '⚔️ Alliance Request',
    body: `<strong>${fromNickname}</strong> wants to form an alliance with you.`,
    confirmText: 'Accept',
    cancelText: 'Reject',
    onConfirm: () => respondToAllianceRequest(reqId, fromUid, true).then(() =>
      showToast(`Alliance with ${fromNickname} formed!`, 'success')),
    onCancel: () => respondToAllianceRequest(reqId, fromUid, false),
  });
}

// ── Economy loop ───────────────────────────────────────────────────

function startEconomyLoop() {
  setInterval(async () => {
    let income = 0;
    let totalTroops = 0;
    Object.entries(territoriesCache).forEach(([id, t]) => {
      if (t.owner === myUid) {
        const r = localState.regions[id];
        if (r) {
          income += (r.population * r.gdp) / 3600;
          totalTroops += t.troops;
        }
      }
    });
    if (income > 0) await addFunds(income);
  }, 1000);
}

// ── Map interaction ────────────────────────────────────────────────

async function handleMapClick(id) {
  if (!id) { closeSidePanel(); return; }
  selectedRegionId = id;
  openSidePanel(id);
}

async function doAttackOrMove() {
  if (!selectedRegionId) return;
  const target = territoriesCache[selectedRegionId];
  if (!target) return;

  // Find best-stocked owned territory to attack from
  let best = null, bestTroops = -1;
  Object.entries(territoriesCache).forEach(([id, t]) => {
    if (t.owner === myUid && t.troops > bestTroops) { best = id; bestTroops = t.troops; }
  });
  if (!best) { showToast('You have no territories!', 'danger'); return; }

  if (target.owner === myUid) {
    const res = await moveTroops(best, selectedRegionId, myUid);
    showToast(res.msg, res.type);
  } else {
    if ((playerData.alliances || []).includes(target.owner)) {
      showToast('Cannot attack an allied nation!', 'warning'); return;
    }
    const res = await attackTerritory(best, selectedRegionId, myUid, playerData.modLevel || 1);
    showToast(res.msg, res.type);
  }
}

async function doAlliance() {
  const t = territoriesCache[selectedRegionId];
  if (!t || !t.owner || t.owner === 'neutral' || t.owner === myUid) return;

  if ((playerData.alliances || []).includes(t.owner)) {
    await breakAlliance(t.owner);
    showToast(`Alliance broken.`, 'warning');
  } else {
    await sendAllianceRequest(t.owner);
    showToast('Alliance request sent!', 'success');
  }
}

// ── UI helpers ─────────────────────────────────────────────────────

function setupUI() {
  document.getElementById('btn-upgrade').addEventListener('click', async () => {
    let totalTroops = 0, gdpSum = 0, count = 0;
    Object.entries(territoriesCache).forEach(([id, t]) => {
      if (t.owner === myUid) {
        const r = localState.regions[id];
        if (r) { totalTroops += t.troops; gdpSum += r.gdp; count++; }
      }
    });
    const avgGdp = count > 0 ? gdpSum / count : 0;
    const res = await upgradeModernization(totalTroops, avgGdp, playerData.modLevel || 1, playerData.funds || 0);
    if (res.success) showToast(`Upgraded to Lv ${res.newLevel}!`, 'success');
    else showToast(res.msg, 'warning');
  });

  document.getElementById('btn-attack').addEventListener('click', doAttackOrMove);
  document.getElementById('btn-ally').addEventListener('click', doAlliance);
  document.getElementById('btn-break-ally').addEventListener('click', doAlliance);
}

function refreshTopBar() {
  document.getElementById('player-money').textContent = formatCurrency(playerData.funds || 0);
  let totalTroops = 0;
  Object.entries(territoriesCache).forEach(([, t]) => {
    if (t.owner === myUid) totalTroops += t.troops;
  });
  document.getElementById('player-troops').textContent = formatNumber(totalTroops);
  const lv = playerData.modLevel || 1;
  document.getElementById('mod-level').textContent = `Lv ${lv}`;
  document.getElementById('mod-progress').className = `progress-fill lv-${lv}`;

  const upgradeCostEl = document.getElementById('upgrade-cost');
  const btnUpgrade = document.getElementById('btn-upgrade');
  if (lv >= 5) { upgradeCostEl.textContent = 'MAX'; btnUpgrade.disabled = true; }
  else {
    let totalTroops = 0, gdpSum = 0, count = 0;
    Object.entries(territoriesCache).forEach(([id, t]) => {
      if (t.owner === myUid) { const r = localState.regions[id]; if (r) { totalTroops += t.troops; gdpSum += r.gdp; count++; } }
    });
    const cost = totalTroops * (count > 0 ? gdpSum / count : 0) * (lv + 1);
    upgradeCostEl.textContent = formatCurrency(cost);
    btnUpgrade.disabled = (playerData.funds || 0) < cost;
  }
}

function openSidePanel(id) {
  const panel = document.getElementById('info-panel');
  panel.classList.remove('hidden');
  refreshSidePanel(id);
}

function closeSidePanel() {
  document.getElementById('info-panel').classList.add('hidden');
  selectedRegionId = null;
}

function refreshSidePanel(id) {
  const t = territoriesCache[id];
  const r = localState.regions[id];
  if (!t || !r) return;

  document.getElementById('region-name').textContent = r.name;
  const badge = document.getElementById('region-owner');
  badge.className = 'badge';
  badge.textContent = t.owner === myUid ? 'YOU' : t.owner === 'neutral' ? 'NEUTRAL' : t.owner.slice(0, 8);
  if (t.owner === myUid) badge.classList.add('player');
  else if ((playerData.alliances || []).includes(t.owner)) badge.classList.add('ally');
  else if (t.owner !== 'neutral') badge.classList.add('enemy');

  document.getElementById('region-pop').textContent  = formatNumber(r.population);
  document.getElementById('region-gdp').textContent  = formatCurrency(r.gdp);
  document.getElementById('region-army').textContent = formatNumber(t.troops);

  const modEl = document.getElementById('region-mod');
  modEl.textContent = `Lv ${t.modLevel || 1}`;
  modEl.className = t.owner === myUid ? 'text-green' : t.owner === 'neutral' ? 'text-muted' : 'text-red';

  // Buttons
  const allyBtn  = document.getElementById('btn-ally');
  const breakBtn = document.getElementById('btn-break-ally');
  const atkBtn   = document.getElementById('btn-attack');
  allyBtn.classList.add('hidden');
  breakBtn.classList.add('hidden');
  atkBtn.classList.add('hidden');

  if (t.owner === myUid) {
    // Own territory – no buttons needed
  } else if ((playerData.alliances || []).includes(t.owner)) {
    breakBtn.classList.remove('hidden');
  } else if (t.owner === 'neutral') {
    atkBtn.classList.remove('hidden');
  } else {
    allyBtn.classList.remove('hidden');
    atkBtn.classList.remove('hidden');
  }
}

// ── Toast notification ─────────────────────────────────────────────

function showToast(message, type = 'info') {
  const container = document.getElementById('notification-area');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, 3000);
}

// ── Simple modal for alliance confirmation ─────────────────────────

function showModal({ title, body, confirmText, cancelText, onConfirm, onCancel }) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:999;
    display:flex;align-items:center;justify-content:center;`;
  overlay.innerHTML = `
    <div style="background:#161b22;border:1px solid rgba(255,255,255,.15);
      border-radius:12px;padding:32px;max-width:380px;width:90%;font-family:var(--font-main)">
      <h2 style="margin:0 0 12px;font-size:1.2rem;">${title}</h2>
      <p style="color:#8b949e;margin:0 0 24px;">${body}</p>
      <div style="display:flex;gap:12px;">
        <button id="_modal_confirm" style="flex:1;padding:12px;border-radius:6px;
          border:none;background:#2ea043;color:#fff;cursor:pointer;font-size:.9rem;">${confirmText}</button>
        <button id="_modal_cancel" style="flex:1;padding:12px;border-radius:6px;
          border:1px solid rgba(255,255,255,.2);background:transparent;color:#e6edf3;cursor:pointer;font-size:.9rem;">${cancelText}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#_modal_confirm').addEventListener('click', () => { onConfirm(); overlay.remove(); });
  overlay.querySelector('#_modal_cancel').addEventListener('click',  () => { onCancel?.(); overlay.remove(); });
}
