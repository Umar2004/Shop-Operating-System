/**
 * Get decimal places from settings or default to 2
 */
let decimalPlaces = 2;

/**
 * Initialize decimal places from settings
 * Call this when settings are loaded
 */
export function setDecimalPlaces(decimals) {
  decimalPlaces = parseInt(decimals, 10) || 2;
  // Clamp to minimum of 1
  if (decimalPlaces < 1) decimalPlaces = 1;
}

/**
 * Get current decimal places
 */
export function getDecimalPlaces() {
  return decimalPlaces;
}

/**
 * Format a number with the configured decimal places
 * @param {number} value - The number to format
 * @param {number} customDecimals - Optional custom decimal places (overrides setting)
 * @returns {string} Formatted number string
 */
export function formatNumber(value, customDecimals = null) {
  const decimals = customDecimals !== null ? customDecimals : decimalPlaces;
  if (value === null || value === undefined || isNaN(value)) {
    return '0.' + '0'.repeat(decimals);
  }
  return parseFloat(value).toFixed(decimals);
}

/**
 * Format currency with the configured decimal places
 * @param {number} value - The amount to format
 * @param {string} currency - Currency symbol (default: 'Rs')
 * @param {number} customDecimals - Optional custom decimal places
 * @returns {string} Formatted currency string
 */
export function formatCurrency(value, currency = 'Rs', customDecimals = null) {
  const formatted = formatNumber(value, customDecimals);
  return `${currency} ${formatted}`;
}

/**
 * Format percentage with the configured decimal places
 * @param {number} value - The percentage value (0-100)
 * @param {number} customDecimals - Optional custom decimal places
 * @returns {string} Formatted percentage string
 */
export function formatPercentage(value, customDecimals = null) {
  const formatted = formatNumber(value, customDecimals);
  return `${formatted}%`;
}

/**
 * Get the step value for number inputs based on decimal places
 * @param {number} customDecimals - Optional custom decimal places
 * @returns {number} Step value (0.01, 0.001, 0.0001, etc.)
 */
export function getInputStep(customDecimals = null) {
  const decimals = customDecimals !== null ? customDecimals : decimalPlaces;
  return Math.pow(10, -decimals);
}

/**
 * Get the minimum value for number inputs based on decimal places
 * @param {number} customDecimals - Optional custom decimal places
 * @returns {number} Minimum value (0.01, 0.001, 0.0001, etc.)
 */
export function getInputMin(customDecimals = null) {
  return getInputStep(customDecimals);
}

/**
 * Format a date string to a readable format
 * @param {string} dateString - ISO date string or SQLite datetime string (YYYY-MM-DD HH:MM:SS)
 * @returns {string} Formatted date string
 */
export function formatDate(dateString) {
  if (!dateString) return '';
  
  // Handle SQLite datetime format (YYYY-MM-DD HH:MM:SS) - treat as local time
  // If it's already ISO format with timezone, use it as-is
  let date;
  if (dateString.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
    // SQLite format without timezone - treat as local time
    date = new Date(dateString.replace(' ', 'T'));
  } else {
    // ISO format or other - parse normally
    date = new Date(dateString);
  }
  
  // Check if date is valid
  if (isNaN(date.getTime())) {
    return dateString; // Return original if invalid
  }
  
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}