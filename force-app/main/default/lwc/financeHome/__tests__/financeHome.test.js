import { createElement } from 'lwc';
import FinanceHome from 'c/financeHome';
import getDashboard from '@salesforce/apex/FinanceController.getDashboard';
import materializeDueRecurrences from '@salesforce/apex/FinanceController.materializeDueRecurrences';
import getTransactions from '@salesforce/apex/FinanceController.getTransactions';
import { getRecord } from 'lightning/uiRecordApi';

jest.mock('@salesforce/apex/FinanceController.getDashboard', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/FinanceController.materializeDueRecurrences', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/FinanceController.getTransactions', () => ({ default: jest.fn() }), { virtual: true });

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function dashboard(overrides = {}) {
    return {
        month: { income: 6200, expenses: 4100, balance: 2100, savingsRate: 33.9 },
        annualBalance: 15250,
        categories: [],
        currencyMix: [],
        trend: [],
        ...overrides
    };
}

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));
const $ = (element, selector) => element.shadowRoot.querySelector(selector);

async function renderHome() {
    const element = createElement('c-finance-home', { is: FinanceHome });
    document.body.appendChild(element);
    await flushPromises();
    return element;
}

function labelFor(monthOffset) {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() + monthOffset);
    return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

describe('c-finance-home', () => {
    beforeEach(() => {
        materializeDueRecurrences.mockResolvedValue(0);
        getDashboard.mockResolvedValue(dashboard());
        getTransactions.mockResolvedValue({ records: [], totalCount: 0 });
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('creates due recurring transactions before loading the current month', async () => {
        const element = await renderHome();

        const now = new Date();
        expect(materializeDueRecurrences.mock.invocationCallOrder[0]).toBeLessThan(getDashboard.mock.invocationCallOrder[0]);
        expect(getDashboard).toHaveBeenCalledWith({ month: now.getMonth() + 1, year: now.getFullYear() });
        expect($(element, '.nav-month').textContent).toBe(labelFor(0));
        expect($(element, '.today-btn')).toBeNull();
    });

    it('still loads the dashboard if creating recurring transactions fails', async () => {
        materializeDueRecurrences.mockRejectedValue({ body: { message: 'boom' } });

        await renderHome();

        expect(getDashboard).toHaveBeenCalled();
    });

    it('greets the user by first name and shows monthly and annual balances', async () => {
        const element = await renderHome();
        getRecord.emit({ fields: { FirstName: { value: 'Franco' } } });
        await flushPromises();

        expect($(element, '.fin-header__subtitle').textContent).toBe('Welcome back, Franco');
        const balances = element.shadowRoot.querySelectorAll('.header-balance');
        expect(balances[0].textContent).toBe('A$2,100.00');
        expect(balances[1].textContent).toBe('A$15,250.00');
    });

    it('navigates back a month and offers a shortcut back to this month', async () => {
        const element = await renderHome();

        $(element, '.prev-month').click();
        await flushPromises();

        expect($(element, '.nav-month').textContent).toBe(labelFor(-1));
        expect(getDashboard).toHaveBeenCalledTimes(2);

        $(element, '.today-btn').click();
        await flushPromises();
        expect($(element, '.nav-month').textContent).toBe(labelFor(0));
    });

    it('allows planning up to 12 months ahead, flagging future months as planned', async () => {
        const element = await renderHome();
        expect($(element, '.planned-badge')).toBeNull();

        for (let i = 0; i < 12; i++) {
            $(element, '.next-month').click();
            // eslint-disable-next-line no-await-in-loop
            await flushPromises();
        }

        expect($(element, '.nav-month').textContent).toBe(labelFor(12));
        expect($(element, '.planned-badge')).not.toBeNull();
        expect($(element, '.next-month').disabled).toBe(true);
    });

    it('ignores a slow dashboard response for a month the user already left', async () => {
        const element = await renderHome();
        let resolveOld;
        getDashboard
            .mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
            .mockResolvedValueOnce(dashboard({ month: { income: 0, expenses: 0, balance: -50, savingsRate: 0 } }));

        $(element, '.prev-month').click();
        $(element, '.prev-month').click();
        await flushPromises();
        resolveOld(dashboard({ month: { income: 0, expenses: 0, balance: 999, savingsRate: 0 } }));
        await flushPromises();

        expect(element.shadowRoot.querySelectorAll('.header-balance')[0].textContent).toBe('-A$50.00');
    });

    it('jumps to the month a transaction was saved in', async () => {
        const element = await renderHome();

        const modal = $(element, 'c-finance-transaction-modal');
        const target = new Date();
        target.setDate(1);
        target.setMonth(target.getMonth() - 3);
        const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-15`;
        modal.dispatchEvent(new CustomEvent('saved', { detail: { transactionDate: iso, isNew: true } }));
        await flushPromises();

        expect($(element, '.nav-month').textContent).toBe(labelFor(-3));
        expect(getDashboard).toHaveBeenLastCalledWith({ month: target.getMonth() + 1, year: target.getFullYear() });
    });
});
