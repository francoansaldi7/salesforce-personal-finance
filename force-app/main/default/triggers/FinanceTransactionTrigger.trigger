trigger FinanceTransactionTrigger on Finance_Transaction__c (before insert, before update) {
    if (Trigger.isInsert) {
        FinanceTransactionTriggerHandler.beforeInsert(Trigger.new);
    } else {
        FinanceTransactionTriggerHandler.beforeUpdate(Trigger.new, Trigger.oldMap);
    }
}
