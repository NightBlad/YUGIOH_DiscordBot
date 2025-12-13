# Discord Bot with MongoDB API

A Discord bot for Yu-Gi-Oh card queries with integrated MongoDB API server for card data management.

## Features

### Discord Bot Commands
- `/card <query>` - Search for Yu-Gi-Oh cards by exact name
- `/archetype <query>` - Search for card archetypes
- `/pokemon <query>` - Search for Pokemon information
- `/search <query>` - **NEW!** Semantic search powered by LangFlow AI
- `/art <query> [size]` - Get card artwork with size options (full/small/cropped)
- `/tierlist` - View tier list (Admin/Moderator only)
- `/status` - Check bot status and queue (Admin only)
- Autocomplete support for card names
- Multi-card rendering with pagination
- Request queue system for concurrent users
- Per-user rate limiting (5 requests/minute)

### MongoDB API
- RESTful API for card data management
- YGOPRODECK-compatible endpoints
- Advanced filtering and search capabilities
- Fast card artwork retrieval endpoint
- CRUD operations for card collection

### LangFlow Integration
- **Semantic search** using LangFlow AI for intelligent card discovery
- Natural language queries (e.g., "cards that destroy all monsters")
- Context-aware search across card effects and descriptions
- Powered by LangFlow's advanced NLP capabilities

## Setup

### Prerequisites
- Node.js (v16 or higher)
- MongoDB Atlas account (or local MongoDB)
- Discord Bot Token
- LangFlow API endpoint (optional)

### Installation

1. **Clone and install dependencies:**
```powershell
npm install
```

2. **Configure environment variables:**

Create a `.env` file in the root directory:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token
CARD_API_URL=https://your-langflow-api.com/api/v1/run/your-flow-id
ARCHETYPE_API_URL=https://your-langflow-api.com/api/v1/run/archetype-flow-id
POKEMON_API_URL=https://your-langflow-api.com/api/v1/run/pokemon-flow-id

# MongoDB API Configuration (mongodb_api/.env)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database
PORT=3000
```

Also create `mongodb_api/.env`:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database
PORT=3000
```

3. **Register Discord slash commands:**

The bot automatically registers commands on startup via `src/discordClient.js`.

## Running the Application

### Option 1: Run both services together (Recommended)
```powershell
npm start
```

### Option 2: Run services separately

**Discord Bot only:**
```powershell
npm run bot
```

**MongoDB API only:**
```powershell
npm run api
```

**Development mode with auto-reload:**
```powershell
npm run dev
```

## Project Structure

```
DiscordBot/
├── index.js                 # Discord bot entry point
├── start.js                 # Unified starter (bot + API)
├── package.json             # Dependencies and scripts
├── .env                     # Main environment config
├── src/
│   ├── api.js              # LangFlow API client
│   ├── autocomplete.js     # Card autocomplete logic
│   ├── cardUtils.js        # Card processing utilities
│   ├── discordClient.js    # Discord client setup
│   ├── multiCardUtils.js   # Multi-card rendering
│   └── pokemonUtils.js     # Pokemon-specific utilities
├── data/                    # CSV data files for autocomplete
└── mongodb_api/
    ├── server.js           # Express API server
    ├── .env                # API-specific config
    ├── src/
    │   └── mongo.js        # MongoDB connection
    └── package.json        # API dependencies
```

## MongoDB API Endpoints

### Card Management

- **GET** `/health` - Health check
- **GET** `/cards?limit=100` - List all cards (optional limit)
- **GET** `/cards/:id` - Get card by ObjectId
- **POST** `/cards` - Insert card(s) (JSON body)
- **DELETE** `/cards` - Delete all cards ⚠️

### Card Search

**GET** `/cardinfo` - Advanced card filtering (YGOPRODECK-compatible)

Query Parameters:
- `name` - Exact name match
- `fname` - Fuzzy name search
- `id` - Card ID
- `archetype` - Archetype name
- `type` - Card type
- `atk` - ATK value (supports lt/gt/lte/gte)
- `def` - DEF value (supports lt/gt/lte/gte)
- `level` - Level/Rank
- `race` - Monster type/race
- `attribute` - Monster attribute
- `sort` - Sort field (name, atk, def, level)
- `limit` - Result limit

**GET** `/art` - Fast card artwork retrieval

Query Parameters:
- `name` or `q` - Card name (required)

Returns card images in full, small, and cropped formats.

**Examples:**

```bash
# Get all cards
GET /cardinfo

# Search by exact name
GET /cardinfo?name=Dark%20Magician

# Fuzzy search
GET /cardinfo?fname=Magician

# Get card artwork
GET /art?name=Blue-Eyes%20White%20Dragon

# Archetype search
GET /cardinfo?archetype=Blue-Eyes

# ATK less than 2500
GET /cardinfo?atk=lt2500

# Multiple filters
GET /cardinfo?archetype=Egyptian%20God&type=Effect%20Monster
```

## Discord Commands

### `/card <query>`
Search for a Yu-Gi-Oh card by name or description.

**Example:**
```
/card query: Blue-Eyes White Dragon
```

### `/archetype <query>`
Search for cards in a specific archetype.

**Example:**
```
/archetype query: Egyptian God
```

### `/pokemon <query>`
Search for Pokemon information (Vietnamese/English support).

**Example:**
```
/pokemon query: Pikachu
```

### `/tierlist`
View the current tier list (Admin/Moderator only).

**Permissions:** Requires `Administrator` or `Manage Guild` permission.

## Configuration

### Discord Bot Permissions

Required bot permissions:
- Send Messages
- Embed Links
- Read Message History
- Use Slash Commands

### Invite Link

Generate invite link with required permissions:
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_BOT_CLIENT_ID&permissions=277025508416&scope=bot%20applications.commands
```


### Adding New Commands

1. Register command in `src/discordClient.js`:
```javascript
{
  name: 'newcommand',
  description: 'Command description',
  options: [/* command options */]
}
```

2. Handle command in `index.js`:
```javascript
if (commandName === 'newcommand') {
  // Handle command logic
}
```

### MongoDB Data Import

To import card data into MongoDB:

```javascript
// POST /cards endpoint accepts array
POST http://localhost:3000/cards
Content-Type: application/json

[
  {
    "name": "Dark Magician",
    "type": "Effect Monster",
    "atk": 2500,
    // ... other fields
  }
]
```

## Troubleshooting

### Bot not responding to commands
- Verify `DISCORD_TOKEN` is correct
- Check bot has required permissions in server
- Ensure slash commands are registered (check bot startup logs)

### MongoDB connection errors
- Verify `MONGODB_URI` is correct
- Check MongoDB Atlas IP whitelist (allow 0.0.0.0/0 or your IP)
- Ensure network connectivity

### API errors (403/500)
- Check LangFlow API endpoints are accessible
- Verify API authentication settings
- Review API logs for detailed error messages

### Embed size errors
- The bot automatically truncates large descriptions
- For archetype queries, results are batched (10 cards per message)

## License

ISC

## Support

For issues or questions, please check:
- Discord.js documentation: https://discord.js.org/
- MongoDB documentation: https://www.mongodb.com/docs/
- Express documentation: https://expressjs.com/

---

**Note:** This project integrates with LangFlow for AI-powered card queries and uses MongoDB Atlas for card data storage.
