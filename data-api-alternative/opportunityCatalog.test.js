const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeProjectKey,
  buildOpportunitiesIndex,
  searchProjects,
} = require('./opportunityCatalog');

const sampleOpportunities = [
  {
    id: 'OVL_1',
    location: 'Augusta / Thurmond area',
    descProject: {
      utility: 'Dominion Energy South Carolina',
      title: 'Hooks - Thurmond 115 kV tie rebuild',
      area: 'Hooks / Thurmond area, South Carolina',
      aliases: ['Hooks Thurmond'],
    },
    gpcProject: {
      utility: 'Georgia Power',
      title: 'Evans Primary - Thurmond Dam #5 115 kV rebuild',
      area: 'Thurmond area, Georgia / South Carolina',
      aliases: ['Evans Thurmond'],
    },
  },
  {
    id: 'OVL_2',
    location: 'Jasper / McIntosh area',
    descProject: {
      utility: 'Dominion Energy South Carolina',
      title: 'Jasper - Okatie 230 kV #2 construction',
      area: 'Jasper / Okatie area, South Carolina',
      aliases: ['Jasper Okatie'],
    },
    gpcProject: {
      utility: 'Georgia Power',
      title: 'McIntosh - Purrysburg 230 kV reactors',
      area: 'Savannah region',
      aliases: ['McIntosh reactors'],
    },
  },
];

test('normalizeProjectKey is stable and case-insensitive', () => {
  const key = normalizeProjectKey({
    utility: 'Dominion Energy South Carolina',
    title: 'Hooks - Thurmond 115 kV tie rebuild',
  });

  assert.equal(key, 'dominion energy south carolina:hooks - thurmond 115 kv tie rebuild');
});

test('buildOpportunitiesIndex keeps each project unique by key', () => {
  const index = buildOpportunitiesIndex(sampleOpportunities);

  assert.equal(index.projects.length, 4);
  assert.equal(index.byKey.size, 4);
  assert.ok(index.byKey.has('georgia power:evans primary - thurmond dam #5 115 kv rebuild'));
});

test('searchProjects finds project matches across utility and aliases', () => {
  const matches = searchProjects('thurmond', sampleOpportunities);

  assert.ok(matches.some((project) => project.title.includes('Thurmond')));
  assert.ok(matches.some((project) => project.utility.includes('Georgia')));
});
