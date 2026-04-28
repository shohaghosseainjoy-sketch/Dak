// ============================================================
// NexChat - Authentication Module
// Handles Phone OTP + Email/Password login
// ============================================================

const Auth = (() => {
  let recaptchaVerifier = null;
  let confirmationResult = null;

  // ─── Recaptcha Setup ─────────────────────────────────────
  const setupRecaptcha = () => {
    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
      recaptchaVerifier = null;
    }
    recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => {
        showToast('reCAPTCHA expired. Please try again.', 'error');
      }
    });
  };

  // ─── Phone OTP: Send ─────────────────────────────────────
  const sendOTP = async (phoneNumber) => {
    try {
      setupRecaptcha();
      confirmationResult = await auth.signInWithPhoneNumber(phoneNumber, recaptchaVerifier);
      return { success: true };
    } catch (err) {
      recaptchaVerifier?.clear();
      recaptchaVerifier = null;
      return { success: false, error: formatAuthError(err.code) };
    }
  };

  // ─── Phone OTP: Verify ───────────────────────────────────
  const verifyOTP = async (otp) => {
    if (!confirmationResult) return { success: false, error: 'No OTP session. Please resend.' };
    try {
      const result = await confirmationResult.confirm(otp);
      await handleNewUser(result.user);
      return { success: true, user: result.user };
    } catch (err) {
      return { success: false, error: formatAuthError(err.code) };
    }
  };

  // ─── Email: Register ─────────────────────────────────────
  const registerEmail = async (email, password, displayName) => {
    try {
      const result = await auth.createUserWithEmailAndPassword(email, password);
      await result.user.updateProfile({ displayName });
      await handleNewUser(result.user, displayName);
      return { success: true, user: result.user };
    } catch (err) {
      return { success: false, error: formatAuthError(err.code) };
    }
  };

  // ─── Email: Login ─────────────────────────────────────────
  const loginEmail = async (email, password) => {
    try {
      const result = await auth.signInWithEmailAndPassword(email, password);
      await updateUserPresence(result.user.uid);
      return { success: true, user: result.user };
    } catch (err) {
      return { success: false, error: formatAuthError(err.code) };
    }
  };

  // ─── Handle New User Profile ─────────────────────────────
  const handleNewUser = async (user, displayName = null) => {
    const userRef = db.ref(`users/${user.uid}`);
    const snapshot = await userRef.once('value');
    if (!snapshot.exists()) {
      const username = displayName || generateUsername(user.phoneNumber || user.email);
      await userRef.set({
        uid: user.uid,
        displayName: displayName || username,
        username: username.toLowerCase().replace(/\s/g, '_'),
        phone: user.phoneNumber || null,
        email: user.email || null,
        photoURL: null,
        bio: 'Hey, I am using NexChat!',
        status: 'online',
        lastSeen: firebase.database.ServerValue.TIMESTAMP,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        blocked: [],
        settings: {
          notifications: true,
          readReceipts: true,
          theme: 'dark'
        }
      });
    } else {
      await updateUserPresence(user.uid);
    }
  };

  // ─── Update User Presence ─────────────────────────────────
  const updateUserPresence = async (uid) => {
    const userStatusRef = db.ref(`users/${uid}/status`);
    const userLastSeenRef = db.ref(`users/${uid}/lastSeen`);
    const connectedRef = db.ref('.info/connected');

    connectedRef.on('value', async (snap) => {
      if (snap.val() === true) {
        await userStatusRef.set('online');
        userStatusRef.onDisconnect().set('offline');
        userLastSeenRef.onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
      }
    });
  };

  // ─── Logout ───────────────────────────────────────────────
  const logout = async () => {
    const user = auth.currentUser;
    if (user) {
      await db.ref(`users/${user.uid}/status`).set('offline');
      await db.ref(`users/${user.uid}/lastSeen`).set(firebase.database.ServerValue.TIMESTAMP);
    }
    await auth.signOut();
    window.location.href = 'login.html';
  };

  // ─── Auth State Observer ──────────────────────────────────
  const onAuthChange = (callback) => {
    auth.onAuthStateChanged(callback);
  };

  // ─── Helpers ─────────────────────────────────────────────
  const generateUsername = (identifier) => {
    const base = identifier?.replace(/[@+\.\s]/g, '').slice(0, 10) || 'user';
    return base + Math.floor(Math.random() * 9000 + 1000);
  };

  const formatAuthError = (code) => {
    const errors = {
      'auth/invalid-phone-number': 'Invalid phone number format.',
      'auth/too-many-requests': 'Too many attempts. Try again later.',
      'auth/invalid-verification-code': 'Wrong OTP code.',
      'auth/code-expired': 'OTP expired. Please resend.',
      'auth/email-already-in-use': 'Email already registered.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/invalid-email': 'Invalid email address.',
      'auth/network-request-failed': 'Network error. Check your connection.',
    };
    return errors[code] || 'Something went wrong. Please try again.';
  };

  return { sendOTP, verifyOTP, registerEmail, loginEmail, logout, onAuthChange, updateUserPresence, handleNewUser };
})();

window.Auth = Auth;
