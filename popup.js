const STORAGE_KEYS = {
  PLANTILLAS: "fixit_plantillas",
  FAVORITOS: "fixit_favoritos"
};

const MAX_FAVORITOS = 15;

let state = {
  plantillas: [],
  favoritos: [],
  filtroBusqueda: "",
  filtroMotivo: "",
  editingTemplateId: null,
  pendingFavoriteTemplateId: null
};

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  bindEvents();
  await initData();
  renderAll();
});

function cacheElements() {
  els.searchInput = document.getElementById("searchInput");
  els.motivoFilter = document.getElementById("motivoFilter");
  els.btnNuevaPlantilla = document.getElementById("btnNuevaPlantilla");
  els.btnExportar = document.getElementById("btnExportar");
  els.btnImportar = document.getElementById("btnImportar");
  els.fileImport = document.getElementById("fileImport");

  els.favoritosContainer = document.getElementById("favoritosContainer");
  els.favoritosCount = document.getElementById("favoritosCount");

  els.listaPlantillas = document.getElementById("listaPlantillas");
  els.plantillasCount = document.getElementById("plantillasCount");
  els.emptyState = document.getElementById("emptyState");

  els.modalPlantilla = document.getElementById("modalPlantilla");
  els.modalPlantillaTitle = document.getElementById("modalPlantillaTitle");
  els.templateCodigo = document.getElementById("templateCodigo");
  els.templateMotivo = document.getElementById("templateMotivo");
  els.templateTitulo = document.getElementById("templateTitulo");
  els.templateTexto = document.getElementById("templateTexto");
  els.btnGuardarPlantilla = document.getElementById("btnGuardarPlantilla");
  els.btnCancelarPlantilla = document.getElementById("btnCancelarPlantilla");

  els.modalFavorito = document.getElementById("modalFavorito");
  els.favoritoNombre = document.getElementById("favoritoNombre");
  els.btnGuardarFavorito = document.getElementById("btnGuardarFavorito");
  els.btnCancelarFavorito = document.getElementById("btnCancelarFavorito");

  els.plantillaCardTemplate = document.getElementById("plantillaCardTemplate");
}

function bindEvents() {
  els.searchInput.addEventListener("input", (e) => {
    state.filtroBusqueda = normalizeText(e.target.value);
    renderTemplates();
  });

  els.motivoFilter.addEventListener("change", (e) => {
    state.filtroMotivo = e.target.value;
    renderTemplates();
  });

  els.btnNuevaPlantilla.addEventListener("click", openCreateTemplateModal);
  els.btnGuardarPlantilla.addEventListener("click", handleSaveTemplate);
  els.btnCancelarPlantilla.addEventListener("click", closeTemplateModal);

  els.btnGuardarFavorito.addEventListener("click", handleSaveFavorite);
  els.btnCancelarFavorito.addEventListener("click", closeFavoriteModal);

  els.btnExportar.addEventListener("click", exportTemplatesAsJson);
  els.btnImportar.addEventListener("click", () => els.fileImport.click());
  els.fileImport.addEventListener("change", handleImportFile);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!els.modalFavorito.classList.contains("hidden")) {
        closeFavoriteModal();
        return;
      }

      if (!els.modalPlantilla.classList.contains("hidden")) {
        closeTemplateModal();
      }
    }
  });
}

async function initData() {
  const storedPlantillas = await getStorage(STORAGE_KEYS.PLANTILLAS);
  const storedFavoritos = await getStorage(STORAGE_KEYS.FAVORITOS);

  if (Array.isArray(storedPlantillas)) {
    state.plantillas = sanitizeTemplates(storedPlantillas);
  } else {
    state.plantillas = [];
    await setStorage(STORAGE_KEYS.PLANTILLAS, state.plantillas);
  }

  if (Array.isArray(storedFavoritos)) {
    state.favoritos = sanitizeFavorites(storedFavoritos);
  } else {
    state.favoritos = [];
    await setStorage(STORAGE_KEYS.FAVORITOS, state.favoritos);
  }
}

function renderAll() {
  renderMotivoFilter();
  renderFavorites();
  renderTemplates();
}

function renderMotivoFilter() {
  const motivos = [...new Set(state.plantillas.map((p) => p.motivo.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"));

  const current = state.filtroMotivo;
  els.motivoFilter.innerHTML = `<option value="">Todos los motivos de rechazo</option>`;

  motivos.forEach((motivo) => {
    const option = document.createElement("option");
    option.value = motivo;
    option.textContent = motivo;

    if (motivo === current) {
      option.selected = true;
    }

    els.motivoFilter.appendChild(option);
  });
}

function renderFavorites() {
  els.favoritosContainer.innerHTML = "";
  els.favoritosCount.textContent = `${state.favoritos.length}/${MAX_FAVORITOS}`;

  if (!state.favoritos.length) {
    const empty = document.createElement("div");
    empty.className = "helper-text";
    empty.textContent = "Aún no hay favoritos guardados.";
    els.favoritosContainer.appendChild(empty);
    return;
  }

  state.favoritos.forEach((fav) => {
    const btn = document.createElement("button");
    btn.className = "favorito-chip";
    btn.textContent = fav.nombre;
    btn.title = `${fav.nombre}\n\nClic: copiar\nClic derecho: eliminar`;
    btn.style.background = fav.color;

    btn.addEventListener("click", async () => {
      await copyToClipboard(fav.texto || "");
      showToastFallback(`Favorito "${fav.nombre}" copiado.`);
    });

    btn.addEventListener("contextmenu", async (e) => {
      e.preventDefault();
      await removeFavoriteById(fav.id, fav.nombre);
    });

    btn.addEventListener("mousedown", async (e) => {
      if (e.button === 2) {
        e.preventDefault();
        await removeFavoriteById(fav.id, fav.nombre);
      }
    });

    els.favoritosContainer.appendChild(btn);
  });
}

async function removeFavoriteById(id, nombre = "este favorito") {
  const ok = confirm(`¿Deseas eliminar el favorito "${nombre}"?`);
  if (!ok) return;

  state.favoritos = state.favoritos.filter((item) => item.id !== id);
  await setStorage(STORAGE_KEYS.FAVORITOS, state.favoritos);
  renderFavorites();
}

function renderTemplates() {
  const filtered = getFilteredTemplates();
  els.listaPlantillas.innerHTML = "";
  els.plantillasCount.textContent = String(filtered.length);

  if (!filtered.length) {
    els.emptyState.classList.remove("hidden");
    return;
  }

  els.emptyState.classList.add("hidden");

  filtered.forEach((template) => {
    const fragment = els.plantillaCardTemplate.content.cloneNode(true);

    fragment.querySelector(".plantilla-codigo").textContent = template.codigo || "Sin código";
    fragment.querySelector(".plantilla-motivo").textContent = template.motivo || "Sin motivo";
    fragment.querySelector(".plantilla-titulo").textContent = template.titulo || "Sin título";
    fragment.querySelector(".plantilla-texto").textContent = template.texto || "";

    fragment.querySelector(".btn-copy").addEventListener("click", async () => {
      await copyToClipboard(template.texto || "");
      showToastFallback(`Plantilla "${template.titulo}" copiada.`);
    });

    fragment.querySelector(".btn-fav").addEventListener("click", () => {
      openFavoriteModal(template.id);
    });

    fragment.querySelector(".btn-edit").addEventListener("click", () => {
      openEditTemplateModal(template.id);
    });

    fragment.querySelector(".btn-delete").addEventListener("click", async () => {
      const ok = confirm(`¿Eliminar la plantilla "${template.titulo}"?`);
      if (!ok) return;

      state.plantillas = state.plantillas.filter((item) => item.id !== template.id);
      await setStorage(STORAGE_KEYS.PLANTILLAS, state.plantillas);

      if (state.filtroMotivo && !state.plantillas.some((p) => p.motivo === state.filtroMotivo)) {
        state.filtroMotivo = "";
        els.motivoFilter.value = "";
      }

      renderAll();
    });

    els.listaPlantillas.appendChild(fragment);
  });
}

function getFilteredTemplates() {
  return state.plantillas.filter((template) => {
    const matchesMotivo =
      !state.filtroMotivo || template.motivo === state.filtroMotivo;

    const codigo = normalizeText(template.codigo);
    const titulo = normalizeText(template.titulo);

    const matchesSearch =
      !state.filtroBusqueda ||
      codigo.includes(state.filtroBusqueda) ||
      titulo.includes(state.filtroBusqueda);

    return matchesMotivo && matchesSearch;
  });
}

function openCreateTemplateModal() {
  state.editingTemplateId = null;
  els.modalPlantillaTitle.textContent = "Nueva plantilla";
  els.templateCodigo.value = "";
  els.templateMotivo.value = "";
  els.templateTitulo.value = "";
  els.templateTexto.value = "";
  openModal(els.modalPlantilla);

  setTimeout(() => {
    els.templateCodigo.focus();
  }, 50);
}

function openEditTemplateModal(templateId) {
  const template = state.plantillas.find((item) => item.id === templateId);
  if (!template) return;

  state.editingTemplateId = templateId;
  els.modalPlantillaTitle.textContent = "Editar plantilla";
  els.templateCodigo.value = template.codigo || "";
  els.templateMotivo.value = template.motivo || "";
  els.templateTitulo.value = template.titulo || "";
  els.templateTexto.value = template.texto || "";
  openModal(els.modalPlantilla);

  setTimeout(() => {
    els.templateTitulo.focus();
  }, 50);
}

async function handleSaveTemplate() {
  const codigo = els.templateCodigo.value.trim();
  const motivo = els.templateMotivo.value.trim();
  const titulo = els.templateTitulo.value.trim();
  const texto = els.templateTexto.value.trim();

  if (!motivo) {
    alert("Debes seleccionar un motivo de rechazo.");
    els.templateMotivo.focus();
    return;
  }

  if (!titulo) {
    alert("Debes ingresar el título de la plantilla.");
    els.templateTitulo.focus();
    return;
  }

  if (!texto) {
    alert("Debes ingresar el texto de la plantilla.");
    els.templateTexto.focus();
    return;
  }

  if (state.editingTemplateId) {
    state.plantillas = state.plantillas.map((item) =>
      item.id === state.editingTemplateId
        ? { ...item, codigo, motivo, titulo, texto }
        : item
    );
  } else {
    state.plantillas.unshift({
      id: createId(),
      codigo,
      motivo,
      titulo,
      texto
    });
  }

  await setStorage(STORAGE_KEYS.PLANTILLAS, state.plantillas);
  closeTemplateModal();
  renderAll();
}

function openFavoriteModal(templateId) {
  if (state.favoritos.length >= MAX_FAVORITOS) {
    alert(`Ya alcanzaste el máximo de ${MAX_FAVORITOS} favoritos.`);
    return;
  }

  const template = state.plantillas.find((item) => item.id === templateId);
  if (!template) return;

  state.pendingFavoriteTemplateId = templateId;
  els.favoritoNombre.value = template.titulo || "";
  openModal(els.modalFavorito);

  setTimeout(() => {
    els.favoritoNombre.focus();
    els.favoritoNombre.select();
  }, 50);
}

async function handleSaveFavorite() {
  const nombre = els.favoritoNombre.value.trim();

  if (!nombre) {
    alert("Debes escribir un nombre para el favorito.");
    els.favoritoNombre.focus();
    return;
  }

  const template = state.plantillas.find((item) => item.id === state.pendingFavoriteTemplateId);
  if (!template) {
    alert("No fue posible recuperar la plantilla para guardar el favorito.");
    return;
  }

  const favorito = {
    id: createId(),
    templateId: template.id,
    nombre,
    texto: template.texto || "",
    color: getRandomColor()
  };

  state.favoritos.unshift(favorito);
  state.favoritos = state.favoritos.slice(0, MAX_FAVORITOS);

  await setStorage(STORAGE_KEYS.FAVORITOS, state.favoritos);
  closeFavoriteModal();
  renderFavorites();
}

function closeTemplateModal() {
  closeModal(els.modalPlantilla);
}

function closeFavoriteModal() {
  state.pendingFavoriteTemplateId = null;
  closeModal(els.modalFavorito);
}

function openModal(modalEl) {
  modalEl.classList.remove("hidden");
}

function closeModal(modalEl) {
  modalEl.classList.add("hidden");
}

function closeModalById(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("hidden");
}

async function exportTemplatesAsJson() {
  const data = JSON.stringify(state.plantillas, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "fixit-plantillas.json";
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) {
      throw new Error("El JSON debe contener un arreglo de plantillas.");
    }

    const imported = sanitizeTemplates(parsed).map((item) => ({
      ...item,
      id: item.id || createId()
    }));

    const merged = mergeTemplates(state.plantillas, imported);
    state.plantillas = merged;

    await setStorage(STORAGE_KEYS.PLANTILLAS, state.plantillas);
    renderAll();

    alert(`Importación completada. Total de plantillas: ${state.plantillas.length}`);
  } catch (error) {
    console.error(error);
    alert(`No fue posible importar el archivo JSON.\n${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function mergeTemplates(current, incoming) {
  const map = new Map();

  [...current, ...incoming].forEach((item) => {
    const codigo = (item.codigo || "").trim().toLowerCase();
    const motivo = (item.motivo || "").trim().toLowerCase();
    const titulo = (item.titulo || "").trim().toLowerCase();
    const texto = (item.texto || "").trim().toLowerCase();

    const uniqueKey = `${codigo}__${motivo}__${titulo}__${texto}`;

    if (!map.has(uniqueKey)) {
      map.set(uniqueKey, {
        id: item.id || createId(),
        codigo: item.codigo || "",
        motivo: item.motivo || "",
        titulo: item.titulo || "",
        texto: item.texto || ""
      });
    }
  });

  return Array.from(map.values());
}

function sanitizeTemplates(arr) {
  return arr
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: item.id || createId(),
      codigo: safeString(item.codigo),
      motivo: safeString(item.motivo),
      titulo: safeString(item.titulo),
      texto: safeString(item.texto)
    }));
}

function sanitizeFavorites(arr) {
  return arr
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: item.id || createId(),
      templateId: item.templateId || null,
      nombre: safeString(item.nombre),
      texto: safeString(item.texto),
      color: item.color || getRandomColor()
    }))
    .slice(0, MAX_FAVORITOS);
}

function safeString(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalizeText(value) {
  return safeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getRandomColor() {
  const palette = [
    "linear-gradient(135deg, #ef4444, #f97316)",
    "linear-gradient(135deg, #eab308, #f59e0b)",
    "linear-gradient(135deg, #22c55e, #14b8a6)",
    "linear-gradient(135deg, #06b6d4, #3b82f6)",
    "linear-gradient(135deg, #3b82f6, #6366f1)",
    "linear-gradient(135deg, #8b5cf6, #a855f7)",
    "linear-gradient(135deg, #ec4899, #f43f5e)",
    "linear-gradient(135deg, #14b8a6, #10b981)",
    "linear-gradient(135deg, #f97316, #ef4444)",
    "linear-gradient(135deg, #6366f1, #8b5cf6)"
  ];

  return palette[Math.floor(Math.random() * palette.length)];
}

function createId() {
  return `id_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function showToastFallback(message) {
  console.log(message);
}

function getStorage(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key]);
    });
  });
}

function setStorage(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}