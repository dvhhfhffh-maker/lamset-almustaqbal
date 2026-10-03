import express from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { rateLimit } from 'express-rate-limit';
import { collectionTables } from './db.mjs';
import { HttpError, textValue, safeUrl, safeLink, upload, processImages, removeImages } from './security.mjs';

export const adminCollections = [
  ['slider','صور الواجهة'],['services','الخدمات'],['projects','المشاريع ومعرض الأعمال'],
  ['beforeAfter','قبل وبعد'],['testimonials','آراء العملاء'],['blog','المدونة'],
  ['areas','المناطق والأحياء'],['categories','التصنيفات'],['seo','صفحات SEO'],['offers','العروض']
].map(([key,label])=>({key,label}));
const checked=value=>value==='on'||value==='1'||value==='true'||value===true;
function objectJSON(value,label) {
  if(!value)return {};
  try {const parsed=JSON.parse(value);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();return parsed;}
  catch {throw new HttpError(422,label+' يجب أن يكون كائن JSON صالحًا.');}
}
const cleanSettings = object => Object.fromEntries(Object.entries(object).filter(([key])=>!key.startsWith('__')&&!['constructor','prototype'].includes(key)));
const defaults={id:'',slug:'',title:'',description:'',image:'',enabled:true,position:0,data:{}};

export async function createAdminRouter({db,sessions,uploadsDir}) {
  const router=express.Router();
  const dummyHash=await bcrypt.hash(randomBytes(24).toString('hex'),12);
  const loginLimit=rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:'draft-8',legacyHeaders:false,message:'محاولات تسجيل الدخول كثيرة. حاول لاحقًا.'});
  router.use((req,res,next)=>{
    res.set('Cache-Control','no-store');res.set('X-Robots-Tag','noindex, nofollow');
    res.locals.collections=adminCollections;res.locals.active='';
    res.locals.flash=req.query.saved?'تم حفظ التغييرات بنجاح.':'';
    res.locals.errors=[];next();
  });
  router.get('/login',(req,res)=>{
    if(req.adminUser)return res.redirect('/admin');
    res.render('admin/login',{email:'',title:'دخول الإدارة',hasAdmin:db.countUsers()>0});
  });
  router.post('/login',loginLimit,sessions.csrf,async(req,res)=>{
    const email=textValue(req.body.email,254).toLowerCase(),password=textValue(req.body.password,256);
    const user=db.getUserByEmail(email);
    const valid=await bcrypt.compare(password,user?.passwordHash||dummyHash);
    if(!valid||!user||user.role!=='admin')return res.status(401).render('admin/login',{email,title:'دخول الإدارة',hasAdmin:db.countUsers()>0,errors:['البريد الإلكتروني أو كلمة المرور غير صحيحة.']});
    sessions.issue(req,res,user.id);
    res.redirect(303,'/admin');
  });
  router.use(sessions.requireAdmin);
  router.post('/logout',sessions.csrf,(req,res)=>{sessions.issue(req,res);res.redirect(303,'/admin/login');});
  router.get('/',(req,res)=>{
    const counts=Object.fromEntries(adminCollections.map(item=>[item.key,db.list(item.key,{all:true}).length]));
    const quotes=db.listRequests('quotes'),contacts=db.listRequests('contacts');
    res.render('admin/dashboard',{title:'لوحة التحكم',counts,quotes:quotes.length,contacts:contacts.length,recentRequests:quotes.slice(0,5)});
  });
  router.get('/settings',(req,res)=>res.render('admin/settings',{title:'الإعدادات العامة',active:'settings'}));
  router.post('/settings',upload.fields([{name:'logoUpload',maxCount:1},{name:'faviconUpload',maxCount:1},{name:'shareUpload',maxCount:1}]),sessions.csrf,async(req,res)=>{
    const uploaded=[];
    try {
      const settings={...db.getSettings(),...cleanSettings(objectJSON(req.body.settingsJSON,'الإعدادات'))};
      const strings=['businessName','name','siteName','siteUrl','phone','whatsapp','email','description','heroTitle','heroSubtitle','heroDescription','logo','favicon','metaTitle','metaDescription','ogImage','accentColor','address','mapsUrl'];
      for(const key of strings)if(typeof req.body[key]==='string')settings[key]=textValue(req.body[key],['description','metaDescription','heroDescription'].includes(key)?2500:1000);
      for(const key of ['logo','favicon','ogImage','mapsUrl'])settings[key]=safeUrl(settings[key]);
      if(settings.siteUrl) {
        const site=safeUrl(settings.siteUrl);if(!site||site.startsWith('/'))throw new HttpError(422,'رابط الموقع يجب أن يبدأ بـ https://');settings.siteUrl=site.replace(/\/$/,'');
      }
      if(!/^#[a-fA-F0-9]{6}$/.test(settings.accentColor||''))settings.accentColor='#B69B6A';
      if(Object.hasOwn(req.body,'stats')&&req.body.stats.trim()) {const parsed=JSON.parse(req.body.stats);if(!Array.isArray(parsed))throw new HttpError(422,'الإحصائيات يجب أن تكون قائمة JSON.');settings.stats=parsed;}
      if(Object.hasOwn(req.body,'socialLinks')&&req.body.socialLinks.trim())settings.socialLinks=objectJSON(req.body.socialLinks,'روابط التواصل');
      settings.statsEnabled=checked(req.body.statsEnabled);
      for(const [field,key] of [['logoUpload','logo'],['faviconUpload','favicon'],['shareUpload','ogImage']])if(req.files?.[field]?.length) {
        const files=await processImages(req.files[field],uploadsDir);uploaded.push(...files);settings[key]=files[0].url;
      }
      db.saveSettings(cleanSettings(settings));res.redirect(303,'/admin/settings?saved=1');
    } catch(error) {
      await removeImages(uploaded,uploadsDir);
      if(error instanceof SyntaxError)throw new HttpError(422,'تحقق من صيغة JSON في الإعدادات.');
      throw error;
    }
  });
  router.get('/requests',(req,res)=>{
    const type=req.query.type==='contacts'?'contacts':'quotes';
    res.render('admin/requests',{title:type==='quotes'?'طلبات عروض الأسعار':'رسائل التواصل',active:'requests',type,requests:db.listRequests(type)});
  });
  router.get('/requests/:type/:id',(req,res)=>{
    if(!['quotes','contacts'].includes(req.params.type))throw new HttpError(404,'الطلب غير موجود.');
    const request=db.getRequest(req.params.type,req.params.id);if(!request)throw new HttpError(404,'الطلب غير موجود.');
    res.render('admin/request',{title:'تفاصيل الطلب',active:'requests',type:req.params.type,request});
  });
  router.post('/requests/:type/:id/status',sessions.csrf,(req,res)=>{
    if(!['quotes','contacts'].includes(req.params.type)||!db.getRequest(req.params.type,req.params.id))throw new HttpError(404,'الطلب غير موجود.');
    if(!['new','contacted','quoted','completed','closed'].includes(req.body.status))throw new HttpError(422,'حالة الطلب غير صالحة.');
    db.setRequestStatus(req.params.type,req.params.id,req.body.status);
    res.redirect(303,'/admin/requests/'+req.params.type+'/'+req.params.id+'?saved=1');
  });
  router.get('/request-photos/:filename',(req,res,next)=>{
    if(!/^[a-f0-9-]{36}\.webp$/.test(req.params.filename))return next(new HttpError(404,'الصورة غير موجودة.'));
    res.sendFile(req.params.filename,{root:resolve(uploadsDir,'requests'),dotfiles:'deny'},error=>{if(error)next(new HttpError(404,'الصورة غير موجودة.'));});
  });
  router.post('/slider/reorder',sessions.csrf,(req,res)=>{
    const ids=req.body.ids;
    const valid=new Set(db.list('slider',{all:true}).map(row=>row.id));
    if(!Array.isArray(ids)||ids.length!==valid.size||new Set(ids).size!==ids.length||ids.some(id=>!valid.has(id)))throw new HttpError(422,'ترتيب الصور غير صالح.');
    db.reorder('slider',ids);res.json({success:true});
  });
  router.param('key',(req,res,next,key)=>{
    if(!Object.hasOwn(collectionTables,key))return next(new HttpError(404,'القسم غير موجود.'));
    req.collection=adminCollections.find(item=>item.key===key);res.locals.active=key;next();
  });
  router.get('/:key',(req,res)=>res.render('admin/list',{title:req.collection.label,collection:req.collection,records:db.list(req.params.key,{all:true})}));
  router.get('/:key/new',(req,res)=>res.render('admin/edit',{title:'إضافة '+req.collection.label,collection:req.collection,record:{...defaults},newRecord:true}));
  router.get('/:key/:id/edit',(req,res)=>{
    const record=db.get(req.params.key,req.params.id,{all:true});if(!record)throw new HttpError(404,'العنصر غير موجود.');
    res.render('admin/edit',{title:'تعديل '+record.title,collection:req.collection,record,newRecord:false});
  });
  router.post('/:key/save',upload.fields([{name:'image',maxCount:1},{name:'images',maxCount:12},{name:'beforeImage',maxCount:1},{name:'afterImage',maxCount:1}]),sessions.csrf,async(req,res)=>{
    const uploaded=[];
    const old=req.body.id?db.get(req.params.key,req.body.id,{all:true}):null;
    if(req.body.id&&!old)throw new HttpError(404,'العنصر غير موجود.');
    try {
      const title=textValue(req.body.title,200),slug=textValue(req.body.slug,180);
      if(title.length<2||!slug||!/^[-_a-zA-Z0-9\u0600-\u06ff]+$/.test(slug))throw new HttpError(422,'أدخل عنوانًا ورابطًا صالحًا دون مسافات.');
      const data={...old?.data,...objectJSON(req.body.dataJSON,'بيانات العنصر')};
      const fields=['content','area','district','service','projectDate','buttonLabel','author','seoTitle','metaDescription','clientName','propertyType','alt'];
      for(const field of fields)if(typeof req.body[field]==='string')data[field]=textValue(req.body[field],field==='content'?100000:3000);
      for(const field of ['buttonUrl','beforeImageUrl','afterImageUrl'])if(typeof req.body[field]==='string')data[field]=field==='buttonUrl'?safeLink(req.body[field]):safeUrl(req.body[field]);
      if(req.body.beforeImageUrl!==undefined)data.before=data.beforeImageUrl;
      if(req.body.afterImageUrl!==undefined)data.after=data.afterImageUrl;
      for(const field of ['tags','keywords'])if(typeof req.body[field]==='string')data[field]=req.body[field].split(/[,،\n]/).map(value=>textValue(value,100)).filter(Boolean).slice(0,30);
      if(req.body.duration!==undefined)data.duration=Math.min(20000,Math.max(4000,Number(req.body.duration)||5000));
      if(req.body.rating!==undefined)data.rating=Math.min(5,Math.max(1,Number(req.body.rating)||5));
      if(req.body.galleryUrls!==undefined)data.gallery=req.body.galleryUrls.split(/\n/).map(line=>safeUrl(line)).filter(Boolean).slice(0,40);
      let image=safeUrl(req.body.imageUrl??old?.image);
      for(const [field,key] of [['image','image'],['beforeImage','before'],['afterImage','after'],['images','gallery']])if(req.files?.[field]?.length) {
        const saved=await processImages(req.files[field],uploadsDir);uploaded.push(...saved);
        if(key==='image')image=saved[0].url;
        else if(key==='gallery')data.gallery=[...(Array.isArray(data.gallery)?data.gallery:[]),...saved.map(file=>file.url)].slice(0,40);
        else {data[key]=saved[0].url;data[key+'Image']=saved[0].url;}
      }
      for(const key of ['before','after','beforeImage','afterImage'])if(data[key])data[key]=safeUrl(data[key]);
      if(Array.isArray(data.gallery))data.gallery=data.gallery.map(item=>typeof item==='string'?safeUrl(item):{image:safeUrl(item.image||item.url),alt:textValue(item.alt,300)}).filter(item=>typeof item==='string'?item:item.image);
      const record=db.save(req.params.key,{id:old?.id,title,slug,description:textValue(req.body.description,5000),image,enabled:checked(req.body.enabled),position:Math.min(100000,Math.max(0,Number(req.body.position)||0)),data});
      res.redirect(303,'/admin/'+req.params.key+'/'+record.id+'/edit?saved=1');
    } catch(error) {
      await removeImages(uploaded,uploadsDir);
      if(String(error.message).includes('UNIQUE constraint'))throw new HttpError(422,'الرابط مستخدم بالفعل. اختر رابطًا آخر.');
      throw error;
    }
  });
  router.post('/:key/:id/delete',sessions.csrf,(req,res)=>{
    if(!db.remove(req.params.key,req.params.id))throw new HttpError(404,'العنصر غير موجود.');
    res.redirect(303,'/admin/'+req.params.key+'?saved=1');
  });
  return router;
}
