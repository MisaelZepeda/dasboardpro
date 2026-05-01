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

function render() {
  renderApp(refs, state);
}

function currentSessionId() {
  return state.auth.mode === 'firebase' && state.auth.firebaseUser ? state.auth.firebaseUser.uid : LOCAL_SESSION_ID;
}

function currentUserSeed() {
  return {
    name: state.auth.user?.name || state.snapshot.user?.name || 'Alex Rivera',
    email: state.auth.user?.email || state.snapshot.user?.email || 'alex@dashboardpro.app'
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
    email: state.snapshot.user.email
  };
  persistSnapshot();
  render();
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
    email: state.snapshot.user.email
  };
  state.sessionActive = true;
  state.ui.authPromptOpen = false;
  state.ui.activeSheet = null;
  saveSession({ mode: 'local' });
  persistSnapshot();
  finishLoading();
  resetInactivityTimer();
  render();
}

function activateFirebaseSession(user) {
  const userSeed = {
    name: user.displayName || user.email?.split('@')[0] || 'Usuario',
    email: user.email || ''
  };
  const cached = loadSnapshotFromLocal(user.uid, userSeed);
  state.auth.mode = 'firebase';
  state.auth.firebaseUser = user;
  state.auth.user = userSeed;
  state.snapshot = cached || createSampleSnapshot(userSeed);
  state.sessionActive = true;
  state.ui.authPromptOpen = false;
  saveSession({ mode: 'firebase', uid: user.uid });
  finishLoading();
  resetInactivityTimer();
  render();
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
    return;
  }
  state.snapshot = normalizeSnapshot(snapshot, currentUserSeed());
  state.auth.user = {
    name: state.snapshot.user.name,
    email: state.snapshot.user.email
  };
  saveSnapshotToLocal(currentSessionId(), state.snapshot);
  finishLoading();
  render();
}

async function handleLogout(fromInactivity = false) {
  clearTimeout(inactivityTimer);
  state.ui.activeSheet = null;
  state.ui.pendingDanger = null;
  state.ui.authPromptOpen = false;
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
  refs.accountForm.elements.type.value = account?.type || refs.accountTypeSelect.options[0]?.value || 'bank';
  refs.accountForm.elements.last4.value = account?.last4 || '';
  refs.accountForm.elements.openingBalance.value = account?.openingBalance ?? '';
  refs.accountForm.elements.creditLimit.value = account?.creditLimit ?? '';
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

function handleAccountSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    id: form.elements.id.value || uid('acc'),
    name: form.elements.name.value.trim(),
    institution: form.elements.institution.value.trim(),
    type: form.elements.type.value,
    last4: form.elements.last4.value.trim(),
    openingBalance: safeNumber(form.elements.openingBalance.value),
    creditLimit: safeNumber(form.elements.creditLimit.value)
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
    state.ui.authPromptOpen = true;
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
    const name = document.getElementById('authName').value.trim() || 'Alex Rivera';
    const email = document.getElementById('authEmail').value.trim() || 'alex@dashboardpro.app';
    startLocalSession({ name, email });
    return;
  }
  if (action === 'sign-in' || action === 'register') {
    if (!state.auth.cloudAvailable) {
      showToast(refs, 'Configura un nuevo proyecto de Firebase antes de iniciar sesion en la nube.', 'danger');
      return;
    }
    const name = document.getElementById('authName').value.trim();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value.trim();
    if (!email || !password || (action === 'register' && !name)) {
      showToast(refs, 'Completa los datos requeridos para continuar.', 'danger');
      return;
    }
    try {
      if (action === 'sign-in') {
        await signInWithEmailPassword(email, password);
        showToast(refs, 'Sesion iniciada correctamente.', 'success');
      } else {
        await registerWithEmailPassword(name, email, password);
        showToast(refs, 'Cuenta creada en tu nuevo proyecto Firebase.', 'success');
      }
    } catch (error) {
      showToast(refs, error.message || 'No fue posible completar la operacion.', 'danger');
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
