const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");

if (!getApps().length) {
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT
  );

  initializeApp({
    credential: cert(serviceAccount),
  });

  console.log("🔥 Firebase Admin initialized successfully");
}

const messaging = getMessaging();

module.exports = {
  messaging,
};