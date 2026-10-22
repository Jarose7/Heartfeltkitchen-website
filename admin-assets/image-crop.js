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
    // Scale is never below 1, so the image always covers the viewport on
    // both axes; pin it so no gap can ever show.
    left = w >= viewportW ? clamp(left, viewportW - w, 0) : (viewportW - w) / 2;
    top = h >= viewportH ? clamp(top, viewportH - h, 0) : (viewportH - h) / 2;
  }

  function setScale(newScale, anchorX, anchorY) {
    // Keep whatever point is under (anchorX, anchorY) in the same spot on
    // screen while zooming, so zooming feels like it's centered on the
    // slider/cursor rather than snapping back to the top-left.
    const oldW = naturalW * baseScale * scale;
    const oldH = naturalH * baseScale * scale;
    const relX = (anchorX - left) / oldW;
    const relY = (anchorY - top) / oldH;

    // Minimum 1 so the photo always fills the whole crop frame: zooming
    // out past that used to export white padding bars into the saved photo.
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
    // Fill white first — when zoomed out past the photo's edges, the crop
    // rectangle extends beyond the actual image, and that extra area
    // becomes white padding instead of being left blank/transparent.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outputW, outputH);

    // Only draw the part of the crop rectangle that actually overlaps the
    // source image — drawImage requires its source rectangle to lie
    // within the image, so we intersect manually rather than passing the
    // (possibly out-of-bounds) crop rectangle straight through.
    const scaleOut = outputW / cropW;
    const ix0 = Math.max(cropX, 0);
    const iy0 = Math.max(cropY, 0);
    const ix1 = Math.min(cropX + cropW, naturalW);
    const iy1 = Math.min(cropY + cropH, naturalH);
    if (ix1 > ix0 && iy1 > iy0) {
      const dx = (ix0 - cropX) * scaleOut;
      const dy = (iy0 - cropY) * scaleOut;
      ctx.drawImage(
        imgEl,
        ix0, iy0, ix1 - ix0, iy1 - iy0,
        dx, dy, (ix1 - ix0) * scaleOut, (iy1 - iy0) * scaleOut
      );
    }

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

    // The crop frame itself must match the slot's aspect ratio. It was
    // hardcoded to 4:3 in CSS, so for portrait (3:4) slots the tool showed a
    // landscape frame but exported a portrait file, and the extra area below
    // the frame came out as white. Tall frames are width-capped so they fit
    // on screen.
    viewport.style.aspectRatio = String(opts.aspect);
    viewport.style.width = opts.aspect < 1 ? `min(100%, ${Math.round(60 * opts.aspect)}vh)` : '100%';

    const url = URL.createObjectURL(file);
    imgEl.onload = () => {
      // The modal (and therefore the viewport inside it) must actually be
      // visible BEFORE measuring it — getBoundingClientRect() on a
      // display:none element returns 0x0, which was making baseScale and
      // the image's rendered size come out as 0 (i.e. an invisible image
      // over the viewport's dark background — the "all black" bug).
      modal.hidden = false;

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
      URL.revokeObjectURL(url);
    };
    imgEl.src = url;
  };
})();
