/**
 * Export data to CSV format
 * @param {Array<string>} headers - Column headers
 * @param {Array<Array>} rows - Data rows
 * @param {string} filename - Output filename
 */
export function exportToCSV(headers, rows, filename = 'export.csv') {
  // Create CSV content: 0 stays 0 (only null/undefined are blank), text Excel would run as a formula
  // (starting with = + - @) is prefixed with ' so it stays text, and commas/quotes/new lines are quoted
  const toCell = (cell) => {
    if (cell === null || cell === undefined) return '';
    if (typeof cell === 'number') return String(cell);
    let cellStr = String(cell);
    if (/^[=+\-@\t\r]/.test(cellStr)) cellStr = `'${cellStr}`;
    if (/[",\r\n]/.test(cellStr)) {
      return `"${cellStr.replace(/"/g, '""')}"`;
    }
    return cellStr;
  };
  const csvContent = [headers.map(toCell).join(','), ...rows.map((row) => row.map(toCell).join(','))].join('\r\n');

  // Create blob and download. The byte-order mark tells Excel the file is UTF-8, so non-English names show correctly
  const blob = new Blob(['﻿', csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format date range for filename
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {string} Formatted date string
 */
export function formatDateRangeForFilename(startDate, endDate) {
  if (!startDate || !endDate) return 'all-time';
  return `${startDate}_to_${endDate}`;
}

/**
 * Generate export filename with filters
 * @param {string} reportType - Type of report (e.g., 'sales', 'products')
 * @param {Object} filters - Filter object
 * @returns {string} Filename
 */
export function generateExportFilename(reportType, filters = {}) {
  const dateRange = formatDateRangeForFilename(filters.startDate, filters.endDate);
  const timestamp = new Date().toISOString().slice(0, 10);
  return `${reportType}-report-${dateRange}-${timestamp}.csv`;
}
