import { LightningElement, api } from 'lwc';
import { BASE_CURRENCY, formatMoney } from 'c/financeUtils';

const EMPTY_SUMMARY = { income: 0, expenses: 0, balance: 0, savingsRate: 0 };

export default class FinanceKpis extends LightningElement {
    @api loading = false;
    @api currencyMix = [];

    _summary = EMPTY_SUMMARY;

    @api
    get summary() {
        return this._summary;
    }
    set summary(value) {
        this._summary = value || EMPTY_SUMMARY;
    }

    get incomeFormatted() {
        return formatMoney(this._summary.income);
    }

    get expensesFormatted() {
        return formatMoney(this._summary.expenses);
    }

    get balanceFormatted() {
        return formatMoney(this._summary.balance);
    }

    get balanceClass() {
        return 'kpi-tile__value ' + (this._summary.balance < 0 ? 'value--expense' : 'value--income');
    }

    get savingsRateFormatted() {
        return `${Number(this._summary.savingsRate || 0).toFixed(1)}%`;
    }

    get savingsBarStyle() {
        const rate = Math.min(Math.max(Number(this._summary.savingsRate) || 0, 0), 100);
        return `width: ${rate}%`;
    }

    /** Only worth showing when the month actually involved a currency other than AUD. */
    get showCurrencyMix() {
        return (this.currencyMix || []).some(entry => entry.currencyCode !== BASE_CURRENCY);
    }

    get currencyChips() {
        return (this.currencyMix || []).map(entry => {
            const parts = [];
            if (entry.income > 0) {
                parts.push(`in ${formatMoney(entry.income, entry.currencyCode)}`);
            }
            if (entry.expenses > 0) {
                parts.push(`out ${formatMoney(entry.expenses, entry.currencyCode)}`);
            }
            return { code: entry.currencyCode, detail: parts.join(' · ') };
        });
    }
}
