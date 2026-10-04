import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { createDatabase } from './db.mjs';
import { createAdminRouter } from './admin.mjs';
import { HttpError, createSessionManager, bootstrapAdmin, textValue, phoneValue, validPhone, safeUrl, upload, processImages, removeImages } from './security.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const whatsappMessage='السلام عليكم، شاهدت موقع لمسة المستقبل وأرغب في معرفة التفاصيل والحصول على عرض سعر.';
const pageLabels={home:'الرئيسية',services:'خدماتنا',projects:'أعمالنا ومشاريعنا','before-after':'قبل وبعد',about:'من نحن',testimonials:'آراء العملاء',blog:'المدونة',quote:'طلب عرض سعر',contact:'تواصل معنا',notfound:'الصفحة غير موجودة'};
const defaultPageDescriptions={
  "services": "استكشف خدمات الدهانات الداخلية والخارجية والجبس بورد والديكور وترميم وتجديد المنازل في الرياض وشمال الرياض، واختر الخدمة المناسبة لمساحتك.",
  "projects": "تصفح معرض صور الدهانات والجبس بورد والديكورات والتجديد. استكشف تفاصيل المساحات والخامات والأفكار، وتواصل لمناقشة مشروع منزلك في الرياض.",
  "before-after": "تعرف على قسم مقارنة أعمال الدهانات والترميم قبل وبعد. تعرض لمسة المستقبل المقارنات الموثّقة بعد إضافتها من أعمالها في الرياض.",
  "about": "تعرف على لمسة المستقبل وخدمات الدهانات والديكورات والجبس بورد والترميم في الرياض، وكيف نعتني بالتفاصيل من المعاينة حتى تسليم العمل.",
  "testimonials": "شارك رأيك وتقييمك لخدمات لمسة المستقبل في الرياض، واقرأ آراء العملاء المنشورة بعد المراجعة. يمكن تحديد الخدمة والحي عند كتابة تعليقك.",
  "blog": "نصائح عملية لاختيار الدهانات والألوان والجبس بورد، وأفكار ديكور المجالس وتجديد المنازل في الرياض تساعدك على التخطيط قبل بدء العمل.",
  "quote": "اطلب عرض سعر لأعمال الدهانات والجبس بورد والديكور والترميم في الرياض. وضّح نوع العقار والخدمة والحي وأرفق صور المساحة لمناقشة احتياجك.",
  "contact": "تواصل مع لمسة المستقبل عبر الهاتف أو واتساب للاستفسار عن الدهانات والديكور وترميم المنازل في الرياض وشمال الرياض، أو أرسل رسالة من الموقع."
};
const xml=value=>String(value).replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]));
const baseURL=(req,settings)=>{
  const configured=safeUrl(settings.siteUrl||process.env.SITE_URL);
  if(configured&&!configured.startsWith('/'))return configured.replace(/\/$/,'');
  const host=req.get('host')||'localhost';
  return req.protocol+'://'+(/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)?host:'localhost');
};
const absolute=(url,base)=>url?.startsWith('/')?base+url:url;
function publicData(db) {
  return {settings:db.getSettings(),services:db.list('services'),projects:db.list('projects'),
    comparisons:db.list('beforeAfter'),testimonials:db.list('testimonials'),
    posts:db.list('blog'),areas:db.list('areas'),categories:db.list('categories'),slides:db.list('slider'),offers:db.list('offers')};
}
function businessSchema(settings,base) {
  const name=settings.businessName||settings.siteName||settings.name||'لمسة المستقبل';
  const schema={'@context':'https://schema.org','@type':['LocalBusiness','HomeAndConstructionBusiness'],'@id':base+'/#business',name,url:base,telephone:settings.phone||'+966501308295',
    description:settings.description||'دهانات وديكورات وترميم وتجديد منازل في الرياض.',
    address:{'@type':'PostalAddress',addressLocality:'الرياض',addressRegion:'الرياض',addressCountry:'SA'},
    areaServed:{'@type':'City',name:'الرياض'},image:absolute(settings.ogImage||'',base)};
  if(settings.officialStreetAddress)schema.address.streetAddress=settings.officialStreetAddress;
  if(settings.logo)schema.logo=absolute(settings.logo,base);
  return schema;
}
export function srcsetFor(url) {
  try {
    const original=new URL(url);
    if(original.protocol!=='https:'||original.hostname!=='images.unsplash.com')return '';
    return [480,800,1200,1600,1920].map(width=>{
      const variant=new URL(original);
      variant.searchParams.set('w',String(width));
      variant.searchParams.set('auto','format');
      return variant.href+' '+width+'w';
    }).join(', ');
  } catch{return '';}
}
export async function createApp({databasePath=process.env.DATABASE_PATH||resolve(root,'data/site.sqlite'),uploadsDir=process.env.UPLOADS_DIR||resolve(root,'data/uploads'),testing=false}={}) {
  const app=express(),db=createDatabase(databasePath);
  app.locals.db=db;app.locals.uploadsDir=resolve(uploadsDir);app.locals.srcsetFor=srcsetFor;
  app.disable('x-powered-by');
  if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1);
  app.set('view engine','ejs');app.set('views',resolve(root,'views'));
  await mkdir(resolve(uploadsDir,'media'),{recursive:true});
  const envEmail=process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const envPassword=process.env.ADMIN_PASSWORD;
  const validEnvAdmin=envEmail&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(envEmail)&&envPassword&&envPassword.length>=12&&Buffer.byteLength(envPassword,'utf8')<=72;
  if(db.countUsers()>0||validEnvAdmin)await bootstrapAdmin(db);
  else if(process.env.NODE_ENV==='production'||testing) {
    const token=randomBytes(32).toString('hex');
    db.issueAdminSetupToken(createHash('sha256').update(token).digest('hex'),Date.now()+60*60*1000);
    if(testing)app.locals.initialSetupToken=token;
    else {
      const candidate=safeUrl(process.env.SITE_URL||db.getSettings().siteUrl);
      const base=candidate&&!candidate.startsWith('/')?candidate.replace(/\/$/,''):'';
      console.log('ADMIN_SETUP_URL='+base+'/admin/setup/'+token);
    }
  }
  app.use((req,res,next)=>{res.locals.cspNonce=randomBytes(18).toString('base64');next();});
  app.use(helmet({
    contentSecurityPolicy:{directives:{
      defaultSrc:["'self'"],scriptSrc:["'self'",(req,res)=>"'nonce-"+res.locals.cspNonce+"'"],
      styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],
      fontSrc:["'self'",'https://fonts.gstatic.com','data:'],imgSrc:["'self'",'https:','data:','blob:'],
      connectSrc:["'self'"],objectSrc:["'none'"],baseUri:["'self'"],formAction:["'self'"],
      frameSrc:["'self'",'https://www.google.com'],upgradeInsecureRequests:process.env.NODE_ENV==='production'?[]:null
    }},
    referrerPolicy:{policy:'strict-origin-when-cross-origin'}
  }));
  app.use(compression({filter:(req,res)=>!req.path.startsWith('/admin')&&compression.filter(req,res)}));
  app.get('/healthz',(req,res)=>res.json({status:'ok'}));
  app.get('/theme.css',(req,res)=>{
    const color=db.getSettings().accentColor;
    const accent=/^#[a-fA-F0-9]{6}$/.test(color||'')?color:'#B69B6A';
    res.type('css').set('Cache-Control','no-cache').send(':root{--accent:'+accent+';--gold:'+accent+';--brand:'+accent+'}');
  });
  app.use('/uploads/media',express.static(resolve(uploadsDir,'media'),{maxAge:'30d',immutable:true,dotfiles:'deny',index:false}));
  app.use(express.static(resolve(root,'public'),{maxAge:'1h',dotfiles:'deny',index:false}));
  app.use(express.urlencoded({extended:false,limit:'200kb',parameterLimit:100}));
  app.use(express.json({limit:'200kb'}));
  const sessions=createSessionManager(db,{testing});
  app.use(sessions.middleware);
  app.use((req,res,next)=>{
    Object.assign(res.locals,publicData(db),{srcsetFor});
    const settings=res.locals.settings;
    res.locals.waUrl='https://wa.me/'+String(settings.whatsapp||'966501308295').replace(/\D/g,'')+'?text='+encodeURIComponent(settings.whatsappMessage||whatsappMessage);
    res.locals.telUrl='tel:'+phoneValue(settings.phone||'+966501308295');
    res.locals.requestPath=req.path;res.locals.flash='';res.locals.errors=[];res.locals.formValues={};
    res.locals.item=null;res.locals.schema=[];res.locals.canonical='';res.locals.description='';res.locals.pageImage='';res.locals.keywords='';
    next();
  });
  function renderPage(req,res,view,{item=null,status=200,errors=[],formValues={},title,description,flash}={}) {
    const settings=res.locals.settings,base=baseURL(req,settings);
    const name=settings.businessName||settings.siteName||settings.name||'لمسة المستقبل';
    const label=item?.title||pageLabels[view]||name;
    const seo=db.list('seo').find(record=>record.data?.path===req.path||record.slug===req.path.slice(1));
    const pageTitle=title||seo?.data?.seoTitle||seo?.title||item?.data?.seoTitle||(view==='home'?settings.metaTitle||name+' | دهانات وديكورات وترميم في الرياض':label+' | '+name);
    const pageDescription=description||seo?.data?.metaDescription||seo?.description||item?.data?.metaDescription||item?.description||defaultPageDescriptions[view]||settings.metaDescription||settings.description||'دهانات وديكورات وجبس بورد وترميم وتجديد منازل في الرياض وشمال الرياض.';
    const canonical=base+(req.path==='/'?'':req.path.replace(/\/$/,''));
    const pageImage=absolute(safeUrl(seo?.data?.ogImage||seo?.image||item?.data?.ogImage||item?.image||settings.ogImage),base);
    const keywordValue=seo?.data?.keywords||item?.data?.keywords||settings.keywords||[];
    const keywords=Array.isArray(keywordValue)?keywordValue.join(', '):textValue(keywordValue,2000);
    if(status!==200)res.set('X-Robots-Tag','noindex, nofollow');
    const schema=[businessSchema(settings,base)];
    if(view!=='home'&&status===200)schema.push({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:'الرئيسية',item:base},
      {'@type':'ListItem',position:2,name:label,item:canonical}
    ]});
    if(view==='service')schema.push({'@context':'https://schema.org','@type':'Service',name:item.title,description:item.description,serviceType:item.title,
      provider:{'@id':base+'/#business'},areaServed:{'@type':'City',name:'الرياض'},url:canonical});
    if(view==='article')schema.push({'@context':'https://schema.org','@type':'Article',headline:item.title,description:pageDescription,image:absolute(item.image,base),
      datePublished:item.data?.date||item.createdAt,dateModified:item.updatedAt,author:{'@type':'Organization',name:item.data?.author||name},
      publisher:{'@id':base+'/#business'},mainEntityOfPage:canonical});
    res.status(status).render('page',{view,item,title:pageTitle,description:pageDescription,canonical,schema,pageImage,keywords,errors,formValues,flash:flash??(view==='testimonials'&&req.query.review==='sent'?'شكراً لمشاركة رأيك. سيظهر التقييم بعد مراجعته واعتماده.':req.query.sent==='1'?'تم حفظ طلبك بنجاح. سنتواصل معك لمناقشة التفاصيل.':'')});
  }
  app.get('/robots.txt',(req,res)=>{
    const base=baseURL(req,res.locals.settings);
    res.type('text').send('User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /uploads/requests\nSitemap: '+base+'/sitemap.xml\n');
  });
  app.get('/sitemap.xml',(req,res)=>{
    const base=baseURL(req,res.locals.settings);
    const urls=['/','/services','/projects','/before-after','/about','/testimonials','/blog','/quote','/contact'].map(path=>({path}));
    for(const [collection,prefix] of [['services','/services/'],['projects','/projects/'],['blog','/blog/'],['areas','/riyadh/']])
      for(const item of db.list(collection))urls.push({path:prefix+encodeURIComponent(item.slug),date:item.updatedAt});
    res.type('xml').set('Cache-Control','public,max-age=300').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+
      urls.map(url=>'<url><loc>'+xml(base+(url.path==='/'?'':url.path))+'</loc>'+(url.date?'<lastmod>'+xml(url.date)+'</lastmod>':'')+'</url>').join('')+'</urlset>');
  });
  app.get('/',(req,res)=>renderPage(req,res,'home'));
  for(const view of ['services','projects','before-after','about','testimonials','blog','quote','contact'])app.get('/'+view,(req,res)=>{
    const requestedService=view==='testimonials'&&typeof req.query.service==='string'?req.query.service:'';
    const service=requestedService?db.get('services',requestedService):null;
    const formValues=view==='testimonials'?{service:service?.slug===requestedService?requestedService:''}:{};
    renderPage(req,res,view,{formValues});
  });
  for(const [path,collection,view] of [['/services/:slug','services','service'],['/projects/:slug','projects','project'],['/blog/:slug','blog','article'],['/riyadh/:slug','areas','area']])
    app.get(path,(req,res)=>{const item=db.get(collection,req.params.slug);if(!item)return renderPage(req,res,'notfound',{status:404});renderPage(req,res,view,{item});});
  const formLimit=rateLimit({windowMs:60*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,
    handler:(req,res,next)=>next(new HttpError(429,'وصلت إلى الحد المسموح للطلبات. حاول لاحقًا أو تواصل عبر واتساب.'))});
  app.post('/quote',formLimit,upload.array('photos',6),sessions.csrf,async(req,res)=>{
    const data={name:textValue(req.body.name,120),phone:phoneValue(req.body.phone),whatsapp:phoneValue(req.body.whatsapp),
      area:textValue(req.body.area,120),district:textValue(req.body.district,120),service:textValue(req.body.service,200),
      propertyType:textValue(req.body.propertyType,120),description:textValue(req.body.description,5000),budget:textValue(req.body.budget,120)};
    const errors=[];
    if(data.name.length<2)errors.push('أدخل الاسم بشكل صحيح.');
    if(!validPhone(data.phone))errors.push('أدخل رقم هاتف صالحًا.');
    if(data.whatsapp&&!validPhone(data.whatsapp))errors.push('أدخل رقم واتساب صالحًا.');
    if(!data.area||!data.district)errors.push('حدد المنطقة والحي.');
    if(!data.service||!data.propertyType)errors.push('حدد نوع الخدمة والعقار.');
    if(data.description.length<10)errors.push('اكتب وصفًا للعمل لا يقل عن عشرة أحرف.');
    if(errors.length)return renderPage(req,res,'quote',{status:422,errors,formValues:data});
    const photos=await processImages(req.files||[],uploadsDir,{privateFiles:true});
    try {db.createRequest('quotes',{...data,photos});}
    catch(error){await removeImages(photos,uploadsDir,{privateFiles:true});throw error;}
    res.redirect(303,'/quote?sent=1');
  });
  app.post('/contact',formLimit,sessions.csrf,(req,res)=>{
    const data={name:textValue(req.body.name,120),phone:phoneValue(req.body.phone),message:textValue(req.body.message,5000)};
    const errors=[];
    if(data.name.length<2)errors.push('أدخل الاسم بشكل صحيح.');
    if(!validPhone(data.phone))errors.push('أدخل رقم هاتف صالحًا.');
    if(data.message.length<10)errors.push('اكتب رسالة لا تقل عن عشرة أحرف.');
    if(errors.length)return renderPage(req,res,'contact',{status:422,errors,formValues:data});
    db.createRequest('contacts',data);res.redirect(303,'/contact?sent=1');
  });
  const reviewLimit=rateLimit({windowMs:60*60*1000,limit:5,standardHeaders:'draft-8',legacyHeaders:false,
    handler:(req,res,next)=>next(new HttpError(429,'وصلت إلى الحد المسموح لمشاركة الآراء. حاول مرة أخرى لاحقًا.'))});
  app.post('/testimonials',reviewLimit,sessions.csrf,(req,res)=>{
    req.body ??= {};
    const website=typeof req.body.website==='string'?req.body.website.trim():(req.body.website==null?'':'filled');
    if(website)return res.redirect(303,'/testimonials?review=sent#write-review');
    const rawName=req.body.name,rawComment=req.body.comment,rawDistrict=req.body.district??'',rawService=req.body.service??'';
    const name=typeof rawName==='string'?rawName.trim():'';
    const comment=typeof rawComment==='string'?rawComment.trim():'';
    const district=typeof rawDistrict==='string'?rawDistrict.trim():'';
    const serviceSlug=typeof rawService==='string'?rawService.trim():'';
    const rating=typeof req.body.rating==='number'?req.body.rating:(typeof req.body.rating==='string'&&req.body.rating.trim()?Number(req.body.rating):NaN);
    const service=serviceSlug?db.get('services',serviceSlug):null;
    const errors=[];
    if(typeof rawName!=='string'||name.length<2||rawName.length>80)errors.push('اكتب اسمًا من حرفين إلى 80 حرفًا.');
    if(typeof rawComment!=='string'||comment.length<3||rawComment.length>2000)errors.push('اكتب رأيًا من 3 إلى 2000 حرف.');
    if(typeof rawDistrict!=='string'||rawDistrict.length>120)errors.push('اسم الحي يجب ألا يتجاوز 120 حرفًا.');
    if(typeof rawService!=='string'||rawService.length>200||(serviceSlug&&service?.slug!==serviceSlug))errors.push('اختر خدمة متاحة من القائمة أو اتركها دون تحديد.');
    if(!Number.isInteger(rating)||rating<1||rating>5)errors.push('اختر تقييمًا صحيحًا من نجمة إلى خمس نجوم.');
    if(req.body.consent!=='on')errors.push('يلزم تأكيد موافقتك على نشر الاسم والرأي بعد المراجعة.');
    const formValues={name:typeof rawName==='string'?rawName:'',comment:typeof rawComment==='string'?rawComment:'',
      district:typeof rawDistrict==='string'?rawDistrict:'',service:typeof rawService==='string'?rawService:'',
      rating:typeof req.body.rating==='string'||typeof req.body.rating==='number'?String(req.body.rating):'',
      consent:req.body.consent==='on'?'on':''};
    if(errors.length)return renderPage(req,res,'testimonials',{status:422,errors,formValues});
    db.save('testimonials',{slug:'customer-review-'+randomBytes(12).toString('hex'),title:name,description:comment,image:'',enabled:false,position:0,
      data:{source:'customer',clientName:name,rating,area:district,service:service?.title||'',serviceSlug,consent:true,
        submittedAt:new Date().toISOString(),moderationStatus:'pending'}});
    res.redirect(303,'/testimonials?review=sent#write-review');
  });
  app.use('/admin',await createAdminRouter({db,sessions,uploadsDir}));
  app.use((req,res)=>renderPage(req,res,'notfound',{status:404}));
  app.use((error,req,res,next)=>{
    if(res.headersSent)return next(error);
    if(!res.locals.settings) {
      Object.assign(res.locals,publicData(db),{srcsetFor,item:null,schema:[],canonical:'',description:'',pageImage:'',keywords:'',flash:'',errors:[],formValues:{},requestPath:req.path});
      const settings=res.locals.settings;
      res.locals.waUrl='https://wa.me/'+String(settings.whatsapp||'966501308295').replace(/\D/g,'')+'?text='+encodeURIComponent(settings.whatsappMessage||whatsappMessage);
      res.locals.telUrl='tel:'+phoneValue(settings.phone||'+966501308295');
    }
    if(!req.session)sessions.issue(req,res);
    if(!res.locals.collections)res.locals.collections=[];
    if(!res.locals.active)res.locals.active='';
    const status=error.code==='LIMIT_FILE_SIZE'?413:error.name==='MulterError'?422:error.status||500;
    const message=status===413?'حجم الملف أو بيانات النموذج يتجاوز الحد المسموح.':error.name==='MulterError'?'عدد الصور أو بيانات الرفع غير مسموح به.':status<500?error.message:'تعذر تنفيذ الطلب الآن. حاول مرة أخرى.';
    if(status>=500&&!testing)console.error('Request failed:',error);
    if(req.path.startsWith('/admin')) {
      if(!req.adminUser)return res.status(status).render('admin/login',{title:'دخول الإدارة',email:'',hasAdmin:db.countUsers()>0,errors:[message],collections:[],active:''});
      return res.status(status).render('admin/error',{title:'تعذر تنفيذ الطلب',errors:[message]});
    }
    if(['/quote','/contact','/testimonials'].includes(req.path))return renderPage(req,res,req.path.slice(1),{status,errors:[message],formValues:req.body||{}});
    renderPage(req,res,'notfound',{status,title:'تعذر عرض الصفحة',description:message,errors:[message]});
  });
  return app;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const app=await createApp();
  const port=Number(process.env.PORT)||3000;
  const server=app.listen(port,()=>console.log('لمسة المستقبل: http://localhost:'+port));
  const shutdown=()=>server.close(()=>{app.locals.db.close();process.exit(0);});
  process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
