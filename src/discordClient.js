const { Client, IntentsBitField, REST, Routes } = require('discord.js');

const { DISCORD_TOKEN } = process.env;

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ],
});

const commands = [
  {
    name: 'card',
    description: 'Searches for a card.',
    options: [{ name: 'query', type: 3 /* STRING */, description: 'The card name or query', required: true, autocomplete: true }],
  },
  {
    name: 'archetype',
    description: 'Searches for an archetype.',
    options: [{ name: 'query', type: 3 /* STRING */, description: 'The archetype name or query', required: true, autocomplete: false }],
  },
  {
    name: 'pokemon',
    description: 'Searches for a Pokemon.',
    options: [{ name: 'query', type: 3 /* STRING */, description: 'The Pokemon name or query', required: true, autocomplete: false }],
  },
  {
    name: 'tierlist',
    description: 'Get the current Yu-Gi-Oh! tier list.',
    options: [],
  },
  {
    name: 'status',
    description: 'Check bot server status and queue (Admin only).',
    options: [],
  },
  {
    name: 'art',
    description: 'Get card artwork/image.',
    options: [
      { name: 'query', type: 3 /* STRING */, description: 'The card name', required: true, autocomplete: true },
      { 
        name: 'size', 
        type: 3 /* STRING */, 
        description: 'Image size (default: full)', 
        required: false,
        choices: [
          { name: 'Full - High Quality', value: 'full' },
          { name: 'Small - Medium Quality', value: 'small' },
          { name: 'Cropped - Card Art Only', value: 'cropped' }
        ]
      }
    ],
  },
  {
    name: 'search',
    description: 'Smart semantic search for cards by description, effect, or attributes.',
    options: [
      { name: 'query', type: 3 /* STRING */, description: 'Search query (e.g., "destroy all monsters", "draw cards", "dark warrior")', required: true },
      { 
        name: 'limit', 
        type: 4 /* INTEGER */, 
        description: 'Number of results (default: 5, max: 10)', 
        required: false,
        min_value: 1,
        max_value: 10
      }
    ],
  },
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error reloading application commands:', error);
  }
});

module.exports = { client };
