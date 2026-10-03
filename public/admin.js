(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const toast = (message, error = false) => {
    const node = $('[data-client-notice]');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('is-error', error);
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { node.hidden = true; }, 6000);
  };
  const menu = $('#admin-sidebar');
  const menuToggle = $('[data-menu-toggle]');
  const backdrop = $('[data-menu-close]');
  const setMenu = open => {
    if (!menu || !menuToggle || !backdrop) return;
    const wasOpen = menu.classList.contains('is-open');
    menu.classList.toggle('is-open', open);
    menu.inert = !open && window.innerWidth <= 800;
    menu.setAttribute('aria-hidden', String(!open && window.innerWidth <= 800));
    if (open) setTimeout(() => $('a', menu)?.focus(), 0);
    else if (wasOpen) menuToggle.focus();
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
    backdrop.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
  };
  if (menuToggle) menuToggle.addEventListener('click', () => setMenu(menuToggle.getAttribute('aria-expanded') !== 'true'));
  if (backdrop) backdrop.addEventListener('click', () => setMenu(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setMenu(false);
    if (event.key === 'Tab' && menu?.classList.contains('is-open')) {
      const controls = $$('a,button,input:not([type=hidden]),select,textarea', menu).filter(item => !item.disabled);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  if (menu) setMenu(false);
  window.addEventListener('resize', () => { if (window.innerWidth > 800) setMenu(false); });
  $$('[data-password-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.getAttribute('aria-controls'));
      if (!input) return;
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      button.textContent = visible ? 'إخفاء' : 'إظهار';
      button.setAttribute('aria-label', visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
    });
  });
  const search = $('[data-record-search]');
  if (search) search.addEventListener('input', () => {
    const query = search.value.trim().toLocaleLowerCase('ar');
    const rows = $$('[data-record-row]');
    let shown = 0;
    rows.forEach(row => {
      const match = (row.dataset.searchText || row.textContent).toLocaleLowerCase('ar').includes(query);
      row.hidden = !match;
      if (match) shown++;
    });
    const empty = $('[data-empty-search]');
    if (empty) empty.hidden = shown > 0;
  });
  const acceptedTypes = new Set(['image/jpeg','image/png','image/webp','image/avif']);
  $$('[data-file-input]').forEach(input => {
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      if (files.some(file => !acceptedTypes.has(file.type))) {
        input.value = '';
        toast('الصور المسموحة: JPG وPNG وWebP وAVIF.', true);
        return;
      }
      if (files.length > 12) {
        input.value = '';
        toast('يمكن رفع 12 صورة كحد أقصى في المرة الواحدة.', true);
        return;
      }
      if (files.some(file => file.size > 5 * 1024 * 1024)) {
        input.value = '';
        toast('الحد الأقصى لكل صورة هو 5 ميجابايت.', true);
        return;
      }
      if (input.multiple) {
        const list = $('[data-file-list]');
        if (list) list.textContent = files.map(file => file.name).join(' · ');
      }
      if (input.hasAttribute('data-preview-file') && files[0]) {
        const preview = $('[data-image-preview]');
        const placeholder = $('[data-image-placeholder]');
        if (preview) {
          if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
          const url = URL.createObjectURL(files[0]);
          preview.src = url;
          preview.dataset.objectUrl = url;
          preview.hidden = false;
        }
        if (placeholder) placeholder.hidden = true;
      }
    });
  });
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) {
      event.preventDefault();
      return;
    }
    if (form.hasAttribute('data-json-form')) {
      const invalid = $$('[data-json-input]', form).find(field => {
        field.setCustomValidity('');
        if (!field.value.trim()) return false;
        try {
          const parsed = JSON.parse(field.value);
          if (parsed === null || typeof parsed !== 'object') throw new Error('object');
          return false;
        } catch {
          field.setCustomValidity('أدخل بيانات JSON صحيحة (كائن أو مصفوفة).');
          return true;
        }
      });
      if (invalid) {
        event.preventDefault();
        const details = invalid.closest('details');
        if (details) details.open = true;
        invalid.reportValidity();
        invalid.focus();
        toast('تحقق من تنسيق بيانات JSON قبل الحفظ.', true);
        return;
      }
    }
    const submitter = event.submitter || $('[type="submit"]', form);
    if (submitter && submitter.dataset.submitLabel) {
      submitter.textContent = submitter.dataset.submitLabel;
      submitter.disabled = true;
    }
  });
  $$('[data-json-input]').forEach(field => field.addEventListener('input', () => field.setCustomValidity('')));
  const statistics = $('[data-statistics-editor]');
  if (statistics) {
    const rows = $('[data-statistics-rows]', statistics);
    const json = $('[data-statistics-json]', statistics);
    const template = $('[data-stat-template]', statistics);
    const syncStatistics = () => {
      const values = $('[data-statistics-row]', rows).map(row => ({
        label: $('[data-stat-label]', row).value.trim(),
        value: Number($('[data-stat-value]', row).value || 0),
        suffix: $('[data-stat-suffix]', row).value.trim()
      })).filter(stat => stat.label);
      json.value = JSON.stringify(values, null, 2);
      json.setCustomValidity('');
    };
    rows.addEventListener('input', syncStatistics);
    statistics.addEventListener('click', event => {
      if (event.target.closest('[data-add-stat]')) {
        if ($('[data-statistics-row]', rows).length >= 8) {
          toast('يمكن إضافة ثماني إحصائيات كحد أقصى.', true);
          return;
        }
        const fragment = template.content.cloneNode(true);
        rows.appendChild(fragment);
        rows.lastElementChild.querySelector('input').focus();
        syncStatistics();
      }
      const remove = event.target.closest('[data-remove-stat]');
      if (remove) {
        remove.closest('[data-statistics-row]').remove();
        syncStatistics();
      }
    });
  }
  const sortable = $('[data-sortable]');
  const saveOrder = $('[data-save-order]');
  if (sortable && saveOrder) {
    let moving = null;
    const markDirty = () => { saveOrder.disabled = false; };
    sortable.addEventListener('dragstart', event => {
      const row = event.target.closest('[data-record-row]');
      if (!row || event.target.closest('a,input,textarea,select')) {
        event.preventDefault();
        return;
      }
      moving = row;
      row.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', row.dataset.recordId);
    });
    sortable.addEventListener('dragover', event => {
      event.preventDefault();
      const row = event.target.closest('[data-record-row]');
      if (!moving || !row || moving === row) return;
      const box = row.getBoundingClientRect();
      sortable.insertBefore(moving, event.clientY < box.top + box.height / 2 ? row : row.nextSibling);
      markDirty();
    });
    sortable.addEventListener('drop', event => {
      event.preventDefault();
      if (moving) moving.classList.remove('dragging');
      moving = null;
    });
    sortable.addEventListener('dragend', () => {
      if (moving) moving.classList.remove('dragging');
      moving = null;
    });
    sortable.addEventListener('click', event => {
      const button = event.target.closest('[data-order]');
      if (!button) return;
      const row = button.closest('[data-record-row]');
      if (button.dataset.order === 'up' && row.previousElementSibling) {
        sortable.insertBefore(row, row.previousElementSibling);
        markDirty();
      } else if (button.dataset.order === 'down' && row.nextElementSibling) {
        sortable.insertBefore(row.nextElementSibling, row);
        markDirty();
      }
    });
    saveOrder.addEventListener('click', async () => {
      const original = saveOrder.textContent;
      saveOrder.disabled = true;
      saveOrder.textContent = 'جارٍ حفظ الترتيب…';
      const ids = $$('[data-record-row]', sortable).map(row => row.dataset.recordId);
      try {
        const token = $('meta[name="csrf-token"]')?.content || '';
        const response = await fetch('/admin/slider/reorder', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {'Content-Type':'application/json','X-CSRF-Token':token},
          body: JSON.stringify({ids, _csrf:token})
        });
        if (!response.ok || response.redirected) throw new Error('save');
        $$('[data-position]', sortable).forEach((cell, index) => { cell.textContent = index.toLocaleString('ar-SA'); });
        toast('تم حفظ ترتيب صور الواجهة.');
      } catch {
        saveOrder.disabled = false;
        toast('تعذّر حفظ الترتيب. تحقّق من الاتصال وتسجيل الدخول ثم حاول مجددًا.', true);
      } finally {
        saveOrder.textContent = original;
      }
    });
  }
})();
