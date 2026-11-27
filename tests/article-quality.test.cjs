const assert = require("node:assert/strict");
const test = require("node:test");
const {
  isGenericArticle,
  isEligibleAnnualEvent,
  isEligibleThemeCategory,
  isEligibleThemeArticle,
  selectAnnualEventTitle
} = require("../article-quality.js");

test("rejects broad history pages as event choices", () => {
  assert.equal(isGenericArticle("European history"), true);
  assert.equal(isGenericArticle("History of Europe"), true);
  assert.equal(isEligibleAnnualEvent("European history"), false);
  assert.equal(selectAnnualEventTitle([
    { title: "Siege of Fort Detroit", position: 20 },
    { title: "European history", position: 240 }
  ]), "Siege of Fort Detroit");
});

test("rejects low-quality sports themes and dated article titles", () => {
  assert.equal(isEligibleThemeCategory("Category:Copa del Rey seasons"), false);
  assert.equal(isEligibleThemeCategory("Category:Hockey teams"), false);
  assert.equal(isEligibleThemeArticle("1933 Copa del Presidente de la República", "sports season"), false);
  assert.equal(isEligibleThemeArticle("Example Hockey Club", "hockey team"), false);
  assert.equal(isEligibleThemeArticle("Abner, the Invisible Dog", "2013 film by Fred Olen Ray"), true);
});

test("keeps specific historical events and useful themes", () => {
  assert.equal(isEligibleAnnualEvent("Siege of Fort Detroit"), true);
  assert.equal(isEligibleThemeCategory("Category:English-language comedy films"), true);
  assert.equal(isEligibleThemeArticle("Example Comedy Film", "comedy film", { P31: [] }), true);
});
