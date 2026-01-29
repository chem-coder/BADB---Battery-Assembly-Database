// "Lab Logbook" for RENERA: Lab KhIT
// by Dalia K. Maraoulaite, Senior Scientist; EMail; Phone
// November 10, 2025
//
// The JavaScript file is the controller between the HTML form (UI) and the JSON data (storage):
//
// User -> HTML -> JS logic -> JSON data
// JSON data -> JS Logic -> HTML form
//
// Core purposes of this Javascript file:
// 
// 1. Data collection
// Read all user inputs and build a structured object (updateJSON()), then:
// Save it to localStorage for autosave.
// Export it as a .json file for download.
// 
// 2. Rehydration
// Load existing JSON (from autosave or uploaded file) and repopulate form fields so users can continue editing.
//
// 3. Automation and feedback
// Handle small mechanics that make the form interactive:
// - Autosave on input and show “Сохранение…” / “Все изменения сохранены.”
// - Debounce updates so typing doesn’t save on every keystroke.
// - Add “Other” fields dynamically when users select special options.
// - Trigger downloads when “Save” is pressed.
// 
// 4. Validation and normalization
// Check that numbers, units, and required fields make sense before saving.

// --- DATE ---
const getDate = () => {
	const d = new Date();
	const pad = n => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
};

// --- AUTOSAVE STATUS ---
let isSyncingUI = false;

const PAGE = document.body.dataset.page;
const DRAFT_KEY = `cellDraft:${PAGE}`;

function getBALFormFactor() {
  if (PAGE !== "BAL") return "";
  const ffSelect = document.getElementById("form-factor");
  return ffSelect ? ffSelect.value : "";
}

function isCoinFormFactor(ff) {
  return ff === "half2032" || ff === "full2032";
}

function isGeometryCompatibleWithFormFactor(obj, fileName) {
  const ff = getBALFormFactor();
  if (!ff) {
    // Форм-фактор не выбран — пока ничего не запрещаем
    return true;
  }

  const shape = (obj["etrode-shape"] || "").toLowerCase();
  const nameLower = (fileName || "").toLowerCase();

  const isCoin = isCoinFormFactor(ff);
  const hasCoinTag = nameLower.includes("coin");
  const hasRectTag = nameLower.includes("rect");

  if (isCoin) {
    // монеты: круглая геометрия + "coin" в имени
    if (shape && shape !== "circle") return false;
    if (!hasCoinTag) return false;
    return true;
  }

  // все НЕ-монетные форм-факторы → требуем прямоугольные электроды
  if (shape && shape !== "rectangle") return false;
  if (!hasRectTag) return false;

  return true;
}


// --- DISPLAY LOADED FILE NAME ON COMPONENT PAGES ---
const loadedFileNameEl = document.getElementById("loaded-file-name");
const loadedFileContainer = document.getElementById("loaded-file-container");

function showLoadedFileName(name) {
  if (!loadedFileNameEl || !loadedFileContainer) return;

  if (name) {
    loadedFileNameEl.textContent = name;
    loadedFileContainer.style.display = "block";
  } else {
    loadedFileNameEl.textContent = "";
    loadedFileContainer.style.display = "none";
  }
}

let cathodeInfo = null;
let anodeInfo = null;
let electrolyteInfo = null;
let separatorInfo = null;

let cathodeFileVersion = 1;
let anodeFileVersion = 1;

// --- PAGE-SPECIFIC RECIPE CONFIG ---
const RECIPE_PREFIX =
  PAGE === "cathode" ? "cathode-recipe" :
  PAGE === "anode"   ? "anode-recipe"   :
  "recipe";

const RECIPE_ROWS_ID =
  PAGE === "cathode" ? "cathode-recipe-rows" :
  PAGE === "anode"   ? "anode-recipe-rows"   :
  "recipe-rows";

const ACTUAL_ROWS_ID =
  PAGE === "cathode" ? "cathode-actual-rows" :
  PAGE === "anode"   ? "anode-actual-rows"   :
  "actual-rows";

const ADD_RECIPE_BTN_ID =
  PAGE === "cathode" ? "add-cathode-recipe-row" :
  PAGE === "anode"   ? "add-anode-recipe-row"   :
  "add-recipe-row";

const RECIPE_ROW_CLASS =
  PAGE === "cathode" ? "cathode-recipe-row" :
  PAGE === "anode"   ? "anode-recipe-row"   :
  "recipe-row";

const SAVING_MESSAGE = "Сохранение...";
const SAVED_MESSAGE  = "Все изменения сохранены.";

const autosaveEls = Array.from(document.querySelectorAll(".autosave-message"));
const setStatus = (text, isSaving) => {
  autosaveEls.forEach(el => {
    el.textContent = text;
    el.classList.toggle("autosave-message--saving", !!isSaving);
  });
};


// ------- STACK SELECTION STATE (BAL, Model B) -------
// Each cathode electrode: { index: 1, cup: "11", mass: 3.004 }
let availableCathodes = [];
let availableAnodes = []; // placeholder for future

// These are what go into the BAL JSON (Model B)
let stackCathodeDetail = [];
let stackAnodeDetail = [];

// ---- PARSE ELECTRODES FROM JSON KEYS ----
// Parse electrodes from flat JSON (keys like cathode[0][m] and anode[0][m])
function parseElectrodesFromData(data) {
  const buckets = {};
  
  for (const [key, value] of Object.entries(data)) {
    const m = key.match(/^etrode\[(\d+)]\[(.+)]$/);
    if (!m) continue;
    const idx = Number(m[1]);
    const field = m[2];
    if (!buckets[idx]) buckets[idx] = {};
    buckets[idx][field] = value;
  }

  const rows = Object.keys(buckets)
    .map(k => Number(k))
    .sort((a, b) => a - b)
    .map(idx => {
      const row = buckets[idx];
      const noRaw   = row["etrode-No"];
      const cupRaw  = row["cup-No"];
      const massRaw = row["m"];

      const iNum    = noRaw !== undefined && noRaw !== "" ? Number(noRaw) : idx + 1;
      const massNum = massRaw !== undefined && massRaw !== "" ? Number(massRaw) : NaN;
      const status  = row["status"] ?? "free";

      return {
        index: isNaN(iNum) ? idx + 1 : iNum,
        cup: cupRaw ?? "",
        mass: massNum,
        status
      };
    })
    .filter(r => !isNaN(r.mass));

  rows.sort((a, b) => a.mass - b.mass);
  return rows;
}

function loadCathodeElectrodesFromData(data) {
  availableCathodes = parseElectrodesFromData(data);
  renderStackCheckboxes();
}

function loadAnodeElectrodesFromData(data) {
  availableAnodes = parseElectrodesFromData(data);
  renderStackCheckboxes();
}





// Build a cloned cathode/anode JSON with selected electrodes marked as "used".
// componentInfo – cathodeInfo / anodeInfo
// stackDetail   – stackCathodeDetail / stackAnodeDetail (array of { i, cup, mass })
function buildUpdatedComponent(componentInfo, stackDetail) {
  if (!componentInfo || !Array.isArray(stackDetail) || !stackDetail.length) {
    return null;
  }

  // Deep clone so we don't mutate cathodeInfo / anodeInfo in memory
  const clone = JSON.parse(JSON.stringify(componentInfo));

  // Group etrode[i][*] into buckets by index i (0-based)
  const buckets = {};
  for (const key of Object.keys(clone)) {
    const m = key.match(/^etrode\[(\d+)]\[(.+)]$/);
    if (!m) continue;
    const idx = Number(m[1]);    // 0,1,2,...
    const field = m[2];          // "etrode-No", "cup-No", "m", "status", ...
    if (!buckets[idx]) buckets[idx] = {};
    buckets[idx][field] = clone[key];
  }

  // Map electrode number (etrode-No) -> internal index
  const noToIdx = new Map();
  for (const [idxStr, row] of Object.entries(buckets)) {
    const idx = Number(idxStr);
    const noRaw = row["etrode-No"];
    const noNum = (noRaw !== undefined && noRaw !== "")
      ? Number(noRaw)
      : idx + 1; // default numbering if etrode-No is empty

    if (!Number.isNaN(noNum) && !noToIdx.has(noNum)) {
      noToIdx.set(noNum, idx);
    }
  }

  // For each selected electrode number 'i', mark status="used"
  stackDetail.forEach(sel => {
    const targetNo = Number(sel.i);
    if (!Number.isFinite(targetNo)) return;

    const idx = noToIdx.get(targetNo);
    if (idx === undefined) return;

    const statusKey = `etrode[${idx}][status]`;
    const oldStatus = clone[statusKey];

    // Don't overwrite scrap; overwrite free/empty
    if (oldStatus === "scrap") return;

    clone[statusKey] = "used";
  });

  return clone;
}




// Render full cathode AND anode list tables with checkboxes
function renderStackCheckboxes() {
  if (PAGE !== "BAL") return;

  const cathodeBody    = document.getElementById("stack-cathode-table-body");
  const cathodeSummary = document.getElementById("stack-cathode-summary-body");
  const anodeBody      = document.getElementById("stack-anode-table-body");
  const anodeSummary   = document.getElementById("stack-anode-summary-body");

  // если таблиц нет — выходим
  if (!cathodeBody || !anodeBody) return;

  // очистить таблицы и сводки
  cathodeBody.innerHTML = "";
  anodeBody.innerHTML   = "";
  if (cathodeSummary) cathodeSummary.innerHTML = "";
  if (anodeSummary)  anodeSummary.innerHTML  = "";

  // обнулить детали стека
  stackCathodeDetail = [];
  stackAnodeDetail   = [];

  // --- КАТОДЫ ---
  availableCathodes.forEach(item => {
  const tr = document.createElement("tr");
  const massText = (!isNaN(item.mass) && item.mass !== null) ? String(item.mass) : "";

  const isUsed = item.status && item.status !== "free"; // "used", "scrap", etc.

  tr.innerHTML = `
    <td>${item.index}</td>
    <td>${item.cup ?? ""}</td>
    <td>${massText}</td>
    <td><input type="checkbox" class="stack-cathode-checkbox" data-index="${item.index}"></td>
  `;

  const cb = tr.querySelector("input.stack-cathode-checkbox");

  if (isUsed && cb) {
    cb.disabled = true;
    cb.dataset.locked = "used";
    tr.classList.add("electrode-used"); // optional class for grey styling
  }

  cathodeBody.appendChild(tr);
});


  // обработчик на изменение чекбоксов катодов (как и раньше)
  cathodeBody.onchange = onCathodeCheckboxChange;
  anodeBody.onchange = onAnodeCheckboxChange;

  // --- АНОДЫ ---
  availableAnodes.forEach(item => {
    const tr = document.createElement("tr");
    const massText = (!isNaN(item.mass) && item.mass !== null) ? String(item.mass) : "";

    const isUsed = item.status && item.status !== "free";

    tr.innerHTML = `
      <td>${item.index}</td>
      <td>${item.cup ?? ""}</td>
      <td>${massText}</td>
      <td><input type="checkbox" class="stack-anode-checkbox" data-index="${item.index}"></td>
    `;

    const cb = tr.querySelector("input.stack-anode-checkbox");

    if (isUsed && cb) {
      cb.disabled = true;
      cb.dataset.locked = "used";
      tr.classList.add("electrode-used");
    }

    anodeBody.appendChild(tr);
  });

  updateStackCheckboxState();
}

// Enable/disable cathode checkboxes based on form-factor
function updateStackCheckboxState() {
  if (PAGE !== "BAL") return;

  const ffSelect = document.getElementById("form-factor");
  const ff = ffSelect ? ffSelect.value : "";

  const boxes = document.querySelectorAll(
    ".stack-cathode-checkbox, .stack-anode-checkbox"
  );

  const enabled = !!ff;
  boxes.forEach(cb => {
    const locked = cb.dataset.locked === "used";
    cb.disabled = locked || !enabled;  
  });
}


// Handle clicks on cathode checkboxes (single vs multi selection)
function onCathodeCheckboxChange(e) {
  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (!target.classList.contains("stack-cathode-checkbox")) return;

  const ffSelect = document.getElementById("form-factor");
  const ff = ffSelect ? ffSelect.value : "";
  const single =
    ff === "half2032" ||
    ff === "full2032";

  // Form-factor not selected → do not allow selection
  if (!ff) {
    target.checked = false;
    updateStackCheckboxState();
    return;
  }

  if (single && target.checked) {
    const boxes = document.querySelectorAll(".stack-cathode-checkbox");
    const alreadyChecked = Array.from(boxes).filter(cb => cb !== target && cb.checked);
    if (alreadyChecked.length > 0) {
      // User must uncheck the existing one first
      target.checked = false;
      return;
    }
  }

  syncStackFromCheckboxes();
}


// Handle clicks on anode checkboxes (single for coins, multiple otherwise)
function onAnodeCheckboxChange(e) {
  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (!target.classList.contains("stack-anode-checkbox")) return;

  const ffSelect = document.getElementById("form-factor");
  const ff = ffSelect ? ffSelect.value : "";

  // Форм-фактор не выбран → не позволяем выбирать
  if (!ff) {
    target.checked = false;
    updateStackCheckboxState();
    return;
  }

  // Для монет 2032 (half/full) разрешаем только один анод
  const single =
    ff === "half2032" ||
    ff === "full2032";

  if (single && target.checked) {
    const boxes = document.querySelectorAll(".stack-anode-checkbox");
    const alreadyChecked = Array.from(boxes).filter(cb => cb !== target && cb.checked);
    if (alreadyChecked.length > 0) {
      // Пользователь должен сначала снять существующий выбор
      target.checked = false;
      return;
    }
  }

  syncStackFromAnodeCheckboxes();
}




// Recompute stackCathodeDetail and update summary table
function syncStackFromCheckboxes() {
  if (PAGE !== "BAL") return;

  const boxes = document.querySelectorAll(".stack-cathode-checkbox");
  const selectedIdx = [];
  boxes.forEach(cb => {
    if (cb.checked) selectedIdx.push(Number(cb.dataset.index));
  });

  // Build detail array from availableCathodes
  const detail = selectedIdx
    .map(i => availableCathodes.find(c => c.index === i))
    .filter(Boolean)
    .map(item => ({
      i: item.index,
      cup: item.cup,
      mass: item.mass
    }));

  // Sort from lightest to heaviest (NaN masses go last)
  detail.sort((a, b) => {
    const am = Number(a.mass);
    const bm = Number(b.mass);
    if (isNaN(am) && isNaN(bm)) return 0;
    if (isNaN(am)) return 1;
    if (isNaN(bm)) return -1;
    return am - bm;
  });

  stackCathodeDetail = detail;

  const summaryBody = document.getElementById("stack-cathode-summary-body");
  if (summaryBody) {
    summaryBody.innerHTML = "";
    stackCathodeDetail.forEach(row => {
      const tr = document.createElement("tr");
      const massText = (!isNaN(row.mass) && row.mass !== null) ? String(row.mass) : "";
      tr.innerHTML = `
        <td>${row.i}</td>
        <td>${row.cup ?? ""}</td>
        <td>${massText}</td>
      `;
      summaryBody.appendChild(tr);
    });
  }
}



// Recompute stackAnodeDetail and update anode summary table
function syncStackFromAnodeCheckboxes() {
  if (PAGE !== "BAL") return;

  const boxes = document.querySelectorAll(".stack-anode-checkbox");
  const selectedIdx = [];
  boxes.forEach(cb => {
    if (cb.checked) selectedIdx.push(Number(cb.dataset.index));
  });

  // Build detail array from availableAnodes
  const detail = selectedIdx
    .map(i => availableAnodes.find(a => a.index === i))
    .filter(Boolean)
    .map(item => ({
      i: item.index,
      cup: item.cup,
      mass: item.mass
    }));

  // Sort from lightest to heaviest (NaN masses go last)
  detail.sort((a, b) => {
    const am = Number(a.mass);
    const bm = Number(b.mass);
    if (isNaN(am) && isNaN(bm)) return 0;
    if (isNaN(am)) return 1;
    if (isNaN(bm)) return -1;
    return am - bm;
  });

  stackAnodeDetail = detail;

  const summaryBody = document.getElementById("stack-anode-summary-body");
  if (summaryBody) {
    summaryBody.innerHTML = "";
    stackAnodeDetail.forEach(row => {
      const tr = document.createElement("tr");
      const massText = (!isNaN(row.mass) && row.mass !== null) ? String(row.mass) : "";
      tr.innerHTML = `
        <td>${row.i}</td>
        <td>${row.cup ?? ""}</td>
        <td>${massText}</td>
      `;
      summaryBody.appendChild(tr);
    });
  }
}




// -------DEBOUNCE------- // keeps from update() running on every keystroke
let debounceTimer;
const debounce = (func, delay = 800) => {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(func, delay);
};

// -------ACCESS "Other" INPUT FIELDS WHEN "Other" IS SELECTED-------
document.querySelectorAll('select').forEach(select => {
		select.addEventListener("change", e => {		// listen for changes in "select"
			const other = document.getElementById(`${select.id}-other`);	// select the HTML input element containing the "other input" text
			if (!other) return;			// return if there is no such HTML element

			const show = e.target.value === 'other';	// adjust BOOL value for whether "other" is selected or not
			other.hidden = !show;			// toggle "hidden" based on BOOL value
		})
	});

// -------DISABLE "Other" INPUT FIELDS WHEN "Other" IS NOT SELECTED-------
const syncOtherInputsVisibility = () => {

	// Step 1. SELECT elements
	document.querySelectorAll('select').forEach(select => {
		const otherInputField = document.getElementById(`${select.id}-other`);
		if (!otherInputField) return;

		const show = select.value === 'other';	// show is a BOOL
		otherInputField.disabled = !show;
		otherInputField.hidden = !show;
	});

	// Step 2. RADIO elements
	document.querySelectorAll('input[type="radio"]').forEach(radio => {
		const otherRadio = document.getElementById(`${radio.name}-other`);
		const otherInputField = document.getElementById(`${radio.name}-other-box`);
		if (!otherInputField) return;

		const show = otherRadio && otherRadio.checked === true;
		otherInputField.disabled = !show;
		otherInputField.hidden = !show;
	});

	// Step 3. CHECKBOX elements
	document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
		const otherCheckbox = document.getElementById(`${checkbox.name}-other`);
		const otherInputField = document.getElementById(`${checkbox.name}-other-box`);
		if (!otherInputField) return;

		const show = otherCheckbox && otherCheckbox.checked === true;
		otherInputField.disabled = !show;
		otherInputField.hidden = !show;
	});
}

// --- HANDLERS FOR SOME INPUT FIELDS ---
document.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(el => {
  el.addEventListener("change", () => {
    if (isSyncingUI) return;
    syncOtherInputsVisibility();
  });
});

// -------UPDATE JSON TEXT TO INCLUDE NEW FORM DATA-------
const updateJSON = () => {

  // Step 0. Bring UI into a consistent state (visibility/disabled/etc.)
  syncAllUI();

	// Step 1. Collect all form fields
	const fd = new FormData(form);

	// Creates a FormData OBJECT with ordered [key, value] pairs.
	// - "key" is always a string (the field's name)
	// - "value" is always a string OR a file.
	// 
	// NAME attribute: only form elements with a "name" attribute will be included
	// Enabled controls: disabled form elements are excluded
	// Checked controls: For radio buttons and checkboxes, only the selected/checked ones are included.
	// Selected options: For <select> elements, only the selected <option> elements are included
	// File inputs: File input values are included as File objects
	// 
	// For multiple values corresponding to the same key (e.g. checkboxes), FormData produces MULTIPLE [key, value] pairs with the same key. For example:
	// ["ice-cream", "vanilla"]
	// ["ice-cream", "cholocate"]

	// Step 2. Convert FormData to plain object (handles checkbox groups)
  const data = {};
  const recipeRows = []; // temporary array for recipe rows
  const recipeRegex = new RegExp(`^${RECIPE_PREFIX}\\[(\\d+)]\\[(\\w+)]$`);

  for (let [key, value] of fd.entries()) {
    // --- SPECIAL CASE: recipe rows ---
    // Matches keys like: cathode-recipe[0][type], anode-recipe[1][mass], etc.
    const match = key.match(recipeRegex);
    if (match) {
      const index = Number(match[1]);  // 0, 1, 2, ...
      const field = match[2];          // "type", "name", "percent", "mass", "volume", ...
      if (!recipeRows[index]) recipeRows[index] = {};
      recipeRows[index][field] = value;
      continue; // skip generic handling below for recipe keys
    }

    // --- GENERIC CASE (everything else, including checkbox groups) ---
    if (key in data) {
      if (Array.isArray(data[key])) {
        data[key].push(value);
      } else {
        data[key] = [data[key], value];
      }
    } else {
      data[key] = value;
    }
  }

  // Attach recipe rows if any exist, under the page-specific key
  if (recipeRows.length > 0) {
    data[RECIPE_PREFIX] = recipeRows.filter(row => Object.keys(row).length > 0);
  }

  // BAL-only: attach stack detail arrays (Model B)
  if (PAGE === "BAL") {
    if (stackCathodeDetail && stackCathodeDetail.length > 0) {
      data["stack-cathode-detail"] = stackCathodeDetail;
    }
    if (stackAnodeDetail && stackAnodeDetail.length > 0) {
      data["stack-anode-detail"] = stackAnodeDetail;
    }
  }

  // Step x. Save user preferences about collapsed/open details sections
  data._details = {};
  document.querySelectorAll("details[id]").forEach(d => {
    data._details[d.id] = d.open;
  });

  if (PAGE === "BAL") {
    if (cathodeInfo)    data["cathode-info"]    = cathodeInfo;
    if (anodeInfo)      data["anode-info"]      = anodeInfo;
    if (electrolyteInfo) data["electrolyte-info"] = electrolyteInfo;
    if (separatorInfo)   data["separator-info"]   = separatorInfo;
  }

  // ensure version field appears at the end
  data["form-version"] = `${PAGE}-v1.0`;

	// Step 3. Convert to JSON string
	const json = JSON.stringify(data, null, 2);

	return json;
};

let blobParts =[];


// REHYDRATE CATHODE FIELDS
if (PAGE === "BAL") {
  const cathodeBtn  = document.getElementById("load-cathode-file-btn");
  const cathodeInput = document.getElementById("load-cathode-file-input");

  if (cathodeBtn && cathodeInput) {
    cathodeBtn.addEventListener("click", () => {
      cathodeInput.click();
    });

    cathodeInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result;
        let obj;

        try {
          obj = JSON.parse(text);
        } catch (err) {
          console.error("Ошибка чтения файла катода:", err);
          return;
        }

        const version = (obj["form-version"] || "").toLowerCase();
        if (!version.includes("cathode")) {
          console.warn("Это не похоже на файл катода");
          return;
        }

        // --- NEW: проверка совместимости геометрии с форм-фактором BAL ---
        if (!isGeometryCompatibleWithFormFactor(obj, file.name)) {
          alert(
            "Этот файл катода не совместим с выбранным форм-фактором.\n\n" +
            "Для монет 2032 допускаются только файлы с круглыми электродами\n" +
            "и тегом 'coin' в имени.\n" +
            "Для pouch/цилиндр/призма — только прямоугольные электроды\n" +
            "и тег 'rect' в имени файла."
          );
          return;
        }
        // --- КОНЕЦ НОВОЙ ПРОВЕРКИ ---

        cathodeInfo = obj;

        // remember cathode file version from its name: ..._v1.json, v2, v3, ...
        const mVer = file.name.match(/_v(\d+)\.json$/i);
        cathodeFileVersion = mVer ? Number(mVer[1]) : 1;

        // 1. Заполнить поля BAL (ВАЖНО: передаём СТРОКУ, как в главной кнопке Load)
        rehydrate(text, true);

        // 2. Построить список катодов для блока "Стек"
        loadCathodeElectrodesFromData(obj);
        syncStackVisibility();
      };

      reader.readAsText(file);
      // чтобы один и тот же файл можно было выбрать снова
      cathodeInput.value = "";
    });
  }

  const anodeBtn  = document.getElementById("load-anode-file-btn");
  const anodeInput = document.getElementById("load-anode-file-input");

  if (anodeBtn && anodeInput) {
    anodeBtn.addEventListener("click", () => {
    anodeInput.click();
  });

  anodeInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      let obj;

      try {
        obj = JSON.parse(text);
      } catch (err) {
        console.error("Ошибка чтения файла анода:", err);
        return;
      }

      const version = (obj["form-version"] || "").toLowerCase();
      if (!version.includes("anode")) {
        console.warn("Это не похоже на файл анода");
        return;
      }

      // --- NEW: проверка совместимости геометрии с форм-фактором BAL ---
      if (!isGeometryCompatibleWithFormFactor(obj, file.name)) {
        alert(
          "Этот файл анода не совместим с выбранным форм-фактором.\n\n" +
          "Для монет 2032 допускаются только файлы с круглыми электродами\n" +
          "и тегом 'coin' в имени.\n" +
          "Для pouch/цилиндр/призма — только прямоугольные электроды\n" +
          "и тег 'rect' в имени файла."
        );
        return;
      }
      // --- КОНЕЦ НОВОЙ ПРОВЕРКИ ---

      anodeInfo = obj;

      const mVer = file.name.match(/_v(\d+)\.json$/i);
      anodeFileVersion = mVer ? Number(mVer[1]) : 1;

      rehydrate(text, true);
      loadAnodeElectrodesFromData(obj);
      syncStackVisibility();
    };

    reader.readAsText(file);
    anodeInput.value = "";
  });
}
  
  const electrolyteBtn  = document.getElementById("load-electrolyte-file-btn");
  const electrolyteInput = document.getElementById("load-electrolyte-file-input");

  if (electrolyteBtn && electrolyteInput) {
    electrolyteBtn.addEventListener("click", () => {
      electrolyteInput.click();
    });

    electrolyteInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result;
        let obj;

        try {
          obj = JSON.parse(text);
        } catch (err) {
          console.error("Ошибка чтения файла электролита:", err);
          return;
        }

        const version = (obj["form-version"] || "").toLowerCase();
        if (!version.includes("electrolyte")) {
          console.warn("Это не похоже на файл электролита");
          return;
        }

        // сохраняем весь объект внутрь BAL
        electrolyteInfo = obj;

        // мягко заполняем поля BAL (electrolyte-name и т.п.)
        rehydrate(text, true);
      };

      reader.readAsText(file);
      electrolyteInput.value = "";
    });
  }

  const separatorBtn  = document.getElementById("load-separator-file-btn");
  const separatorInput = document.getElementById("load-separator-file-input");

  if (separatorBtn && separatorInput) {
    separatorBtn.addEventListener("click", () => {
      separatorInput.click();
    });

    separatorInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result;
        let obj;

        try {
          obj = JSON.parse(text);
        } catch (err) {
          console.error("Ошибка чтения файла сепаратора:", err);
          return;
        }

        const version = (obj["form-version"] || "").toLowerCase();
        if (!version.includes("separator")) {
          console.warn("Это не похоже на файл сепаратора");
          return;
        }

        // сохраняем весь объект внутрь BAL
        separatorInfo = obj;

        // мягко заполняем поля BAL (separator-name и т.п.)
        rehydrate(text, true);
      };

      reader.readAsText(file);
      separatorInput.value = "";
    });
  }

}


// -------AUTOSAVE FORM DATA IN LOCAL STORAGE-------
const update = () => {
  // If user is currently typing in a geometry field, don't touch the UI/JSON.
  if (isGeometryActive()) {
    return;
  }

	let jsonText = updateJSON();
	blobParts = [jsonText];
	output.innerText = "\n" + jsonText;
	localStorage.setItem(DRAFT_KEY, jsonText);
	// status -> saved shortly after write
	setTimeout(() => setStatus(SAVED_MESSAGE, false), 150);
};

//  Compute GEOMETRY TAG for DOWNLOAD
function makeGeometryTag() {
  // Works for BOTH cathode and anode pages.
  if (PAGE !== "cathode" && PAGE !== "anode") return "";

  const shape = form.elements["etrode-shape"]?.value;

  if (shape === "circle") {
    const d = form.elements["etrode-diameter"]?.value.trim();
    if (d) return `coin-${d}mm`;
  }

  if (shape === "rectangle") {
    const L = form.elements["etrode-length"]?.value.trim();
    const W = form.elements["etrode-width"]?.value.trim();
    if (L && W) return `rect-${L}x${W}mm`;
  }

  return ""; // fallback: missing geometry
}


// -------DOWNLOAD JSON FILE-------
const download = () => {
	if (!form.reportValidity()) return;
	
	// Piecing together file name
  const rawProject = form.elements['project-name']?.value || "";
  const project = rawProject.trim() || "general";
	const date = getDate();

	// Create a temporary blob URL for downloading the JSON
	const blob = new Blob(blobParts, {type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;

	if (PAGE === "BAL") {
		const operator = form.elements['BA-operator'].value.trim();
		a.download = `BAT_${project}_${operator}_${form.elements['form-factor'].value}_${date}.json`.replace(/\s+/g, "_");

	}	else if (PAGE === "cathode") {
		const cathodeName = form.elements['cathode-name']?.value.trim();
		const cathodeBatch = form.elements['cathode-batch']?.value.trim();
    const geometryTag  = makeGeometryTag();
    const tagPart = geometryTag ? `__${geometryTag}` : "";
    a.download = `C_${project}_${cathodeName}_${cathodeBatch}${tagPart}_v1.json`.replace(/\s+/g, "_");
    // a.download = `C_${project}_${cathodeName}_${cathodeBatch}_${date}.json`.replace(/\s+/g, "_");
	
	} else if (PAGE === "anode") {
		const anodeName = form.elements['anode-name']?.value.trim();
		const anodeBatch = form.elements['anode-batch']?.value.trim();
    const geometryTag  = makeGeometryTag();
    const tagPart = geometryTag ? `__${geometryTag}` : "";
    a.download = `A_${project}_${anodeName}_${anodeBatch}${tagPart}_v1.json`.replace(/\s+/g, "_");
    // a.download = `A_${project}_${anodeName}_${anodeBatch}_${date}.json`.replace(/\s+/g, "_");

	} else if (PAGE === "electrolyte") {
		const electrolyteName = form.elements['electrolyte-name']?.value.trim();
		const electrolyteBatch = form.elements['electrolyte-batch']?.value.trim();
    a.download = `E_${project}_${electrolyteName}_${electrolyteBatch}_${date}.json`.replace(/\s+/g, "_");

	} else if (PAGE === "separator") {
		const separatorName = form.elements['separator-name']?.value.trim();
		const separatorBatch = form.elements['separator-batch']?.value.trim();
    a.download = `S_${project}_${separatorName}_${separatorBatch}_${date}.json`.replace(/\s+/g, "_");

	}
		
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 0);
};


// Download updated cathode/anode JSON with "_USED" marker in the filename
function downloadUpdatedComponentFile(componentObj, type /* "cathode" | "anode" */) {
  if (!componentObj) return;

  const rawProject = form.elements['project-name']?.value || "";
  const project = rawProject.trim() || "general";

  let rawName = "";
  let rawBatch = "";
  let baseVersion = 1;

  if (type === "cathode") {
    rawName  = form.elements['cathode-name']?.value.trim() || "";
    rawBatch = form.elements['cathode-batch']?.value.trim() || "";
    baseVersion = cathodeFileVersion;
  } else if (type === "anode") {
    rawName  = form.elements['anode-name']?.value.trim() || "";
    rawBatch = form.elements['anode-batch']?.value.trim() || "";
    baseVersion = anodeFileVersion;
  }

  const nextVersion = (Number(baseVersion) || 1) + 1;

  const prefix = type === "cathode" ? "C" : "A";
  const fileName = `${prefix}_${project}_${rawName}_${rawBatch}_v${nextVersion}.json`
    .replace(/\s+/g, "_");

  const blob = new Blob([JSON.stringify(componentObj, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);

  // bump version in memory so the next export will be v3, v4, etc.
  if (type === "cathode") cathodeFileVersion = nextVersion;
  if (type === "anode")   anodeFileVersion   = nextVersion;
}


// Ensure enough electrode rows exist to host all etrode[i][...] keys from data
function ensureElectrodeRowsFromData(data) {
  // Only relevant on electrode-prep pages
  if (PAGE !== "anode" && PAGE !== "cathode") return;

  const container = document.getElementById("etrode-rows");
  if (!container) return;

  // find max index in keys like etrode[0][m], etrode[4][cup-No], etc.
  let maxIndex = -1;

  for (const [key, value] of Object.entries(data)) {
    // etrode[5][m], etrode[3][cup-No], etrode[10][etrode-No], etrode[7][status]
    const m = key.match(/^etrode\[(\d+)]\[(.+)]$/);
    if (!m) continue;

    const idx = Number(m[1]);
    const fieldName = m[2];

    // 1) игнорируем статус — он по умолчанию "free" и только засоряет автосейв
    if (fieldName === "status") continue;

    // 2) игнорируем полностью пустые поля (после reset() они именно такие)
    if (value === "" || value === null || value === undefined) continue;

    if (!Number.isNaN(idx) && idx > maxIndex) {
      maxIndex = idx;
    }
  }


  if (maxIndex < 0) return; // no electrodes in this data

  const neededCount = maxIndex + 1; // indices 0..maxIndex → count = maxIndex+1
  const rows = container.querySelectorAll(".etrode-row");
  let existingCount = rows.length;

  if (!existingCount) return; // nothing to clone from

  // clone the first row as a template
  const template = rows[0];

  while (existingCount < neededCount) {
    const nextIndex = existingCount; // 1,2,3,...

    const clone = template.cloneNode(true);
    clone.dataset.index = nextIndex;

    clone.querySelectorAll("[name]").forEach(el => {
      // bump [0] → [1], [2], ...
      el.name = el.name.replace(/\[\d+]/, `[${nextIndex}]`);
      if (el.tagName === "SELECT") {
        el.selectedIndex = 0;
      } else {
        el.value = "";
      }
      el.disabled = false;
    });

    container.appendChild(clone);
    existingCount++;
  }
}



// -------REHYDRATION-------
let isHydrating = false;

function rehydrate(jsonTextOrObj, mergeOnlyEmpty = false) {
  try {
    const data = JSON.parse(jsonTextOrObj);
    isHydrating = true;

    // Require a top-level object - this prevents strings, arrays, or nulls from breaking program logic
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      console.warn("Rehydrate skipped: top-level JSON is not an object.")
      isHydrating = false;
      return;
    }

    // --- NEW: make sure we have enough electrode rows for etrode[i][...] keys ---
    ensureElectrodeRowsFromData(data);

    // FILL FORM FIELDS:
    // For each key in 'data', find matching form element and set its value.
    for (const [key, value] of Object.entries(data)) {
      const el = form.elements[key];
  		if (!el) continue;

  		// ----- RADIO GROUPS -----
			{
				const radios = document.querySelectorAll(`input[type="radio"][name="${key}"]`);
				if (radios.length > 0) {
					const val = value;

					// if we are in "merge" mode and some radio in this group is already checked, skip
			    if (mergeOnlyEmpty) {
			      const anyChecked = Array.from(radios).some(r => r.checked);
			      if (anyChecked) continue;
			    }

	  			// set the matching radio as checked
	  			radios.forEach(r => {
	  				r.checked = (r.value === val);	// if for the given radio button, the value matched the value in my JSON, assign TRUE to r.checked -> check the radio button
	  			});

	  			// handle "other" radio text box
	  			if (val === "other") {
	  				const box = document.getElementById(`${key}-other-box`);
	  				if (box && data[`${key}-other`] != null) {
	  					box.value = data[`${key}-other`];
	  				}
	  			}

	  			// for debugging
	  			// console.log("RADIO GROUP for key=", key, ": ", radios);

	  			// important: don't fall through to el.value below
		      continue;
	  		}
			}	
  	
  		// ----- CHECKBOX GROUPS -----
  		{
  			const chkBoxes = document.querySelectorAll(`input[type="checkbox"][name="${key}"]`);
  			// If at least one checkbox type form field is found
  			if (chkBoxes.length > 0) {
  				// Check to see if the VALUE is an array
  				// if it is, assign the value (array) to the key
  				// if it is not, take the value and make it [arr0]
  				const vals = Array.isArray(value) ? value : [value];

  				// if in "merge" mode and any checkbox in this group is already checked, skip
			    if (mergeOnlyEmpty) {
			      const anyChecked = Array.from(chkBoxes).some(cb => cb.checked);
			      if (anyChecked) continue;
			    }

  				chkBoxes.forEach(cb => {
  					cb.checked = vals.includes(cb.value);
  				});

  				if (vals.includes("other")) {
  					const box = document.getElementById(`${key}-other-box`);
  					if (box && data[`${key}-other`] != null) {
  						box.value = data[`${key}-other`];
  					}
  				}
		  		// console.log("CHECKBOX GROUP for key=", key, ": ", chkBoxes, "vals: ",vals);
			    continue;
  			}

  		}

  		// ----- SIMPLE CONTROLS (input/textarea/select)
  		// At this point we know it's NOT a radio or checkbox group.
  		// Safe to treat el as a single element

			// If we're merging, and this field already has a value, skip it
      // EXCEPT for electrode status fields (we want them to update).
      const isElectrodeStatus = /^etrode\[\d+]\[status]$/.test(key);
      if (mergeOnlyEmpty && el.value !== "" && !isElectrodeStatus) {
        continue;
			}

			// Special case: "other input" for SELECT - Check .options and match the .value against the options.
  		if (el.tagName === "SELECT") {
  			// we temporarily set value so options logic below sees it
	  		el.value = value;

  			// First, we check whether THIS HTML element has one ("some" - "at least one") option matching the value of the element
  			const hasOption = [...el.options].some(o => o.value === value);

  			// If there is no such option, select "other" & copy value into "other-input-field"
  			if (!hasOption) {
  				el.value = "other";
  				const other = document.getElementById(`${el.id}-other`);
  				if (other) other.value = value;
  			// If the value is literally "other", select that and fill the "other-input-field" if it is not empty
  			} else if (el.value === "other") {
  				const other = document.getElementById(`${el.id}-other`);
  				if (other) {
  					const companion = data[`${el.id}-other`];
  					if (companion != null) other.value = companion;
  				}
  			}
  		} else {
  			// regular input / textarea: just assign
  			el.value = value;
  		}
  	}

    // Step x. Load paste recipe data for this page (if present)
    const recipeArray = data[RECIPE_PREFIX];
    if (Array.isArray(recipeArray)) {
      const recipeContainer = document.getElementById(RECIPE_ROWS_ID);
      const actualContainer = document.getElementById(ACTUAL_ROWS_ID);

      // If page has no recipe UI (e.g. BAL) – skip safely
      if (recipeContainer && actualContainer) {
        const existingCount = recipeContainer.querySelectorAll(`.${RECIPE_ROW_CLASS}`).length;
        // создаём недостающие пары строк
        for (let i = existingCount; i < recipeArray.length; i++) {
          createRecipeRowPair(i);
        }

        for (const [i, row] of recipeArray.entries()) {
          for (const key in row) {
            const input = document.querySelector(
              `[name="${RECIPE_PREFIX}[${i}][${key}]"]`
            );
            if (!input) continue;
            if (mergeOnlyEmpty && input.value !== "") continue;
            input.value = row[key];
          }
        }
      }
    }

		// >>> RESTORE <details> STATE HERE <<<
		if (data._details && typeof data._details === "object") {
		  for (const [id, open] of Object.entries(data._details)) {
		    const d = document.getElementById(id);
		    if (d && typeof d.open === "boolean") {
		    	d.open = open;
		    }
		  }
		}
		
		syncAllUI();

  	// Ignore unknown keys for now
		// Leave anything not present in JSON as-is (non-destructive).

  } catch (err) {
  	console.error("Invalid autosave JSON: ", err);
  }

  isHydrating = false;
  // DO NOT call update() here; it causes input lag and cursor jumps.
}

// ------- LOAD FILE -------
const loadBtn = document.getElementById('loadBtn');
loadBtn?.addEventListener("click", () => {
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "application/json,.json";
  picker.multiple = true;
  picker.onchange = () => {
    const files = Array.from(picker.files || []);
    if (!files.length) return;

    // Показать имя загруженного файла на страницах: катод, анод, электролит, сепаратор
    if (["cathode", "anode", "electrolyte", "separator"].includes(PAGE)) {
      showLoadedFileName(files[0].name);
    }

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result;

        // Special case: loading a BAL file on BAL page
        if (PAGE === "BAL") {
          let obj;
          try {
            obj = JSON.parse(text);
          } catch (err) {
            console.error("Invalid JSON file:", err);
            return;
          }

          const version = (obj["form-version"] || "").toLowerCase();
          if (version.includes("bal")) {
            // 1) Fill all normal form fields
            rehydrate(text, true);

            // 2) Restore nested component info
            cathodeInfo     = obj["cathode-info"]     || null;
            anodeInfo       = obj["anode-info"]       || null;
            electrolyteInfo = obj["electrolyte-info"] || null;
            separatorInfo   = obj["separator-info"]   || null;

            // 3) Rebuild electrode lists from nested cathode/anode JSON
            if (cathodeInfo) loadCathodeElectrodesFromData(cathodeInfo);
            if (anodeInfo)   loadAnodeElectrodesFromData(anodeInfo);

            // 4) Restore selected electrodes (stack) from saved detail arrays
            const cDetail = Array.isArray(obj["stack-cathode-detail"])
              ? obj["stack-cathode-detail"]
              : [];
            const aDetail = Array.isArray(obj["stack-anode-detail"])
              ? obj["stack-anode-detail"]
              : [];

            stackCathodeDetail = cDetail;
            stackAnodeDetail   = aDetail;

            // Mark checkboxes according to saved selection
            const cIdxSet = new Set(cDetail.map(row => row.i));
            document
              .querySelectorAll(".stack-cathode-checkbox")
              .forEach(cb => {
                const idx = Number(cb.dataset.index);
                cb.checked = cIdxSet.has(idx);
              });

            const aIdxSet = new Set(aDetail.map(row => row.i));
            document
              .querySelectorAll(".stack-anode-checkbox")
              .forEach(cb => {
                const idx = Number(cb.dataset.index);
                cb.checked = aIdxSet.has(idx);
              });

            // Rebuild summary tables from the now-checked boxes
            syncStackFromCheckboxes();
            syncStackFromAnodeCheckboxes();
            updateStackCheckboxState();
            syncStackVisibility();
            return; // done with BAL file
          } else {
            console.warn("Это не BAL-файл, общий загрузчик на BAL его игнорирует");
            return; // <--- важно выйти
          }
        }

        // Default behavior (non-BAL files or non-BAL pages)
        rehydrate(text, true);
      };

      reader.readAsText(file);
    });
  };
  picker.click();
});


// ------- CLEAR C/A page Section III of the FORM -------
function clearElectrodeSection() {
  // Работает только на страницах катода / анода
  if (PAGE !== "cathode" && PAGE !== "anode") return;

  const section = document.getElementById("3-electrodes-f");
  if (!section) return;

  // 1) Сбрасываем все input/textarea внутри раздела III
  section.querySelectorAll("input, textarea").forEach(el => {
    const type = el.type;

    // Кнопки не трогаем
    if (type === "button" || type === "submit") return;

    if (type === "checkbox" || type === "radio") {
      el.checked = false;
    } else {
      el.value = "";
    }
  });

  // 2) Сбрасываем все select внутри раздела III (в т.ч. статус электродов)
  section.querySelectorAll("select").forEach(sel => {
    sel.selectedIndex = 0; // первая опция ("free" для статуса и т.п.)
  });

  // 3) Таблица электродов: оставляем одну пустую строку с индексом 0
  const container = document.getElementById("etrode-rows");
  if (container) {
    const rows = Array.from(container.querySelectorAll(".etrode-row"));

    rows.forEach((row, idx) => {
      if (idx > 0) {
        // все дополнительные строки удаляем
        row.remove();
      } else {
        // первую строку очищаем и приводим имена к [0]
        row.dataset.index = "0";
        row.querySelectorAll("[name]").forEach(el => {
          el.name = el.name.replace(/\[\d+]/, "[0]");
          if (el.tagName === "SELECT") {
            // статус → первая опция (обычно "free")
            el.selectedIndex = 0;
          } else {
            el.value = "";
          }
        });
      }
    });
  }

  // 4) Обновляем UI и автосейв
  syncAllUI();
  update();
}

const clearElectrodesBtn = document.getElementById("clear-electrodes-btn");
if (clearElectrodesBtn && (PAGE === "cathode" || PAGE === "anode")) {
  clearElectrodesBtn.addEventListener("click", clearElectrodeSection);
}


// ------- CLEAR FORM -------
function clearForm() {
  form.reset();

  // На страницах катода/анода после очистки оставляем только по одной строке:
  // - в таблице электродов
  // - в таблице рецепта
  // - в таблице фактических значений
  if (PAGE === "cathode" || PAGE === "anode") {
    // 1) Электроды (массы отдельных катодов/анодов)
    const etrodeContainer = document.getElementById("etrode-rows");
    if (etrodeContainer) {
      const rows = etrodeContainer.querySelectorAll(".etrode-row");
      rows.forEach((row, idx) => {
        if (idx > 0) row.remove(); // всё, кроме первой строки, убираем
      });
    }

    // 2) Рецепт пасты
    const recipeContainer = document.getElementById(RECIPE_ROWS_ID);
    if (recipeContainer) {
      const recipeRows = recipeContainer.querySelectorAll(`.${RECIPE_ROW_CLASS}`);
      recipeRows.forEach((row, idx) => {
        if (idx > 0) row.remove();
      });
    }

    // 3) Фактические значения (m, V) по компонентам
    const actualContainer = document.getElementById(ACTUAL_ROWS_ID);
    if (actualContainer) {
      const actualRows = actualContainer.querySelectorAll(".actual-row");
      actualRows.forEach((row, idx) => {
        if (idx > 0) row.remove();
      });
    }
  }

  localStorage.removeItem(DRAFT_KEY);

  if (PAGE === "BAL") {
    // reset in-memory BAL state
    availableCathodes = [];
    availableAnodes = [];
    stackCathodeDetail = [];
    stackAnodeDetail = [];
    cathodeInfo = null;
    anodeInfo = null;
    electrolyteInfo = null;
    separatorInfo = null;
    
    cathodeFileVersion = 1;
    anodeFileVersion = 1;
  }

  syncAllUI();
  update();
}

document.getElementById('clearBtn').addEventListener("click", clearForm);


// ***** HELPERS *****
// ------- HELPER: ReadOnly number of drops for certain separator-electrolyte arrangements
function applySeparatorLayoutRules() {
	if (PAGE !== "BAL") return;
	
	if (!dropQuantity || !dropVolume || !electrolyteVolume) return;

	const radios = document.querySelectorAll(`input[type="radio"][name="separator-layout"]`);
	const selected = [...radios].find(r => r.checked);
	if (!selected) return;

	if (selected.value === "SEE" || selected.value === "ESE" || selected.value === "EES") {
		dropQuantity.value = 2;
		dropQuantity.readOnly = true;
	} else if (selected.value === "SE" || selected.value === "ES") {
		dropQuantity.value = 1;			
		dropQuantity.readOnly = true;
	} else {
		dropQuantity.readOnly = false;
		updateElectrolyteVolume();
		return;
	}

	updateElectrolyteVolume();
}

// --- GENERIC: add dynamic rows (recipe, electrodes, etc.) ---
function setupDynamicRows(buttonId, containerId, rowClass) {
  const btn = document.getElementById(buttonId);
  const container = document.getElementById(containerId);
  if (!btn || !container) return;

  btn.addEventListener("click", () => {
    const rows = container.querySelectorAll(`.${rowClass}`);
    if (!rows.length) return;

    const nextIndex = rows.length; // 1, 2, 3, ...

    const clone = rows[0].cloneNode(true);
    clone.dataset.index = nextIndex;

    clone.querySelectorAll("[name]").forEach(el => {
      // bump the [0] / [1] index in name="xxx[0][key]"
      el.name = el.name.replace(/\[\d+]/, `[${nextIndex}]`);

      if (el.tagName === "SELECT") {
        el.selectedIndex = 0;
      } else {
        el.value = "";
      }
    });

    container.appendChild(clone);
  });
}


function createRecipeRowPair(nextIndex) {
  const recipeContainer = document.getElementById(RECIPE_ROWS_ID);
  const actualContainer = document.getElementById(ACTUAL_ROWS_ID);
  if (!recipeContainer || !actualContainer) return;

  const recipeRows = recipeContainer.querySelectorAll(`.${RECIPE_ROW_CLASS}`);
  const actualRows = actualContainer.querySelectorAll(".actual-row");
  if (!recipeRows.length || !actualRows.length) return;

  // --- clone recipe row ---
  const recipeClone = recipeRows[0].cloneNode(true);
  recipeClone.dataset.index = nextIndex;

  recipeClone.querySelectorAll("[name]").forEach(el => {
    el.name = el.name.replace(/\[\d+]/, `[${nextIndex}]`);
    if (el.tagName === "SELECT") {
      el.selectedIndex = 0;
    } else {
      el.value = "";
    }
    el.disabled = false;
  });

  recipeContainer.appendChild(recipeClone);

  // --- clone actual row ---
  const actualClone = actualRows[0].cloneNode(true);
  actualClone.dataset.index = nextIndex;

  const codeSpan = actualClone.querySelector(".actual-code");
  if (codeSpan) {
    codeSpan.dataset.recipeIndex = String(nextIndex);
    codeSpan.textContent = "";
  }

  actualClone.querySelectorAll("input[name]").forEach(el => {
    el.name = el.name.replace(/\[\d+]/, `[${nextIndex}]`);
    el.value = "";
    el.disabled = false;
    el.hidden = false;
  });

  actualContainer.appendChild(actualClone);
}




// Widget: Recipe + Actual rows
// - adds a new recipe row
// - adds matching actual row
// - keeps indices and names in sync
function setupRecipeRows() {
  const addBtn = document.getElementById(ADD_RECIPE_BTN_ID);
  const recipeContainer = document.getElementById(RECIPE_ROWS_ID);
  const actualContainer = document.getElementById(ACTUAL_ROWS_ID);
  if (!addBtn || !recipeContainer || !actualContainer) return;

  addBtn.addEventListener("click", () => {
    const recipeRows = recipeContainer.querySelectorAll(`.${RECIPE_ROW_CLASS}`);
    if (!recipeRows.length) return;

    const nextIndex = recipeRows.length; // 1,2,3...
    createRecipeRowPair(nextIndex);

    // обновить режимы/коды для новых строк
    syncRecipeMeasurementMode();
    syncAllActualCodes();
  });
}

// Use for electrodes
setupDynamicRows("add-etrode-row", "etrode-rows", "etrode-row");


function syncElectrodeStatusUI() {
  const container = document.getElementById("etrode-rows");
  if (!container) return;

  const rows = container.querySelectorAll(".etrode-row");
  rows.forEach(row => {
    row.classList.remove("etrode-row--used");

    const statusSelect = row.querySelector(
      'select[name^="etrode"][name$="[status]"]'
    );
    if (!statusSelect) return;

    if (statusSelect.value === "used") {
      row.classList.add("etrode-row--used");
    }
  });
}

function initElectrodeStatusUI() {
  const container = document.getElementById("etrode-rows");
  if (!container) return; // pages без блока электродов просто пропускаем

  container.addEventListener("change", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLSelectElement)) return;

    const name = target.name || "";
    if (!/^etrode\[\d+]\[status]$/.test(name)) return;

    syncElectrodeStatusUI();
  });

  // начальное состояние при загрузке / после rehydrate
  syncElectrodeStatusUI();
}


function initElectrodeGeometryLogic() {
  const diameter = document.getElementById("etrode-diameter");
  const length   = document.getElementById("etrode-length");
  const width    = document.getElementById("etrode-width");
  const areaEl   = document.getElementById("etrode-area");

  // Радиокнопки выбора формы
  const shapeRadios = document.querySelectorAll('input[name="etrode-shape"]');

  // Если на странице нет блока геометрии — выходим
  if (!diameter && !length && !width) return;

  let areaTimer = null;

  function getShape() {
    const checked = Array.from(shapeRadios).find(r => r.checked);
    return checked ? checked.value : "";
  }

  function computeArea() {
    if (!areaEl) return;

    const shape = getShape();
    let val = "";

    if (shape === "circle" && diameter) {
      const d = Number(diameter.value);
      if (!isNaN(d) && d > 0) {
        const r = d / 2;
        val = (Math.PI * r * r).toFixed(2); // мм²
      }
    } else if (shape === "rectangle" && length && width) {
      const L = Number(length.value);
      const W = Number(width.value);
      if (!isNaN(L) && !isNaN(W) && L > 0 && W > 0) {
        val = (L * W).toFixed(2); // мм²
      }
    }

    areaEl.textContent = val;
  }

  function handleGeometryInput() {
    // только локальный пересчёт площади с debounce
    clearTimeout(areaTimer);
    areaTimer = setTimeout(computeArea, 250);
  }

  // Ввод в геометрические поля → пересчёт площади
  [diameter, length, width].forEach(el => {
    if (!el) return;
    el.addEventListener("input", handleGeometryInput);
  });

  // Переключение формы → просто пересчитываем площадь.
  // Показ/скрытие и disabled полей делает syncMixParamsForGroup("etrode-shape").
  if (shapeRadios.length) {
    shapeRadios.forEach(radio => {
      radio.addEventListener("change", computeArea);
    });
  }

  // Начальное состояние при загрузке / rehydrate
  computeArea();
}


// ----- NOW Date-Time BUTTON -----
document.querySelectorAll(".date-time-now-button").forEach(btn => {
	btn.addEventListener("click", () => {
		const prefix = btn.id.replace("-now-button", ""); // drop the tail of the button class name

		const dateInput = document.getElementById(`${prefix}-date`);
		const timeInput = document.getElementById(`${prefix}-time`);

		if (!dateInput || !timeInput) return;

		const now = new Date();
		const pad = n => String(n).padStart(2, "0");

		const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
		const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

		dateInput.value = dateStr;
		timeInput.value = timeStr;

		// trigger autosave
		dateInput.dispatchEvent(new Event("input"));
		timeInput.dispatchEvent(new Event("input"));
	});
});

// ----- DYNAMIC VOLUME-BASED MIXING TECHNIQUE SELECTION -----
// ------- MIXING UI: show/hide parameter blocks for selected techniques -------

// One group = one radio-name (e.g. "mix-dry-technique" or "mix-wet-technique")
function syncMixParamsForGroup(radioName) {
  const radios = document.querySelectorAll(`input[name="${radioName}"]`);
  if (!radios.length) return;

  // Собираем все блоки параметров, на которые ссылаются эти радио
  const paramsBlocks = new Set();
  radios.forEach((radio) => {
    const targetId = radio.dataset.paramsTarget;
    if (!targetId) return;
    const block = document.getElementById(targetId);
    if (block) paramsBlocks.add(block);
  });

  const allBlocks = Array.from(paramsBlocks);

  // Сначала скрываем всё и отключаем внутренние инпуты
  allBlocks.forEach((block) => {
    block.hidden = true;
    block.querySelectorAll("input").forEach((input) => {
      input.disabled = true;
    });
  });

  // Показываем блок только для выбранного радио (если у него есть data-params-target)
  const checked = Array.from(radios).find((r) => r.checked);
  if (!checked) return;

  const targetId = checked.dataset.paramsTarget;
  if (!targetId) return;

  const activeBlock = document.getElementById(targetId);
  if (!activeBlock) return;

  activeBlock.hidden = false;
  activeBlock.querySelectorAll("input").forEach((input) => {
    input.disabled = false;
  });
}

// Синхронизировать сразу обе группы
function syncAllMixParams() {
  syncMixParamsForGroup("mix-dry-technique");
  syncMixParamsForGroup("mix-wet-technique");
}

// Навешиваем обработчики на change и один раз синхронизируем состояние
function initMixingUI() {
  ["mix-dry-technique", "mix-wet-technique"].forEach((name) => {
    const radios = document.querySelectorAll(`input[name="${name}"]`);
    if (!radios.length) return;

    radios.forEach((radio) => {
      radio.addEventListener("change", () => {
        syncMixParamsForGroup(name);
      });
    });
  });

  // начальное состояние при загрузке
  syncAllMixParams();
}

function initApplicationUI() {
  const radios = document.querySelectorAll('input[name="application-method"]');
  if (!radios.length) return;

  radios.forEach(radio => {
    radio.addEventListener("change", () => {
      syncMixParamsForGroup("application-method");
    });
  });

  // начальное состояние при загрузке
  syncMixParamsForGroup("application-method");
}

function initElectrodeShapeUI() {
  const radios = document.querySelectorAll('input[name="etrode-shape"]');
  if (!radios.length) return;

  radios.forEach(radio => {
    radio.addEventListener("change", () => {
      syncMixParamsForGroup("etrode-shape");
    });
  });

  // начальное состояние при загрузке
  syncMixParamsForGroup("etrode-shape");
}

function syncRecipeMeasurementMode() {
  const recipeContainer = document.getElementById(RECIPE_ROWS_ID);
  const actualContainer = document.getElementById(ACTUAL_ROWS_ID);
  if (!recipeContainer) return;

  const rows = recipeContainer.querySelectorAll(`.${RECIPE_ROW_CLASS}`);

  rows.forEach(row => {
    const index = row.dataset.index;
    if (index == null) return;

    const massInput = row.querySelector(
      `input[name="${RECIPE_PREFIX}[${index}][mass]"]`
    );
    const volumeInput = row.querySelector(
      `input[name="${RECIPE_PREFIX}[${index}][volume]"]`
    );

    const hasMass = massInput && massInput.value !== "";
    const hasVolume = volumeInput && volumeInput.value !== "";

    let mode = null;
    if (hasMass && !hasVolume) mode = "mass";
    if (hasVolume && !hasMass) mode = "volume";

    // --- recipe row: lock secondary field if mode chosen ---
    if (massInput && volumeInput) {
      if (mode === "mass") {
        massInput.disabled = false;
        volumeInput.disabled = true;
        volumeInput.value = "";
      } else if (mode === "volume") {
        volumeInput.disabled = false;
        massInput.disabled = true;
        massInput.value = "";
      } else {
        massInput.disabled = false;
        volumeInput.disabled = false;
      }
    }

    // --- actual row: show only matching unit ---
    if (!actualContainer) return;
    const actualRow = actualContainer.querySelector(
      `.actual-row[data-index="${index}"]`
    );
    if (!actualRow) return;

    const actualMassInput = actualRow.querySelector(
      `input[name="${RECIPE_PREFIX}[${index}][actualMass]"]`
    );
    const actualVolumeInput = actualRow.querySelector(
      `input[name="${RECIPE_PREFIX}[${index}][actualVolume]"]`
    );

    if (mode === "mass") {
      if (actualMassInput) {
        actualMassInput.disabled = false;
        actualMassInput.hidden = false;
      }
      if (actualVolumeInput) {
        actualVolumeInput.disabled = true;
        actualVolumeInput.hidden = true;
        actualVolumeInput.value = "";
      }
    } else if (mode === "volume") {
      if (actualVolumeInput) {
        actualVolumeInput.disabled = false;
        actualVolumeInput.hidden = false;
      }
      if (actualMassInput) {
        actualMassInput.disabled = true;
        actualMassInput.hidden = true;
        actualMassInput.value = "";
      }
    } else {
      // no mode yet: both available
      if (actualMassInput) {
        actualMassInput.disabled = false;
        actualMassInput.hidden = false;
      }
      if (actualVolumeInput) {
        actualVolumeInput.disabled = false;
        actualVolumeInput.hidden = false;
      }
    }
  });
}


function initRecipeMeasurementMode() {
  const recipeContainer = document.getElementById(RECIPE_ROWS_ID);
  if (!recipeContainer) return;

  // react when user edits mass/volume in the recipe
  recipeContainer.addEventListener("input", (e) => {
    if (isSyncingUI) return;
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    const name = target.name || "";
    const re = new RegExp(`^${RECIPE_PREFIX}\\[\\d+]\\[(mass|volume)]$`);
    if (!re.test(name)) return;

    syncRecipeMeasurementMode();
  });

  // initial state
  syncRecipeMeasurementMode();
}


function syncAllActualCodes() {
  const recipeContainer = document.getElementById(RECIPE_ROWS_ID);
  const actualContainer = document.getElementById(ACTUAL_ROWS_ID);
  if (!recipeContainer || !actualContainer) return;

  const nameInputs = recipeContainer.querySelectorAll(
    `input[name^="${RECIPE_PREFIX}"][name$="[name]"]`
  );
  nameInputs.forEach(input => {
    const match = input.name.match(
      new RegExp(`^${RECIPE_PREFIX}\\[(\\d+)]\\[name]$`)
    );
    if (!match) return;
    const index = match[1];
    const span = actualContainer.querySelector(
      `.actual-row[data-index="${index}"] .actual-code`
    );
    if (span) {
      span.textContent = input.value;
    }
  });
}


function initActualCodeSync() {
  const recipeContainer = document.getElementById(RECIPE_ROWS_ID);
  const actualContainer = document.getElementById(ACTUAL_ROWS_ID);
  if (!recipeContainer || !actualContainer) return;

  recipeContainer.addEventListener("input", (e) => {
    if (isSyncingUI) return;
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    const name = target.name || "";
    const match = name.match(
      new RegExp(`^${RECIPE_PREFIX}\\[(\\d+)]\\[name]$`)
    );
    if (!match) return;

    const index = match[1];
    const span = actualContainer.querySelector(
      `.actual-row[data-index="${index}"] .actual-code`
    );
    if (span) {
      span.textContent = target.value;
    }
  });

  // initial fill
  syncAllActualCodes();
}


function syncStackVisibility() {
  if (PAGE !== "BAL") return;

  const ffSelect   = document.getElementById("form-factor");
  const halfSelect = document.getElementById("half-cell-type");
  const stackFieldset = document.getElementById("BAL-stack");
  if (!stackFieldset) return;

  const stackMain = stackFieldset.querySelector(".stack-main");
  const allHints  = stackFieldset.querySelectorAll(".stack-hint");

  const hintFormFactor = stackFieldset.querySelector(".stack-hint--formfactor");
  const hintHalfType   = stackFieldset.querySelector(".stack-hint--half-type");
  const hintLoadAll    = stackFieldset.querySelector(".stack-hint--load-all");
  const hintLoadCath   = stackFieldset.querySelector(".stack-hint--load-cathode");
  const hintLoadAnode  = stackFieldset.querySelector(".stack-hint--load-anode");

  const cathodeBlocks = stackFieldset.querySelectorAll(".stack-cathode-block");
  const anodeBlocks   = stackFieldset.querySelectorAll(".stack-anode-block");

  if (!stackMain) return;

  const ff  = ffSelect ? ffSelect.value : "";
  const hf  = halfSelect ? halfSelect.value : "";
  const hasC = !!cathodeInfo;
  const hasA = !!anodeInfo;

  const hideAllHints = () => {
    allHints.forEach(h => { h.hidden = true; });
  };

  const showHint = (el) => {
    hideAllHints();
    if (el) el.hidden = false;
  };

  const hideStackMain = () => {
    stackMain.hidden = true;
  };

  const showStackMain = () => {
    stackMain.hidden = false;
  };

  // reset cathode/anode blocks visibility (we'll refine below)
  cathodeBlocks.forEach(b => { b.hidden = false; });
  anodeBlocks.forEach(b   => { b.hidden = false; });

  // --- STATE 0: form-factor not selected ---
  if (!ff) {
    hideStackMain();
    showHint(hintFormFactor);
    return;
  }

  // --- STATE: half2032 special cases ---
  if (ff === "half2032") {
    // 2: half2032, half-cell type not chosen
    if (!hf) {
      hideStackMain();
      showHint(hintHalfType);
      return;
    }

    // 3a: half2032, cathode vs Li
    if (hf === "cathode-vs-Li") {
      // hide all anode-related UI
      anodeBlocks.forEach(b => { b.hidden = true; });

      if (!hasC) {
        hideStackMain();
        showHint(hintLoadCath);
        return;
      }

      hideAllHints();
      showStackMain();
      return;
    }

    // 3b: half2032, anode vs Li
    if (hf === "anode-vs-Li") {
      // hide all cathode-related UI
      cathodeBlocks.forEach(b => { b.hidden = true; });

      if (!hasA) {
        hideStackMain();
        showHint(hintLoadAnode);
        return;
      }

      hideAllHints();
      showStackMain();
      return;
    }

    // Fallback: unknown half-type
    hideStackMain();
    showHint(hintHalfType);
    return;
  }

  // --- STATE 1: form-factor chosen and NOT half2032 ---
  // show both cathode/anode blocks
  cathodeBlocks.forEach(b => { b.hidden = false; });
  anodeBlocks.forEach(b   => { b.hidden = false; });

  if (!hasC && !hasA) {
    hideStackMain();
    showHint(hintLoadAll);
    return;
  }

  hideAllHints();
  showStackMain();
}


function syncLoadButtonsVisibility() {
  if (PAGE !== "BAL") return;

  const ffSelect   = document.getElementById("form-factor");
  const halfSelect = document.getElementById("half-cell-type");

  const cathodeBtn     = document.getElementById("load-cathode-file-btn");
  const anodeBtn       = document.getElementById("load-anode-file-btn");
  const electrolyteBtn = document.getElementById("load-electrolyte-file-btn");
  const separatorBtn   = document.getElementById("load-separator-file-btn");

  const cathodeDiv     = document.getElementById("load-cathode-file-div");
  const anodeDiv       = document.getElementById("load-anode-file-div");
  const electrolyteDiv = document.getElementById("load-electrolyte-file-div");
  const separatorDiv   = document.getElementById("load-separator-file-div");

  const ff = ffSelect ? ffSelect.value : "";

  const setVisible = (el, visible) => {
    if (!el) return;
    el.style.display = visible ? "" : "none";
  };

  // 1. Форм-фактор не выбран → прячем ВСЕ кнопки компонентов
  if (!ff) {
    setVisible(cathodeDiv, false);    
    setVisible(anodeDiv, false);
    setVisible(electrolyteDiv, false);
    setVisible(separatorDiv, false);
    return;
  }

  // 2. Как только форм-фактор выбран → электролит и сепаратор всегда доступны
  setVisible(electrolyteDiv, true);
  setVisible(separatorDiv, true);

  // 3. Полуячейка 2032 против Li → выбираем, какая электродная кнопка видна
  if (ff === "half2032") {
    const half = halfSelect ? halfSelect.value : "";

    // пока тип половинки не выбран
    if (!half) {
    setVisible(electrolyteDiv, true);
    setVisible(separatorDiv, true);
      return;
    }

    if (half === "cathode-vs-Li") {
      setVisible(cathodeDiv, true);
      setVisible(anodeDiv, false);
      return;
    }

    if (half === "anode-vs-Li") {
      setVisible(cathodeDiv, false);
      setVisible(anodeDiv, true);
      return;
    }

    // fallback — на всякий случай обе
    setVisible(cathodeDiv, true);
    setVisible(anodeDiv, true);
    return;
  }

  // 4. Все НЕ-полуячейки → нужны и катод, и анод
  setVisible(cathodeDiv, true);
  setVisible(anodeDiv, true);
}



function syncHalfCellUI() {
  if (PAGE !== "BAL") return;

  const ffSelect        = document.getElementById("form-factor");
  const halfWrapper     = document.getElementById("half-cell-type-wrapper");
  const halfSelect      = document.getElementById("half-cell-type");
  const cathodeDetails  = document.getElementById("cathode-details");
  const anodeDetails    = document.getElementById("anode-details");
  const liFoilWrapper   = document.getElementById("li-foil-notes-wrapper");
  const liFoilTextarea  = document.getElementById("li-foil-notes");

  if (!ffSelect || !halfWrapper || !halfSelect || !cathodeDetails || !anodeDetails) return;

  const ff = ffSelect.value;

  // Not a half-cell → hide selector, show both blocks, hide Li-foil field
  if (ff !== "half2032") {
    halfWrapper.hidden = true;
    halfSelect.disabled = true;

    cathodeDetails.hidden = false;
    anodeDetails.hidden = false;

    if (liFoilWrapper && liFoilTextarea) {
      liFoilWrapper.hidden = true;
      liFoilTextarea.disabled = true;
    }
    return;
  }

  // Half-cell selected → show selector, enable it, show Li-foil field
  halfWrapper.hidden = false;
  halfSelect.disabled = false;

  if (liFoilWrapper && liFoilTextarea) {
    liFoilWrapper.hidden = false;
    liFoilTextarea.disabled = false;
  }

  const role = halfSelect.value;

  if (role === "cathode-vs-Li") {
    cathodeDetails.hidden = false;
    anodeDetails.hidden = true;
  } else if (role === "anode-vs-Li") {
    cathodeDetails.hidden = true;
    anodeDetails.hidden = false;
  } else {
    // type not chosen yet → keep both visible so nothing "mysteriously disappears"
    cathodeDetails.hidden = false;
    anodeDetails.hidden = false;
  }
}



function syncAllUI() {
  isSyncingUI = true;
  syncOtherInputsVisibility();
  applySeparatorLayoutRules();
  syncAllMixParams();                 // mix-dry / mix-wet
  syncMixParamsForGroup("application-method");
  syncMixParamsForGroup("etrode-shape");
  syncRecipeMeasurementMode();        // mass vs volume + actual table
  syncAllActualCodes();               // copy material code into actual table
  syncHalfCellUI();                   // half2032 cathode-vs-Li / anode-vs-Li visibility
  syncElectrodeStatusUI();            // NEW: grey out used electrodes
  syncStackVisibility();
  syncLoadButtonsVisibility(); 
  isSyncingUI = false;
}


if (PAGE === "separator") {
  initSeparatorPage();
}

async function initSeparatorPage() {
  await loadSeparatorStructures();
  await loadUsersForSeparator();
  initSeparatorSubmit();
}

async function loadSeparatorStructures() {
  const select = document.querySelector('[name="structure_id"]');
  if (!select) return;

  const res = await fetch('/api/structures');
  const structures = await res.json();

  structures.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.sep_str_id;
    opt.textContent = s.name;
    select.appendChild(opt);
  });
}

async function loadUsersForSeparator() {
  const select = document.querySelector('[name="created_by"]');
  if (!select) return;

  const res = await fetch('/api/users');
  const users = await res.json();

  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.user_id;
    opt.textContent = u.name;
    select.appendChild(opt);
  });
}


function initSeparatorSubmit() {
  const saveBtn = document.getElementById("saveBtn");
  if (!saveBtn) return;

  saveBtn.addEventListener("click", async () => {
    const form = document.forms['separator-form'];
    if (!form.reportValidity()) return;

    const data = Object.fromEntries(new FormData(form));

    const res = await fetch('/api/separators', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      alert('Ошибка сохранения');
      return;
    }

    alert('Сепаратор сохранён');
    form.reset();
  });
}



// <<----- SPECIFIC TO CERTAIN PAGES ----->>
// ----- BAL: Calculate Electrolyte Volume -----
const dropQuantity = document.getElementById('drop-quantity');
const dropVolume = document.getElementById('drop-volume');
const electrolyteVolume = document.getElementById('electrolyte-volume');

function updateElectrolyteVolume() {
	const dq = Number(dropQuantity.value) || 0;
	const dv = Number(dropVolume.value) || 0;
	electrolyteVolume.innerText =  dq * dv;
}

if (PAGE === "BAL" && dropQuantity && dropVolume && electrolyteVolume) {
  dropQuantity.addEventListener("change", updateElectrolyteVolume);
  dropVolume.addEventListener("change", updateElectrolyteVolume);
}


function initOperatorAutoFill() {
  // Работает только на страницах катода и анода
  if (PAGE !== "cathode" && PAGE !== "anode") return;

  // Берём все поля типа "0-drying-operator", "1-slurry-operator", ...
  const operatorInputs = Array.from(
    document.querySelectorAll('input[name$="-operator"]')
  );

  if (!operatorInputs.length) return;

  operatorInputs.forEach((input, index) => {
    input.addEventListener("change", () => {
      // Не вмешиваемся, если идёт гидратация/синхронизация UI
      if (isHydrating || isSyncingUI) return;

      const value = input.value;

      // Протаскиваем то же значение дальше по форме
      for (let i = index + 1; i < operatorInputs.length; i++) {
        operatorInputs[i].value = value;
      }

      // Обновляем JSON / автосейв, чтобы изменения попали в черновик
      update();
    });
  });
}



//
//
//
// ------- INITIALIZATION SEQUENCE -------
setStatus(SAVED_MESSAGE, false);	// since defer is used (see HTML file) // "Все изменения сохранены."
const form = document.querySelector('form'); // the only form on page
const GEOM_INPUT_IDS = new Set([
  "etrode-diameter",
  "etrode-length",
  "etrode-width",
]);

// Is the thing currently focused one of the geometry inputs?
function isGeometryActive() {
  const active = document.activeElement;
  return (
    active instanceof HTMLInputElement &&
    GEOM_INPUT_IDS.has(active.id)
  );
}

const output = document.getElementById("test-output");

initMixingUI();
initApplicationUI();
initElectrodeGeometryLogic();
initElectrodeShapeUI();
setupRecipeRows();
initRecipeMeasurementMode();
initActualCodeSync();
initElectrodeStatusUI();
initOperatorAutoFill();

syncAllUI(); // one initial pass after all listeners/widgets are ready



if (PAGE === "BAL") {
  const ffSelect = document.getElementById("form-factor");
  if (ffSelect) {
    ffSelect.addEventListener("change", () => {
      updateStackCheckboxState();
      syncHalfCellUI();
      syncStackVisibility();
      syncLoadButtonsVisibility();
    });
  }

  // NEW: Load autosaved draft manually
  const loadDraftBtn = document.getElementById("loadDraftBtn");
  if (loadDraftBtn) {
    loadDraftBtn.addEventListener("click", () => {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (!draft) {
        console.warn("Автосохранённого черновика не найдено.");
        return;
      }
      rehydrate(draft);
    });
  }

  const halfSelect = document.getElementById("half-cell-type");
  if (halfSelect) {
    halfSelect.addEventListener("change", () => {
      syncHalfCellUI();
      syncStackVisibility();
      syncLoadButtonsVisibility();
    });
  }

  // NEW: download updated cathode JSON (selected cathodes marked "used")
  const downloadUpdatedCathodeBtn = document.getElementById("download-updated-cathode-btn");
  if (downloadUpdatedCathodeBtn) {
    downloadUpdatedCathodeBtn.addEventListener("click", () => {
      if (!cathodeInfo || !stackCathodeDetail.length) {
        console.warn("Нет данных катода или не выбраны электроды стека.");
        return;
      }
      const updated = buildUpdatedComponent(cathodeInfo, stackCathodeDetail);
      if (!updated) return;
      downloadUpdatedComponentFile(updated, "cathode");
    });
  }

  // NEW: download updated anode JSON (selected anodes marked "used")
  const downloadUpdatedAnodeBtn = document.getElementById("download-updated-anode-btn");
  if (downloadUpdatedAnodeBtn) {
    downloadUpdatedAnodeBtn.addEventListener("click", () => {
      if (!anodeInfo || !stackAnodeDetail.length) {
        console.warn("Нет данных анода или не выбраны электроды стека.");
        return;
      }
      const updated = buildUpdatedComponent(anodeInfo, stackAnodeDetail);
      if (!updated) return;
      downloadUpdatedComponentFile(updated, "anode");
    });
  }
}



// ------- EVENT HOOKS -------
// - for Downloading -
document.getElementById("saveBtn").addEventListener("click", () => {
	setStatus(SAVING_MESSAGE, true);
	update();
	download();
	setTimeout(() => setStatus(SAVED_MESSAGE, false), 150);
});

// - for Autosave -
form.addEventListener("input", (e) => { 	// passing "e" just in case, for future debugging
	if (isHydrating === true) return;				// this prevents autosave flicker while hydrating

  const target = e.target;
  if (target instanceof HTMLInputElement && GEOM_INPUT_IDS.has(target.id)) {
    // для полей геометрии не запускаем тяжёлый autosave на каждый символ
    return;
  }

	// If later there are inputs whose changes should not start autosaving, add a condition here to skip them
	setStatus(SAVING_MESSAGE, true); 
	debounce(update);
});

GEOM_INPUT_IDS.forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;

  el.addEventListener("change", () => {
    if (isHydrating === true) return;
    setStatus(SAVING_MESSAGE, true);
    debounce(update);
  });
});


form.addEventListener("keypress", (e) => {
	if (e.key === "Enter") {
		if (isHydrating === true) return;				// this prevents autosave flicker while hydrating

		// If later there are inputs whose changes should not start autosaving, add a condition here to skip them
		setStatus(SAVING_MESSAGE, true); 
		debounce(update);
	}
});

// ------- REHYDRATE IF DRAFT EXISTS (но не для BAL) -------
if (PAGE !== "BAL") {
  const draft = localStorage.getItem(DRAFT_KEY);
  if (draft) rehydrate(draft);
}

// ------- AUTOSAVE LOOP -------
update();
setInterval(update, 5000); // sets autosave timer to call "update" every 5000 ms

// ------- CLEAR CONTENTS OF THE "FILE: " INPUT -------
const clearBtnExtra = document.getElementById("clearBtn");
clearBtnExtra?.addEventListener("click", () => {
  showLoadedFileName("");
});