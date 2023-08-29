// helpers.js
// import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm";

async function readJsonData(filePath) {
  try {
    let response = await fetch(filePath);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error;
  }
}

let licenseClassRemapper = {
  "commercial": "Commercial",
  "unspecified": "Unspecified",
  "non-commercial": "Non-Commercial/Academic",
  "academic-only": "Non-Commercial/Academic",
  "unclear": "Non-Commercial/Academic",
};

function roundToOneDecimalPlace(number) {
  return Math.round(number * 10) / 10;
}

function prepareDataSummary(data) {
  // CLEAN/FORMAT THE DATA
  const ddata = Object.values(data);

  // Map the dataset name to its object to easily find and update it
  let accumulatedLanguages = {};  
  ddata.forEach((dataset) => {
    const datasetName = dataset["Dataset Name"];
    if (!accumulatedLanguages[datasetName]) {
      accumulatedLanguages[datasetName] = [];
    }
    accumulatedLanguages[datasetName].push(...dataset.Languages)
  });

  let clean = [];
  let seenNames = new Set();
  ddata.forEach((dataset) => {
    const datasetName = dataset["Dataset Name"];

    // Check if dataset name is already seen, if so skip this iteration
    // This is for variants of the same dataset which may have different languages
    // but not different tasks, topics, or other metadata.
    if (seenNames.has(dataset["Dataset Name"])) return;

    // Otherwise, add the name to the set
    seenNames.add(dataset["Dataset Name"]);

    // If we haven't seen this dataset name yet, process it fully as before
    var obj = {};
    obj['datasetName'] = datasetName;
    obj['collection'] = dataset.Collection;
    obj['languages'] = accumulatedLanguages[datasetName];
    obj['tasks'] = Array.from(dataset["Task Categories"]);
    obj['textSources'] = Array.from(dataset["Text Sources"]);
    obj['textDomains'] = Array.from(dataset["Text Domains"]);
    obj['creators'] = Array.from(dataset["Creators"]);

    obj['licenseUseClass'] = dataset["License Use (DataProvenance)"];
    obj['licenseUseCategory'] = licenseClassRemapper[dataset["License Use (DataProvenance)"]] || dataset["License Use (DataProvenance)"];
    obj['synthetic'] = Array.from(dataset["Model Generated"]).length > 0 ? "Synthetic" : "Regular";

    const models = ["OpenAI GPT-3", "OpenAI ChatGPT", "OpenAI GPT-4", "OpenAI Codex"];
    if (Array.from(dataset["Model Generated"]).length > 0) {
      if (models.includes(dataset["Model Generated"][0])) {
        obj['syntheticClass'] = "Synthetic (" + dataset["Model Generated"][0] + ")";
      } else {
        obj['syntheticClass'] = "Synthetic (Other)";
      }
    } else {
      obj['syntheticClass'] = "Regular";
    }


    obj['textTopics'] = dataset?.["Inferred Metadata"]?.["Text Topics"] ?? [];

    obj['cd_frequency'] = 0; // frequency of citation count, download count pair
    obj['citationCount'] = dataset?.["Inferred Metadata"]?.["S2 Citation Count (June 2023)"] ?? 0;
    obj['downloadCount'] = dataset?.["Inferred Metadata"]?.["HF Downloads (June 2023)"] ?? 0;

    obj['inputTextLen'] = roundToOneDecimalPlace(dataset?.["Text Metrics"]?.["Mean Inputs Length"]) ?? 0;
    obj['targetTextLen'] = roundToOneDecimalPlace(dataset?.["Text Metrics"]?.["Mean Targets Length"]) ?? 0;

    obj['pwcDate'] = dataset?.["Inferred Metadata"]?.["PwC Date"] ?? "1900-1-1";
    obj['ssDate'] = dataset?.["Inferred Metadata"]?.["S2 Date"] ?? "1900-1-1";
    obj['date'] = new Date(obj['pwcDate'] < obj['ssDate'] ? obj['pwcDate'] : obj['ssDate'])

    obj["hfLink"] = dataset["Hugging Face URL"];

    // Add the dataset object to our map
    seenNames[datasetName] = obj;

    clean.push(obj);
  });
  return clean;
}


function convertToSunburstFormat(data, groups, field) {
  let categoryGroups = {
    name: `${field}_groups`,
    children: []
  };

  // Create a dictionary to hold field counts
  let fieldCounts = {};
  for (let item of data) {
    if (item[field]) {
      for (let value of item[field]) {
        if (value in fieldCounts) {
          fieldCounts[value]++;
        } else {
          fieldCounts[value] = 1;
        }
      }
    }
  }

  for (let [groupName, values] of Object.entries(groups)) {
    let group = {
      name: groupName,
      children: []
    };
    for (let value of values) {
      if (value in fieldCounts) {
        group.children.push({
          name: value,
          value: fieldCounts[value]
        });
      }
    }
    if (group.children.length > 0) {
      categoryGroups.children.push(group);
    }
  }

  return categoryGroups;
}


function transformToNestedFormat(clean, parentField, childField) {
  // Expects `parentField` as strings, `childField` as lists
  let parentToChildMapping = {};

  // Step 1: Loop through the data to accumulate counts
  clean.forEach(dataset => {
    const parent = dataset[parentField];
    const children = dataset[childField] || [];

    if (!parentToChildMapping[parent]) {
      parentToChildMapping[parent] = {};
    }

    children.forEach(child => {
      if (!parentToChildMapping[parent][child]) {
        parentToChildMapping[parent][child] = 0;
      }
      // Increment count (assuming each dataset is a count of 1, adjust if needed)
      parentToChildMapping[parent][child] += 1;
    });
  });

  // Step 2: Build the nested structure
  let result = {
    "name": parentField,
    "children": []
  };

  for (let parent in parentToChildMapping) {
    let parentChild = {
      "name": parent,
      "children": []
    };
    for (let child in parentToChildMapping[parent]) {
      parentChild.children.push({
        "name": child,
        "value": parentToChildMapping[parent][child]
      });
    }
    result.children.push(parentChild);
  }

  return result;
}

// Example usage:
// const nestedData = transformToNestedFormat(clean, 'licenseUseClass', 'textDomains');
// console.log(nestedData);


// Example usage:
// const nestedData = transformToNestedFormat(clean, 'licenseUseClass', 'textTopics');
// console.log(nestedData);


function setupLangWorldMap(countryCodes, langCodes, countryCodeToLangCodes) {

  const langMap = {};
  for (const code in langCodes) {
    langMap[code] = langCodes[code].split(';').map(lang => lang.trim());
  }

  // Create the desired output mapping from country name to their languages and percentages
  const countryToLanguageMapping = {};

  for (let country of countryCodes) {
    const { code, name } = country;

    const languageDataForCountry = countryCodeToLangCodes[code];
    if (!languageDataForCountry) continue;  // Skip countries without language data

    countryToLanguageMapping[name] = {};

    for (let langCode in languageDataForCountry) {
      const { percent } = languageDataForCountry[langCode];
      const languageNames = langMap[langCode];

      if (languageNames) {
        for (let langName of languageNames) {
          countryToLanguageMapping[name][langName] = percent / 100.0;
        }
      }
    }
  }

  // Step 1: Map language to countries present for easy lookup
  const languageToCountryMapping = {};
  for (let country in countryToLanguageMapping) {
    for (let lang in countryToLanguageMapping[country]) {
      if (lang in countryToLanguageMapping[country] > 0.1) {
        if (!languageToCountryMapping[lang]) {
          languageToCountryMapping[lang] = [];
        }
        languageToCountryMapping[lang].push(country);
      }
    }
  }
  return languageToCountryMapping;
}

function createWorldMap(counts, countries, countrymesh, title) {
  // Create a map with country names as keys and their respective values
  const countryValueMap = new Map(counts.map(d => [d.name, d.value]));

  return Plot.plot({
    projection: "equal-earth",
    width: 928,
    height: 928 / 2,
    color: { scheme: "YlGnBu", unknown: "#ccc", label: title, legend: true },
    marks: [
      Plot.sphere({ fill: "white", stroke: "currentColor" }),
      Plot.geo(countries, {
        fill: d => countryValueMap.get(d.properties.name),
        title: (d) => {
          const value = countryValueMap.get(d.properties.name);
          return `Country: ${d.properties.name}, Value: ${value}`;
        }
      }),
      Plot.geo(countrymesh, { stroke: "white" }),
    ]
  });
}

function createLanguageWorldMap(counts, countries, countrymesh, title, countryToLanguageMapping) {
  // Create a map with country names as keys and their respective values
  const countryValueMap = new Map(counts.map(d => [d.name, d.value]));

  return Plot.plot({
    projection: "equal-earth",
    width: 928,
    height: 928 / 2,
    color: { scheme: "YlGnBu", unknown: "#ccc", label: title, legend: true },
    marks: [
      Plot.sphere({ fill: "white", stroke: "currentColor" }),
      Plot.geo(countries, {
        fill: d => countryValueMap.get(d.properties.name),
        title: (d) => {
          const countryName = d.properties.name;
          const value = countryValueMap.get(countryName);
          let languageStr = "";

          const languageMapping = countryToLanguageMapping[countryName];
          if (languageMapping) {
            for (const [lang, proportion] of Object.entries(languageMapping)) {
              if (proportion >= 0.05) { // 10% threshold
                languageStr += `${lang} (${(proportion * 100).toFixed(0)}%), `;
              }
            }
            // Removing trailing comma and space
            languageStr = languageStr.slice(0, -2);
          }

          return `Country: ${countryName}\n${languageStr ? `Spoken Languages: ${languageStr}` : ''}`;
        }
      }),
      Plot.geo(countrymesh, { stroke: "white" }),
    ]
  });
}



// function createWorldMap(counts, countries, countrymesh, title) {

//   return Plot.plot({
//     projection: "equal-earth",
//     width: 928,
//     height: 928 / 2,
//     color: { scheme: "YlGnBu", unknown: "#ccc", label: title, legend: true },
//     marks: [
//       Plot.sphere({ fill: "white", stroke: "currentColor" }),
//       Plot.geo(countries, {
//         fill: (map => d => map.get(d.properties.name))(new Map(counts.map(d => [d.name, d.value]))),
//         title: d => `${d.properties.name}: ${counts.find(c => c.name === d.properties.name)?.value || 'Unknown'}`
//       }),
//       Plot.geo(countrymesh, { stroke: "white" }),
//     ]
//   });
// }


// Copyright 2021, Observable Inc.
// Released under the ISC license.
// https://observablehq.com/@d3/color-legend
function Swatches(color, {
  columns = null,
  format,
  unknown: formatUnknown,
  swatchSize = 15,
  swatchWidth = swatchSize,
  swatchHeight = swatchSize,
  marginLeft = 0
} = {}) {
  const id = `-swatches-${Math.random().toString(16).slice(2)}`;
  const unknown = formatUnknown == null ? undefined : color.unknown();
  const unknowns = unknown == null || unknown === d3.scaleImplicit ? [] : [unknown];
  const domain = color.domain().concat(unknowns);
  if (format === undefined) format = x => x === unknown ? formatUnknown : x;

  function entity(character) {
    return `&#${character.charCodeAt(0).toString()};`;
  }

  if (columns !== null) return `<div style="display: flex; align-items: center; margin-left: ${+marginLeft}px; min-height: 33px; font: 10px sans-serif;">
  <style>

.${id}-item {
  break-inside: avoid;
  display: flex;
  align-items: center;
  padding-bottom: 1px;
}

.${id}-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(100% - ${+swatchWidth}px - 0.5em);
}

.${id}-swatch {
  width: ${+swatchWidth}px;
  height: ${+swatchHeight}px;
  margin: 0 0.5em 0 0;
}

  </style>
  <div style=${{ width: "100%", columns }}>${domain.map(value => {
    const label = `${format(value)}`;
    return `<div class=${id}-item>
      <div class=${id}-swatch style=${{ background: color(value) }}></div>
      <div class=${id}-label title=${label}>${label}</div>
    </div>`;
  })}
  </div>
</div>`;

  return `<div style="display: flex; align-items: center; min-height: 33px; margin-left: ${+marginLeft}px; font: 10px sans-serif;">
  <style>

.${id} {
  display: inline-flex;
  align-items: center;
  margin-right: 1em;
}

.${id}::before {
  content: "";
  width: ${+swatchWidth}px;
  height: ${+swatchHeight}px;
  margin-right: 0.5em;
  background: var(--color);
}

  </style>
  <div>${domain.map(value => `<span class="${id}" style="--color: ${color(value)}">${format(value)}</span>`)}</div>`;
}

function swatches({color, ...options}) {
  return Swatches(color, options);
}