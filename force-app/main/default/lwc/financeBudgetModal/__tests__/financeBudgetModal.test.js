import { createElement } from 'lwc';
import FinanceBudgetModal from 'c/financeBudgetModal';
import getBudgets from '@salesforce/apex/FinanceController.getBudgets';
import saveBudgets from '@salesforce/apex/FinanceController.saveBudgets';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';

jest.mock('@salesforce/apex/FinanceController.getBudgets', () => ({ default: jest.fn() }), { virtual: true });
jest.mock('@salesforce/apex/FinanceController.saveBudgets', () => ({ default: jest.fn() }), { virtual: true });

const PICKLIST = {
    controllerValues: { Income: 0, Expense: 1 },
    values: [
        { label: 'Salary', value: 'Salary', validFor: [0] },
        { label: 'Food', value: 'Food', validFor: [1] },
        { label: 'Travel', value: 'Travel', validFor: [1] }
    ]
};

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

async function openModal() {
    const element = createElement('c-finance-budget-modal', { is: FinanceBudgetModal });
    document.body.appendChild(element);
    getObjectInfo.emit({ defaultRecordTypeId: '012000000000000AAA' });
    getPicklistValues.emit(PICKLIST);
    element.open();
    await flushPromises();
    return element;
}

describe('c-finance-budget-modal', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('lists only expense categories, prefilled with existing limits', async () => {
        getBudgets.mockResolvedValue([{ category: 'Food', monthlyLimit: 700 }]);

        const element = await openModal();

        const inputs = [...element.shadowRoot.querySelectorAll('.budget-input')];
        expect(inputs.map(input => input.dataset.category)).toEqual(['Food', 'Travel']);
        expect(inputs[0].value).toBe('700');
        expect(inputs[1].value).toBe('');
        expect(element.shadowRoot.querySelector('.total-row__value').textContent).toBe('A$700.00');
    });

    it('saves every expense category, sending blanks as "no budget"', async () => {
        getBudgets.mockResolvedValue([{ category: 'Food', monthlyLimit: 700 }]);
        saveBudgets.mockResolvedValue();
        const element = await openModal();
        const saved = jest.fn();
        element.addEventListener('saved', saved);

        const [food, travel] = element.shadowRoot.querySelectorAll('.budget-input');
        food.value = '';
        food.dispatchEvent(new CustomEvent('change'));
        travel.value = '500';
        travel.dispatchEvent(new CustomEvent('change'));
        element.shadowRoot.querySelector('.save-budgets').click();
        await flushPromises();

        expect(saveBudgets).toHaveBeenCalledWith({
            budgets: [{ category: 'Food', monthlyLimit: null }, { category: 'Travel', monthlyLimit: 500 }]
        });
        expect(saved).toHaveBeenCalled();
        expect(element.shadowRoot.querySelector('.modal')).toBeNull();
    });

    it('rejects negative amounts without calling Apex', async () => {
        getBudgets.mockResolvedValue([]);
        const element = await openModal();

        const food = element.shadowRoot.querySelector('.budget-input');
        food.value = '-5';
        food.dispatchEvent(new CustomEvent('change'));
        element.shadowRoot.querySelector('.save-budgets').click();
        await flushPromises();

        expect(saveBudgets).not.toHaveBeenCalled();
        expect(element.shadowRoot.querySelector('.budget-error').textContent).toContain('positive');
    });
});
