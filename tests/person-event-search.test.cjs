const assert = require("node:assert/strict");
const test = require("node:test");
const { nearestPersonEvent } = require("../person-event-search.js");

test("finds Charlemagne in the 801 events list", async () => {
  const queries = [];
  const result = await nearestPersonEvent("Charlemagne", 801, {
    minYear: 15,
    maxYear: 2016,
    maxDistance: 25,
    searchYear: async query => {
      queries.push(query);
      assert.equal(query, 'intitle:801 linksto:Charlemagne');
      return [{ title: "801" }];
    },
    fetchYearEvents: async year => {
      assert.equal(year, 801);
      return [{
        year: 801,
        title: "Charlemagne formally cedes Nordalbian territory",
        context: "Emperor Charlemagne formally cedes Nordalbian territory to the Obotrites.",
        linkedTitles: ["Charlemagne", "Nordalbia", "Obotrites"]
      }];
    }
  });

  assert.deepEqual(queries, ['intitle:801 linksto:Charlemagne']);
  assert.deepEqual(result, {
    year: 801,
    title: "Charlemagne formally cedes Nordalbian territory",
    context: "Emperor Charlemagne formally cedes Nordalbian territory to the Obotrites.",
    source: "https://en.wikipedia.org/wiki/801"
  });
});

test("searches arbitrary names year by year within the nearest range", async () => {
  const queries = [];
  const result = await nearestPersonEvent("Ada Lovelace", 1843, {
    minYear: 15,
    maxYear: 2016,
    maxDistance: 25,
    searchYear: async query => {
      queries.push(query);
      assert.ok(query.length <= 300);
      assert.match(query, /^intitle:\\d+ linksto:"Ada Lovelace"$/);
      return query === 'intitle:1842 linksto:"Ada Lovelace"' ? [{ title: "1842" }] : [];
    },
    fetchYearEvents: async year => [{
      year,
      title: "Ada Lovelace publishes her notes on the Analytical Engine",
      context: "Ada Lovelace publishes her notes on the Analytical Engine.",
      linkedTitles: ["Ada Lovelace", "Analytical Engine"]
    }]
  });

  assert.deepEqual(queries, [
    'intitle:1843 linksto:"Ada Lovelace"',
    'intitle:1842 linksto:"Ada Lovelace"',
    'intitle:1844 linksto:"Ada Lovelace"'
  ]);
  assert.equal(result.year, 1842);
  assert.equal(result.title, "Ada Lovelace publishes her notes on the Analytical Engine");
});
