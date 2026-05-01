import { firebaseConfig, hasFirebaseConfig } from './config/firebase-config.js';

let sdk = null;
let auth = null;
let db = null;
let currentUser = null;
let unsubscribeValue = null;
let lastPushedPayload = '';

async function ensureFirebaseSdk() {
  if (sdk) {
    return true;
  }
  if (!hasFirebaseConfig) {
    return false;
  }

  const [appModule, authModule, databaseModule] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js')
  ]);

  const app = appModule.initializeApp(firebaseConfig);
  auth = authModule.getAuth(app);
  db = databaseModule.getDatabase(app);
  sdk = { ...appModule, ...authModule, ...databaseModule };
  return true;
}

function userPath(uid) {
  return `users/${uid}`;
}

export async function initFirebase({ onAuthChange, onDataChange, onError }) {
  if (!(await ensureFirebaseSdk())) {
    return { enabled: false };
  }

  try {
    await sdk.setPersistence(auth, sdk.browserLocalPersistence);
    sdk.onAuthStateChanged(auth, (user) => {
      currentUser = user;
      onAuthChange?.(user);

      if (unsubscribeValue) {
        unsubscribeValue();
        unsubscribeValue = null;
      }

      if (!user) {
        return;
      }

      const reference = sdk.ref(db, userPath(user.uid));
      unsubscribeValue = sdk.onValue(reference, (snapshot) => onDataChange?.(snapshot.val() || null), (error) => onError?.(error));
    });

    return { enabled: true };
  } catch (error) {
    onError?.(error);
    return { enabled: false, error };
  }
}

export function getFirebaseUser() {
  return currentUser;
}

export async function signInWithEmailPassword(email, password) {
  if (!(await ensureFirebaseSdk())) {
    throw new Error('Firebase aun no esta configurado para este proyecto.');
  }
  return sdk.signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmailPassword(name, email, password) {
  if (!(await ensureFirebaseSdk())) {
    throw new Error('Firebase aun no esta configurado para este proyecto.');
  }
  const credential = await sdk.createUserWithEmailAndPassword(auth, email, password);
  if (name) {
    await sdk.updateProfile(credential.user, { displayName: name });
  }
  return credential;
}

export async function signOutCurrentUser() {
  if (!(await ensureFirebaseSdk())) {
    return;
  }
  await sdk.signOut(auth);
}

export async function pushSnapshot(snapshot) {
  if (!currentUser || !db) {
    return;
  }
  const payload = JSON.stringify(snapshot);
  if (payload === lastPushedPayload) {
    return;
  }
  lastPushedPayload = payload;
  await sdk.set(sdk.ref(db, userPath(currentUser.uid)), snapshot);
}

export async function deleteCurrentUserAccount() {
  if (!(await ensureFirebaseSdk()) || !currentUser) {
    return;
  }
  const userReference = sdk.ref(db, userPath(currentUser.uid));
  await sdk.remove(userReference);
  await sdk.deleteUser(currentUser);
}
