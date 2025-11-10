// Only load .env if not started from parent process
if (!process.env.STARTED_FROM_PARENT) {
  require('dotenv').config();
}

const { client } = require('./src/discordClient');
const { getCardAutocompleteSuggestions, loadData } = require('./src/autocomplete');
const { callCardApi } = require('./src/api');
const { processApiResult } = require('./src/cardUtils');
const { extractPokemonInfo, buildPokemonEmbed, normalizePokemon, getPokemonEmbedFromApiResult } = require('./src/pokemonUtils');

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

client.on('interactionCreate', async (interaction) => {
  // --- Autocomplete Handler ---
  if (interaction.isAutocomplete()) {
    const focusedValue = interaction.options.getFocused();
    const suggestions = getCardAutocompleteSuggestions(focusedValue);
    await interaction.respond(suggestions);
    return;
  }

  // --- Slash Command Handler ---
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

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
      const apiResult = await callCardApi({
        userId: interaction.user.id,
        username: interaction.user.username,
        content: query,
        apiUrl: apiUrl,
      });

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
      await interaction.editReply(`Sorry, I could not process your /${commandName} request.`);
    }
  }
});

// Log in using token from environment variables
client.login(DISCORD_TOKEN);
