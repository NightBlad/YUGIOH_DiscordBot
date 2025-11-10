const Fuse = require('fuse.js');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const path = require('path');
require('dotenv').config();

const data = {
  cards: {
    names: new Set(),
    records: []
  },
  archetypes: {
    names: new Set(),
    records: []
  }
};

const cardFuse = new Fuse([], {
  includeScore: true,
  threshold: 0.4, // Adjust for more/less strict matching
  keys: ['name'] // Search only in name field
});

const archetypeFuse = new Fuse([], {
  includeScore: true,
  threshold: 0.4,
  keys: ['name'] // Search in name field for archetypes (normalize to same shape as cards)
});

function loadCSVData(filePath, dataType) {
  try {
    if (!filePath) {
      throw new Error(`CSV path not configured for ${dataType}`);
    }

    const absolutePath = path.resolve(filePath);
    const dirPath = path.dirname(absolutePath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    if (!fs.existsSync(absolutePath)) {
      console.warn(`CSV file not found at ${absolutePath}. ${dataType} cache will be empty until file is created.`);
      return [];
    }

    const fileContent = fs.readFileSync(absolutePath, 'utf-8');
    return parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });
  } catch (error) {
    console.error(`Error loading ${dataType} CSV file:`, error);
    return [];
  }
}

function loadData() {
  try {
    // Load cards
    const cardRecords = loadCSVData(process.env.CARDS_CSV_PATH, 'card');
    data.cards.names.clear();
    data.cards.records = [];

    cardRecords.forEach(record => {
      if (record.name) {
        const name = record.name.trim();
        data.cards.names.add(name);
        data.cards.records.push({ name });
      }
    });

    // Load archetypes
    const archetypeRecords = loadCSVData(process.env.ARCHETYPE_CSV_PATH, 'archetype');
    data.archetypes.names.clear();
    data.archetypes.records = [];

    archetypeRecords.forEach(record => {
      // normalize archetype records to { name }
      const raw = record.archetype || record.name || '';
      if (raw) {
        const name = String(raw).trim();
        if (name) {
          data.archetypes.names.add(name);
          data.archetypes.records.push({ name });
        }
      }
    });

    // Update Fuse instances
    cardFuse.setCollection(data.cards.records);
    archetypeFuse.setCollection(data.archetypes.records);
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

function updateCardCache(record) {
  if (record && record.name && typeof record.name === 'string') {
    const name = record.name.trim();
    if (name && !data.cards.names.has(name)) {
      data.cards.names.add(name);
      data.cards.records.push({ name });
      cardFuse.setCollection(data.cards.records);
    }
  }
}

function updateArchetypeCache(record) {
  // Accept either { name } or { archetype } shapes and normalize to { name }
  if (!record || typeof record !== 'object') return;
  const raw = record.name || record.archetype || '';
  if (raw && typeof raw === 'string') {
    const name = raw.trim();
    if (name && !data.archetypes.names.has(name)) {
      data.archetypes.names.add(name);
      data.archetypes.records.push({ name });
      archetypeFuse.setCollection(data.archetypes.records);
    }
  }
}

function getCardAutocompleteSuggestions(query) {
  if (!query) return [];
  const results = cardFuse.search(query);
  // Return the top 7 matches, formatted for Discord's autocomplete
  return results.slice(0, 7).map(result => ({
    name: result.item.name,
    value: result.item.name
  }));
}

function getArchetypeAutocompleteSuggestions(query) {
  if (!query) return [];
  const results = archetypeFuse.search(query);
  // Return the top 5 matches, formatted for Discord's autocomplete
  return results.slice(0, 5).map(result => ({
    name: result.item.name,
    value: result.item.name
  }));
}

module.exports = {
  updateCardCache,
  updateArchetypeCache,
  getCardAutocompleteSuggestions,
  getArchetypeAutocompleteSuggestions,
  loadData
};
