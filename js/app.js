import {
  LOCAL_SESSION_ID,
  clearBackupFromLocal,
  clearSession,
  createSampleSnapshot,
  exportBackupJson,
  getAccountsWithBalances,
  loadSession,
  loadSnapshotFromLocal,
  monthKey,
  normalizeSnapshot,
  readJsonFile,
  removeSnapshotFromLocal,
  saveBackupToLocal,
  saveSession,
  saveSnapshotToLocal,
  safeNumber,
  todayISO,
  uid
} from './data.js';
import {
  deleteCurrentUserAccount,
  initFirebase,
  pushSnapshot,
  registerWithEmailPassword,
  signInWithEmailPassword,
  signOutCurrentUser
} from './firebase-service.js';
import { exportMonthlyReport } from './pdf.js';
import { getRefs, renderApp, showToast } from './ui.js';

const refs = getRefs();
const createBackupButton = document.getElementById('createBackupButton');
const restoreBackupButton = document.getElementById('restoreBackupButton');
const exportJsonButton = document.getElementById('exportJsonButton');
const exportPdfButton = document.getElementById('exportPdfButton');
const expenseSheetTitle = document.getElementById('expenseSheetTitle');
const incomeSheetTitle = document.getElementById('incomeSheetTitle');
const transferSheetTitle = document.getElementById('transferSheetTitle');
const accountSheetTitle = document.getElementById('accountSheetTitle');
const expenseSubmitButton = document.getElementById('expenseSubmitButton');
const incomeSubmitButton = document.getElementById('incomeSubmitButton');
const transferSubmitButton = document.getElementById('transferSubmitButton');
const accountSubmitButton = document.getElementById('accountSubmitButton');
const registerPhotoInput = document.getElementById('registerPhoto');
const loginEmailInput = document.getElementById('loginEmail');
const loginPasswordInput = document.getElementById('loginPassword');
const registerNameInput = document.getElementById('registerName');
const registerEmailInput = document.getElementById('registerEmail');
const registerPasswordInput = document.getElementById('registerPassword');

const state = {
  sessionActive: false,
  auth: {
    cloudAvailable: false,
    mode: 'local',
    firebaseUser: null,
    user: null
  },
  snapshot: createSampleSnapshot(),
  ui: {
    activeView: 'home',
    activeSheet: null,
    authPromptOpen: false,
    authMode: 'login',
    pendingProfileImage: '',
    pendingRegistration: null,
    txFilter: 'all',
    selectedMonth: monthKey(),
    loading: true,
    pendingDanger: null,
    focusAccountId: '',
    focusTransactionId: '',
    installPromptEvent: null
  }
};

let inactivityTimer = 0;
let loadingFinished = false;
function getProfileInitials(value = '') {
  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'DP';
}

function compressImageFile(file, maxSide = 320, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        let { width, height } = image;
        if (width > height && width > maxSide) {
          height = Math.round((height * maxSide) / width);
          width = maxSide;
        } else if (height >= width && height > maxSide) {
          width = Math.round((width * maxSide) / height);
          height = maxSide;
        }
        canvas.width = width;
        canvas.height = height;
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function refreshRegisterPreview() {
  if (!refs.registerPhotoPreview) {
    return;
  }
  if (state.ui.pendingProfileImage) {
    refs.registerPhotoPreview.classList.add('has-image');
    refs.registerPhotoPreview.innerHTML = `<img src="${state.ui.pendingProfileImage}" alt="Vista previa del perfil" />`;
    return;
  }
  refs.registerPhotoPreview.classList.remove('has-image');
  refs.registerPhotoPreview.textContent = getProfileInitials(registerNameInput?.value || 'Dashboard Pro');
}

function syncAccountBillingFields() {
  const accountType = refs.accountForm?.elements.type?.value;
  const statementField = refs.accountForm?.elements.statementDay;
  const paymentField = refs.accountForm?.elements.paymentDay;
  const creditLimitField = refs.accountForm?.elements.creditLimit;
  const enabled = accountType === 'credit';

  if (!statementField || !paymentField || !creditLimitField) {
    return;
  }

  statementField.disabled = !enabled;
  paymentField.disabled = !enabled;
  creditLimitField.disabled = !enabled;
  statementField.required = enabled;
  paymentField.required = enabled;
  creditLimitField.required = enabled;

  if (!enabled) {
    statementField.value = '';
    paymentField.value = '';
    creditLimitField.value = '';
  }
}

function reminderStorageKey() {
  return `dashboard-pro:reminders:${todayISO()}`;
}

function triggerBrowserNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }
  new Notification(title, { body, icon: './assets/icon-192.svg' });
}

function checkCreditReminders() {
  if (!state.sessionActive) {
    return;
  }
  const today = new Date();
  const currentDay = today.getDate();
  const reminded = JSON.parse(localStorage.getItem(reminderStorageKey()) || '[]');
  const nextReminded = [...reminded];

  state.snapshot.accounts
    .filter((account) => account.type === 'credit')
    .forEach((account) => {
      const reminders = [];
      if (account.statementDay && account.statementDay === currentDay) {
        reminders.push({ id: `${account.id}-statement`, message: `Hoy es el corte de ${account.name}.` });
      }
      if (account.paymentDay && account.paymentDay === currentDay) {
        reminders.push({ id: `${account.id}-payment`, message: `Hoy vence el pago de ${account.name}.` });
      }
      if (account.paymentDay && account.paymentDay - currentDay === 3) {
        reminders.push({ id: `${account.id}-payment-soon`, message: `Faltan 3 dias para pagar ${account.name}.` });
      }

      reminders.forEach((reminder) => {
        if (nextReminded.includes(reminder.id)) {
          return;
        }
        nextReminded.push(reminder.id);
        showToast(refs, reminder.message, 'info');
        triggerBrowserNotification('Dashboard Pro', reminder.message);
      });
    });

  localStorage.setItem(reminderStorageKey(), JSON.stringify(nextReminded));
}

async function ensureNotificationPermission() {
  if (!('Notification' in window) || Notification.permission !== 'default') {
    return;
  }
  try {
    await Notification.requestPermission();
  } catch {
    // ignore permission errors
  }
}

function render() {
  renderApp(refs, state);
}

function currentSessionId() {
  return state.auth.mode === 'firebase' && state.auth.firebaseUser ? state.auth.firebaseUser.uid : LOCAL_SESSION_ID;
}

function currentUserSeed() {
  return {
    name: state.auth.user?.name || state.snapshot.user?.name || 'Alex Rivera',
    email: state.auth.user?.email || state.snapshot.user?.email || 'alex@dashboardpro.app',
    photo: state.auth.user?.photo || state.snapshot.user?.photo || state.ui.pendingProfileImage || ''
  };
}

function finishLoading() {
  if (loadingFinished) {
    return;
  }
  loadingFinished = true;
  window.setTimeout(() => {
    state.ui.loading = false;
    render();
  }, 650);
}

function persistSnapshot() {
  saveSnapshotToLocal(currentSessionId(), state.snapshot);
  if (state.auth.mode === 'firebase' && state.auth.firebaseUser) {
    pushSnapshot(state.snapshot).catch((error) => {
      showToast(refs, error.message || 'No fue posible sincronizar con Firebase.', 'danger');
    });
  }
}

function commitSnapshot(mutator, successMessage = '', tone = 'info') {
  mutator(state.snapshot);
  state.snapshot.meta.updatedAt = new Date().toISOString();
  state.snapshot = normalizeSnapshot(state.snapshot, currentUserSeed());
  state.auth.user = {
    name: state.snapshot.user.name,
    email: state.snapshot.user.email,
    photo: state.snapshot.user.photo || ''
  };
  persistSnapshot();
  render();
  checkCreditReminders();
  if (successMessage) {
    showToast(refs, successMessage, tone);
  }
}

function openSheet(id) {
  state.ui.activeSheet = id;
  render();
}

function closeSheet() {
  state.ui.activeSheet = null;
  state.ui.pendingDanger = null;
  render();
}

function openAccountDetail(accountId) {
  state.ui.focusAccountId = accountId;
  state.ui.activeSheet = 'accountDetailSheet';
  render();
}

function openTransactionDetail(transactionId) {
  state.ui.focusTransactionId = transactionId;
  state.ui.activeSheet = 'transactionDetailSheet';
  render();
}

function startLocalSession(userSeed = {}) {
  const existing = loadSnapshotFromLocal(LOCAL_SESSION_ID, userSeed);
  state.auth.mode = 'local';
  state.auth.firebaseUser = null;
  state.snapshot = existing || createSampleSnapshot(userSeed);
  state.auth.user = {
    name: state.snapshot.user.name,
    email: state.snapshot.user.email,
    photo: state.snapshot.user.photo || ''
  };
  state.sessionActive = true;
  state.ui.authPromptOpen = false;
  state.ui.authMode = 'login';
  state.ui.pendingRegistration = null;
  state.ui.activeSheet = null;
  saveSession({ mode: 'local' });
  persistSnapshot();
  finishLoading();
  resetInactivityTimer();
  render();
  checkCreditReminders();
}

function activateFirebaseSession(user) {
  const pendingRegistration = state.ui.pendingRegistration || {};
  const userSeed = {
    name: user.displayName || pendingRegistration.name || user.email?.split('@')[0] || 'Usuario',
    email: user.email || pendingRegistration.email || '',
    photo: user.photoURL || pendingRegistration.photo || ''
  };
  const cached = loadSnapshotFromLocal(user.uid, userSeed);
  state.auth.mode = 'firebase';
  state.auth.firebaseUser = user;
  state.auth.user = userSeed;
  state.snapshot = cached || createSampleSnapshot(userSeed);
  state.sessionActive = true;
  state.ui.authPromptOpen = false;
  state.ui.pendingRegistration = null;
  saveSession({ mode: 'firebase', uid: user.uid });
  finishLoading();
  resetInactivityTimer();
  render();
  checkCreditReminders();
}

function applyRemoteSnapshot(snapshot) {
  if (!state.auth.firebaseUser) {
    return;
  }
  if (!snapshot) {
    state.snapshot = createSampleSnapshot(currentUserSeed());
    persistSnapshot();
    showToast(refs, 'Firebase quedo listo con una base inicial nueva para este proyecto.', 'success');
    render();
    checkCreditReminders();
    return;
  }
  state.snapshot = normalizeSnapshot(snapshot, currentUserSeed());
  state.auth.user = {
    name: state.snapshot.user.name,
    email: state.snapshot.user.email,
    photo: state.snapshot.user.photo || ''
  };
  saveSnapshotToLocal(currentSessionId(), state.snapshot);
  finishLoading();
  render();
  checkCreditReminders();
}

async function handleLogout(fromInactivity = false) {
  clearTimeout(inactivityTimer);
  state.ui.activeSheet = null;
  state.ui.pendingDanger = null;
  state.ui.authPromptOpen = false;
  state.ui.authMode = 'login';
  state.ui.pendingRegistration = null;
  state.ui.pendingProfileImage = '';
  if (registerPhotoInput) {
    registerPhotoInput.value = '';
  }
  refs.authLoginForm?.reset();
  refs.authRegisterForm?.reset();
  refreshRegisterPreview();
  if (state.auth.mode === 'firebase' && state.auth.firebaseUser) {
    try {
      await signOutCurrentUser();
    } catch {
      // ignore logout errors
    }
  }
  clearSession();
  state.sessionActive = false;
  state.auth.firebaseUser = null;
  state.auth.user = null;
  if (!fromInactivity) {
    showToast(refs, 'Sesion cerrada.', 'info');
  }
  render();
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  if (!state.sessionActive) {
    return;
  }
  inactivityTimer = window.setTimeout(() => {
    showToast(refs, 'Sesion cerrada por inactividad.', 'info');
    handleLogout(true);
  }, state.snapshot.settings.inactivityMinutes * 60 * 1000);
}

function ensureAccountsAvailable(minimum = 1) {
  const accounts = getAccountsWithBalances(state.snapshot);
  if (accounts.length < minimum) {
    showToast(refs, minimum > 1 ? 'Necesitas al menos dos cuentas para registrar un movimiento.' : 'Agrega una cuenta antes de registrar operaciones.', 'danger');
    return null;
  }
  return accounts;
}

function prepareExpenseForm(transaction = null, accountId = '') {
  if (!ensureAccountsAvailable(1)) {
    return;
  }
  refs.expenseForm.reset();
  openSheet('expenseSheet');
  expenseSheetTitle.textContent = transaction ? 'Editar gasto' : 'Nuevo gasto';
  expenseSubmitButton.textContent = transaction ? 'Actualizar gasto' : 'Guardar gasto';
  refs.expenseForm.elements.id.value = transaction?.id || '';
  refs.expenseForm.elements.description.value = transaction?.description || '';
  refs.expenseForm.elements.amount.value = transaction?.amount || '';
  refs.expenseForm.elements.category.value = transaction?.category || refs.expenseCategorySelect.options[0]?.value || '';
  refs.expenseForm.elements.accountId.value = transaction?.accountId || accountId || refs.expenseAccountSelect.options[0]?.value || '';
  refs.expenseForm.elements.date.value = transaction?.date || todayISO();
  refs.expenseForm.elements.paid.checked = transaction ? transaction.paid !== false : true;
  refs.expenseForm.elements.notes.value = transaction?.notes || '';
}

function prepareIncomeForm(transaction = null, accountId = '') {
  if (!ensureAccountsAvailable(1)) {
    return;
  }
  refs.incomeForm.reset();
  openSheet('incomeSheet');
  incomeSheetTitle.textContent = transaction ? 'Editar ingreso' : 'Nuevo ingreso';
  incomeSubmitButton.textContent = transaction ? 'Actualizar ingreso' : 'Guardar ingreso';
  refs.incomeForm.elements.id.value = transaction?.id || '';
  refs.incomeForm.elements.description.value = transaction?.description || '';
  refs.incomeForm.elements.amount.value = transaction?.amount || '';
  refs.incomeForm.elements.category.value = transaction?.category || refs.incomeCategorySelect.options[0]?.value || '';
  refs.incomeForm.elements.accountId.value = transaction?.accountId || accountId || refs.incomeAccountSelect.options[0]?.value || '';
  refs.incomeForm.elements.date.value = transaction?.date || todayISO();
  refs.incomeForm.elements.notes.value = transaction?.notes || '';
}

function prepareTransferForm(transaction = null, fromAccountId = '') {
  const accounts = ensureAccountsAvailable(2);
  if (!accounts) {
    return;
  }
  refs.transferForm.reset();
  openSheet('transferSheet');
  transferSheetTitle.textContent = transaction ? 'Editar movimiento' : 'Nuevo movimiento';
  transferSubmitButton.textContent = transaction ? 'Actualizar movimiento' : 'Realizar movimiento';
  refs.transferForm.elements.id.value = transaction?.id || '';
  refs.transferForm.elements.description.value = transaction?.description || '';
  refs.transferForm.elements.amount.value = transaction?.amount || '';
  refs.transferForm.elements.date.value = transaction?.date || todayISO();
  refs.transferForm.elements.fromAccountId.value = transaction?.fromAccountId || fromAccountId || refs.transferFromSelect.options[0]?.value || '';
  const fallbackTarget = [...refs.transferToSelect.options].find((option) => option.value !== refs.transferForm.elements.fromAccountId.value)?.value || refs.transferToSelect.options[0]?.value || '';
  refs.transferForm.elements.toAccountId.value = transaction?.toAccountId || fallbackTarget;
}

function prepareAccountForm(account = null) {
  refs.accountForm.reset();
  openSheet('accountSheet');
  accountSheetTitle.textContent = account ? 'Editar cuenta' : 'Nueva cuenta';
  accountSubmitButton.textContent = account ? 'Actualizar cuenta' : 'Guardar cuenta';
  refs.accountForm.elements.id.value = account?.id || '';
  refs.accountForm.elements.name.value = account?.name || '';
  refs.accountForm.elements.institution.value = account?.institution || '';
  refs.accountForm.elements.type.value = account?.type || refs.accountTypeSelect.options[0]?.value || 'debit';
  refs.accountForm.elements.last4.value = account?.last4 || '';
  refs.accountForm.elements.openingBalance.value = account?.openingBalance ?? '';
  refs.accountForm.elements.creditLimit.value = account?.creditLimit ?? '';
  refs.accountForm.elements.statementDay.value = account?.statementDay ?? '';
  refs.accountForm.elements.paymentDay.value = account?.paymentDay ?? '';
  syncAccountBillingFields();
}
function queueDanger(type, id = '') {
  state.ui.pendingDanger = { type, id };
  openSheet('dangerSheet');
}

function editTransactionById(transactionId) {
  const transaction = state.snapshot.transactions.find((item) => item.id === transactionId);
  if (!transaction) {
    showToast(refs, 'No se encontro el movimiento seleccionado.', 'danger');
    return;
  }
  if (transaction.kind === 'income') {
    prepareIncomeForm(transaction);
  }
  if (transaction.kind === 'expense') {
    prepareExpenseForm(transaction);
  }
  if (transaction.kind === 'transfer') {
    prepareTransferForm(transaction);
  }
}

async function confirmDangerAction() {
  const pending = state.ui.pendingDanger;
  if (!pending) {
    return;
  }

  if (pending.type === 'delete-transaction') {
    commitSnapshot((snapshot) => {
      snapshot.transactions = snapshot.transactions.filter((item) => item.id !== pending.id);
    }, 'Movimiento eliminado.', 'danger');
    state.ui.focusTransactionId = '';
    closeSheet();
    return;
  }

  if (pending.type === 'delete-account') {
    commitSnapshot((snapshot) => {
      snapshot.accounts = snapshot.accounts.filter((item) => item.id !== pending.id);
      snapshot.transactions = snapshot.transactions.filter((item) => item.accountId !== pending.id && item.fromAccountId !== pending.id && item.toAccountId !== pending.id);
    }, 'Cuenta eliminada.', 'danger');
    state.ui.focusAccountId = '';
    closeSheet();
    return;
  }

  if (pending.type === 'delete-user') {
    const sessionId = currentSessionId();
    try {
      if (state.auth.mode === 'firebase' && state.auth.firebaseUser) {
        await deleteCurrentUserAccount();
      }
      removeSnapshotFromLocal(sessionId);
      clearBackupFromLocal(sessionId);
      clearSession();
      state.snapshot = createSampleSnapshot();
      state.sessionActive = false;
      state.auth.firebaseUser = null;
      state.auth.user = null;
      state.ui.activeSheet = null;
      state.ui.pendingDanger = null;
      state.ui.focusAccountId = '';
      state.ui.focusTransactionId = '';
      showToast(refs, 'La cuenta del proyecto fue eliminada.', 'danger');
      render();
    } catch (error) {
      showToast(refs, error.message || 'No fue posible eliminar la cuenta.', 'danger');
    }
  }
}

function handleExpenseSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    id: form.elements.id.value || uid('tx'),
    kind: 'expense',
    description: form.elements.description.value.trim(),
    category: form.elements.category.value,
    amount: safeNumber(form.elements.amount.value),
    accountId: form.elements.accountId.value,
    date: form.elements.date.value || todayISO(),
    paid: form.elements.paid.checked,
    notes: form.elements.notes.value.trim()
  };
  const isEdit = Boolean(form.elements.id.value);
  commitSnapshot((snapshot) => {
    const index = snapshot.transactions.findIndex((item) => item.id === payload.id);
    if (index >= 0) {
      snapshot.transactions[index] = payload;
    } else {
      snapshot.transactions.push(payload);
    }
  }, isEdit ? 'Gasto actualizado.' : 'Gasto guardado.', 'danger');
  closeSheet();
}

function handleIncomeSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    id: form.elements.id.value || uid('tx'),
    kind: 'income',
    description: form.elements.description.value.trim(),
    category: form.elements.category.value,
    amount: safeNumber(form.elements.amount.value),
    accountId: form.elements.accountId.value,
    date: form.elements.date.value || todayISO(),
    paid: true,
    notes: form.elements.notes.value.trim()
  };
  const isEdit = Boolean(form.elements.id.value);
  commitSnapshot((snapshot) => {
    const index = snapshot.transactions.findIndex((item) => item.id === payload.id);
    if (index >= 0) {
      snapshot.transactions[index] = payload;
    } else {
      snapshot.transactions.push(payload);
    }
  }, isEdit ? 'Ingreso actualizado.' : 'Ingreso guardado.', 'success');
  closeSheet();
}

function handleTransferSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.elements.fromAccountId.value === form.elements.toAccountId.value) {
    showToast(refs, 'El origen y destino deben ser diferentes.', 'danger');
    return;
  }
  const payload = {
    id: form.elements.id.value || uid('tx'),
    kind: 'transfer',
    description: form.elements.description.value.trim() || 'Movimiento entre cuentas',
    category: 'Transferencia',
    amount: safeNumber(form.elements.amount.value),
    fromAccountId: form.elements.fromAccountId.value,
    toAccountId: form.elements.toAccountId.value,
    date: form.elements.date.value || todayISO(),
    paid: true,
    notes: ''
  };
  const isEdit = Boolean(form.elements.id.value);
  commitSnapshot((snapshot) => {
    const index = snapshot.transactions.findIndex((item) => item.id === payload.id);
    if (index >= 0) {
      snapshot.transactions[index] = payload;
    } else {
      snapshot.transactions.push(payload);
    }
  }, isEdit ? 'Movimiento actualizado.' : 'Movimiento realizado.', 'info');
  closeSheet();
}

async function handleAccountSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const type = form.elements.type.value;
  const payload = {
    id: form.elements.id.value || uid('acc'),
    name: form.elements.name.value.trim(),
    institution: form.elements.institution.value.trim(),
    type,
    last4: form.elements.last4.value.trim(),
    openingBalance: safeNumber(form.elements.openingBalance.value),
    creditLimit: type === 'credit' ? safeNumber(form.elements.creditLimit.value) : 0,
    statementDay: type === 'credit' ? safeNumber(form.elements.statementDay.value) : 0,
    paymentDay: type === 'credit' ? safeNumber(form.elements.paymentDay.value) : 0
  };
  const isEdit = Boolean(form.elements.id.value);
  commitSnapshot((snapshot) => {
    const index = snapshot.accounts.findIndex((item) => item.id === payload.id);
    if (index >= 0) {
      snapshot.accounts[index] = payload;
    } else {
      snapshot.accounts.push(payload);
    }
  }, isEdit ? 'Cuenta actualizada.' : 'Cuenta creada.', 'success');
  if (payload.type === 'credit' && payload.statementDay && payload.paymentDay) {
    await ensureNotificationPermission();
  }
  closeSheet();
}

async function handleRestoreBackup(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }
  try {
    const payload = await readJsonFile(file);
    state.snapshot = normalizeSnapshot(payload.snapshot || payload, currentUserSeed());
    state.snapshot.meta.lastBackupAt = new Date().toISOString();
    persistSnapshot();
    render();
    showToast(refs, 'Backup restaurado correctamente.', 'success');
  } catch {
    showToast(refs, 'El archivo de backup no es valido.', 'danger');
  } finally {
    refs.restoreBackupInput.value = '';
  }
}

async function handleAction(action, element) {
  if (action === 'close-sheet') {
    closeSheet();
    return;
  }
  if (action === 'open-quick-action') {
    openSheet('quickActionSheet');
    return;
  }
  if (action === 'open-expense') {
    prepareExpenseForm();
    return;
  }
  if (action === 'open-income') {
    prepareIncomeForm();
    return;
  }
  if (action === 'open-transfer') {
    prepareTransferForm();
    return;
  }
  if (action === 'open-account-form') {
    prepareAccountForm();
    return;
  }
  if (action === 'open-reports') {
    openSheet('reportsSheet');
    return;
  }
  if (action === 'open-personalization') {
    openSheet('personalizationSheet');
    return;
  }
  if (action === 'open-backup') {
    openSheet('backupSheet');
    return;
  }
  if (action === 'open-security') {
    openSheet('securitySheet');
    return;
  }
  if (action === 'open-help') {
    openSheet('helpSheet');
    return;
  }
  if (action === 'open-auth-gate') {
    state.ui.authMode = 'login';
    state.ui.authPromptOpen = true;
    render();
    return;
  }
  if (action === 'show-login') {
    state.ui.authMode = 'login';
    render();
    return;
  }
  if (action === 'show-register') {
    state.ui.authMode = 'register';
    refreshRegisterPreview();
    render();
    return;
  }
  if (action === 'toggle-theme') {
    state.snapshot.settings.theme = state.snapshot.settings.theme === 'dark' ? 'light' : 'dark';
    persistSnapshot();
    render();
    return;
  }
  if (action === 'open-income-for-account') {
    prepareIncomeForm(null, element.dataset.accountId || '');
    return;
  }
  if (action === 'open-expense-for-account') {
    prepareExpenseForm(null, element.dataset.accountId || '');
    return;
  }
  if (action === 'open-transfer-from-account') {
    prepareTransferForm(null, element.dataset.accountId || '');
    return;
  }
  if (action === 'edit-account') {
    const account = state.snapshot.accounts.find((item) => item.id === element.dataset.accountId);
    if (account) {
      prepareAccountForm(account);
    }
    return;
  }
  if (action === 'delete-account') {
    queueDanger('delete-account', element.dataset.accountId || '');
    return;
  }
  if (action === 'edit-transaction') {
    editTransactionById(element.dataset.transactionId || '');
    return;
  }
  if (action === 'delete-transaction') {
    queueDanger('delete-transaction', element.dataset.transactionId || '');
    return;
  }
  if (action === 'delete-user') {
    queueDanger('delete-user');
    return;
  }
  if (action === 'confirm-danger') {
    await confirmDangerAction();
    return;
  }
  if (action === 'sign-out') {
    await handleLogout(false);
    return;
  }
  if (action === 'continue-local') {
    const sourceName = state.ui.authMode === 'register' ? registerNameInput.value.trim() : (loginEmailInput.value.split('@')[0] || '').trim();
    const sourceEmail = state.ui.authMode === 'register' ? registerEmailInput.value.trim() : loginEmailInput.value.trim();
    startLocalSession({
      name: sourceName || 'Alex Rivera',
      email: sourceEmail || 'alex@dashboardpro.app',
      photo: state.ui.pendingProfileImage || ''
    });
    return;
  }
  if (action === 'sign-in') {
    if (!state.auth.cloudAvailable) {
      showToast(refs, 'Configura un nuevo proyecto de Firebase antes de iniciar sesion en la nube.', 'danger');
      return;
    }
    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value.trim();
    if (!email || !password) {
      showToast(refs, 'Completa correo y contrasena para iniciar sesion.', 'danger');
      return;
    }
    try {
      await signInWithEmailPassword(email, password);
      showToast(refs, 'Sesion iniciada correctamente.', 'success');
    } catch (error) {
      showToast(refs, error.message || 'No fue posible iniciar sesion.', 'danger');
    }
    return;
  }
  if (action === 'register') {
    if (!state.auth.cloudAvailable) {
      showToast(refs, 'Configura un nuevo proyecto de Firebase antes de registrar usuarios.', 'danger');
      return;
    }
    const name = registerNameInput.value.trim();
    const email = registerEmailInput.value.trim();
    const password = registerPasswordInput.value.trim();
    if (!name || !email || !password) {
      showToast(refs, 'Completa nombre, correo y contrasena para registrarte.', 'danger');
      return;
    }
    state.ui.pendingRegistration = { name, email, photo: state.ui.pendingProfileImage || '' };
    try {
      await registerWithEmailPassword(name, email, password, state.ui.pendingProfileImage || '');
      showToast(refs, 'Cuenta creada en tu nuevo proyecto Firebase.', 'success');
    } catch (error) {
      showToast(refs, error.message || 'No fue posible completar el registro.', 'danger');
    }
  }
}

function handleDocumentClick(event) {
  const actionElement = event.target.closest('[data-action]');
  if (actionElement) {
    handleAction(actionElement.dataset.action, actionElement);
    return;
  }

  const filterElement = event.target.closest('[data-filter]');
  if (filterElement) {
    state.ui.txFilter = filterElement.dataset.filter;
    render();
    return;
  }

  const accountElement = event.target.closest('[data-account-id]');
  if (accountElement) {
    openAccountDetail(accountElement.dataset.accountId);
    return;
  }

  const transactionElement = event.target.closest('[data-transaction-id]');
  if (transactionElement) {
    openTransactionDetail(transactionElement.dataset.transactionId);
    return;
  }

  const accentElement = event.target.closest('[data-accent]');
  if (accentElement) {
    state.snapshot.settings.accent = accentElement.dataset.accent;
    persistSnapshot();
    render();
    return;
  }

  const densityElement = event.target.closest('[data-density]');
  if (densityElement && densityElement.closest('#densitySelector')) {
    state.snapshot.settings.density = densityElement.dataset.density;
    persistSnapshot();
    render();
    return;
  }

  const viewElement = event.target.closest('[data-view]');
  if (viewElement) {
    state.ui.activeView = viewElement.dataset.view;
    render();
  }
}

function bindEvents() {
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('pointerdown', resetInactivityTimer);
  document.addEventListener('keydown', resetInactivityTimer);
  document.addEventListener('touchstart', resetInactivityTimer, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkCreditReminders();
    }
  });

  refs.expenseForm.addEventListener('submit', handleExpenseSubmit);
  refs.incomeForm.addEventListener('submit', handleIncomeSubmit);
  refs.transferForm.addEventListener('submit', handleTransferSubmit);
  refs.accountForm.addEventListener('submit', handleAccountSubmit);
  refs.restoreBackupInput.addEventListener('change', handleRestoreBackup);
  refs.reportMonth.addEventListener('change', () => {
    state.ui.selectedMonth = refs.reportMonth.value || monthKey();
    render();
  });
  refs.themeSwitch.addEventListener('change', () => {
    state.snapshot.settings.theme = refs.themeSwitch.checked ? 'dark' : 'light';
    persistSnapshot();
    render();
  });
  refs.accountForm.elements.type.addEventListener('change', syncAccountBillingFields);
  registerNameInput.addEventListener('input', refreshRegisterPreview);
  registerPhotoInput.addEventListener('change', async (event) => {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }
    try {
      state.ui.pendingProfileImage = await compressImageFile(file);
      refreshRegisterPreview();
      showToast(refs, 'Imagen comprimida y lista para el perfil.', 'success');
    } catch {
      showToast(refs, 'No fue posible procesar la imagen seleccionada.', 'danger');
    }
  });

  createBackupButton.addEventListener('click', () => {
    commitSnapshot((snapshot) => {
      snapshot.meta.lastBackupAt = new Date().toISOString();
    });
    saveBackupToLocal(currentSessionId(), state.snapshot);
    showToast(refs, 'Backup local creado.', 'success');
  });

  restoreBackupButton.addEventListener('click', () => {
    refs.restoreBackupInput.click();
  });

  exportJsonButton.addEventListener('click', () => {
    exportBackupJson(currentSessionId(), state.snapshot);
    showToast(refs, 'Datos exportados en JSON.', 'info');
  });

  exportPdfButton.addEventListener('click', () => {
    try {
      exportMonthlyReport(state.snapshot, state.ui.selectedMonth);
      showToast(refs, 'PDF generado correctamente.', 'success');
    } catch (error) {
      showToast(refs, error.message || 'No fue posible generar el PDF.', 'danger');
    }
  });

  refs.installButton.addEventListener('click', async () => {
    if (!state.ui.installPromptEvent) {
      return;
    }
    state.ui.installPromptEvent.prompt();
    await state.ui.installPromptEvent.userChoice;
    state.ui.installPromptEvent = null;
    render();
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.ui.installPromptEvent = event;
    render();
  });

  window.addEventListener('appinstalled', () => {
    state.ui.installPromptEvent = null;
    render();
  });

  window.addEventListener('online', () => showToast(refs, 'Conexion recuperada.', 'success'));
  window.addEventListener('offline', () => showToast(refs, 'Estas trabajando sin conexion.', 'info'));
}

async function boot() {
  bindEvents();
  refreshRegisterPreview();
  syncAccountBillingFields();
  window.setInterval(checkCreditReminders, 60000);
  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      showToast(refs, 'No fue posible registrar el service worker.', 'danger');
    });
  }

  const savedSession = loadSession();
  const firebaseResult = await initFirebase({
    onAuthChange(user) {
      if (user) {
        activateFirebaseSession(user);
        return;
      }
      if (state.auth.mode === 'firebase') {
        state.sessionActive = false;
        state.auth.firebaseUser = null;
        clearSession();
        render();
      }
    },
    onDataChange(snapshot) {
      applyRemoteSnapshot(snapshot);
    },
    onError(error) {
      showToast(refs, error.message || 'Firebase no esta disponible.', 'danger');
    }
  });

  state.auth.cloudAvailable = firebaseResult.enabled;

  if (!firebaseResult.enabled) {
    startLocalSession();
    showToast(refs, 'Proyecto iniciado en modo local. Configura un Firebase nuevo cuando quieras usar la nube.', 'info');
    return;
  }

  if (savedSession?.mode === 'local') {
    startLocalSession();
    showToast(refs, 'Continuaste en modo local. Puedes conectar un Firebase nuevo desde Perfil.', 'info');
    return;
  }

  if (!state.sessionActive) {
    finishLoading();
    render();
  }
}

boot();












