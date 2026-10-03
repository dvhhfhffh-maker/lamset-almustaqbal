import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { createApp } from '../src/server.mjs';

const account = { email: 'api-test@example.test', password: 'Temporary-Test!Password-64859' };
let app, server, origin, workspace;

class Client {
  cookies = new Map();

  async request(path, options = {}) {
    const headers = new Headers(options.headers);
    if (this.cookies.size) headers.set('cookie', [...this.cookies].map(([key, value]) => key + '=' + value).join('; '));
    const response = await fetch(origin + path, { ...options, headers, redirect: 'manual' });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0];
      const boundary = pair.indexOf('=');
      this.cookies.set(pair.slice(0, boundary), pair.slice(boundary + 1));
    }
    return response;
  }

  async token(path) {
    const response = await this.request(path);
    assert.equal(response.status, 200, 'CSRF form should be reachable at ' + path);
    const html = await response.text();
    for (const input of html.matchAll(/<input\b[^>]*>/gi)) {
      if (/\bname=["']_csrf["']/.test(input[0])) {
        const token = input[0].match(/\bvalue=["']([^"']+)["']/)?.[1];
        if (token) return token;
      }
    }
    const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].find(match => /\bname=["']csrf-token["']/.test(match[0]));
    const token = meta?.[0].match(/\bcontent=["']([^"']+)["']/)?.[1];
    assert.ok(token, 'CSRF token must be rendered in the form');
    return token;
  }

  post(path, values, token) {
    return this.request(path, { method: 'POST', body: new URLSearchParams({ ...values, _csrf: token }) });
  }

  async login() {
    const token = await this.token('/admin/login');
    const previousSession = this.cookies.get('lm.sid');
    const response = await this.post('/admin/login', account, token);
    const cookie = response.headers.getSetCookie().find(value => value.startsWith('lm.sid='));
    assert.match(cookie || '', /HttpOnly/);
    assert.match(cookie || '', /SameSite=Lax/i);
    assert.notEqual(this.cookies.get('lm.sid'), previousSession, 'Login must rotate the anonymous session');
    assert.ok([302, 303].includes(response.status), 'Valid credentials should start a session');
    assert.match(response.headers.get('location') || '', /^\/admin/);
    return this.token('/admin/projects/new');
  }
}

async function image() {
  return sharp({ create: { width: 32, height: 24, channels: 3, background: '#b6a285' } }).png().toBuffer();
}

function multipart(fields, token) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
  form.set('_csrf', token);
  return form;
}

function canonicalHref(html) {
  const link = [...html.matchAll(/<link\b[^>]*>/gi)].find(match => /\brel=["']canonical["']/.test(match[0]));
  return link?.[0].match(/\bhref=["']([^"']+)["']/)?.[1];
}

function oneH1(html, route) {
  assert.equal((html.match(/<h1(?:\s|>)/gi) || []).length, 1, 'Exactly one H1 is required at ' + route);
  assert.match(html, /<html\b[^>]*\blang=["']ar["']/i);
  assert.match(html, /<html\b[^>]*\bdir=["']rtl["']/i);
  assert.match(html, /<title>[^<]+<\/title>/i);
  assert.ok([...html.matchAll(/<meta\b[^>]*>/gi)].some(match => /\bname=["']description["']/.test(match[0]) && /\bcontent=["'][^"']{20,}/.test(match[0])));
  const href = canonicalHref(html);
  assert.ok(href, 'Canonical URL is required at ' + route);
  assert.ok(href && /^https?:\/\//.test(href), 'Canonical URL must be absolute');
}

function schemas(html) {
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap(match => {
      const value = JSON.parse(match[1]);
      return value['@graph'] || (Array.isArray(value) ? value : [value]);
    });
}

beforeEach(async context => {
  workspace = await mkdtemp(join(tmpdir(), 'lamset-api-'));
  app = await createApp({ databasePath: join(workspace, 'site.db'), uploadsDir: join(workspace, 'uploads'), testing: true });
  if (!context.name.startsWith('first administrator')) app.locals.db.createUser(account.email, await bcrypt.hash(account.password, 4));
  server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  origin = 'http://127.0.0.1:' + server.address().port;
});

afterEach(async () => {
  if (server) {
    server.closeIdleConnections?.();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  app?.locals.db.close();
  if (workspace) await rm(workspace, { recursive: true, force: true });
});

test('Arabic public routes and all service detail pages expose accessible SEO content', async () => {
  const client = new Client();
  const routes = ['/', '/services', '/projects', '/before-after', '/about', '/testimonials', '/blog', '/quote', '/contact'];
  const services = app.locals.db.list('services').filter(service => service.enabled);
  assert.equal(services.length, 14, 'The complete service catalogue should be available');
  routes.push(...services.map(service => '/services/' + service.slug));
  for (const area of app.locals.db.list('areas').filter(record => record.enabled)) routes.push('/riyadh/' + area.slug);
  for (const article of app.locals.db.list('blog').filter(record => record.enabled)) routes.push('/blog/' + article.slug);
  for (const project of app.locals.db.list('projects').filter(record => record.enabled)) routes.push('/projects/' + project.slug);
  for (const route of routes) {
    const response = await client.request(route);
    assert.equal(response.status, 200, route);
    const html = await response.text();
    oneH1(html, route);
    assert.match(html, /href=["']tel:\+966501308295["']/);
    assert.match(html, /https:\/\/wa\.me\/966501308295\?text=/);
    schemas(html);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(response.headers.get('content-security-policy')?.includes('script-src'));
  }
  const home = await (await client.request('/')).text();
  assert.ok(schemas(home).some(item => [item['@type']].flat().some(type => ['LocalBusiness', 'HomeAndConstructionBusiness'].includes(type))));
  assert.equal(app.locals.db.getSettings().statsEnabled, false, 'Unverified business statistics must stay hidden by default');
  const detail = await (await client.request('/services/interior-painting-riyadh')).text();
  assert.ok(schemas(detail).some(item => item['@type'] === 'Service'));
  assert.ok(schemas(detail).some(item => item['@type'] === 'BreadcrumbList'));
  const previousSiteUrl = process.env.SITE_URL;
  try {
    process.env.SITE_URL = 'https://seo.example.test';
    const environmentPage = await (await client.request('/services/interior-painting-riyadh')).text();
    assert.equal(canonicalHref(environmentPage), 'https://seo.example.test/services/interior-painting-riyadh');
    assert.ok(schemas(environmentPage).some(item => item['@id'] === 'https://seo.example.test/#business'));
    const environmentSitemap = await (await client.request('/sitemap.xml')).text();
    assert.match(environmentSitemap, /<loc>https:\/\/seo\.example\.test\/services\/interior-painting-riyadh<\/loc>/);
    app.locals.db.saveSettings({ siteUrl: 'https://managed.example.test' });
    const managedPage = await (await client.request('/services/interior-painting-riyadh')).text();
    assert.equal(canonicalHref(managedPage), 'https://managed.example.test/services/interior-painting-riyadh');
    assert.ok(schemas(managedPage).some(item => item['@id'] === 'https://managed.example.test/#business'));
    assert.match(await (await client.request('/sitemap.xml')).text(), /<loc>https:\/\/managed\.example\.test\/services\/interior-painting-riyadh<\/loc>/);
  } finally {
    if (previousSiteUrl === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previousSiteUrl;
  }
});

test('health, sitemap, robots and unknown URLs return the intended status', async () => {
  const client = new Client();
  assert.equal((await client.request('/healthz')).status, 200);
  const sitemap = await client.request('/sitemap.xml');
  assert.equal(sitemap.status, 200);
  const xml = await sitemap.text();
  assert.match(xml, /<urlset\b/);
  assert.match(xml, /\/services\/interior-painting-riyadh/);
  assert.doesNotMatch(xml, /<loc>[^<]*\/admin/);
  const robots = await client.request('/robots.txt');
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Disallow:\s*\/admin/i);
  for (const path of ['/missing-page', '/services/not-a-service', '/projects/not-a-project', '/blog/not-a-post']) {
    const response = await client.request(path);
    assert.equal(response.status, 404, path);
    assert.match(await response.text(), /العودة للرئيسية/);
  }
});

test('admin authentication protects reads and writes; wrong passwords do not start a session', async () => {
  const client = new Client();
  const anonymous = await client.request('/admin');
  assert.ok([302, 303].includes(anonymous.status));
  assert.match(anonymous.headers.get('location'), /^\/admin\/login/);
  const token = await client.token('/admin/login');
  const wrong = await client.post('/admin/login', { email: account.email, password: 'incorrect-password' }, token);
  assert.equal(wrong.status, 401);
  assert.ok([302, 303].includes((await client.request('/admin/projects')).status));
  const validToken = await client.login();
  const dashboard = await client.request('/admin');
  assert.equal(dashboard.status, 200);
  const protectedWrite = await client.request('/admin/projects/save', {
    method: 'POST', body: multipart({ title: 'فحص حماية', enabled: '1' }, 'invalid-csrf'),
  });
  assert.equal(protectedWrite.status, 403);
    assert.ok(client.cookies.has('lm.sid'), 'Authentication must use a server session cookie');
  assert.ok(validToken.length >= 16);
  assert.equal(app.locals.db.list('projects').some(project => project.title === 'فحص حماية'), false);
  const logout = await client.post('/admin/logout', {}, validToken);
  assert.ok([302, 303].includes(logout.status));
  assert.ok([302, 303].includes((await client.request('/admin')).status));
});

test('CSRF and validation reject forged contact and quote requests before persistence', async () => {
  const client = new Client();
  const contactToken = await client.token('/contact');
  const forged = await client.post('/contact', { name: 'عميل', phone: '0501308295', message: 'استفسار عن دهانات الرياض' }, 'forged-token');
  assert.equal(forged.status, 403);
  const missing = await client.request('/quote', { method: 'POST', body: new URLSearchParams({ name: 'عميل' }) });
  assert.equal(missing.status, 403);
  const crossOrigin = await client.request('/contact', { method: 'POST', headers: { Origin: 'https://unrelated.example.test' }, body: new URLSearchParams({ name: 'عميل', phone: '0501308295', message: 'استفسار عن دهانات الرياض', _csrf: contactToken }) });
  assert.equal(crossOrigin.status, 403);
  const invalid = await client.post('/contact', { name: '', phone: 'not-a-phone', message: '' }, contactToken);
  assert.equal(invalid.status, 422);
  assert.equal(app.locals.db.listRequests('contacts').length, 0);
  assert.equal(app.locals.db.listRequests('quotes').length, 0);
});

test('contact requests persist safely and HTML is escaped when read by an administrator', async () => {
  const client = new Client();
  const token = await client.token('/contact');
  const message = 'أرغب في معاينة المنزل <script>alert("xss")</script>';
  const response = await client.post('/contact', { name: 'اختبار العميل', phone: '+966501308295', message }, token);
  assert.ok([302, 303].includes(response.status));
  assert.match(response.headers.get('location'), /sent=1/);
  const requests = app.locals.db.listRequests('contacts');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].data.name, 'اختبار العميل');
  const admin = new Client();
  await admin.login();
  const inbox = await admin.request('/admin/requests/contacts/' + requests[0].id);
  assert.equal(inbox.status, 200);
  const html = await inbox.text();
  assert.doesNotMatch(html, /<script>alert\("xss"\)<\/script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('quote requests store all submitted details and validated photos are private', async () => {
  const client = new Client();
  const token = await client.token('/quote');
  const fields = {
    name: 'عميل عرض السعر', phone: '0501308295', whatsapp: '+966501308295',
    area: 'الرياض', district: 'النرجس', service: 'دهانات داخلية', propertyType: 'فيلا',
    description: 'دهان صالة ومجلس مع معالجة تشققات الجدران', budget: '10000',
  };
  const form = multipart(fields, token);
  form.append('photos', new Blob([await image()], { type: 'image/png' }), 'room.png');
  const response = await client.request('/quote', { method: 'POST', body: form });
  assert.ok([302, 303].includes(response.status));
  assert.match(response.headers.get('location'), /sent=1/);
  const requests = app.locals.db.listRequests('quotes');
  assert.equal(requests.length, 1);
  for (const key of ['name', 'district', 'propertyType', 'description']) assert.equal(requests[0].data[key], fields[key]);
  const privatePaths = JSON.stringify(requests[0].data).match(/\/admin\/request-photos\/[^"\s]+\.webp/g) || [];
  assert.equal(privatePaths.length, 1, 'Customer photos should have a protected URL');
  const anonymousPhoto = await client.request(privatePaths[0]);
  assert.notEqual(anonymousPhoto.status, 200);
  const admin = new Client();
  await admin.login();
  const photo = await admin.request(privatePaths[0]);
  assert.equal(photo.status, 200);
  assert.match(photo.headers.get('content-type'), /image\/webp/);
});

test('upload validation rejects MIME spoofing and SVG content without saving a request', async () => {
  const client = new Client();
  const token = await client.token('/quote');
  const values = {
    name: 'عميل', phone: '0501308295', whatsapp: '', area: 'الرياض', district: 'الملقا',
    service: 'دهانات داخلية', propertyType: 'شقة', description: 'دهانات الغرف',
  };
  for (const [content, type, name] of [
    ['not actually a png', 'image/png', 'fake.png'],
    ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'image/svg+xml', 'unsafe.svg'],
  ]) {
    const form = multipart(values, token);
    form.append('photos', new Blob([content], { type }), name);
    assert.equal((await client.request('/quote', { method: 'POST', body: form })).status, 422);
  }
  const mixed = multipart(values, token);
  mixed.append('photos', new Blob([await image()], { type: 'image/png' }), 'valid.png');
  mixed.append('photos', new Blob(['invalid-image'], { type: 'image/png' }), 'fake.png');
  assert.equal((await client.request('/quote', { method: 'POST', body: mixed })).status, 422);
  assert.equal(app.locals.db.listRequests('quotes').length, 0);
  assert.deepEqual(await readdir(join(workspace, 'uploads', 'requests')), [], 'A failed batch must remove previously processed photos');
  const oversized = multipart(values, token);
  oversized.append('photos', new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' }), 'large.png');
  assert.equal((await client.request('/quote', { method: 'POST', body: oversized })).status, 413);
  const excessive = multipart(values, token);
  for (let index = 0; index < 7; index += 1) excessive.append('photos', new Blob([await image()], { type: 'image/png' }), 'photo-' + index + '.png');
  assert.equal((await client.request('/quote', { method: 'POST', body: excessive })).status, 422);
  assert.equal(app.locals.db.listRequests('quotes').length, 0);
});

test('authenticated project create, upload, edit and delete are reflected on public pages', async () => {
  const admin = new Client();
  let token = await admin.login();
  const form = multipart({
    title: 'مشروع اختبار مستقل', slug: 'integration-project', description: 'تجديد غرفة واختبار معرض الصور',
    enabled: '1', area: 'الرياض', district: 'الياسمين', tags: 'دهانات,شقق', service: 'دهانات داخلية',
    projectDate: '2026-01-15', dataJSON: JSON.stringify({ demo: true }),
  }, token);
  form.append('image', new Blob([await image()], { type: 'image/png' }), 'cover.png');
  form.append('images', new Blob([await image()], { type: 'image/png' }), 'gallery.png');
  const created = await admin.request('/admin/projects/save', { method: 'POST', body: form });
  assert.ok([302, 303].includes(created.status), 'Project should save');
  let project = app.locals.db.list('projects').find(record => record.slug === 'integration-project');
  assert.ok(project);
  assert.match(project.image, /^\/uploads\/media\/[^/]+\.webp$/);
  const publicImage = await new Client().request(project.image);
  assert.equal(publicImage.status, 200);
  assert.match(publicImage.headers.get('content-type'), /image\/webp/);
  assert.match(publicImage.headers.get('cache-control') || '', /max-age=/);
  assert.match(await (await new Client().request('/projects/integration-project')).text(), /مشروع اختبار مستقل/);
  token = await admin.token('/admin/projects/' + project.id + '/edit');
  const changed = await admin.request('/admin/projects/save', {
    method: 'POST',
    body: multipart({
      id: project.id, title: 'مشروع بعد التعديل', slug: project.slug, description: project.description,
      imageUrl: project.image, enabled: '1', dataJSON: JSON.stringify(project.data || {}),
    }, token),
  });
  assert.ok([302, 303].includes(changed.status));
  assert.match(await (await new Client().request('/projects/integration-project')).text(), /مشروع بعد التعديل/);
  token = await admin.token('/admin/projects/' + project.id + '/edit');
  const deleted = await admin.post('/admin/projects/' + project.id + '/delete', {}, token);
  assert.ok([302, 303].includes(deleted.status));
  assert.equal(app.locals.db.list('projects').some(record => record.id === project.id), false);
  assert.equal((await new Client().request('/projects/integration-project')).status, 404);
  const mediaFiles = await readdir(join(workspace, 'uploads', 'media'));
  assert.ok(Array.isArray(mediaFiles));
});

test('public form submissions are rate limited per client', async () => {
  const client = new Client();
  const token = await client.token('/contact');
  let limited = false;
  for (let index = 0; index < 30; index += 1) {
    const response = await client.post('/contact', {
      name: 'اختبار الحد', phone: '0501308295', message: 'رسالة اختبار رقم ' + index,
    }, token);
    if (response.status === 429) {
      limited = true;
      assert.ok(response.headers.get('retry-after'), 'Rate limit should explain when to retry');
      break;
    }
    assert.ok([302, 303].includes(response.status), 'Valid requests should be accepted before the limit');
  }
  assert.ok(limited, 'Contact endpoint must stop repeated submissions');
});

test('first administrator setup hashes the owner password, rotates the session and cannot be reused', async () => {
  const client = new Client();
  assert.equal(app.locals.db.countUsers(), 0);
  const setupToken = app.locals.initialSetupToken;
  assert.match(setupToken || '', /^[a-f0-9]{64}$/);
  const path = '/admin/setup/' + setupToken;
  const csrf = await client.token(path);
  const fields = { email: account.email, password: account.password, passwordConfirm: account.password };
  const oldSession = client.cookies.get('lm.sid');
  const created = await client.post(path, fields, csrf);
  assert.equal(created.status, 303);
  assert.equal(created.headers.get('location'), '/admin');
  assert.notEqual(client.cookies.get('lm.sid'), oldSession);
  assert.equal(app.locals.db.countUsers(), 1);
  const user = app.locals.db.getUserByEmail(account.email);
  assert.notEqual(user.passwordHash, account.password);
  assert.ok(await bcrypt.compare(account.password, user.passwordHash));
  assert.equal((await client.request('/admin')).status, 200);
  assert.equal((await new Client().request(path)).status, 404, 'A used setup token must never reopen the setup page');
  const adminCsrf = await client.token('/admin/projects/new');
  assert.equal((await client.post('/admin/logout', {}, adminCsrf)).status, 303);
  assert.equal((await client.request('/admin')).status, 303);
  const anonymousCsrf = await client.token('/admin/login');
  assert.equal((await client.post(path, fields, anonymousCsrf)).status, 404);
  assert.equal(app.locals.db.countUsers(), 1);
});

test('first administrator setup keeps its token private and rejects CSRF and invalid credentials', async () => {
  const client = new Client();
  const setupToken = app.locals.initialSetupToken;
  assert.match(setupToken || '', /^[a-f0-9]{64}$/);
  const loginPage = await (await client.request('/admin/login')).text();
  assert.doesNotMatch(loginPage, new RegExp(setupToken), 'The private setup link must not be discoverable on the login screen');
  assert.doesNotMatch(await (await client.request('/')).text(), new RegExp(setupToken));
  const path = '/admin/setup/' + setupToken;
  const csrf = await client.token(path);
  const fields = { email: account.email, password: account.password, passwordConfirm: account.password };
  const forged = await client.post(path, fields, 'forged-csrf');
  assert.equal(forged.status, 403);
  assert.equal((await client.post(path, { ...fields, password: 'short', passwordConfirm: 'short' }, csrf)).status, 422);
  assert.equal((await client.post(path, { ...fields, passwordConfirm: 'different-confirmation' }, csrf)).status, 422);
  assert.equal((await client.post(path, { ...fields, email: 'invalid-email' }, csrf)).status, 422);
  assert.equal(app.locals.db.countUsers(), 0);
  assert.equal((await client.request('/admin')).status, 303);
});

test('first administrator expired and invalid setup links cannot create an account', async () => {
  const client = new Client();
  const setupToken = app.locals.initialSetupToken;
  assert.match(setupToken || '', /^[a-f0-9]{64}$/);
  assert.equal((await client.request('/admin/setup/' + '0'.repeat(64))).status, 404);
  app.locals.db.sqlite.prepare('UPDATE AdminSetupTokens SET expiresAt=?').run(Date.now() - 1);
  const path = '/admin/setup/' + setupToken;
  assert.equal((await client.request(path)).status, 404);
  assert.equal((await client.post(path, {
    email: account.email, password: account.password, passwordConfirm: account.password,
  }, 'expired-token')).status, 404);
  assert.equal(app.locals.db.countUsers(), 0);
  assert.equal((await client.request('/admin')).status, 303);
});

test('first administrator setup becomes unavailable when any owner account already exists', async () => {
  const client = new Client();
  const setupToken = app.locals.initialSetupToken;
  assert.match(setupToken || '', /^[a-f0-9]{64}$/);
  app.locals.db.createUser(account.email, await bcrypt.hash(account.password, 4));
  assert.equal((await client.request('/admin/setup/' + setupToken)).status, 404);
  assert.equal((await client.post('/admin/setup/' + setupToken, {
    email: 'other-owner@example.test', password: account.password, passwordConfirm: account.password,
  }, 'no-csrf-needed-for-invalid-link')).status, 404);
  assert.equal(app.locals.db.countUsers(), 1);
  await client.login();
  assert.equal((await client.request('/admin')).status, 200);
});

test('managed categories, project flags, customer names and offers appear on the public site', async () => {
  const admin = new Client();
  let token = await admin.login();
  for (const [collection, values] of [
    ['projects', { title: 'تاريخ غير صالح', slug: 'invalid-calendar-day', projectDate: '2026-02-31', enabled: '1' }],
    ['slider', { title: 'شريحة دون صورة', enabled: '1' }],
    ['beforeAfter', { title: 'مقارنة غير مكتملة', enabled: '1' }],
  ]) {
    const rejected = await admin.request('/admin/' + collection + '/save', { method: 'POST', body: multipart(values, token) });
    assert.equal(rejected.status, 422, 'Invalid dates or missing required imagery must prevent publication');
    assert.equal(app.locals.db.list(collection).some(item => item.title === values.title), false);
  }
  const categoryTitle = 'تفاصيل هادئة للاختبار';
  const categoryResponse = await admin.request('/admin/categories/save', {
    method: 'POST', body: multipart({
      title: categoryTitle, slug: 'managed-category', description: 'تصنيف جديد لإدارة المعرض', enabled: '1',
    }, token),
  });
  assert.equal(categoryResponse.status, 303);
  const projectResponse = await admin.request('/admin/projects/save', {
    method: 'POST', body: multipart({
      title: 'مشروع مميز مُدار', slug: 'managed-featured-project', description: 'مشروع اختبار إعدادات النشر',
      enabled: '1', manageFlags: '1', featured: '1', demo: '1', tags: '', projectDate: '2026-01-15',
      imageUrl: '/favicon.svg', dataJSON: JSON.stringify({ category: categoryTitle, images: [{ url: '/favicon.svg', alt: 'وصف صورة محفوظ' }] }),
    }, token),
  });
  assert.equal(projectResponse.status, 303);
  const project = app.locals.db.get('projects', 'managed-featured-project');
  assert.equal(project.data.featured, true);
  assert.equal(project.data.demo, true);
  assert.equal(project.data.date, '2026-01-15');
  const gallery = await (await new Client().request('/projects')).text();
  assert.ok(gallery.includes('data-filter="' + categoryTitle + '"'), 'Managed categories must be available as gallery filters');
  assert.ok(gallery.includes('data-categories="' + categoryTitle + '"'), 'Empty tags must fall back to the selected category');
  assert.match(await (await new Client().request('/')).text(), /مشروع مميز مُدار/);
  token = await admin.token('/admin/projects/' + project.id + '/edit');
  const unsetFlags = await admin.request('/admin/projects/save', {
    method: 'POST', body: multipart({
      id: project.id, title: project.title, slug: project.slug, description: project.description,
      enabled: '1', manageFlags: '1', imageUrl: project.image, galleryUrls: '/favicon.svg', dataJSON: JSON.stringify(project.data),
    }, token),
  });
  assert.equal(unsetFlags.status, 303);
  const updated = app.locals.db.get('projects', project.id);
  assert.equal(updated.data.featured, false);
  assert.equal(updated.data.demo, false);
  assert.equal(updated.data.images[0].alt, 'وصف صورة محفوظ', 'Editing gallery URLs must preserve existing alternative text');
  const reviewResponse = await admin.request('/admin/testimonials/save', {
    method: 'POST', body: multipart({
      title: 'سجل تقييم اختبار', clientName: 'عميل إدارة التقييمات', description: 'تقييم اختبار لإثبات ظهور اسم العميل',
      enabled: '1', rating: '4', area: 'النرجس', manageFlags: '1', demo: '1',
    }, token),
  });
  assert.equal(reviewResponse.status, 303, 'Review forms should not require an invisible slug field');
  const review = app.locals.db.list('testimonials').find(item => item.title === 'سجل تقييم اختبار');
  assert.ok(review?.slug, 'A review must receive a stable generated identifier');
  const reviewSlug = review.slug;
  const editedReview = await admin.request('/admin/testimonials/save', {
    method: 'POST', body: multipart({
      id: review.id, title: review.title, clientName: 'عميل بعد التعديل', description: review.description,
      enabled: '1', rating: '4', dataJSON: JSON.stringify(review.data),
    }, token),
  });
  assert.equal(editedReview.status, 303);
  assert.equal(app.locals.db.get('testimonials', review.id).slug, reviewSlug, 'Editing without a slug must preserve the existing identifier');
  assert.match(await (await new Client().request('/testimonials')).text(), /عميل بعد التعديل/);
  const offerResponse = await admin.request('/admin/offers/save', {
    method: 'POST', body: multipart({
      title: 'عرض معاينة اختبار', slug: 'managed-offer', description: 'عرض خاص يُدار من لوحة التحكم',
      enabled: '1', dataJSON: JSON.stringify({ buttonText: 'اسأل عن العرض', buttonUrl: '/quote' }),
    }, token),
  });
  assert.equal(offerResponse.status, 303);
  assert.match(await (await new Client().request('/')).text(), /عرض معاينة اختبار/);
  const unsafeLink = await admin.request('/admin/offers/save', {
    method: 'POST', body: multipart({
      title: 'اختبار رابط آمن', slug: 'managed-unsafe-link', dataJSON: JSON.stringify({ buttonUrl: 'javascript:alert(1)' }),
    }, token),
  });
  assert.equal(unsafeLink.status, 303);
  assert.equal(app.locals.db.get('offers', 'managed-unsafe-link', { all: true }).data.buttonUrl, '', 'Advanced JSON URLs must use the same safety checks as visible form fields');
});

function customerReviews() {
  return app.locals.db.list('testimonials', { all: true }).filter(record => record.data.source === 'customer');
}

function reviewFields(changes = {}) {
  return {
    name: 'عميل تقييم مستقل', rating: '5', service: 'interior-painting-riyadh',
    district: 'النرجس', comment: 'تجربة ممتازة في دهانات المجلس', consent: 'on', website: '',
    ...changes,
  };
}

test('customer reviews remain private until approved, publish escaped text and can be unpublished', async () => {
  const customer = new Client();
  const token = await customer.token('/testimonials');
  const service = app.locals.db.get('services', 'interior-painting-riyadh');
  const name = 'عميل مراجعة دورة النشر';
  const comment = 'عمل متقن <script>window.reviewLifecycleAttack=1</script> مع اهتمام بالتفاصيل';
  const submitted = await customer.post('/testimonials', reviewFields({
    name, comment, id: 'forged-review-id', enabled: '1', moderationStatus: 'published',
    source: 'admin', dataJSON: '{"source":"admin","moderationStatus":"published"}',
  }), token);
  assert.equal(submitted.status, 303);
  assert.equal(submitted.headers.get('location'), '/testimonials?review=sent#write-review');
  assert.equal(customerReviews().length, 1);
  let review = customerReviews()[0];
  assert.notEqual(review.id, 'forged-review-id', 'Customers cannot choose or replace a record identifier');
  assert.equal(review.title, name);
  assert.equal(review.description, comment);
  assert.equal(review.enabled, false, 'A submission must never publish itself');
  assert.equal(review.data.source, 'customer');
  assert.equal(review.data.moderationStatus, 'pending');
  assert.equal(review.data.clientName, name);
  assert.equal(review.data.rating, 5);
  assert.equal(review.data.area, 'النرجس');
  assert.equal(review.data.service, service.title);
  assert.equal(review.data.serviceSlug, service.slug);
  assert.equal(review.data.consent, true);
  assert.equal(new Date(review.data.submittedAt).toISOString(), review.data.submittedAt);
  assert.equal(app.locals.db.list('testimonials').some(record => record.id === review.id), false);
  for (const route of ['/', '/testimonials']) {
    const html = await (await customer.request(route)).text();
    assert.ok(!html.includes(name), 'Pending client identity must stay off public pages: ' + route);
    assert.ok(!html.includes('reviewLifecycleAttack'), 'Pending feedback must stay private: ' + route);
  }
  const anonymousApproval = await customer.post('/admin/testimonials/' + review.id + '/approve', {}, token);
  assert.ok([302, 303].includes(anonymousApproval.status));
  assert.equal(anonymousApproval.headers.get('location'), '/admin/login');
  assert.equal(app.locals.db.get('testimonials', review.id, { all: true }).enabled, false);

  const admin = new Client();
  const adminToken = await admin.login();
  const moderation = await admin.request('/admin/testimonials');
  assert.equal(moderation.status, 200);
  const moderationHtml = await moderation.text();
  assert.ok(moderationHtml.includes(name), 'The administrator must see pending submissions');
  assert.ok(moderationHtml.includes('/admin/testimonials/' + review.id + '/approve'), 'Moderation must offer an approval action');
  assert.ok(moderationHtml.includes('بانتظار الاعتماد'));
  assert.equal((await admin.post('/admin/testimonials/' + review.id + '/approve', {}, 'forged-csrf')).status, 403);
  assert.equal(app.locals.db.get('testimonials', review.id, { all: true }).enabled, false);
  const approved = await admin.post('/admin/testimonials/' + review.id + '/approve', {}, adminToken);
  assert.equal(approved.status, 303);
  assert.equal(approved.headers.get('location'), '/admin/testimonials?saved=1');
  review = app.locals.db.get('testimonials', review.id);
  assert.equal(review.enabled, true);
  assert.equal(review.data.moderationStatus, 'published');
  for (const route of ['/', '/testimonials']) {
    const html = await (await customer.request(route)).text();
    assert.ok(html.includes(name), 'Approved feedback must appear publicly: ' + route);
    assert.match(html, /&lt;script&gt;window\.reviewLifecycleAttack=1&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>window\.reviewLifecycleAttack=1<\/script>/);
  }
  assert.equal((await admin.post('/admin/testimonials/nonexistent-review/approve', {}, adminToken)).status, 404);
  const hidden = await admin.request('/admin/testimonials/save', {
    method: 'POST', body: multipart({
      id: review.id, title: review.title, slug: review.slug, description: review.description,
      clientName: name, rating: '5', area: 'النرجس', dataJSON: JSON.stringify(review.data),
    }, adminToken),
  });
  assert.equal(hidden.status, 303);
  const unpublished = app.locals.db.get('testimonials', review.id, { all: true });
  assert.equal(unpublished.enabled, false);
  assert.equal(unpublished.data.moderationStatus, 'pending');
  assert.ok(!(await (await customer.request('/testimonials')).text()).includes(name), 'Disabling a customer review must remove it from the public slider');
});

test('customer review validation rejects out-of-range names and non-integer ratings', async () => {
  const client = new Client();
  const token = await client.token('/testimonials');
  const invalid = [
    { name: 'أ' }, { name: 'أ'.repeat(81) }, { rating: '0' }, { rating: '6' }, { rating: '1.5' },
  ];
  for (const changes of invalid) {
    const response = await client.post('/testimonials', reviewFields(changes), token);
    assert.equal(response.status, 422, 'Invalid review values must be rejected: ' + Object.keys(changes).join(','));
    assert.equal(customerReviews().length, 0, 'Invalid input must never become a pending review');
  }
});

test('customer review validation enforces comment, district, consent and service boundaries', async () => {
  const client = new Client();
  const token = await client.token('/testimonials');
  const invalid = [
    { comment: 'لا' }, { comment: 'ر'.repeat(2001) }, { district: 'ح'.repeat(121) },
    { consent: 'yes' }, { service: 'not-a-real-service' },
  ];
  for (const changes of invalid) {
    const response = await client.post('/testimonials', reviewFields(changes), token);
    assert.equal(response.status, 422, 'Invalid feedback must produce a validation response');
    assert.equal(customerReviews().length, 0);
  }
});

test('customer reviews accept short and boundary-length feedback but reject disabled services and IDs', async () => {
  const client = new Client();
  const token = await client.token('/testimonials');
  const service = app.locals.db.get('services', 'interior-painting-riyadh');
  assert.equal((await client.post('/testimonials', reviewFields({ service: service.id }), token)).status, 422, 'Service IDs must not be accepted as slugs');
  app.locals.db.save('services', { ...service, enabled: false });
  assert.equal((await client.post('/testimonials', reviewFields({ service: service.slug }), token)).status, 422, 'Disabled services cannot be selected by a customer');
  assert.equal(customerReviews().length, 0);
  const boundaries = [
    { name: 'أح', comment: 'رأي', rating: '1', district: '', service: '' },
    { name: 'ن'.repeat(80), comment: 'ر'.repeat(2000), rating: '5', district: 'ح'.repeat(120), service: 'gypsum-board-riyadh' },
    { name: 'عميل تعليق قصير', comment: 'ممتاز', rating: '4', service: '' },
  ];
  for (const fields of boundaries) {
    const response = await client.post('/testimonials', reviewFields(fields), token);
    assert.equal(response.status, 303, 'Legitimate short and maximum-length comments must be accepted');
    const review = customerReviews().find(record => record.title === fields.name);
    assert.ok(review);
    assert.equal(review.description, fields.comment);
    assert.equal(review.data.rating, Number(fields.rating));
    assert.equal(review.data.area, fields.district ?? 'النرجس');
    assert.equal(review.enabled, false);
    assert.equal(review.data.serviceSlug, fields.service);
    assert.equal(review.data.service, fields.service ? app.locals.db.get('services', fields.service).title : '');
  }
  assert.equal(customerReviews().length, 3);
});

test('customer feedback requires same-origin CSRF protection and honeypots never persist records', async () => {
  const client = new Client();
  const token = await client.token('/testimonials');
  const missing = await client.request('/testimonials', { method: 'POST', body: new URLSearchParams(reviewFields()) });
  assert.equal(missing.status, 403);
  assert.equal((await client.post('/testimonials', reviewFields(), 'forged-token')).status, 403);
  const crossOrigin = await client.request('/testimonials', {
    method: 'POST', headers: { Origin: 'https://unrelated.example.test' },
    body: new URLSearchParams({ ...reviewFields(), _csrf: token }),
  });
  assert.equal(crossOrigin.status, 403);
  const honeypot = await client.post('/testimonials', reviewFields({ website: 'https://spam.example.test' }), token);
  assert.equal(honeypot.status, 303, 'Bots receive the same response without creating public or pending content');
  assert.equal(honeypot.headers.get('location'), '/testimonials?review=sent#write-review');
  assert.equal((await client.post('/testimonials', reviewFields({ website: 'https://spam.example.test' }), 'forged-token')).status, 403, 'The honeypot must never bypass CSRF');
  assert.equal(customerReviews().length, 0);
});

test('customer feedback has its own five-per-hour submission limit', async () => {
  const client = new Client();
  const token = await client.token('/testimonials');
  for (let index = 0; index < 5; index += 1) {
    const response = await client.post('/testimonials', reviewFields({ name: 'عميل حد التقييم ' + index }), token);
    assert.equal(response.status, 303, 'The first five valid submissions should remain available');
  }
  const blocked = await client.post('/testimonials', reviewFields({ name: 'عميل يتجاوز الحد' }), token);
  assert.equal(blocked.status, 429, 'A sixth submission within the hour must be blocked');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0, 'The rate limit should indicate when the client can retry');
  assert.equal(customerReviews().length, 5, 'A blocked submission must not be saved');
  assert.ok(customerReviews().every(record => !record.enabled), 'The rate limit must not alter moderation');
});
