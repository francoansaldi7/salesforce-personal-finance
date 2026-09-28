import { createElement } from 'lwc';
import FinanceTransactionModal from 'c/financeTransactionModal';
import saveTransaction from '@salesforce/apex/FinanceController.saveTransaction';
import getExchangeRate from '@salesforce/apex/FinanceController.getExchangeRate';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';

jest.mock('@salesforce/apex/FinanceController.saveTransaction', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/FinanceController.getExchangeRate', () => ({ default: jest.fn() }), { virtual: true });

const PICKLIST = {
    controllerValues: { Income: 0, Expense: 1 },
    values: [
        { label: 'Salary', value: 'Salary', validFor: [0] },
        { label: 'Freelance', value: 'Freelance', validFor: [0] },
        { label: 'Food', value: 'Food', validFor: [1] },
        { label: 'Technology', value: 'Technology', validFor: [1] }
    ]
};

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

async function renderModal() {
    const element = createElement('c-finance-transaction-modal', { is: FinanceTransactionModal });
    document.body.appendChild(element);
    getObjectInfo.emit({ defaultRecordTypeId: '012000000000000AAA' });
    getPicklistValues.emit(PICKLIST);
    await flushPromises();
    return element;
}

const $ = (element, selector) => element.shadowRoot.querySelector(selector);

function setInput(element, selector, value) {
    const input = $(element, selector);
    input.value = value;
    input.dispatchEvent(new CustomEvent('change'));
}

function pick(element, selector, value) {
    $(element, selector).dispatchEvent(new CustomEvent('change', { detail: { value } }));
}

describe('c-finance-transaction-modal', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('is closed until opened, then shows a new expense in AUD on the given date', async () => {
        const element = await renderModal();
        expect($(element, '.modal')).toBeNull();

        element.openForNew('Expense', '2026-09-01');
        await flushPromises();

        expect($(element, '.modal__title').textContent).toBe('New Transaction');
        expect($(element, '.type-btn--expense')).not.toBeNull();
        expect($(element, '.date-input').value).toBe('2026-09-01');
        expect($(element, '.currency-input').value).toBe('AUD');
        expect($(element, '.rate-input')).toBeNull();
    });

    it('offers only the categories that belong to the selected type', async () => {
        const element = await renderModal();
        element.openForNew('Expense');
        await flushPromises();
        expect($(element, '.category-input').options.map(o => o.value)).toEqual(['Food', 'Technology']);

        element.shadowRoot.querySelector('[data-type="Income"]').click();
        await flushPromises();

        expect($(element, '.category-input').options.map(o => o.value)).toEqual(['Salary', 'Freelance']);
    });

    it('validates required fields before calling Apex', async () => {
        const element = await renderModal();
        element.openForNew('Expense');
        await flushPromises();

        $(element, '.btn-save').click();
        await flushPromises();

        const errors = [...element.shadowRoot.querySelectorAll('.form-error')].map(e => e.textContent);
        expect(errors).toEqual(['Amount must be greater than zero.', 'Choose a category.']);
        expect(saveTransaction).not.toHaveBeenCalled();
    });

    it('prefills the live rate for a foreign currency and previews the AUD amount', async () => {
        getExchangeRate.mockResolvedValue(1.4258);
        const element = await renderModal();
        element.openForNew('Expense');
        await flushPromises();

        setInput(element, '.amount-input', '20');
        pick(element, '.currency-input', 'USD');
        await flushPromises();

        expect(getExchangeRate).toHaveBeenCalledWith({ currencyCode: 'USD' });
        expect($(element, '.rate-input').value).toBe('1.4258');
        expect($(element, '.rate-hint').textContent).toBe('1 USD = A$1.4258 · live rate');
        expect($(element, '.aud-preview').textContent).toBe('≈ A$28.52');
    });

    it('asks for a manual rate when the live rate is unavailable', async () => {
        getExchangeRate.mockRejectedValue({ body: { message: 'Could not fetch the live exchange rate. Please enter it manually.' } });
        const element = await renderModal();
        element.openForNew('Expense');
        await flushPromises();

        setInput(element, '.amount-input', '85000');
        pick(element, '.category-input', 'Food');
        pick(element, '.currency-input', 'ARS');
        await flushPromises();
        expect($(element, '.rate-error').textContent).toContain('Please enter it manually');

        $(element, '.btn-save').click();
        await flushPromises();
        expect(saveTransaction).not.toHaveBeenCalled();

        setInput(element, '.rate-input', '0.00094');
        await flushPromises();
        expect($(element, '.rate-hint').textContent).toBe('1 ARS = A$0.00094 · edited');
    });

    it('saves the transaction, closes, and tells the parent which date it landed on', async () => {
        getExchangeRate.mockResolvedValue(1.5);
        saveTransaction.mockResolvedValue('a0X');
        const element = await renderModal();
        const saved = jest.fn();
        element.addEventListener('saved', saved);
        element.openForNew('Expense', '2026-09-10');
        await flushPromises();

        setInput(element, '.amount-input', '20');
        pick(element, '.currency-input', 'USD');
        pick(element, '.category-input', 'Technology');
        setInput(element, '.description-input', 'Figma');
        pick(element, '.recurrence-input', 'Monthly');
        await flushPromises();
        $(element, '.btn-save').click();
        await flushPromises();

        expect(saveTransaction).toHaveBeenCalledWith({
            input: {
                id: null, type: 'Expense', category: 'Technology', amount: 20, currencyCode: 'USD',
                exchangeRate: 1.5, transactionDate: '2026-09-10', description: 'Figma', recurrence: 'Monthly'
            }
        });
        expect(saved.mock.calls[0][0].detail).toEqual({ transactionDate: '2026-09-10', isNew: true });
        expect($(element, '.modal')).toBeNull();
    });

    it('prefills an existing transaction for editing and keeps its locked-in rate', async () => {
        saveTransaction.mockResolvedValue('a02');
        const element = await renderModal();
        element.openForEdit({
            Id: 'a02', Type__c: 'Expense', Category__c: 'Food', Amount__c: 85000, Currency__c: 'ARS',
            Exchange_Rate__c: 0.00094, Date__c: '2026-07-14', Description__c: 'Asado', Recurrence__c: 'None'
        });
        await flushPromises();

        expect($(element, '.modal__title').textContent).toBe('Edit Transaction');
        expect($(element, '.rate-hint').textContent).toBe('1 ARS = A$0.00094 · rate locked in when saved');
        expect(getExchangeRate).not.toHaveBeenCalled();

        $(element, '.btn-save').click();
        await flushPromises();

        expect(saveTransaction.mock.calls[0][0].input).toEqual(expect.objectContaining({ id: 'a02', exchangeRate: 0.00094 }));
    });

    it('closes on Escape', async () => {
        const element = await renderModal();
        element.openForNew('Income');
        await flushPromises();

        $(element, '.amount-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await flushPromises();

        expect($(element, '.modal')).toBeNull();
    });
});
