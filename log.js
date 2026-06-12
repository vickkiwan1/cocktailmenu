const MENU_URL =
  "https://docs.google.com/spreadsheets/d/1L3L0SwDp-z1PGGo-4OQx5H2JmJqrlcTNaoDhnNbA-1E/export?format=csv&gid=0";

const STORAGE_KEY = "cocktail_drink_log";
const LAST_EXPORT_KEY = "cocktail_last_export";

let cocktails = [];
let logs = [];
let editingId = null;
let currentRating = 0;
let currentMood = "";
let currentPhoto = null; // base64

// ── Load / Save ───────────────────────────────────────────────────────────────
function loadLogs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    logs = raw ? JSON.parse(raw) : [];
  } catch(e) { logs = []; }
}

function saveLogs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  updateExportHint();
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Export hint ───────────────────────────────────────────────────────────────
function updateExportHint() {
  const hint = document.getElementById("exportHint");
  if (!hint) return;
  const lastExport = localStorage.getItem(LAST_EXPORT_KEY);
  if (!lastExport) {
    hint.textContent = logs.length > 0
      ? `${logs.length} entries saved locally — export for backup`
      : "";
    return;
  }
  const days = Math.floor((Date.now() - parseInt(lastExport)) / 86400000);
  hint.textContent = days === 0
    ? `Exported today · ${logs.length} entries`
    : `Last exported ${days} day${days > 1 ? "s" : ""} ago · ${logs.length} entries`;
}

// ── CSV loading ───────────────────────────────────────────────────────────────
async function loadMenuDrinks() {
  const res  = await fetch(MENU_URL);
  const text = await res.text();
  cocktails  = Papa.parse(text, { header: true, skipEmptyLines: true }).data;
  populateDrinkSelectors();
}

function populateDrinkSelectors() {
  // Main menu drinks only (house/light/botanical tagged)
  const mainDrinks = cocktails.filter(c => {
    const tags = c.theme_tag ? c.theme_tag.split(",").map(t => t.trim()) : [];
    return tags.some(t => ["house","botanical","light","summer"].includes(t));
  });

  const filterSel = document.getElementById("filterDrink");
  const entrySel  = document.getElementById("entryDrink");

  mainDrinks.forEach(c => {
    const opt1 = new Option(`${c.icon} ${c.name_en}`, c.name_en);
    const opt2 = new Option(`${c.icon} ${c.name_en}`, c.name_en);
    filterSel.appendChild(opt1);
    entrySel.appendChild(opt2);
  });
}

// ── Render log list ───────────────────────────────────────────────────────────
function renderLogs() {
  const filterDrink  = document.getElementById("filterDrink").value;
  const filterRating = parseInt(document.getElementById("filterRating").value) || 0;

  let filtered = logs.filter(l => {
    if (filterDrink  && l.drink   !== filterDrink)      return false;
    if (filterRating && l.rating  <  filterRating)      return false;
    return true;
  }).sort((a,b) => b.timestamp - a.timestamp);

  // Stats
  const statsEl = document.getElementById("logStats");
  statsEl.textContent = filtered.length === logs.length
    ? `${logs.length} total entries`
    : `${filtered.length} of ${logs.length} entries`;

  const list = document.getElementById("logList");

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="log-empty">
        <div class="log-empty-icon">🍹</div>
        <div class="log-empty-text">No entries yet</div>
        <div class="log-empty-sub">Tap + New Entry to log your first drink</div>
      </div>`;
    return;
  }

  // Group by month
  const groups = {};
  filtered.forEach(entry => {
    const d   = new Date(entry.timestamp);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const lbl = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!groups[key]) groups[key] = { label: lbl, entries: [] };
    groups[key].entries.push(entry);
  });

  list.innerHTML = Object.values(groups).map(group => `
    <div class="log-month-header">${group.label}</div>
    ${group.entries.map(entry => renderEntry(entry)).join("")}
  `).join("");

  // Attach edit/delete handlers
  list.querySelectorAll(".log-entry-edit").forEach(btn => {
    btn.addEventListener("click", () => openModal(btn.dataset.id));
  });
  list.querySelectorAll(".log-entry-delete").forEach(btn => {
    btn.addEventListener("click", () => deleteEntry(btn.dataset.id));
  });
}

function renderEntry(entry) {
  const stars = "★".repeat(entry.rating) + "☆".repeat(5 - entry.rating);
  const date  = new Date(entry.timestamp).toLocaleDateString("en-US",
    { month: "short", day: "numeric", year: "numeric" });

  const drink = cocktails.find(c => c.name_en === entry.drink);
  const icon  = drink ? drink.icon : "🍹";

  const photoHtml = entry.photo
    ? `<img class="log-entry-photo" src="${entry.photo}" alt="drink photo">`
    : "";

  const moodHtml = entry.mood
    ? `<span class="log-entry-mood">${entry.mood}</span>`
    : "";

  const tweaksHtml = entry.tweaks
    ? `<div class="log-entry-tweaks">🔧 ${entry.tweaks}</div>`
    : "";

  return `
    <div class="log-entry" data-id="${entry.id}">
      <div class="log-entry-top">
        <span class="log-entry-icon">${icon}</span>
        <div class="log-entry-info">
          <div class="log-entry-name">${entry.drink}</div>
          <div class="log-entry-meta">${date} · ${entry.version || "Original"}</div>
        </div>
        <div class="log-entry-stars">${stars}</div>
      </div>
      ${moodHtml}
      ${entry.notes ? `<div class="log-entry-notes">"${entry.notes}"</div>` : ""}
      ${tweaksHtml}
      ${photoHtml}
      <div class="log-entry-actions">
        <button class="log-entry-edit" data-id="${entry.id}">Edit</button>
        <button class="log-entry-delete" data-id="${entry.id}">Delete</button>
      </div>
    </div>`;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(editId = null) {
  editingId     = editId;
  currentRating = 0;
  currentMood   = "";
  currentPhoto  = null;

  document.getElementById("logModal").style.display = "flex";
  document.getElementById("entryDate").value =
    new Date().toISOString().split("T")[0];

  if (editId) {
    const entry = logs.find(l => l.id === editId);
    if (!entry) return;
    document.getElementById("modalTitle").textContent = `📓 Edit: ${entry.drink}`;
    document.getElementById("entryDrink").value   = entry.drink;
    document.getElementById("entryDate").value    = new Date(entry.timestamp).toISOString().split("T")[0];
    document.getElementById("entryVersion").value = entry.version || "Original";
    document.getElementById("entryNotes").value   = entry.notes  || "";
    document.getElementById("entryTweaks").value  = entry.tweaks || "";
    currentRating = entry.rating || 0;
    currentMood   = entry.mood   || "";
    currentPhoto  = entry.photo  || null;

    if (currentPhoto) {
      document.getElementById("photoPreview").innerHTML =
        `<img src="${currentPhoto}" class="log-photo-thumb">`;
    }
  } else {
    document.getElementById("modalTitle").textContent = "📓 Log a Drink";
    document.getElementById("entryDrink").selectedIndex = 0;
    document.getElementById("entryNotes").value  = "";
    document.getElementById("entryTweaks").value = "";
    document.getElementById("photoPreview").innerHTML = "";
  }

  updateStars();
  updateMoodChips();
}

function closeModal() {
  document.getElementById("logModal").style.display = "none";
  editingId = null;
}

function updateStars() {
  document.querySelectorAll(".log-star").forEach(s => {
    s.classList.toggle("active", parseInt(s.dataset.val) <= currentRating);
  });
}

function updateMoodChips() {
  document.querySelectorAll(".log-mood-chip").forEach(c => {
    c.classList.toggle("active", c.dataset.mood === currentMood);
  });
}

function saveEntry() {
  const drink   = document.getElementById("entryDrink").value;
  const dateVal = document.getElementById("entryDate").value;
  const version = document.getElementById("entryVersion").value;
  const notes   = document.getElementById("entryNotes").value.trim();
  const tweaks  = document.getElementById("entryTweaks").value.trim();

  if (!drink) { alert("Please select a drink."); return; }

  const timestamp = dateVal ? new Date(dateVal).getTime() : Date.now();

  if (editingId) {
    const idx = logs.findIndex(l => l.id === editingId);
    if (idx !== -1) {
      logs[idx] = { ...logs[idx], drink, timestamp, version, rating: currentRating,
        notes, tweaks, mood: currentMood, photo: currentPhoto };
    }
  } else {
    logs.push({ id: generateId(), drink, timestamp, version,
      rating: currentRating, notes, tweaks, mood: currentMood, photo: currentPhoto });
  }

  saveLogs();
  closeModal();
  renderLogs();
}

function deleteEntry(id) {
  if (!confirm("Delete this log entry?")) return;
  logs = logs.filter(l => l.id !== id);
  saveLogs();
  renderLogs();
}

// ── Photo handler ─────────────────────────────────────────────────────────────
function handlePhoto(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    // Compress to max 800px wide
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxW = 800;
      const scale = Math.min(1, maxW / img.width);
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      currentPhoto = canvas.toDataURL("image/jpeg", 0.75);
      document.getElementById("photoPreview").innerHTML =
        `<img src="${currentPhoto}" class="log-photo-thumb">`;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ── Export / Import ───────────────────────────────────────────────────────────
function exportJson() {
  const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `cocktail-log-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  localStorage.setItem(LAST_EXPORT_KEY, Date.now().toString());
  updateExportHint();
}

function exportCsv() {
  const headers = ["id","drink","date","version","rating","mood","notes","tweaks"];
  const rows = logs.map(l => [
    l.id,
    l.drink,
    new Date(l.timestamp).toLocaleDateString("en-US"),
    l.version || "Original",
    l.rating  || 0,
    l.mood    || "",
    (l.notes  || "").replace(/,/g,"；"),
    (l.tweaks || "").replace(/,/g,"；"),
  ]);
  const csv  = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `cocktail-log-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  localStorage.setItem(LAST_EXPORT_KEY, Date.now().toString());
  updateExportHint();
}

function importJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) throw new Error("Invalid format");
      const existing = new Set(logs.map(l => l.id));
      const newEntries = imported.filter(l => !existing.has(l.id));
      logs = [...logs, ...newEntries];
      saveLogs();
      renderLogs();
      alert(`Imported ${newEntries.length} new entries.`);
    } catch(err) {
      alert("Import failed — invalid JSON file.");
    }
  };
  reader.readAsText(file);
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  loadLogs();
  await loadMenuDrinks();
  renderLogs();
  updateExportHint();

  // Auto-open modal if ?drink=... param present
  const params = new URLSearchParams(window.location.search);
  const prefDrink = params.get("drink");
  if (prefDrink) {
    openModal();
    const sel = document.getElementById("entryDrink");
    if ([...sel.options].some(o => o.value === prefDrink)) {
      sel.value = prefDrink;
    }
  }

  // New entry button
  document.getElementById("newEntryBtn").addEventListener("click", () => openModal());

  // Modal close
  document.getElementById("modalClose").addEventListener("click",  closeModal);
  document.getElementById("cancelEntry").addEventListener("click", closeModal);
  document.getElementById("logModal").addEventListener("click", e => {
    if (e.target.id === "logModal") closeModal();
  });

  // Save
  document.getElementById("saveEntry").addEventListener("click", saveEntry);

  // Stars
  document.querySelectorAll(".log-star").forEach(s => {
    s.addEventListener("click", () => {
      currentRating = parseInt(s.dataset.val);
      updateStars();
    });
  });

  // Mood chips
  document.querySelectorAll(".log-mood-chip").forEach(c => {
    c.addEventListener("click", () => {
      currentMood = currentMood === c.dataset.mood ? "" : c.dataset.mood;
      updateMoodChips();
    });
  });

  // Photos
  document.getElementById("photoCapture").addEventListener("change", e => handlePhoto(e.target.files[0]));
  document.getElementById("photoGallery").addEventListener("change", e => handlePhoto(e.target.files[0]));

  // Filters
  document.getElementById("filterDrink").addEventListener("change",  renderLogs);
  document.getElementById("filterRating").addEventListener("change", renderLogs);

  // Export / import
  document.getElementById("exportJson").addEventListener("click", exportJson);
  document.getElementById("exportCsv").addEventListener("click",  exportCsv);
  document.getElementById("importFile").addEventListener("change", e => importJson(e.target.files[0]));
}

init();
