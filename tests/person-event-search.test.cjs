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
