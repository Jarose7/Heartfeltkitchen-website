// admin-assets/dashboard.js — client-side logic for the Heartfelt Kitchen
// admin dashboard. Talks to /api/admin/* (all session-authenticated).

(function () {
  const navItems = document.querySelectorAll('.nav-item');
  const views = {
    'menu-items': document.getElementById('view-menu-items'),
    'site-content': document.getElementById('view-site-content'),
    'homepage-photos': document.getElementById('view-homepage-photos'),
    'classes': document.getElementById('view-classes'),
    'inquiries': document.getElementById('view-inquiries'),
  };

  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      navItems.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      Object.entries(views).forEach(([key, el]) => { el.hidden = key !== btn.dataset.view; });
      if (btn.dataset.view === 'menu-items') loadMenuItems();
      if (btn.dataset.view === 'site-content') loadSiteContent();
      if (btn.dataset.view === 'homepage-photos') loadHomepagePhotos();
      if (btn.dataset.view === 'classes') loadClassesView();
      if (btn.dataset.view === 'inquiries') loadInquiries();
    });
  });

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---- menu items --------------------------------------------------------

  const listEl = document.getElementById('menu-items-list');
  const modal = document.getElementById('item-modal');
  const itemForm = document.getElementById('item-form');
  const itemFormStatus = document.getElementById('item-form-status');
  const itemPhotoInput = document.getElementById('item-photo');
  const itemPhotoCurrent = document.getElementById('item-photo-current');

  // Holds the cropped photo Blob once the crop tool has been used, so the
  // form submits the CROPPED image rather than the raw file the browser's
  // file picker returned. Cleared whenever the modal opens/closes so a
  // stale crop from a previous item can never leak into a different one.
  let croppedPhotoBlob = null;

  // /menu-photo/:id is cached for an hour (it rarely changes), so the URL
  // needs to change whenever the photo does, or the browser just keeps
  // showing the old one after a save — this is why replacing a photo
  // looked like it "didn't take." Using updated_at as a ?v= query string
  // fixes that without giving up the caching.
  function photoUrl(item) {
    const v = item.updated_at ? new Date(item.updated_at).getTime() : '';
    return `/menu-photo/${item.id}${v ? `?v=${v}` : ''}`;
  }

  itemPhotoInput.addEventListener('change', () => {
    const file = itemPhotoInput.files[0];
    if (!file) return;
    openImageCropper(file, { aspect: 4 / 3 }, (blob) => {
      if (!blob) {
        // Canceled — don't leave a raw, un-cropped file selected.
        itemPhotoInput.value = '';
        return;
      }
      croppedPhotoBlob = blob;
      const url = URL.createObjectURL(blob);
      itemPhotoCurrent.innerHTML = `New photo (cropped): <img src="${url}" alt="">`;
    });
  });

  async function loadMenuItems() {
    listEl.innerHTML = '<div class="empty-state">Loading…</div>';
    try {
      const res = await fetch('/api/admin/menu-items');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      renderMenuItems(data.items);
    } catch (err) {
      listEl.innerHTML = '<div class="empty-state">Couldn\'t load menu items. Try refreshing.</div>';
    }
  }

  function renderMenuItems(items) {
    if (items.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No menu items yet. Click "Add Item" to create one.</div>';
      return;
    }
    // Items arrive already ordered by category, sort_order, name — group
    // by category here just to know each item's position within its own
    // category, so the up/down arrows can disable at the top/bottom.
    const byCategory = {};
    items.forEach((item) => {
      (byCategory[item.category] = byCategory[item.category] || []).push(item);
    });

    listEl.innerHTML = items.map((item) => {
      const siblings = byCategory[item.category];
      const posInCategory = siblings.findIndex((i) => i.id === item.id);
      const isFirst = posInCategory === 0;
      const isLast = posInCategory === siblings.length - 1;
      return `
      <div class="item-row" data-id="${item.id}">
        <div class="item-thumb" style="${item.has_photo ? `background-image:url('${photoUrl(item)}')` : ''}"></div>
        <div class="item-info">
          <div class="name">${escapeHtml(item.name)}</div>
          <div class="meta">${escapeHtml(item.price_text || '')}</div>
        </div>
        <span class="badge badge-${item.category === 'seasonal' ? 'seasonal' : item.category === 'shippable' ? 'shippable' : 'staple'}">${item.category}</span>
        ${!item.active ? '<span class="badge badge-hidden">Hidden</span>' : ''}
        <div class="item-actions">
          <button class="move-btn move-up" title="Move up" ${isFirst ? 'disabled' : ''}>&uarr;</button>
          <button class="move-btn move-down" title="Move down" ${isLast ? 'disabled' : ''}>&darr;</button>
          <button class="edit-btn">Edit</button>
          <button class="delete-btn">Delete</button>
        </div>
      </div>
    `;
    }).join('');

    listEl.querySelectorAll('.item-row').forEach((row) => {
      const id = row.dataset.id;
      const item = items.find((i) => String(i.id) === id);
      row.querySelector('.edit-btn').addEventListener('click', () => openItemModal(item));
      row.querySelector('.delete-btn').addEventListener('click', () => deleteItem(id, item.name));
      row.querySelector('.move-up').addEventListener('click', () => moveItem(id, 'up'));
      row.querySelector('.move-down').addEventListener('click', () => moveItem(id, 'down'));
    });
  }

  async function moveItem(id, direction) {
    try {
      const res = await fetch(`/api/admin/menu-items/${id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      if (!res.ok) throw new Error();
      loadMenuItems();
    } catch (err) {
      alert('Failed to reorder this item. Try again.');
    }
  }

  function openItemModal(item) {
    itemFormStatus.className = '';
    itemFormStatus.textContent = '';
    document.getElementById('item-modal-title').textContent = item ? 'Edit Menu Item' : 'Add Menu Item';
    document.getElementById('item-id').value = item ? item.id : '';
    document.getElementById('item-name').value = item ? item.name : '';
    document.getElementById('item-description').value = item ? (item.description || '') : '';
    document.getElementById('item-price').value = item ? (item.price_text || '') : '';
    document.getElementById('item-category').value = item ? item.category : 'staple';
    document.getElementById('item-active').checked = item ? item.active : true;
    itemPhotoInput.value = '';
    croppedPhotoBlob = null;
    itemPhotoCurrent.innerHTML = (item && item.has_photo)
      ? `Current photo: <img src="${photoUrl(item)}" alt="">`
      : '';
    modal.hidden = false;
  }

  document.getElementById('btn-new-item').addEventListener('click', () => openItemModal(null));
  document.getElementById('btn-cancel-item').addEventListener('click', () => { modal.hidden = true; });

  itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('item-id').value;
    const name = document.getElementById('item-name').value.trim();
    const price = document.getElementById('item-price').value.trim();
    if (!name) {
      itemFormStatus.className = 'error';
      itemFormStatus.textContent = 'Name is required.';
      return;
    }
    if (!price) {
      itemFormStatus.className = 'error';
      itemFormStatus.textContent = 'Price is required.';
      return;
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', document.getElementById('item-description').value);
    formData.append('price_text', price);
    formData.append('category', document.getElementById('item-category').value);
    formData.append('active', document.getElementById('item-active').checked ? 'true' : 'false');
    // Always the cropped result, never the raw file the picker returned —
    // croppedPhotoBlob is only set once the crop tool has been used.
    if (croppedPhotoBlob) formData.append('photo', croppedPhotoBlob, 'photo.jpg');

    const submitBtn = itemForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    try {
      const res = await fetch(id ? `/api/admin/menu-items/${id}` : '/api/admin/menu-items', {
        method: id ? 'PUT' : 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      modal.hidden = true;
      loadMenuItems();
    } catch (err) {
      itemFormStatus.className = 'error';
      itemFormStatus.textContent = err.message || 'Something went wrong saving this item.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Item';
    }
  });

  async function deleteItem(id, name) {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/menu-items/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      loadMenuItems();
    } catch (err) {
      alert('Failed to delete this item. Try again.');
    }
  }

  // ---- homepage photos ---------------------------------------------------
  // A fixed set of named slots (not a free-form list like menu items),
  // each either overridden with an uploaded photo or still showing its
  // original hardcoded one. Reuses the same crop tool as menu items, just
  // with each slot's own aspect ratio.

  const hpList = document.getElementById('homepage-photos-list');

  async function loadHomepagePhotos() {
    hpList.innerHTML = '<div class="empty-state">Loading…</div>';
    try {
      const res = await fetch('/api/admin/homepage-photos');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      renderHomepagePhotos(data.slots);
    } catch (err) {
      hpList.innerHTML = '<div class="empty-state">Couldn\'t load homepage photos. Try refreshing.</div>';
    }
  }

  function renderHomepagePhotos(slots) {
    hpList.innerHTML = slots.map((slot) => `
      <div class="hp-card" data-slug="${slot.slug}">
        <div class="hp-thumb" style="${slot.photoUrl ? `background-image:url('${slot.photoUrl}')` : ''}">${slot.photoUrl ? '' : '<span>No photo yet</span>'}</div>
        <div class="hp-label">${escapeHtml(slot.label)}</div>
        <div class="hp-actions">
          <button class="hp-change-btn">Change Photo</button>
          ${slot.hasOverride ? '<button class="hp-revert-btn">Revert to Original</button>' : ''}
        </div>
        <input type="file" accept="image/*" class="hp-photo-input" hidden>
      </div>
    `).join('');

    hpList.querySelectorAll('.hp-card').forEach((card) => {
      const slug = card.dataset.slug;
      const slot = slots.find((s) => s.slug === slug);
      const fileInput = card.querySelector('.hp-photo-input');

      card.querySelector('.hp-change-btn').addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        openImageCropper(file, { aspect: slot.aspect }, (blob) => {
          if (!blob) return; // canceled
          uploadHomepagePhoto(slug, blob);
        });
      });

      const revertBtn = card.querySelector('.hp-revert-btn');
      if (revertBtn) {
        revertBtn.addEventListener('click', () => revertHomepagePhoto(slug, slot.label));
      }
    });
  }

  async function uploadHomepagePhoto(slug, blob) {
    const formData = new FormData();
    formData.append('photo', blob, 'photo.jpg');
    try {
      const res = await fetch(`/api/admin/homepage-photos/${slug}`, { method: 'PUT', body: formData });
      if (!res.ok) throw new Error();
      loadHomepagePhotos();
    } catch (err) {
      alert('Failed to save this photo. Try again.');
    }
  }

  async function revertHomepagePhoto(slug, label) {
    if (!confirm(`Revert "${label}" back to its original photo?`)) return;
    try {
      const res = await fetch(`/api/admin/homepage-photos/${slug}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      loadHomepagePhotos();
    } catch (err) {
      alert('Failed to revert this photo. Try again.');
    }
  }

  // ---- site content -------------------------------------------------------

  const contentForm = document.getElementById('site-content-form');
  const contentStatus = document.getElementById('content-status');

  async function loadSiteContent() {
    try {
      const res = await fetch('/api/admin/site-content');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      contentForm.querySelectorAll('[data-key]').forEach((input) => {
        input.value = data.content[input.dataset.key] || '';
      });
    } catch (err) {
      contentStatus.className = 'error';
      contentStatus.textContent = "Couldn't load site content. Try refreshing.";
    }
  }

  contentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    contentStatus.className = '';
    contentStatus.textContent = '';
    const updates = {};
    contentForm.querySelectorAll('[data-key]').forEach((input) => {
      updates[input.dataset.key] = input.value;
    });
    const submitBtn = contentForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';
    try {
      const res = await fetch('/api/admin/site-content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      contentStatus.className = 'success';
      contentStatus.textContent = 'Saved. Changes are live on the site now.';
    } catch (err) {
      contentStatus.className = 'error';
      contentStatus.textContent = err.message || 'Something went wrong saving these changes.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Changes';
    }
  });

  // ---- classes: presets ---------------------------------------------------
  // Reusable "class types" (schema-classes.sql) so scheduling another date
  // for a class Becca already runs doesn't mean retyping everything.

  let classPresets = [];

  // A small fixed palette for the category names already in use, plus a
  // deterministic fallback (hashed from the category text) for anything
  // custom someone types in later — so color-coding never needs updating
  // by hand as new categories show up, and the same category always gets
  // the same color across presets, the picker, and the calendar.
  const CATEGORY_COLORS = {
    baking: '#c98a4b',
    bread: '#8a6a45',
    chocolate: '#6b4330',
    global: '#4b7a8a',
  };
  const CATEGORY_COLOR_FALLBACKS = ['#a9785a', '#7a8a5a', '#8a5a7a', '#5a7a8a', '#8a7a4b'];
  function categoryColor(category) {
    const key = (category || '').trim().toLowerCase();
    if (CATEGORY_COLORS[key]) return CATEGORY_COLORS[key];
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return CATEGORY_COLOR_FALLBACKS[hash % CATEGORY_COLOR_FALLBACKS.length];
  }

  const presetsListEl = document.getElementById('class-presets-list');
  const presetModal = document.getElementById('preset-modal');
  const presetForm = document.getElementById('preset-form');
  const presetFormStatus = document.getElementById('preset-form-status');
  const presetPhotoInput = document.getElementById('preset-photo');
  const presetPhotoCurrent = document.getElementById('preset-photo-current');
  let croppedPresetPhotoBlob = null;

  function presetPhotoUrl(preset) {
    const v = preset.updated_at ? new Date(preset.updated_at).getTime() : '';
    return `/class-preset-photo/${preset.id}${v ? `?v=${v}` : ''}`;
  }

  presetPhotoInput.addEventListener('change', () => {
    const file = presetPhotoInput.files[0];
    if (!file) return;
    openImageCropper(file, { aspect: 4 / 3 }, (blob) => {
      if (!blob) { presetPhotoInput.value = ''; return; }
      croppedPresetPhotoBlob = blob;
      const url = URL.createObjectURL(blob);
      presetPhotoCurrent.innerHTML = `New photo (cropped): <img src="${url}" alt="">`;
    });
  });

  async function loadClassPresets() {
    presetsListEl.innerHTML = '<div class="empty-state">Loading…</div>';
    try {
      const res = await fetch('/api/admin/class-presets');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      classPresets = data.presets;
      renderClassPresets();
    } catch (err) {
      presetsListEl.innerHTML = '<div class="empty-state">Couldn\'t load presets. Try refreshing.</div>';
    }
  }

  function renderClassPresets() {
    if (classPresets.length === 0) {
      presetsListEl.innerHTML = '<div class="empty-state">No presets yet. Click "Add Preset" to create one.</div>';
      return;
    }
    presetsListEl.innerHTML = classPresets.map((p) => `
      <div class="hp-card preset-card" data-id="${p.id}" style="border-left-color:${categoryColor(p.category)};">
        <div class="hp-thumb" style="${p.has_photo ? `background-image:url('${presetPhotoUrl(p)}')` : ''}">${p.has_photo ? '' : '<span>No photo</span>'}</div>
        <div class="preset-card-cat" style="color:${categoryColor(p.category)};">${escapeHtml(p.category)}</div>
        <div class="hp-label">${escapeHtml(p.title)}</div>
        ${p.price_text ? `<div class="preset-card-price">${escapeHtml(p.price_text)}</div>` : ''}
        <div class="hp-actions">
          <button class="preset-edit-btn">Edit</button>
          <button class="preset-delete-btn hp-revert-btn">Delete</button>
        </div>
      </div>
    `).join('');

    presetsListEl.querySelectorAll('.hp-card').forEach((card) => {
      const id = card.dataset.id;
      const preset = classPresets.find((p) => String(p.id) === id);
      card.querySelector('.preset-edit-btn').addEventListener('click', () => openPresetModal(preset));
      card.querySelector('.preset-delete-btn').addEventListener('click', () => deletePreset(id, preset.title));
    });
  }

  function openPresetModal(preset) {
    presetFormStatus.className = '';
    presetFormStatus.textContent = '';
    document.getElementById('preset-modal-title').textContent = preset ? 'Edit Preset' : 'Add Preset';
    document.getElementById('preset-id').value = preset ? preset.id : '';
    document.getElementById('preset-category').value = preset ? preset.category : '';
    document.getElementById('preset-title').value = preset ? preset.title : '';
    document.getElementById('preset-description').value = preset ? (preset.description || '') : '';
    document.getElementById('preset-price').value = preset ? (preset.price_text || '') : '';
    presetPhotoInput.value = '';
    croppedPresetPhotoBlob = null;
    presetPhotoCurrent.innerHTML = (preset && preset.has_photo)
      ? `Current photo: <img src="${presetPhotoUrl(preset)}" alt="">`
      : '';
    presetModal.hidden = false;
  }

  document.getElementById('btn-new-preset').addEventListener('click', () => openPresetModal(null));
  document.getElementById('btn-cancel-preset').addEventListener('click', () => { presetModal.hidden = true; });

  presetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('preset-id').value;
    const category = document.getElementById('preset-category').value.trim();
    const title = document.getElementById('preset-title').value.trim();
    if (!category || !title) {
      presetFormStatus.className = 'error';
      presetFormStatus.textContent = 'Category and title are required.';
      return;
    }

    const formData = new FormData();
    formData.append('category', category);
    formData.append('title', title);
    formData.append('description', document.getElementById('preset-description').value);
    formData.append('price_text', document.getElementById('preset-price').value);
    if (croppedPresetPhotoBlob) formData.append('photo', croppedPresetPhotoBlob, 'photo.jpg');

    const submitBtn = presetForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';
    try {
      const res = await fetch(id ? `/api/admin/class-presets/${id}` : '/api/admin/class-presets', {
        method: id ? 'PUT' : 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      presetModal.hidden = true;
      loadClassPresets();
    } catch (err) {
      presetFormStatus.className = 'error';
      presetFormStatus.textContent = err.message || 'Something went wrong saving this preset.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Preset';
    }
  });

  async function deletePreset(id, title) {
    if (!confirm(`Delete the "${title}" preset? Classes already scheduled from it will NOT be removed.`)) return;
    try {
      const res = await fetch(`/api/admin/class-presets/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      loadClassPresets();
    } catch (err) {
      alert('Failed to delete this preset. Try again.');
    }
  }

  // ---- classes: calendar ---------------------------------------------------

  const calGridEl = document.getElementById('class-calendar');
  const calMonthLabel = document.getElementById('cal-month-label');
  const calendarMonth = new Date();
  calendarMonth.setDate(1);
  let calendarEvents = [];

  function monthParam(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function formatDateLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function eventPhotoUrl(ev) {
    const v = ev.updated_at ? new Date(ev.updated_at).getTime() : '';
    return `/class-photo/${ev.id}${v ? `?v=${v}` : ''}`;
  }

  async function loadClassEvents() {
    try {
      const res = await fetch(`/api/admin/class-events?month=${monthParam(calendarMonth)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      calendarEvents = data.events;
      renderCalendar();
    } catch (err) {
      calGridEl.innerHTML = '<div class="empty-state">Couldn\'t load the calendar. Try refreshing.</div>';
    }
  }

  function renderCalendar() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    calMonthLabel.textContent = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const firstOfMonth = new Date(year, month, 1);
    const startDow = firstOfMonth.getDay(); // 0 = Sunday
    const gridStart = new Date(year, month, 1 - startDow);
    const todayStr = formatDateLocal(new Date());

    const eventsByDate = {};
    calendarEvents.forEach((ev) => {
      (eventsByDate[ev.event_date] = eventsByDate[ev.event_date] || []).push(ev);
    });

    const weekdayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      .map((d) => `<div class="cal-weekday">${d}</div>`).join('');

    let cellsHtml = '';
    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + i);
      const dateStr = formatDateLocal(cellDate);
      const isOutside = cellDate.getMonth() !== month;
      const isToday = dateStr === todayStr;
      const dayEvents = eventsByDate[dateStr] || [];

      const chipsHtml = dayEvents.map((ev) => `
        <button type="button" class="cal-event-chip ${!ev.active ? 'is-hidden' : ''}" data-id="${ev.id}" style="border-left-color:${categoryColor(ev.category)};">${escapeHtml(ev.title)}</button>
      `).join('');

      cellsHtml += `
        <div class="cal-cell ${isOutside ? 'is-outside' : ''} ${isToday ? 'is-today' : ''}" data-date="${dateStr}">
          <div class="cal-day-num">${cellDate.getDate()}</div>
          ${chipsHtml}
        </div>
      `;
    }

    calGridEl.innerHTML = weekdayHeaders + cellsHtml;

    calGridEl.querySelectorAll('.cal-cell').forEach((cell) => {
      cell.addEventListener('click', (e) => {
        if (e.target.closest('.cal-event-chip')) return; // handled separately below
        openClassPicker(cell.dataset.date);
      });
    });

    calGridEl.querySelectorAll('.cal-event-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const ev = calendarEvents.find((x) => String(x.id) === chip.dataset.id);
        if (ev) openEventModal(ev);
      });
    });
  }

  document.getElementById('cal-prev').addEventListener('click', () => {
    calendarMonth.setMonth(calendarMonth.getMonth() - 1);
    loadClassEvents();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calendarMonth.setMonth(calendarMonth.getMonth() + 1);
    loadClassEvents();
  });
  document.getElementById('cal-today').addEventListener('click', () => {
    const now = new Date();
    calendarMonth.setFullYear(now.getFullYear(), now.getMonth(), 1);
    loadClassEvents();
  });

  function loadClassesView() {
    loadClassPresets();
    loadClassEvents();
  }

  // ---- classes: "add a class" picker ---------------------------------------
  // Shown when clicking "+ Add Class" or an empty calendar day — lets Becca
  // jump straight to a prefilled event form from a preset, or build a
  // one-off class from scratch.

  const classPickerModal = document.getElementById('class-picker-modal');
  const classPickerPresetsEl = document.getElementById('class-picker-presets');
  let pickerDate = null;

  function openClassPicker(dateStr) {
    pickerDate = dateStr || formatDateLocal(new Date());
    if (classPresets.length === 0) {
      classPickerPresetsEl.innerHTML = '<p class="picker-empty">No presets yet — add one above, or build this class from scratch below.</p>';
    } else {
      classPickerPresetsEl.innerHTML = classPresets.map((p) => `
        <button type="button" class="picker-preset-btn" data-id="${p.id}" style="border-left-color:${categoryColor(p.category)};">
          <span><span class="cat" style="color:${categoryColor(p.category)};">${escapeHtml(p.category)}</span><br>${escapeHtml(p.title)}</span>
          <span>&rarr;</span>
        </button>
      `).join('');
      classPickerPresetsEl.querySelectorAll('.picker-preset-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const preset = classPresets.find((p) => String(p.id) === btn.dataset.id);
          classPickerModal.hidden = true;
          openEventModal(null, preset, pickerDate);
        });
      });
    }
    classPickerModal.hidden = false;
  }

  document.getElementById('btn-new-event').addEventListener('click', () => openClassPicker(null));
  document.getElementById('btn-cancel-picker').addEventListener('click', () => { classPickerModal.hidden = true; });
  document.getElementById('btn-picker-custom').addEventListener('click', () => {
    classPickerModal.hidden = true;
    openEventModal(null, null, pickerDate);
  });

  // ---- classes: event modal -------------------------------------------------

  const eventModal = document.getElementById('event-modal');
  const eventForm = document.getElementById('event-form');
  const eventFormStatus = document.getElementById('event-form-status');
  const eventPhotoInput = document.getElementById('event-photo');
  const eventPhotoCurrent = document.getElementById('event-photo-current');
  const btnDeleteEvent = document.getElementById('btn-delete-event');
  const btnDuplicateEvent = document.getElementById('btn-duplicate-event');
  const eventPresetSummary = document.getElementById('event-preset-summary');
  const eventFullFields = document.getElementById('event-full-fields');
  const btnToggleFullFields = document.getElementById('btn-toggle-full-fields');
  let croppedEventPhotoBlob = null;

  eventPhotoInput.addEventListener('change', () => {
    const file = eventPhotoInput.files[0];
    if (!file) return;
    openImageCropper(file, { aspect: 4 / 3 }, (blob) => {
      if (!blob) { eventPhotoInput.value = ''; return; }
      croppedEventPhotoBlob = blob;
      const url = URL.createObjectURL(blob);
      eventPhotoCurrent.innerHTML = `New photo (cropped): <img src="${url}" alt="">`;
    });
  });

  // `event` = existing event being edited (null for a new one). `preset` =
  // the preset to prefill from when creating a new event (null for custom).
  // `dateStr` = the date to prefill when creating a new event.
  //
  // Scheduling FROM a preset is the common case, so that path starts
  // collapsed to just date/time behind a read-only preset summary card —
  // Becca doesn't have to look at (or accidentally edit) the title/
  // description/price/photo every single time. Editing an existing event,
  // or building a custom one from scratch, always shows every field, since
  // there's no "known good" prefill to hide behind in either case.
  function openEventModal(event, preset, dateStr) {
    eventFormStatus.className = '';
    eventFormStatus.textContent = '';
    croppedEventPhotoBlob = null;
    eventPhotoInput.value = '';

    document.getElementById('event-modal-title').textContent = event ? 'Edit Class' : 'Add Class';
    document.getElementById('event-id').value = event ? event.id : '';
    document.getElementById('event-preset-id').value = event ? (event.preset_id || '') : (preset ? preset.id : '');
    document.getElementById('event-category').value = event ? event.category : (preset ? preset.category : '');
    document.getElementById('event-title').value = event ? event.title : (preset ? preset.title : '');
    document.getElementById('event-description').value = event ? (event.description || '') : (preset ? (preset.description || '') : '');
    document.getElementById('event-price').value = event ? (event.price_text || '') : (preset ? (preset.price_text || '') : '');
    document.getElementById('event-date').value = event ? event.event_date : (dateStr || '');
    document.getElementById('event-start-time').value = event && event.start_time ? event.start_time.slice(0, 5) : '';
    document.getElementById('event-end-time').value = event && event.end_time ? event.end_time.slice(0, 5) : '';
    document.getElementById('event-active').checked = event ? event.active : true;

    if (event && event.has_photo) {
      eventPhotoCurrent.innerHTML = `Current photo: <img src="${eventPhotoUrl(event)}" alt="">`;
    } else if (!event && preset && preset.has_photo) {
      eventPhotoCurrent.innerHTML = `Using preset photo: <img src="${presetPhotoUrl(preset)}" alt="">`;
    } else {
      eventPhotoCurrent.innerHTML = '';
    }

    const startFromPresetCollapsed = !event && preset;
    if (startFromPresetCollapsed) {
      document.getElementById('event-preset-summary-cat').textContent = preset.category;
      document.getElementById('event-preset-summary-title').textContent = preset.title;
      document.getElementById('event-preset-summary-price').textContent = preset.price_text || '';
      const thumb = document.getElementById('event-preset-summary-thumb');
      thumb.style.backgroundImage = preset.has_photo ? `url('${presetPhotoUrl(preset)}')` : '';
      eventPresetSummary.hidden = false;
      eventFullFields.hidden = true;
    } else {
      eventPresetSummary.hidden = true;
      eventFullFields.hidden = false;
    }

    btnDeleteEvent.style.display = event ? '' : 'none';
    btnDuplicateEvent.hidden = !event;
    eventModal.hidden = false;
  }

  btnToggleFullFields.addEventListener('click', () => {
    eventPresetSummary.hidden = true;
    eventFullFields.hidden = false;
  });

  document.getElementById('btn-cancel-event').addEventListener('click', () => { eventModal.hidden = true; });

  // Clones the form's CURRENT values (including any unsaved edits) into a
  // fresh "Add Class" form with the id cleared, so saving creates a new
  // event instead of overwriting this one — the quickest way to schedule
  // the same class again. Defaults the date a week later since that's the
  // most common case (a weekly class), but it's still just a normal date
  // field, easy to change before saving. The photo is carried over too
  // (re-fetched from this event's own photo route) so it doesn't have to
  // be re-cropped, unless there wasn't one to begin with.
  btnDuplicateEvent.addEventListener('click', async () => {
    const originalId = document.getElementById('event-id').value;
    const hadPhoto = Boolean(eventPhotoCurrent.querySelector('img'));
    const fields = {
      category: document.getElementById('event-category').value,
      title: document.getElementById('event-title').value,
      description: document.getElementById('event-description').value,
      price: document.getElementById('event-price').value,
      presetId: document.getElementById('event-preset-id').value,
      startTime: document.getElementById('event-start-time').value,
      endTime: document.getElementById('event-end-time').value,
    };
    const dateVal = document.getElementById('event-date').value;
    let nextDate = dateVal;
    if (dateVal) {
      const [y, m, d] = dateVal.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() + 7);
      nextDate = formatDateLocal(dt);
    }

    openEventModal(null, null, nextDate);
    document.getElementById('event-modal-title').textContent = 'Duplicate Class';
    document.getElementById('event-preset-id').value = fields.presetId;
    document.getElementById('event-category').value = fields.category;
    document.getElementById('event-title').value = fields.title;
    document.getElementById('event-description').value = fields.description;
    document.getElementById('event-price').value = fields.price;
    document.getElementById('event-start-time').value = fields.startTime;
    document.getElementById('event-end-time').value = fields.endTime;

    if (hadPhoto && originalId) {
      try {
        const res = await fetch(`/class-photo/${originalId}`);
        const blob = await res.blob();
        croppedEventPhotoBlob = blob;
        const url = URL.createObjectURL(blob);
        eventPhotoCurrent.innerHTML = `Using original photo: <img src="${url}" alt="">`;
      } catch (err) {
        // Not fatal — just means the photo needs re-adding by hand.
      }
    }
  });

  eventForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('event-id').value;
    const category = document.getElementById('event-category').value.trim();
    const title = document.getElementById('event-title').value.trim();
    const eventDate = document.getElementById('event-date').value;
    if (!category || !title || !eventDate) {
      eventFormStatus.className = 'error';
      eventFormStatus.textContent = 'Category, title, and date are required.';
      return;
    }

    const formData = new FormData();
    const presetId = document.getElementById('event-preset-id').value;
    if (presetId) formData.append('preset_id', presetId);
    formData.append('category', category);
    formData.append('title', title);
    formData.append('description', document.getElementById('event-description').value);
    formData.append('price_text', document.getElementById('event-price').value);
    formData.append('event_date', eventDate);
    formData.append('start_time', document.getElementById('event-start-time').value);
    formData.append('end_time', document.getElementById('event-end-time').value);
    formData.append('active', document.getElementById('event-active').checked ? 'true' : 'false');
    if (croppedEventPhotoBlob) formData.append('photo', croppedEventPhotoBlob, 'photo.jpg');

    const submitBtn = eventForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';
    try {
      const res = await fetch(id ? `/api/admin/class-events/${id}` : '/api/admin/class-events', {
        method: id ? 'PUT' : 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      eventModal.hidden = true;
      loadClassEvents();
    } catch (err) {
      eventFormStatus.className = 'error';
      eventFormStatus.textContent = err.message || 'Something went wrong saving this class.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Class';
    }
  });

  btnDeleteEvent.addEventListener('click', async () => {
    const id = document.getElementById('event-id').value;
    if (!id) return;
    const title = document.getElementById('event-title').value;
    if (!confirm(`Delete "${title}" from the calendar? This can't be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/class-events/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      eventModal.hidden = true;
      loadClassEvents();
    } catch (err) {
      alert('Failed to delete this class. Try again.');
    }
  });

  // ---- inquiries -------------------------------------------------------

  const inquiriesList = document.getElementById('inquiries-list');
  const inquiriesSearch = document.getElementById('inquiries-search');
  const inquiriesTypeFilter = document.getElementById('inquiries-type-filter');
  let allInquiries = [];

  async function loadInquiries() {
    inquiriesList.innerHTML = '<div class="empty-state">Loading…</div>';
    try {
      const res = await fetch('/api/admin/inquiries');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      allInquiries = data.inquiries;
      applyInquiriesFilter();
    } catch (err) {
      inquiriesList.innerHTML = '<div class="empty-state">Couldn\'t load inquiries. Try refreshing.</div>';
    }
  }

  function applyInquiriesFilter() {
    const term = inquiriesSearch.value.trim().toLowerCase();
    const type = inquiriesTypeFilter.value;
    const filtered = allInquiries.filter((r) => {
      if (type && r.inquiry_type !== type) return false;
      if (!term) return true;
      const haystack = [r.name, r.email, r.notes].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });
    renderInquiries(filtered, allInquiries.length);
  }

  inquiriesSearch.addEventListener('input', applyInquiriesFilter);
  inquiriesTypeFilter.addEventListener('change', applyInquiriesFilter);

  function renderInquiries(rows, totalCount) {
    if (rows.length === 0) {
      inquiriesList.innerHTML = totalCount
        ? '<div class="empty-state">No inquiries match your search.</div>'
        : '<div class="empty-state">No inquiries yet.</div>';
      return;
    }
    inquiriesList.innerHTML = rows.map((r) => `
      <div class="inquiry-card" data-id="${r.id}">
        <div class="top">
          <span>${escapeHtml(r.inquiry_type)}</span>
          <span>${new Date(r.created_at).toLocaleString()}</span>
        </div>
        <div class="name">${escapeHtml(r.name)}</div>
        <dl>
          <dt>Email</dt><dd>${escapeHtml(r.email)}</dd>
          ${r.phone ? `<dt>Phone</dt><dd>${escapeHtml(r.phone)}</dd>` : ''}
          ${r.event_date ? `<dt>Event date</dt><dd>${escapeHtml(r.event_date)}</dd>` : ''}
          ${r.event_location ? `<dt>Location</dt><dd>${escapeHtml(r.event_location)}</dd>` : ''}
          ${r.guest_count ? `<dt>Guests</dt><dd>${escapeHtml(r.guest_count)}</dd>` : ''}
          ${r.products_requested ? `<dt>Requested</dt><dd>${escapeHtml(r.products_requested)}</dd>` : ''}
          ${r.budget_estimate ? `<dt>Budget</dt><dd>${escapeHtml(r.budget_estimate)}</dd>` : ''}
          ${r.delivery_or_pickup ? `<dt>Delivery/pickup</dt><dd>${escapeHtml(r.delivery_or_pickup)}</dd>` : ''}
          ${r.notes ? `<dt>Notes</dt><dd>${escapeHtml(r.notes)}</dd>` : ''}
        </dl>
        <div class="inquiry-actions">
          <button class="delete-btn">Delete</button>
        </div>
      </div>
    `).join('');

    inquiriesList.querySelectorAll('.inquiry-card').forEach((card) => {
      const id = card.dataset.id;
      const row = rows.find((r) => String(r.id) === id);
      card.querySelector('.delete-btn').addEventListener('click', () => deleteInquiry(id, row ? row.name : ''));
    });
  }

  async function deleteInquiry(id, name) {
    if (!confirm(`Delete the inquiry from "${name}"? This can't be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/inquiries/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      loadInquiries();
    } catch (err) {
      alert('Failed to delete this inquiry. Try again.');
    }
  }

  // ---- modal dismissal (click the backdrop, or press Escape) -----------
  // Applies to every modal in the admin panel — a small but real speed-up
  // when you're moving quickly through a bunch of edits in a row.

  const dismissableModals = [modal, presetModal, classPickerModal, eventModal];
  dismissableModals.forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target === m) m.hidden = true; });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    dismissableModals.forEach((m) => { if (!m.hidden) m.hidden = true; });
  });

  // initial load
  loadMenuItems();
})();
