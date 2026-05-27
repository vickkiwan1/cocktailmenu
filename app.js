const MENU_URL =
  "https://docs.google.com/spreadsheets/d/1L3L0SwDp-z1PGGo-4OQx5H2JmJqrlcTNaoDhnNbA-1E/export?format=csv&gid=0";

const INVENTORY_URL =
  "https://docs.google.com/spreadsheets/d/1L3L0SwDp-z1PGGo-4OQx5H2JmJqrlcTNaoDhnNbA-1E/export?format=csv&gid=91507117";

// Base spirits — missing any of these = Unavailable
const BASE_SPIRITS = new Set([
  "Vodka",
  "Gunpowder Gin",
  "Gold Rum",
  "Banana Butter Rum",
  "Lychee Liqueur",
  "Elderflower Liqueur",
  "Frangelico",
]);

let currentLang  = "en";
let currentTheme = "house";
let cocktails    = [];
let inventoryRows = [];

// sheetsInventory: TRUE/FALSE from Google Sheets — never mutated
let sheetsInventory = {};

// userOverrides: checkbox state per ingredient, layered on top of sheets data
// null = no override (use sheets value), true/false = user has toggled
let userOverrides = {};

async function loadCSV(url) {
  const response = await fetch(url);
  const text = await response.text();
  return Papa.parse(text, { header: true, skipEmptyLines: true }).data;
}

// All ingredients actually referenced across all cocktails
let usedIngredients = new Set();

function buildUsedIngredients() {
  usedIngredients = new Set();
  cocktails.forEach(c => {
    c.ingredients.split("|").forEach(i => usedIngredients.add(i.trim()));
  });
}

function buildSheetsInventory() {
  sheetsInventory = {};
  inventoryRows.forEach(item => {
    sheetsInventory[item.ingredient] = item.available === "TRUE";
  });
}

// Effective availability = user override if set, else sheets value
function isIngredientAvailable(ingredient) {
  if (userOverrides[ingredient] !== undefined) {
    return userOverrides[ingredient];
  }
  return sheetsInventory[ingredient] === true;
}

function getStatus(cocktail) {
  const ingredients = cocktail.ingredients.split("|").map(i => i.trim());

  const missingSpiritOrLiqueur = ingredients.filter(
    ing => BASE_SPIRITS.has(ing) && !isIngredientAvailable(ing)
  );

  if (missingSpiritOrLiqueur.length > 0) return "unavailable";

  const missingModifiers = ingredients.filter(
    ing => !BASE_SPIRITS.has(ing) && !isIngredientAvailable(ing)
  );

  if (missingModifiers.length > 0) return "limited";

  return "available";
}

function renderInventoryPanel() {
  const panel = document.getElementById("inventoryList");
  panel.innerHTML = "";

  // Only show ingredients that are actually used in at least one cocktail
  const visibleIngredients = inventoryRows.filter(item => usedIngredients.has(item.ingredient));

  visibleIngredients.forEach(item => {
    const row = document.createElement("div");
    row.className = "inventory-item";

    const label = currentLang === "en" ? item.ingredient : item.name_zh;

    // Checkbox reflects: user override if set, else sheets value
    const isChecked = isIngredientAvailable(item.ingredient);

    row.innerHTML = `
      <input
        type="checkbox"
        ${isChecked ? "checked" : ""}
        data-ingredient="${item.ingredient}"
      >
      <span>${label}</span>
    `;

    panel.appendChild(row);
  });

  panel.querySelectorAll("input").forEach(box => {
    box.addEventListener("change", e => {
      const ingredient = e.target.dataset.ingredient;
      // Write to userOverrides only — sheets data is never touched
      userOverrides[ingredient] = e.target.checked;
      renderMenu();
    });
  });
}

function renderFeatured() {
  const featured = cocktails.find(c => c.featured === "TRUE");
  if (!featured) return;

  const name = currentLang === "en" ? featured.name_en : featured.name_zh;
  const tags = currentLang === "en" ? featured.tags_en : featured.tags_zh;

  document.getElementById("featuredCocktail").innerHTML = `
    <div class="featured">
      <div class="featured-label">★ ${currentLang === "en" ? "Tonight's Recommendation" : "今晚推荐"}</div>
      <div class="featured-icon">${featured.icon}</div>
      <h3>${name}</h3>
      <div class="featured-tags">${tags.split("|").join(" • ")}</div>
    </div>
  `;
}

function renderSection(title, drinks) {
  let html = `<h2 class="section-title">${title}</h2><div class="cards">`;

  drinks.forEach(cocktail => {
    const status = getStatus(cocktail);
    const name = currentLang === "en" ? cocktail.name_en : cocktail.name_zh;
    const zhName = currentLang === "en" ? cocktail.name_zh : cocktail.name_en;
    const tags = currentLang === "en" ? cocktail.tags_en : cocktail.tags_zh;

    const statusLabel = currentLang === "en"
      ? status.toUpperCase()
      : status === "available" ? "可供应"
      : status === "limited"   ? "部分可供应"
      : "暂不可供应";

    const origLabel  = currentLang === "en" ? "Original ABV" : "原始酒精度";
    const lightLabel = currentLang === "en" ? "Light ABV"    : "轻量版";

    html += `
      <div class="card">
        <div class="card-icon">${cocktail.icon}</div>
        <h3>${name}</h3>
        <div class="card-zh">${zhName}</div>
        <div class="card-divider"></div>
        <div class="tags">${tags.split("|").join(" • ")}</div>
        <div class="abv-row">
          ${currentTheme === 'botanical' ? `
          <div class="abv-block abv-block--light">
            <span class="abv-label">${lightLabel}</span>
            <span class="abv-value">${cocktail.lighter_abv}%</span>
          </div>
          <div class="abv-block abv-block--orig">
            <span class="abv-label">${origLabel}</span>
            <span class="abv-value">${cocktail.original_abv}%</span>
          </div>
          ` : `
          <div class="abv-block abv-block--orig">
            <span class="abv-label">${origLabel}</span>
            <span class="abv-value">${cocktail.original_abv}%</span>
          </div>
          <div class="abv-block abv-block--light">
            <span class="abv-label">${lightLabel}</span>
            <span class="abv-value">${cocktail.lighter_abv}%</span>
          </div>
          `}
        </div>
        <div class="status ${status}">${statusLabel}</div>
      </div>
    `;
  });

  html += "</div>";
  return html;
}

// renderMenu only re-renders cards + featured, not the inventory panel
// This avoids resetting checkboxes mid-interaction
function renderMenu() {
  renderFeatured();

  const easy     = cocktails.filter(c => c.strength_category === "Easy Drinking");
  const balanced = cocktails.filter(c => c.strength_category === "Balanced");
  const spirit   = cocktails.filter(c => c.strength_category === "Spirit Forward");

  document.getElementById("menu").innerHTML =
    renderSection(currentLang === "en" ? "🌿 Easy Drinking"   : "🌿 清爽易饮",   easy) +
    renderSection(currentLang === "en" ? "✨ Balanced"         : "✨ 平衡协调",   balanced) +
    renderSection(currentLang === "en" ? "🌙 Spirit Forward"   : "🌙 酒感浓郁",   spirit);
}

function render() {
  renderInventoryPanel();
  renderMenu();
}

async function init() {
  cocktails      = await loadCSV(MENU_URL);
  inventoryRows  = await loadCSV(INVENTORY_URL);
  buildUsedIngredients();
  buildSheetsInventory();
  render();

  // Language toggle
  document.getElementById("langBtn").addEventListener("click", () => {
    currentLang = currentLang === "en" ? "zh" : "en";
    document.getElementById("langBtn").textContent = currentLang === "en" ? "中文" : "English";
    render();
  });

  // Theme toggle
  document.getElementById("themeBtn").addEventListener("click", () => {
    currentTheme = currentTheme === "house" ? "botanical" : "house";
    document.documentElement.setAttribute("data-theme", currentTheme);
    document.getElementById("themeBtn").textContent =
      currentTheme === "house" ? "🌿 Botanical" : "🏛 Art Deco";
    renderMenu(); // re-render cards so ABV order flips
  });

  // Select All
  document.getElementById("selectAllBtn").addEventListener("click", () => {
    inventoryRows.forEach(item => { userOverrides[item.ingredient] = true; });
    render();
  });

  // Clear All
  document.getElementById("clearAllBtn").addEventListener("click", () => {
    inventoryRows.forEach(item => { userOverrides[item.ingredient] = false; });
    render();
  });
}

init();