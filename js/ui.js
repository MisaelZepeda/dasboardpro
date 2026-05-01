import {
  ACCOUNT_TYPES,
  ACCENT_PALETTES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  describeTransaction,
  firstName,
  formatBackupLabel,
  formatCurrency,
  formatMonthLabel,
  formatPercent,
  getAccountsWithBalances,
  getExpenseCategoryBreakdown,
  getLatestTransactions,
  getMonthlySummary,
  getPalette,
  getTransactionsForMonth,
  getTrendSeries,
  groupTransactionsByRelativeDate,
  monthKey
} from './data.js';

const SHEET_IDS = [
  'quickActionSheet',
  'expenseSheet',
  'incomeSheet',
  'transferSheet',
  'accountSheet',
  'reportsSheet',
  'accountDetailSheet',
  'transactionDetailSheet',
  'personalizationSheet',
  'backupSheet',
  'securitySheet',
  'helpSheet',
  'dangerSheet'
];

let trendChart = null;
let expenseChart = null;

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setSelectOptions(select, options, selectedValue = '') {
  if (!select) {
    return;
  }
  const currentValue = selectedValue || select.value;
  select.innerHTML = options
    .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join('');
  if ([...select.options].some((option) => option.value === currentValue)) {
    select.value = currentValue;
  }
}

function skeletonMarkup() {
  return `
    <div class="hero-grid">
      <div class="skeleton skeleton-block large"></div>
      <div class="metric-grid">
        <div class="skeleton skeleton-block"></div>
        <div class="skeleton skeleton-block"></div>
        <div class="skeleton skeleton-block"></div>
      </div>
    </div>
    <div class="split-grid">
      <div class="skeleton skeleton-block large"></div>
      <div class="skeleton skeleton-block large"></div>
    </div>
  `;
}

function applyTheme(state, refs) {
  const settings = state.snapshot.settings;
  const palette = getPalette(settings.accent);
  refs.body.dataset.theme = settings.theme;
  refs.body.dataset.density = settings.density;
  refs.body.style.setProperty('--primary', palette.primary);
  refs.body.style.setProperty('--secondary', palette.secondary);
  refs.body.style.setProperty('--primary-soft', `${palette.primary}22`);
}

function getInitials(value = '') {
  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'DP';
}

function normalizeInstitution(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getAccountBrand(account) {
  const source = normalizeInstitution(`${account.institution} ${account.name}`);
  const baseBrands = {
    bbva: { key: 'bbva', name: 'BBVA', start: '#0f45ff', end: '#0b77ff' },
    santander: { key: 'santander', name: 'Santander', start: '#b30017', end: '#ef4444' },
    nu: { key: 'nu', name: 'Nu', start: '#5b16d0', end: '#9f2fff' },
    banamex: { key: 'banamex', name: 'Banamex', start: '#0f2d75', end: '#1f5eea' },
    banorte: { key: 'banorte', name: 'Banorte', start: '#981b1e', end: '#ef4444' },
    hsbc: { key: 'hsbc', name: 'HSBC', start: '#6b0f0f', end: '#dc2626' },
    klar: { key: 'klar', name: 'Klar', start: '#0f172a', end: '#334155' },
    stori: { key: 'stori', name: 'Stori', start: '#881337', end: '#ec4899' },
    mercado: { key: 'mercado', name: 'Mercado Pago', start: '#0ea5e9', end: '#2563eb' }
  };

  let brand = { key: account.type, name: account.institution, start: '#1f4ed8', end: '#60a5fa' };
  if (source.includes('bbva')) brand = baseBrands.bbva;
  else if (source.includes('santander')) brand = baseBrands.santander;
  else if (source.includes('banamex') || source.includes('citibanamex')) brand = baseBrands.banamex;
  else if (source.includes('banorte')) brand = baseBrands.banorte;
  else if (source.includes('hsbc')) brand = baseBrands.hsbc;
  else if (source.includes('klar')) brand = baseBrands.klar;
  else if (source.includes('stori')) brand = baseBrands.stori;
  else if (source.includes('mercado')) brand = baseBrands.mercado;
  else if (source.includes('nu')) brand = baseBrands.nu;
  else if (account.type === 'cash') brand = { key: 'cash', name: 'Disponible', start: '#0f9f73', end: '#34d399' };
  else if (account.type === 'credit') brand = { key: 'credit', name: account.institution, start: '#5b21b6', end: '#8b5cf6' };
  else if (account.type === 'debit') brand = { key: 'debit', name: account.institution, start: '#1d4ed8', end: '#2563eb' };

  return {
    ...brand,
    label: account.type === 'credit' ? 'Credito' : account.type === 'debit' ? 'Debito' : 'Efectivo'
  };
}

function buildBrandLogo(brand) {
  if (brand.key === 'santander') {
    return '<div class="brand-logo brand-logo-santander"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3c2.9 3 4.8 5.4 4.8 8.2A4.8 4.8 0 1 1 7.2 11c0-2.8 1.9-5.2 4.8-8Z" fill="currentColor"/><path d="M12 7.4c1.3 1.4 2.2 2.7 2.2 4.1a2.2 2.2 0 1 1-4.4 0c0-1.4.9-2.7 2.2-4.1Z" fill="white" fill-opacity="0.24"/></svg><span>Santander</span></div>';
  }
  if (brand.key === 'banamex') {
    return '<div class="brand-logo brand-logo-banamex"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="M12 4v16M4 12h16M6.6 6.6l10.8 10.8M17.4 6.6 6.6 17.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><span>Banamex</span></div>';
  }
  if (brand.key === 'nu') {
    return '<div class="brand-logo brand-logo-nu"><span>NU</span></div>';
  }
  if (brand.key === 'bbva') {
    return '<div class="brand-logo brand-logo-bbva"><span>BBVA</span></div>';
  }
  return `<div class="brand-logo"><span>${escapeHtml(brand.name)}</span></div>`;
}

function buildProfileAvatar(user, className = '') {
  if (user.photo) {
    return `<img class="profile-photo ${className}" src="${escapeHtml(user.photo)}" alt="Foto de perfil de ${escapeHtml(user.name)}" />`;
  }
  return `<div class="avatar-badge ${className}">${escapeHtml(getInitials(user.name))}</div>`;
}

function buildAccountChrome(account, compact = false) {
  const brand = getAccountBrand(account);
  const metaRight = account.type === 'credit'
    ? `${account.statementDay ? `Corte ${account.statementDay}` : 'Sin corte'}${account.paymentDay ? ` · Pago ${account.paymentDay}` : ''}`
    : account.last4 ? `**** ${account.last4}` : 'Disponible';
  const balanceTone = account.currentBalance >= 0 ? 'tone-income' : 'tone-expense';

  if (compact) {
    return `
      <button class="mini-account-card brand-card brand-${brand.key}" style="--brand-start:${brand.start}; --brand-end:${brand.end};" type="button" data-account-id="${account.id}">
        <div class="mini-card-top">
          ${buildBrandLogo(brand)}
          <span class="mini-card-chip">${escapeHtml(brand.label)}</span>
        </div>
        <div class="mini-card-number">${escapeHtml(metaRight)}</div>
        <div class="account-balance ${balanceTone}">${escapeHtml(formatCurrency(account.currentBalance))}</div>
        <div class="mini-card-footer">
          <strong>${escapeHtml(account.name)}</strong>
          <span>${escapeHtml(account.type === 'credit' ? `Limite ${formatCurrency(account.creditLimit)}` : account.institution)}</span>
        </div>
      </button>
    `;
  }

  return `
    <button class="account-card brand-card brand-${brand.key} ${account.type}" style="--brand-start:${brand.start}; --brand-end:${brand.end};" type="button" data-account-id="${account.id}">
      <div class="account-card-header">
        ${buildBrandLogo(brand)}
        <span class="account-pill">${escapeHtml(brand.label)}</span>
      </div>
      <div class="account-card-number">${escapeHtml(metaRight)}</div>
      <div class="account-balance ${balanceTone}">${escapeHtml(formatCurrency(account.currentBalance))}</div>
      <div class="account-meta-row">
        <span>${escapeHtml(account.institution)}</span>
        <span>${escapeHtml(account.type === 'credit' ? `Disponible ${formatCurrency(account.availableCredit)}` : account.last4 ? `**** ${account.last4}` : 'Lista para usar')}</span>
      </div>
      <div class="account-foot">
        <span>${escapeHtml(account.name)}</span>
        <span>${escapeHtml(account.type === 'credit' && account.paymentDay ? `Pago ${account.paymentDay}` : account.typeLabel)}</span>
      </div>
    </button>
  `;
}

function renderAuthPanels(refs, state) {
  if (!refs.authLoginForm || !refs.authRegisterForm || !refs.authTabLogin || !refs.authTabRegister || !refs.registerPhotoPreview) {
    return;
  }

  const registerMode = state.ui.authMode === 'register';
  refs.authLoginForm.classList.toggle('hidden', registerMode);
  refs.authRegisterForm.classList.toggle('hidden', !registerMode);
  refs.authTabLogin.classList.toggle('is-active', !registerMode);
  refs.authTabRegister.classList.toggle('is-active', registerMode);
  refs.authTabLogin.setAttribute('aria-selected', String(!registerMode));
  refs.authTabRegister.setAttribute('aria-selected', String(registerMode));
  refs.authShell.classList.toggle('auth-shell-overlay', state.sessionActive && state.ui.authPromptOpen);

  const previewName = refs.registerName?.value || state.ui.pendingRegistration?.name || 'Alex Rivera';
  if (state.ui.pendingProfileImage) {
    refs.registerPhotoPreview.classList.add('has-image');
    refs.registerPhotoPreview.innerHTML = `<img src="${escapeHtml(state.ui.pendingProfileImage)}" alt="Vista previa del perfil" />`;
  } else {
    refs.registerPhotoPreview.classList.remove('has-image');
    refs.registerPhotoPreview.textContent = getInitials(previewName);
  }
}

function buildTransactionRow(snapshot, transaction) {
  const details = describeTransaction(snapshot, transaction);
  return `
    <button class="tx-item" type="button" data-transaction-id="${transaction.id}">
      <div class="tx-left">
        <span class="tx-avatar ${details.tone}">${escapeHtml(details.iconText)}</span>
        <div class="tx-copy">
          <span class="tx-title">${escapeHtml(details.title)}</span>
          <span class="tx-subtitle">${escapeHtml(details.subtitle)}</span>
        </div>
      </div>
      <span class="tx-amount tone-${details.tone}">${escapeHtml(details.amountLabel)}</span>
    </button>
  `;
}

function buildAccountCard(account) {
  return buildAccountChrome(account, false);
}

function renderHome(refs, state) {
  if (state.ui.loading) {
    refs.homeContent.innerHTML = skeletonMarkup();
    return;
  }

  const currentMonth = monthKey();
  const summary = getMonthlySummary(state.snapshot, currentMonth);
  const accounts = getAccountsWithBalances(state.snapshot);
  const categories = getExpenseCategoryBreakdown(state.snapshot, currentMonth);
  const topAccounts = accounts.slice(0, 5);

  refs.homeContent.innerHTML = `
    <div class="hero-grid">
      <article class="hero-card">
        <div class="hero-top">
          <div>
            <p class="eyebrow">Patrimonio total</p>
            <h2>${escapeHtml(formatCurrency(summary.patrimony))}</h2>
          </div>
          <span class="pill ${summary.variation >= 0 ? 'positive' : 'negative'}">${escapeHtml(formatPercent(summary.variation))}</span>
        </div>
        <p class="hero-caption">${summary.variation >= 0 ? 'Cerraste mejor que el mes anterior. Mantienes buen ritmo financiero.' : 'El patrimonio va por debajo del cierre anterior. Ajusta y recupera traccion.'}</p>
        <div class="chart-shell compact">
          <canvas id="trendChart"></canvas>
        </div>
      </article>
      <div class="metric-grid">
        <article class="metric-card">
          <strong>Ingresos del mes</strong>
          <h3 class="tone-income">${escapeHtml(formatCurrency(summary.incomes))}</h3>
        </article>
        <article class="metric-card">
          <strong>Gastos del mes</strong>
          <h3 class="tone-expense">${escapeHtml(formatCurrency(summary.expenses))}</h3>
        </article>
        <article class="report-teaser">
          <div class="section-head">
            <div>
              <h3>Reportes</h3>
              <p>Genera tu estado de cuenta mensual en PDF.</p>
            </div>
          </div>
          <div class="profile-pills">
            <span class="inline-stat ${summary.net >= 0 ? 'positive' : 'negative'}">Balance ${escapeHtml(formatCurrency(summary.net))}</span>
            <span class="inline-stat">${escapeHtml(formatMonthLabel(currentMonth))}</span>
          </div>
          <button class="btn btn-primary btn-small" type="button" data-action="open-reports">Abrir reportes</button>
        </article>
      </div>
    </div>
    <div class="split-grid">
      <article class="section-card">
        <div class="section-head">
          <div>
            <h3>Distribucion de gastos</h3>
            <p>Vista rapida por categoria del periodo actual.</p>
          </div>
        </div>
        ${categories.length ? `<div class="chart-shell"><canvas id="expenseChart"></canvas></div>` : `<div class="empty-card"><h3>Sin gastos este mes</h3><p>Registra tu primer gasto para ver la distribucion.</p></div>`}
        <div class="legend-list">
          ${categories.length ? categories.slice(0, 5).map((item) => `
            <div class="legend-item">
              <div>
                <strong>${escapeHtml(item.label)}</strong>
                <span>${escapeHtml(item.percentage.toFixed(1))}%</span>
              </div>
              <strong>${escapeHtml(formatCurrency(item.value))}</strong>
            </div>
          `).join('') : ''}
        </div>
      </article>
      <article class="section-card">
        <div class="section-head">
          <div>
            <h3>Cuentas</h3>
            <p>Acceso directo a tus saldos y tarjetas.</p>
          </div>
          <button class="btn btn-secondary btn-small" type="button" data-view="accounts">Ver todas</button>
        </div>
        ${topAccounts.length ? `
          <div class="account-carousel">
            ${topAccounts.map((account) => buildAccountChrome(account, true)).join('')}
          </div>
        ` : `<div class="empty-card"><h3>Sin cuentas</h3><p>Agrega tu primera cuenta desde el boton central.</p></div>`}
      </article>
    </div>
  `;

  renderCharts(state);
}

function renderTransactions(refs, state) {
  if (state.ui.loading) {
    refs.transactionsContent.innerHTML = skeletonMarkup();
    return;
  }

  const groups = groupTransactionsByRelativeDate(state.snapshot, state.ui.txFilter);
  refs.transactionsContent.innerHTML = `
    <div class="tx-toolbar">
      <div>
        <p class="eyebrow">Historial</p>
        <h2>Transacciones</h2>
      </div>
      <button class="btn btn-secondary btn-small" type="button" data-action="open-quick-action">Nuevo</button>
    </div>
    <div class="chip-row">
      ${[
        { id: 'all', label: 'Todas' },
        { id: 'income', label: 'Ingresos' },
        { id: 'expense', label: 'Gastos' },
        { id: 'transfer', label: 'Movimientos' }
      ].map((filter) => `<button class="chip-btn ${state.ui.txFilter === filter.id ? 'is-active' : ''}" type="button" data-filter="${filter.id}">${filter.label}</button>`).join('')}
    </div>
    <div class="tx-groups">
      ${groups.length ? groups.map((group) => `
        <article class="tx-group">
          <div class="tx-group-head">
            <h4>${escapeHtml(group.label)}</h4>
            <span>${group.items.length} movimientos</span>
          </div>
          <div class="tx-list">
            ${group.items.map((transaction) => buildTransactionRow(state.snapshot, transaction)).join('')}
          </div>
        </article>
      `).join('') : `<div class="empty-card"><h3>Sin movimientos</h3><p>No hay registros para este filtro. Usa el boton central para crear uno.</p></div>`}
    </div>
    <button class="fab-inline" type="button" data-action="open-quick-action">+</button>
  `;
}

function renderAccounts(refs, state) {
  const accounts = getAccountsWithBalances(state.snapshot);
  const groups = [
    { key: 'cash', title: 'Efectivo' },
    { key: 'debit', title: 'Debito' },
    { key: 'credit', title: 'Tarjetas de credito' }
  ];

  refs.accountsContent.innerHTML = `
    <div class="account-section-head">
      <div>
        <p class="eyebrow">Cuentas</p>
        <h3>Mis cuentas</h3>
        <p>Gestiona efectivo, bancos y lineas de credito.</p>
      </div>
      <button class="btn btn-primary btn-small" type="button" data-action="open-account-form">Agregar</button>
    </div>
    ${groups.map((group) => {
      const items = accounts.filter((account) => account.type === group.key);
      return `
        <section class="account-section">
          <div class="account-section-head">
            <div>
              <h3>${group.title}</h3>
              <p>${items.length ? `${items.length} cuentas` : 'Sin cuentas en esta seccion'}</p>
            </div>
          </div>
          <div class="account-list">
            ${items.length ? items.map((account) => buildAccountCard(account)).join('') : `<div class="empty-card"><h3>Sin registros</h3><p>Agrega una cuenta para empezar a organizar esta seccion.</p></div>`}
          </div>
        </section>
      `;
    }).join('')}
  `;
}
function renderProfile(refs, state) {
  const user = state.snapshot.user;
  const accounts = getAccountsWithBalances(state.snapshot);
  const backupLabel = formatBackupLabel(state.snapshot.meta.lastBackupAt);
  const cloudLabel = state.auth.mode === 'firebase' ? 'Sesion en nube' : state.auth.cloudAvailable ? 'Modo local listo para nube' : 'Modo local';

  refs.profileContent.innerHTML = `
    <article class="profile-hero">
      ${buildProfileAvatar(user)}
      <div class="profile-meta">
        <h3>${escapeHtml(user.name)}</h3>
        <span>${escapeHtml(user.email)}</span>
      </div>
      <div class="profile-pills">
        <span class="inline-stat">${cloudLabel}</span>
        <span class="inline-stat">${accounts.length} cuentas</span>
        <span class="inline-stat">${backupLabel}</span>
      </div>
    </article>
    <section class="section-card">
      <div class="section-head">
        <div>
          <h3>Preferencias y seguridad</h3>
          <p>Todo lo importante de tu perfil en un solo lugar.</p>
        </div>
      </div>
      <div class="option-list">
        <button class="option-row" type="button" data-action="open-personalization">
          <div>
            <strong>Personalizacion</strong>
            <p>Colores, tema y densidad visual.</p>
          </div>
          <span>></span>
        </button>
        <button class="option-row" type="button" data-action="open-security">
          <div>
            <strong>Seguridad</strong>
            <p>Sesion persistente y salida por inactividad.</p>
          </div>
          <span>></span>
        </button>
        <button class="option-row" type="button" data-action="open-backup">
          <div>
            <strong>Backup y restauracion</strong>
            <p>Respalda o recupera tu informacion.</p>
          </div>
          <span>></span>
        </button>
        <button class="option-row" type="button" data-action="open-help">
          <div>
            <strong>Ayuda</strong>
            <p>Atajos y guia de uso del dashboard.</p>
          </div>
          <span>></span>
        </button>
        ${state.auth.cloudAvailable && state.auth.mode !== 'firebase' ? `
          <button class="option-row" type="button" data-action="open-auth-gate">
            <div>
              <strong>Conectar Firebase nuevo</strong>
              <p>Inicia sesion en el proyecto de nube que configures para esta app.</p>
            </div>
            <span>></span>
          </button>
        ` : ''}
        <button class="option-row" type="button" data-action="sign-out">
          <div>
            <strong>Cerrar sesion</strong>
            <p>Bloquea la app y vuelve a la pantalla de acceso.</p>
          </div>
          <span>></span>
        </button>
      </div>
    </section>
    <section class="danger-card">
      <div>
        <h3>Zona de peligro</h3>
        <p>Elimina la cuenta del proyecto actual y todos sus datos asociados.</p>
      </div>
      <button class="btn btn-danger" type="button" data-action="delete-user">Eliminar cuenta</button>
    </section>
  `;
}

function renderReports(refs, state) {
  const selectedMonth = state.ui.selectedMonth || monthKey();
  const summary = getMonthlySummary(state.snapshot, selectedMonth);
  const accounts = getAccountsWithBalances(state.snapshot);
  const movements = getTransactionsForMonth(state.snapshot, selectedMonth);
  refs.reportMonth.value = selectedMonth;

  refs.reportsSummary.innerHTML = [
    { label: 'Ingresos', value: formatCurrency(summary.incomes), tone: 'tone-income' },
    { label: 'Gastos', value: formatCurrency(summary.expenses), tone: 'tone-expense' },
    { label: 'Balance neto', value: formatCurrency(summary.net), tone: summary.net >= 0 ? 'tone-income' : 'tone-expense' },
    { label: 'Patrimonio final', value: formatCurrency(summary.patrimony), tone: summary.patrimony >= 0 ? 'tone-income' : 'tone-expense' }
  ].map((item) => `
    <article class="summary-tile">
      <strong>${escapeHtml(item.label)}</strong>
      <h3 class="${item.tone}">${escapeHtml(item.value)}</h3>
    </article>
  `).join('');

  refs.reportsTables.innerHTML = `
    <article class="table-shell">
      <h3>Resumen del periodo</h3>
      <div class="detail-list">
        <div class="report-row"><strong>Periodo</strong><span>${escapeHtml(formatMonthLabel(selectedMonth))}</span></div>
        <div class="report-row"><strong>Movimientos</strong><span>${movements.length}</span></div>
        <div class="report-row"><strong>Variacion mensual</strong><span>${escapeHtml(formatPercent(summary.variation))}</span></div>
      </div>
    </article>
    <article class="table-shell">
      <h3>Cuentas</h3>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Tipo</th>
              <th>Banco</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            ${accounts.map((account) => `
              <tr>
                <td>${escapeHtml(account.name)}</td>
                <td>${escapeHtml(account.typeLabel)}</td>
                <td>${escapeHtml(account.institution)}</td>
                <td>${escapeHtml(formatCurrency(account.currentBalance))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </article>
    <article class="table-shell">
      <h3>Movimientos</h3>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Concepto</th>
              <th>Categoria</th>
              <th>Cuenta</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            ${movements.length ? movements.map((transaction) => {
              const details = describeTransaction(state.snapshot, transaction);
              return `
                <tr>
                  <td>${escapeHtml(transaction.date)}</td>
                  <td>${escapeHtml(details.title)}</td>
                  <td>${escapeHtml(transaction.category)}</td>
                  <td>${escapeHtml(details.subtitle)}</td>
                  <td class="tone-${details.tone}">${escapeHtml(details.amountLabel)}</td>
                </tr>
              `;
            }).join('') : `
              <tr>
                <td colspan="5">Sin movimientos registrados en este mes.</td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderAccountDetail(refs, state) {
  const accounts = getAccountsWithBalances(state.snapshot);
  const account = accounts.find((item) => item.id === state.ui.focusAccountId);
  if (!account) {
    refs.accountDetailContent.innerHTML = `<div class="empty-card"><h3>Cuenta no disponible</h3><p>Selecciona otra cuenta desde la vista principal.</p></div>`;
    return;
  }

  const movements = getLatestTransactions(state.snapshot, 6, account.id);
  refs.accountDetailContent.innerHTML = `
    <article class="detail-hero">
      <div>
        <p class="eyebrow">${escapeHtml(account.typeLabel)}</p>
        <h3>${escapeHtml(account.name)}</h3>
        <span class="detail-meta">${escapeHtml(account.institution)} ${account.last4 ? `| **** ${escapeHtml(account.last4)}` : ''}</span>
      </div>
      <div class="account-balance ${account.currentBalance >= 0 ? 'tone-income' : 'tone-expense'}">${escapeHtml(formatCurrency(account.currentBalance))}</div>
      <div class="detail-actions">
        <button class="btn btn-success btn-small" type="button" data-action="open-income-for-account" data-account-id="${account.id}">Ingreso</button>
        <button class="btn btn-danger btn-small" type="button" data-action="open-expense-for-account" data-account-id="${account.id}">Gasto</button>
        <button class="btn btn-accent btn-small" type="button" data-action="open-transfer-from-account" data-account-id="${account.id}">Transferir</button>
      </div>
    </article>
    <div class="detail-grid">
      <div class="detail-row">
        <div>
          <span class="detail-meta">Tipo</span>
          <span class="detail-value">${escapeHtml(account.typeLabel)}</span>
        </div>
        <div>
          <span class="detail-meta">Saldo inicial</span>
          <span class="detail-value">${escapeHtml(formatCurrency(account.openingBalance))}</span>
        </div>
      </div>
      <div class="detail-row">
        <div>
          <span class="detail-meta">Credito disponible</span>
          <span class="detail-value">${escapeHtml(account.type === 'credit' ? formatCurrency(account.availableCredit) : formatCurrency(account.currentBalance))}</span>
        </div>
        <div>
          <span class="detail-meta">Limite</span>
          <span class="detail-value">${escapeHtml(account.type === 'credit' ? formatCurrency(account.creditLimit) : 'No aplica')}</span>
        </div>
      </div>
      ${account.type === 'credit' ? `
        <div class="detail-row">
          <div>
            <span class="detail-meta">Fecha de corte</span>
            <span class="detail-value">${escapeHtml(account.statementDay ? `Dia ${account.statementDay}` : 'Sin definir')}</span>
          </div>
          <div>
            <span class="detail-meta">Fecha de pago</span>
            <span class="detail-value">${escapeHtml(account.paymentDay ? `Dia ${account.paymentDay}` : 'Sin definir')}</span>
          </div>
        </div>
      ` : ''}
    </div>
    <article class="section-card">
      <div class="section-head">
        <div>
          <h3>Ultimas transacciones</h3>
          <p>Acciones rapidas sobre los movimientos de esta cuenta.</p>
        </div>
      </div>
      <div class="tx-list">
        ${movements.length ? movements.map((transaction) => buildTransactionRow(state.snapshot, transaction)).join('') : `<div class="empty-card"><h3>Sin transacciones</h3><p>Esta cuenta aun no tiene movimientos relacionados.</p></div>`}
      </div>
    </article>
    <div class="detail-actions">
      <button class="btn btn-secondary" type="button" data-action="edit-account" data-account-id="${account.id}">Editar cuenta</button>
      <button class="btn btn-danger" type="button" data-action="delete-account" data-account-id="${account.id}">Eliminar cuenta</button>
    </div>
  `;
}

function renderTransactionDetail(refs, state) {
  const transaction = state.snapshot.transactions.find((item) => item.id === state.ui.focusTransactionId);
  if (!transaction) {
    refs.transactionDetailContent.innerHTML = `<div class="empty-card"><h3>Movimiento no disponible</h3><p>Selecciona otra transaccion.</p></div>`;
    return;
  }

  const details = describeTransaction(state.snapshot, transaction);
  refs.transactionDetailContent.innerHTML = `
    <article class="detail-hero">
      <div>
        <p class="eyebrow">${escapeHtml(transaction.kind === 'income' ? 'Ingreso' : transaction.kind === 'expense' ? 'Gasto' : 'Movimiento')}</p>
        <h3>${escapeHtml(details.title)}</h3>
        <span class="detail-meta">${escapeHtml(details.subtitle)}</span>
      </div>
      <div class="account-balance tone-${details.tone}">${escapeHtml(details.amountLabel)}</div>
    </article>
    <div class="detail-grid">
      <div class="detail-row">
        <div>
          <span class="detail-meta">Fecha</span>
          <span class="detail-value">${escapeHtml(transaction.date)}</span>
        </div>
        <div>
          <span class="detail-meta">Categoria</span>
          <span class="detail-value">${escapeHtml(transaction.category)}</span>
        </div>
      </div>
      <div class="detail-row">
        <div>
          <span class="detail-meta">Estado</span>
          <span class="detail-value">${transaction.paid === false ? 'Pendiente' : 'Pagado'}</span>
        </div>
        <div>
          <span class="detail-meta">Notas</span>
          <span class="detail-value">${escapeHtml(transaction.notes || 'Sin notas')}</span>
        </div>
      </div>
    </div>
    <div class="detail-actions">
      <button class="btn btn-secondary" type="button" data-action="edit-transaction" data-transaction-id="${transaction.id}">Editar movimiento</button>
      <button class="btn btn-danger" type="button" data-action="delete-transaction" data-transaction-id="${transaction.id}">Eliminar movimiento</button>
    </div>
  `;
}

function renderPersonalization(refs, state) {
  refs.accentPalette.innerHTML = ACCENT_PALETTES.map((palette) => `
    <button class="palette-btn ${state.snapshot.settings.accent === palette.id ? 'is-active' : ''}" type="button" data-accent="${palette.id}" aria-label="${palette.label}">
      <span class="palette-swatch" style="background: linear-gradient(135deg, ${palette.primary}, ${palette.secondary});"></span>
    </button>
  `).join('');
  refs.themeSwitch.checked = state.snapshot.settings.theme === 'dark';
  [...refs.densitySelector.querySelectorAll('button')].forEach((button) => {
    button.classList.toggle('is-active', button.dataset.density === state.snapshot.settings.density);
  });
}

function renderBackup(refs, state) {
  refs.lastBackupLabel.textContent = formatBackupLabel(state.snapshot.meta.lastBackupAt);
}

function renderSecurity(refs, state) {
  refs.securityContent.innerHTML = `
    <div class="info-card">
      <strong>Cierre por inactividad</strong>
      <p>La sesion se cierra despues de ${state.snapshot.settings.inactivityMinutes} minutos sin actividad.</p>
    </div>
    <div class="info-card">
      <strong>Modo de sesion</strong>
      <p>${state.auth.mode === 'firebase' ? 'Sesion persistente con Firebase' : 'Sesion local almacenada en este dispositivo'}</p>
    </div>
    <div class="detail-actions">
      ${state.auth.cloudAvailable && state.auth.mode !== 'firebase' ? `<button class="btn btn-primary" type="button" data-action="open-auth-gate">Conectar Firebase</button>` : ''}
      <button class="btn btn-secondary" type="button" data-action="sign-out">Cerrar sesion</button>
    </div>
  `;
}

function renderDanger(refs, state) {
  const pending = state.ui.pendingDanger;
  if (!pending) {
    refs.dangerContent.innerHTML = `<div class="info-card"><strong>Sin accion pendiente</strong><p>Selecciona una accion peligrosa para confirmar.</p></div>`;
    return;
  }

  const contentByType = {
    'delete-transaction': {
      title: 'Eliminar movimiento',
      copy: 'Este registro desaparecera del dashboard y recalculara los saldos de forma automatica.',
      button: 'Eliminar movimiento'
    },
    'delete-account': {
      title: 'Eliminar cuenta',
      copy: 'La cuenta y todos los movimientos relacionados seran removidos de este proyecto.',
      button: 'Eliminar cuenta'
    },
    'delete-user': {
      title: 'Eliminar cuenta del proyecto',
      copy: 'Borrara el perfil actual, las cuentas, transacciones y respaldos locales de este dashboard.',
      button: 'Eliminar cuenta'
    }
  };

  const content = contentByType[pending.type] || contentByType['delete-user'];
  refs.dangerContent.innerHTML = `
    <div class="info-card">
      <strong>${content.title}</strong>
      <p>${content.copy}</p>
    </div>
    <div class="detail-actions">
      <button class="btn btn-secondary" type="button" data-action="close-sheet">Cancelar</button>
      <button class="btn btn-danger" type="button" data-action="confirm-danger">${content.button}</button>
    </div>
  `;
}
function renderCharts(state) {
  if (!window.Chart) {
    return;
  }

  const palette = getPalette(state.snapshot.settings.accent);
  const trendCanvas = document.getElementById('trendChart');
  const expenseCanvas = document.getElementById('expenseChart');

  if (trendChart) {
    trendChart.destroy();
    trendChart = null;
  }
  if (expenseChart) {
    expenseChart.destroy();
    expenseChart = null;
  }

  if (trendCanvas) {
    const trendSeries = getTrendSeries(state.snapshot, 6);
    const context = trendCanvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, `${palette.secondary}88`);
    gradient.addColorStop(1, `${palette.primary}08`);
    trendChart = new window.Chart(context, {
      type: 'line',
      data: {
        labels: trendSeries.map((point) => point.label),
        datasets: [{
          data: trendSeries.map((point) => point.value),
          borderColor: '#ffffff',
          backgroundColor: gradient,
          borderWidth: 3,
          fill: true,
          pointRadius: 0,
          tension: 0.38
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => formatCurrency(context.parsed.y) } } },
        scales: { x: { display: false }, y: { display: false } }
      }
    });
  }

  if (expenseCanvas) {
    const categories = getExpenseCategoryBreakdown(state.snapshot, monthKey());
    const context = expenseCanvas.getContext('2d');
    expenseChart = new window.Chart(context, {
      type: 'doughnut',
      data: {
        labels: categories.map((item) => item.label),
        datasets: [{
          data: categories.map((item) => item.value),
          backgroundColor: [palette.primary, palette.secondary, '#10b981', '#f97316', '#ec4899', '#0ea5e9'],
          borderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.label}: ${formatCurrency(context.parsed)}` } } },
        cutout: '68%'
      }
    });
  }
}

function renderHeader(refs, state) {
  const activeView = state.ui.activeView;
  if (activeView === 'home') {
    refs.headerEyebrow.textContent = 'Resumen financiero';
    refs.headerTitle.textContent = `Hola, ${firstName(state.snapshot.user.name)}`;
  }
  if (activeView === 'transactions') {
    refs.headerEyebrow.textContent = 'Historial';
    refs.headerTitle.textContent = 'Transacciones';
  }
  if (activeView === 'accounts') {
    refs.headerEyebrow.textContent = 'Cuentas';
    refs.headerTitle.textContent = 'Mis cuentas';
  }
  if (activeView === 'profile') {
    refs.headerEyebrow.textContent = 'Perfil';
    refs.headerTitle.textContent = 'Mi perfil';
  }
  refs.themeToggleText.textContent = state.snapshot.settings.theme === 'dark' ? 'Oscuro' : 'Claro';
}

function renderSelects(refs, state) {
  const accounts = getAccountsWithBalances(state.snapshot).map((account) => ({
    value: account.id,
    label: `${account.name} | ${formatCurrency(account.currentBalance)}`
  }));
  setSelectOptions(refs.expenseCategorySelect, EXPENSE_CATEGORIES.map((item) => ({ value: item, label: item })));
  setSelectOptions(refs.incomeCategorySelect, INCOME_CATEGORIES.map((item) => ({ value: item, label: item })));
  setSelectOptions(refs.expenseAccountSelect, accounts);
  setSelectOptions(refs.incomeAccountSelect, accounts);
  setSelectOptions(refs.transferFromSelect, accounts);
  setSelectOptions(refs.transferToSelect, accounts);
  setSelectOptions(refs.accountTypeSelect, ACCOUNT_TYPES.map((item) => ({ value: item.value, label: item.label })));
}

function toggleViews(refs, state) {
  refs.viewSections.forEach((section) => {
    section.classList.toggle('is-active', section.dataset.view === state.ui.activeView);
  });
  refs.tabButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === state.ui.activeView);
  });
}

function toggleSheets(refs, state) {
  SHEET_IDS.forEach((id) => {
    refs[id].classList.toggle('is-open', state.ui.activeSheet === id);
  });
  refs.sheetScrim.classList.toggle('hidden', !state.ui.activeSheet);
}

export function getRefs() {
  return {
    body: document.body,
    authShell: document.getElementById('authShell'),
    authModeBadge: document.getElementById('authModeBadge'),
    authLoginForm: document.getElementById('authLoginForm'),
    authRegisterForm: document.getElementById('authRegisterForm'),
    authTabLogin: document.getElementById('authTabLogin'),
    authTabRegister: document.getElementById('authTabRegister'),
    registerName: document.getElementById('registerName'),
    registerPhotoPreview: document.getElementById('registerPhotoPreview'),
    appShell: document.getElementById('appShell'),
    headerEyebrow: document.getElementById('headerEyebrow'),
    headerTitle: document.getElementById('headerTitle'),
    themeToggleText: document.getElementById('themeToggleText'),
    homeContent: document.getElementById('homeContent'),
    transactionsContent: document.getElementById('transactionsContent'),
    accountsContent: document.getElementById('accountsContent'),
    profileContent: document.getElementById('profileContent'),
    toastRegion: document.getElementById('toastRegion'),
    installPrompt: document.getElementById('installPrompt'),
    installButton: document.getElementById('installButton'),
    sheetScrim: document.getElementById('sheetScrim'),
    quickActionSheet: document.getElementById('quickActionSheet'),
    expenseSheet: document.getElementById('expenseSheet'),
    incomeSheet: document.getElementById('incomeSheet'),
    transferSheet: document.getElementById('transferSheet'),
    accountSheet: document.getElementById('accountSheet'),
    reportsSheet: document.getElementById('reportsSheet'),
    accountDetailSheet: document.getElementById('accountDetailSheet'),
    transactionDetailSheet: document.getElementById('transactionDetailSheet'),
    personalizationSheet: document.getElementById('personalizationSheet'),
    backupSheet: document.getElementById('backupSheet'),
    securitySheet: document.getElementById('securitySheet'),
    helpSheet: document.getElementById('helpSheet'),
    dangerSheet: document.getElementById('dangerSheet'),
    reportsSummary: document.getElementById('reportsSummary'),
    reportsTables: document.getElementById('reportsTables'),
    reportMonth: document.getElementById('reportMonth'),
    accountDetailContent: document.getElementById('accountDetailContent'),
    transactionDetailContent: document.getElementById('transactionDetailContent'),
    accentPalette: document.getElementById('accentPalette'),
    themeSwitch: document.getElementById('themeSwitch'),
    densitySelector: document.getElementById('densitySelector'),
    lastBackupLabel: document.getElementById('lastBackupLabel'),
    securityContent: document.getElementById('securityContent'),
    dangerContent: document.getElementById('dangerContent'),
    restoreBackupInput: document.getElementById('restoreBackupInput'),
    expenseForm: document.getElementById('expenseForm'),
    incomeForm: document.getElementById('incomeForm'),
    transferForm: document.getElementById('transferForm'),
    accountForm: document.getElementById('accountForm'),
    expenseCategorySelect: document.getElementById('expenseCategorySelect'),
    incomeCategorySelect: document.getElementById('incomeCategorySelect'),
    expenseAccountSelect: document.getElementById('expenseAccountSelect'),
    incomeAccountSelect: document.getElementById('incomeAccountSelect'),
    transferFromSelect: document.getElementById('transferFromSelect'),
    transferToSelect: document.getElementById('transferToSelect'),
    accountTypeSelect: document.getElementById('accountTypeSelect'),
    viewSections: [...document.querySelectorAll('.view')],
    tabButtons: [...document.querySelectorAll('.tab-btn[data-view]')]
  };
}

export function showToast(refs, message, tone = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  refs.toastRegion.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

export function renderApp(refs, state) {
  applyTheme(state, refs);
  refs.authModeBadge.textContent = state.auth.cloudAvailable ? 'Firebase listo para proyecto nuevo' : 'Modo local activo';
  refs.authShell.classList.toggle('hidden', state.sessionActive && !state.ui.authPromptOpen);
  refs.appShell.classList.toggle('hidden', !state.sessionActive);
  refs.installPrompt.classList.toggle('hidden', !state.ui.installPromptEvent);
  renderAuthPanels(refs, state);
  renderHeader(refs, state);
  toggleViews(refs, state);
  renderSelects(refs, state);
  renderHome(refs, state);
  renderTransactions(refs, state);
  renderAccounts(refs, state);
  renderProfile(refs, state);
  renderReports(refs, state);
  renderAccountDetail(refs, state);
  renderTransactionDetail(refs, state);
  renderPersonalization(refs, state);
  renderBackup(refs, state);
  renderSecurity(refs, state);
  renderDanger(refs, state);
  toggleSheets(refs, state);
}


