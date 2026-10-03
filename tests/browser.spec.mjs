import { test, expect } from '@playwright/test';
import sharp from 'sharp';

const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL || 'browser-test@example.test';
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD || 'Browser-Only-Temporary!Password-478';
const samplePhoto = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#c4b197' } }).png().toBuffer();
const whatsappMessage = 'السلام عليكم، شاهدت موقع لمسة المستقبل وأرغب في معرفة التفاصيل والحصول على عرض سعر.';

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.__runtimeErrors = errors;
});

test.afterEach(async ({ page }) => {
  const errors = [...(page.__runtimeErrors || [])];
  const records = page.__cleanupRecords || [];
  if (records.length || page.__sliderOrder) {
    const response = await page.context().request.get('/admin/projects/new');
    expect(response.status()).toBe(200);
    const html = await response.text();
    const token = html.match(/name=["']_csrf["'][^>]*value=["']([^"']+)["']/)?.[1];
    expect(token).toBeTruthy();
    for (const { collection, id } of records.reverse()) {
      const result = await page.context().request.post('/admin/' + collection + '/' + id + '/delete', {
        form: { _csrf: token }, maxRedirects: 0,
      });
      expect([302, 303], 'Temporary browser content should be removed').toContain(result.status());
    }
    if (page.__sliderOrder) {
      const result = await page.context().request.post('/admin/slider/reorder', {
        data: { _csrf: token, ids: page.__sliderOrder },
      });
      expect(result.status()).toBe(200);
    }
  }
  expect(errors, 'Pages must not emit JavaScript or console errors').toEqual([]);
});

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Document should fit the viewport').toBe(true);
}

async function login(page) {
  await page.goto('/admin/login');
  await page.locator('[name="email"]').fill(adminEmail);
  await page.locator('[name="password"]').fill(adminPassword);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin(?:\/)?$/);
}

async function formToken(page, path) {
  await page.goto(path);
  return page.locator('input[name="_csrf"]').first().inputValue();
}

async function saveFixture(page, collection, fields, uploads = {}) {
  const token = await formToken(page, '/admin/' + collection + '/new');
  const response = await page.context().request.post('/admin/' + collection + '/save', {
    multipart: {
      _csrf: token, title: fields.title, enabled: '1', dataJSON: '{"demo":true}', ...fields,
      ...Object.fromEntries(Object.entries(uploads).map(([name, buffer]) => [name, { name: name + '.png', mimeType: 'image/png', buffer }])),
    },
    maxRedirects: 0,
  });
  expect([302, 303], 'A fixture should use the authenticated save endpoint').toContain(response.status());
  const id = response.headers().location?.match(/\/admin\/[^/]+\/([^/]+)\/edit/)?.[1];
  expect(id).toBeTruthy();
  (page.__cleanupRecords ||= []).push({ collection, id });
}

async function fillField(scope, name, value) {
  const field = scope.locator('[name="' + name + '"]').first();
  if (await field.evaluate(element => element.tagName === 'SELECT')) {
    const option = await field.locator('option').evaluateAll((options, desired) => {
      const match = options.find(option => option.label === desired || option.value === desired);
      return match ? match.value : options.find(option => option.value)?.value;
    }, value);
    await field.selectOption(option);
  } else {
    await field.fill(value);
  }
}

test('public pages, direct contacts and mobile navigation fit every device', async ({ page }, testInfo) => {
  const routes = ['/', '/services', '/services/interior-painting-riyadh', '/projects', '/before-after', '/about', '/blog', '/quote', '/contact'];
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response.status(), route).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('h1')).toHaveCount(1);
    await noOverflow(page);
    await expect(page.locator('a[href="tel:+966501308295"]').first()).toBeAttached();
    const links = await page.locator('a[href^="https://wa.me/"]').evaluateAll(elements => elements.map(element => element.href));
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      const url = new URL(href);
      expect(url.pathname).toBe('/966501308295');
      expect(url.searchParams.get('text')).toBe(whatsappMessage);
    }
  }
  await page.goto('/');
  await page.screenshot({ path: testInfo.outputPath('home-' + testInfo.project.name + '.png'), fullPage: true, scale: 'css' });
  const toggle = page.locator('[data-menu-toggle]');
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const menu = page.locator('[data-mobile-menu]');
    await expect(menu).toBeVisible();
    await menu.getByRole('link', { name: 'خدماتنا', exact: true }).click();
    await expect(page).toHaveURL(/\/services(?:\/)?$/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const originalViewport = page.viewportSize();
    await toggle.click();
    await page.setViewportSize({ width: 1200, height: 850 });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeHidden();
    await page.setViewportSize(originalViewport);
  } else {
    await page.locator('header').getByRole('link', { name: 'خدماتنا', exact: true }).click();
    await expect(page).toHaveURL(/\/services(?:\/)?$/);
  }
  await page.evaluate(() => window.scrollTo(0, 200));
  await expect(page.locator('[data-header]')).toHaveClass(/is-scrolled/);
});

test('hero supports timed transitions, pause, navigation and RTL swipe', async ({ page }, testInfo) => {
  await page.goto('/');
  const carousel = page.locator('[data-carousel]');
  const dots = carousel.locator('[data-carousel-dot]');
  expect(await dots.count()).toBeGreaterThan(1);
  const index = () => carousel.locator('[data-carousel-dot].is-active').getAttribute('data-index');
  const initial = await index();
  await page.mouse.move(1, 1);
  await expect.poll(index, { timeout: 8500, message: 'Carousel should advance automatically within six seconds' }).not.toBe(initial);
  const pause = carousel.locator('[data-carousel-pause]');
  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  const paused = await index();
  await page.mouse.move(1, 1);
  await page.waitForTimeout(6200);
  expect(await index()).toBe(paused);
  await carousel.locator('[data-carousel-next]').click();
  await expect.poll(index).not.toBe(paused);
  await dots.first().click();
  await expect(dots.first()).toHaveAttribute('aria-pressed', 'true');
  const activeSlide = carousel.locator('[data-slide].is-active');
  await expect(activeSlide).toHaveCount(1);
  await expect(activeSlide).toHaveAttribute('aria-hidden', 'false');
  await carousel.locator('[data-carousel-prev]').click();
  await expect.poll(index).not.toBe('0');
  if (testInfo.project.use.hasTouch) {
    const beforeSwipe = await index();
    await carousel.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 70, clientY: 240 });
    await carousel.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 190, clientY: 240 });
    await expect.poll(index).not.toBe(beforeSwipe);
  }
  await noOverflow(page);
});

test('gallery filters actual projects and lightbox navigation restores focus', async ({ page }, testInfo) => {
  const suffix = testInfo.project.name + '-' + Date.now();
  await login(page);
  await saveFixture(page, 'projects', {
    title: 'معرض دهانات أول ' + suffix, slug: 'paint-first-' + suffix, description: 'مشروع اختبار للمعرض',
    tags: 'دهانات,شقق', area: 'الرياض', district: 'الياسمين', service: 'دهانات داخلية',
  }, { image: samplePhoto, images: samplePhoto });
  await saveFixture(page, 'projects', {
    title: 'معرض دهانات ثان ' + suffix, slug: 'paint-second-' + suffix, description: 'مشروع اختبار آخر',
    tags: 'دهانات,فلل', area: 'الرياض', district: 'النرجس', service: 'دهانات داخلية',
  }, { image: samplePhoto });
  await saveFixture(page, 'projects', {
    title: 'معرض ديكور ' + suffix, slug: 'decor-' + suffix, description: 'مشروع ديكور للاختبار',
    tags: 'ديكور,مجالس', area: 'الرياض', district: 'حطين', service: 'ديكورات داخلية',
  }, { image: samplePhoto });
  await page.goto('/projects');
  const gallery = page.locator('[data-gallery]');
  await gallery.locator('[data-filter="دهانات"]').click();
  await expect(gallery.locator('[data-filter="دهانات"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(gallery.locator('[data-gallery-item]').filter({ hasText: 'معرض ديكور ' + suffix })).toBeHidden();
  await expect(gallery.locator('[data-gallery-item]').filter({ hasText: 'معرض دهانات أول ' + suffix })).toBeVisible();
  const opener = gallery.locator('[data-gallery-item]').filter({ hasText: 'معرض دهانات أول ' + suffix }).locator('[data-lightbox]').first();
  await opener.click();
  const dialog = page.locator('[data-lightbox-dialog]');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element.open)).toBe(true);
  const firstImage = await dialog.locator('[data-lightbox-image]').getAttribute('src');
  await dialog.locator('[data-lightbox-next]').click();
  await expect.poll(() => dialog.locator('[data-lightbox-image]').getAttribute('src')).not.toBe(firstImage);
  await dialog.locator('[data-lightbox-prev]').click();
  await expect(dialog.locator('[data-lightbox-image]')).toHaveAttribute('src', firstImage);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await gallery.locator('[data-filter="الكل"]').click();
  await expect(gallery.locator('[data-gallery-item]').filter({ hasText: 'معرض ديكور ' + suffix })).toBeVisible();
  await noOverflow(page);
});

test('before and after comparison handles pointer and keyboard changes accessibly', async ({ page }, testInfo) => {
  const suffix = testInfo.project.name + '-' + Date.now();
  await login(page);
  await saveFixture(page, 'beforeAfter', {
    title: 'مقارنة تجديد غرفة ' + suffix, slug: 'compare-' + suffix, description: 'صور اختبار المقارنة',
    area: 'الرياض', district: 'النرجس',
  }, { beforeImage: samplePhoto, afterImage: samplePhoto });
  await page.goto('/before-after');
  const range = page.getByRole('slider', { name: 'مقارنة قبل وبعد: مقارنة تجديد غرفة ' + suffix, exact: true });
  const comparison = range.locator('..');
  await expect(comparison).toBeVisible();
  await range.focus();
  await page.keyboard.press('Home');
  await expect.poll(() => comparison.evaluate(element => element.style.getPropertyValue('--compare'))).toBe('0%');
  await expect(range).toHaveAttribute('aria-valuetext', /0|٠/);
  await page.keyboard.press('End');
  await expect.poll(() => comparison.evaluate(element => element.style.getPropertyValue('--compare'))).toBe('100%');
  const size = await range.boundingBox();
  await range.click({ position: { x: size.width * 0.5, y: size.height * 0.5 } });
  const previous = Number(await range.inputValue());
  expect(previous).toBeGreaterThan(10);
  expect(previous).toBeLessThan(90);
  await page.keyboard.press('ArrowRight');
  expect(Number(await range.inputValue())).not.toBe(previous);
  const rect = await range.boundingBox();
  await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.75, rect.y + rect.height * 0.5, { steps: 5 });
  await page.mouse.up();
  expect(Number(await range.inputValue())).not.toBe(previous);
  await noOverflow(page);
});

test('quote form validates files and phone before saving a complete request', async ({ page }, testInfo) => {
  await page.goto('/quote');
  const form = page.locator('[data-quote-form]');
  await expect(form).toBeVisible();
  await form.locator('[name="phone"]').fill('not-a-number');
  expect(await form.locator('[name="phone"]').evaluate(element => element.validity.valid)).toBe(false);
  const file = form.locator('[name="photos"]');
  await file.setInputFiles({ name: 'unsafe.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  expect(await file.evaluate(element => element.validity.valid)).toBe(false);
  const name = 'طلب متصفح ' + testInfo.project.name + '-' + Date.now();
  for (const [field, value] of Object.entries({
    name, phone: '٠٥٠١٣٠٨٢٩٥', whatsapp: '+966501308295', area: 'الرياض', district: 'النرجس',
    service: 'دهانات داخلية', propertyType: 'فيلا', description: 'دهان مجلس وصالة ومعالجة التشققات',
  })) await fillField(form, field, value);
  await file.setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer: samplePhoto });
  for (const checkbox of await form.locator('input[type="checkbox"][required]').all()) await checkbox.check();
  await form.locator('[data-submit]').click();
  await expect(page).toHaveURL(/\/quote\?sent=1/);
  await login(page);
  await page.goto('/admin/requests?type=quotes');
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  await noOverflow(page);
});

test('administrator can upload, create, edit and delete a project through the dashboard', async ({ page }, testInfo) => {
  const suffix = testInfo.project.name + '-' + Date.now();
  const title = 'إدارة مشروع ' + suffix;
  const slug = 'dashboard-' + suffix;
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
  await login(page);
  const menuToggle = page.locator('[data-menu-toggle]');
  if (await menuToggle.isVisible()) {
    await menuToggle.click();
    const sidebar = page.locator('#admin-sidebar');
    await expect(menuToggle).toHaveAttribute('aria-expanded', 'true');
    const controls = sidebar.locator('a,button,input:not([type="hidden"]),select,textarea');
    await expect(controls.first()).toBeFocused();
    await controls.last().focus();
    await page.keyboard.press('Tab');
    await expect(controls.first()).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(controls.last()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(menuToggle).toBeFocused();
  }
  await page.goto('/admin/projects/new');
  await page.locator('[name="title"]').fill(title);
  await page.locator('[name="slug"]').fill(slug);
  await page.locator('[name="description"]').fill('إضافة مشروع وصورة من لوحة الإدارة');
  await page.locator('[name="image"]').setInputFiles({ name: 'project.png', mimeType: 'image/png', buffer: samplePhoto });
  await page.locator('[name="enabled"]').check();
  await page.getByRole('button', { name: 'حفظ التغييرات', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/projects\/[^/]+\/edit/);
  const createdId = new URL(page.url()).pathname.split('/')[3];
  (page.__cleanupRecords ||= []).push({ collection: 'projects', id: createdId });
  await page.goto('/admin/projects');
  const row = page.locator('[data-record-row]').filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.getByRole('link', { name: 'تعديل', exact: true }).click();
  await page.locator('[name="title"]').fill(title + ' بعد التعديل');
  await page.getByRole('button', { name: 'حفظ التغييرات', exact: true }).click();
  await page.goto('/projects/' + slug);
  await expect(page.locator('h1')).toContainText(title + ' بعد التعديل');
  await page.goto('/admin/projects');
  const edited = page.locator('[data-record-row]').filter({ hasText: title + ' بعد التعديل' });
  page.once('dialog', dialog => dialog.accept());
  await edited.getByRole('button', { name: 'حذف', exact: true }).click();
  await expect(page.locator('[data-record-row]').filter({ hasText: title })).toHaveCount(0);
  page.__cleanupRecords = page.__cleanupRecords.filter(record => record.id !== createdId);
  expect((await page.context().request.get('/projects/' + slug)).status()).toBe(404);
});

test('slider image upload and duration can be managed from the admin form', async ({ page }, testInfo) => {
  const title = 'صورة واجهة اختبار ' + testInfo.project.name + '-' + Date.now();
  await login(page);
  await page.goto('/admin/slider');
  page.__sliderOrder = await page.locator('tbody[data-sortable] [data-record-row]').evaluateAll(elements => elements.map(element => element.dataset.recordId));
  await page.goto('/admin/slider/new');
  await page.locator('[name="title"]').fill(title);
  await page.locator('[name="description"]').fill('تجربة رفع صورة الواجهة');
  await page.locator('[name="image"]').setInputFiles({ name: 'hero.png', mimeType: 'image/png', buffer: samplePhoto });
  await page.locator('[name="duration"]').fill('4000');
  await page.locator('[name="enabled"]').check();
  await page.getByRole('button', { name: 'حفظ التغييرات', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/slider\/[^/]+\/edit/);
  const newSlideId = new URL(page.url()).pathname.split('/')[3];
  (page.__cleanupRecords ||= []).push({ collection: 'slider', id: newSlideId });
  await page.goto('/admin/slider');
  const row = page.locator('[data-record-row]').filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.getByRole('link', { name: 'تعديل', exact: true }).click();
  await expect(page.locator('[name="duration"]')).toHaveValue('4000');
  await expect(page.locator('[name="imageUrl"]')).toHaveValue(/^\/uploads\/media\/.+\.webp$/);
  const uploadedURL = await page.locator('[name="imageUrl"]').inputValue();
  await noOverflow(page);
  await page.goto('/admin/slider');
  const rows = page.locator('tbody[data-sortable] [data-record-row]');
  const oldOrder = await rows.evaluateAll(elements => elements.map(element => element.dataset.recordId));
  expect(oldOrder.length).toBeGreaterThan(1);
  if (!testInfo.project.use.hasTouch) {
    await rows.last().dragTo(rows.first());
  } else {
    await rows.last().locator('[data-order="up"]').click();
  }
  const saveOrder = page.locator('[data-save-order]');
  await expect(saveOrder).toBeEnabled();
  const changedOrder = await rows.evaluateAll(elements => elements.map(element => element.dataset.recordId));
  expect(changedOrder).not.toEqual(oldOrder);
  const response = page.waitForResponse(result => result.url().endsWith('/admin/slider/reorder') && result.request().method() === 'POST');
  await saveOrder.click();
  expect((await response).status()).toBe(200);
  await page.reload();
  expect(await rows.evaluateAll(elements => elements.map(element => element.dataset.recordId))).toEqual(changedOrder);
  await page.goto('/');
  const slideIndex = await page.locator('[data-slide] img').evaluateAll((elements, url) => elements.findIndex(element => element.getAttribute('src') === url || element.dataset.src === url), uploadedURL);
  expect(slideIndex).toBeGreaterThanOrEqual(0);
  await page.locator('[data-carousel-dot][data-index="' + slideIndex + '"]').click();
  const image = page.locator('[data-slide].is-active img');
  await expect(image).toHaveAttribute('src', uploadedURL);
  await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
});

test('reduced motion disables automatic carousel advancement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const pause = page.locator('[data-carousel-pause]');
  await expect(pause).toBeDisabled();
  const current = () => page.locator('[data-carousel-dot].is-active').getAttribute('data-index');
  const initial = await current();
  await page.mouse.move(1, 1);
  await page.waitForTimeout(6200);
  expect(await current()).toBe(initial);
  await noOverflow(page);
});

test('customer reviews await approval and publish escaped comments on every device', async ({ page }, testInfo) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), 'Feedback mutations require isolated local test servers');
  const name = 'عميل تقييم متصفح ' + testInfo.project.name + '-' + Date.now();
  const comment = 'تجربة ممتازة في تجديد المجلس <img src=x onerror="window.__customerReviewXss=1">';
  let submissions = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/testimonials') submissions += 1;
  });
  await page.goto('/');
  const writeLink = page.getByRole('link', { name: 'اكتب رأيك عن الخدمة', exact: true }).first();
  await expect(writeLink).toBeVisible();
  await expect(writeLink).toHaveAttribute('href', '/testimonials#write-review');
  await writeLink.click();
  await expect(page).toHaveURL(/\/testimonials#write-review$/);
  const form = page.locator('[data-review-form]');
  await expect(form).toBeVisible();
  await expect(form.locator('[name="rating"]')).toHaveValue('');
  await expect(form.locator('[name="website"]')).toBeHidden();
  await form.locator('[name="name"]').fill(name);
  await form.locator('[name="rating"]').selectOption('5');
  await form.locator('[name="service"]').selectOption('interior-painting-riyadh');
  await form.locator('[name="district"]').fill('النرجس');
  await form.locator('[name="comment"]').fill(comment);
  const consent = form.locator('[name="consent"]');
  const submit = form.locator('[data-submit]');
  await expect(consent).not.toBeChecked();
  await submit.click();
  expect(await consent.evaluate(element => element.validity.valueMissing)).toBe(true);
  expect(submissions, 'The form must not submit before the customer agrees to publishing').toBe(0);
  await expect(page).toHaveURL(/\/testimonials#write-review$/);
  await noOverflow(page);
  const buttonSize = await submit.boundingBox();
  expect(buttonSize.width).toBeGreaterThanOrEqual(44);
  expect(buttonSize.height).toBeGreaterThanOrEqual(44);
  await consent.check();
  const submitted = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/testimonials');
  await submit.click();
  expect((await submitted).status()).toBe(303);
  await expect(page).toHaveURL(/\/testimonials\?review=sent#write-review$/);
  await expect(page.getByRole('status').filter({ hasText: 'شكرًا لمشاركتك' })).toBeVisible();
  expect(submissions).toBe(1);
  await expect(page.locator('[data-testimonial]').filter({ hasText: name })).toHaveCount(0);
  await noOverflow(page);

  await login(page);
  await page.goto('/admin/testimonials');
  const row = page.locator('[data-record-row]').filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row).toContainText('بانتظار الاعتماد');
  await expect(row).toContainText('دهانات داخلية');
  const id = await row.getAttribute('data-record-id');
  expect(id).toBeTruthy();
  (page.__cleanupRecords ||= []).push({ collection: 'testimonials', id });
  const approve = row.locator('[data-review-approve]');
  await expect(approve).toHaveAccessibleName('نشر التعليق المرسل من ' + name);
  await approve.click();
  await expect(page).toHaveURL(/\/admin\/testimonials\?saved=1$/);
  await expect(row).toContainText('منشور');
  await expect(row.locator('[data-review-approve]')).toHaveCount(0);
  await noOverflow(page);

  await page.goto('/testimonials');
  const published = page.locator('[data-testimonial]').filter({ hasText: name });
  await expect(published).toBeVisible();
  await expect(published.locator('blockquote')).toHaveText(comment);
  await expect(published).toContainText('دهانات داخلية');
  await expect(published).toContainText('النرجس');
  await expect(published.locator('[aria-label="التقييم 5 من 5"]')).toBeVisible();
  await expect(published.locator('img,script')).toHaveCount(0);
  expect(await page.evaluate(() => window.__customerReviewXss)).toBeUndefined();
  await noOverflow(page);
  await published.screenshot({ path: testInfo.outputPath('customer-review-' + testInfo.project.name + '.png'), scale: 'css' });
});
