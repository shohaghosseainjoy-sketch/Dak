// ============================================================
// NexChat — Login Page Controller
// ============================================================

// ─── Countries Data ───────────────────────────────────────
const COUNTRIES = [
  { name: 'Bangladesh', flag: '🇧🇩', code: '+880' },
  { name: 'United States', flag: '🇺🇸', code: '+1' },
  { name: 'United Kingdom', flag: '🇬🇧', code: '+44' },
  { name: 'India', flag: '🇮🇳', code: '+91' },
  { name: 'Pakistan', flag: '🇵🇰', code: '+92' },
  { name: 'Germany', flag: '🇩🇪', code: '+49' },
  { name: 'France', flag: '🇫🇷', code: '+33' },
  { name: 'Japan', flag: '🇯🇵', code: '+81' },
  { name: 'China', flag: '🇨🇳', code: '+86' },
  { name: 'Brazil', flag: '🇧🇷', code: '+55' },
  { name: 'Canada', flag: '🇨🇦', code: '+1' },
  { name: 'Australia', flag: '🇦🇺', code: '+61' },
  { name: 'Russia', flag: '🇷🇺', code: '+7' },
  { name: 'South Korea', flag: '🇰🇷', code: '+82' },
  { name: 'Saudi Arabia', flag: '🇸🇦', code: '+966' },
  { name: 'UAE', flag: '🇦🇪', code: '+971' },
  { name: 'Malaysia', flag: '🇲🇾', code: '+60' },
  { name: 'Indonesia', flag: '🇮🇩', code: '+62' },
  { name: 'Turkey', flag: '🇹🇷', code: '+90' },
  { name: 'Nigeria', flag: '🇳🇬', code: '+234' },
];

let selectedCountry = COUNTRIES[0];
let timerInterval = null;

// ─── Tab Switching ────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.auth-section').forEach(s => s.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');

  const titles = {
    phone: ['Welcome back', 'Sign in with your phone number'],
    email: ['Welcome back', 'Sign in with your email'],
    register: ['Create Account', 'Join NexChat for free']
  };
  document.getElementById('auth-title').textContent = titles[tab]?.[0] || '';
  document.getElementById('auth-subtitle').textContent = titles[tab]?.[1] || '';
}

// ─── Country Picker ───────────────────────────────────────
function showCountryPicker() {
  renderCountries(COUNTRIES);
  document.getElementById('country-modal').style.display = 'flex';
  document.getElementById('country-search').focus();
}

function renderCountries(list) {
  const container = document.getElementById('country-list');
  container.innerHTML = list.map(c => `
    <div onclick="selectCountry('${c.name}')"
         style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:var(--radius-sm);cursor:pointer;transition:background 0.15s"
         onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
      <span style="font-size:1.5rem">${c.flag}</span>
      <span style="flex:1;font-size:0.9375rem">${c.name}</span>
      <span style="color:var(--text-muted);font-size:0.875rem">${c.code}</span>
    </div>
  `).join('');
}

function filterCountries(query) {
  const filtered = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.code.includes(query)
  );
  renderCountries(filtered);
}

function selectCountry(name) {
  selectedCountry = COUNTRIES.find(c => c.name === name) || COUNTRIES[0];
  document.getElementById('country-btn').innerHTML = `${selectedCountry.flag} ${selectedCountry.code}`;
  document.getElementById('country-modal').style.display = 'none';
}

// ─── Phone OTP Flow ───────────────────────────────────────
async function handleSendOTP() {
  const rawPhone = document.getElementById('phone-input').value.trim();
  if (!rawPhone) return showToast('Please enter your phone number.', 'error');

  let phone = rawPhone.replace(/\s/g, '');
  if (!phone.startsWith('+')) phone = selectedCountry.code + (phone.startsWith('0') ? phone.slice(1) : phone);

  const btn = document.getElementById('send-otp-btn');
  btn.classList.add('loading'); btn.disabled = true;

  const res = await Auth.sendOTP(phone);
  btn.classList.remove('loading'); btn.disabled = false;

  if (!res.success) return showToast(res.error, 'error');

  document.getElementById('phone-display').textContent = phone;
  document.getElementById('phone-step-1').style.display = 'none';
  document.getElementById('phone-step-2').style.display = 'block';
  document.getElementById('otp0').focus();
  startTimer();
  showToast('OTP sent successfully!', 'success');
}

async function handleVerifyOTP() {
  const otp = [0,1,2,3,4,5].map(i => document.getElementById(`otp${i}`).value).join('');
  if (otp.length < 6) return showToast('Enter the complete 6-digit code.', 'error');

  const btn = document.getElementById('verify-otp-btn');
  btn.classList.add('loading'); btn.disabled = true;

  const res = await Auth.verifyOTP(otp);
  btn.classList.remove('loading'); btn.disabled = false;

  if (!res.success) return showToast(res.error, 'error');

  showToast('Verified! Loading your chats...', 'success');
  await Notifications.requestPermission(res.user.uid).catch(() => {});
  setTimeout(() => window.location.href = 'chat.html', 1000);
}

async function handleResendOTP() {
  const rawPhone = document.getElementById('phone-input').value.trim();
  let phone = rawPhone.replace(/\s/g, '');
  if (!phone.startsWith('+')) phone = selectedCountry.code + (phone.startsWith('0') ? phone.slice(1) : phone);

  const btn = document.getElementById('resend-btn');
  btn.disabled = true;

  const res = await Auth.sendOTP(phone);
  if (!res.success) return showToast(res.error, 'error');

  showToast('OTP resent!', 'success');
  startTimer();
}

function goBackPhoneStep() {
  clearInterval(timerInterval);
  document.getElementById('phone-step-1').style.display = 'block';
  document.getElementById('phone-step-2').style.display = 'none';
  [0,1,2,3,4,5].forEach(i => { document.getElementById(`otp${i}`).value = ''; });
}

function startTimer() {
  clearInterval(timerInterval);
  let remaining = 60;
  document.getElementById('resend-timer').style.display = 'inline';
  document.getElementById('resend-btn').style.display = 'none';

  timerInterval = setInterval(() => {
    remaining--;
    document.getElementById('timer-count').textContent = remaining;
    if (remaining <= 0) {
      clearInterval(timerInterval);
      document.getElementById('resend-timer').style.display = 'none';
      document.getElementById('resend-btn').style.display = 'inline';
      document.getElementById('resend-btn').disabled = false;
    }
  }, 1000);
}

// OTP input auto-advance
[0,1,2,3,4,5].forEach(i => {
  document.getElementById(`otp${i}`)?.addEventListener('input', function(e) {
    const v = e.target.value.replace(/\D/g, '');
    e.target.value = v.slice(-1);
    if (v && i < 5) document.getElementById(`otp${i+1}`).focus();
    e.target.classList.toggle('filled', !!v);
  });
  document.getElementById(`otp${i}`)?.addEventListener('keydown', function(e) {
    if (e.key === 'Backspace' && !this.value && i > 0) document.getElementById(`otp${i-1}`).focus();
  });
  // Handle paste
  document.getElementById(`otp0`)?.addEventListener('paste', function(e) {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
    pasted.slice(0,6).split('').forEach((ch, j) => {
      const inp = document.getElementById(`otp${j}`);
      if (inp) { inp.value = ch; inp.classList.add('filled'); }
    });
    document.getElementById(`otp${Math.min(pasted.length, 5)}`).focus();
  });
});

// ─── Email Login ──────────────────────────────────────────
async function handleEmailLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) return showToast('Please fill in all fields.', 'error');

  const btn = event.target;
  btn.classList.add('loading'); btn.disabled = true;
  const res = await Auth.loginEmail(email, password);
  btn.classList.remove('loading'); btn.disabled = false;

  if (!res.success) return showToast(res.error, 'error');

  showToast('Welcome back!', 'success');
  await Notifications.requestPermission(res.user.uid).catch(() => {});
  setTimeout(() => window.location.href = 'chat.html', 800);
}

// ─── Register ─────────────────────────────────────────────
async function handleRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-password').value;
  const conf = document.getElementById('reg-confirm').value;

  if (!name || !email || !pass) return showToast('Please fill in all fields.', 'error');
  if (pass !== conf) return showToast('Passwords do not match.', 'error');
  if (pass.length < 6) return showToast('Password must be at least 6 characters.', 'error');

  const btn = event.target;
  btn.classList.add('loading'); btn.disabled = true;
  const res = await Auth.registerEmail(email, pass, name);
  btn.classList.remove('loading'); btn.disabled = false;

  if (!res.success) return showToast(res.error, 'error');

  showToast('Account created! Welcome to NexChat!', 'success');
  await Notifications.requestPermission(res.user.uid).catch(() => {});
  setTimeout(() => window.location.href = 'chat.html', 1000);
}

// ─── Password Toggle ──────────────────────────────────────
function togglePassword(id, btn) {
  const input = document.getElementById(id);
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.textContent = input.type === 'password' ? '👁' : '🙈';
}

// ─── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Redirect if already logged in
  auth.onAuthStateChanged(user => {
    if (user) window.location.href = 'chat.html';
  });

  Notifications.init().catch(() => {});

  // Enter key handlers
  document.getElementById('phone-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSendOTP();
  });
  document.getElementById('login-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleEmailLogin();
  });
});
