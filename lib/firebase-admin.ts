import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

function initFirebase() {
  if (admin.apps.length > 0) return;

  try {
    if (process.env.FIREBASE_PRIVATE_KEY) {
      console.log("Loading Service Account from individual Environment Variables...");
      
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;
      
      // If the user accidentally pasted the entire JSON object into the FIREBASE_PRIVATE_KEY field
      if (privateKey.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(privateKey);
          if (parsed.private_key) {
            privateKey = parsed.private_key;
            // Also grab other values if they exist in the JSON
            if (!process.env.FIREBASE_PROJECT_ID && parsed.project_id) process.env.FIREBASE_PROJECT_ID = parsed.project_id;
            if (!process.env.FIREBASE_CLIENT_EMAIL && parsed.client_email) process.env.FIREBASE_CLIENT_EMAIL = parsed.client_email;
          }
        } catch (e) {
          console.warn("Failed to parse FIREBASE_PRIVATE_KEY as JSON, using as string.");
        }
      }

      // Handle both literal newlines and escaped newlines from Vercel
      if (privateKey.includes('\\n')) {
        privateKey = privateKey.replace(/\\n/g, '\n');
      }
      if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        privateKey = privateKey.slice(1, -1).replace(/\\n/g, '\n');
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        })
      });
      console.log("✅ FIREBASE ADMIN: Successfully initialized using individual Environment Variables");
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
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
  }

  // Fallback: If Firebase failed to initialize (e.g. missing env vars during Vercel build phase),
  // initialize a dummy app so that admin.firestore() doesn't crash the entire build.
  if (admin.apps.length === 0) {
    console.warn("⚠️ Initializing dummy Firebase app to prevent build crash.");
    admin.initializeApp({ projectId: 'dummy-project-for-build' });
  }
}

initFirebase();

export const adminDb = admin.firestore();
