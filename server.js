const express = require('express');

const profilesRouter = require('./routes/profiles');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    next();
});

app.use(express.json());

app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({ status: 'error', message: 'Invalid JSON body' });
    }
    next(err);
});

app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send('<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Profile Intelligence Service</title></head><body><h1>Profile Intelligence Service</h1><ul><li><code>POST /api/profiles</code> — create from <code>{ "name": "..." }</code></li><li><code>GET /api/profiles</code> — list (filters: gender, country_id, age_group)</li><li><code>GET /api/profiles/:id</code> — fetch one</li><li><code>DELETE /api/profiles/:id</code> — remove one</li></ul></body></html>');
});

app.use('/api/profiles', profilesRouter);

app.use((req, res) => {
    res.status(404).json({ status: 'error', message: 'Not found' });
});

app.use((err, req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
}

module.exports = app;
