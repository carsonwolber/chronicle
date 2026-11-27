(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.articleQuality = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  const excludedEntityTypes = new Set(["Q5", "Q13406463", "Q4167410", "Q4167836"]);
  const excludedDescription = /^(?:history of\b|a history of\b|overview of\b|field of study\b|academic discipline\b|branch of knowledge\b|wikimedia (?:list|disambiguation|category) article\b)|\b(?:sports? season|season of .*|hockey team|sports? team|football club|basketball team|baseball team|sports league)\b/i;
  const broadHistoryTitle = /^(?:history of .+|.+\s+history)$/i;
  const eventTitle = /\b(?:battle|siege|war|treaty|agreement|revolution|earthquake|eruption|storm|flood|fire|attack|raid|massacre|assassination|crisis|conspiracy|expedition|conquest|invasion|independence|declaration|election|coronation|founding|launch|release|publication)\b/i;

  function isGenericArticle(title, description = "") {
    return broadHistoryTitle.test(String(title).trim()) || excludedDescription.test(String(description).trim());
  }

  function isEligibleAnnualEvent(title) {
    return !isGenericArticle(title) && !/\b(?:1[0-9]{3}|20[0-1][0-9])\b/.test(String(title));
  }

  function isEligibleThemeCategory(categoryTitle) {
    const name = String(categoryTitle).replace(/^Category:/i, "").trim();
    const lower = name.toLocaleLowerCase();
    const excludedPrefixes = ["all ", "articles ", "pages ", "wikipedia ", "cs1 ", "webarchive", "short description", "births", "deaths", "living people", "people from", "people living", "year of", "use dmy", "use mdy", "commons category link"];
    return !excludedPrefixes.some(prefix => lower.startsWith(prefix))
      && !lower.includes(" by year")
      && !lower.includes(" by country")
      && !lower.includes(" by century")
      && !/\d{4}/.test(name)
      && !/\b(?:seasons?|teams?|leagues?|tournaments?|championships?|sports?|athletics)\b/i.test(name);
  }

  function isEligibleThemeArticle(title, description, claims = {}) {
    if (!isEligibleAnnualEvent(title) || isGenericArticle(title, description)) return false;
    const types = (claims.P31 || []).map(claim => claim.mainsnak?.datavalue?.value?.id).filter(Boolean);
    return !types.some(type => excludedEntityTypes.has(type));
  }

  function selectAnnualEventTitle(candidates) {
    const usable = candidates.filter(candidate => isEligibleAnnualEvent(candidate.title));
    if (!usable.length) return null;
    return usable.sort((a, b) => Number(eventTitle.test(b.title)) - Number(eventTitle.test(a.title)) || a.position - b.position || a.title.length - b.title.length)[0].title;
  }

  return { isGenericArticle, isEligibleAnnualEvent, isEligibleThemeCategory, isEligibleThemeArticle, selectAnnualEventTitle };
});
