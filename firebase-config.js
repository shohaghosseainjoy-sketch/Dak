// ============================================================
// NexChat - Firebase Configuration
// Replace these values with your own Firebase project config
// ============================================================

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

// FCM Vapid Key (for push notifications)
const FCM_VAPID_KEY = "YOUR_VAPID_KEY";

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firebase services
const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();
const firestore = firebase.firestore();

// Firestore settings
firestore.settings({ experimentalForceLongPolling: false });

export { auth, db, storage, firestore, FCM_VAPID_KEY, firebaseConfig };
