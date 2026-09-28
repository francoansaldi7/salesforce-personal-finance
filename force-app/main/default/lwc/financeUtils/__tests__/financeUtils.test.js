import { categoriesForType, errorMessage, formatDate, formatMoney, formatRate, toIsoDate } from 'c/financeUtils';

const PICKLIST = {
    controllerValues: { Income: 0, Expense: 1 },
    values: [
        { label: 'Salary', value: 'Salary', validFor: [0] },
        { label: 'Food', value: 'Food', validFor: [1] },
        { label: 'Travel', value: 'Travel', validFor: [1] }
    ]
};

describe('financeUtils', () => {
    it('formats money with the currency symbol, thousands separators and sign', () => {
        expect(formatMoney(1250)).toBe('A$1,250.00');
        expect(formatMoney(-42.5)).toBe('-A$42.50');
        expect(formatMoney(85000, 'ARS')).toBe('AR$85,000.00');
        expect(formatMoney(15, 'USD')).toBe('US$15.00');
        expect(formatMoney(9800, 'UYU')).toBe('$U9,800.00');
        expect(formatMoney(undefined)).toBe('A$0.00');
    });

    it('formats exchange rates with five significant digits and no trailing zeros', () => {
        expect(formatRate(1.425788)).toBe('1.4258');
        expect(formatRate(0.000935)).toBe('0.000935');
        expect(formatRate(1)).toBe('1');
    });

    it('formats and builds ISO dates', () => {
        expect(formatDate('2026-09-28')).toBe('28 Sep 2026');
        expect(formatDate(null)).toBe('');
        expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    });

    it('filters dependent categories by type, or returns all without a type', () => {
        expect(categoriesForType(PICKLIST, 'Income').map(o => o.value)).toEqual(['Salary']);
        expect(categoriesForType(PICKLIST, 'Expense').map(o => o.value)).toEqual(['Food', 'Travel']);
        expect(categoriesForType(PICKLIST, '')).toHaveLength(3);
        expect(categoriesForType(undefined, 'Income')).toEqual([]);
    });

    it('extracts Apex error messages with a fallback', () => {
        expect(errorMessage({ body: { message: 'Transaction not found.' } }, 'x')).toBe('Transaction not found.');
        expect(errorMessage({}, 'Fallback')).toBe('Fallback');
    });
});
