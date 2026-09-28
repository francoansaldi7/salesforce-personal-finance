import { LightningElement, api, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import FINANCE_OBJECT from '@salesforce/schema/Finance_Transaction__c';
import CATEGORY_FIELD from '@salesforce/schema/Finance_Transaction__c.Category__c';
import getTransactions from '@salesforce/apex/FinanceController.getTransactions';
import deleteTransaction from '@salesforce/apex/FinanceController.deleteTransaction';
import {
    BASE_CURRENCY,
    PAGE_SIZE,
    TYPE_INCOME,
    TYPE_EXPENSE,
    categoriesForType,
    errorMessage,
    formatDate,
    formatMoney
} from 'c/financeUtils';

const SEARCH_DEBOUNCE_MS = 300;
const UNDO_WINDOW_MS = 5000;

const TYPE_OPTIONS = [
    { label: 'All types', value: '' },
    { label: 'Income', value: TYPE_INCOME },
    { label: 'Expenses', value: TYPE_EXPENSE }
];

export default class FinanceTransactionList extends LightningElement {
    typeOptions = TYPE_OPTIONS;

    searchTerm = '';
    committedSearchTerm = '';
    typeFilter = '';
    categoryFilter = '';
    pageNumber = 1;

    records = [];
    totalCount = 0;
    isLoading = false;
    pendingDelete = null;
    deletingIds = [];

    _month;
    _year;
    requestSequence = 0;
    loadScheduled = false;
    searchTimeoutId;

    @wire(getObjectInfo, { objectApiName: FINANCE_OBJECT })
    objectInfo;

    @wire(getPicklistValues, { recordTypeId: '$objectInfo.data.defaultRecordTypeId', fieldApiName: CATEGORY_FIELD })
    categoryPicklist;

    @api
    get month() {
        return this._month;
    }
    set month(value) {
        this._month = value;
        this.pageNumber = 1;
        this.scheduleLoad();
    }

    @api
    get year() {
        return this._year;
    }
    set year(value) {
        this._year = value;
        this.pageNumber = 1;
        this.scheduleLoad();
    }

    @api
    refresh() {
        this.scheduleLoad();
    }

    disconnectedCallback() {
        clearTimeout(this.searchTimeoutId);
        this.flushPendingDelete();
    }

    // ── Loading ───────────────────────────────────────────────────────────────

    // month and year usually change together; batching into one microtask avoids a duplicate request.
    scheduleLoad() {
        if (this.loadScheduled) {
            return;
        }
        this.loadScheduled = true;
        Promise.resolve().then(() => {
            this.loadScheduled = false;
            this.load();
        });
    }

    load() {
        if (!this._month || !this._year) {
            return;
        }
        const requestId = ++this.requestSequence;
        const isCurrent = () => requestId === this.requestSequence;
        this.isLoading = true;

        getTransactions({
            month: this._month,
            year: this._year,
            searchTerm: this.committedSearchTerm,
            typeFilter: this.typeFilter,
            categoryFilter: this.categoryFilter,
            pageNumber: this.pageNumber
        })
            .then(result => {
                if (!isCurrent()) {
                    return;
                }
                this.records = result.records;
                this.totalCount = result.totalCount;
                if (result.records.length === 0 && this.pageNumber > 1) {
                    this.pageNumber -= 1;
                    this.scheduleLoad();
                }
            })
            .catch(error => {
                if (isCurrent()) {
                    this.toast('Error', errorMessage(error, 'Could not load transactions.'), 'error');
                }
            })
            .finally(() => {
                if (isCurrent()) {
                    this.isLoading = false;
                }
            });
    }

    // ── Display ───────────────────────────────────────────────────────────────

    get transactions() {
        const hiddenIds = [...this.deletingIds, this.pendingDelete?.id];
        return this.records
            .filter(txn => !hiddenIds.includes(txn.Id))
            .map(txn => {
                const isIncome = txn.Type__c === TYPE_INCOME;
                const isForeign = txn.Currency__c && txn.Currency__c !== BASE_CURRENCY;
                const isRecurring = txn.Recurrence__c && txn.Recurrence__c !== 'None';
                const metaParts = [formatDate(txn.Date__c), txn.Category__c];
                return {
                    id: txn.Id,
                    label: txn.Description__c || txn.Category__c,
                    meta: metaParts.join(' · '),
                    isRecurring,
                    recurrenceLabel: isRecurring ? `Repeats ${txn.Recurrence__c.toLowerCase()}` : '',
                    amount: `${isIncome ? '+' : '-'}${formatMoney(txn.Amount__c, txn.Currency__c)}`,
                    audEquivalent: isForeign ? `≈ ${formatMoney(txn.Amount_AUD__c)}` : '',
                    dotClass: `txn-dot ${isIncome ? 'txn-dot--income' : 'txn-dot--expense'}`,
                    amountClass: `txn-amount ${isIncome ? 'txn-amount--income' : 'txn-amount--expense'}`
                };
            });
    }

    get hasTransactions() {
        return this.transactions.length > 0;
    }

    get showEmptyState() {
        return !this.isLoading;
    }

    get visibleCount() {
        return this.totalCount - (this.pendingDelete ? 1 : 0) - this.deletingIds.length;
    }

    get isFiltered() {
        return Boolean(this.committedSearchTerm || this.typeFilter || this.categoryFilter);
    }

    get emptyMessage() {
        return this.isFiltered ? 'No transactions match your filters.' : 'No transactions this month.';
    }

    get categoryOptions() {
        return [
            { label: 'All categories', value: '' },
            ...categoriesForType(this.categoryPicklist?.data, this.typeFilter)
        ];
    }

    get totalPages() {
        return Math.max(1, Math.ceil(this.totalCount / PAGE_SIZE));
    }

    get showPagination() {
        return this.totalPages > 1;
    }

    get paginationLabel() {
        return `Page ${this.pageNumber} of ${this.totalPages}`;
    }

    get isFirstPage() {
        return this.pageNumber <= 1;
    }

    get isLastPage() {
        return this.pageNumber >= this.totalPages;
    }

    // ── Filters & pagination ─────────────────────────────────────────────────

    handleSearchInput(event) {
        this.searchTerm = event.target.value;
        clearTimeout(this.searchTimeoutId);
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.searchTimeoutId = setTimeout(() => {
            this.committedSearchTerm = this.searchTerm.trim();
            this.pageNumber = 1;
            this.scheduleLoad();
        }, SEARCH_DEBOUNCE_MS);
    }

    handleTypeFilterChange(event) {
        this.typeFilter = event.detail.value;
        const stillValid = categoriesForType(this.categoryPicklist?.data, this.typeFilter)
            .some(option => option.value === this.categoryFilter);
        if (!stillValid) {
            this.categoryFilter = '';
        }
        this.pageNumber = 1;
        this.scheduleLoad();
    }

    handleCategoryFilterChange(event) {
        this.categoryFilter = event.detail.value;
        this.pageNumber = 1;
        this.scheduleLoad();
    }

    handlePreviousPage() {
        if (!this.isFirstPage) {
            this.pageNumber -= 1;
            this.scheduleLoad();
        }
    }

    handleNextPage() {
        if (!this.isLastPage) {
            this.pageNumber += 1;
            this.scheduleLoad();
        }
    }

    // ── Row actions ──────────────────────────────────────────────────────────

    handleEdit(event) {
        const transaction = this.records.find(txn => txn.Id === event.currentTarget.dataset.id);
        this.dispatchEvent(new CustomEvent('edittransaction', { detail: { transaction } }));
    }

    handleDelete(event) {
        this.flushPendingDelete();
        const txn = this.transactions.find(row => row.id === event.currentTarget.dataset.id);
        this.pendingDelete = {
            id: txn.id,
            label: `${txn.label} (${txn.amount})`,
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            timeoutId: setTimeout(() => this.commitDelete(), UNDO_WINDOW_MS)
        };
    }

    handleUndo() {
        clearTimeout(this.pendingDelete.timeoutId);
        this.pendingDelete = null;
    }

    flushPendingDelete() {
        if (this.pendingDelete) {
            clearTimeout(this.pendingDelete.timeoutId);
            this.commitDelete();
        }
    }

    commitDelete() {
        const { id } = this.pendingDelete;
        this.pendingDelete = null;
        this.deletingIds = [...this.deletingIds, id];

        const stopTracking = () => {
            this.deletingIds = this.deletingIds.filter(deletingId => deletingId !== id);
        };
        deleteTransaction({ transactionId: id })
            .then(() => {
                this.records = this.records.filter(txn => txn.Id !== id);
                this.totalCount -= 1;
                stopTracking();
                this.dispatchEvent(new CustomEvent('transactionschanged'));
                this.scheduleLoad();
            })
            .catch(error => {
                stopTracking();
                this.toast('Error', errorMessage(error, 'Could not delete the transaction.'), 'error');
                this.scheduleLoad();
            });
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
