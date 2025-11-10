const { EmbedBuilder } = require('discord.js');
const { parseMarkdownCardsFromText } = require('./cardUtils');

// Remove diacritics for more robust key matching (e.g., 'tên' -> 'ten')
function stripDiacritics(s) {
  if (!s || typeof s !== 'string') return s;
  try {
    return s.normalize('NFD').replace(/\p{M}/gu, '');
  } catch (e) {
    // fallback if environment doesn't support unicode property escapes
    return s.replace(/[\u0300-\u036f]/g, '');
  }
}

function extractPokemonInfo(obj) {
  if (!obj) return null;
  // Common LangFlow result shapes
  if (obj.result && Array.isArray(obj.result.data) && obj.result.data[0]) return obj.result.data[0];
  if (obj.data && Array.isArray(obj.data) && obj.data[0]) return obj.data[0];

  // Nested outputs shape
  if (obj.outputs && Array.isArray(obj.outputs)) {
    for (const out1 of obj.outputs) {
      if (out1.outputs && Array.isArray(out1.outputs)) {
        for (const out2 of out1.outputs) {
          if (out2.results) {
            if (out2.results.data && Array.isArray(out2.results.data) && out2.results.data[0]) return out2.results.data[0];
            if (out2.results.result && out2.results.result.data && Array.isArray(out2.results.result.data) && out2.results.result.data[0]) return out2.results.result.data[0];
          }
        }
      }
    }
  }

  // Fallback: deep search for Pokemon-like object
  function searchForPokemon(o) {
    if (o && typeof o === 'object') {
      if (isPokemonLike(o)) return o;
      for (const k of Object.keys(o)) {
        try {
          const res = searchForPokemon(o[k]);
          if (res) return res;
        } catch (e) {
          // Ignore recursion errors
        }
      }
    }
    return null;
  }

  const found = searchForPokemon(obj);
  if (found) return found;

  // If we didn't find a structured object, try to extract text/markdown outputs
  function findMessageText(o, depth = 0) {
    if (depth > 8 || o == null) return null;
    if (typeof o === 'string') return o;
    if (typeof o === 'object') {
      if (typeof o.message === 'string') return o.message;
      if (o.message && typeof o.message.text === 'string') return o.message.text;
      if (o.artifacts && typeof o.artifacts.message === 'string') return o.artifacts.message;
      if (o.artifacts && o.artifacts.message && typeof o.artifacts.message.message === 'string') return o.artifacts.message.message;
      if (Array.isArray(o.outputs)) {
        for (const out1 of o.outputs) {
          if (out1 && Array.isArray(out1.outputs)) {
            for (const out2 of out1.outputs) {
              if (out2 && out2.results) {
                if (typeof out2.results.message === 'string') return out2.results.message;
                if (out2.results.message && typeof out2.results.message.text === 'string') return out2.results.message.text;
                if (out2.results.message && out2.results.message.data) {
                  try { if (typeof out2.results.message.data.text === 'string') return out2.results.message.data.text; } catch (e) {}
                }
              }
              const nested = findMessageText(out2, depth + 1);
              if (nested) return nested;
            }
          }
          const nested1 = findMessageText(out1, depth + 1);
          if (nested1) return nested1;
        }
      }
      for (const k of Object.keys(o)) {
        try {
          const res = findMessageText(o[k], depth + 1);
          if (res) return res;
        } catch (e) {}
      }
    }
    return null;
  }

  const simpleText = findMessageText(obj);
  if (simpleText && typeof simpleText === 'string') {
    const text = simpleText.trim();
    if (text.length) {
      try {
        // If it looks like a markdown table, parse into card-like objects
        const parsed = parseMarkdownCardsFromText(text);
        if (parsed && parsed.length > 0) {
          // parsed items are normalized as card-like; map common fields to Pokemon shape
          const p = {};
          const first = parsed[0];
          if (first['Tên chính xác'] || first['Tên'] || first.name) p.name = first['Tên chính xác'] || first['Tên'] || first.name;
          if (first['ID (Mã số)'] || first['ID'] || first['Mã số'] || first.id) p.id = first['ID (Mã số)'] || first['ID'] || first['Mã số'] || first.id;
          if (first['Loại (Type)'] || first['Type'] || first.type) p.type = first['Loại (Type)'] || first['Type'] || first.type;
          if (first['Chiều cao'] || first.height) p.height = first['Chiều cao'] || first.height;
          if (first['Cân nặng'] || first.weight) p.weight = first['Cân nặng'] || first.weight;
          // look for URL in the original text
          const urlMatch = text.match(/https?:\/\/[^\s)]+/i);
          if (urlMatch) p.image_url = urlMatch[0];
          return p;
        }
      } catch (e) {
        // ignore parsing errors
      }

      // As a fallback, search for a first URL (image) and return a simple object
      const url = text.match(/https?:\/\/[^\s)]+/i);
      if (url) return { image_url: url[0] };
    }
  }

  return null;
}

function isPokemonLike(obj) {
  if (!obj) return false;
  const o = obj || {};
  
  // Check for common Pokemon data indicators
  if (o.id || o['ID'] || o['Id']) return true;
  
  // Check common Vietnamese/English keys
  const keys = Object.keys(o).map(k => String(k).toLowerCase());
  if (keys.some(k => k.includes('mã') || k.includes('ma') && k.includes('số') || k.includes('id'))) return true;
  if (keys.some(k => k.includes('loại') || k.includes('type'))) return true;
  if (o.sprite_url || o.sprites || o.image_url) return true;
  
  // Check for multiple Pokemon-specific fields
  const pokemonFields = ['name', 'type', 'height', 'weight', 'abilities', 'stats'];
  const matchCount = pokemonFields.filter(field => o[field]).length;
  if (matchCount >= 3) return true;

  return false;
}

function normalizePokemon(pokemon) {
  if (!pokemon || typeof pokemon !== 'object') return pokemon;

  const normalized = { ...pokemon };

  // Normalize Vietnamese field names to English
  const fieldMappings = {
    'tên': 'name',
    'loại': 'type',
    'chiều cao': 'height',
    'cân nặng': 'weight',
    'mô tả': 'description',
    'khả năng': 'abilities',
    'mã số': 'id'
  };

    // Convert Vietnamese keys to English
    Object.keys(pokemon).forEach(key => {
      const lowerKey = String(key).toLowerCase();
      const stripped = stripDiacritics(lowerKey);
      for (const [viet, eng] of Object.entries(fieldMappings)) {
        const vietStripped = stripDiacritics(viet);
        if (lowerKey.includes(viet) || stripped.includes(viet) || lowerKey.includes(vietStripped) || stripped.includes(vietStripped)) {
          normalized[eng] = pokemon[key];
          break;
        }
      }
    });

  // Prefer numeric id when possible
  if (normalized.id != null) {
    const maybe = String(normalized.id).trim();
    const digits = maybe.match(/\d+/);
    if (digits) {
      const n = parseInt(digits[0], 10);
      if (!isNaN(n)) normalized.id = n;
    }
  }

  // Add a display-friendly, zero-padded id string like #025
  if (typeof normalized.id === 'number' && !Number.isNaN(normalized.id)) {
    normalized.id_formatted = `#${String(normalized.id).padStart(3, '0')}`;
  } else if (normalized.id != null) {
    // fallback: keep original as string but still attempt padding of numeric portion
    const digits = String(normalized.id).match(/\d+/);
    if (digits) normalized.id_formatted = `#${String(digits[0]).padStart(3, '0')}`;
  }

  // Handle image/sprite URLs
  const imageKeys = ['sprite_url', 'sprites', 'image_url', 'image', 'artwork'];
  let imageUrl = null;
  for (const key of imageKeys) {
    if (normalized[key]) {
      if (typeof normalized[key] === 'string') {
        imageUrl = normalized[key];
      } else if (typeof normalized[key] === 'object') {
        // Handle nested sprite objects (like from PokeAPI)
        const sprites = normalized[key];
        imageUrl = sprites.other?.['official-artwork']?.front_default ||
                  sprites.other?.home?.front_default ||
                  sprites.front_default ||
                  Object.values(sprites).find(v => typeof v === 'string' && v.startsWith('http'));
      }
      if (imageUrl) break;
    }
  }

  if (imageUrl) {
    normalized.image_url = imageUrl;
  }

  // Ensure consistent type format (array of strings)
  if (normalized.type && !Array.isArray(normalized.type)) {
    normalized.type = normalized.type.split(/[,/|]/).map(t => t.trim()).filter(Boolean);
  }

  // Normalize height/weight units: ensure 'm' for height and 'kg' for weight when numeric
  if (normalized.height != null) {
    const h = String(normalized.height).trim();
    // if already contains 'm' (case-insensitive) keep as-is
    if (!/\bm\b|m$/i.test(h)) {
      const num = h.match(/[-+]?[0-9]*\.?[0-9]+/);
      if (num) normalized.height = `${num[0]} m`;
      else normalized.height = h;
    } else {
      normalized.height = h;
    }
  }

  if (normalized.weight != null) {
    const w = String(normalized.weight).trim();
    if (!/kg\b|kg$/i.test(w)) {
      const num = w.match(/[-+]?[0-9]*\.?[0-9]+/);
      if (num) normalized.weight = `${num[0]} kg`;
      else normalized.weight = w;
    } else {
      normalized.weight = w;
    }
  }

  // Convert stats if present
  if (normalized.stats && Array.isArray(normalized.stats)) {
    const statsObj = {};
    normalized.stats.forEach(stat => {
      if (stat.stat && stat.base_stat) {
        statsObj[stat.stat.name] = stat.base_stat;
      }
    });
    normalized.stats = statsObj;
  }

  return normalized;
}

function buildPokemonEmbed(normalizedPokemon, fallbackPokemon) {
  const p = normalizedPokemon && Object.keys(normalizedPokemon).length ? normalizedPokemon : (fallbackPokemon || {});

  // Sanitize text to remove markdown and extra whitespace
  const sanitize = (v) => {
    if (v == null) return '';
    return String(v).replace(/[*`_~]/g, '').trim().replace(/\s+/g, ' ');
  };

  // Format number as #001, #012, etc.
  const formatNumber = (num) => {
    if (!num) return '';
    const n = parseInt(num, 10);
    if (isNaN(n)) return num;
    return `#${String(n).padStart(3, '0')}`;
  };

  const title = sanitize(p.name || 'Pokemon');
  // Prefer precomputed id_formatted (single source of truth), otherwise format from numeric id
  const idFormatted = p.id_formatted || formatNumber(p.id);
  const types = Array.isArray(p.type) ? p.type.join(' / ') : sanitize(p.type || '');
  const height = p.height ? (String(p.height).includes('m') ? String(p.height) : `${p.height} m`) : '—';
  const weight = p.weight ? (String(p.weight).includes('kg') ? String(p.weight) : `${p.weight} kg`) : '—';
  const abilities = Array.isArray(p.abilities) ? p.abilities.join(', ') : sanitize(p.abilities || '');
  const desc = sanitize(p.description || p.desc || '');

  const embed = new EmbedBuilder()
    .setTitle(`${title}${idFormatted ? ` ${idFormatted}` : ''}`)
    .setColor(0xffcb05); // Pokemon yellow

  // Add image if available
  if (p.image_url) {
    embed.setImage(p.image_url);
  }

  // Add basic info fields
  const fields = [
    { name: 'Type', value: types || '—', inline: true },
    { name: 'Height', value: height, inline: true },
    { name: 'Weight', value: weight, inline: true }
  ];

  // Add abilities if present
  if (abilities) {
    fields.push({ name: 'Abilities', value: abilities, inline: false });
  }

  // Add stats if present
  if (p.stats && typeof p.stats === 'object') {
    const statsText = Object.entries(p.stats)
      .map(([stat, value]) => `${stat.replace(/-/g, ' ')}: ${value}`)
      .join('\n');
    if (statsText) {
      fields.push({ name: 'Stats', value: statsText, inline: false });
    }
  }

  embed.addFields(fields);

  // Add description if present
  if (desc) {
    embed.setDescription(desc);
  }

  return embed;
}

/**
 * Extract, normalize and build a Discord Embed from a LangFlow/api result object.
 * Returns an object { embed, normalized, raw } or null when no pokemon found.
 */
function getPokemonEmbedFromApiResult(apiResult) {
  // Try to extract a structured object first
  let raw = extractPokemonInfo(apiResult);

  // Helper to find text payloads inside nested API shapes
  function findMessageText(o, depth = 0) {
    if (depth > 8 || o == null) return null;
    if (typeof o === 'string') return o;
    if (typeof o === 'object') {
      if (typeof o.message === 'string') return o.message;
      if (o.message && typeof o.message.text === 'string') return o.message.text;
      if (o.artifacts && typeof o.artifacts.message === 'string') return o.artifacts.message;
      if (o.artifacts && o.artifacts.message && typeof o.artifacts.message.message === 'string') return o.artifacts.message.message;
      if (Array.isArray(o.outputs)) {
        for (const out1 of o.outputs) {
          if (out1 && Array.isArray(out1.outputs)) {
            for (const out2 of out1.outputs) {
              if (out2 && out2.results) {
                if (typeof out2.results.message === 'string') return out2.results.message;
                if (out2.results.message && typeof out2.results.message.text === 'string') return out2.results.message.text;
                if (out2.results.message && out2.results.message.data) {
                  try { if (typeof out2.results.message.data.text === 'string') return out2.results.message.data.text; } catch (e) {}
                }
              }
              const nested = findMessageText(out2, depth + 1);
              if (nested) return nested;
            }
          }
          const nested1 = findMessageText(out1, depth + 1);
          if (nested1) return nested1;
        }
      }
      for (const k of Object.keys(o)) {
        try {
          const res = findMessageText(o[k], depth + 1);
          if (res) return res;
        } catch (e) {}
      }
    }
    return null;
  }

  const messageText = findMessageText(apiResult);

  // If we didn't get a structured object, try parsing markdown table from text
  if ((!raw || (typeof raw === 'object' && Object.keys(raw).length === 0)) && messageText) {
    try {
      const parsed = parseMarkdownCardsFromText(String(messageText));
      if (parsed && parsed.length > 0) {
        const first = parsed[0];
        const p = {};
        if (first['Tên chính xác'] || first['Tên'] || first.name) p.name = first['Tên chính xác'] || first['Tên'] || first.name;
        if (first['ID (Mã số)'] || first['ID'] || first['Mã số'] || first.id) p.id = first['ID (Mã số)'] || first['ID'] || first['Mã số'] || first.id;
        if (first['Loại (Type)'] || first['Type'] || first.type) p.type = first['Loại (Type)'] || first['Type'] || first.type;
        if (first['Chiều cao'] || first.height) p.height = first['Chiều cao'] || first.height;
        if (first['Cân nặng'] || first.weight) p.weight = first['Cân nặng'] || first.weight;
        const urlMatch = String(messageText).match(/https?:\/\/[^\s)]+/i);
        if (urlMatch) p.image_url = urlMatch[0];
        raw = p;
      }
    } catch (e) {
      // ignore
    }
  }

  if (!raw) return null;

  // If some expected fields are still missing, try to enrich from message text parsing
  const normalizedFirstPass = normalizePokemon(raw || {});
  if ((!normalizedFirstPass.type || !normalizedFirstPass.height || !normalizedFirstPass.weight) && messageText) {
    try {
      const parsed = parseMarkdownCardsFromText(String(messageText));
      if (parsed && parsed.length > 0) {
        const first = parsed[0];
        if (!raw.name && (first['Tên chính xác'] || first['Tên'] || first.name)) raw.name = first['Tên chính xác'] || first['Tên'] || first.name;
        if (!raw.id && (first['ID (Mã số)'] || first['ID'] || first['Mã số'] || first.id)) raw.id = first['ID (Mã số)'] || first['ID'] || first['Mã số'] || first.id;
        if (!raw.type && (first['Loại (Type)'] || first['Type'] || first.type)) raw.type = first['Loại (Type)'] || first['Type'] || first.type;
        if (!raw.height && (first['Chiều cao'] || first.height)) raw.height = first['Chiều cao'] || first.height;
        if (!raw.weight && (first['Cân nặng'] || first.weight)) raw.weight = first['Cân nặng'] || first.weight;
        if (!raw.image_url) {
          const urlMatch = String(messageText).match(/https?:\/\/[^\s)]+/i);
          if (urlMatch) raw.image_url = urlMatch[0];
        }
      }
    } catch (e) {}
  }

  const finalNormalized = normalizePokemon(raw || {});
  const embed = buildPokemonEmbed(finalNormalized, raw);
  return { embed, normalized: finalNormalized, raw };
}

module.exports = {
  extractPokemonInfo,
  isPokemonLike,
  normalizePokemon,
  buildPokemonEmbed,
  getPokemonEmbedFromApiResult
};