const state = {
  files: [],
  images: [],
  firstItemMetadata: {
    website: "",
    annotation: "",
    folders: [],
  },
  canvas: null,
};

const elements = {
  summary: document.querySelector("#selection-summary"),
  clearButton: document.querySelector("#clear-button"),
  dropZone: document.querySelector("#drop-zone"),
  mode: document.querySelector("#layout-mode"),
  lineEnabled: document.querySelector("#line-enabled"),
  lineWidth: document.querySelector("#line-width"),
  lineColor: document.querySelector("#line-color"),
  canvas: document.querySelector("#preview-canvas"),
  empty: document.querySelector("#empty-state"),
  status: document.querySelector("#status"),
  combineButton: document.querySelector("#combine-button"),
};

function setStatus(message, kind = "") {
  elements.status.textContent = message;
  elements.status.className = kind;
}

function cleanName(name) {
  return (name || "combined").replace(/\.[^.]+$/, "").replace(/\s?\(\d+\)$/, "");
}

function resetMetadata() {
  state.firstItemMetadata = {
    website: "",
    annotation: "",
    folders: [],
  };
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ file, image });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} を読み込めませんでした`));
    };
    image.src = url;
  });
}

async function fetchFirstItemMetadata(fileName) {
  resetMetadata();

  if (!window.eagle || !eagle.item?.get) {
    return;
  }

  const keyword = cleanName(fileName);
  try {
    const items = await eagle.item.get({
      keywords: [keyword],
      fields: ["url", "annotation", "folders"],
    });
    const item = Array.isArray(items) ? items[0] : null;
    if (!item) {
      return;
    }

    state.firstItemMetadata = {
      website: item.url || "",
      annotation: item.annotation || "",
      folders: Array.isArray(item.folders) ? item.folders : [],
    };
  } catch (error) {
    console.warn("Eagle metadata lookup failed:", error);
  }
}

function drawImageWithWhiteBackground(ctx, image, x, y, width, height) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, width, height);
  ctx.drawImage(image, x, y, width, height);
}

function buildCombinedCanvas() {
  const mode = elements.mode.value;
  const lineWidth = elements.lineEnabled.checked ? Number(elements.lineWidth.value || 0) : 0;
  const lineColor = elements.lineColor.value;
  const sourceImages = state.images.map(({ image }) => image);

  if (sourceImages.length === 0) {
    return null;
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (mode === "horizontal") {
    const baseHeight = sourceImages[0].naturalHeight;
    const resized = sourceImages.map((image) => ({
      image,
      width: Math.round(image.naturalWidth * baseHeight / image.naturalHeight),
      height: baseHeight,
    }));
    canvas.width = resized.reduce((sum, entry) => sum + entry.width, 0) + lineWidth * (resized.length - 1);
    canvas.height = baseHeight;
    ctx.fillStyle = lineColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let x = 0;
    for (const entry of resized) {
      drawImageWithWhiteBackground(ctx, entry.image, x, 0, entry.width, entry.height);
      x += entry.width + lineWidth;
    }
  }

  if (mode === "vertical") {
    const baseWidth = sourceImages[0].naturalWidth;
    const resized = sourceImages.map((image) => ({
      image,
      width: baseWidth,
      height: Math.round(image.naturalHeight * baseWidth / image.naturalWidth),
    }));
    canvas.width = baseWidth;
    canvas.height = resized.reduce((sum, entry) => sum + entry.height, 0) + lineWidth * (resized.length - 1);
    ctx.fillStyle = lineColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let y = 0;
    for (const entry of resized) {
      drawImageWithWhiteBackground(ctx, entry.image, 0, y, entry.width, entry.height);
      y += entry.height + lineWidth;
    }
  }

  if (mode === "grid2") {
    const baseWidth = sourceImages[0].naturalWidth;
    const resized = sourceImages.map((image) => ({
      image,
      width: baseWidth,
      height: Math.round(image.naturalHeight * baseWidth / image.naturalWidth),
    }));
    const rowHeights = [];
    for (let index = 0; index < resized.length; index += 2) {
      rowHeights.push(Math.max(...resized.slice(index, index + 2).map((entry) => entry.height)));
    }

    canvas.width = baseWidth * 2 + lineWidth;
    canvas.height = rowHeights.reduce((sum, height) => sum + height, 0) + lineWidth * (rowHeights.length - 1);
    ctx.fillStyle = lineColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let y = 0;
    for (let row = 0; row < rowHeights.length; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        const index = row * 2 + column;
        const entry = resized[index];
        if (entry) {
          const x = column * (baseWidth + lineWidth);
          drawImageWithWhiteBackground(ctx, entry.image, x, y, entry.width, entry.height);
        }
      }
      y += rowHeights[row] + lineWidth;
    }
  }

  return canvas;
}

function renderPreview() {
  state.canvas = buildCombinedCanvas();
  if (!state.canvas) {
    elements.canvas.style.display = "none";
    elements.empty.style.display = "block";
    return;
  }

  elements.canvas.width = state.canvas.width;
  elements.canvas.height = state.canvas.height;
  elements.canvas.getContext("2d").drawImage(state.canvas, 0, 0);
  elements.canvas.style.display = "block";
  elements.empty.style.display = "none";
}

async function addFiles(fileList) {
  const imageFiles = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
  if (imageFiles.length === 0) {
    setStatus("画像ファイルがありません", "error");
    return;
  }

  try {
    setStatus("画像を読み込み中...");
    const wasEmpty = state.files.length === 0;
    const loaded = await Promise.all(imageFiles.map(loadImageFile));

    state.files.push(...imageFiles);
    state.images.push(...loaded);

    if (wasEmpty && state.files[0]) {
      await fetchFirstItemMetadata(state.files[0].name);
    }

    elements.summary.textContent = `${state.images.length}枚の画像を追加済み`;
    elements.combineButton.disabled = state.images.length === 0;
    setStatus(`${imageFiles.length}枚追加しました`);
    renderPreview();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function clearImages() {
  state.files = [];
  state.images = [];
  state.canvas = null;
  resetMetadata();
  elements.summary.textContent = "ローカル画像をドロップしてください";
  elements.combineButton.disabled = true;
  setStatus("クリアしました");
  renderPreview();
}

async function addCombinedItem() {
  if (state.images.length === 0) {
    setStatus("画像がありません", "error");
    return;
  }
  if (!window.eagle || !eagle.item?.addFromBase64) {
    setStatus("Eagleプラグイン内で起動してください", "error");
    return;
  }

  try {
    elements.combineButton.disabled = true;
    setStatus("結合画像をEagleに追加中...");
    renderPreview();

    const name = cleanName(state.files[0]?.name);
    const base64 = state.canvas.toDataURL("image/jpeg", 0.95);
    const itemId = await eagle.item.addFromBase64(base64, {
      name,
      website: state.firstItemMetadata.website,
      annotation: state.firstItemMetadata.annotation,
      folders: state.firstItemMetadata.folders,
    });

    if (itemId && eagle.item.open) {
      await eagle.item.open(itemId);
    }

    clearImages();
    setStatus(`${name}.jpg をEagleに追加しました`, "success");
  } catch (error) {
    setStatus(error.message, "error");
    elements.combineButton.disabled = state.images.length === 0;
  }
}

elements.dropZone.addEventListener("dragenter", (event) => {
  event.preventDefault();
  elements.dropZone.classList.add("dragging");
});

elements.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
});

elements.dropZone.addEventListener("dragleave", () => {
  elements.dropZone.classList.remove("dragging");
});

elements.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.dropZone.classList.remove("dragging");
  addFiles(event.dataTransfer.files);
});

elements.clearButton.addEventListener("click", clearImages);
elements.combineButton.addEventListener("click", addCombinedItem);
for (const control of [elements.mode, elements.lineEnabled, elements.lineWidth, elements.lineColor]) {
  control.addEventListener("input", renderPreview);
}

setStatus(window.eagle ? "準備完了" : "Eagleプラグイン内で起動してください", window.eagle ? "" : "error");
