const STORAGE_KEY = "plantillas";

// Estado UI
let currentSearch = "";
let currentActivoFilter = "activos"; // "activos" | "todos"
let currentMotivoFilter = "";        // "" = todos

function uuid() {
  return crypto.randomUUID();
}

function escapeHtml(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getPlantillas() {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  const list = result[STORAGE_KEY];
  return Array.isArray(list) ? list : [];
}

async function setPlantillas(plantillas) {
  await chrome.storage.local.set({ [STORAGE_KEY]: plantillas });
}

/* ---------------------------
   Form helpers
----------------------------*/
function setEditMode(on) {
  const btnSave = document.getElementById("btn-save");
  const btnUpdate = document.getElementById("btn-update");
  const btnCancel = document.getElementById("btn-cancel");
  const formTitle = document.getElementById("form-title");

  btnSave.style.display = on ? "none" : "inline-block";
  btnUpdate.style.display = on ? "inline-block" : "none";
  btnCancel.style.display = on ? "inline-block" : "none";
  formTitle.textContent = on ? "Editar plantilla" : "Nueva plantilla";
}

function fillForm(p) {
  document.getElementById("codigo").value = p.codigo || "";
  document.getElementById("motivo").value = p.categoria || ""; // UI: motivo -> storage: categoria
  document.getElementById("titulo").value = p.titulo || "";
  document.getElementById("descripcion").value = p.descripcion || "";
  document.getElementById("edit-id").value = p.id || "";
}

function clearForm() {
  document.getElementById("codigo").value = "";
  document.getElementById("motivo").value = "";
  document.getElementById("titulo").value = "";
  document.getElementById("descripcion").value = "";
  document.getElementById("edit-id").value = "";
  setEditMode(false);
}

function readForm() {
  const codigo = document.getElementById("codigo").value.trim();
  const motivo = document.getElementById("motivo").value.trim();
  const titulo = document.getElementById("titulo").value.trim();
  const descripcion = document.getElementById("descripcion").value.trim();
  return { codigo, motivo, titulo, descripcion };
}

function validateForm({ codigo, motivo, titulo, descripcion }) {
  if (!codigo || !motivo || !titulo || !descripcion) {
    alert("Todos los campos son obligatorios.");
    return false;
  }
  return true;
}

/* ---------------------------
   CRUD
----------------------------*/
async function savePlantilla() {
  const form = readForm();
  if (!validateForm(form)) return;

  const plantillas = await getPlantillas();

  plantillas.unshift({
    id: uuid(),
    codigo: form.codigo,
    categoria: form.motivo, // storage: categoria
    titulo: form.titulo,
    descripcion: form.descripcion,
    activo: true
  });

  await setPlantillas(plantillas);
  clearForm();
  await render();
}

async function updatePlantilla() {
  const editId = document.getElementById("edit-id").value;
  if (!editId) {
    alert("No hay plantilla seleccionada para editar.");
    return;
  }

  const form = readForm();
  if (!validateForm(form)) return;

  const plantillas = await getPlantillas();
  const idx = plantillas.findIndex(p => p.id === editId);

  if (idx === -1) {
    alert("No se encontró la plantilla a editar.");
    clearForm();
    return;
  }

  const activoActual = Boolean(plantillas[idx].activo);

  plantillas[idx] = {
    id: editId,
    codigo: form.codigo,
    categoria: form.motivo, // storage: categoria
    titulo: form.titulo,
    descripcion: form.descripcion,
    activo: activoActual
  };

  await setPlantillas(plantillas);
  clearForm();
  await render();
}

/* ---------------------------
   Insert / Copy
----------------------------*/
async function copyDescripcion(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert("Descripción copiada.");
  } catch {
    alert("No se pudo copiar. Intenta manualmente.");
  }
}

async function insertDescripcion(text) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    alert("No se encontró la pestaña activa.");
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "INSERT_TEXT",
    text
  });

  if (!response?.ok) {
    alert("No se pudo insertar. Asegúrate de tener un campo activo. (Puedes usar Copiar)");
  }
}

/* ---------------------------
   Import / Export
----------------------------*/
function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportJSON() {
  const plantillas = await getPlantillas();
  const payload = {
    exportedAt: new Date().toISOString(),
    count: plantillas.length,
    plantillas
  };
  const filename = `gestor_motivos_${new Date().toISOString().slice(0, 10)}.json`;
  downloadTextFile(filename, JSON.stringify(payload, null, 2));
}

async function importJSONFile(file) {
  const text = await file.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    alert("El archivo no es un JSON válido.");
    return;
  }

  const incoming = Array.isArray(data) ? data : data.plantillas;
  if (!Array.isArray(incoming)) {
    alert("El JSON no contiene una lista válida de plantillas.");
    return;
  }

  // Compatibilidad:
  // - acepta "categoria" (antiguo) o "motivo" (nuevo) en el JSON
  const cleaned = incoming
    .filter(p =>
      p &&
      (p.id || p.codigo) &&
      p.codigo &&
      (p.categoria || p.motivo) &&
      p.titulo &&
      typeof p.descripcion === "string"
    )
    .map(p => ({
      id: p.id ? String(p.id) : uuid(),
      codigo: String(p.codigo).trim(),
      categoria: String(p.categoria ?? p.motivo).trim(),
      titulo: String(p.titulo).trim(),
      descripcion: String(p.descripcion),
      activo: p.activo === undefined ? true : Boolean(p.activo)
    }));

  if (!cleaned.length) {
    alert("No se encontraron plantillas válidas en el archivo.");
    return;
  }

  const current = await getPlantillas();
  const byId = new Map(current.map(p => [p.id, p]));

  for (const p of cleaned) {
    byId.set(p.id, p);
  }

  const merged = Array.from(byId.values());
  await setPlantillas(merged);

  alert(`Importación exitosa: ${cleaned.length} plantillas procesadas.`);
  await render();
}

/* ---------------------------
   Render
----------------------------*/
function buildItemHtml(p) {
  const codigo = escapeHtml(p.codigo || "");
  const titulo = escapeHtml(p.titulo || "");
  const motivo = escapeHtml(p.categoria || "");
  const descripcion = escapeHtml(p.descripcion || "");

  const estadoPill = p.activo
    ? `<span class="pill ok">ACTIVO</span>`
    : `<span class="pill off">INACTIVO</span>`;

  return `
    <div class="item-head">
      <div>
        <div class="item-code">
          <span>${codigo}</span>
          ${estadoPill}
        </div>
        <div class="item-title">${titulo}</div>
      </div>
    </div>

    <div class="item-sub">
      <div class="kv">
        <span class="k">Motivo de Rechazo</span>
        <span class="v">${motivo}</span>
      </div>
      <div class="kv">
        <span class="k">Acciones</span>
        <span class="v">Copiar / Insertar / Editar</span>
      </div>
    </div>

    <div class="desc">${descripcion}</div>

    <div class="row-actions">
      <button data-id="${p.id}" class="btn small copy">Copiar</button>
      <button data-id="${p.id}" class="btn small insert">Insertar</button>
      <button data-id="${p.id}" class="btn small edit">Editar</button>
      <button data-id="${p.id}" class="btn small toggle">${p.activo ? "Desactivar" : "Activar"}</button>
      <button data-id="${p.id}" class="btn small danger delete">Eliminar</button>
    </div>
  `;
}

async function render() {
  const plantillas = await getPlantillas();

  // 1) Motivos únicos (desde el campo interno categoria)
  const motivos = Array.from(
    new Set(plantillas.map(p => p.categoria).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "es"));

  const motivoSelect = document.getElementById("filter-motivo");
  const existing = new Set(Array.from(motivoSelect.options).map(o => o.value));

  for (const m of motivos) {
    if (!existing.has(m)) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      motivoSelect.appendChild(opt);
    }
  }

  // 2) Aplicar filtros
  let filtered = [...plantillas];

  if (currentActivoFilter === "activos") {
    filtered = filtered.filter(p => p.activo);
  }

  if (currentMotivoFilter) {
    filtered = filtered.filter(p => p.categoria === currentMotivoFilter);
  }

  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    filtered = filtered.filter(p =>
      (p.codigo || "").toLowerCase().includes(q) ||
      (p.categoria || "").toLowerCase().includes(q) ||
      (p.titulo || "").toLowerCase().includes(q) ||
      (p.descripcion || "").toLowerCase().includes(q)
    );
  }

  // contador
  const countEl = document.getElementById("count");
  if (countEl) countEl.textContent = `${filtered.length}`;

  // 3) render lista
  const list = document.getElementById("list");
  list.innerHTML = "";

  if (!filtered.length) {
    list.innerHTML = `<p class="muted">No hay resultados.</p>`;
    return;
  }

  for (const p of filtered) {
    const div = document.createElement("div");
    div.className = "item" + (p.activo ? "" : " inactive");
    div.innerHTML = buildItemHtml(p);
    list.appendChild(div);
  }
}

/* ---------------------------
   Events
----------------------------*/
document.getElementById("btn-save").addEventListener("click", savePlantilla);
document.getElementById("btn-update").addEventListener("click", updatePlantilla);
document.getElementById("btn-cancel").addEventListener("click", clearForm);

document.getElementById("btn-export").addEventListener("click", exportJSON);

document.getElementById("btn-import").addEventListener("click", () => {
  document.getElementById("file-import").click();
});

document.getElementById("file-import").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  await importJSONFile(file);
  e.target.value = "";
});

document.getElementById("search").addEventListener("input", (e) => {
  currentSearch = e.target.value.trim();
  render();
});

document.getElementById("filter-activo").addEventListener("change", (e) => {
  currentActivoFilter = e.target.value;
  render();
});

document.getElementById("filter-motivo").addEventListener("change", (e) => {
  currentMotivoFilter = e.target.value;
  render();
});

// Delegación de eventos en botones de items
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const id = btn.dataset.id;
  if (!id) return;

  const plantillas = await getPlantillas();
  const index = plantillas.findIndex(p => p.id === id);
  if (index === -1) return;

  if (btn.classList.contains("edit")) {
    fillForm(plantillas[index]);
    setEditMode(true);
    return;
  }

  if (btn.classList.contains("copy")) {
    await copyDescripcion(plantillas[index].descripcion || "");
    return;
  }

  if (btn.classList.contains("insert")) {
    await insertDescripcion(plantillas[index].descripcion || "");
    return;
  }

  if (btn.classList.contains("toggle")) {
    plantillas[index].activo = !plantillas[index].activo;
    await setPlantillas(plantillas);
    await render();
    return;
  }

  if (btn.classList.contains("delete")) {
    const ok = confirm("¿Eliminar esta plantilla?");
    if (!ok) return;

    plantillas.splice(index, 1);
    await setPlantillas(plantillas);
    await render();
    return;
  }
});

// Inicial
render();