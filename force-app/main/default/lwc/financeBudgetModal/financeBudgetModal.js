import { LightningElement, api, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import FINANCE_OBJECT from '@salesforce/schema/Finance_Transaction__c';
import CATEGORY_FIELD from '@salesforce/schema/Finance_Transaction__c.Category__c';
import getBudgets from '@salesforce/apex/FinanceController.getBudgets';
import saveBudgets from '@salesforce/apex/FinanceController.saveBudgets';
import { TYPE_EXPENSE, categoriesForType, errorMessage, formatMoney } from 'c/financeUtils';

export default class FinanceBudgetModal extends LightningElement {
    isOpen = false;
    isLoading = false;
    isSaving = false;
    limits = {};
    error = '';

    @wire(getObjectInfo, { objectApiName: FINANCE_OBJECT })
    objectInfo;

    @wire(getPicklistValues, { recordTypeId: '$objectInfo.data.defaultRecordTypeId', fieldApiName: CATEGORY_FIELD })
    categoryPicklist;

    @api
    open() {
        this.isOpen = true;
        this.isLoading = true;
        this.error = '';
        this.limits = {};
        getBudgets()
            .then(budgets => {
                const limits = {};
                budgets.forEach(entry => {
                    limits[entry.category] = entry.monthlyLimit;
                });
                this.limits = limits;
            })
            .catch(error => {
                this.error = errorMessage(error, 'Could not load your budgets.');
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    get rows() {
        return categoriesForType(this.categoryPicklist?.data, TYPE_EXPENSE).map(option => ({
            category: option.value,
            label: option.label,
            value: this.limits[option.value] ?? ''
        }));
    }

    get totalBudget() {
        const total = Object.values(this.limits).reduce((sum, value) => sum + (Number(value) || 0), 0);
        return formatMoney(total);
    }

    get saveLabel() {
        return this.isSaving ? 'Saving...' : 'Save budgets';
    }

    handleLimitChange(event) {
        const { category } = event.target.dataset;
        this.limits = { ...this.limits, [category]: event.target.value };
    }

    handleSave() {
        const budgets = this.rows.map(row => ({
            category: row.category,
            monthlyLimit: row.value === '' || row.value === null ? null : Number(row.value)
        }));
        if (budgets.some(entry => entry.monthlyLimit !== null && (isNaN(entry.monthlyLimit) || entry.monthlyLimit < 0))) {
            this.error = 'Budgets must be positive amounts. Leave a category blank for no budget.';
            return;
        }

        this.isSaving = true;
        this.error = '';
        saveBudgets({ budgets })
            .then(() => {
                this.isOpen = false;
                this.dispatchEvent(new ShowToastEvent({ title: 'Budgets saved', message: '', variant: 'success' }));
                this.dispatchEvent(new CustomEvent('saved'));
            })
            .catch(error => {
                this.error = errorMessage(error, 'Could not save your budgets.');
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
