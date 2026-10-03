import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import bcrypt from 'bcryptjs';

export class HttpError extends Error {
  constructor(status,message) {super(message);this.status=status;}
}
export const textValue = (value,max=200) => typeof value==='string' ? value.trim().slice(0,max) : '';
export function safeUrl(value,{external=true}={}) {
  const url=textValue(value,2000);
  if(!url)return '';
  if(url.startsWith('/')&&!url.startsWith('//')&&!url.includes('\\')&&!/[\u0000-\u001f]/.test(url))return url;
  try {const parsed=new URL(url);return external&&parsed.protocol==='https:'?parsed.href:'';} catch{return '';}
}
export function safeLink(value) {
  const url=textValue(value,2000);
  if(/^tel:\+?[0-9]{8,18}$/.test(url))return url;
  return safeUrl(url);
}
export const phoneValue=value=>textValue(value,40).replace(/[\s()-]/g,'');
export const validPhone=value=>/^\+?[0-9]{8,18}$/.test(value);
const hash=value=>createHash('sha256').update(value).digest('hex');
const cookieName='lm.sid';
export function createSessionManager(db,{testing=false}={}) {
  const secure=!testing&&process.env.NODE_ENV==='production';
  const age=12*60*60*1000;
  function cookie(res,token) {
    res.cookie(cookieName,token,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:age});
  }
  function issue(req,res,userId=null) {
    if(req.session?.tokenHash)db.removeSession(req.session.tokenHash);
    const token=randomBytes(32).toString('hex');
    const session={tokenHash:hash(token),userId,csrfToken:randomBytes(32).toString('hex'),expiresAt:Date.now()+age};
    db.cleanupSessions();db.saveSession(session.tokenHash,session);req.session=session;cookie(res,token);
    res.locals.csrfToken=session.csrfToken;
    return session;
  }
  function middleware(req,res,next) {
    const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(part=>{const i=part.indexOf('=');return i<0?['','']:[part.slice(0,i).trim(),part.slice(i+1).trim()];}));
    const raw=cookies[cookieName];
    req.session=/^[a-f0-9]{64}$/.test(raw||'')?db.getSession(hash(raw)):null;
    if(!req.session)issue(req,res);
    req.adminUser=req.session.userId?db.getUser(req.session.userId):null;
    res.locals.adminUser=req.adminUser||null;
    res.locals.csrfToken=req.session.csrfToken;
    next();
  }
  function csrf(req,res,next) {
    const value=req.get('X-CSRF-Token')||req.body?._csrf;
    const expected=req.session?.csrfToken;
    if(typeof value!=='string'||!/^[-a-f0-9]{64}$/.test(value)||typeof expected!=='string'||value.length!==expected.length||
       !timingSafeEqual(Buffer.from(value),Buffer.from(expected))) return next(new HttpError(403,'انتهت صلاحية النموذج. حدّث الصفحة وحاول مرة أخرى.'));
    const origin=req.get('Origin');
    if(origin) {
      try {if(new URL(origin).origin!==req.protocol+'://'+req.get('host'))return next(new HttpError(403,'تعذر التحقق من مصدر الطلب.'));}
      catch {return next(new HttpError(403,'مصدر الطلب غير صالح.'));}
    }
    next();
  }
  function requireAdmin(req,res,next) {
    if(!req.adminUser||req.adminUser.role!=='admin')return res.redirect(303,'/admin/login');
    next();
  }
  return {middleware,csrf,requireAdmin,issue};
}
export const upload = multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:5*1024*1024,files:16,fields:100,fieldSize:150*1024,parts:120},
  fileFilter(req,file,callback) {
    if(!['image/jpeg','image/png','image/webp','image/avif'].includes(file.mimetype))return callback(new HttpError(422,'تُقبل صور JPG وPNG وWebP وAVIF فقط.'));
    callback(null,true);
  }
});
export async function processImages(files,uploadsDir,{privateFiles=false}={}) {
  const saved=[];
  const destination=join(uploadsDir,privateFiles?'requests':'media');
  await mkdir(destination,{recursive:true,mode:0o700});
  try {
    for(const file of files) {
      const instance=sharp(file.buffer,{limitInputPixels:25_000_000,failOn:'error'});
      const info=await instance.metadata();
      if(!['jpeg','png','webp','avif','heif'].includes(info.format)||!info.width||!info.height||info.pages>1)throw new HttpError(422,'إحدى الصور غير صالحة أو متعددة الإطارات.');
      const filename=randomUUID()+'.webp';
      const buffer=await instance.rotate().resize({width:2000,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();
      await writeFile(join(destination,filename),buffer,{mode:0o600,flag:'wx'});
      saved.push({filename,url:privateFiles?'/admin/request-photos/'+filename:'/uploads/media/'+filename,originalName:textValue(file.originalname,160)});
    }
    return saved;
  } catch(error) {
    await removeImages(saved,uploadsDir,{privateFiles});
    if(error instanceof HttpError)throw error;
    throw new HttpError(422,'تعذر معالجة الصور. تحقق من نوع الصورة وحجمها.');
  }
}
export async function removeImages(files,uploadsDir,{privateFiles=false}={}) {
  await Promise.allSettled(files.map(file=>unlink(join(uploadsDir,privateFiles?'requests':'media',file.filename))));
}
export async function bootstrapAdmin(db) {
  const email=process.env.ADMIN_EMAIL?.trim().toLowerCase(),password=process.env.ADMIN_PASSWORD;
  if(db.countUsers()||(!email&&!password))return;
  if(!email||!/^\S+@\S+\.\S+$/.test(email)||!password||password.length<12)throw new Error('First admin requires ADMIN_EMAIL and ADMIN_PASSWORD of at least 12 characters.');
  db.createUser(email,await bcrypt.hash(password,12));
}
