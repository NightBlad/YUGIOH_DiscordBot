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

// Optimized Fuse.js settings for low resource environment
const cardFuse = new Fuse([], {
  includeScore: true,
  threshold: 0.4,
  keys: ['name'],
  // Performance optimizations for Render
  ignoreLocation: true, // Skip location scoring (faster)
  minMatchCharLength: 2, // Require at least 2 chars to match
  shouldSort: true,
  distance: 100 // Limit distance calculation
});

const archetypeFuse = new Fuse([], {
  includeScore: true,
  threshold: 0.4,
  keys: ['name'],
  ignoreLocation: true,
  minMatchCharLength: 2,
  shouldSort: true,
  distance: 100
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
  if (!query || query.length < 2) return []; // Skip very short queries
  
  try {
    // Use timeout to prevent long-running searches on slow CPU
    const startTime = Date.now();
    const results = cardFuse.search(query);
    const elapsed = Date.now() - startTime;
    
    // Log slow searches for monitoring
    if (elapsed > 100) {
      console.warn(`Slow autocomplete search: ${elapsed}ms for "${query}"`);
    }
    
    // Return top 7 matches (Discord limit is 25, but fewer = faster)
    return results.slice(0, 7).map(result => ({
      name: result.item.name.substring(0, 100), // Discord limit
      value: result.item.name.substring(0, 100)
    }));
  } catch (error) {
    console.error('Autocomplete error:', error);
    return [];
  }
}

function getArchetypeAutocompleteSuggestions(query) {
  if (!query || query.length < 2) return [];
  
  try {
    const startTime = Date.now();
    const results = archetypeFuse.search(query);
    const elapsed = Date.now() - startTime;
    
    if (elapsed > 100) {
      console.warn(`Slow archetype autocomplete: ${elapsed}ms for "${query}"`);
    }
    
    // Return top 5 matches for archetypes
    return results.slice(0, 5).map(result => ({
      name: result.item.name.substring(0, 100),
      value: result.item.name.substring(0, 100)
    }));
  } catch (error) {
    console.error('Archetype autocomplete error:', error);
    return [];
  }
}

module.exports = {
  updateCardCache,
  updateArchetypeCache,
  getCardAutocompleteSuggestions,
  getArchetypeAutocompleteSuggestions,
  loadData
};
