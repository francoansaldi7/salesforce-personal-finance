import { LightningElement, api } from 'lwc';
import { formatMoney } from 'c/financeUtils';

export default class FinanceCategoryBreakdown extends LightningElement {
    @api loading = false;
    @api categories = [];

    get hasCategories() {
        return (this.categories || []).length > 0;
    }

    get showEmptyState() {
        return !this.loading;
    }

    get rows() {
        return (this.categories || []).map(cat => {
            const hasBudget = cat.budget != null;
            const status = cat.budgetStatus || 'ok';
            return {
                category: cat.category,
                formattedTotal: formatMoney(cat.total),
                barStyle: `width: ${cat.pct}%`,
                hasBudget,
                budgetBarStyle: hasBudget ? `width: ${Math.min(cat.budgetPct, 100)}%` : '',
                budgetFillClass: `budget-fill budget-fill--${status}`,
                budgetTextClass: `budget-text budget-text--${status}`,
                budgetText: hasBudget ? this.budgetText(cat) : ''
            };
        });
    }

    budgetText(cat) {
        if (cat.budgetStatus === 'over') {
            return `Over budget by ${formatMoney(cat.total - cat.budget)} · ${formatMoney(cat.budget)} limit`;
        }
        return `${cat.budgetPct}% of ${formatMoney(cat.budget)} budget`;
    }

    handleManageBudgets() {
        this.dispatchEvent(new CustomEvent('managebudgets'));
    }
}
