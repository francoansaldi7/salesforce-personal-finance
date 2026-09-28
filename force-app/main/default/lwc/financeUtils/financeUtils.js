export const BASE_CURRENCY = 'AUD';
export const TYPE_INCOME = 'Income';
export const TYPE_EXPENSE = 'Expense';
export const PAGE_SIZE = 15;

export const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];
export const MONTH_SHORT = MONTH_NAMES.map(name => name.slice(0, 3));

const CURRENCIES = [
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    { code: 'USD', symbol: 'US$', name: 'US Dollar' },
    { code: 'UYU', symbol: '$U', name: 'Uruguayan Peso' },
    { code: 'ARS', symbol: 'AR$', name: 'Argentine Peso' }
];

export const CURRENCY_OPTIONS = CURRENCIES.map(c => ({ label: `${c.code} — ${c.name}`, value: c.code }));

export const RECURRENCE_OPTIONS = [
    { label: 'Does not repeat', value: 'None' },
    { label: 'Weekly', value: 'Weekly' },
    { label: 'Fortnightly', value: 'Fortnightly' },
    { label: 'Monthly', value: 'Monthly' }
];

export function formatMoney(value, currencyCode = BASE_CURRENCY) {
    const amount = Number(value) || 0;
    const currency = CURRENCIES.find(c => c.code === currencyCode);
    const symbol = currency ? currency.symbol : `${currencyCode} `;
    const digits = Math.abs(amount).toLocaleString('en-AU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    return `${amount < 0 ? '-' : ''}${symbol}${digits}`;
}

export function formatRate(rate) {
    return Number(rate).toPrecision(5).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/** 'YYYY-MM-DD' → '28 Sep 2026' */
export function formatDate(isoDate) {
    if (!isoDate) {
        return '';
    }
    const [year, month, day] = isoDate.split('-').map(Number);
    return `${day} ${MONTH_SHORT[month - 1]} ${year}`;
}

export function toIsoDate(date) {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${mm}-${dd}`;
}

/**
 * Category__c is a dependent picklist controlled by Type__c. Given the getPicklistValues
 * payload, returns combobox options for one type, or every category when no type is given.
 */
export function categoriesForType(picklistData, type) {
    if (!picklistData) {
        return [];
    }
    const controllerIndex = type ? picklistData.controllerValues[type] : undefined;
    return picklistData.values
        .filter(entry => controllerIndex === undefined || entry.validFor.includes(controllerIndex))
        .map(entry => ({ label: entry.label, value: entry.value }));
}

export function errorMessage(error, fallback) {
    return error?.body?.message || error?.message || fallback;
}
