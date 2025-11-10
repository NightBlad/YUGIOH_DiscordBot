const { MongoClient } = require('mongodb');

let client = null;
let db = null;

async function connectToMongo() {
  if (client) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set in environment');
  client = new MongoClient(uri);
  await client.connect();
  const dbName = process.env.DB_NAME || 'card_store';
  db = client.db(dbName);
  console.log('Connected to MongoDB Atlas:', db.databaseName);
}

function getDb() {
  if (!db) throw new Error('DB not initialized. Call connectToMongo first.');
  return db;
}

module.exports = { connectToMongo, getDb };
