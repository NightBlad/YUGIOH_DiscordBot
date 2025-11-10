const express = require('express');
const cors = require('cors');

// Only load .env if not started from parent process
if (!process.env.STARTED_FROM_PARENT) {
  require('dotenv').config();
}

const { connectToMongo, getDb } = require('./src/mongo');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Connect to Mongo once at start
connectToMongo().then(() => {
  const db = getDb();
  const cards = db.collection('cards');

  // List cards (with optional limit)
  app.get('/cards', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '100', 10);
      const docs = await cards.find({}).limit(limit).toArray();
      res.json(docs);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch cards' });
    }
  });

  // YGOPRO-like cardinfo endpoint
  app.get('/cardinfo', async (req, res) => {
    try {
      // Build filter from query params
      const q = req.query;
      const filter = {};

      // Helper to add regex (fuzzy) match
      const addFuzzy = (field, val) => {
        filter[field] = { $regex: val, $options: 'i' };
      };

      // helper: exact match but case-insensitive using regex anchor
      const exactCi = (field, val) => {
        const parts = val.split('|').map(s => s.trim()).filter(Boolean);
        if (parts.length === 1) {
          // ^...$ with i
          filter[field] = { $regex: `^${escapeRegExp(parts[0])}$`, $options: 'i' };
        } else {
          // array of regexes: use $in with regex objects
          filter[field] = { $in: parts.map(p => new RegExp(`^${escapeRegExp(p)}$`, 'i')) };
        }
      };

      if (q.name) {
        exactCi('name', q.name);
      }
  if (q.fname) addFuzzy('name', q.fname);
      if (q.id) {
        // passcode numeric, can be comma separated
        const ids = q.id.split(',').map(s => parseInt(s.trim(), 10));
        filter.id = { $in: ids };
      }
      if (q.konami_id) filter.konami_id = q.konami_id;
      if (q.type) {
        // case-insensitive type matching
        const types = q.type.split(',').map(s => s.trim()).filter(Boolean);
        filter.type = { $in: types.map(t => new RegExp(`^${escapeRegExp(t)}$`, 'i')) };
      }
      const numericOps = { lt: '$lt', lte: '$lte', gt: '$gt', gte: '$gte' };
      ['atk', 'def', 'level'].forEach(field => {
        if (!q[field]) return;
        const v = q[field];
        // support operators like lt2500
        const m = v.match(/^(lt|lte|gt|gte)(\d+)$/i);
        if (m) {
          const op = numericOps[m[1].toLowerCase()];
          filter[field] = { [op]: parseInt(m[2], 10) };
        } else {
          filter[field] = parseInt(v, 10);
        }
      });
  if (q.race) filter.race = { $in: q.race.split(',').map(s => s.trim()).map(r => new RegExp(`^${escapeRegExp(r)}$`, 'i')) };
  if (q.attribute) filter.attribute = { $in: q.attribute.split(',').map(s => s.trim()).map(a => new RegExp(`^${escapeRegExp(a)}$`, 'i')) };
      if (q.link) filter.linkval = parseInt(q.link, 10);
      if (q.linkmarker) filter.linkmarkers = { $all: q.linkmarker.split(',').map(s => s.trim().toLowerCase()) };
      if (q.scale) filter.scale = parseInt(q.scale, 10);
      if (q.cardset) addFuzzy('card_sets.set_name', q.cardset);
      if (q.archetype) addFuzzy('archetype', q.archetype);

      // escape regex helper
      function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      if (q.staple) filter.staple = q.staple === 'yes' || q.staple === 'true';
      if (q.has_effect) {
        const v = q.has_effect.toLowerCase();
        filter.has_effect = v === 'true' || v === '1' || v === 'yes';
      }

      // Sorting
      let sort = {};
      if (q.sort) {
        const s = q.sort;
        const dir = s.startsWith('-') ? -1 : 1;
        const key = s.replace(/^[-+]/, '');
        sort[key] = dir;
      }

      const limit = parseInt(q.limit || q.count || '100', 10);

      const cursor = cards.find(filter);
      if (Object.keys(sort).length) cursor.sort(sort);
      const docs = await cursor.limit(limit).toArray();

      // Return in a similar envelope
      res.json({ data: docs });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'cardinfo failed' });
    }
  });

  // Get one card by id (string _id)
  app.get('/cards/:id', async (req, res) => {
    try {
      const { ObjectId } = require('mongodb');
      const id = req.params.id;
      const doc = await cards.findOne({ _id: new ObjectId(id) });
      if (!doc) return res.status(404).json({ error: 'Not found' });
      res.json(doc);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: 'Invalid id or request' });
    }
  });

  // Create card(s)
  app.post('/cards', async (req, res) => {
    try {
      const body = req.body;
      if (Array.isArray(body)) {
        const r = await cards.insertMany(body);
        res.json({ insertedCount: r.insertedCount, insertedIds: r.insertedIds });
      } else {
        const r = await cards.insertOne(body);
        res.json({ insertedId: r.insertedId });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Insert failed' });
    }
  });

  // Delete all cards (TRUNCATE-like)
  app.delete('/cards', async (req, res) => {
    try {
      const r = await cards.deleteMany({});
      res.json({ deletedCount: r.deletedCount });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Delete failed' });
    }
  });

  // Start server after routes are attached
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to connect to Mongo:', err);
  process.exit(1);
});
