(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.personEventSearch = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  function buildPersonYearSearchQuery(title, year) {
    const queryTitle = String(title).replaceAll('"', " ").trim();
    return `intitle:${year} linksto:"${queryTitle}"`;
  }

  function parsePersonYearSearchResults(pages, year, targetYear) {
    const yearPattern = new RegExp(`^(${year})(?:$|\\s|[–—-])`);
    return pages.flatMap(page => {
      const match = page.title.match(yearPattern);
      if (!match) return [];
      return [{
        year,
        distance: Math.abs(year - targetYear),
        title: page.title,
        source: "https://en.wikipedia.org/wiki/" + encodeURIComponent(page.title.replaceAll(" ", "_")),
        isYearPage: page.title === String(year)
      }];
    }).sort((a, b) => Number(b.isYearPage) - Number(a.isYearPage) || a.title.length - b.title.length);
  }

  function matchingYearEvent(title, events) {
    const normalized = String(title).replaceAll("_", " ").trim().toLocaleLowerCase();
    return events.find(event => event.linkedTitles?.some(linkedTitle => String(linkedTitle).replaceAll("_", " ").trim().toLocaleLowerCase() === normalized)) || null;
  }

  async function nearestPersonEvent(title, targetYear, options) {
    const { minYear, maxYear, maxDistance, searchYear, fetchYearEvents } = options;
    for (let distance = 0; distance <= maxDistance; distance += 1) {
      const years = (distance === 0 ? [targetYear] : [targetYear - distance, targetYear + distance])
        .filter(year => year >= minYear && year <= maxYear);
      const groups = await Promise.all(years.map(async year => ({
        year,
        candidates: parsePersonYearSearchResults(await searchYear(buildPersonYearSearchQuery(title, year)), year, targetYear)
      })));
      const candidates = groups.flatMap(group => group.candidates)
        .sort((a, b) => Number(b.isYearPage) - Number(a.isYearPage) || a.title.length - b.title.length);
      for (const candidate of candidates) {
        if (candidate.isYearPage) {
          const match = matchingYearEvent(title, await fetchYearEvents(candidate.year));
          if (!match) continue;
          return { year: candidate.year, title: match.title, context: match.context, source: "https://en.wikipedia.org/wiki/" + candidate.year };
        }
        return { year: candidate.year, title: candidate.title, context: "", source: candidate.source };
      }
    }
    return null;
  }

  return { buildPersonYearSearchQuery, parsePersonYearSearchResults, matchingYearEvent, nearestPersonEvent };
});
