// Only load .env if not started from parent process
if (!process.env.STARTED_FROM_PARENT) {
  require('dotenv').config();
}

const { client } = require('./src/discordClient');
const { getCardAutocompleteSuggestions, loadData } = require('./src/autocomplete');
const { callCardApi } = require('./src/api');
const { processApiResult } = require('./src/cardUtils');
const { extractPokemonInfo, buildPokemonEmbed, normalizePokemon, getPokemonEmbedFromApiResult } = require('./src/pokemonUtils');
const requestQueue = require('./src/requestQueue');

// Load cards data from CSV files
loadData();

const { DISCORD_TOKEN, CARD_API_URL, ARCHETYPE_API_URL } = process.env;
if (!DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN in environment.');
  process.exit(1);
}
if (!CARD_API_URL) {
  console.error('Missing CARD_API_URL in environment. Set it to your app API endpoint.');
}

// Extract base URL from CARD_API_URL for tier list endpoint
const TIER_LIST_API_URL = CARD_API_URL ? CARD_API_URL.replace(/\/api\/v1\/run\/[^\/]+$/, '/api/v1/run/73e5bea7-52d6-4a76-8db9-4d499a3430f9') : null;

// Autocomplete cache to reduce CPU usage on Render
const autocompleteCache = new Map();
const CACHE_TTL = 60000; // 1 minute cache
const MAX_CACHE_SIZE = 100; // Limit cache size for low RAM

function getCachedSuggestions(query) {
  const cached = autocompleteCache.get(query);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.suggestions;
  }
  return null;
}

function setCachedSuggestions(query, suggestions) {
  // Prevent cache from growing too large
  if (autocompleteCache.size >= MAX_CACHE_SIZE) {
    const firstKey = autocompleteCache.keys().next().value;
    autocompleteCache.delete(firstKey);
  }
  autocompleteCache.set(query, {
    suggestions,
    timestamp: Date.now()
  });
}

client.on('interactionCreate', async (interaction) => {
  // --- Autocomplete Handler ---
  if (interaction.isAutocomplete()) {
    try {
      const focusedValue = interaction.options.getFocused();
      
      // Check cache first (reduces CPU load)
      let suggestions = getCachedSuggestions(focusedValue);
      
      if (!suggestions) {
        // Not in cache, compute suggestions
        suggestions = getCardAutocompleteSuggestions(focusedValue);
        setCachedSuggestions(focusedValue, suggestions);
      }
      
      // Check if interaction is still valid before responding
      if (!interaction.responded && !interaction.deferred) {
        await interaction.respond(suggestions).catch(err => {
          // Ignore "Unknown interaction" errors (interaction expired)
          if (err.code !== 10062) {
            console.error('Autocomplete error:', err);
          }
        });
      }
    } catch (err) {
      // Silently ignore autocomplete errors to prevent crashes
      if (err.code !== 10062) {
        console.error('Autocomplete handler error:', err.message);
      }
    }
    return;
  }

  // --- Slash Command Handler ---
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // Handle status command
  if (commandName === 'status') {
    const member = interaction.member;
    const isAdmin = member && (member.permissions.has('Administrator') || member.permissions.has('ManageGuild'));
    
    if (!isAdmin) {
      await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      return;
    }
    
    const status = requestQueue.getStatus();
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    
    const statusMessage = `
**🤖 Bot Status**
\`\`\`
Uptime: ${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s
Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB
\`\`\`

**📊 Request Queue**
\`\`\`
Active Requests: ${status.activeRequests} / ${status.maxConcurrent}
Queued Requests: ${status.queuedRequests}
Total Users: ${status.totalUsers}
\`\`\`
    `.trim();
    
    await interaction.reply({ content: statusMessage, ephemeral: true });
    return;
  }

  // Handle art command - fetch card image from MongoDB API
  if (commandName === 'art') {
    const cardName = interaction.options.getString('query');
    const imageSize = interaction.options.getString('size') || 'full'; // Default to full size
    await interaction.deferReply();
    
    try {
      const axios = require('axios');
      const mongoApiUrl = process.env.MONGODB_API_URL || 'http://localhost:3000';
      
      // Use optimized /art endpoint
      const response = await axios.get(`${mongoApiUrl}/art`, {
        params: { name: cardName }
      });
      
      if (!response.data) {
        await interaction.editReply(`❌ Could not find card: **${cardName}**`);
        return;
      }
      
      const card = response.data;
      
      // Select image based on size option
      let imageUrl = card.images.full; // Default
      let sizeLabel = 'Full Quality';
      
      if (imageSize === 'small') {
        imageUrl = card.images.small;
        sizeLabel = 'Small';
      } else if (imageSize === 'cropped') {
        imageUrl = card.images.cropped;
        sizeLabel = 'Cropped Art';
      }
      
      // Build embed with card art
      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setTitle(`🎨 ${card.name}`)
        .setImage(imageUrl)
        .setColor(0x2f3136);
      
      // Add card info
      let footerText = card.type || '';
      if (footerText) {
        footerText += ` • ${sizeLabel}`;
      } else {
        footerText = sizeLabel;
      }
      embed.setFooter({ text: footerText });
      
      if (card.id) {
        embed.setDescription(`**Card ID:** ${card.id}`);
      }
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (err) {
      console.error('Error fetching card art:', err);
      
      let errorMessage = `❌ Could not fetch artwork for: **${cardName}**`;
      
      if (err.response?.status === 404) {
        errorMessage = `❌ Card not found: **${cardName}**\nTip: Make sure you use the exact card name.`;
      } else if (err.response?.data?.error) {
        errorMessage = `❌ ${err.response.data.error}`;
      } else if (err.code === 'ECONNREFUSED') {
        errorMessage = `❌ MongoDB API is not available. Please contact an administrator.`;
      }
      
      await interaction.editReply(errorMessage);
    }
    return;
  }

  // Handle search command - semantic search using LangFlow API
  if (commandName === 'search') {
    const query = interaction.options.getString('query');
    const limit = interaction.options.getInteger('limit') || 5;
    await interaction.deferReply();
    
    try {
      const searchApiUrl = process.env.SEARCH_API_URL;
      
      if (!searchApiUrl) {
        await interaction.editReply('❌ Search API is not configured. Please contact an administrator.');
        return;
      }
      
      // Call LangFlow search API through request queue
      const apiResult = await requestQueue.enqueue(
        interaction.user.id,
        interaction.user.username,
        async () => {
          return await callCardApi({
            userId: interaction.user.id,
            username: interaction.user.username,
            content: query,
            apiUrl: searchApiUrl,
          });
        }
      );
      
      // Process result using existing card utilities
      const { processApiResult } = require('./src/cardUtils');
      
      // Create reply adapter for processApiResult
      const replyAdapter = {
        edit: (data) => {
          // Add search context to the response
          if (typeof data === 'string') {
            return interaction.editReply(`🔍 **Search:** ${query}\n\n${data}`);
          } else if (data && data.embeds) {
            // Add header with search info
            const embedCount = data.embeds.length;
            const header = embedCount === 1
              ? `🔍 Found **1** card matching: **${query}**`
              : `🔍 Found **${embedCount}** cards matching: **${query}**`;
            return interaction.editReply({ content: header, embeds: data.embeds });
          }
          return interaction.editReply(data);
        },
        channel: interaction.channel
      };
      
      await processApiResult(apiResult, replyAdapter, interaction);
      
    } catch (err) {
      console.error('Error performing semantic search:', err);
      
      let errorMessage = `❌ Could not search for: **${query}**`;
      
      if (err.message.includes('Rate limit exceeded')) {
        errorMessage = `⏱️ ${err.message}`;
      } else if (err.message.includes('Server is busy')) {
        errorMessage = `🔄 ${err.message}`;
      } else if (err.message.includes('timeout')) {
        errorMessage = `⏱️ Request timed out. The server might be busy. Please try again.`;
      } else if (err.code === 'ECONNREFUSED') {
        errorMessage = `❌ Search service is not available. Please contact an administrator.`;
      }
      
      await interaction.editReply(errorMessage);
    }
    return;
  }

  if (commandName === 'card' || commandName === 'archetype' || commandName === 'pokemon' || commandName === 'tierlist') {
    // Check permissions for tierlist command
    if (commandName === 'tierlist') {
      const member = interaction.member;
      const isAdmin = member && (member.permissions.has('Administrator') || member.permissions.has('ManageGuild'));
      
      if (!isAdmin) {
        await interaction.reply({ content: 'You do not have permission to use this command. Only server administrators and moderators can view the tier list.', ephemeral: true });
        return;
      }
    }
    
    let query = interaction.options.getString('query', false); // false = not required for tierlist
    await interaction.deferReply(); // Acknowledge the command immediately

    let apiUrl = CARD_API_URL;
    let apiName = 'Card';
    
    if (commandName === 'tierlist') {
      apiUrl = TIER_LIST_API_URL;
      apiName = 'Tier List';
      
      if (!apiUrl) {
        await interaction.editReply('Tier List API is not configured on this bot.');
        return;
      }
      // For tier list, don't send query - just trigger the API
      query = 'TRÌNH BÀY TIER LIST HIỆN TẠI CỦA YU-GI-OH! THEO PHIÊN BẢN MỚI NHẤT BẰNG TIẾNG VIỆT.';
    } else if (commandName === 'archetype') {
      apiUrl = ARCHETYPE_API_URL;
      apiName = 'Archetype';
      
      if (!apiUrl) {
        await interaction.editReply('ARCHETYPE_API_URL is not configured on this bot.');
        return;
      }
    } else if (commandName === 'pokemon') {
      apiUrl = process.env.POKEMON_API_URL;
      apiName = 'Pokemon';

      if (!apiUrl) {
        await interaction.editReply('POKEMON_API_URL is not configured on this bot.');
        return;
      }
    }

    try {
      // Use request queue for API calls to handle concurrent users
      const apiResult = await requestQueue.enqueue(
        interaction.user.id,
        interaction.user.username,
        async () => {
          return await callCardApi({
            userId: interaction.user.id,
            username: interaction.user.username,
            content: query,
            apiUrl: apiUrl,
          });
        }
      );

      // Use Pokemon-specific handling for Pokemon command
      if (commandName === 'pokemon') {
          // console.log('=== RAW API RESULT ===');
          // console.log(JSON.stringify(apiResult, null, 2));
          // console.log('=== END RAW API RESULT ===');
          // Use helper that extracts, normalizes (numeric id, units, types) and builds embed
          const embedResult = getPokemonEmbedFromApiResult(apiResult);
          if (embedResult && embedResult.embed) {
            // normalized result is available as embedResult.normalized (no noisy logging)
            await interaction.editReply({ embeds: [embedResult.embed] });
          } else {
            await interaction.editReply('Could not find Pokemon information in the response.');
          }
        } else {
          // For card, archetype, and tierlist, use the card processing
          const replyAdapter = {
            edit: (data) => interaction.editReply(data),
            channel: interaction.channel
          };
          await processApiResult(apiResult, replyAdapter, interaction);
        }
    } catch (err) {
      console.error(`Error calling ${apiName} API:`, err);
      
      // Provide user-friendly error messages
      let errorMessage = `Sorry, I could not process your /${commandName} request.`;
      
      if (err.message.includes('Rate limit exceeded')) {
        errorMessage = `⏱️ ${err.message}`;
      } else if (err.message.includes('Server is busy')) {
        errorMessage = `🔄 ${err.message}`;
      } else if (err.message.includes('timeout')) {
        errorMessage = `⏱️ Request timed out. The server might be busy. Please try again.`;
      }
      
      await interaction.editReply(errorMessage);
    }
  }
});

// Add global error handler to prevent crashes
process.on('unhandledRejection', (error) => {
  // Ignore Discord interaction timeout errors
  if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
    console.log('Autocomplete timeout (ignored)');
    return;
  }
  console.error('Unhandled rejection:', error);
});

// Log in using token from environment variables
client.login(DISCORD_TOKEN);
