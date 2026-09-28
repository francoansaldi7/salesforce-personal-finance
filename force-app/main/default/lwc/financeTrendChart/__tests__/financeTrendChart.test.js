import { createElement } from 'lwc';
import FinanceTrendChart from 'c/financeTrendChart';

function twelveMonthsEndingSeptember2026(values = {}) {
    const points = [];
    for (let i = 0; i < 12; i++) {
        const monthIndex = 2025 * 12 + 9 + i; // Oct 2025 → Sep 2026
        const year = Math.floor(monthIndex / 12);
        const month = (monthIndex % 12) + 1;
        points.push({ year, month, income: 0, expenses: 0, ...(values[`${year}-${month}`] || {}) });
    }
    return points;
}

function render(points) {
    const element = createElement('c-finance-trend-chart', { is: FinanceTrendChart });
    element.points = points;
    document.body.appendChild(element);
    return element;
}

describe('c-finance-trend-chart', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('draws an income and an expense bar for each of the 12 months', () => {
        const element = render(twelveMonthsEndingSeptember2026({ '2026-9': { income: 6000, expenses: 3000 } }));

        expect(element.shadowRoot.querySelectorAll('.bar--income')).toHaveLength(12);
        expect(element.shadowRoot.querySelectorAll('.bar--expense')).toHaveLength(12);
    });

    it('scales bars against the busiest month and labels the axis in AUD', () => {
        const element = render(twelveMonthsEndingSeptember2026({ '2026-9': { income: 6000, expenses: 3000 } }));

        const incomeBars = element.shadowRoot.querySelectorAll('.bar--income');
        const expenseBars = element.shadowRoot.querySelectorAll('.bar--expense');
        const tallest = Number(incomeBars[11].getAttribute('height'));
        expect(Number(expenseBars[11].getAttribute('height'))).toBeCloseTo(tallest / 2);
        expect(element.shadowRoot.querySelector('.axis-label--top').textContent).toBe('A$6,000.00');
    });

    it('labels months, adds the year to January, and highlights the selected (last) month', () => {
        const element = render(twelveMonthsEndingSeptember2026({ '2026-9': { income: 1 } }));

        const labels = [...element.shadowRoot.querySelectorAll('.month-label')];
        expect(labels.map(label => label.textContent)).toContain("Jan '26");
        expect(labels[11].textContent).toBe('Sep');
        expect(labels[11].classList).toContain('month-label--selected');
    });

    it('shows a tooltip with the income for a hovered green bar and dims the other bars', async () => {
        const element = render(twelveMonthsEndingSeptember2026({ '2026-9': { income: 7239.7, expenses: 3541.52 } }));

        element.shadowRoot.querySelectorAll('.bar--income')[11].dispatchEvent(new CustomEvent('mouseenter'));
        await Promise.resolve();

        const tooltip = element.shadowRoot.querySelector('.tooltip');
        expect(tooltip.classList).toContain('tooltip--income');
        expect(tooltip.querySelector('.tooltip__month').textContent).toBe('September 2026');
        expect(tooltip.querySelector('.tooltip__label').textContent).toBe('Income');
        expect(tooltip.querySelector('.tooltip__amount').textContent).toBe('A$7,239.70');
        expect(element.shadowRoot.querySelector('svg').classList).toContain('chart--hovering');
        expect(element.shadowRoot.querySelectorAll('.bar--hovered')).toHaveLength(1);
    });

    it('shows the expenses for a hovered red bar and hides the tooltip on leave', async () => {
        const element = render(twelveMonthsEndingSeptember2026({ '2026-9': { income: 7239.7, expenses: 3541.52 } }));
        const expenseBar = element.shadowRoot.querySelectorAll('.bar--expense')[11];

        expenseBar.dispatchEvent(new CustomEvent('mouseenter'));
        await Promise.resolve();
        const tooltip = element.shadowRoot.querySelector('.tooltip');
        expect(tooltip.classList).toContain('tooltip--expense');
        expect(tooltip.querySelector('.tooltip__label').textContent).toBe('Expenses');
        expect(tooltip.querySelector('.tooltip__amount').textContent).toBe('A$3,541.52');

        expenseBar.dispatchEvent(new CustomEvent('mouseleave'));
        await Promise.resolve();
        expect(element.shadowRoot.querySelector('.tooltip')).toBeNull();
        expect(element.shadowRoot.querySelector('.bar--hovered')).toBeNull();
    });

    it('keeps edge tooltips inside the panel', async () => {
        const element = render(twelveMonthsEndingSeptember2026({ '2025-10': { income: 100 }, '2026-9': { expenses: 100 } }));

        element.shadowRoot.querySelectorAll('.bar--income')[0].dispatchEvent(new CustomEvent('mouseenter'));
        await Promise.resolve();
        expect(element.shadowRoot.querySelector('.tooltip').style.transform).toContain('-12px');

        element.shadowRoot.querySelectorAll('.bar--expense')[11].dispatchEvent(new CustomEvent('mouseenter'));
        await Promise.resolve();
        expect(element.shadowRoot.querySelector('.tooltip').style.transform).toContain('calc(-100% + 12px)');
    });

    it('labels every bar for screen readers', () => {
        const element = render(twelveMonthsEndingSeptember2026({ '2026-9': { income: 50 } }));

        expect(element.shadowRoot.querySelectorAll('.bar--income')[11].getAttribute('aria-label')).toBe('September 2026 income A$50.00');
    });

    it('shows an empty state when there is no data', () => {
        const element = render(twelveMonthsEndingSeptember2026());

        expect(element.shadowRoot.querySelector('svg')).toBeNull();
        expect(element.shadowRoot.querySelector('.empty-state')).not.toBeNull();
    });
});
