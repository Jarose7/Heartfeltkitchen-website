// admin-assets/image-crop.js — a small, dependency-free crop tool.
//
// Menu photos are always shown at a fixed aspect ratio on the public menu
// page (see .menu-item-photo, 4:3, background-size:cover). Auto-cropping
// to the center isn't always right — Jack ran into exactly this problem
// with the About page portrait cutting off Becca's head. Rather than
// leave every future menu photo to chance, this pops up a simple
// drag-to-reposition, slider-to-zoom cropper right after a photo is
// selected, so Becca picks what part of the image actually shows.
//
// Usage: openImageCropper(file, { aspect: 4 / 3 }, (blob) => { ... });
// The callback receives a cropped JPEG Blob, or null if she cancels.

(function () {
  const modal = document.getElementById('crop-modal');
  const viewport = document.getElementById('crop-viewport');
  const imgEl = document.getElementById('crop-image');
  const zoomSlider = document.getElementById('crop-zoom');
  const btnUse = document.getElementById('btn-use-crop');
  const btnCancel = document.getElementById('btn-cancel-crop');

  let naturalW, naturalH, baseScale, scale, left, top;
  let dragging = false;
  let dragStartX, dragStartY, startLeft, startTop;
  let currentCallback = null;
  let viewportW, viewportH;
  let outputW, outputH;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function applyTransform() {
    const w = naturalW * baseScale * scale;
    const h = naturalH * baseScale * scale;
    imgEl.style.width = `${w}px`;
    imgEl.style.height = `${h}px`;
    imgEl.style.left = `${left}px`;
    imgEl.style.top = `${top}px`;
  }

  function clampPosition() {
    const w = naturalW * baseScale * scale;
    const h = naturalH * baseScale * scale;
    // Image must always fully cover the viewport — no gaps at any edge.
    left = clamp(left, viewportW - w, 0);
    top = clamp(top, viewportH - h, 0);
  }

  function setScale(newScale, anchorX, anchorY) {
    // Keep whatever point is under (anchorX, anchorY) in the same spot on
    // screen while zooming, so zooming feels like it's centered on the
    // slider/cursor rather than snapping back to the top-left.
    const oldW = naturalW * baseScale * scale;
    const oldH = naturalH * baseScale * scale;
    const relX = (anchorX - left) / oldW;
    const relY = (anchorY - top) / oldH;

    scale = clamp(newScale, 1, 3);

    const newW = naturalW * baseScale * scale;
    const newH = naturalH * baseScale * scale;
    left = anchorX - relX * newW;
    top = anchorY - relY * newH;

    clampPosition();
    applyTransform();
    zoomSlider.value = scale;
  }

  viewport.addEventListener('mousedown', (e) => {
    dragging = true;
    viewport.classList.add('dragging');
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    startLeft = left;
    startTop = top;
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    left = startLeft + (e.clientX - dragStartX);
    top = startTop + (e.clientY - dragStartY);
    clampPosition();
    applyTransform();
  });
  window.addEventListener('mouseup', () => {
    dragging = false;
    viewport.classList.remove('dragging');
  });

  // Basic single-finger touch panning for mobile/tablet uploads.
  viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    dragging = true;
    dragStartX = e.touches[0].clientX;
    dragStartY = e.touches[0].clientY;
    startLeft = left;
    startTop = top;
  });
  viewport.addEventListener('touchmove', (e) => {
    if (!dragging || e.touches.length !== 1) return;
    e.preventDefault();
    left = startLeft + (e.touches[0].clientX - dragStartX);
    top = startTop + (e.touches[0].clientY - dragStartY);
    clampPosition();
    applyTransform();
  }, { passive: false });
  viewport.addEventListener('touchend', () => { dragging = false; });

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const anchorX = e.clientX - rect.left;
    const anchorY = e.clientY - rect.top;
    setScale(scale - e.deltaY * 0.0015, anchorX, anchorY);
  }, { passive: false });

  zoomSlider.addEventListener('input', () => {
    setScale(parseFloat(zoomSlider.value), viewportW / 2, viewportH / 2);
  });

  btnCancel.addEventListener('click', () => {
    modal.hidden = true;
    if (currentCallback) currentCallback(null);
    currentCallback = null;
  });

  btnUse.addEventListener('click', () => {
    // Map the visible crop rectangle back to the original image's
    // resolution (not the on-screen preview size) so exported photos
    // stay full quality regardless of how big the crop viewport is.
    const displayScale = baseScale * scale;
    const cropX = -left / displayScale;
    const cropY = -top / displayScale;
    const cropW = viewportW / displayScale;
    const cropH = viewportH / displayScale;

    const canvas = document.createElement('canvas');
    canvas.width = outputW;
    canvas.height = outputH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, cropX, cropY, cropW, cropH, 0, 0, outputW, outputH);

    canvas.toBlob((blob) => {
      modal.hidden = true;
      if (currentCallback) currentCallback(blob);
      currentCallback = null;
    }, 'image/jpeg', 0.9);
  });

  /**
   * Open the crop tool for a given File.
   * @param {File} file - the image file the user selected
   * @param {{aspect: number, outputWidth?: number, outputHeight?: number}} opts
   * @param {(blob: Blob|null) => void} callback - called with the cropped
   *   JPEG blob, or null if canceled.
   */
  window.openImageCropper = function openImageCropper(file, opts, callback) {
    currentCallback = callback;
    outputW = opts.outputWidth || 1200;
    outputH = opts.outputHeight || Math.round(outputW / opts.aspect);

    const url = URL.createObjectURL(file);
    imgEl.onload = () => {
      naturalW = imgEl.naturalWidth;
      naturalH = imgEl.naturalHeight;

      const rect = viewport.getBoundingClientRect();
      viewportW = rect.width;
      viewportH = rect.height;

      baseScale = Math.max(viewportW / naturalW, viewportH / naturalH);
      scale = 1;
      left = (viewportW - naturalW * baseScale) / 2;
      top = (viewportH - naturalH * baseScale) / 2;

      zoomSlider.value = 1;
      applyTransform();
      modal.hidden = false;
      URL.revokeObjectURL(url);
    };
    imgEl.src = url;
  };
})();
