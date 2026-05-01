export const LOCAL_SESSION_ID = 'local-demo';
export const EXPENSE_CATEGORIES = ['Alimentos', 'Transporte', 'Hogar', 'Servicios', 'Salud', 'Compras', 'Entretenimiento', 'Educacion'];
export const INCOME_CATEGORIES = ['Nomina', 'Freelance', 'Ventas', 'Intereses', 'Reembolso', 'Otro'];
export const ACCOUNT_TYPES = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'debit', label: 'Debito' },
  { value: 'credit', label: 'Tarjetas de credito' }
];
export const ACCENT_PALETTES = [
  { id: 'ocean', label: 'Ocean', primary: '#2667ff', secondary: '#7c4dff' },
  { id: 'mint', label: 'Mint', primary: '#0891b2', secondary: '#22c55e' },
  { id: 'sunset', label: 'Sunset', primary: '#f97316', secondary: '#ec4899' },
  { id: 'midnight', label: 'Midnight', primary: '#1d4ed8', secondary: '#4338ca' }
];
export const DEFAULT_SETTINGS = {
  theme: 'light',
  density: 'comfortable',
  accent: 'ocean',
  inactivityMinutes: 15,
  currency: 'MXN'
};

const SESSION_KEY = 'dashboard-pro:session';

function pad(value) {
  return String(value).padStart(2, '0');
}

export function todayISO(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function monthKey(date = new Date()) {
  return todayISO(date).slice(0, 7);
}

export function parseISODate(dateString) {
  if (!dateString) {
    return new Date();
  }
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

export function uid(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrency(value, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(safeNumber(value));
}

export function formatPercent(value) {
  const amount = safeNumber(value);
  return `${amount >= 0 ? '+' : ''}${amount.toFixed(1)}%`;
}

export function formatMonthLabel(value) {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

export function formatDateLabel(value, withYear = false) {
  return new Intl.DateTimeFormat('es-MX', withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }).format(parseISODate(value));
}

export function formatBackupLabel(value) {
  if (!value) {
    return 'Sin respaldo reciente';
  }
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export function firstName(name = 'Usuario') {
  return (name.trim().split(/\s+/)[0] || 'Usuario').trim();
}

export function getPalette(accentId) {
  return ACCENT_PALETTES.find((palette) => palette.id === accentId) || ACCENT_PALETTES[0];
}

export function getAccountTypeLabel(type) {
  switch (type) {
    case 'cash':
      return 'Efectivo';
    case 'debit':
    case 'bank':
      return 'Debito';
    case 'credit':
      return 'Credito';
    default:
      return 'Cuenta';
  }
}
function dateFromOffset(daysOffset = 0) {
  const value = new Date();
  value.setDate(value.getDate() + daysOffset);
  return todayISO(value);
}

function monthDate(monthOffset = 0, day = 12) {
  const value = new Date();
  return todayISO(new Date(value.getFullYear(), value.getMonth() + monthOffset, day, 12, 0, 0, 0));
}

export function normalizeUser(raw = {}, seed = {}) {
  return {
    name: raw.name || seed.name || 'Alex Rivera',
    email: raw.email || seed.email || 'alex@dashboardpro.app',
    photo: raw.photo || seed.photo || ''
  };
}
export function normalizeSettings(raw = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...raw
  };
}

export function normalizeAccount(raw = {}) {
  const normalizedType = raw.type === 'bank' ? 'debit' : raw.type;
  return {
    id: raw.id || uid('acc'),
    name: raw.name || 'Cuenta',
    institution: raw.institution || 'Institucion',
    type: ['cash', 'debit', 'credit'].includes(normalizedType) ? normalizedType : 'debit',
    last4: String(raw.last4 || '').slice(-4),
    openingBalance: safeNumber(raw.openingBalance),
    creditLimit: safeNumber(raw.creditLimit),
    statementDay: safeNumber(raw.statementDay),
    paymentDay: safeNumber(raw.paymentDay)
  };
}
export function normalizeTransaction(raw = {}) {
  const kind = ['income', 'expense', 'transfer'].includes(raw.kind) ? raw.kind : 'expense';
  return {
    id: raw.id || uid('tx'),
    kind,
    description: raw.description || (kind === 'transfer' ? 'Movimiento' : 'Registro'),
    category: raw.category || (kind === 'income' ? 'Otro' : kind === 'expense' ? 'Compras' : 'Transferencia'),
    amount: safeNumber(raw.amount),
    date: raw.date || todayISO(),
    accountId: raw.accountId || '',
    fromAccountId: raw.fromAccountId || '',
    toAccountId: raw.toAccountId || '',
    paid: raw.paid !== false,
    notes: raw.notes || ''
  };
}

export function normalizeSnapshot(raw = {}, seedUser = {}) {
  const user = normalizeUser(raw.user, seedUser);
  const settings = normalizeSettings(raw.settings);
  const accounts = Array.isArray(raw.accounts) ? raw.accounts.map(normalizeAccount) : [];
  const transactions = Array.isArray(raw.transactions) ? raw.transactions.map(normalizeTransaction) : [];
  const meta = {
    createdAt: raw.meta?.createdAt || new Date().toISOString(),
    updatedAt: raw.meta?.updatedAt || new Date().toISOString(),
    lastBackupAt: raw.meta?.lastBackupAt || null
  };
  return { user, settings, accounts, transactions, meta };
}

export function cloneSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

export function createSampleSnapshot(seedUser = {}) {
  const accounts = [
    { id: 'acc-cash', name: 'Efectivo', institution: 'Disponible', type: 'cash', last4: '', openingBalance: 2150, creditLimit: 0, statementDay: 0, paymentDay: 0 },
    { id: 'acc-bbva', name: 'BBVA Debito', institution: 'BBVA', type: 'debit', last4: '1234', openingBalance: 15350, creditLimit: 0, statementDay: 0, paymentDay: 0 },
    { id: 'acc-santander', name: 'Santander Debito', institution: 'Santander', type: 'debit', last4: '9132', openingBalance: 8780, creditLimit: 0, statementDay: 0, paymentDay: 0 },
    { id: 'acc-nu', name: 'Tarjeta Nu', institution: 'Nu', type: 'credit', last4: '5791', openingBalance: -3250, creditLimit: 25000, statementDay: 7, paymentDay: 23 },
    { id: 'acc-banamex', name: 'Banamex Oro', institution: 'Banamex', type: 'credit', last4: '3546', openingBalance: -1980, creditLimit: 18000, statementDay: 12, paymentDay: 27 }
  ];

  const transactions = [
    { id: uid('tx'), kind: 'income', description: 'Sueldo', category: 'Nomina', amount: 28450, accountId: 'acc-bbva', date: dateFromOffset(-2), notes: 'Ingreso quincenal' },
    { id: uid('tx'), kind: 'income', description: 'Freelance Project', category: 'Freelance', amount: 6500, accountId: 'acc-bbva', date: dateFromOffset(-10), notes: '' },
    { id: uid('tx'), kind: 'expense', description: 'Supermercado', category: 'Alimentos', amount: 1230, accountId: 'acc-bbva', date: dateFromOffset(-1), paid: true, notes: '' },
    { id: uid('tx'), kind: 'expense', description: 'Uber', category: 'Transporte', amount: 125, accountId: 'acc-cash', date: dateFromOffset(0), paid: true, notes: '' },
    { id: uid('tx'), kind: 'expense', description: 'Internet fibra', category: 'Servicios', amount: 699, accountId: 'acc-bbva', date: dateFromOffset(-6), paid: true, notes: '' },
    { id: uid('tx'), kind: 'expense', description: 'Spotify', category: 'Entretenimiento', amount: 177, accountId: 'acc-nu', date: dateFromOffset(-3), paid: true, notes: '' },
    { id: uid('tx'), kind: 'transfer', description: 'Fondo para gastos del mes', category: 'Transferencia', amount: 1800, fromAccountId: 'acc-bbva', toAccountId: 'acc-santander', date: dateFromOffset(-5), notes: '' },
    { id: uid('tx'), kind: 'transfer', description: 'Transferencia a Nu', category: 'Transferencia', amount: 2000, fromAccountId: 'acc-bbva', toAccountId: 'acc-nu', date: dateFromOffset(-8), notes: '' },
    { id: uid('tx'), kind: 'income', description: 'Reembolso de compra', category: 'Reembolso', amount: 330, accountId: 'acc-bbva', date: monthDate(-1, 26), notes: '' },
    { id: uid('tx'), kind: 'expense', description: 'Gasolina', category: 'Transporte', amount: 980, accountId: 'acc-bbva', date: monthDate(-1, 20), paid: true, notes: '' },
    { id: uid('tx'), kind: 'expense', description: 'Pago de servicio', category: 'Servicios', amount: 1599, accountId: 'acc-banamex', date: monthDate(-1, 14), paid: true, notes: '' },
    { id: uid('tx'), kind: 'income', description: 'Venta de monitor', category: 'Ventas', amount: 4200, accountId: 'acc-bbva', date: monthDate(-2, 17), notes: '' },
    { id: uid('tx'), kind: 'expense', description: 'Consulta medica', category: 'Salud', amount: 850, accountId: 'acc-bbva', date: monthDate(-2, 11), paid: true, notes: '' }
  ];

  return normalizeSnapshot(
    {
      user: {
        name: seedUser.name || 'Alex Rivera',
        email: seedUser.email || 'alex@dashboardpro.app',
        photo: seedUser.photo || ''
      },
      settings: { ...DEFAULT_SETTINGS },
      accounts,
      transactions,
      meta: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastBackupAt: null
      }
    },
    seedUser
  );
}

function storageKey(sessionId) {
  return `dashboard-pro:snapshot:${sessionId}`;
}

function backupKey(sessionId) {
  return `dashboard-pro:backup:${sessionId}`;
}

export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function loadSnapshotFromLocal(sessionId, seedUser = {}) {
  try {
    const raw = localStorage.getItem(storageKey(sessionId));
    return raw ? normalizeSnapshot(JSON.parse(raw), seedUser) : null;
  } catch {
    return null;
  }
}

export function saveSnapshotToLocal(sessionId, snapshot) {
  localStorage.setItem(storageKey(sessionId), JSON.stringify(normalizeSnapshot(snapshot)));
}

export function removeSnapshotFromLocal(sessionId) {
  localStorage.removeItem(storageKey(sessionId));
}

export function saveBackupToLocal(sessionId, snapshot) {
  const payload = {
    createdAt: new Date().toISOString(),
    snapshot: normalizeSnapshot(snapshot)
  };
  localStorage.setItem(backupKey(sessionId), JSON.stringify(payload));
  return payload;
}

export function loadBackupFromLocal(sessionId) {
  try {
    return JSON.parse(localStorage.getItem(backupKey(sessionId)) || 'null');
  } catch {
    return null;
  }
}

export function clearBackupFromLocal(sessionId) {
  localStorage.removeItem(backupKey(sessionId));
}

export function downloadFile(fileName, contents, mimeType = 'application/json') {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportBackupJson(sessionId, snapshot) {
  const payload = {
    project: 'Dashboard Pro',
    exportedAt: new Date().toISOString(),
    sessionId,
    snapshot: normalizeSnapshot(snapshot)
  };
  downloadFile(`DashboardPro_Backup_${todayISO()}.json`, JSON.stringify(payload, null, 2));
  return payload;
}

export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function sameDay(a, b) {
  return todayISO(a) === todayISO(b);
}

export function describeRelativeDay(dateString) {
  const value = parseISODate(dateString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(value, today)) {
    return 'Hoy';
  }
  if (sameDay(value, yesterday)) {
    return 'Ayer';
  }
  return formatDateLabel(dateString, true);
}

export function sortTransactionsDesc(transactions) {
  return [...transactions].sort((left, right) => parseISODate(right.date) - parseISODate(left.date));
}

export function getTransactionsForMonth(snapshot, selectedMonth = monthKey()) {
  return sortTransactionsDesc(
    snapshot.transactions.filter((transaction) => transaction.date.startsWith(selectedMonth))
  );
}

export function getAccountBalance(snapshot, accountId, untilDate = null) {
  const account = snapshot.accounts.find((item) => item.id === accountId);
  if (!account) {
    return 0;
  }
  const limit = untilDate ? (untilDate instanceof Date ? untilDate : parseISODate(untilDate)) : null;
  return snapshot.transactions.reduce((balance, transaction) => {
    const transactionDate = parseISODate(transaction.date);
    if (limit && transactionDate > limit) {
      return balance;
    }
    if (transaction.kind === 'income' && transaction.accountId === accountId) {
      return balance + safeNumber(transaction.amount);
    }
    if (transaction.kind === 'expense' && transaction.accountId === accountId) {
      return balance - safeNumber(transaction.amount);
    }
    if (transaction.kind === 'transfer') {
      if (transaction.fromAccountId === accountId) {
        balance -= safeNumber(transaction.amount);
      }
      if (transaction.toAccountId === accountId) {
        balance += safeNumber(transaction.amount);
      }
    }
    return balance;
  }, safeNumber(account.openingBalance));
}

export function getAccountsWithBalances(snapshot, untilDate = null) {
  return snapshot.accounts.map((account) => {
    const currentBalance = getAccountBalance(snapshot, account.id, untilDate);
    const availableCredit = account.type === 'credit' ? Math.max(0, safeNumber(account.creditLimit) - Math.abs(Math.min(currentBalance, 0))) : 0;
    return {
      ...account,
      currentBalance,
      availableCredit,
      typeLabel: getAccountTypeLabel(account.type)
    };
  });
}

export function getPatrimonyAt(snapshot, untilDate = null) {
  return getAccountsWithBalances(snapshot, untilDate).reduce((total, account) => total + safeNumber(account.currentBalance), 0);
}

export function getMonthlySummary(snapshot, selectedMonth = monthKey()) {
  const movements = getTransactionsForMonth(snapshot, selectedMonth);
  const incomes = movements.filter((item) => item.kind === 'income').reduce((sum, item) => sum + safeNumber(item.amount), 0);
  const expenses = movements.filter((item) => item.kind === 'expense').reduce((sum, item) => sum + safeNumber(item.amount), 0);
  const transfers = movements.filter((item) => item.kind === 'transfer').reduce((sum, item) => sum + safeNumber(item.amount), 0);
  const [year, month] = selectedMonth.split('-').map(Number);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
  const endOfPreviousMonth = new Date(year, month - 1, 0, 23, 59, 59, 999);
  const patrimony = getPatrimonyAt(snapshot, endOfMonth);
  const previousPatrimony = getPatrimonyAt(snapshot, endOfPreviousMonth);
  const variation = previousPatrimony ? ((patrimony - previousPatrimony) / Math.abs(previousPatrimony)) * 100 : patrimony ? 100 : 0;
  return {
    incomes,
    expenses,
    transfers,
    patrimony,
    previousPatrimony,
    variation,
    net: incomes - expenses,
    count: movements.length
  };
}

export function getExpenseCategoryBreakdown(snapshot, selectedMonth = monthKey()) {
  const breakdown = new Map();
  getTransactionsForMonth(snapshot, selectedMonth)
    .filter((item) => item.kind === 'expense')
    .forEach((item) => {
      breakdown.set(item.category, safeNumber(breakdown.get(item.category)) + safeNumber(item.amount));
    });
  const total = [...breakdown.values()].reduce((sum, value) => sum + value, 0);
  return [...breakdown.entries()]
    .map(([label, value]) => ({ label, value, percentage: total ? (value / total) * 100 : 0 }))
    .sort((left, right) => right.value - left.value);
}

export function getTrendSeries(snapshot, count = 6) {
  const values = [];
  const now = new Date();
  for (let index = count - 1; index >= 0; index -= 1) {
    const pointDate = new Date(now.getFullYear(), now.getMonth() - index + 1, 0, 23, 59, 59, 999);
    values.push({
      label: new Intl.DateTimeFormat('es-MX', { month: 'short' }).format(pointDate).replace('.', ''),
      value: getPatrimonyAt(snapshot, pointDate)
    });
  }
  return values;
}

export function filterTransactions(snapshot, filter = 'all') {
  const transactions = sortTransactionsDesc(snapshot.transactions);
  if (filter === 'all') {
    return transactions;
  }
  return transactions.filter((transaction) => transaction.kind === filter);
}

export function groupTransactionsByRelativeDate(snapshot, filter = 'all') {
  const grouped = new Map();
  filterTransactions(snapshot, filter).forEach((transaction) => {
    const label = describeRelativeDay(transaction.date);
    if (!grouped.has(label)) {
      grouped.set(label, []);
    }
    grouped.get(label).push(transaction);
  });
  return [...grouped.entries()].map(([label, items]) => ({ label, items }));
}

export function getLatestTransactions(snapshot, count = 5, accountId = '') {
  const transactions = accountId
    ? sortTransactionsDesc(snapshot.transactions).filter((item) => item.accountId === accountId || item.fromAccountId === accountId || item.toAccountId === accountId)
    : sortTransactionsDesc(snapshot.transactions);
  return transactions.slice(0, count);
}

export function describeTransaction(snapshot, transaction) {
  const accountById = new Map(snapshot.accounts.map((account) => [account.id, account]));
  if (transaction.kind === 'transfer') {
    const from = accountById.get(transaction.fromAccountId);
    const to = accountById.get(transaction.toAccountId);
    return {
      title: transaction.description || 'Movimiento',
      subtitle: `${from?.name || 'Cuenta'} -> ${to?.name || 'Cuenta'}`,
      amountLabel: formatCurrency(transaction.amount),
      tone: 'transfer',
      iconText: 'MV'
    };
  }

  const account = accountById.get(transaction.accountId);
  const isIncome = transaction.kind === 'income';
  return {
    title: transaction.description,
    subtitle: `${transaction.category} | ${account?.name || 'Cuenta'}`,
    amountLabel: `${isIncome ? '+' : '-'}${formatCurrency(transaction.amount)}`,
    tone: isIncome ? 'income' : 'expense',
    iconText: (transaction.category || transaction.description || 'TX').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'TX'
  };
}

export function getAccountStatementRows(snapshot, selectedMonth = monthKey()) {
  return getTransactionsForMonth(snapshot, selectedMonth).map((transaction) => {
    const details = describeTransaction(snapshot, transaction);
    return {
      fecha: formatDateLabel(transaction.date, true),
      concepto: details.title,
      categoria: transaction.category,
      cuenta: details.subtitle,
      monto: details.amountLabel
    };
  });
}


