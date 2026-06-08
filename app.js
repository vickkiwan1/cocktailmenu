const MENU_URL =
  "https://docs.google.com/spreadsheets/d/1L3L0SwDp-z1PGGo-4OQx5H2JmJqrlcTNaoDhnNbA-1E/export?format=csv&gid=0";
const INVENTORY_URL =
  "https://docs.google.com/spreadsheets/d/1L3L0SwDp-z1PGGo-4OQx5H2JmJqrlcTNaoDhnNbA-1E/export?format=csv&gid=91507117";
const SETTINGS_URL =
  "https://docs.google.com/spreadsheets/d/1L3L0SwDp-z1PGGo-4OQx5H2JmJqrlcTNaoDhnNbA-1E/export?format=csv&gid=345601745";

const BASE_SPIRITS = new Set([
  "Vodka","Gunpowder Gin","Bacardi White Rum","Bacardi Gold Rum",
  "Banana Butter Rum","Captain Morgan Spiced Rum",
  "Lychee Liqueur","Elderflower Liqueur","Frangelico",
  "Cointreau","Cacao Liqueur","Campari","Kahlua",
  "Maker's Mark Whisky","Caruva Horchata","Iichiko Shochu",
]);

// Non-spirit ingredients that are so central to a drink they make it
// Unavailable (not just Limited) when missing
const SIGNATURE_INGREDIENTS = new Set([
  "Pandan Syrup",       // Pandan Coconut Milk Punch
  "Black Sesame Syrup", // Black Sesame Shochu
  "Kuromitsu",          // Black Sesame Shochu
  "Heavy Cream",        // Black Sesame Shochu — the cream float is the signature
  "Espresso",           // Black Sesame Shochu
  "Pumpkin Spice Syrup",// Pumpkin Spice Old Fashioned
]);

const THEMES = [
  { id: "house",     label: "🏛 Art Deco",  emoji: "🏛" },
  { id: "botanical", label: "🌿 Botanical", emoji: "🌿" },
];

// Tasting categories for Art Deco (house) theme
const TASTING_CATEGORIES = [
  { key: "Flower Market", emoji: "🌸", zh: "花卉市集" },
  { key: "Fruit Stall",   emoji: "🌴", zh: "热带果摊" },
  { key: "Dessert Counter",emoji: "🍫", zh: "甜品台"   },
  { key: "Spice Cabinet", emoji: "⚡", zh: "香料橱"   },
  { key: "Herb Garden",   emoji: "🌿", zh: "香草园"   },
];

// Seasonal theme config
const SEASONAL_THEMES = {
  tiki: {
    id: "tiki",
    label: "Tonight's Tiki Special",
    labelZh: "今晚提基特调",
    emoji: "🌺",
    decos: ["🌴","🌺","🍍","🥥","🌊"],
    bg: "#f0e6c0",
    bgDeep: "#e8d9a8",
    card: "rgba(255,250,225,0.92)",
    gold: "#c8860a",
    goldLight: "#ffd166",
    text: "#3a1a00",
    textMid: "#6a3a00",
    border: "#d4a843",
    font: "'Righteous', cursive",
  },
  halloween: {
    id: "halloween",
    label: "Halloween Specials",
    labelZh: "万圣节特调",
    emoji: "🎃",
    decos: ["🎃","👻","🦇","🕷️","🐈‍⬛"],
    bg: "#0d0d0d",
    bgDeep: "#1a0a00",
    card: "#1e1208",
    gold: "#ff6b00",
    goldLight: "#ff9a3c",
    text: "#f0d080",
    textMid: "#c8a050",
    border: "#ff6b00",
    font: "'Creepster', cursive",
  },
  christmas: {
    id: "christmas",
    label: "Christmas Specials",
    labelZh: "圣诞特调",
    emoji: "🎄",
    decos: ["🎅","🎄","❄️","🦌","⛄"],
    bg: "#faf5f0",
    bgDeep: "#fff8f5",
    card: "#fffcfa",
    gold: "#cc1a1a",
    goldLight: "#cc1a1a",
    text: "#1a0a08",
    textMid: "#5c1a10",
    border: "#cc1a1a",
    font: "'Mountains of Christmas', cursive",
  },
};

let currentLang     = "en";
let currentTheme    = "house";
let cocktails       = [];
let inventoryRows   = [];
let usedIngredients = new Set();
let sheetsInventory = {};
let userOverrides   = {};
let seasonalTheme   = "none"; // read from Settings sheet

// ── OpenMoji ─────────────────────────────────────────────────────────────────
function emojiToOpenMoji(emoji) {
  const codePoints = [...emoji]
    .map(e => e.codePointAt(0).toString(16).toUpperCase().padStart(4,"0"))
    .filter(cp => cp !== "FE0F");
  return `https://cdn.jsdelivr.net/gh/hfg-gmuend/openmoji@15.0.0/color/svg/${codePoints.join("-")}.svg`;
}

function drinkIllustration(emoji, name) {
  const url = emojiToOpenMoji(emoji);
  return `<img class="card-illustration" src="${url}" alt="${name}"
    onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
    <span class="card-icon-fallback" style="display:none">${emoji}</span>`;
}

// ── CSV ───────────────────────────────────────────────────────────────────────
async function loadCSV(url) {
  const res  = await fetch(url);
  const text = await res.text();
  return Papa.parse(text, { header: true, skipEmptyLines: true }).data;
}

function buildUsedIngredients() {
  usedIngredients = new Set();
  cocktails.forEach(c => c.ingredients.split("|").forEach(i => usedIngredients.add(i.trim())));
}

function buildSheetsInventory() {
  sheetsInventory = {};
  inventoryRows.forEach(item => { sheetsInventory[item.ingredient] = item.available === "TRUE"; });
}

function isIngredientAvailable(ing) {
  return userOverrides[ing] !== undefined ? userOverrides[ing] : sheetsInventory[ing] === true;
}

function getStatus(cocktail) {
  const ings = cocktail.ingredients.split("|").map(i => i.trim());
  // Missing any base spirit OR signature ingredient = Unavailable
  const missingCritical = ings.filter(i =>
    (BASE_SPIRITS.has(i) || SIGNATURE_INGREDIENTS.has(i)) && !isIngredientAvailable(i)
  );
  if (missingCritical.length > 0) return "unavailable";
  // Missing a regular mixer = Limited
  if (ings.filter(i => !BASE_SPIRITS.has(i) && !SIGNATURE_INGREDIENTS.has(i) && !isIngredientAvailable(i)).length > 0) return "limited";
  return "available";
}

// ── Inventory panel ───────────────────────────────────────────────────────────
function renderInventoryPanel() {
  const panel = document.getElementById("inventoryList");
  panel.innerHTML = "";
  inventoryRows
    .filter(item => usedIngredients.has(item.ingredient))
    .forEach(item => {
      const row = document.createElement("div");
      row.className = "inventory-item";
      const label = currentLang === "en" ? item.ingredient : item.name_zh;
      row.innerHTML = `<input type="checkbox" ${isIngredientAvailable(item.ingredient) ? "checked" : ""}
        data-ingredient="${item.ingredient}"><span>${label}</span>`;
      panel.appendChild(row);
    });
  panel.querySelectorAll("input").forEach(box => {
    box.addEventListener("change", e => {
      userOverrides[e.target.dataset.ingredient] = e.target.checked;
      renderMenu();
    });
  });
}

// ── Card builder ──────────────────────────────────────────────────────────────
function buildCard(cocktail) {
  const status   = getStatus(cocktail);
  const name     = currentLang === "en" ? cocktail.name_en : cocktail.name_zh;
  const zhName   = currentLang === "en" ? cocktail.name_zh : cocktail.name_en;
  const tags     = currentLang === "en" ? cocktail.tags_en : cocktail.tags_zh;
  const origLbl  = currentLang === "en" ? "Original ABV" : "原始酒精度";
  const lightLbl = currentLang === "en" ? "Light ABV"    : "轻量版";
  const flipHint = currentLang === "en" ? "tap to see front" : "点击查看正面";
  const ingLbl   = currentLang === "en" ? "Ingredients"  : "配料";
  const statusLabel = currentLang === "en"
    ? status.toUpperCase()
    : status === "available" ? "可供应" : status === "limited" ? "部分可供应" : "暂不可供应";

  const abvHtml = currentTheme === "botanical"
    ? `<div class="abv-row">
        <div class="abv-block abv-block--light"><span class="abv-label">${lightLbl}</span><span class="abv-value">${cocktail.lighter_abv}%</span></div>
        <div class="abv-block abv-block--orig"><span class="abv-label">${origLbl}</span><span class="abv-value">${cocktail.original_abv}%</span></div>
       </div>`
    : `<div class="abv-row">
        <div class="abv-block abv-block--orig"><span class="abv-label">${origLbl}</span><span class="abv-value">${cocktail.original_abv}%</span></div>
        <div class="abv-block abv-block--light"><span class="abv-label">${lightLbl}</span><span class="abv-value">${cocktail.lighter_abv}%</span></div>
       </div>`;

  const ingList = cocktail.ingredients.split("|").map(i => `<li>${i.trim()}</li>`).join("");

  // Upgrade badges
  const bbrBadge = cocktail.bbr_upgrade === "TRUE"
    ? `<div class="upgrade-badge upgrade-bbr">
         🍌 ${currentLang === "en"
           ? "Banana Butter Rum edition available — ask your bartender"
           : "香蕉奶油朗姆版本可供应 — 请询问调酒师"}
       </div>` : "";

  const chocBadge = cocktail.choc_upgrade === "TRUE"
    ? `<div class="upgrade-badge upgrade-choc">
         🍫 ${currentLang === "en"
           ? "Chocolate Mai Tai upgrade available — ask your bartender"
           : "巧克力迈泰升级版可供应 — 请询问调酒师"}
       </div>` : "";

  const velvetBadge = cocktail.velvet_upgrade === "TRUE"
    ? `<div class="upgrade-badge upgrade-velvet">
         🍇 ${currentLang === "en"
           ? "Velvet Orchard upgrade — add Lychee Liqueur, ask your bartender"
           : "丝绒果园升级版 — 加入荔枝利口酒，请询问调酒师"}
       </div>` : "";

  return `
    <div class="card-flip-wrap">
      <div class="card-flipper">
        <div class="card card-front">
          <div class="card-img-wrap">${drinkIllustration(cocktail.icon, name)}</div>
          <h3>${name}</h3>
          <div class="card-zh">${zhName}</div>
          <div class="card-divider"></div>
          <div class="tags">${tags.split("|").join(" • ")}</div>
          ${abvHtml}
          <div class="status ${status}">${statusLabel}</div>
          ${bbrBadge}${chocBadge}${velvetBadge}
          <div class="flip-hint">🔄 ${currentLang === "en" ? "tap for ingredients" : "点击查看配料"}</div>
        </div>
        <div class="card card-back">
          <div class="card-back-icon">${cocktail.icon}</div>
          <h3>${name}</h3>
          <div class="card-divider"></div>
          <div class="card-back-label">${ingLbl}</div>
          <ul class="ingredients-list">${ingList}</ul>
          <div class="status ${status}">${statusLabel}</div>
          <div class="flip-hint">🔄 ${flipHint}</div>
        </div>
      </div>
    </div>`;
}

function attachFlipHandlers() {
  document.querySelectorAll(".card-flip-wrap").forEach(wrap => {
    if (wrap.dataset.flipBound) return; // already bound, skip
    wrap.dataset.flipBound = "1";
    wrap.addEventListener("click", () => wrap.classList.toggle("flipped"));
  });
}

// ── Section renderer ──────────────────────────────────────────────────────────
function renderSection(title, drinks) {
  if (!drinks.length) return "";
  return `<h2 class="section-title">${title}</h2>
    <div class="cards">${drinks.map(buildCard).join("")}</div>`;
}

// ── Featured ──────────────────────────────────────────────────────────────────
function renderFeatured() {
  const featured = cocktails.find(c => c.featured === "TRUE");
  if (!featured) return;
  const name = currentLang === "en" ? featured.name_en : featured.name_zh;
  const tags = currentLang === "en" ? featured.tags_en : featured.tags_zh;
  document.getElementById("featuredCocktail").innerHTML = `
    <div class="featured">
      <div class="featured-label">★ ${currentLang === "en" ? "Tonight's Recommendation" : "今晚推荐"}</div>
      <div class="featured-illustration">${drinkIllustration(featured.icon, name)}</div>
      <h3>${name}</h3>
      <div class="featured-tags">${tags.split("|").join(" • ")}</div>
    </div>`;
}

// ── Seasonal section (shown below featured on house/botanical) ────────────────
function renderSeasonalSection() {
  const container = document.getElementById("seasonalSection");
  if (!container) return;

  if (seasonalTheme === "none" || !SEASONAL_THEMES[seasonalTheme]) {
    container.innerHTML = "";
    return;
  }

  const cfg = SEASONAL_THEMES[seasonalTheme];
  const drinks = cocktails.filter(c =>
    c.theme_tag && c.theme_tag.split(",").map(t => t.trim()).includes(cfg.id)
  );
  if (!drinks.length) { container.innerHTML = ""; return; }

  const label = currentLang === "en" ? cfg.label : cfg.labelZh;

  // Build theme-specific header decorations
  let headerHtml = "";
  let cornerHtml = "";

  if (cfg.id === "tiki") {
    cornerHtml = `
      <div class="seasonal-corner" style="top:-6px;left:-6px;transform:rotate(-20deg)">🌴</div>
      <div class="seasonal-corner" style="top:-6px;right:-6px;transform:rotate(20deg)">🌴</div>
      <div class="seasonal-corner" style="top:42%;left:-8px;transform:rotate(10deg)">🌺</div>
      <div class="seasonal-corner" style="top:42%;right:-8px;transform:rotate(-10deg)">🌺</div>
      <div class="seasonal-corner" style="bottom:-6px;left:18%;font-size:36px">🍍</div>
      <div class="seasonal-corner" style="bottom:-6px;right:18%;font-size:36px">🥥</div>`;
    headerHtml = `
      <h2 class="seasonal-title">🌺 ${label} 🌺</h2>
      <div class="seasonal-bamboo-rule">
        <div class="seasonal-bamboo-line"></div>
        <div class="seasonal-bamboo-emoji">🗿</div>
        <div class="seasonal-bamboo-line"></div>
      </div>`;

  } else if (cfg.id === "halloween") {
    cornerHtml = `
      <div class="seasonal-corner" style="top:4px;left:4px">🎃</div>
      <div class="seasonal-corner" style="top:4px;right:4px">🦇</div>
      <div class="seasonal-corner" style="bottom:4px;left:4px">🕷️</div>
      <div class="seasonal-corner" style="bottom:4px;right:4px">👻</div>`;
    headerHtml = `
      <h2 class="seasonal-title">🎃 ${label} 🎃</h2>
      <div class="seasonal-sub">${currentLang === "en" ? "dare to drink" : "胆大才能喝"}</div>`;

  } else if (cfg.id === "christmas") {
    cornerHtml = `
      <div class="seasonal-corner" style="top:-6px;left:-6px;transform:rotate(-15deg)">🎄</div>
      <div class="seasonal-corner" style="top:-6px;right:-6px;transform:rotate(15deg)">🎅</div>
      <div class="seasonal-corner" style="bottom:-6px;left:-6px;transform:rotate(10deg)">⛄</div>
      <div class="seasonal-corner" style="bottom:-6px;right:-6px;transform:rotate(-10deg)">🦌</div>`;
    headerHtml = `
      <div class="seasonal-snowflakes">
        ${"<span>❄</span>".repeat(9)}
      </div>
      <h2 class="seasonal-title">🎄 ${label} 🎄</h2>
      <div class="seasonal-holly">🍒 🌿 🍒 🌿 🍒</div>`;
  }

  container.innerHTML = `
    <div class="seasonal-section seasonal-${cfg.id}">
      ${cornerHtml}
      ${headerHtml}
      <div class="cards">${drinks.map(buildCard).join("")}</div>
    </div>`;
  // flip handlers attached by renderMenu after all sections are rendered
}

// ── Main menu renderer ────────────────────────────────────────────────────────
function renderMenu() {
  renderFeatured();
  renderSeasonalSection();

  // Filter out seasonal-only drinks from main menu
  // Seasonal theme drinks (tagged only with tiki/halloween/christmas) stay in seasonal section
  const seasonalOnlyTags = new Set(["tiki","halloween","christmas"]);
  const mainDrinks = cocktails.filter(c => {
    const tags = c.theme_tag ? c.theme_tag.split(",").map(t => t.trim()) : [];
    // Include if it has house, botanical, light, or summer tag
    return tags.some(t => ["house","botanical","light","summer"].includes(t));
  });

  let menuHtml = "";

  if (currentTheme === "house") {
    // Art Deco: group by tasting_category
    TASTING_CATEGORIES.forEach(cat => {
      const drinks = mainDrinks.filter(c => c.tasting_category === cat.key);
      if (!drinks.length) return;
      const title = `${cat.emoji} ${currentLang === "en" ? cat.key : cat.zh}`;
      menuHtml += renderSection(title, drinks);
    });
  } else {
    // All other themes: group by strength_category
    const easy     = mainDrinks.filter(c => c.strength_category === "Easy Drinking");
    const balanced = mainDrinks.filter(c => c.strength_category === "Balanced");
    const spirit   = mainDrinks.filter(c => c.strength_category === "Spirit Forward");
    menuHtml +=
      renderSection(currentLang === "en" ? "🌿 Easy Drinking" : "🌿 清爽易饮", easy) +
      renderSection(currentLang === "en" ? "✨ Balanced"       : "✨ 平衡协调", balanced) +
      renderSection(currentLang === "en" ? "🌙 Spirit Forward" : "🌙 酒感浓郁", spirit);
  }

  document.getElementById("menu").innerHTML = menuHtml;
  attachFlipHandlers();
}

function render() {
  renderInventoryPanel();
  renderMenu();
}

// ── Theme decorations ─────────────────────────────────────────────────────────
const THEME_DECOS = {
  house: [
    { content:"◆", top:"8%",   left:"2%",  size:"48px", rot:"-15deg" },
    { content:"◆", top:"18%",  right:"2%", size:"40px", rot:"20deg"  },
    { content:"◇", top:"45%",  left:"1%",  size:"56px", rot:"10deg"  },
    { content:"◇", top:"55%",  right:"1%", size:"44px", rot:"-10deg" },
    { content:"✦", top:"72%",  left:"2%",  size:"36px", rot:"0deg"   },
    { content:"✦", top:"80%",  right:"2%", size:"32px", rot:"0deg"   },
    { content:"◆", bottom:"5%",left:"3%",  size:"40px", rot:"30deg"  },
    { content:"◇", bottom:"8%",right:"3%", size:"52px", rot:"-20deg" },
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
  (THEME_DECOS[currentTheme] || []).forEach(d => {
    const el = document.createElement("div");
    el.className = "theme-deco";
    el.textContent = d.content;
    el.style.cssText = `font-size:${d.size};transform:rotate(${d.rot});`;
    if (d.top)    el.style.top    = d.top;
    if (d.bottom) el.style.bottom = d.bottom;
    if (d.left)   el.style.left   = d.left;
    if (d.right)  el.style.right  = d.right;
    container.appendChild(el);
  });
}

// ── Theme dropdown — house/botanical only ─────────────────────────────────────
function buildThemeDropdown() {
  const wrapper = document.getElementById("themeDropdownWrap");
  const current = THEMES.find(t => t.id === currentTheme) || THEMES[0];
  wrapper.innerHTML = `
    <div class="theme-dropdown">
      <button class="theme-btn" id="themeToggleBtn">
        ${current.emoji} ${currentLang === "en" ? "Theme" : "主题"} <span class="theme-caret">▾</span>
      </button>
      <div class="theme-menu" id="themeMenu">
        ${THEMES.map(t => `
          <button class="theme-option ${t.id === currentTheme ? "active" : ""}" data-theme="${t.id}">
            ${t.label}
          </button>`).join("")}
      </div>
    </div>`;

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
    const m = document.getElementById("themeMenu");
    if (m) m.classList.remove("open");
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Load menu and inventory in parallel
  [cocktails, inventoryRows] = await Promise.all([
    loadCSV(MENU_URL),
    loadCSV(INVENTORY_URL),
  ]);

  // Try to load settings for seasonal theme
  try {
    const settings = await loadCSV(SETTINGS_URL);
    const row = settings.find(r => r.key === "seasonal_theme");
    if (row && row.value) seasonalTheme = row.value.trim().toLowerCase();
  } catch(e) {
    seasonalTheme = "none";
  }

  buildUsedIngredients();
  buildSheetsInventory();
  buildThemeDropdown();
  renderThemeDecos();
  render();

  document.getElementById("langBtn").addEventListener("click", () => {
    currentLang = currentLang === "en" ? "zh" : "en";
    document.getElementById("langBtn").textContent = currentLang === "en" ? "中文" : "English";
    buildThemeDropdown();
    render();
  });

  document.getElementById("selectAllBtn").addEventListener("click", () => {
    inventoryRows.forEach(i => { userOverrides[i.ingredient] = true; });
    render();
  });
  document.getElementById("clearAllBtn").addEventListener("click", () => {
    inventoryRows.forEach(i => { userOverrides[i.ingredient] = false; });
    render();
  });
}

init();
