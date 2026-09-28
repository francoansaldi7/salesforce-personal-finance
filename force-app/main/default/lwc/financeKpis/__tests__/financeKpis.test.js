import { createElement } from 'lwc';
import FinanceKpis from 'c/financeKpis';

function render(props) {
    const element = createElement('c-finance-kpis', { is: FinanceKpis });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
}

const text = (element, dataId) => element.shadowRoot.querySelector(`[data-id="${dataId}"]`).textContent;

describe('c-finance-kpis', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('renders the four KPI values in AUD', () => {
        const element = render({ summary: { income: 6200, expenses: 4100.5, balance: 2099.5, savingsRate: 33.9 } });

        expect(text(element, 'income')).toBe('A$6,200.00');
        expect(text(element, 'expenses')).toBe('A$4,100.50');
        expect(text(element, 'balance')).toBe('A$2,099.50');
        expect(text(element, 'savings')).toBe('33.9%');
    });

    it('colours a negative balance as an expense and clamps the savings bar at 0%', () => {
        const element = render({ summary: { income: 100, expenses: 300, balance: -200, savingsRate: -200 } });

        expect(element.shadowRoot.querySelector('[data-id="balance"]').classList).toContain('value--expense');
        expect(element.shadowRoot.querySelector('.savings-fill').style.width).toBe('0%');
    });

    it('shows shimmer placeholders instead of values while loading', () => {
        const element = render({ loading: true, summary: { income: 1, expenses: 1, balance: 0, savingsRate: 0 } });

        expect(element.shadowRoot.querySelectorAll('.skeleton')).toHaveLength(4);
        expect(text(element, 'income')).toBe('');
    });

    it('treats a missing summary as zeros', () => {
        const element = render({ summary: undefined });

        expect(text(element, 'income')).toBe('A$0.00');
    });

    it('hides the currency mix when the month is AUD-only', () => {
        const element = render({ currencyMix: [{ currencyCode: 'AUD', income: 100, expenses: 50 }] });

        expect(element.shadowRoot.querySelector('.currency-mix')).toBeNull();
    });

    it('shows original-currency totals when the month includes foreign currencies', () => {
        const element = render({
            currencyMix: [
                { currencyCode: 'AUD', income: 6200, expenses: 3000 },
                { currencyCode: 'USD', income: 800, expenses: 0 },
                { currencyCode: 'ARS', income: 0, expenses: 85000 }
            ]
        });

        const chips = [...element.shadowRoot.querySelectorAll('.currency-chip')].map(chip => chip.textContent);
        expect(chips).toEqual([
            'AUDin A$6,200.00 · out A$3,000.00',
            'USDin US$800.00',
            'ARSout AR$85,000.00'
        ]);
    });
});
