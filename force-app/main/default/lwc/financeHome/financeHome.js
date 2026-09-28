import { LightningElement, wire } from 'lwc';
import { getRecord } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import userId from '@salesforce/user/Id';
import FIRSTNAME_FIELD from '@salesforce/schema/User.FirstName';
import getDashboard from '@salesforce/apex/FinanceController.getDashboard';
import materializeDueRecurrences from '@salesforce/apex/FinanceController.materializeDueRecurrences';
import { MONTH_NAMES, TYPE_INCOME, TYPE_EXPENSE, errorMessage, formatMoney, toIsoDate } from 'c/financeUtils';

// Matches the Date_Range_Invalid validation rule, which allows transactions up to a year ahead.
const MONTHS_AHEAD_ALLOWED = 12;

function monthIndexOf(date) {
    return date.getFullYear() * 12 + date.getMonth();
}

export default class FinanceHome extends LightningElement {
    userId = userId;
    selectedMonth = new Date().getMonth() + 1;
    selectedYear = new Date().getFullYear();
    dashboard;
    isLoading = true;
    requestSequence = 0;

    @wire(getRecord, { recordId: '$userId', fields: [FIRSTNAME_FIELD] })
    currentUser;

    connectedCallback() {
        materializeDueRecurrences()
            .then(created => {
                if (created > 0) {
                    this.toast('Recurring transactions', `${created} recurring transaction${created === 1 ? '' : 's'} added.`, 'info');
                }
            })
            .catch(error => {
                this.toast('Recurring transactions', errorMessage(error, 'Could not create recurring transactions.'), 'warning');
            })
            .finally(() => this.loadDashboard());
    }

    // ── Data ──────────────────────────────────────────────────────────────────

    // A sequence number discards responses for months the user has already navigated away from.
    loadDashboard() {
        const requestId = ++this.requestSequence;
        const isCurrent = () => requestId === this.requestSequence;
        this.isLoading = true;
        getDashboard({ month: this.selectedMonth, year: this.selectedYear })
            .then(data => {
                if (isCurrent()) {
                    this.dashboard = data;
                }
            })
            .catch(error => {
                if (isCurrent()) {
                    this.toast('Error', errorMessage(error, 'Could not load the dashboard.'), 'error');
                }
            })
            .finally(() => {
                if (isCurrent()) {
                    this.isLoading = false;
                }
            });
    }

    // ── Header ────────────────────────────────────────────────────────────────

    get headerClass() {
        return this.isLoading ? 'fin-header fin-header--loading' : 'fin-header';
    }

    get greeting() {
        const firstName = this.currentUser?.data?.fields?.FirstName?.value;
        return firstName ? `Welcome back, ${firstName}` : 'Welcome back';
    }

    get monthLabel() {
        return `${MONTH_NAMES[this.selectedMonth - 1]} ${this.selectedYear}`;
    }

    get selectedMonthIndex() {
        return this.selectedYear * 12 + (this.selectedMonth - 1);
    }

    get isCurrentMonth() {
        return this.selectedMonthIndex === monthIndexOf(new Date());
    }

    get showThisMonthButton() {
        return !this.isCurrentMonth;
    }

    get isFutureMonth() {
        return this.selectedMonthIndex > monthIndexOf(new Date());
    }

    get isAtLatestMonth() {
        return this.selectedMonthIndex >= monthIndexOf(new Date()) + MONTHS_AHEAD_ALLOWED;
    }

    get monthSummary() {
        return this.dashboard?.month;
    }

    get monthBalanceFormatted() {
        return formatMoney(this.dashboard?.month?.balance);
    }

    get monthBalanceClass() {
        return 'header-balance ' + (this.dashboard?.month?.balance < 0 ? 'value--negative' : 'value--positive');
    }

    get annualBalanceFormatted() {
        return formatMoney(this.dashboard?.annualBalance);
    }

    get annualBalanceClass() {
        return 'header-balance ' + (this.dashboard?.annualBalance < 0 ? 'value--negative' : 'value--positive');
    }

    get categories() {
        return this.dashboard?.categories || [];
    }

    get currencyMix() {
        return this.dashboard?.currencyMix || [];
    }

    get trend() {
        return this.dashboard?.trend || [];
    }

    // ── Month navigation ──────────────────────────────────────────────────────

    handlePreviousMonth() {
        this.goToMonthIndex(this.selectedMonthIndex - 1);
    }

    handleNextMonth() {
        if (!this.isAtLatestMonth) {
            this.goToMonthIndex(this.selectedMonthIndex + 1);
        }
    }

    handleThisMonth() {
        this.goToMonthIndex(monthIndexOf(new Date()));
    }

    goToMonthIndex(index) {
        this.selectedYear = Math.floor(index / 12);
        this.selectedMonth = (index % 12) + 1;
        this.loadDashboard();
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    /** New transactions default to today when viewing this month, otherwise to the 1st of the viewed month. */
    get defaultDateForSelectedMonth() {
        return this.isCurrentMonth
            ? toIsoDate(new Date())
            : toIsoDate(new Date(this.selectedYear, this.selectedMonth - 1, 1));
    }

    handleAddIncome() {
        this.refs.transactionModal.openForNew(TYPE_INCOME, this.defaultDateForSelectedMonth);
    }

    handleAddExpense() {
        this.refs.transactionModal.openForNew(TYPE_EXPENSE, this.defaultDateForSelectedMonth);
    }

    handleEditTransaction(event) {
        this.refs.transactionModal.openForEdit(event.detail.transaction);
    }

    handleManageBudgets() {
        this.refs.budgetModal.open();
    }

    /** Jump to the month the transaction was saved in, so the user always sees it land. */
    handleTransactionSaved(event) {
        const [year, month] = event.detail.transactionDate.split('-').map(Number);
        if (year !== this.selectedYear || month !== this.selectedMonth) {
            this.goToMonthIndex(year * 12 + (month - 1));
        } else {
            this.loadDashboard();
            this.refs.transactionList.refresh();
        }
    }

    handleTransactionsChanged() {
        this.loadDashboard();
    }

    handleBudgetsSaved() {
        this.loadDashboard();
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
