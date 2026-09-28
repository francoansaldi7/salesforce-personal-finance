import { createElement } from 'lwc';
import FinanceCategoryBreakdown from 'c/financeCategoryBreakdown';

const CATEGORIES = [
    { category: 'Travel', total: 150, pct: 100, budget: 100, budgetPct: 150, budgetStatus: 'over' },
    { category: 'Food', total: 90, pct: 60, budget: 100, budgetPct: 90, budgetStatus: 'warning' },
    { category: 'Home', total: 50, pct: 33, budget: null, budgetPct: null, budgetStatus: null }
];

function render(props) {
    const element = createElement('c-finance-category-breakdown', { is: FinanceCategoryBreakdown });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
}

describe('c-finance-category-breakdown', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('renders a row per category with its AUD total and relative bar width', () => {
        const element = render({ categories: CATEGORIES });

        const rows = element.shadowRoot.querySelectorAll('.cat-row');
        expect(rows).toHaveLength(3);
        expect(rows[0].querySelector('.cat-row__amount').textContent).toBe('A$150.00');
        expect(rows[1].querySelector('.bar-fill').style.width).toBe('60%');
    });

    it('shows budget progress with a status colour, capping the bar at 100%', () => {
        const element = render({ categories: CATEGORIES });
        const [travel, food, home] = element.shadowRoot.querySelectorAll('.cat-row');

        expect(travel.querySelector('.budget-fill').classList).toContain('budget-fill--over');
        expect(travel.querySelector('.budget-fill').style.width).toBe('100%');
        expect(travel.querySelector('.budget-text').textContent).toBe('Over budget by A$50.00 · A$100.00 limit');
        expect(food.querySelector('.budget-text').textContent).toBe('90% of A$100.00 budget');
        expect(food.querySelector('.budget-fill').classList).toContain('budget-fill--warning');
        expect(home.querySelector('.budget-track')).toBeNull();
    });

    it('keeps the current rows visible under a loading overlay while the next month loads', () => {
        const element = render({ categories: CATEGORIES, loading: true });

        expect(element.shadowRoot.querySelectorAll('.cat-row')).toHaveLength(3);
        expect(element.shadowRoot.querySelector('.loading-overlay .fin-spinner')).not.toBeNull();
    });

    it('does not flash the empty state during the first load', () => {
        const element = render({ categories: [], loading: true });

        expect(element.shadowRoot.querySelector('.empty-state')).toBeNull();
    });

    it('shows the empty state when there is no spending', () => {
        const element = render({ categories: [] });

        expect(element.shadowRoot.querySelector('.empty-state').textContent).toContain('No expenses this month.');
    });

    it('asks the parent to open the budget editor', () => {
        const element = render({ categories: CATEGORIES });
        const handler = jest.fn();
        element.addEventListener('managebudgets', handler);

        element.shadowRoot.querySelector('.budgets-btn').click();

        expect(handler).toHaveBeenCalledTimes(1);
    });
});
