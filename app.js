const MENU_URL =
  "https://docs.google.com/spreadsheets/d/1L3L0SwDp-z1PGGo-4OQx5H2JmJqrlcTNaoDhnNbA-1E/export?format=csv&gid=0";

const INVENTORY_URL =
  "https://docs.google.com/spreadsheets/d/1L3L0SwDp-z1PGGo-4OQx5H2JmJqrlcTNaoDhnNbA-1E/export?format=csv&gid=91507117";

// Base spirits — missing any = Unavailable
const BASE_SPIRITS = new Set([
  "Vodka","Gunpowder Gin","Gold Rum","Banana Butter Rum",
  "Lychee Liqueur","Elderflower Liqueur","Frangelico",
]);

// Themes config
const THEMES = [
  { id: "house",     label: "🏛 Art Deco",   emoji: "🏛" },
  { id: "botanical", label: "🌿 Botanical",  emoji: "🌿" },
  { id: "tiki",      label: "🌺 Tiki",       emoji: "🌺" },
  { id: "halloween", label: "🎃 Halloween",  emoji: "🎃" },
  { id: "christmas", label: "🎄 Christmas",  emoji: "🎄" },
];

let currentLang  = "en";
let currentTheme = "house";
let cocktails    = [];
let inventoryRows = [];
let usedIngredients = new Set();
let sheetsInventory = {};
let userOverrides   = {};

// --- OpenMoji illustration helper ---
// Converts an emoji character to its OpenMoji SVG CDN URL
function emojiToOpenMoji(emoji) {
  const codePoints = [...emoji]
    .map(e => e.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"))
    .filter(cp => cp !== "FE0F"); // strip variation selector
  const code = codePoints.join("-");
  return `https://cdn.jsdelivr.net/gh/hfg-gmuend/openmoji@15.0.0/color/svg/${code}.svg`;
}

function drinkIllustration(emoji, name) {
  const url = emojiToOpenMoji(emoji);
  return `<img
    class="card-illustration"
    src="${url}"
    alt="${name} illustration"
    onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
  ><span class="card-icon-fallback" style="display:none">${emoji}</span>`;
}

// --- CSV loading ---
async function loadCSV(url) {
  const response = await fetch(url);
  const text = await response.text();
  return Papa.parse(text, { header: true, skipEmptyLines: true }).data;
}

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

function isIngredientAvailable(ingredient) {
  if (userOverrides[ingredient] !== undefined) return userOverrides[ingredient];
  return sheetsInventory[ingredient] === true;
}

function getStatus(cocktail) {
  const ingredients = cocktail.ingredients.split("|").map(i => i.trim());
  const missingSpirit = ingredients.filter(ing => BASE_SPIRITS.has(ing) && !isIngredientAvailable(ing));
  if (missingSpirit.length > 0) return "unavailable";
  const missingMod = ingredients.filter(ing => !BASE_SPIRITS.has(ing) && !isIngredientAvailable(ing));
  if (missingMod.length > 0) return "limited";
  return "available";
}

// --- Inventory panel ---
function renderInventoryPanel() {
  const panel = document.getElementById("inventoryList");
  panel.innerHTML = "";
  const visible = inventoryRows.filter(item => usedIngredients.has(item.ingredient));
  visible.forEach(item => {
    const row = document.createElement("div");
    row.className = "inventory-item";
    const label = currentLang === "en" ? item.ingredient : item.name_zh;
    const isChecked = isIngredientAvailable(item.ingredient);
    row.innerHTML = `
      <input type="checkbox" ${isChecked ? "checked" : ""} data-ingredient="${item.ingredient}">
      <span>${label}</span>
    `;
    panel.appendChild(row);
  });
  panel.querySelectorAll("input").forEach(box => {
    box.addEventListener("change", e => {
      userOverrides[e.target.dataset.ingredient] = e.target.checked;
      renderMenu();
    });
  });
}

// --- Featured ---
function renderFeatured() {
  const featured = cocktails.find(c => c.featured === "TRUE");
  if (!featured) return;
  const name = currentLang === "en" ? featured.name_en : featured.name_zh;
  const tags = currentLang === "en" ? featured.tags_en : featured.tags_zh;
  document.getElementById("featuredCocktail").innerHTML = `
    <div class="featured">
      <div class="featured-label">★ ${currentLang === "en" ? "Tonight's Recommendation" : "今晚推荐"}</div>
      <div class="featured-illustration">
        ${drinkIllustration(featured.icon, name)}
      </div>
      <h3>${name}</h3>
      <div class="featured-tags">${tags.split("|").join(" • ")}</div>
    </div>
  `;
}

// --- Section + cards ---
function renderSection(title, drinks) {
  let html = `<h2 class="section-title">${title}</h2><div class="cards">`;
  drinks.forEach(cocktail => {
    const status = getStatus(cocktail);
    const name   = currentLang === "en" ? cocktail.name_en : cocktail.name_zh;
    const zhName = currentLang === "en" ? cocktail.name_zh : cocktail.name_en;
    const tags   = currentLang === "en" ? cocktail.tags_en : cocktail.tags_zh;

    const statusLabel = currentLang === "en"
      ? status.toUpperCase()
      : status === "available" ? "可供应"
      : status === "limited"   ? "部分可供应"
      : "暂不可供应";

    const origLabel  = currentLang === "en" ? "Original ABV" : "原始酒精度";
    const lightLabel = currentLang === "en" ? "Light ABV"    : "轻量版";

    const abvHtml = currentTheme === "botanical"
      ? `<div class="abv-row">
          <div class="abv-block abv-block--light">
            <span class="abv-label">${lightLabel}</span>
            <span class="abv-value">${cocktail.lighter_abv}%</span>
          </div>
          <div class="abv-block abv-block--orig">
            <span class="abv-label">${origLabel}</span>
            <span class="abv-value">${cocktail.original_abv}%</span>
          </div>
        </div>`
      : `<div class="abv-row">
          <div class="abv-block abv-block--orig">
            <span class="abv-label">${origLabel}</span>
            <span class="abv-value">${cocktail.original_abv}%</span>
          </div>
          <div class="abv-block abv-block--light">
            <span class="abv-label">${lightLabel}</span>
            <span class="abv-value">${cocktail.lighter_abv}%</span>
          </div>
        </div>`;

    const ingredientList = cocktail.ingredients
      .split("|")
      .map(i => `<li>${i.trim()}</li>`)
      .join("");

    const flipHint = currentLang === "en" ? "tap to see front" : "点击查看正面";
    const ingredientsLabel = currentLang === "en" ? "Ingredients" : "配料";

    html += `
      <div class="card-flip-wrap">
        <div class="card-flipper">

          <!-- FRONT -->
          <div class="card card-front">
            <div class="card-img-wrap">
              ${drinkIllustration(cocktail.icon, name)}
            </div>
            <h3>${name}</h3>
            <div class="card-zh">${zhName}</div>
            <div class="card-divider"></div>
            <div class="tags">${tags.split("|").join(" • ")}</div>
            ${abvHtml}
            <div class="status ${status}">${statusLabel}</div>
            <div class="flip-hint">🔄 ${currentLang === "en" ? "tap for ingredients" : "点击查看配料"}</div>
          </div>

          <!-- BACK -->
          <div class="card card-back">
            <div class="card-back-icon">${cocktail.icon}</div>
            <h3>${name}</h3>
            <div class="card-divider"></div>
            <div class="card-back-label">${ingredientsLabel}</div>
            <ul class="ingredients-list">${ingredientList}</ul>
            <div class="status ${status}">${statusLabel}</div>
            <div class="flip-hint">🔄 ${flipHint}</div>
          </div>

        </div>
      </div>
    `;
  });
  html += "</div>";
  return html;
}

function renderMenu() {
  renderFeatured();
  const easy     = cocktails.filter(c => c.strength_category === "Easy Drinking");
  const balanced = cocktails.filter(c => c.strength_category === "Balanced");
  const spirit   = cocktails.filter(c => c.strength_category === "Spirit Forward");

  const labels = {
    easy:     currentLang === "en" ? "🌿 Easy Drinking" : "🌿 清爽易饮",
    balanced: currentLang === "en" ? "✨ Balanced"       : "✨ 平衡协调",
    spirit:   currentLang === "en" ? "🌙 Spirit Forward" : "🌙 酒感浓郁",
  };

  document.getElementById("menu").innerHTML =
    renderSection(labels.easy, easy) +
    renderSection(labels.balanced, balanced) +
    renderSection(labels.spirit, spirit);

  // Attach flip on click for every card
  document.querySelectorAll(".card-flip-wrap").forEach(wrap => {
    wrap.addEventListener("click", () => {
      wrap.classList.toggle("flipped");
    });
  });
}

function render() {
  renderInventoryPanel();
  renderMenu();
}

// --- Theme decorations ---
const THEME_DECOS = {
  house: [
    // Art Deco — SVG fan ornaments, no emoji
    { content: "◆", top:"8%",  left:"2%",  size:"48px", rot:"-15deg" },
    { content: "◆", top:"18%", right:"2%", size:"40px", rot:"20deg"  },
    { content: "◇", top:"45%", left:"1%",  size:"56px", rot:"10deg"  },
    { content: "◇", top:"55%", right:"1%", size:"44px", rot:"-10deg" },
    { content: "✦", top:"72%", left:"2%",  size:"36px", rot:"0deg"   },
    { content: "✦", top:"80%", right:"2%", size:"32px", rot:"0deg"   },
    { content: "◆", bottom:"5%", left:"3%",size:"40px", rot:"30deg"  },
    { content: "◇", bottom:"8%",right:"3%",size:"52px", rot:"-20deg" },
  ],
  botanical: [
    { content:"🌸", top:"5%",   left:"1%",  size:"72px", rot:"-20deg" },
    { content:"🌿", top:"12%",  right:"1%", size:"64px", rot:"15deg"  },
    { content:"🌺", top:"35%",  left:"0%",  size:"68px", rot:"10deg"  },
    { content:"🍃", top:"50%",  right:"0%", size:"60px", rot:"-15deg" },
    { content:"🌼", top:"68%",  left:"1%",  size:"56px", rot:"25deg"  },
    { content:"🌱", top:"78%",  right:"1%", size:"52px", rot:"-10deg" },
    { content:"🌸", bottom:"4%",left:"2%",  size:"64px", rot:"30deg"  },
    { content:"🌿", bottom:"3%",right:"2%", size:"70px", rot:"-25deg" },
  ],
  tiki: [
    { content:"🌴", top:"3%",   left:"-1%", size:"80px", rot:"-20deg" },
    { content:"🌴", top:"3%",   right:"-1%",size:"80px", rot:"20deg"  },
    { content:"🌺", top:"28%",  left:"0%",  size:"64px", rot:"10deg"  },
    { content:"🌺", top:"28%",  right:"0%", size:"64px", rot:"-10deg" },
    { content:"🍍", top:"52%",  left:"0%",  size:"68px", rot:"-5deg"  },
    { content:"🥥", top:"52%",  right:"0%", size:"60px", rot:"5deg"   },
    { content:"🌊", top:"70%",  left:"1%",  size:"56px", rot:"0deg"   },
    { content:"🗿", top:"72%",  right:"1%", size:"60px", rot:"-5deg"  },
    { content:"🌴", bottom:"2%",left:"-1%", size:"76px", rot:"15deg"  },
    { content:"🌴", bottom:"2%",right:"-1%",size:"76px", rot:"-15deg" },
  ],
  halloween: [
    { content:"🎃", top:"5%",   left:"1%",  size:"68px", rot:"-10deg" },
    { content:"🦇", top:"5%",   right:"1%", size:"60px", rot:"15deg"  },
    { content:"👻", top:"30%",  left:"0%",  size:"64px", rot:"5deg"   },
    { content:"🕷️", top:"35%",  right:"0%", size:"52px", rot:"-5deg"  },
    { content:"🐈‍⬛",top:"58%",  left:"1%",  size:"60px", rot:"10deg"  },
    { content:"🕸️", top:"60%",  right:"0%", size:"56px", rot:"0deg"   },
    { content:"🎃", bottom:"5%",left:"2%",  size:"64px", rot:"20deg"  },
    { content:"🦇", bottom:"4%",right:"1%", size:"58px", rot:"-15deg" },
  ],
  christmas: [
    { content:"🎅", top:"4%",   left:"1%",  size:"68px", rot:"-10deg" },
    { content:"🎄", top:"4%",   right:"1%", size:"68px", rot:"8deg"   },
    { content:"❄️", top:"28%",  left:"0%",  size:"56px", rot:"0deg"   },
    { content:"🦌", top:"30%",  right:"0%", size:"64px", rot:"-5deg"  },
    { content:"⛄", top:"54%",  left:"1%",  size:"62px", rot:"5deg"   },
    { content:"🔔", top:"56%",  right:"1%", size:"54px", rot:"-10deg" },
    { content:"🎄", bottom:"4%",left:"1%",  size:"70px", rot:"12deg"  },
    { content:"❄️", bottom:"4%",right:"1%", size:"52px", rot:"0deg"   },
  ],
};

function renderThemeDecos() {
  const container = document.getElementById("themeDecos");
  if (!container) return;
  container.innerHTML = "";
  const decos = THEME_DECOS[currentTheme] || [];
  decos.forEach(d => {
    const el = document.createElement("div");
    el.className = "theme-deco";
    el.textContent = d.content;
    el.style.fontSize = d.size;
    el.style.transform = `rotate(${d.rot})`;
    if (d.top)    el.style.top    = d.top;
    if (d.bottom) el.style.bottom = d.bottom;
    if (d.left)   el.style.left   = d.left;
    if (d.right)  el.style.right  = d.right;
    container.appendChild(el);
  });
}


function buildThemeDropdown() {
  const wrapper = document.getElementById("themeDropdownWrap");
  const current = THEMES.find(t => t.id === currentTheme);

  wrapper.innerHTML = `
    <div class="theme-dropdown">
      <button class="theme-btn" id="themeToggleBtn">
        ${current.emoji} ${currentLang === "en" ? "Theme" : "主题"}
        <span class="theme-caret">▾</span>
      </button>
      <div class="theme-menu" id="themeMenu">
        ${THEMES.map(t => `
          <button class="theme-option ${t.id === currentTheme ? "active" : ""}" data-theme="${t.id}">
            ${t.label}
          </button>
        `).join("")}
      </div>
    </div>
  `;

  document.getElementById("themeToggleBtn").addEventListener("click", e => {
    e.stopPropagation();
    document.getElementById("themeMenu").classList.toggle("open");
  });

  document.querySelectorAll(".theme-option").forEach(btn => {
    btn.addEventListener("click", () => {
      currentTheme = btn.dataset.theme;
      document.documentElement.setAttribute("data-theme", currentTheme);
      document.getElementById("themeMenu").classList.remove("open");
      buildThemeDropdown();
      renderThemeDecos();
      renderMenu();
    });
  });

  document.addEventListener("click", () => {
    const menu = document.getElementById("themeMenu");
    if (menu) menu.classList.remove("open");
  });
}

// --- Init ---
async function init() {
  cocktails     = await loadCSV(MENU_URL);
  inventoryRows = await loadCSV(INVENTORY_URL);
  buildUsedIngredients();
  buildSheetsInventory();
  buildThemeDropdown();
  renderThemeDecos();
  render();

  // Language toggle
  document.getElementById("langBtn").addEventListener("click", () => {
    currentLang = currentLang === "en" ? "zh" : "en";
    document.getElementById("langBtn").textContent = currentLang === "en" ? "中文" : "English";
    buildThemeDropdown();
    render();
  });

  // Select All / Clear All
  document.getElementById("selectAllBtn").addEventListener("click", () => {
    inventoryRows.forEach(item => { userOverrides[item.ingredient] = true; });
    render();
  });
  document.getElementById("clearAllBtn").addEventListener("click", () => {
    inventoryRows.forEach(item => { userOverrides[item.ingredient] = false; });
    render();
  });
}

init();
