// src/mapRenderer.js
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { state, initRegion } from './gameState.js';

let svg, g, path, projection;
let selectedRegionId = null;
const adjacencyMap = Object.create(null);

export async function initMap(containerId, onRegionClick) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    svg = d3.select(containerId)
        .append("svg")
        .attr("viewBox", [0, 0, width, height]);

    g = svg.append("g");

    // Modern cyber-ish map projection
    projection = d3.geoMercator()
        .scale(150)
        .translate([width / 2, height / 1.5]);

    path = d3.geoPath().projection(projection);

    // Add Zoom and Pan
    const zoom = d3.zoom()
        .scaleExtent([1, 8])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
            // drawDiplomacyLabels(); // update labels on zoom - This function is not defined in the provided context, commenting out for now.
        });

    svg.call(zoom);

    try {
        // Use world-atlas topology so we can compute country adjacency reliably.
        const worldUrl = "https://unpkg.com/world-atlas@2.0.2/countries-110m.json";
        const world = await d3.json(worldUrl);
        const geometries = world?.objects?.countries?.geometries || [];
        const allFeatures = topojson.feature(world, world.objects.countries).features;
        const neighbors = topojson.neighbors(geometries);

        // Initialize game state
        allFeatures.forEach((d, idx) => {
            const id = String(d.id ?? idx);
            d.id = id;
            const name = d?.properties?.name || `Country-${id}`;

            initRegion(id, name, false);
        });
        allFeatures.forEach((d, idx) => {
            adjacencyMap[d.id] = (neighbors[idx] || []).map(nIdx => allFeatures[nIdx]?.id).filter(Boolean);
        });

        // Draw Map
        g.selectAll(".region")
            .data(allFeatures)
            .join("path")
            .attr("class", "region")
            .attr("id", d => `region-${d.id}`)
            .attr("d", path)
            .on("click", function (event, d) {
                if (selectedRegionId === d.id) {
                    d3.select(this).classed("selected", false);
                    selectedRegionId = null;
                    onRegionClick(null);
                } else {
                    d3.selectAll(".region").classed("selected", false);
                    d3.select(this).classed("selected", true);
                    selectedRegionId = d.id;
                    onRegionClick(d.id);
                }
            });

        return Object.keys(state.regions);
    } catch (error) {
        console.error("Error loading map data:", error);
        return [];
    }
}

export function updateMapColors() {
    g.selectAll(".region").attr("class", d => {
        let baseClass = "region";
        if (selectedRegionId === d.id) baseClass += " selected";

        const regionData = state.regions[d.id];
        if (regionData) {
            if (regionData.owner === 'player') baseClass += " player";
            else if (state.alliances.has(regionData.owner)) baseClass += " ally";
            else if (state.enemies.includes(regionData.owner)) baseClass += " enemy";
        }

        return baseClass;
    });
}

/**
 * Firebase-aware color update.
 * @param {Object} territories - { [id]: { owner, troops, modLevel } } from Firestore
 * @param {string} myUid       - Current player's UID
 * @param {string[]} alliances - Array of allied UIDs
 */
export function updateMapColorsFirebase(territories, myUid, alliances = []) {
    if (!g) return;
    g.selectAll(".region").attr("class", d => {
        let baseClass = "region";
        if (selectedRegionId === d.id) baseClass += " selected";

        const t = territories[d.id];
        if (t) {
            if (t.owner === myUid)          baseClass += " player";
            else if (alliances.includes(t.owner)) baseClass += " ally";
            else if (t.owner !== 'neutral')  baseClass += " enemy";
        }
        return baseClass;
    });
}

export function getBorderingRegionIds(regionId) {
    return adjacencyMap[String(regionId)] || [];
}
