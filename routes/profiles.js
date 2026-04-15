const express = require('express');
const { v7: uuidv7 } = require('uuid');

const {
    getProfileByNameKey,
    getProfileById,
    insertProfile,
    deleteProfile,
    listProfiles,
} = require('../db');
const { enrichName, UpstreamError } = require('../services/enrichment');

const router = express.Router();

const NAME_REGEX = /^[\p{L}][\p{L}\s'\-]*$/u;

function validateName(rawName) {
    if (rawName === undefined || rawName === null) {
        return { error: { status: 400, message: 'Missing name' } };
    }
    if (typeof rawName !== 'string') {
        return { error: { status: 422, message: 'name must be a string' } };
    }
    const trimmed = rawName.trim();
    if (!trimmed) {
        return { error: { status: 400, message: 'Missing name' } };
    }
    if (trimmed.length > 100) {
        return { error: { status: 422, message: 'name must be 100 characters or fewer' } };
    }
    if (!NAME_REGEX.test(trimmed)) {
        return { error: { status: 422, message: 'name must contain only letters, spaces, hyphens, or apostrophes' } };
    }
    return { name: trimmed };
}

function toPublicProfile(profile) {
    return {
        id: profile.id,
        name: profile.name,
        gender: profile.gender,
        gender_probability: profile.gender_probability,
        sample_size: profile.sample_size,
        age: profile.age,
        age_group: profile.age_group,
        country_id: profile.country_id,
        country_probability: profile.country_probability,
        created_at: profile.created_at,
    };
}

function toListProfile(profile) {
    return {
        id: profile.id,
        name: profile.name,
        gender: profile.gender,
        age: profile.age,
        age_group: profile.age_group,
        country_id: profile.country_id,
    };
}

router.post('/', async (req, res) => {
    const body = req.body || {};
    const validation = validateName(body.name);
    if (validation.error) {
        return res.status(validation.error.status).json({ status: 'error', message: validation.error.message });
    }
    const name = validation.name;
    const nameKey = name.toLowerCase();

    const existing = getProfileByNameKey(nameKey);
    if (existing) {
        return res.status(200).json({
            status: 'success',
            message: 'Profile already exists',
            data: toPublicProfile(existing),
        });
    }

    let enriched;
    try {
        enriched = await enrichName(name);
    } catch (err) {
        if (err instanceof UpstreamError) {
            return res.status(502).json({ status: 'error', message: err.message });
        }
        console.error('Enrichment error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }

    const duplicate = getProfileByNameKey(nameKey);
    if (duplicate) {
        return res.status(200).json({
            status: 'success',
            message: 'Profile already exists',
            data: toPublicProfile(duplicate),
        });
    }

    const profile = {
        id: uuidv7(),
        name,
        name_key: nameKey,
        gender: enriched.gender,
        gender_probability: enriched.gender_probability,
        sample_size: enriched.sample_size,
        age: enriched.age,
        age_group: enriched.age_group,
        country_id: enriched.country_id,
        country_probability: enriched.country_probability,
        created_at: new Date().toISOString(),
    };

    let saved;
    try {
        saved = insertProfile(profile);
    } catch (err) {
        if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            const fallback = getProfileByNameKey(nameKey);
            if (fallback) {
                return res.status(200).json({
                    status: 'success',
                    message: 'Profile already exists',
                    data: toPublicProfile(fallback),
                });
            }
        }
        console.error('Insert error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }

    return res.status(201).json({ status: 'success', data: toPublicProfile(saved) });
});

router.get('/', (req, res) => {
    const { gender, country_id, age_group } = req.query;
    for (const [key, value] of Object.entries({ gender, country_id, age_group })) {
        if (value !== undefined && (Array.isArray(value) || typeof value !== 'string')) {
            return res.status(422).json({ status: 'error', message: `${key} must be a string` });
        }
    }
    const profiles = listProfiles({
        gender: typeof gender === 'string' ? gender : undefined,
        country_id: typeof country_id === 'string' ? country_id : undefined,
        age_group: typeof age_group === 'string' ? age_group : undefined,
    });
    return res.status(200).json({
        status: 'success',
        count: profiles.length,
        data: profiles.map(toListProfile),
    });
});

router.get('/:id', (req, res) => {
    const profile = getProfileById(req.params.id);
    if (!profile) {
        return res.status(404).json({ status: 'error', message: 'Profile not found' });
    }
    return res.status(200).json({ status: 'success', data: toPublicProfile(profile) });
});

router.delete('/:id', (req, res) => {
    const existing = getProfileById(req.params.id);
    if (!existing) {
        return res.status(404).json({ status: 'error', message: 'Profile not found' });
    }
    deleteProfile(req.params.id);
    return res.status(204).send();
});

module.exports = router;
