// src/data.js

// Hardcoded reference data for major countries and generic fallback
export const countryData = {
    // ISO identifiers from 110m map (approximate examples)
    // USA: 840, RUS: 643, CHN: 156, AUS: 036, CAN: 124

    // Generic Fallback Data by Continent/Region (Simplified)
    fallback: {
        populationRange: [5000000, 30000000],
        gdpRange: [2000, 35000]
    },

    // High-level presets
    presets: {
        "United States of America": { pop: 331000000, gdp: 70000 },
        "China": { pop: 1400000000, gdp: 12000 },
        "Russia": { pop: 144000000, gdp: 11000 },
        "Canada": { pop: 38000000, gdp: 52000 },
        "Australia": { pop: 25000000, gdp: 60000 },
        "India": { pop: 1380000000, gdp: 2200 },
        "Japan": { pop: 125000000, gdp: 39000 },
        "Germany": { pop: 83000000, gdp: 51000 },
        "United Kingdom": { pop: 67000000, gdp: 46000 },
        "France": { pop: 67000000, gdp: 43000 },
        "Brazil": { pop: 212000000, gdp: 7500 },
        "South Korea": { pop: 51000000, gdp: 34000 }
    },

    // Admin-1 Level Data (States/Provinces)
    // These keys correspond to Natural Earth's "name" property in admin_1.
    admin1: {
        "California": { pop: 39500000, gdp: 85000 },
        "Texas": { pop: 29000000, gdp: 78000 },
        "New York": { pop: 20200000, gdp: 90000 },
        "Florida": { pop: 21500000, gdp: 60000 },
        // China Provinces
        "Guangdong": { pop: 126000000, gdp: 15000 },
        "Shandong": { pop: 101000000, gdp: 13000 },
        "Henan": { pop: 99000000, gdp: 10000 },
        // Russia Subjects
        "Moscow": { pop: 13000000, gdp: 25000 },
        "Moscow Oblast": { pop: 7700000, gdp: 15000 },
        // Australia States
        "New South Wales": { pop: 8100000, gdp: 65000 },
        "Victoria": { pop: 6600000, gdp: 62000 },
        // Canada Provinces
        "Ontario": { pop: 14700000, gdp: 56000 },
        "Quebec": { pop: 8500000, gdp: 52000 }
    }
};

export function getRegionData(name, isSubdivision = false) {
    if (isSubdivision && countryData.admin1[name]) {
        return { ...countryData.admin1[name] };
    }

    if (!isSubdivision && countryData.presets[name]) {
        return { ...countryData.presets[name] };
    }

    // If no specific exact match, return a randomized realistic fallback
    let popRange = countryData.fallback.populationRange;
    let gdpRange = countryData.fallback.gdpRange;

    // Smaller defaults for subdivisions if missing exact mapping
    if (isSubdivision) {
        popRange = [500000, 5000000];
        gdpRange = [10000, 50000];
    }

    const pMin = popRange[0];
    const pMax = popRange[1];
    const gMin = gdpRange[0];
    const gMax = gdpRange[1];

    return {
        pop: Math.floor(Math.random() * (pMax - pMin)) + pMin,
        gdp: Math.floor(Math.random() * (gMax - gMin)) + gMin
    };
}
