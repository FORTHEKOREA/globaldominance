// src/mapRenderer.js
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { state, initRegion } from './gameState.js';

let svg, g, path, projection;
let selectedRegionId = null;

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
        // Load TopoJSON data for 110m countries
        const worldUrl = "https://unpkg.com/world-atlas@2.0.2/countries-110m.json";
        // Load admin 1 states/provinces (GeoJSON) for subdivisions
        const admin1Url = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson";

        const [world, admin1Data] = await Promise.all([
            d3.json(worldUrl),
            d3.json(admin1Url)
        ]);

        // Convert world TopoJSON to GeoJSON features
        let countries = topojson.feature(world, world.objects.countries).features;

        // The 5 countries to subdivide: USA, Russia, China, Australia, Canada
        // Their approximate ISO A3 codes or string names in 110m data
        const subdivideNames = ["United States of America", "Russia", "China", "Australia", "Canada"];

        // 1. Filter out the base countries we are replacing
        countries = countries.filter(d => {
            const name = d.properties ? d.properties.name : "";
            return !subdivideNames.includes(name);
        });

        // 2. Extract subdivisions for those 5 countries from admin1Data
        // Natural earth admin1 uses 'admin' for the country name
        const targetAdmins = ["United States of America", "Russia", "China", "Australia", "Canada"];
        const subdivisions = admin1Data.features.filter(d => {
            return targetAdmins.includes(d.properties.admin);
        });

        // 3. Combine them
        const allFeatures = [...countries, ...subdivisions];

        // Initialize our game state with these regions
        allFeatures.forEach(d => {
            // Create a unique ID. Subdivisions might not have 'id', use their name or adm1_code
            const id = d.id || d.properties.adm1_code || d.properties.woe_id || `unknown-${Math.random()}`;
            d.id = id; // FIX: Without this, d3 cannot access the id in the onClick handler
            const name = d.properties.name || 'Unknown Zone';
            const isSubdivision = !!d.properties.admin; // if it has 'admin' property, it's from the admin1 dataset

            initRegion(id, name, isSubdivision);
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
