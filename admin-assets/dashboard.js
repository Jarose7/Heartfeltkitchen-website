// admin-assets/dashboard.js — client-side logic for the Heartfelt Kitchen
// admin dashboard. Talks to /api/admin/* (all session-authenticated).

(function () {
  const navItems = document.querySelectorAll('.nav-item');
  const views = {
    'menu-items': document.getElementById('view-menu-items'),
    'site-content': document.getElementById('view-site-content'),
    'inquiries': document.getElementById('view-inquiries'),
  };

  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      navItems.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      Object.entries(views).forEach(([key, el]) => { el.hidden = key !== btn.dataset.view; });
      if (btn.dataset.view === 'menu-items') loadMenuItems();
      if (btn.dataset.view === 'site-content') loadSiteContent();
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
        <div class="item-thumb" style="${item.has_photo ? `background-image:url('/menu-photo/${item.id}')` : ''}"></div>
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
      ? `Current photo: <img src="/menu-photo/${item.id}" alt="">`
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

  // initial load
  loadMenuItems();
})();
