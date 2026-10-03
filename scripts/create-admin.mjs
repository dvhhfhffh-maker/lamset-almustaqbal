import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createDatabase } from '../src/db.mjs';

const email=process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password=process.env.ADMIN_PASSWORD;
if(!email||!/^\S+@\S+\.\S+$/.test(email)||!password||password.length<12) {
  console.error('اضبط ADMIN_EMAIL وADMIN_PASSWORD (12 حرفًا على الأقل) في ملف .env محلي، ثم شغّل npm run create-admin.');
  process.exitCode=1;
} else {
  const db=createDatabase();
  try {
    const passwordHash=await bcrypt.hash(password,12);
    const user=db.getUserByEmail(email);
    if(user) {
      if(!process.argv.includes('--reset'))throw new Error('المستخدم موجود. لإعادة تعيين كلمة المرور وإلغاء جلساته استخدم --reset.');
      db.updatePassword(user.id,passwordHash);
      console.log('تم تحديث كلمة مرور المسؤول وإلغاء الجلسات السابقة.');
    } else {
      db.createUser(email,passwordHash);
      console.log('تم إنشاء حساب المسؤول. انتقل إلى /admin/login.');
    }
  } catch(error) {console.error(error.message);process.exitCode=1;}
  finally {db.close();}
}
