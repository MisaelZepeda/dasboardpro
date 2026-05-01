import {
  describeTransaction,
  formatCurrency,
  formatDateLabel,
  formatMonthLabel,
  getAccountStatementRows,
  getAccountsWithBalances,
  getMonthlySummary,
  getTransactionsForMonth
} from './data.js';

export function exportMonthlyReport(snapshot, selectedMonth) {
  if (!window.jspdf?.jsPDF) {
    throw new Error('jsPDF no esta disponible.');
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const summary = getMonthlySummary(snapshot, selectedMonth);
  const accounts = getAccountsWithBalances(snapshot);
  const transactions = getTransactionsForMonth(snapshot, selectedMonth);

  doc.setFillColor(38, 103, 255);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 110, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text('Dashboard Pro', 42, 52);
  doc.setFontSize(12);
  doc.text('Estado de cuenta personal', 42, 74);
  doc.text(`Periodo: ${formatMonthLabel(selectedMonth)}`, 42, 92);

  doc.setTextColor(17, 24, 39);
  doc.setFontSize(12);
  doc.text(`Usuario: ${snapshot.user.name}`, 42, 138);
  doc.text(`Correo: ${snapshot.user.email}`, 42, 156);

  doc.autoTable({
    startY: 184,
    theme: 'plain',
    head: [['Indicador', 'Valor']],
    body: [
      ['Ingresos', formatCurrency(summary.incomes)],
      ['Gastos', formatCurrency(summary.expenses)],
      ['Balance neto', formatCurrency(summary.net)],
      ['Patrimonio final', formatCurrency(summary.patrimony)]
    ],
    styles: { cellPadding: 10, fontSize: 11, textColor: [17, 24, 39] },
    headStyles: { fillColor: [238, 243, 255], textColor: [38, 103, 255], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } }
  });

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 24,
    head: [['Cuenta', 'Tipo', 'Banco', 'Saldo', 'Ultimos digitos']],
    body: accounts.map((account) => [
      account.name,
      account.typeLabel,
      account.institution,
      formatCurrency(account.currentBalance),
      account.last4 || '-'
    ]),
    styles: { cellPadding: 9, fontSize: 10 },
    headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255] },
    columnStyles: { 3: { halign: 'right' } }
  });

  const movementRows = transactions.length
    ? transactions.map((transaction) => {
        const details = describeTransaction(snapshot, transaction);
        return [
          formatDateLabel(transaction.date, true),
          details.title,
          transaction.category,
          details.subtitle,
          details.amountLabel
        ];
      })
    : [['-', 'Sin movimientos en el periodo', '-', '-', '-']];

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 24,
    head: [['Fecha', 'Concepto', 'Categoria', 'Cuenta', 'Monto']],
    body: movementRows,
    styles: { cellPadding: 9, fontSize: 10 },
    headStyles: { fillColor: [38, 103, 255], textColor: [255, 255, 255] },
    columnStyles: { 4: { halign: 'right' } }
  });

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text('Generado por Dashboard Pro', 42, doc.internal.pageSize.getHeight() - 28);

  const fileName = `DashboardPro_EstadoCuenta_${selectedMonth}.pdf`;
  doc.save(fileName);
  return fileName;
}
