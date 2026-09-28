public with sharing class FinanceTransactionTriggerHandler {

    public static final String BASE_CURRENCY = 'AUD';
    public static final String NO_RECURRENCE = 'None';

    public static void beforeInsert(List<Finance_Transaction__c> records) {
        for (Finance_Transaction__c txn : records) {
            applyCurrencyConversion(txn);
            txn.Next_Occurrence_Date__c = isRecurring(txn)
                ? nextOccurrence(txn.Date__c, txn.Recurrence__c)
                : null;
        }
    }

    public static void beforeUpdate(List<Finance_Transaction__c> records, Map<Id, Finance_Transaction__c> oldMap) {
        for (Finance_Transaction__c txn : records) {
            Finance_Transaction__c old = oldMap.get(txn.Id);
            applyCurrencyConversion(txn);

            if (!isRecurring(txn)) {
                txn.Next_Occurrence_Date__c = null;
            } else if (txn.Recurrence__c != old.Recurrence__c || txn.Date__c != old.Date__c) {
                txn.Next_Occurrence_Date__c = nextOccurrence(txn.Date__c, txn.Recurrence__c);
            }
        }
    }

    public static Date nextOccurrence(Date fromDate, String recurrence) {
        if (fromDate == null) {
            return null;
        }
        switch on recurrence {
            when 'Weekly'      { return fromDate.addDays(7); }
            when 'Fortnightly' { return fromDate.addDays(14); }
            when 'Monthly'     { return fromDate.addMonths(1); }
            when else          { return null; }
        }
    }

    private static Boolean isRecurring(Finance_Transaction__c txn) {
        return String.isNotBlank(txn.Recurrence__c) && txn.Recurrence__c != NO_RECURRENCE;
    }

    private static void applyCurrencyConversion(Finance_Transaction__c txn) {
        if (String.isBlank(txn.Currency__c)) {
            txn.Currency__c = BASE_CURRENCY;
        }
        if (txn.Currency__c == BASE_CURRENCY) {
            txn.Exchange_Rate__c = 1;
        }
        txn.Amount_AUD__c = (txn.Amount__c == null || txn.Exchange_Rate__c == null)
            ? null
            : (txn.Amount__c * txn.Exchange_Rate__c).setScale(2);
    }
}
