import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log("Loading Service Account from Environment Variable...");
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log("✅ FIREBASE ADMIN: Successfully initialized using Environment Variable");
    } else {
      const serviceAccountPath = path.join(process.cwd(), 'serviceAccountKey.json');
      console.log("Loading Service Account from:", serviceAccountPath);
      
      if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        console.log("✅ FIREBASE ADMIN: Successfully initialized using fs.readFileSync");
      } else {
        console.error("❌ FIREBASE ADMIN: serviceAccountKey.json NOT FOUND and FIREBASE_SERVICE_ACCOUNT env not set.");
      }
    }
  } catch (error: any) {
    console.error("❌ FIREBASE ADMIN INITIALIZATION ERROR:", error.message);
    console.error(error.stack);
  }
}

export const adminDb = admin.firestore();
