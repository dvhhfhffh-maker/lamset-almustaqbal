import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initialSettings, initialCollections } from './content.mjs';

export const collectionTables = Object.freeze({
  services:'Services', projects:'Projects', slider:'SliderImages', beforeAfter:'BeforeAfter',
  testimonials:'Testimonials', blog:'BlogPosts', areas:'Areas', categories:'Categories',
  seo:'SEOSettings', offers:'Offers'
});
const parse = value => { try { return JSON.parse(value); } catch { return {}; } };
const entity = row => row ? { ...row, enabled: Boolean(row.enabled), data: parse(row.data) } : null;
const request = row => row ? { ...row, data: parse(row.data) } : null;
const now = () => new Date().toISOString();

export function createDatabase(path = process.env.DATABASE_PATH || './data/site.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive:true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  sqlite.exec(readFileSync(fileURLToPath(new URL('../database/schema.sql', import.meta.url)), 'utf8'));
  function table(key) {
    if (!Object.hasOwn(collectionTables, key)) throw new Error('Unknown collection');
    return collectionTables[key];
  }
  function getSettings() {
    return Object.fromEntries(sqlite.prepare('SELECT key,value FROM Settings').all().map(row => [row.key, parse(row.value)]));
  }
  function saveSettings(settings) {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const put = sqlite.prepare('INSERT INTO Settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
      for (const [key,value] of Object.entries(settings)) put.run(key,JSON.stringify(value));
      sqlite.exec('COMMIT');
    } catch(error) { sqlite.exec('ROLLBACK'); throw error; }
    return getSettings();
  }
  function list(key, { all=false }={}) {
    return sqlite.prepare('SELECT * FROM '+table(key)+(all ? '' : ' WHERE enabled=1')+' ORDER BY position,createdAt').all().map(entity);
  }
  function get(key,idOrSlug,{all=false}={}) {
    return entity(sqlite.prepare('SELECT * FROM '+table(key)+' WHERE (id=? OR slug=?)'+(all?'':' AND enabled=1')).get(idOrSlug,idOrSlug));
  }
  function save(key,record) {
    const t=table(key), id=record.id || randomUUID(), date=now();
    const stored=get(key,id,{all:true});
    const normalized={id,slug:record.slug||id,title:record.title||'',description:record.description||'',image:record.image||'',enabled:record.enabled!==false,position:Number(record.position)||0,data:record.data||{}};
    sqlite.prepare('INSERT INTO '+t+'(id,slug,title,description,image,enabled,position,data,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,title=excluded.title,description=excluded.description,image=excluded.image,enabled=excluded.enabled,position=excluded.position,data=excluded.data,updatedAt=excluded.updatedAt').run(
      id,normalized.slug,normalized.title,normalized.description,normalized.image,Number(normalized.enabled),normalized.position,JSON.stringify(normalized.data),stored?.createdAt||date,date);
    if(key==='projects') {
      sqlite.prepare('DELETE FROM ProjectImages WHERE projectId=?').run(id);
      const images=Array.isArray(normalized.data.gallery)?normalized.data.gallery:[];
      const put=sqlite.prepare('INSERT INTO ProjectImages(id,projectId,image,alt,position) VALUES(?,?,?,?,?)');
      images.forEach((image,i)=>put.run(randomUUID(),id,typeof image==='string'?image:image.image||image.url||'',typeof image==='string'?normalized.title:image.alt||normalized.title,i));
    }
    return get(key,id,{all:true});
  }
  function remove(key,id) { return sqlite.prepare('DELETE FROM '+table(key)+' WHERE id=?').run(id).changes>0; }
  function reorder(key,ids) {
    if(!Array.isArray(ids)||ids.length>1000||new Set(ids).size!==ids.length) throw new Error('Invalid ordering');
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const put=sqlite.prepare('UPDATE '+table(key)+' SET position=?,updatedAt=? WHERE id=?');
      ids.forEach((id,index)=>put.run(index,now(),id)); sqlite.exec('COMMIT');
    } catch(error) {sqlite.exec('ROLLBACK');throw error;}
  }
  function requestTable(type) {
    if(type==='quotes')return 'QuoteRequests';
    if(type==='contacts')return 'ContactMessages';
    throw new Error('Unknown request type');
  }
  const api={
    sqlite,getSettings,saveSettings,list,get,save,remove,reorder,
    close:()=>sqlite.close(),
    createUser(email,passwordHash) {
      const id=randomUUID();
      sqlite.prepare('INSERT INTO Users(id,email,passwordHash,role,createdAt) VALUES(?,?,?,?,?)').run(id,email.toLowerCase(),passwordHash,'admin',now());
      return api.getUserByEmail(email);
    },
    updatePassword(id,passwordHash) {sqlite.prepare('UPDATE Users SET passwordHash=? WHERE id=?').run(passwordHash,id);sqlite.prepare('DELETE FROM Sessions WHERE userId=?').run(id);},
    getUserByEmail: email=>sqlite.prepare('SELECT * FROM Users WHERE email=? COLLATE NOCASE').get(email),
    getUser: id=>sqlite.prepare('SELECT id,email,role,createdAt FROM Users WHERE id=?').get(id),
    countUsers:()=>sqlite.prepare('SELECT COUNT(*) AS count FROM Users').get().count,
    saveSession(tokenHash,session) {
      sqlite.prepare('INSERT INTO Sessions(tokenHash,userId,csrfToken,expiresAt) VALUES(?,?,?,?)').run(tokenHash,session.userId||null,session.csrfToken,session.expiresAt);
    },
    getSession: tokenHash=>sqlite.prepare('SELECT * FROM Sessions WHERE tokenHash=? AND expiresAt>?').get(tokenHash,Date.now()),
    removeSession: tokenHash=>sqlite.prepare('DELETE FROM Sessions WHERE tokenHash=?').run(tokenHash),
    cleanupSessions:()=>sqlite.prepare('DELETE FROM Sessions WHERE expiresAt<=?').run(Date.now()),
    createRequest(type,data) {
      const id=randomUUID();
      sqlite.prepare('INSERT INTO '+requestTable(type)+'(id,status,data,createdAt) VALUES(?,?,?,?)').run(id,'new',JSON.stringify(data),now());
      return api.getRequest(type,id);
    },
    listRequests:type=>sqlite.prepare('SELECT * FROM '+requestTable(type)+' ORDER BY createdAt DESC').all().map(request),
    getRequest:(type,id)=>request(sqlite.prepare('SELECT * FROM '+requestTable(type)+' WHERE id=?').get(id)),
    setRequestStatus(type,id,status) {
      if(!['new','contacted','quoted','completed','closed'].includes(status))throw new Error('Invalid status');
      sqlite.prepare('UPDATE '+requestTable(type)+' SET status=? WHERE id=?').run(status,id);
    }
  };
  if(!sqlite.prepare("SELECT 1 FROM Settings WHERE key='__initialized'").get()) {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const put=sqlite.prepare('INSERT INTO Settings(key,value) VALUES(?,?)');
      for(const [key,value] of Object.entries({...initialSettings,__initialized:true}))put.run(key,JSON.stringify(value));
      for(const key of Object.keys(collectionTables)) for(const item of initialCollections[key]||[])save(key,item);
      sqlite.exec('COMMIT');
    } catch(error) {sqlite.exec('ROLLBACK');sqlite.close();throw error;}
  }
  return api;
}
