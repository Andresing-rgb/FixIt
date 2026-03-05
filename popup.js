const STORAGE_KEY = "plantillas";

// Estado UI
let currentSearch = "";
let currentActivoFilter = "activos"; // "activos" | "todos"
let currentMotivoFilter = "";        // "" = todos

let toastTimer = null;

/* ============================
   Utilidades
============================ */

function uuid() {
  return crypto.randomUUID();
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ============================
   Toast
============================ */

function showToast(message, title = "Listo", ms = 1000) {
  const el = document.getElementById("toast");
  if (!el) return;

  el.innerHTML = `
    <p class="t-title">${escapeHtml(title)}</p>
    <p class="t-msg">${escapeHtml(message)}</p>
  `;

  el.classList.remove("show");
  void el.offsetWidth; // reflow
  el.classList.add("show");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

/* ============================
   Storage (LOCAL)
============================ */

async function getPlantillas() {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  const list = result[STORAGE_KEY];
  return Array.isArray(list) ? list : [];
}

async function setPlantillas(plantillas) {
  await chrome.storage.local.set({ [STORAGE_KEY]: plantillas });
}

/* ============================
   Form helpers
============================ */

function setEditMode(on) {
  const btnSave = document.getElementById("btn-save");
  const btnUpdate = document.getElementById("btn-update");
  const btnCancel = document.getElementById("btn-cancel");
  const formTitle = document.getElementById("form-title");

  if (btnSave) btnSave.style.display = on ? "none" : "inline-block";
  if (btnUpdate) btnUpdate.style.display = on ? "inline-block" : "none";
  if (btnCancel) btnCancel.style.display = on ? "inline-block" : "none";
  if (formTitle) formTitle.textContent = on ? "Editar plantilla" : "Nueva plantilla";
}

function fillForm(p) {
  document.getElementById("codigo").value = p.codigo || "";
  document.getElementById("motivo").value = p.motivo || p.categoria || "";
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
    showToast("Todos los campos son obligatorios.", "Error", 1400);
    return false;
  }
  return true;
}

/* ============================
   CRUD
============================ */

async function savePlantilla() {
  const form = readForm();
  if (!validateForm(form)) return;

  const plantillas = await getPlantillas();

  plantillas.unshift({
    id: uuid(),
    codigo: form.codigo,
    motivo: form.motivo,
    titulo: form.titulo,
    descripcion: form.descripcion,
    activo: true
  });

  await setPlantillas(plantillas);
  clearForm();
  await render();

  showToast("Plantilla creada.", "Guardar", 1000);
}

async function updatePlantilla() {
  const editId = document.getElementById("edit-id").value;
  if (!editId) {
    showToast("No hay plantilla seleccionada para editar.", "Error", 1400);
    return;
  }

  const form = readForm();
  if (!validateForm(form)) return;

  const plantillas = await getPlantillas();
  const idx = plantillas.findIndex(p => p.id === editId);

  if (idx === -1) {
    showToast("No se encontró la plantilla a editar.", "Error", 1400);
    clearForm();
    return;
  }

  const activoActual = Boolean(plantillas[idx].activo);

  plantillas[idx] = {
    id: editId,
    codigo: form.codigo,
    motivo: form.motivo,
    titulo: form.titulo,
    descripcion: form.descripcion,
    activo: activoActual
  };

  await setPlantillas(plantillas);
  clearForm();
  await render();

  showToast("Plantilla actualizada.", "Editar", 1000);
}

/* ============================
   Copiar / Insertar
============================ */

async function copyDescripcion(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Descripción copiada.", "Copiar", 1000);
  } catch (err) {
    console.error(err);
    showToast("No se pudo copiar. Intenta manualmente.", "Error", 1400);
  }
}

async function insertDescripcion(text) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showToast("No se encontró la pestaña activa.", "Error", 1400);
      return;
    }

    // Inyectar content.js (por si aún no está)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "INSERT_TEXT",
      text
    });

    if (!response?.ok) {
      showToast("No se pudo insertar. Haz clic en un campo primero.", "Insertar", 1400);
    } else {
      showToast("Texto insertado.", "Insertar", 900);
    }
  } catch (err) {
    console.error(err);
    showToast("Fallo al insertar en la página.", "Error", 1400);
  }
}

/* ============================
   Import / Export
============================ */

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

  const filename = `motivos_rechazo_${new Date().toISOString().slice(0, 10)}.json`;
  downloadTextFile(filename, JSON.stringify(payload, null, 2));
  showToast("Exportación lista.", "Exportar", 1000);
}

async function importJSONFile(file) {
  let text = "";
  try {
    text = await file.text();
  } catch (err) {
    console.error(err);
    showToast("No se pudo leer el archivo.", "Error", 1400);
    return;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error(err);
    showToast("El archivo no es un JSON válido.", "Error", 1400);
    return;
  }

  const incoming = Array.isArray(data) ? data : data.plantillas;
  if (!Array.isArray(incoming)) {
    showToast("El JSON no contiene una lista válida de plantillas.", "Error", 1400);
    return;
  }

  // Compatibilidad: acepta "motivo" o "categoria"
  const cleaned = incoming
    .filter(p =>
      p &&
      p.codigo &&
      (p.motivo || p.categoria) &&
      p.titulo &&
      typeof p.descripcion === "string"
    )
    .map(p => ({
      id: p.id ? String(p.id) : uuid(),
      codigo: String(p.codigo).trim(),
      motivo: String(p.motivo ?? p.categoria).trim(),
      titulo: String(p.titulo).trim(),
      descripcion: String(p.descripcion),
      activo: p.activo === undefined ? true : Boolean(p.activo)
    }));

  if (!cleaned.length) {
    showToast("No se encontraron plantillas válidas en el JSON.", "Error", 1400);
    return;
  }

  // Mezclar por ID (si existe, reemplaza)
  const current = await getPlantillas();
  const byId = new Map(current.map(p => [p.id, p]));
  for (const p of cleaned) byId.set(p.id, p);

  const merged = Array.from(byId.values());
  await setPlantillas(merged);

  showToast(`Importadas: ${cleaned.length} plantillas.`, "Importar", 1200);
  await render();
}

/* ============================
   Render
============================ */

function buildItemHtml(p) {
  const codigo = escapeHtml(p.codigo || "");
  const motivo = escapeHtml(p.motivo || "");
  const titulo = escapeHtml(p.titulo || "");
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
        <span class="k">Pegable</span>
        <span class="v">Copiar o Insertar</span>
      </div>
    </div>

    <div class="desc">${descripcion}</div>

    <div class="row-actions">
      <button data-id="${p.id}" class="btn small secondary copy" type="button">Copiar</button>
      <button data-id="${p.id}" class="btn small primary insert" type="button">Insertar</button>
      <button data-id="${p.id}" class="btn small secondary edit" type="button">Editar</button>
      <button data-id="${p.id}" class="btn small warning toggle" type="button">${p.activo ? "Desactivar" : "Activar"}</button>
      <button data-id="${p.id}" class="btn small danger delete" type="button">Eliminar</button>
    </div>
  `;
}

async function render() {
  const plantillas = await getPlantillas();

  // filtros
  let filtered = [...plantillas];

  if (currentActivoFilter === "activos") {
    filtered = filtered.filter(p => p.activo);
  }

  if (currentMotivoFilter) {
    filtered = filtered.filter(p => p.motivo === currentMotivoFilter);
  }

  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    filtered = filtered.filter(p =>
      (p.codigo || "").toLowerCase().includes(q) ||
      (p.motivo || "").toLowerCase().includes(q) ||
      (p.titulo || "").toLowerCase().includes(q) ||
      (p.descripcion || "").toLowerCase().includes(q)
    );
  }

  // contador
  const countEl = document.getElementById("count");
  if (countEl) countEl.textContent = `${filtered.length}`;

  // lista
  const list = document.getElementById("list");
  if (!list) return;

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

/* ============================
   Listeners (inicialización)
============================ */

function init() {
  // Botones del formulario
  document.getElementById("btn-save")?.addEventListener("click", savePlantilla);
  document.getElementById("btn-update")?.addEventListener("click", updatePlantilla);
  document.getElementById("btn-cancel")?.addEventListener("click", clearForm);

  // Export
  document.getElementById("btn-export")?.addEventListener("click", exportJSON);

  // Import (FIX: handler sin async para preservar el "user gesture")
  const btnImport = document.getElementById("btn-import");
  const fileImport = document.getElementById("file-import");

  if (btnImport && fileImport) {
    btnImport.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        // permitir re-importar el mismo archivo
        fileImport.value = "";
        fileImport.focus();

        // abrir selector
        fileImport.click();
      } catch (err) {
        console.error("Error abriendo selector de archivo:", err);
        showToast("No se pudo abrir el selector de archivo.", "Error", 1500);
      }
    });

    fileImport.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await importJSONFile(file);
      e.target.value = "";
    });
  } else {
    console.error("No se encontró btn-import o file-import en el DOM.");
  }

  // Búsqueda / filtros
  document.getElementById("search")?.addEventListener("input", (e) => {
    currentSearch = e.target.value.trim();
    render();
  });

  document.getElementById("filter-activo")?.addEventListener("change", (e) => {
    currentActivoFilter = e.target.value;
    render();
  });

  document.getElementById("filter-motivo")?.addEventListener("change", (e) => {
    currentMotivoFilter = e.target.value;
    render();
  });

  // Delegación de clicks en items
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
      showToast(plantillas[index].activo ? "Plantilla activada." : "Plantilla desactivada.", "Estado", 1000);
      return;
    }

    if (btn.classList.contains("delete")) {
      const ok = confirm("¿Eliminar esta plantilla?");
      if (!ok) return;

      plantillas.splice(index, 1);
      await setPlantillas(plantillas);
      await render();
      showToast("Plantilla eliminada.", "Eliminar", 1000);
    }
  });

  // Render inicial
  render();
}

// Arranque seguro
document.addEventListener("DOMContentLoaded", () => {
  init();

  // Autofocus en el buscador al abrir la extensión
  setTimeout(() => {
    const search = document.getElementById("search");
    if (search) {
      search.focus();
      search.select(); // opcional: selecciona texto si existe
    }
  }, 120);
});