const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL UNIQUE,
        gender TEXT NOT NULL,
        gender_probability REAL NOT NULL,
        sample_size INTEGER NOT NULL,
        age INTEGER NOT NULL,
        age_group TEXT NOT NULL,
        country_id TEXT NOT NULL,
        country_probability REAL NOT NULL,
        created_at TEXT NOT NULL
    );
`);

function rowToProfile(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        gender: row.gender,
        gender_probability: row.gender_probability,
        sample_size: row.sample_size,
        age: row.age,
        age_group: row.age_group,
        country_id: row.country_id,
        country_probability: row.country_probability,
        created_at: row.created_at,
    };
}

const getByNameKeyStmt = db.prepare('SELECT * FROM profiles WHERE name_key = ?');
const getByIdStmt = db.prepare('SELECT * FROM profiles WHERE id = ?');
const insertStmt = db.prepare(`
    INSERT INTO profiles (
        id, name, name_key, gender, gender_probability, sample_size,
        age, age_group, country_id, country_probability, created_at
    ) VALUES (
        @id, @name, @name_key, @gender, @gender_probability, @sample_size,
        @age, @age_group, @country_id, @country_probability, @created_at
    )
`);
const deleteStmt = db.prepare('DELETE FROM profiles WHERE id = ?');

function getProfileByNameKey(nameKey) {
    return rowToProfile(getByNameKeyStmt.get(nameKey));
}

function getProfileById(id) {
    return rowToProfile(getByIdStmt.get(id));
}

function insertProfile(profile) {
    insertStmt.run(profile);
    return rowToProfile(getByIdStmt.get(profile.id));
}

function deleteProfile(id) {
    const info = deleteStmt.run(id);
    return info.changes > 0;
}

function listProfiles(filters = {}) {
    const clauses = [];
    const params = [];
    if (filters.gender) {
        clauses.push('LOWER(gender) = LOWER(?)');
        params.push(filters.gender);
    }
    if (filters.country_id) {
        clauses.push('LOWER(country_id) = LOWER(?)');
        params.push(filters.country_id);
    }
    if (filters.age_group) {
        clauses.push('LOWER(age_group) = LOWER(?)');
        params.push(filters.age_group);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM profiles ${where} ORDER BY created_at ASC`).all(...params);
    return rows.map(rowToProfile);
}

module.exports = {
    db,
    getProfileByNameKey,
    getProfileById,
    insertProfile,
    deleteProfile,
    listProfiles,
};
