/**
 * Server-side logic for the Personal Finance app.
 * Every query is scoped to the running user's own records (OwnerId) and runs in USER_MODE,
 * so CRUD, FLS and sharing are enforced even for administrators. All totals are in AUD.
 */
public with sharing class FinanceController {

    public static final String TYPE_INCOME = 'Income';
    public static final String TYPE_EXPENSE = 'Expense';
    public static final String BASE_CURRENCY = FinanceTransactionTriggerHandler.BASE_CURRENCY;
    public static final Integer PAGE_SIZE = 15;

    private static final Integer TREND_MONTHS = 12;
    private static final Integer MAX_OCCURRENCES_PER_SERIES = 60;
    private static final Decimal BUDGET_WARNING_PCT = 80;
    private static final List<String> SUPPORTED_CURRENCIES = new List<String>{ 'AUD', 'USD', 'UYU', 'ARS' };
    @TestVisible
    private static final String EXCHANGE_RATE_ENDPOINT = 'https://open.er-api.com/v6/latest/';

    // ─── Response / request shapes ───────────────────────────────────────────

    public class Dashboard {
        @AuraEnabled public Summary month;
        @AuraEnabled public Decimal annualBalance;
        @AuraEnabled public List<CategoryRow> categories;
        @AuraEnabled public List<CurrencyTotal> currencyMix;
        @AuraEnabled public List<TrendPoint> trend;
    }

    public class Summary {
        @AuraEnabled public Decimal income = 0;
        @AuraEnabled public Decimal expenses = 0;
        @AuraEnabled public Decimal balance = 0;
        @AuraEnabled public Decimal savingsRate = 0;
    }

    public class CategoryRow implements Comparable {
        @AuraEnabled public String category;
        @AuraEnabled public Decimal total = 0;
        @AuraEnabled public Decimal pct = 0;
        @AuraEnabled public Decimal budget;
        @AuraEnabled public Decimal budgetPct;
        @AuraEnabled public String budgetStatus;

        public Integer compareTo(Object other) {
            CategoryRow that = (CategoryRow) other;
            if (total != that.total) {
                return total > that.total ? -1 : 1;
            }
            return category.compareTo(that.category);
        }
    }

    public class CurrencyTotal {
        @AuraEnabled public String currencyCode;
        @AuraEnabled public Decimal income = 0;
        @AuraEnabled public Decimal expenses = 0;
    }

    public class TrendPoint {
        @AuraEnabled public Integer year;
        @AuraEnabled public Integer month;
        @AuraEnabled public Decimal income = 0;
        @AuraEnabled public Decimal expenses = 0;
    }

    public class PagedTransactions {
        @AuraEnabled public List<Finance_Transaction__c> records;
        @AuraEnabled public Integer totalCount;
    }

    public class TransactionInput {
        @AuraEnabled public Id id { get; set; }
        @AuraEnabled public String type { get; set; }
        @AuraEnabled public String category { get; set; }
        @AuraEnabled public Decimal amount { get; set; }
        @AuraEnabled public String currencyCode { get; set; }
        @AuraEnabled public Decimal exchangeRate { get; set; }
        @AuraEnabled public Date transactionDate { get; set; }
        @AuraEnabled public String description { get; set; }
        @AuraEnabled public String recurrence { get; set; }
    }

    public class BudgetInput {
        @AuraEnabled public String category { get; set; }
        @AuraEnabled public Decimal monthlyLimit { get; set; }
    }

    // ─── Dashboard ───────────────────────────────────────────────────────────

    @AuraEnabled
    public static Dashboard getDashboard(Integer month, Integer year) {
        validatePeriod(month, year);
        Date monthStart = Date.newInstance(year, month, 1);
        Date monthEnd = monthStart.addMonths(1).addDays(-1);

        Dashboard result = new Dashboard();
        result.month = summarize(monthStart, monthEnd);
        result.annualBalance = summarize(Date.newInstance(year, 1, 1), Date.newInstance(year, 12, 31)).balance;
        result.categories = buildCategoryRows(monthStart, monthEnd);
        result.currencyMix = buildCurrencyMix(monthStart, monthEnd);
        result.trend = buildTrend(monthStart, monthEnd);
        return result;
    }

    private static Summary summarize(Date startDate, Date endDate) {
        Id ownerId = UserInfo.getUserId();
        Summary summary = new Summary();
        for (AggregateResult ar : [
            SELECT Type__c type, SUM(Amount_AUD__c) total
            FROM Finance_Transaction__c
            WHERE OwnerId = :ownerId AND Date__c >= :startDate AND Date__c <= :endDate
            WITH USER_MODE
            GROUP BY Type__c
        ]) {
            Decimal total = zeroIfNull((Decimal) ar.get('total'));
            if ((String) ar.get('type') == TYPE_INCOME) {
                summary.income = total;
            } else {
                summary.expenses = total;
            }
        }
        summary.balance = summary.income - summary.expenses;
        summary.savingsRate = summary.income > 0
            ? (summary.balance / summary.income * 100).setScale(1)
            : 0;
        return summary;
    }

    private static List<CategoryRow> buildCategoryRows(Date startDate, Date endDate) {
        Id ownerId = UserInfo.getUserId();
        Map<String, CategoryRow> rowsByCategory = new Map<String, CategoryRow>();

        for (AggregateResult ar : [
            SELECT Category__c category, SUM(Amount_AUD__c) total
            FROM Finance_Transaction__c
            WHERE OwnerId = :ownerId AND Type__c = :TYPE_EXPENSE
              AND Date__c >= :startDate AND Date__c <= :endDate
            WITH USER_MODE
            GROUP BY Category__c
        ]) {
            CategoryRow row = rowFor(rowsByCategory, (String) ar.get('category'));
            row.total = zeroIfNull((Decimal) ar.get('total'));
        }

        for (Finance_Budget__c budget : [
            SELECT Category__c, Monthly_Limit__c
            FROM Finance_Budget__c
            WHERE OwnerId = :ownerId
            WITH USER_MODE
        ]) {
            rowFor(rowsByCategory, budget.Category__c).budget = budget.Monthly_Limit__c;
        }

        List<CategoryRow> rows = rowsByCategory.values();
        rows.sort();

        Decimal maxTotal = 0;
        for (CategoryRow row : rows) {
            maxTotal = Math.max(maxTotal, row.total);
        }
        for (CategoryRow row : rows) {
            row.pct = maxTotal > 0 ? (row.total / maxTotal * 100).setScale(0) : 0;
            if (row.budget != null && row.budget > 0) {
                row.budgetPct = (row.total / row.budget * 100).setScale(0);
                row.budgetStatus = row.budgetPct > 100 ? 'over'
                    : row.budgetPct >= BUDGET_WARNING_PCT ? 'warning'
                    : 'ok';
            }
        }
        return rows;
    }

    private static CategoryRow rowFor(Map<String, CategoryRow> rowsByCategory, String category) {
        CategoryRow row = rowsByCategory.get(category);
        if (row == null) {
            row = new CategoryRow();
            row.category = category;
            rowsByCategory.put(category, row);
        }
        return row;
    }

    private static List<CurrencyTotal> buildCurrencyMix(Date startDate, Date endDate) {
        Id ownerId = UserInfo.getUserId();
        Map<String, CurrencyTotal> totalsByCurrency = new Map<String, CurrencyTotal>();
        for (AggregateResult ar : [
            SELECT Currency__c currencyCode, Type__c type, SUM(Amount__c) total
            FROM Finance_Transaction__c
            WHERE OwnerId = :ownerId AND Date__c >= :startDate AND Date__c <= :endDate
            WITH USER_MODE
            GROUP BY Currency__c, Type__c
        ]) {
            String code = (String) ar.get('currencyCode');
            CurrencyTotal entry = totalsByCurrency.get(code);
            if (entry == null) {
                entry = new CurrencyTotal();
                entry.currencyCode = code;
                totalsByCurrency.put(code, entry);
            }
            Decimal total = zeroIfNull((Decimal) ar.get('total'));
            if ((String) ar.get('type') == TYPE_INCOME) {
                entry.income = total;
            } else {
                entry.expenses = total;
            }
        }

        List<CurrencyTotal> ordered = new List<CurrencyTotal>();
        for (String code : SUPPORTED_CURRENCIES) {
            if (totalsByCurrency.containsKey(code)) {
                ordered.add(totalsByCurrency.get(code));
            }
        }
        return ordered;
    }

    private static List<TrendPoint> buildTrend(Date selectedMonthStart, Date selectedMonthEnd) {
        Id ownerId = UserInfo.getUserId();
        Date trendStart = selectedMonthStart.addMonths(1 - TREND_MONTHS);

        List<TrendPoint> points = new List<TrendPoint>();
        Map<String, TrendPoint> pointsByKey = new Map<String, TrendPoint>();
        for (Integer i = 0; i < TREND_MONTHS; i++) {
            Date monthStart = trendStart.addMonths(i);
            TrendPoint point = new TrendPoint();
            point.year = monthStart.year();
            point.month = monthStart.month();
            points.add(point);
            pointsByKey.put(point.year + '-' + point.month, point);
        }

        for (AggregateResult ar : [
            SELECT CALENDAR_YEAR(Date__c) yr, CALENDAR_MONTH(Date__c) mo, Type__c type, SUM(Amount_AUD__c) total
            FROM Finance_Transaction__c
            WHERE OwnerId = :ownerId AND Date__c >= :trendStart AND Date__c <= :selectedMonthEnd
            WITH USER_MODE
            GROUP BY CALENDAR_YEAR(Date__c), CALENDAR_MONTH(Date__c), Type__c
        ]) {
            TrendPoint point = pointsByKey.get(ar.get('yr') + '-' + ar.get('mo'));
            Decimal total = zeroIfNull((Decimal) ar.get('total'));
            if ((String) ar.get('type') == TYPE_INCOME) {
                point.income = total;
            } else {
                point.expenses = total;
            }
        }
        return points;
    }

    // ─── Transactions ────────────────────────────────────────────────────────

    @AuraEnabled
    public static PagedTransactions getTransactions(
        Integer month, Integer year, String searchTerm, String typeFilter, String categoryFilter, Integer pageNumber
    ) {
        validatePeriod(month, year);
        Date startDate = Date.newInstance(year, month, 1);

        Map<String, Object> binds = new Map<String, Object>{
            'ownerId' => UserInfo.getUserId(),
            'startDate' => startDate,
            'endDate' => startDate.addMonths(1).addDays(-1)
        };
        List<String> conditions = new List<String>{
            'OwnerId = :ownerId', 'Date__c >= :startDate', 'Date__c <= :endDate'
        };

        if (String.isNotBlank(searchTerm)) {
            conditions.add('Description__c LIKE :searchPattern');
            binds.put('searchPattern', '%' + searchTerm.trim() + '%');
        }
        if (typeFilter == TYPE_INCOME || typeFilter == TYPE_EXPENSE) {
            conditions.add('Type__c = :typeFilter');
            binds.put('typeFilter', typeFilter);
        }
        if (String.isNotBlank(categoryFilter)) {
            conditions.add('Category__c = :categoryFilter');
            binds.put('categoryFilter', categoryFilter);
        }

        // Only fixed fragments are concatenated; every user-supplied value is a bind variable.
        String whereClause = ' WHERE ' + String.join(conditions, ' AND ');

        PagedTransactions result = new PagedTransactions();
        result.totalCount = Database.countQueryWithBinds(
            'SELECT COUNT() FROM Finance_Transaction__c' + whereClause, binds, AccessLevel.USER_MODE
        );

        Integer safePage = (pageNumber == null || pageNumber < 1) ? 1 : pageNumber;
        binds.put('pageSize', PAGE_SIZE);
        binds.put('pageOffset', (safePage - 1) * PAGE_SIZE);
        result.records = Database.queryWithBinds(
            'SELECT Id, Name, Type__c, Category__c, Amount__c, Currency__c, Exchange_Rate__c, Amount_AUD__c, '
                + 'Date__c, Description__c, Recurrence__c, Next_Occurrence_Date__c '
                + 'FROM Finance_Transaction__c' + whereClause
                + ' ORDER BY Date__c DESC, CreatedDate DESC LIMIT :pageSize OFFSET :pageOffset',
            binds,
            AccessLevel.USER_MODE
        );
        return result;
    }

    @AuraEnabled
    public static Id saveTransaction(TransactionInput input) {
        if (input == null) {
            throw auraError('Missing transaction details.');
        }
        String currencyCode = String.isBlank(input.currencyCode) ? BASE_CURRENCY : input.currencyCode;
        if (!SUPPORTED_CURRENCIES.contains(currencyCode)) {
            throw auraError('Unsupported currency: ' + currencyCode);
        }

        Finance_Transaction__c txn = input.id == null
            ? new Finance_Transaction__c()
            : findOwnedTransaction(input.id);
        txn.Type__c = input.type;
        txn.Category__c = input.category;
        txn.Amount__c = input.amount;
        txn.Currency__c = currencyCode;
        txn.Exchange_Rate__c = currencyCode == BASE_CURRENCY ? 1 : input.exchangeRate;
        txn.Date__c = input.transactionDate;
        txn.Description__c = String.isBlank(input.description) ? null : input.description.trim();
        txn.Recurrence__c = String.isBlank(input.recurrence)
            ? FinanceTransactionTriggerHandler.NO_RECURRENCE
            : input.recurrence;

        try {
            if (txn.Id == null) {
                Database.insert(txn, AccessLevel.USER_MODE);
            } else {
                Database.update(txn, AccessLevel.USER_MODE);
            }
        } catch (DmlException e) {
            throw auraError(e.getDmlMessage(0));
        }
        return txn.Id;
    }

    @AuraEnabled
    public static void deleteTransaction(Id transactionId) {
        Finance_Transaction__c txn = findOwnedTransaction(transactionId);
        try {
            Database.delete(txn, AccessLevel.USER_MODE);
        } catch (DmlException e) {
            throw auraError(e.getDmlMessage(0));
        }
    }

    private static Finance_Transaction__c findOwnedTransaction(Id transactionId) {
        List<Finance_Transaction__c> matches = [
            SELECT Id, Recurrence__c
            FROM Finance_Transaction__c
            WHERE Id = :transactionId AND OwnerId = :UserInfo.getUserId()
            WITH USER_MODE
            LIMIT 1
        ];
        if (matches.isEmpty()) {
            throw auraError('Transaction not found.');
        }
        return matches[0];
    }

    // ─── Exchange rates ──────────────────────────────────────────────────────

    /** Returns how many AUD one unit of the given currency is worth right now. */
    @AuraEnabled
    public static Decimal getExchangeRate(String currencyCode) {
        if (currencyCode == BASE_CURRENCY) {
            return 1;
        }
        if (!SUPPORTED_CURRENCIES.contains(currencyCode)) {
            throw auraError('Unsupported currency: ' + currencyCode);
        }

        HttpRequest request = new HttpRequest();
        request.setEndpoint(EXCHANGE_RATE_ENDPOINT + currencyCode);
        request.setMethod('GET');
        request.setTimeout(10000);

        Decimal rate;
        try {
            HttpResponse response = new Http().send(request);
            if (response.getStatusCode() == 200) {
                Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(response.getBody());
                Map<String, Object> rates = (Map<String, Object>) body.get('rates');
                Object audRate = rates == null ? null : rates.get(BASE_CURRENCY);
                rate = audRate == null ? null : Decimal.valueOf(String.valueOf(audRate)).setScale(8);
            }
        } catch (Exception e) {
            rate = null;
        }

        if (rate == null || rate <= 0) {
            throw auraError('Could not fetch the live exchange rate. Please enter it manually.');
        }
        return rate;
    }

    // ─── Recurring transactions ──────────────────────────────────────────────

    /**
     * Creates every occurrence of a recurring transaction whose date has arrived.
     * Called when the dashboard loads (there is no scheduled job). The newest occurrence
     * of a series takes over the schedule, so stopping a series means editing its latest entry.
     */
    @AuraEnabled
    public static Integer materializeDueRecurrences() {
        Date today = Date.today();
        List<Finance_Transaction__c> due = [
            SELECT Id, Type__c, Category__c, Amount__c, Currency__c, Exchange_Rate__c,
                   Description__c, Recurrence__c, Next_Occurrence_Date__c
            FROM Finance_Transaction__c
            WHERE OwnerId = :UserInfo.getUserId()
              AND Recurrence__c != :FinanceTransactionTriggerHandler.NO_RECURRENCE
              AND Recurrence__c != null
              AND Next_Occurrence_Date__c <= :today
            WITH USER_MODE
            LIMIT 200
        ];
        if (due.isEmpty()) {
            return 0;
        }

        List<Finance_Transaction__c> occurrences = new List<Finance_Transaction__c>();
        List<Finance_Transaction__c> finishedSources = new List<Finance_Transaction__c>();
        for (Finance_Transaction__c source : due) {
            List<Finance_Transaction__c> series = new List<Finance_Transaction__c>();
            Date occurrenceDate = source.Next_Occurrence_Date__c;
            while (occurrenceDate <= today && series.size() < MAX_OCCURRENCES_PER_SERIES) {
                series.add(new Finance_Transaction__c(
                    Type__c = source.Type__c,
                    Category__c = source.Category__c,
                    Amount__c = source.Amount__c,
                    Currency__c = source.Currency__c,
                    Exchange_Rate__c = source.Exchange_Rate__c,
                    Description__c = source.Description__c,
                    Date__c = occurrenceDate,
                    Recurrence__c = FinanceTransactionTriggerHandler.NO_RECURRENCE
                ));
                occurrenceDate = FinanceTransactionTriggerHandler.nextOccurrence(occurrenceDate, source.Recurrence__c);
            }
            series[series.size() - 1].Recurrence__c = source.Recurrence__c;
            occurrences.addAll(series);
            finishedSources.add(new Finance_Transaction__c(
                Id = source.Id,
                Recurrence__c = FinanceTransactionTriggerHandler.NO_RECURRENCE
            ));
        }

        Database.insert(occurrences, AccessLevel.USER_MODE);
        Database.update(finishedSources, AccessLevel.USER_MODE);
        return occurrences.size();
    }

    // ─── Budgets ─────────────────────────────────────────────────────────────

    @AuraEnabled
    public static List<BudgetInput> getBudgets() {
        List<BudgetInput> budgets = new List<BudgetInput>();
        for (Finance_Budget__c budget : [
            SELECT Category__c, Monthly_Limit__c
            FROM Finance_Budget__c
            WHERE OwnerId = :UserInfo.getUserId()
            WITH USER_MODE
            ORDER BY Category__c
        ]) {
            BudgetInput entry = new BudgetInput();
            entry.category = budget.Category__c;
            entry.monthlyLimit = budget.Monthly_Limit__c;
            budgets.add(entry);
        }
        return budgets;
    }

    /** Upserts one budget per category; a blank or zero limit removes that category's budget. */
    @AuraEnabled
    public static void saveBudgets(List<BudgetInput> budgets) {
        Set<String> knownCategories = new Set<String>();
        for (Schema.PicklistEntry entry : Finance_Transaction__c.Category__c.getDescribe().getPicklistValues()) {
            knownCategories.add(entry.getValue());
        }

        Map<String, Finance_Budget__c> existingByCategory = new Map<String, Finance_Budget__c>();
        for (Finance_Budget__c budget : [
            SELECT Id, Category__c, Monthly_Limit__c
            FROM Finance_Budget__c
            WHERE OwnerId = :UserInfo.getUserId()
            WITH USER_MODE
        ]) {
            existingByCategory.put(budget.Category__c, budget);
        }

        List<Finance_Budget__c> toInsert = new List<Finance_Budget__c>();
        List<Finance_Budget__c> toUpdate = new List<Finance_Budget__c>();
        List<Finance_Budget__c> toDelete = new List<Finance_Budget__c>();
        for (BudgetInput input : budgets == null ? new List<BudgetInput>() : budgets) {
            if (!knownCategories.contains(input.category)) {
                throw auraError('Unknown category: ' + input.category);
            }
            Finance_Budget__c existing = existingByCategory.get(input.category);
            Boolean hasLimit = input.monthlyLimit != null && input.monthlyLimit > 0;

            if (hasLimit && existing == null) {
                toInsert.add(new Finance_Budget__c(Category__c = input.category, Monthly_Limit__c = input.monthlyLimit));
            } else if (hasLimit && existing.Monthly_Limit__c != input.monthlyLimit) {
                existing.Monthly_Limit__c = input.monthlyLimit;
                toUpdate.add(existing);
            } else if (!hasLimit && existing != null) {
                toDelete.add(existing);
            }
        }

        try {
            Database.insert(toInsert, AccessLevel.USER_MODE);
            Database.update(toUpdate, AccessLevel.USER_MODE);
            Database.delete(toDelete, AccessLevel.USER_MODE);
        } catch (DmlException e) {
            throw auraError(e.getDmlMessage(0));
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private static void validatePeriod(Integer month, Integer year) {
        if (month == null || month < 1 || month > 12 || year == null || year < 2000 || year > 2100) {
            throw auraError('Invalid month or year.');
        }
    }

    private static Decimal zeroIfNull(Decimal value) {
        return value == null ? 0 : value;
    }

    private static AuraHandledException auraError(String message) {
        AuraHandledException error = new AuraHandledException(message);
        error.setMessage(message);
        return error;
    }
}
