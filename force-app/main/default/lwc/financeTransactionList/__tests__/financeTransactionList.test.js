import { createElement } from 'lwc';
import FinanceTransactionList from 'c/financeTransactionList';
import getTransactions from '@salesforce/apex/FinanceController.getTransactions';
import deleteTransaction from '@salesforce/apex/FinanceController.deleteTransaction';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';

jest.mock('@salesforce/apex/FinanceController.getTransactions', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/FinanceController.deleteTransaction', () => ({ default: jest.fn() }), { virtual: true });

const PICKLIST = {
    controllerValues: { Income: 0, Expense: 1 },
    values: [
        { label: 'Salary', value: 'Salary', validFor: [0] },
        { label: 'Food', value: 'Food', validFor: [1] },
        { label: 'Travel', value: 'Travel', validFor: [1] }
    ]
};

const RECORDS = [
    {
        Id: 'a01', Type__c: 'Income', Category__c: 'Salary', Amount__c: 3100, Currency__c: 'AUD',
        Amount_AUD__c: 3100, Date__c: '2026-09-25', Description__c: 'Payday', Recurrence__c: 'Fortnightly'
    },
    {
        Id: 'a02', Type__c: 'Expense', Category__c: 'Travel', Amount__c: 85000, Currency__c: 'ARS',
        Exchange_Rate__c: 0.00094, Amount_AUD__c: 79.9, Date__c: '2026-09-20', Description__c: null, Recurrence__c: 'None'
    }
];

function page(records, totalCount) {
    return { records, totalCount: totalCount === undefined ? records.length : totalCount };
}

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));
const flushDebounce = () => new Promise(resolve => setTimeout(resolve, 350));
const flushMicrotasks = async () => {
    for (let i = 0; i < 10; i++) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
    }
};

async function renderList() {
    const element = createElement('c-finance-transaction-list', { is: FinanceTransactionList });
    element.month = 9;
    element.year = 2026;
    document.body.appendChild(element);
    getObjectInfo.emit({ defaultRecordTypeId: '012000000000000AAA' });
    getPicklistValues.emit(PICKLIST);
    await flushPromises();
    return element;
}

describe('c-finance-transaction-list', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    it('loads the month once even though month and year are both set', async () => {
        getTransactions.mockResolvedValue(page(RECORDS));

        await renderList();

        expect(getTransactions).toHaveBeenCalledTimes(1);
        expect(getTransactions).toHaveBeenCalledWith({
            month: 9, year: 2026, searchTerm: '', typeFilter: '', categoryFilter: '', pageNumber: 1
        });
    });

    it('shows original amounts, the AUD equivalent for foreign currencies, and recurring badges', async () => {
        getTransactions.mockResolvedValue(page(RECORDS));

        const element = await renderList();

        const rows = element.shadowRoot.querySelectorAll('.txn-item');
        expect(rows).toHaveLength(2);
        expect(rows[0].querySelector('.txn-amount').textContent).toBe('+A$3,100.00');
        expect(rows[0].querySelector('.recurring-pill').textContent).toContain('Repeats fortnightly');
        expect(rows[0].querySelector('.txn-aud')).toBeNull();
        expect(rows[1].querySelector('.txn-label').textContent).toBe('Travel');
        expect(rows[1].querySelector('.txn-amount').textContent).toBe('-AR$85,000.00');
        expect(rows[1].querySelector('.txn-aud').textContent).toBe('≈ A$79.90');
        expect(element.shadowRoot.querySelector('.count-badge').textContent).toBe('2');
    });

    it('debounces the search box and reloads from page 1', async () => {
        getTransactions.mockResolvedValue(page(RECORDS));
        const element = await renderList();

        const search = element.shadowRoot.querySelector('.search-input');
        search.value = 'pay';
        search.dispatchEvent(new CustomEvent('input'));
        search.value = 'payday';
        search.dispatchEvent(new CustomEvent('input'));
        await flushDebounce();

        expect(getTransactions).toHaveBeenCalledTimes(2);
        expect(getTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ searchTerm: 'payday', pageNumber: 1 }));
    });

    it('limits category options to the chosen type and clears an incompatible category', async () => {
        getTransactions.mockResolvedValue(page(RECORDS));
        const element = await renderList();

        const categoryFilter = element.shadowRoot.querySelector('.category-filter');
        categoryFilter.dispatchEvent(new CustomEvent('change', { detail: { value: 'Salary' } }));
        await flushPromises();

        element.shadowRoot.querySelector('.type-filter').dispatchEvent(new CustomEvent('change', { detail: { value: 'Expense' } }));
        await flushPromises();

        expect(categoryFilter.options.map(o => o.value)).toEqual(['', 'Food', 'Travel']);
        expect(getTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ typeFilter: 'Expense', categoryFilter: '' }));
    });

    it('paginates 15 per page', async () => {
        getTransactions.mockResolvedValue(page(RECORDS, 20));
        const element = await renderList();

        expect(element.shadowRoot.querySelector('.pagination-label').textContent).toBe('Page 1 of 2');
        const [previous, next] = element.shadowRoot.querySelectorAll('.pagination-btn');
        expect(previous.disabled).toBe(true);

        next.click();
        await flushPromises();

        expect(getTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ pageNumber: 2 }));
        expect(element.shadowRoot.querySelector('.pagination-label').textContent).toBe('Page 2 of 2');
    });

    it('ignores a slow response for a month the user already navigated away from', async () => {
        let resolveSeptember;
        getTransactions
            .mockReturnValueOnce(new Promise(resolve => { resolveSeptember = resolve; }))
            .mockResolvedValueOnce(page([RECORDS[1]]));
        const element = await renderList();

        element.month = 10;
        await flushPromises();
        resolveSeptember(page(RECORDS));
        await flushPromises();

        expect(element.shadowRoot.querySelectorAll('.txn-item')).toHaveLength(1);
    });

    it('asks the parent to edit the clicked transaction', async () => {
        getTransactions.mockResolvedValue(page(RECORDS));
        const element = await renderList();
        const handler = jest.fn();
        element.addEventListener('edittransaction', handler);

        element.shadowRoot.querySelectorAll('.edit-button')[1].click();

        expect(handler.mock.calls[0][0].detail.transaction.Id).toBe('a02');
    });

    it('hides a deleted row behind an undo bar, and Undo brings it back without deleting', async () => {
        getTransactions.mockResolvedValue(page(RECORDS));
        const element = await renderList();

        element.shadowRoot.querySelector('.delete-button').click();
        await flushPromises();

        expect(element.shadowRoot.querySelectorAll('.txn-item')).toHaveLength(1);
        expect(element.shadowRoot.querySelector('.undo-bar__text').textContent).toBe('Deleted Payday (+A$3,100.00)');
        expect(element.shadowRoot.querySelector('.count-badge').textContent).toBe('1');

        element.shadowRoot.querySelector('.undo-bar__btn').click();
        await flushPromises();

        expect(element.shadowRoot.querySelectorAll('.txn-item')).toHaveLength(2);
        expect(deleteTransaction).not.toHaveBeenCalled();
    });

    it('deletes on the server after the undo window and tells the parent', async () => {
        getTransactions.mockResolvedValue(page(RECORDS));
        deleteTransaction.mockResolvedValue();
        const element = await renderList();
        const changed = jest.fn();
        element.addEventListener('transactionschanged', changed);

        jest.useFakeTimers();
        element.shadowRoot.querySelector('.delete-button').click();
        jest.advanceTimersByTime(5000);
        await flushMicrotasks();

        expect(deleteTransaction).toHaveBeenCalledWith({ transactionId: 'a01' });
        expect(changed).toHaveBeenCalled();
    });

    it('explains an empty result differently when filters are applied', async () => {
        getTransactions.mockResolvedValue(page([]));
        const element = await renderList();

        expect(element.shadowRoot.querySelector('.empty-state').textContent).toContain('No transactions this month.');

        element.shadowRoot.querySelector('.type-filter').dispatchEvent(new CustomEvent('change', { detail: { value: 'Income' } }));
        await flushPromises();

        expect(element.shadowRoot.querySelector('.empty-state').textContent).toContain('No transactions match your filters.');
    });
});
