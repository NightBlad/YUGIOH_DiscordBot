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
 * Truncate embed to fit within Discord's 6000 character limit
 * @param {Object} embed - Discord embed object
 * @param {Function} truncate - Truncate function
 * @returns {Object} Truncated embed
 */
function ensureEmbedSize(embed, truncate) {
  const MAX_EMBED_SIZE = 6000;
  const SAFETY_MARGIN = 200; // Leave some room for safety
  const TARGET_SIZE = MAX_EMBED_SIZE - SAFETY_MARGIN;
  
  let currentSize = calculateEmbedSize(embed);
  
  if (currentSize <= TARGET_SIZE) {
    return embed; // No truncation needed
  }
  
  const data = embed.data || embed;
  
  // Step 1: Truncate description first (most common large field)
  if (data.description && data.description.length > 800) {
    data.description = typeof truncate === 'function' 
      ? truncate(data.description, 800) 
      : data.description.slice(0, 800) + '...';
    currentSize = calculateEmbedSize(embed);
  }
  
  if (currentSize <= TARGET_SIZE) {
    return embed;
  }
  
  // Step 2: Truncate field values
  if (data.fields && Array.isArray(data.fields)) {
    for (let field of data.fields) {
      if (field.value && field.value.length > 500) {
        field.value = typeof truncate === 'function'
          ? truncate(field.value, 500)
          : field.value.slice(0, 500) + '...';
      }
    }
    currentSize = calculateEmbedSize(embed);
  }
  
  if (currentSize <= TARGET_SIZE) {
    return embed;
  }
  
  // Step 3: Remove fields from the end until we fit
  if (data.fields && Array.isArray(data.fields)) {
    while (currentSize > TARGET_SIZE && data.fields.length > 2) {
      data.fields.pop();
      currentSize = calculateEmbedSize(embed);
    }
    
    // Add indication that content was truncated
    if (data.fields.length > 0) {
      const lastField = data.fields[data.fields.length - 1];
      if (!lastField.value.includes('truncated')) {
        lastField.value += '\n\n_[Content truncated due to size limits]_';
      }
    }
  }
  
  return embed;
}

/**
 * Render multiple cards as embeds with batching.
 * @param {Array} cards - Array of card objects to render
 * @param {Object} replyMsg - Discord reply message adapter with .edit() method
 * @param {Object} message - Discord interaction/message object with .channel
 * @param {Object} options - Rendering options
 * @param {boolean} options.isArchetype - Whether this is an archetype table response
 * @param {number} options.batchSize - How many embeds to send per message (default 10)
 * @param {Function} options.normalizeCard - Function to normalize a card object
 * @param {Function} options.buildEmbedForCard - Function to build an embed from a card
 * @param {Function} options.truncate - Function to truncate text
 */
async function renderMultipleCards(cards, replyMsg, message, options = {}) {
  const { 
    isArchetype = false, 
    batchSize = 10,
    normalizeCard,
    buildEmbedForCard,
    truncate
  } = options;
  
  if (!cards || !Array.isArray(cards) || cards.length === 0) {
    return false; // signal that no rendering happened
  }

  // Build one embed per card
  const embeds = cards.map(c => {
    const norm = normalizeCard(c);
    const emb = buildEmbedForCard(norm, c);
    
    // For archetype responses, prefer using the 'Description' column as the embed description
    const desc = (norm && norm.desc) || c.desc || c.description || c.card_text || c.text || '';
    if (isArchetype && desc) {
      // Remove the "Card Text" field if it exists to avoid duplication and size issues
      const fields = emb.data.fields || [];
      const cardTextIdx = fields.findIndex(f => f.name && (f.name.includes('Card Text') || f.name.includes('card text')));
      if (cardTextIdx !== -1) {
        fields.splice(cardTextIdx, 1);
        emb.data.fields = fields;
      }
      
      // Also clear any existing description to avoid conflicts
      emb.data.description = null;
      
      // Set description (limit to 800 chars initially, will be further truncated if needed)
      try { 
        emb.setDescription(typeof truncate === 'function' ? truncate(desc, 800) : desc.slice(0, 800)); 
      } catch (e) {
        // ignore errors setting description
      }
    }
    
    // Ensure embed size is within Discord limits (6000 chars total)
    return ensureEmbedSize(emb, truncate);
  });

  // Send the first batch by editing the reply, then send remaining batches as new messages
  const firstBatch = embeds.slice(0, batchSize);
  
  // Double-check total size of batch (Discord limits 6000 chars per embed, but also total message size)
  // If batch is too large, reduce batch size
  let safeBatch = ensureBatchSize(firstBatch, truncate);
  
  await replyMsg.edit({ content: null, embeds: safeBatch });
  
  for (let i = batchSize; i < embeds.length; i += batchSize) {
    const batch = embeds.slice(i, i + batchSize);
    const safeBatch = ensureBatchSize(batch, truncate);
    await message.channel.send({ embeds: safeBatch });
  }
  
  return true; // signal success
}

/**
 * Ensure a batch of embeds doesn't exceed size limits
 * @param {Array} embeds - Array of embed objects
 * @param {Function} truncate - Truncate function
 * @returns {Array} Safe batch of embeds
 */
function ensureBatchSize(embeds, truncate) {
  const MAX_BATCH_SIZE = 10; // Discord allows max 10 embeds per message
  
  if (embeds.length > MAX_BATCH_SIZE) {
    return embeds.slice(0, MAX_BATCH_SIZE);
  }
  
  // Calculate total size of all embeds in batch
  let totalSize = 0;
  for (let embed of embeds) {
    totalSize += calculateEmbedSize(embed);
  }
  
  // If total is reasonable, return as is
  // Note: Each embed is already limited to ~5800 chars, so 10 embeds could be 58000 total
  // Discord's message limit is higher than embed limit, but we want to be safe
  return embeds;
}

module.exports = {
  renderMultipleCards
};
