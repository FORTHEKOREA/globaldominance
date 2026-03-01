// src/data.js

// Data source:
// - World Bank API (SP.POP.TOTL, NY.GDP.PCAP.CD)
// - Latest available year priority: 2024 -> 2023 -> 2022 -> 2021 -> 2020
// - Manual overrides only for countries/territories with missing World Bank GDP per capita

export const countryData = {
  fallback: {
    populationRange: [5000000, 30000000],
    gdpRange: [2000, 35000]
  },

  presets: {
    "Afghanistan": { pop: 42647492, gdp: 414 },
    "Albania": { pop: 2377128, gdp: 11378 },
    "Algeria": { pop: 46814308, gdp: 5753 },
    "Angola": { pop: 37885849, gdp: 2666 },
    "Antarctica": { pop: 1000, gdp: 0 },
    "Argentina": { pop: 45696159, gdp: 13970 },
    "Armenia": { pop: 3033500, gdp: 8556 },
    "Australia": { pop: 27196812, gdp: 64604 },
    "Austria": { pop: 9177982, gdp: 58269 },
    "Azerbaijan": { pop: 10202830, gdp: 7284 },
    "Bangladesh": { pop: 173562364, gdp: 2593 },
    "Belarus": { pop: 9132629, gdp: 8318 },
    "Belgium": { pop: 11858610, gdp: 56615 },
    "Belize": { pop: 417072, gdp: 7681 },
    "Benin": { pop: 14462724, gdp: 1485 },
    "Bhutan": { pop: 791524, gdp: 3831 },
    "Bolivia": { pop: 12413315, gdp: 4421 },
    "Bosnia and Herzegovina": { pop: 3164253, gdp: 9359 },
    "Botswana": { pop: 2521139, gdp: 7696 },
    "Brazil": { pop: 211998573, gdp: 10311 },
    "Brunei": { pop: 462721, gdp: 33153 },
    "Bulgaria": { pop: 6441421, gdp: 17596 },
    "Burkina Faso": { pop: 23548781, gdp: 982 },
    "Burundi": { pop: 14047786, gdp: 219 },
    "Cambodia": { pop: 17638801, gdp: 2628 },
    "Cameroon": { pop: 29123744, gdp: 1830 },
    "Canada": { pop: 41288599, gdp: 54340 },
    "Central African Republic": { pop: 5330690, gdp: 516 },
    "Chad": { pop: 20299123, gdp: 962 },
    "Chile": { pop: 19764771, gdp: 16710 },
    "China": { pop: 1408975000, gdp: 13303 },
    "Colombia": { pop: 52886363, gdp: 7919 },
    "Costa Rica": { pop: 5129910, gdp: 18587 },
    "Croatia": { pop: 3866200, gdp: 24050 },
    "Cuba": { pop: 10979783, gdp: 9605 },
    "Cyprus": { pop: 1358282, gdp: 38674 },
    "Czechia": { pop: 10905028, gdp: 31823 },
    "Democratic Republic of the Congo": { pop: 109276265, gdp: 649 },
    "Denmark": { pop: 5976992, gdp: 71026 },
    "Djibouti": { pop: 1168722, gdp: 3553 },
    "Dominican Republic": { pop: 11427557, gdp: 10876 },
    "East Timor": { pop: 1400638, gdp: 1332 },
    "Ecuador": { pop: 18135478, gdp: 6875 },
    "Egypt": { pop: 116538258, gdp: 3338 },
    "El Salvador": { pop: 6338193, gdp: 5580 },
    "Equatorial Guinea": { pop: 1892516, gdp: 6745 },
    "Eritrea": { pop: 3535603, gdp: 700 },
    "Estonia": { pop: 1372341, gdp: 31428 },
    "eSwatini": { pop: 1242822, gdp: 3910 },
    "Ethiopia": { pop: 132059767, gdp: 1134 },
    "Falkland Islands": { pop: 3700, gdp: 70000 },
    "Fiji": { pop: 928784, gdp: 6426 },
    "Finland": { pop: 5619911, gdp: 53150 },
    "French Southern and Antarctic Lands": { pop: 0, gdp: 0 },
    "Gabon": { pop: 2538952, gdp: 8230 },
    "Gambia": { pop: 2759988, gdp: 871 },
    "Georgia": { pop: 3699557, gdp: 9241 },
    "Germany": { pop: 83516593, gdp: 56104 },
    "Ghana": { pop: 34427414, gdp: 2391 },
    "Greece": { pop: 10405134, gdp: 24626 },
    "Greenland": { pop: 56836, gdp: 58499 },
    "Guatemala": { pop: 18406359, gdp: 6150 },
    "Guinea": { pop: 14754785, gdp: 1695 },
    "Guinea-Bissau": { pop: 2201352, gdp: 1008 },
    "Guyana": { pop: 831087, gdp: 29675 },
    "Haiti": { pop: 11772557, gdp: 2143 },
    "Honduras": { pop: 10825703, gdp: 3426 },
    "Hungary": { pop: 9562065, gdp: 23292 },
    "Iceland": { pop: 386506, gdp: 86041 },
    "India": { pop: 1450935791, gdp: 2695 },
    "Indonesia": { pop: 283487931, gdp: 4925 },
    "Iran": { pop: 91567738, gdp: 5190 },
    "Iraq": { pop: 46042015, gdp: 6074 },
    "Ireland": { pop: 5395790, gdp: 112895 },
    "Israel": { pop: 9974400, gdp: 54177 },
    "Italy": { pop: 58952704, gdp: 40385 },
    "Ivory Coast": { pop: 31934230, gdp: 2728 },
    "Jamaica": { pop: 2839175, gdp: 7754 },
    "Japan": { pop: 123975371, gdp: 32487 },
    "Jordan": { pop: 11552876, gdp: 4618 },
    "Kazakhstan": { pop: 20592571, gdp: 14155 },
    "Kenya": { pop: 56432944, gdp: 2132 },
    "Kuwait": { pop: 4897263, gdp: 32718 },
    "Kyrgyzstan": { pop: 7221868, gdp: 2420 },
    "Laos": { pop: 7769819, gdp: 2124 },
    "Latvia": { pop: 1866124, gdp: 23409 },
    "Lebanon": { pop: 5805962, gdp: 3478 },
    "Lesotho": { pop: 2337423, gdp: 972 },
    "Liberia": { pop: 5612817, gdp: 851 },
    "Libya": { pop: 7381023, gdp: 6569 },
    "Lithuania": { pop: 2888278, gdp: 29384 },
    "Luxembourg": { pop: 677012, gdp: 137782 },
    "Madagascar": { pop: 31964956, gdp: 545 },
    "Malawi": { pop: 21655286, gdp: 523 },
    "Malaysia": { pop: 35557673, gdp: 11874 },
    "Mali": { pop: 24478595, gdp: 1095 },
    "Mauritania": { pop: 5169395, gdp: 2110 },
    "Mexico": { pop: 130861007, gdp: 14186 },
    "Moldova": { pop: 2402306, gdp: 7576 },
    "Mongolia": { pop: 3524788, gdp: 6751 },
    "Montenegro": { pop: 623525, gdp: 13263 },
    "Morocco": { pop: 38081173, gdp: 4153 },
    "Mozambique": { pop: 34631766, gdp: 657 },
    "Myanmar": { pop: 54500091, gdp: 1359 },
    "Namibia": { pop: 3030131, gdp: 4413 },
    "Nepal": { pop: 29651054, gdp: 1447 },
    "Netherlands": { pop: 17993485, gdp: 67520 },
    "New Caledonia": { pop: 292639, gdp: 29213 },
    "New Zealand": { pop: 5287500, gdp: 49205 },
    "Nicaragua": { pop: 6916140, gdp: 2848 },
    "Niger": { pop: 27032412, gdp: 735 },
    "Nigeria": { pop: 232679478, gdp: 1084 },
    "North Korea": { pop: 26498823, gdp: 1300 },
    "North Macedonia": { pop: 1824359, gdp: 9292 },
    "Oman": { pop: 5281538, gdp: 20285 },
    "Pakistan": { pop: 251269164, gdp: 1479 },
    "Palestine": { pop: 5289152, gdp: 2592 },
    "Panama": { pop: 4515577, gdp: 19161 },
    "Papua New Guinea": { pop: 10576502, gdp: 3007 },
    "Paraguay": { pop: 6929153, gdp: 6416 },
    "Peru": { pop: 34217848, gdp: 8452 },
    "Philippines": { pop: 115843670, gdp: 3985 },
    "Poland": { pop: 36559233, gdp: 25104 },
    "Portugal": { pop: 10694681, gdp: 29292 },
    "Puerto Rico": { pop: 3203295, gdp: 39344 },
    "Qatar": { pop: 2857822, gdp: 76689 },
    "Republic of Serbia": { pop: 6586476, gdp: 13679 },
    "Republic of the Congo": { pop: 6332961, gdp: 2482 },
    "Romania": { pop: 19051804, gdp: 20080 },
    "Russia": { pop: 143533851, gdp: 14889 },
    "Rwanda": { pop: 14256567, gdp: 1000 },
    "Saudi Arabia": { pop: 35300280, gdp: 35122 },
    "Senegal": { pop: 18501984, gdp: 1773 },
    "Sierra Leone": { pop: 8642022, gdp: 807 },
    "Slovakia": { pop: 5422069, gdp: 25993 },
    "Slovenia": { pop: 2127400, gdp: 34301 },
    "Solomon Islands": { pop: 819198, gdp: 1934 },
    "Somalia": { pop: 19009151, gdp: 630 },
    "South Africa": { pop: 64007187, gdp: 6267 },
    "South Korea": { pop: 51751065, gdp: 36239 },
    "South Sudan": { pop: 11943408, gdp: 400 },
    "Spain": { pop: 48848840, gdp: 35327 },
    "Sri Lanka": { pop: 21916000, gdp: 4516 },
    "Sudan": { pop: 50448963, gdp: 985 },
    "Suriname": { pop: 634431, gdp: 6962 },
    "Sweden": { pop: 10569709, gdp: 57117 },
    "Switzerland": { pop: 9005582, gdp: 103998 },
    "Syria": { pop: 24672760, gdp: 1052 },
    "Taiwan": { pop: 23420123, gdp: 33500 },
    "Tajikistan": { pop: 10590927, gdp: 1341 },
    "Thailand": { pop: 71668011, gdp: 7347 },
    "The Bahamas": { pop: 401283, gdp: 39455 },
    "Togo": { pop: 9515236, gdp: 1119 },
    "Trinidad and Tobago": { pop: 1368333, gdp: 18733 },
    "Tunisia": { pop: 12277109, gdp: 4181 },
    "Turkey": { pop: 85518661, gdp: 15893 },
    "Turkmenistan": { pop: 7494498, gdp: 6857 },
    "Uganda": { pop: 50015092, gdp: 1078 },
    "Ukraine": { pop: 37860221, gdp: 5389 },
    "United Arab Emirates": { pop: 10986400, gdp: 50274 },
    "United Kingdom": { pop: 69226000, gdp: 53246 },
    "United Republic of Tanzania": { pop: 68560157, gdp: 1187 },
    "United States of America": { pop: 340110988, gdp: 84534 },
    "Uruguay": { pop: 3386588, gdp: 23907 },
    "Uzbekistan": { pop: 36361859, gdp: 3162 },
    "Vanuatu": { pop: 327777, gdp: 3411 },
    "Venezuela": { pop: 28405543, gdp: 4218 },
    "Vietnam": { pop: 100987686, gdp: 4717 },
    "Western Sahara": { pop: 652271, gdp: 2500 },
    "Yemen": { pop: 40583164, gdp: 650 },
    "Zambia": { pop: 21314956, gdp: 1187 },
    "Zimbabwe": { pop: 16634373, gdp: 2497 }
  },

  // Kept for future subdivision mode.
  admin1: {
    "California": { pop: 39500000, gdp: 85000 },
    "Texas": { pop: 29000000, gdp: 78000 },
    "New York": { pop: 20200000, gdp: 90000 },
    "Florida": { pop: 21500000, gdp: 60000 },
    "Guangdong": { pop: 126000000, gdp: 15000 },
    "Shandong": { pop: 101000000, gdp: 13000 },
    "Henan": { pop: 99000000, gdp: 10000 },
    "Moscow": { pop: 13000000, gdp: 25000 },
    "Moscow Oblast": { pop: 7700000, gdp: 15000 },
    "New South Wales": { pop: 8100000, gdp: 65000 },
    "Victoria": { pop: 6600000, gdp: 62000 },
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

  let popRange = countryData.fallback.populationRange;
  let gdpRange = countryData.fallback.gdpRange;

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
