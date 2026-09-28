import { LightningElement, api, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import FINANCE_OBJECT from '@salesforce/schema/Finance_Transaction__c';
import CATEGORY_FIELD from '@salesforce/schema/Finance_Transaction__c.Category__c';
import saveTransaction from '@salesforce/apex/FinanceController.saveTransaction';
import getExchangeRate from '@salesforce/apex/FinanceController.getExchangeRate';
import {
    BASE_CURRENCY,
    CURRENCY_OPTIONS,
    RECURRENCE_OPTIONS,
    TYPE_INCOME,
    TYPE_EXPENSE,
    categoriesForType,
    errorMessage,
    formatMoney,
    formatRate,
    toIsoDate
} from 'c/financeUtils';

const MIN_DATE = '2000-01-01';
const RATE_SOURCE_LABELS = {
    live: 'live rate',
    manual: 'edited',
    saved: 'rate locked in when saved'
};

export default class FinanceTransactionModal extends LightningElement {
    currencyOptions = CURRENCY_OPTIONS;
    recurrenceOptions = RECURRENCE_OPTIONS;

    isOpen = false;
    form = {};
    errors = {};
    isSaving = false;
    isFetchingRate = false;
    rateSource = null;
    rateError = '';

    @wire(getObjectInfo, { objectApiName: FINANCE_OBJECT })
    objectInfo;

    @wire(getPicklistValues, { recordTypeId: '$objectInfo.data.defaultRecordTypeId', fieldApiName: CATEGORY_FIELD })
    categoryPicklist;

    @api
    openForNew(type, defaultDate) {
        this.resetState();
        this.form = {
            id: null,
            type: type || TYPE_EXPENSE,
            amount: '',
            currencyCode: BASE_CURRENCY,
            exchangeRate: 1,
            category: '',
            transactionDate: defaultDate || toIsoDate(new Date()),
            description: '',
            recurrence: 'None'
        };
        this.isOpen = true;
    }

    @api
    openForEdit(transaction) {
        this.resetState();
        this.form = {
            id: transaction.Id,
            type: transaction.Type__c,
            amount: transaction.Amount__c,
            currencyCode: transaction.Currency__c || BASE_CURRENCY,
            exchangeRate: transaction.Exchange_Rate__c,
            category: transaction.Category__c,
            transactionDate: transaction.Date__c,
            description: transaction.Description__c || '',
            recurrence: transaction.Recurrence__c || 'None'
        };
        this.rateSource = this.isForeign ? 'saved' : null;
        this.isOpen = true;
    }

    resetState() {
        this.errors = {};
        this.isSaving = false;
        this.isFetchingRate = false;
        this.rateSource = null;
        this.rateError = '';
    }

    // ── Display ───────────────────────────────────────────────────────────────

    get isEdit() {
        return Boolean(this.form.id);
    }

    get title() {
        return this.isEdit ? 'Edit Transaction' : 'New Transaction';
    }

    get isIncome() {
        return this.form.type === TYPE_INCOME;
    }

    get isForeign() {
        return this.form.currencyCode !== BASE_CURRENCY;
    }

    get incomeButtonClass() {
        return `type-btn${this.isIncome ? ' type-btn--active type-btn--income' : ''}`;
    }

    get expenseButtonClass() {
        return `type-btn${this.isIncome ? '' : ' type-btn--active type-btn--expense'}`;
    }

    get saveButtonClass() {
        return `btn-save ${this.isIncome ? 'btn-save--income' : 'btn-save--expense'}`;
    }

    get saveLabel() {
        return this.isSaving ? 'Saving...' : 'Save';
    }

    get categoryOptions() {
        return categoriesForType(this.categoryPicklist?.data, this.form.type);
    }

    get maxDate() {
        const max = new Date();
        max.setDate(max.getDate() + 365);
        return toIsoDate(max);
    }

    get rateHint() {
        if (this.isFetchingRate) {
            return 'Fetching live rate...';
        }
        if (!this.form.exchangeRate) {
            return '';
        }
        const source = RATE_SOURCE_LABELS[this.rateSource];
        return `1 ${this.form.currencyCode} = A$${formatRate(this.form.exchangeRate)}${source ? ` · ${source}` : ''}`;
    }

    get audPreview() {
        const amount = Number(this.form.amount);
        const rate = Number(this.form.exchangeRate);
        if (!this.isForeign || !(amount > 0) || !(rate > 0)) {
            return '';
        }
        return `≈ ${formatMoney(amount * rate)}`;
    }

    // ── Field handlers ───────────────────────────────────────────────────────

    handleTypeSelect(event) {
        const type = event.currentTarget.dataset.type;
        if (type !== this.form.type) {
            this.form = { ...this.form, type, category: '' };
        }
    }

    handleAmountChange(event) {
        this.form = { ...this.form, amount: event.target.value };
    }

    handleCurrencyChange(event) {
        const currencyCode = event.detail.value;
        this.form = { ...this.form, currencyCode, exchangeRate: currencyCode === BASE_CURRENCY ? 1 : '' };
        this.rateError = '';
        this.rateSource = null;
        if (currencyCode !== BASE_CURRENCY) {
            this.fetchLiveRate();
        }
    }

    handleRateChange(event) {
        this.form = { ...this.form, exchangeRate: event.target.value };
        this.rateSource = 'manual';
        this.rateError = '';
    }

    handleUseLiveRate() {
        this.fetchLiveRate();
    }

    handleCategoryChange(event) {
        this.form = { ...this.form, category: event.detail.value };
    }

    handleDateChange(event) {
        this.form = { ...this.form, transactionDate: event.target.value };
    }

    handleDescriptionChange(event) {
        this.form = { ...this.form, description: event.target.value };
    }

    handleRecurrenceChange(event) {
        this.form = { ...this.form, recurrence: event.detail.value };
    }

    fetchLiveRate() {
        const requestedCurrency = this.form.currencyCode;
        this.isFetchingRate = true;
        this.rateError = '';
        getExchangeRate({ currencyCode: requestedCurrency })
            .then(rate => {
                if (this.form.currencyCode === requestedCurrency) {
                    this.form = { ...this.form, exchangeRate: rate };
                    this.rateSource = 'live';
                }
            })
            .catch(error => {
                if (this.form.currencyCode === requestedCurrency) {
                    this.rateError = errorMessage(error, 'Could not fetch the live rate. Please enter it manually.');
                }
            })
            .finally(() => {
                this.isFetchingRate = false;
            });
    }

    // ── Save / close ─────────────────────────────────────────────────────────

    validate() {
        const errors = {};
        const amount = Number(this.form.amount);
        if (!this.form.amount || isNaN(amount) || amount <= 0) {
            errors.amount = 'Amount must be greater than zero.';
        }
        if (this.isForeign && !(Number(this.form.exchangeRate) > 0)) {
            errors.exchangeRate = 'Enter an exchange rate greater than zero.';
        }
        if (!this.form.category) {
            errors.category = 'Choose a category.';
        }
        if (!this.form.transactionDate) {
            errors.transactionDate = 'Date is required.';
        } else if (this.form.transactionDate < MIN_DATE || this.form.transactionDate > this.maxDate) {
            errors.transactionDate = 'Date must be between 01/01/2000 and one year from today.';
        }
        this.errors = errors;
        return Object.keys(errors).length === 0;
    }

    handleSave() {
        if (this.isSaving || !this.validate()) {
            return;
        }
        this.isSaving = true;
        const isNew = !this.isEdit;
        const input = {
            id: this.form.id,
            type: this.form.type,
            category: this.form.category,
            amount: Number(this.form.amount),
            currencyCode: this.form.currencyCode,
            exchangeRate: this.isForeign ? Number(this.form.exchangeRate) : 1,
            transactionDate: this.form.transactionDate,
            description: this.form.description,
            recurrence: this.form.recurrence
        };

        saveTransaction({ input })
            .then(() => {
                this.isOpen = false;
                this.dispatchEvent(new ShowToastEvent({
                    title: isNew ? 'Transaction added' : 'Transaction updated',
                    message: `${this.form.type} of ${formatMoney(input.amount, input.currencyCode)} saved.`,
                    variant: 'success'
                }));
                this.dispatchEvent(new CustomEvent('saved', {
                    detail: { transactionDate: input.transactionDate, isNew }
                }));
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Could not save',
                    message: errorMessage(error, 'Please check the details and try again.'),
                    variant: 'error'
                }));
            })
            .finally(() => {
                this.isSaving = false;
            });
    }

    handleClose() {
        this.isOpen = false;
    }

    handleKeyDown(event) {
        if (event.key === 'Escape') {
            this.handleClose();
        }
    }

    stopPropagation(event) {
        event.stopPropagation();
    }
}
