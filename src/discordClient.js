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
