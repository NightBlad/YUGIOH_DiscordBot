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
      
      // Set description (limit to 1500 chars to leave room for title + fields, total limit is 6000)
      try { 
        emb.setDescription(typeof truncate === 'function' ? truncate(desc, 1500) : desc.slice(0, 1500)); 
      } catch (e) {
        // ignore errors setting description
      }
    }
    return emb;
  });

  // Send the first batch by editing the reply, then send remaining batches as new messages
  const firstBatch = embeds.slice(0, batchSize);
  await replyMsg.edit({ content: null, embeds: firstBatch });
  
  for (let i = batchSize; i < embeds.length; i += batchSize) {
    const batch = embeds.slice(i, i + batchSize);
    await message.channel.send({ embeds: batch });
  }
  
  return true; // signal success
}

module.exports = {
  renderMultipleCards
};
