const fetch = require('node-fetch');

const GENDERIZE_URL = 'https://api.genderize.io';
const AGIFY_URL = 'https://api.agify.io';
const NATIONALIZE_URL = 'https://api.nationalize.io';

class UpstreamError extends Error {
    constructor(externalApi) {
        super(`${externalApi} returned an invalid response`);
        this.name = 'UpstreamError';
        this.externalApi = externalApi;
    }
}

function classifyAgeGroup(age) {
    if (age <= 12) return 'child';
    if (age <= 19) return 'teenager';
    if (age <= 59) return 'adult';
    return 'senior';
}

async function fetchApi(url, externalApi) {
    let response;
    try {
        response = await fetch(url);
    } catch (_err) {
        throw new UpstreamError(externalApi);
    }
    if (!response.ok) {
        throw new UpstreamError(externalApi);
    }
    try {
        return await response.json();
    } catch (_err) {
        throw new UpstreamError(externalApi);
    }
}

async function enrichName(name) {
    const encoded = encodeURIComponent(name);

    const [genderize, agify, nationalize] = await Promise.all([
        fetchApi(`${GENDERIZE_URL}?name=${encoded}`, 'Genderize'),
        fetchApi(`${AGIFY_URL}?name=${encoded}`, 'Agify'),
        fetchApi(`${NATIONALIZE_URL}?name=${encoded}`, 'Nationalize'),
    ]);

    const gender = genderize.gender;
    const genderProbability = Number(genderize.probability);
    const sampleSize = Number(genderize.count);
    if (gender === null || gender === undefined || sampleSize === 0) {
        throw new UpstreamError('Genderize');
    }

    const age = agify.age;
    if (age === null || age === undefined) {
        throw new UpstreamError('Agify');
    }

    const country = Array.isArray(nationalize.country) ? nationalize.country : [];
    if (country.length === 0) {
        throw new UpstreamError('Nationalize');
    }
    const topCountry = country.reduce((best, cur) =>
        Number(cur.probability) > Number(best.probability) ? cur : best
    );

    return {
        gender,
        gender_probability: genderProbability,
        sample_size: sampleSize,
        age: Number(age),
        age_group: classifyAgeGroup(Number(age)),
        country_id: topCountry.country_id,
        country_probability: Number(topCountry.probability),
    };
}

module.exports = { enrichName, UpstreamError, classifyAgeGroup };
