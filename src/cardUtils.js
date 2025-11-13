const { EmbedBuilder } = require('discord.js');
const { updateCardCache } = require('./autocomplete');
const { renderMultipleCards } = require('./multiCardUtils');

function extractCardInfo(obj) {
  if (!obj) return null;
  // common LangFlow result shapes
  if (obj.result && Array.isArray(obj.result.data) && obj.result.data[0]) return obj.result.data[0];
  if (obj.data && Array.isArray(obj.data) && obj.data[0]) return obj.data[0];

  // nested outputs shape used earlier
  if (obj.outputs && Array.isArray(obj.outputs)) {
    for (const out1 of obj.outputs) {
      if (out1.outputs && Array.isArray(out1.outputs)) {
        for (const out2 of out1.outputs) {
          if (out2.results) {
            if (out2.results.data && Array.isArray(out2.results.data) && out2.results.data[0]) return out2.results.data[0];
            if (out2.results.result && out2.results.result.data && Array.isArray(out2.results.result.data) && out2.results.result.data[0]) return out2.results.result.data[0];
            if (out2.results.message && out2.results.message.data && Array.isArray(out2.results.message.data) && out2.results.message.data[0]) return out2.results.message.data[0];
          }
        }
      }
    }
  }

  // fallback: deep search for an object that looks like card info
  function searchForCard(o) {
    if (o && typeof o === 'object') {
      if (o.name && (o.card_images || o.image_url || o.image_url_small || o.card_images?.length)) return o;
      for (const k of Object.keys(o)) {
        try {
          const res = searchForCard(o[k]);
          if (res) return res;
        } catch (e) {
          // ignore recursion errors
        }
      }
    }
    return null;
  }

  return searchForCard(obj);
}

function extractCards(obj) {
  const results = [];
  if (!obj) return results;

  if (obj.data && Array.isArray(obj.data)) {
    for (const item of obj.data) results.push(item);
  }
  if (obj.result && obj.result.data && Array.isArray(obj.result.data)) {
    for (const item of obj.result.data) results.push(item);
  }

  if (obj.outputs && Array.isArray(obj.outputs)) {
    for (const out1 of obj.outputs) {
      if (out1.outputs && Array.isArray(out1.outputs)) {
        for (const out2 of out1.outputs) {
          if (out2.results) {
            if (out2.results.data && Array.isArray(out2.results.data)) results.push(...out2.results.data);
            if (out2.results.result && out2.results.result.data && Array.isArray(out2.results.result.data)) results.push(...out2.results.result.data);
            if (out2.results.message && out2.results.message.data && Array.isArray(out2.results.message.data)) results.push(...out2.results.message.data);
          }
          if (out2 && typeof out2 === 'object' && out2.name) results.push(out2);
        }
      }
      if (out1 && typeof out1 === 'object' && out1.name) results.push(out1);
    }
  }

  function scan(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) {
      for (const item of o) scan(item);
      return;
    }
    if (o.name && (o.card_images || o.image_url || o.image_url_small || (o.desc || o.text))) {
      results.push(o);
      return;
    }
    for (const k of Object.keys(o)) {
      try { scan(o[k]); } catch (e) {}
    }
  }

  scan(obj);

  const seen = new Set();
  const unique = [];
  for (const r of results) {
    const key = (r && (r.id || r._id || r.name)) || JSON.stringify(r);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }

  return unique;
}

function normalizeCard(card) {
  if (!card || typeof card !== 'object') return card;
  const safeParse = (val) => {
    if (val == null) return val;
    if (typeof val !== 'string') return val;
    const s = val.trim();
    if (!s) return val;
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
      try { return JSON.parse(s.replace(/'/g, "\"")); }
      catch (e) {
        try {
          const replaced = s.replace(/([\{,\s])'([^']*?)'(?=\s*:)/g, '$1"$2"').replace(/'/g, "\"");
          return JSON.parse(replaced);
        } catch (e2) { return val; }
      }
    }
    if (/^[[.*]]$/.test(s)) {
      try { return JSON.parse(s.replace(/'/g, "\"")); } catch (e) { return s.replace(/^[[\]]/g, '').split(',').map(x => x.replace(/['"]+/g, '').trim()).filter(Boolean); }
    }
    return val;
  };
  const maybeStringified = ['card_images', 'card_sets', 'card_prices', 'typeline'];
  for (const key of maybeStringified) {
    if (card.hasOwnProperty(key) && typeof card[key] === 'string') {
      const parsed = safeParse(card[key]);
      card[key] = parsed;
    }
  }
  if (card.typeline && !Array.isArray(card.typeline) && typeof card.typeline === 'string') {
    const t = card.typeline.trim();
    if (t.startsWith('[')) {
      try { card.typeline = JSON.parse(t.replace(/'/g, "\"")); } catch (e) { card.typeline = t.replace(/^[[\]]/g, '').split(',').map(x => x.replace(/['"]+/g, '').trim()); }
    } else {
      card.typeline = t.split(/\s+/).filter(Boolean);
    }
  }
  if (card.card_images && Array.isArray(card.card_images) && card.card_images.length && typeof card.card_images[0] === 'string') {
    card.card_images = card.card_images.map(ci => {
      if (typeof ci === 'string') {
        try { return JSON.parse(ci.replace(/'/g, "\"")); } catch (e) { return ci; }
      }
      return ci;
    });
  }
  // If a parsed card contains common image fields (image, img, Image URL, etc.), normalize them
  const imageCandidates = ['image', 'img', 'image_url', 'imageurl', 'image url', 'image_url_small', 'image_url_cropped', 'image_small', 'Image', 'Image URL', 'Image_URL'];
  if ((!card.card_images || !card.card_images.length) && typeof card === 'object') {
    for (const k of Object.keys(card)) {
      if (imageCandidates.includes(k) && card[k] && typeof card[k] === 'string') {
        // value might be a plain URL or markdown image like ![alt](https://...)
        const raw = card[k].trim();
        const m = raw.match(/https?:\/\/[^\s)]+/i);
        if (m) {
          const url = m[0];
          card.card_images = [{ image_url: url, image_url_small: url }];
          card.image_url = url;
          card.image_url_small = url;
          break;
        }
      }
    }
    // also check for lowercase keys that may contain 'image' substring
    if ((!card.card_images || !card.card_images.length)) {
      for (const k of Object.keys(card)) {
        if (k.toLowerCase().includes('image') && typeof card[k] === 'string') {
          const raw = card[k].trim();
          const m = raw.match(/https?:\/\/[^\s)]+/i);
          if (m) {
            const url = m[0];
            card.card_images = [{ image_url: url, image_url_small: url }];
            card.image_url = url;
            card.image_url_small = url;
            break;
          }
        }
      }
    }
  }
  return card;
}

const truncate = (s, n) => (typeof s === 'string' && s.length > n ? s.slice(0, n - 3) + '...' : String(s ?? ''));

// Sanitize text: remove pipes, asterisks and common markdown characters and trim
function sanitizeText(v) {
  if (v == null) return '';
  let s = String(v);
  // remove pipes and asterisks and markdown symbols, keep punctuation like commas/periods
  s = s.replace(/[|*`_~]/g, '').trim();
  // collapse multiple spaces
  s = s.replace(/\s+/g, ' ');
  return s;
}

function buildEmbedForCard(normalizedCard, fallbackCard) {
  const title = sanitizeText(normalizedCard.name || fallbackCard.name || 'Card');
  const embed = new EmbedBuilder().setTitle(title).setColor(0x2f3136);
  if (normalizedCard.archetype) embed.setFooter({ text: `Archetype: ${sanitizeText(normalizedCard.archetype)}` });
  const thumb = (normalizedCard.card_images && normalizedCard.card_images[0] && (normalizedCard.card_images[0].image_url_small || normalizedCard.card_images[0].image_url)) || normalizedCard.image_url_small || normalizedCard.image_url;
  const largeImage = (normalizedCard.card_images && normalizedCard.card_images[0] && (normalizedCard.card_images[0].image_url || normalizedCard.card_images[0].image_url_cropped)) || normalizedCard.image_url || normalizedCard.image_url_cropped || null;
  if (thumb) embed.setThumbnail(thumb);
  if (largeImage) embed.setImage(largeImage);
  const fields = [];
  if (normalizedCard.type || normalizedCard.humanReadableCardType) fields.push({ name: 'Card Type', value: truncate(sanitizeText(normalizedCard.type || normalizedCard.humanReadableCardType), 1024), inline: true });
  if (normalizedCard.attribute) fields.push({ name: 'Attribute', value: truncate(sanitizeText(normalizedCard.attribute), 1024), inline: true });
  if (normalizedCard.race || normalizedCard.typeline) fields.push({ name: 'Type', value: truncate(sanitizeText(normalizedCard.race || (Array.isArray(normalizedCard.typeline) ? normalizedCard.typeline.join(' ') : '')), 1024), inline: true });
  if (normalizedCard.level) fields.push({ name: 'Level', value: sanitizeText(String(normalizedCard.level)), inline: true });
  if (typeof normalizedCard.atk !== 'undefined') fields.push({ name: 'ATK', value: sanitizeText(String(normalizedCard.atk)), inline: true });
  if (typeof normalizedCard.def !== 'undefined') fields.push({ name: 'DEF', value: sanitizeText(String(normalizedCard.def)), inline: true });
  if (normalizedCard.archetype) fields.push({ name: 'Archetype', value: truncate(sanitizeText(normalizedCard.archetype), 1024), inline: true });
  if (normalizedCard.banlist_info && normalizedCard.banlist_info.ban_ocg) fields.push({ name: 'Banlist Info', value: sanitizeText(String(normalizedCard.banlist_info.ban_ocg)), inline: true });
  if (fields.length) embed.addFields(fields.slice(0, 25));
  const fullText = sanitizeText((normalizedCard && normalizedCard.desc) || fallbackCard.desc || fallbackCard.card_text || fallbackCard.text || '');
  if (fullText) {
    const MAX_FIELD = 1024;
    // Reduce limits to ensure total embed size stays under 6000 chars
    // With title, fields, and footer, we need to be conservative
    if (fullText.length <= MAX_FIELD) embed.addFields({ name: 'Card Text', value: fullText });
    else if (fullText.length <= 2000) embed.setDescription(fullText.slice(0, 2000)); // Reduced from 4096
    else embed.addFields({ name: 'Card Text (truncated)', value: truncate(fullText, 1024) });
  }
  
  // Ensure the final embed doesn't exceed Discord's 6000 char limit
  return ensureEmbedSize(embed);
}

function isPokemonLike(obj) {
  if (!obj) return false;
  const o = obj || {};
  // presence of ID, 'Loai'/'Type', or numeric ID and image -> likely pokemon
  // direct keys
  if (o.id || o['ID'] || o['Id']) return true;
  // common vietnamese/english keys
  const keys = Object.keys(o).map(k => String(k).toLowerCase());
  if (keys.some(k => k.includes('mã') || k.includes('ma') && k.includes('số') || k.includes('id'))) return true;
  if (keys.some(k => k.includes('loại') || k.includes('type'))) return true;
  if (o.card_images && Array.isArray(o.card_images) && o.card_images.length) return true;
  return false;
}

function buildPokemonEmbed(normalizedCard, fallbackCard) {
  const c = normalizedCard && Object.keys(normalizedCard).length ? normalizedCard : (fallbackCard || {});
  const getField = (obj, candidates) => {
    for (const k of Object.keys(obj || {})) {
      const lk = k.toLowerCase();
      for (const cand of candidates) if (lk.includes(cand)) return obj[k];
    }
    return null;
  };

  const sanitize = (v) => {
    if (v == null) return '';
    let s = String(v);
    // remove common markdown like **bold**, __underline__, `code`, ~strike~ and surrounding whitespace
    s = s.replace(/\*\*|__|`|~/g, '').trim();
    return s;
  };
  const title = sanitize(sanitizeText(getField(c, ['tên', 'name']) || c.name || 'Pokemon'));
  const id = sanitize(sanitizeText(getField(c, ['mã', 'id', 'mã số']) || c.id || ''));
  const types = sanitize(sanitizeText(getField(c, ['loại', 'type']) || c.type || ''));
  const height = sanitize(sanitizeText(getField(c, ['chiều', 'height']) || c['Chiều cao'] || ''));
  const weight = sanitize(sanitizeText(getField(c, ['cân', 'weight']) || c['Cân nặng'] || ''));
  const desc = sanitize(sanitizeText(getField(c, ['description', 'desc']) || c.desc || ''));
  const thumb = (c.card_images && c.card_images[0] && (c.card_images[0].image_url_small || c.card_images[0].image_url)) || c.image_url_small || c.image_url || null;

  const embed = new EmbedBuilder()
    .setTitle(`${title}${id ? ` — #${id}` : ''}`)
    .setColor(0xffcb05) // nice Pokemon yellow-ish
    .setThumbnail(thumb || undefined)
    .addFields(
      { name: 'Type', value: types || '—', inline: true },
      { name: 'Height', value: height || '—', inline: true },
      { name: 'Weight', value: weight || '—', inline: true }
    );

  if (desc) embed.setDescription(truncate(desc, 2000)); // Reduced from 4096 to stay under 6000 total
  // if we have a larger image separate from thumbnail, set it as image
  const largeImage = (c.card_images && c.card_images[0] && (c.card_images[0].image_url || c.card_images[0].image_url_cropped)) || c.image_url || null;
  if (largeImage) embed.setImage(largeImage);
  
  // Ensure the final embed doesn't exceed Discord's 6000 char limit
  return ensureEmbedSize(embed);
}

function parseMarkdownCardsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  // Normalize CRLF
  const t = text.replace(/\r\n/g, '\n');
  // Split by lines with only --- (or more) or by blank line + !title
  const blocks = t.split(/\n-{3,}\n/);
  const cards = [];
  for (let block of blocks) {
    block = block.trim();
    if (!block) continue;

    // Find a title line starting with '!'
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    let title = '';
    for (const ln of lines) {
      if (ln.startsWith('!')) { title = ln.replace(/^!+\s*/, '').trim(); break; }
    }

    // Collect table rows of form | Field | Value | - using line-by-line parsing
    const obj = {};
    for (const ln of lines) {
      // Skip header divider rows like | :--- | :--- |
      if (/^[|:\s-]+$/.test(ln)) continue;
      
      // Parse rows that contain pipes
      if (ln.includes('|')) {
        const parts = ln.split('|').map(s => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          let key = parts[0];
          let val = parts[1];
          
          // Remove markdown formatting from key and value
          key = key.replace(/\*\*/g, '').trim();
          val = val.replace(/\*\*/g, '').trim();
          
          // Skip Vietnamese/English table headers
          if (/^thông tin$/i.test(key) || /^giá trị$/i.test(key)) continue;
          if (/^field$/i.test(key) || /^value$/i.test(key)) continue;
          if (/^hình ảnh$/i.test(key) || /^hình ảnh$/i.test(val)) continue;
          if (/^image$/i.test(key) && !val) continue;
          
          if (key && val) {
            obj[sanitizeText(key)] = sanitizeText(val);
          }
        }
      }
    }

    // If no table rows found, try simple Key: Value lines
    if (Object.keys(obj).length === 0) {
      for (const ln of lines) {
        const kv = ln.split('|').map(s => s.trim()).filter(Boolean);
        if (kv.length === 2 && kv[0] && kv[1]) {
          const k = sanitizeText(kv[0]); const v = sanitizeText(kv[1]);
          if (!/^hình ảnh$/i.test(k) && !/^hình ảnh$/i.test(v)) obj[k] = v;
        }
        // also support 'Field | Value' without leading/trailing pipes
        const parts = ln.split(/\|/).map(s => s.trim());
        if (parts.length === 2 && parts[0] && parts[1]) {
          const k = sanitizeText(parts[0]); const v = sanitizeText(parts[1]);
          if (!/^field$/i.test(k) && !/^value$/i.test(k) && !/^hình ảnh$/i.test(k) && !/^hình ảnh$/i.test(v)) obj[k] = v;
        }
      }
    }

    // Normalize keys to expected card fields where possible
    if (Object.keys(obj).length > 0) {
      const card = {};
      for (const [k, v] of Object.entries(obj)) {
        const lk = k.toLowerCase();
        const sv = sanitizeText(v);
        if (lk.includes('name')) card.name = sv;
        else if (lk.includes('type')) card.type = sv;
        else if (lk.includes('attribute')) card.attribute = sv;
        else if (lk.includes('level')) card.level = sv;
        else if (lk.includes('race') || lk.includes('race')) card.race = sv;
        else if (lk.includes('atk')) card.atk = isNaN(Number(sv)) ? sv : Number(sv);
        else if (lk.includes('def')) card.def = isNaN(Number(sv)) ? sv : Number(sv);
        else if (lk.includes('description') || lk.includes('desc')) card.desc = sv;
        else {
          // fallback store unknown fields
          card[k] = sv;
        }
      }
      // If title available and no name in table, use it
      if (!card.name && title) card.name = title;
      cards.push(card);
    } else if (title) {
      // block had a title but no table; use title-only card
      cards.push({ name: title });
    }
  }
  return cards;
}

async function processApiResult(apiResult, replyMsg, message) {
  const card = extractCardInfo(apiResult);
  let cards = extractCards(apiResult);
  let isArchetype = false;

  // Update cache with found cards
  if (cards) cards.forEach(c => updateCardCache(c));

  // Support archetype table outputs where rows have keys like 'Card Name', 'Image', etc.
  try {
    if ((!cards || cards.length === 0) && apiResult && apiResult.result && Array.isArray(apiResult.result.data) && apiResult.result.data.length > 0) {
      const sample = apiResult.result.data[0];
      const sampleKeys = Object.keys(sample).map(k => String(k).toLowerCase());
      
      // Check for MongoDB API format (has 'name', 'desc', 'card_images' as stringified JSON)
      const isMongoFormat = sampleKeys.includes('name') && sampleKeys.includes('desc');
      
      if (isMongoFormat || sampleKeys.some(k => k.includes('card name') || k.includes('cardname') || k.includes('card_name'))) {
        const tableCards = [];
        for (const row of apiResult.result.data) {
          let cardObj;
          
          if (isMongoFormat) {
            // MongoDB format: fields are already present but some are stringified JSON
            cardObj = { ...row };
            // Parse stringified JSON fields
            if (typeof cardObj.card_images === 'string') {
              try { cardObj.card_images = JSON.parse(cardObj.card_images); } catch (e) {}
            }
            if (typeof cardObj.card_prices === 'string') {
              try { cardObj.card_prices = JSON.parse(cardObj.card_prices); } catch (e) {}
            }
            if (typeof cardObj.card_sets === 'string') {
              try { cardObj.card_sets = JSON.parse(cardObj.card_sets); } catch (e) {}
            }
            if (typeof cardObj.typeline === 'string') {
              try { cardObj.typeline = JSON.parse(cardObj.typeline); } catch (e) {}
            }
          } else {
            // Table format (old logic)
            const name = row['Card Name'] || row['CardName'] || row['card name'] || row['cardname'] || row.name || row.Name || '';
            const type = row['Card Type'] || row['CardType'] || row['card type'] || row.type || '';
            const attribute = row['Attribute'] || row.attribute || '';
            const level = row['Level/Rank/Link'] || row['Level'] || row.level || '';
            const atk = row['ATK'] || row.atk || '';
            const def = row['DEF'] || row.def || '';
            const desc = row['Description'] || row.description || row.desc || '';
            let img = row['Image'] || row.image || row['Image URL'] || row['image_url'] || null;
            if (img && typeof img === 'string' && !/^https?:\/\//i.test(img)) img = null;
            cardObj = { name, type, attribute, level, atk, def, desc };
            if (img) cardObj.card_images = [{ image_url: img, image_url_small: img }];
          }
          
          tableCards.push(cardObj);
        }
        // mark that this came from an archetype-style table so rendering can prefer thumbnails/description
        if (tableCards.length) isArchetype = true;
        if (tableCards.length) cards = tableCards;
      }
    }
  } catch (e) {
    // ignore parsing errors
  }

  const normalizedCard = normalizeCard(card);

  // multiple cards path
  if (cards && Array.isArray(cards) && cards.length > 1) {
    await renderMultipleCards(cards, replyMsg, message, { 
      isArchetype,
      normalizeCard,
      buildEmbedForCard,
      truncate
    });
    return;
  }

  // single card path
  if (normalizedCard) {
    const embed = buildEmbedForCard(normalizedCard, card);
    const fullText = (normalizedCard && normalizedCard.desc) || card.desc || card.card_text || card.text || '';
    if (fullText && fullText.length > 4000) {
      await replyMsg.edit({ content: `Result too long; sending full text in follow-up messages.`, embeds: [embed] });
      for (let i = 0; i < fullText.length; i += 1900) {
        await message.channel.send(fullText.slice(i, i + 1900));
      }
      return;
    }
    await replyMsg.edit({ content: null, embeds: [embed] });
    return;
  }

  // try plain text extraction and markdown parsing fallbacks
  function findMessageText(obj, depth = 0) {
    if (depth > 8 || obj == null) return null;
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'object') {
      if (typeof obj.message === 'string') return obj.message;
      if (obj.message && typeof obj.message.text === 'string') return obj.message.text;
      if (obj.artifacts && typeof obj.artifacts.message === 'string') return obj.artifacts.message;
      if (obj.artifacts && obj.artifacts.message && typeof obj.artifacts.message.message === 'string') return obj.artifacts.message.message;
      if (Array.isArray(obj.outputs)) {
        for (const out1 of obj.outputs) {
          if (out1 && Array.isArray(out1.outputs)) {
            for (const out2 of out1.outputs) {
              if (out2 && out2.results) {
                if (out2.results.message && typeof out2.results.message === 'string') return out2.results.message;
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
      for (const k of Object.keys(obj)) {
        try {
          const res = findMessageText(obj[k], depth + 1);
          if (res) return res;
        } catch (e) {}
      }
    }
    return null;
  }

  const simpleText = findMessageText(apiResult);
  if (simpleText) {
    const trimmed = String(simpleText).trim();
    if (trimmed.length) {
      // If text looks like the markdown table output (many '!Title' blocks or '| Field | Value |'), try parsing into cards
      try {
        const looksLikeTable = /|\s*Field\s*|\s*Value\s*|/i.test(trimmed) || /(^!\S+)/m.test(trimmed) || /|---\|/m.test(trimmed) || /Hình ảnh/.test(trimmed);
        if (looksLikeTable) {
          const parsedCards = parseMarkdownCardsFromText(trimmed);
          if (parsedCards && parsedCards.length > 0) {
            // Render parsed cards similarly to the cards path
            const cardsFromText = parsedCards.map(c => normalizeCard(c));
            if (cardsFromText.length > 1) {
              await renderMultipleCards(cardsFromText, replyMsg, message, { 
                isArchetype: false,
                normalizeCard,
                buildEmbedForCard,
                truncate
              });
              return;
            }
            // single parsed card
            if (cardsFromText.length === 1) {
              const embed = buildEmbedForCard(cardsFromText[0], cardsFromText[0]);
              await replyMsg.edit({ content: null, embeds: [embed] });
              return;
            }
          }
        }
      } catch (e) {
        // parsing fallback: continue with plain text handling below
      }
      if (trimmed.length <= 1900) {
        await replyMsg.edit({ content: trimmed });
        return;
      }
      await replyMsg.edit({ content: `Result too long; sending full result in follow-up messages.` });
      for (let i = 0; i < trimmed.length; i += 1900) await message.channel.send(trimmed.slice(i, i + 1900));
      return;
    }
  }

  // final fallback: pretty-print the whole API result (chunked if necessary)
  let rawText = '';
  if (typeof apiResult === 'string') rawText = apiResult;
  else if (apiResult && typeof apiResult === 'object') {
    if (apiResult.message) rawText = typeof apiResult.message === 'string' ? apiResult.message : (apiResult.message.text || JSON.stringify(apiResult.message, null, 2));
    else rawText = JSON.stringify(apiResult, null, 2);
  } else rawText = String(apiResult);

  if (rawText.length <= 1900) {
    await replyMsg.edit({ content: rawText });
  } else {
    await replyMsg.edit({ content: `Result too long; sending full result in follow-up messages.` });
    for (let i = 0; i < rawText.length; i += 1900) await message.channel.send(rawText.slice(i, i + 1900));
  }
}

/**
 * Calculate total character count in an embed
 * @param {Object} embed - Discord embed object
 * @returns {number} Total character count
 */
function calculateEmbedSize(embed) {
  let total = 0;
  const data = embed.data || embed;
  
  if (data.title) total += data.title.length;
  if (data.description) total += data.description.length;
  if (data.footer && data.footer.text) total += data.footer.text.length;
  if (data.author && data.author.name) total += data.author.name.length;
  
  if (data.fields && Array.isArray(data.fields)) {
    data.fields.forEach(field => {
      if (field.name) total += field.name.length;
      if (field.value) total += field.value.length;
    });
  }
  
  return total;
}

/**
 * Ensure embed doesn't exceed Discord's 6000 character limit
 * @param {Object} embed - Discord embed object
 * @returns {Object} Validated embed
 */
function ensureEmbedSize(embed) {
  const MAX_EMBED_SIZE = 6000;
  const SAFETY_MARGIN = 200;
  const TARGET_SIZE = MAX_EMBED_SIZE - SAFETY_MARGIN;
  
  const currentSize = calculateEmbedSize(embed);
  
  if (currentSize <= TARGET_SIZE) {
    return embed;
  }
  
  // If over limit, try to truncate description first
  const data = embed.data || embed;
  
  if (data.description && data.description.length > 1000) {
    data.description = truncate(data.description, 1000);
  }
  
  // If still too large, remove fields from the end
  if (calculateEmbedSize(embed) > TARGET_SIZE && data.fields && data.fields.length > 3) {
    while (calculateEmbedSize(embed) > TARGET_SIZE && data.fields.length > 3) {
      data.fields.pop();
    }
    // Add truncation notice
    if (data.fields.length > 0) {
      const lastField = data.fields[data.fields.length - 1];
      if (!lastField.value.includes('truncated')) {
        lastField.value += '\n_[Some fields removed due to size limits]_';
      }
    }
  }
  
  return embed;
}

module.exports = {
  extractCardInfo,
  extractCards,
  normalizeCard,
  buildEmbedForCard,
  isPokemonLike,
  buildPokemonEmbed,
  parseMarkdownCardsFromText,
  processApiResult,
  truncate,
  calculateEmbedSize,
  ensureEmbedSize,
};
