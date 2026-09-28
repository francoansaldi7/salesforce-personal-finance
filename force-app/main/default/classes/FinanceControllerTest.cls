@IsTest
private class FinanceControllerTest {

    private static final Date MONTH_START = Date.today().toStartOfMonth();

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private static Finance_Transaction__c newTxn(String type, String category, Decimal amount, Date txnDate) {
        return new Finance_Transaction__c(
            Type__c = type, Category__c = category, Amount__c = amount, Date__c = txnDate, Currency__c = 'AUD'
        );
    }

    private static Finance_Transaction__c newForeignTxn(
        String type, String category, Decimal amount, String currencyCode, Decimal rate, Date txnDate
    ) {
        Finance_Transaction__c txn = newTxn(type, category, amount, txnDate);
        txn.Currency__c = currencyCode;
        txn.Exchange_Rate__c = rate;
        return txn;
    }

    private static FinanceController.TransactionInput input(String type, String category, Decimal amount, Date txnDate) {
        FinanceController.TransactionInput input = new FinanceController.TransactionInput();
        input.type = type;
        input.category = category;
        input.amount = amount;
        input.transactionDate = txnDate;
        input.currencyCode = 'AUD';
        return input;
    }

    private static FinanceController.BudgetInput budget(String category, Decimal monthlyLimit) {
        FinanceController.BudgetInput entry = new FinanceController.BudgetInput();
        entry.category = category;
        entry.monthlyLimit = monthlyLimit;
        return entry;
    }

    /** A Standard User holding only the app's permission set, so tests prove it is sufficient. */
    private static User createAppUser(String alias) {
        Profile standardProfile = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        User u = new User(
            Alias = alias,
            Email = alias + '@finance-test.example.com',
            Username = alias + '.' + System.currentTimeMillis() + '@finance-test.example.com',
            LastName = 'Tester',
            ProfileId = standardProfile.Id,
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_AU',
            TimeZoneSidKey = 'Australia/Sydney'
        );
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert u;
            PermissionSet appAccess = [SELECT Id FROM PermissionSet WHERE Name = 'Finance_Full_Access' LIMIT 1];
            insert new PermissionSetAssignment(AssigneeId = u.Id, PermissionSetId = appAccess.Id);
        }
        return u;
    }

    private static String errorMessageOf(Exception e) {
        return e.getMessage();
    }

    private class ExchangeRateMock implements HttpCalloutMock {
        private final Integer statusCode;
        private final String body;

        ExchangeRateMock(Integer statusCode, String body) {
            this.statusCode = statusCode;
            this.body = body;
        }

        public HttpResponse respond(HttpRequest request) {
            System.assert(request.getEndpoint().startsWith(FinanceController.EXCHANGE_RATE_ENDPOINT));
            HttpResponse response = new HttpResponse();
            response.setStatusCode(statusCode);
            response.setBody(body);
            return response;
        }
    }

    // ─── Trigger ─────────────────────────────────────────────────────────────

    @IsTest
    static void trigger_audTransaction_setsRateToOneAndCopiesAmount() {
        Finance_Transaction__c txn = newTxn('Expense', 'Food', 42.50, MONTH_START);
        insert txn;

        txn = [SELECT Exchange_Rate__c, Amount_AUD__c, Signed_Amount__c FROM Finance_Transaction__c WHERE Id = :txn.Id];
        Assert.areEqual(1, txn.Exchange_Rate__c);
        Assert.areEqual(42.50, txn.Amount_AUD__c);
        Assert.areEqual(-42.50, txn.Signed_Amount__c);
    }

    @IsTest
    static void trigger_foreignCurrency_convertsAtLockedRate() {
        Finance_Transaction__c txn = newForeignTxn('Expense', 'Travel', 100, 'USD', 1.5, MONTH_START);
        insert txn;

        Assert.areEqual(150.00, [SELECT Amount_AUD__c FROM Finance_Transaction__c WHERE Id = :txn.Id].Amount_AUD__c);
    }

    @IsTest
    static void trigger_foreignCurrencyWithoutRate_isRejected() {
        Finance_Transaction__c txn = newForeignTxn('Expense', 'Travel', 100, 'USD', null, MONTH_START);
        try {
            insert txn;
            Assert.fail('Expected the exchange-rate validation rule to fire');
        } catch (DmlException e) {
            Assert.isTrue(e.getMessage().contains('exchange rate'), e.getMessage());
        }
    }

    @IsTest
    static void trigger_recurringInsert_schedulesNextOccurrence() {
        Finance_Transaction__c txn = newTxn('Income', 'Salary', 3000, MONTH_START);
        txn.Recurrence__c = 'Fortnightly';
        insert txn;

        Assert.areEqual(
            MONTH_START.addDays(14),
            [SELECT Next_Occurrence_Date__c FROM Finance_Transaction__c WHERE Id = :txn.Id].Next_Occurrence_Date__c
        );
    }

    @IsTest
    static void trigger_stoppingRecurrence_clearsNextOccurrence() {
        Finance_Transaction__c txn = newTxn('Expense', 'Subscriptions', 18.99, MONTH_START);
        txn.Recurrence__c = 'Monthly';
        insert txn;

        txn.Recurrence__c = 'None';
        update txn;

        Assert.isNull([SELECT Next_Occurrence_Date__c FROM Finance_Transaction__c WHERE Id = :txn.Id].Next_Occurrence_Date__c);
    }

    @IsTest
    static void trigger_movingARecurringTransaction_reschedulesIt() {
        Finance_Transaction__c txn = newTxn('Expense', 'Home', 550, MONTH_START);
        txn.Recurrence__c = 'Monthly';
        insert txn;

        txn.Date__c = MONTH_START.addDays(3);
        update txn;

        Assert.areEqual(
            MONTH_START.addDays(3).addMonths(1),
            [SELECT Next_Occurrence_Date__c FROM Finance_Transaction__c WHERE Id = :txn.Id].Next_Occurrence_Date__c
        );
    }

    @IsTest
    static void nextOccurrence_handlesMissingDateAndNonRecurring() {
        Assert.isNull(FinanceTransactionTriggerHandler.nextOccurrence(null, 'Monthly'));
        Assert.isNull(FinanceTransactionTriggerHandler.nextOccurrence(MONTH_START, 'None'));
        Assert.areEqual(MONTH_START.addDays(7), FinanceTransactionTriggerHandler.nextOccurrence(MONTH_START, 'Weekly'));
    }

    // ─── Dashboard ───────────────────────────────────────────────────────────

    @IsTest
    static void getDashboard_summarizesTheMonthInAud() {
        insert new List<Finance_Transaction__c>{
            newTxn('Income', 'Salary', 1000, MONTH_START),
            newForeignTxn('Income', 'Freelance', 100, 'USD', 1.5, MONTH_START),
            newTxn('Expense', 'Food', 400, MONTH_START),
            newTxn('Expense', 'Food', 999, MONTH_START.addMonths(-1))
        };

        FinanceController.Dashboard dashboard = FinanceController.getDashboard(MONTH_START.month(), MONTH_START.year());

        Assert.areEqual(1150, dashboard.month.income);
        Assert.areEqual(400, dashboard.month.expenses);
        Assert.areEqual(750, dashboard.month.balance);
        Assert.areEqual(65.2, dashboard.month.savingsRate);
    }

    @IsTest
    static void getDashboard_emptyMonth_returnsZeros() {
        FinanceController.Dashboard dashboard = FinanceController.getDashboard(MONTH_START.month(), MONTH_START.year());

        Assert.areEqual(0, dashboard.month.income);
        Assert.areEqual(0, dashboard.month.savingsRate);
        Assert.areEqual(0, dashboard.annualBalance);
        Assert.isTrue(dashboard.categories.isEmpty());
        Assert.isTrue(dashboard.currencyMix.isEmpty());
    }

    @IsTest
    static void getDashboard_annualBalance_coversTheWholeYear() {
        Date janFirst = Date.newInstance(MONTH_START.year(), 1, 1);
        insert new List<Finance_Transaction__c>{
            newTxn('Income', 'Salary', 5000, janFirst),
            newTxn('Expense', 'Home', 1200, MONTH_START),
            newTxn('Income', 'Salary', 7777, janFirst.addDays(-1))
        };

        FinanceController.Dashboard dashboard = FinanceController.getDashboard(MONTH_START.month(), MONTH_START.year());

        Assert.areEqual(3800, dashboard.annualBalance);
    }

    @IsTest
    static void getDashboard_categoryRows_reportBudgetStatus() {
        insert new List<Finance_Transaction__c>{
            newTxn('Expense', 'Food', 90, MONTH_START),
            newTxn('Expense', 'Travel', 150, MONTH_START),
            newTxn('Expense', 'Home', 50, MONTH_START)
        };
        insert new List<Finance_Budget__c>{
            new Finance_Budget__c(Category__c = 'Food', Monthly_Limit__c = 100),
            new Finance_Budget__c(Category__c = 'Travel', Monthly_Limit__c = 100),
            new Finance_Budget__c(Category__c = 'Health', Monthly_Limit__c = 60),
            new Finance_Budget__c(Category__c = 'Home', Monthly_Limit__c = 500)
        };

        Map<String, FinanceController.CategoryRow> rows = new Map<String, FinanceController.CategoryRow>();
        List<FinanceController.CategoryRow> ordered =
            FinanceController.getDashboard(MONTH_START.month(), MONTH_START.year()).categories;
        for (FinanceController.CategoryRow row : ordered) {
            rows.put(row.category, row);
        }

        Assert.areEqual('Travel', ordered[0].category, 'Rows are sorted by spend, largest first');
        Assert.areEqual(100, rows.get('Travel').pct);
        Assert.areEqual('over', rows.get('Travel').budgetStatus);
        Assert.areEqual(90, rows.get('Food').budgetPct);
        Assert.areEqual('warning', rows.get('Food').budgetStatus);
        Assert.areEqual('ok', rows.get('Home').budgetStatus);
        Assert.areEqual(0, rows.get('Health').total, 'Budgeted categories show up even with no spend');
    }

    @IsTest
    static void getDashboard_currencyMix_keepsOriginalAmounts() {
        insert new List<Finance_Transaction__c>{
            newTxn('Expense', 'Food', 20, MONTH_START),
            newForeignTxn('Expense', 'Travel', 85000, 'ARS', 0.001, MONTH_START),
            newForeignTxn('Income', 'Freelance', 800, 'USD', 1.5, MONTH_START)
        };

        List<FinanceController.CurrencyTotal> mix =
            FinanceController.getDashboard(MONTH_START.month(), MONTH_START.year()).currencyMix;

        Assert.areEqual(3, mix.size());
        Assert.areEqual('AUD', mix[0].currencyCode);
        Assert.areEqual('USD', mix[1].currencyCode);
        Assert.areEqual(800, mix[1].income);
        Assert.areEqual('ARS', mix[2].currencyCode);
        Assert.areEqual(85000, mix[2].expenses);
    }

    @IsTest
    static void getDashboard_trend_returnsTwelveMonthsEndingAtTheSelectedMonth() {
        insert new List<Finance_Transaction__c>{
            newTxn('Income', 'Salary', 100, MONTH_START),
            newTxn('Expense', 'Food', 40, MONTH_START.addMonths(-11)),
            newTxn('Expense', 'Food', 999, MONTH_START.addMonths(-12))
        };

        List<FinanceController.TrendPoint> trend =
            FinanceController.getDashboard(MONTH_START.month(), MONTH_START.year()).trend;

        Assert.areEqual(12, trend.size());
        Assert.areEqual(MONTH_START.month(), trend[11].month);
        Assert.areEqual(100, trend[11].income);
        Assert.areEqual(40, trend[0].expenses, 'The oldest bucket is 11 months back; anything older is excluded');
    }

    @IsTest
    static void getDashboard_invalidMonth_throws() {
        try {
            FinanceController.getDashboard(13, 2026);
            Assert.fail('Expected an error for month 13');
        } catch (AuraHandledException e) {
            Assert.areEqual('Invalid month or year.', errorMessageOf(e));
        }
    }

    @IsTest
    static void getDashboard_ignoresOtherUsersTransactions() {
        User other = createAppUser('fothr1');
        System.runAs(other) {
            insert newTxn('Income', 'Salary', 5000, MONTH_START);
        }

        FinanceController.Dashboard dashboard = FinanceController.getDashboard(MONTH_START.month(), MONTH_START.year());

        Assert.areEqual(0, dashboard.month.income);
    }

    // ─── Transactions ────────────────────────────────────────────────────────

    @IsTest
    static void getTransactions_paginatesFifteenPerPage() {
        List<Finance_Transaction__c> txns = new List<Finance_Transaction__c>();
        for (Integer i = 0; i < 20; i++) {
            txns.add(newTxn('Expense', 'Food', 10 + i, MONTH_START));
        }
        insert txns;

        FinanceController.PagedTransactions page1 =
            FinanceController.getTransactions(MONTH_START.month(), MONTH_START.year(), null, null, null, 1);
        FinanceController.PagedTransactions page2 =
            FinanceController.getTransactions(MONTH_START.month(), MONTH_START.year(), null, null, null, 2);

        Assert.areEqual(20, page1.totalCount);
        Assert.areEqual(15, page1.records.size());
        Assert.areEqual(5, page2.records.size());
    }

    @IsTest
    static void getTransactions_filtersBySearchTypeAndCategory() {
        Finance_Transaction__c coffee = newTxn('Expense', 'Food', 5, MONTH_START);
        coffee.Description__c = 'Morning coffee';
        Finance_Transaction__c groceries = newTxn('Expense', 'Food', 120, MONTH_START);
        groceries.Description__c = 'Woolworths groceries';
        Finance_Transaction__c train = newTxn('Expense', 'Transport', 4.20, MONTH_START);
        train.Description__c = 'Train to the coffee festival';
        Finance_Transaction__c salary = newTxn('Income', 'Salary', 3000, MONTH_START);
        insert new List<Finance_Transaction__c>{ coffee, groceries, train, salary };

        Integer m = MONTH_START.month();
        Integer y = MONTH_START.year();
        Assert.areEqual(2, FinanceController.getTransactions(m, y, 'coffee', null, null, 1).totalCount);
        Assert.areEqual(1, FinanceController.getTransactions(m, y, 'coffee', null, 'Food', 1).totalCount);
        Assert.areEqual(1, FinanceController.getTransactions(m, y, null, 'Income', null, 1).totalCount);
        Assert.areEqual(3, FinanceController.getTransactions(m, y, '', 'Expense', '', 1).totalCount);
    }

    @IsTest
    static void saveTransaction_createsForeignCurrencyTransaction() {
        FinanceController.TransactionInput figma = input('Expense', 'Technology', 20, MONTH_START);
        figma.currencyCode = 'USD';
        figma.exchangeRate = 1.42;
        figma.description = '  Figma subscription  ';
        figma.recurrence = 'Monthly';

        Id txnId = FinanceController.saveTransaction(figma);

        Finance_Transaction__c saved = [
            SELECT Amount_AUD__c, Currency__c, Description__c, Recurrence__c, OwnerId
            FROM Finance_Transaction__c WHERE Id = :txnId
        ];
        Assert.areEqual(28.40, saved.Amount_AUD__c);
        Assert.areEqual('USD', saved.Currency__c);
        Assert.areEqual('Figma subscription', saved.Description__c);
        Assert.areEqual('Monthly', saved.Recurrence__c);
        Assert.areEqual(UserInfo.getUserId(), saved.OwnerId);
    }

    @IsTest
    static void saveTransaction_audIgnoresAnySuppliedRate() {
        FinanceController.TransactionInput audTxn = input('Expense', 'Food', 50, MONTH_START);
        audTxn.exchangeRate = 3;

        Id txnId = FinanceController.saveTransaction(audTxn);

        Assert.areEqual(50, [SELECT Amount_AUD__c FROM Finance_Transaction__c WHERE Id = :txnId].Amount_AUD__c);
    }

    @IsTest
    static void saveTransaction_updatesOwnTransaction() {
        Finance_Transaction__c txn = newTxn('Expense', 'Food', 10, MONTH_START);
        insert txn;

        FinanceController.TransactionInput edit = input('Expense', 'Health', 75, MONTH_START);
        edit.id = txn.Id;
        FinanceController.saveTransaction(edit);

        txn = [SELECT Category__c, Amount_AUD__c FROM Finance_Transaction__c WHERE Id = :txn.Id];
        Assert.areEqual('Health', txn.Category__c);
        Assert.areEqual(75, txn.Amount_AUD__c);
    }

    @IsTest
    static void saveTransaction_cannotEditAnotherUsersTransaction() {
        Finance_Transaction__c mine = newTxn('Expense', 'Food', 10, MONTH_START);
        insert mine;

        User other = createAppUser('fothr2');
        System.runAs(other) {
            FinanceController.TransactionInput edit = input('Expense', 'Food', 99999, MONTH_START);
            edit.id = mine.Id;
            try {
                FinanceController.saveTransaction(edit);
                Assert.fail('Another user must not be able to edit this transaction');
            } catch (AuraHandledException e) {
                Assert.areEqual('Transaction not found.', errorMessageOf(e));
            }
        }
        Assert.areEqual(10, [SELECT Amount__c FROM Finance_Transaction__c WHERE Id = :mine.Id].Amount__c);
    }

    @IsTest
    static void saveTransaction_surfacesValidationErrors() {
        try {
            FinanceController.saveTransaction(input('Expense', 'Food', 0, MONTH_START));
            Assert.fail('Expected the positive-amount validation rule to fire');
        } catch (AuraHandledException e) {
            Assert.areEqual('Amount must be greater than zero.', errorMessageOf(e));
        }
    }

    @IsTest
    static void saveTransaction_rejectsUnsupportedCurrency() {
        FinanceController.TransactionInput euroTxn = input('Expense', 'Travel', 10, MONTH_START);
        euroTxn.currencyCode = 'EUR';
        try {
            FinanceController.saveTransaction(euroTxn);
            Assert.fail('Expected unsupported currency error');
        } catch (AuraHandledException e) {
            Assert.areEqual('Unsupported currency: EUR', errorMessageOf(e));
        }
    }

    @IsTest
    static void saveTransaction_allowsFutureDatedTransactions() {
        Id txnId = FinanceController.saveTransaction(input('Expense', 'Travel', 1450, Date.today().addMonths(3)));

        Assert.isNotNull(txnId);
    }

    @IsTest
    static void deleteTransaction_deletesOwnTransaction() {
        Finance_Transaction__c txn = newTxn('Expense', 'Food', 10, MONTH_START);
        insert txn;

        FinanceController.deleteTransaction(txn.Id);

        Assert.areEqual(0, [SELECT COUNT() FROM Finance_Transaction__c WHERE Id = :txn.Id]);
    }

    @IsTest
    static void deleteTransaction_cannotDeleteAnotherUsersTransaction() {
        Finance_Transaction__c mine = newTxn('Expense', 'Food', 10, MONTH_START);
        insert mine;

        User other = createAppUser('fothr3');
        System.runAs(other) {
            try {
                FinanceController.deleteTransaction(mine.Id);
                Assert.fail('Another user must not be able to delete this transaction');
            } catch (AuraHandledException e) {
                Assert.areEqual('Transaction not found.', errorMessageOf(e));
            }
        }
        Assert.areEqual(1, [SELECT COUNT() FROM Finance_Transaction__c WHERE Id = :mine.Id]);
    }

    // ─── Exchange rates ──────────────────────────────────────────────────────

    @IsTest
    static void getExchangeRate_returnsAudPerUnit() {
        Test.setMock(HttpCalloutMock.class, new ExchangeRateMock(200, '{"result":"success","rates":{"AUD":1.425788,"USD":1}}'));

        Test.startTest();
        Decimal rate = FinanceController.getExchangeRate('USD');
        Test.stopTest();

        Assert.areEqual(1.425788, rate);
    }

    @IsTest
    static void getExchangeRate_apiFailure_asksForManualEntry() {
        Test.setMock(HttpCalloutMock.class, new ExchangeRateMock(503, 'Service Unavailable'));

        Test.startTest();
        try {
            FinanceController.getExchangeRate('ARS');
            Assert.fail('Expected a friendly error');
        } catch (AuraHandledException e) {
            Assert.areEqual('Could not fetch the live exchange rate. Please enter it manually.', errorMessageOf(e));
        }
        Test.stopTest();
    }

    @IsTest
    static void getExchangeRate_malformedResponse_asksForManualEntry() {
        Test.setMock(HttpCalloutMock.class, new ExchangeRateMock(200, '{"result":"error"}'));

        Test.startTest();
        try {
            FinanceController.getExchangeRate('UYU');
            Assert.fail('Expected a friendly error');
        } catch (AuraHandledException e) {
            Assert.isTrue(errorMessageOf(e).startsWith('Could not fetch'));
        }
        Test.stopTest();
    }

    @IsTest
    static void getExchangeRate_audNeedsNoCallout() {
        Assert.areEqual(1, FinanceController.getExchangeRate('AUD'));
    }

    @IsTest
    static void getExchangeRate_rejectsUnsupportedCurrency() {
        try {
            FinanceController.getExchangeRate('BTC');
            Assert.fail('Expected unsupported currency error');
        } catch (AuraHandledException e) {
            Assert.areEqual('Unsupported currency: BTC', errorMessageOf(e));
        }
    }

    // ─── Recurring transactions ──────────────────────────────────────────────

    @IsTest
    static void materializeDueRecurrences_createsMissedOccurrencesAndHandsOverTheSchedule() {
        Date firstPayday = Date.today().addDays(-35);
        Finance_Transaction__c salary = newTxn('Income', 'Salary', 3100, firstPayday);
        salary.Recurrence__c = 'Fortnightly';
        insert salary;

        Integer created = FinanceController.materializeDueRecurrences();

        Assert.areEqual(2, created, 'Paydays 21 and 7 days ago were missed');
        List<Finance_Transaction__c> series = [
            SELECT Date__c, Recurrence__c, Next_Occurrence_Date__c, Amount_AUD__c
            FROM Finance_Transaction__c ORDER BY Date__c
        ];
        Assert.areEqual(3, series.size());
        Assert.areEqual('None', series[0].Recurrence__c);
        Assert.areEqual('None', series[1].Recurrence__c);
        Assert.areEqual('Fortnightly', series[2].Recurrence__c, 'The newest occurrence carries the schedule');
        Assert.areEqual(firstPayday.addDays(42), series[2].Next_Occurrence_Date__c);
        Assert.areEqual(3100, series[2].Amount_AUD__c);
        Assert.areEqual(0, FinanceController.materializeDueRecurrences(), 'Running again creates nothing new');
    }

    @IsTest
    static void materializeDueRecurrences_keepsTheLockedExchangeRate() {
        Finance_Transaction__c subscription = newForeignTxn('Expense', 'Technology', 20, 'USD', 1.4, Date.today().addMonths(-1));
        subscription.Recurrence__c = 'Monthly';
        insert subscription;

        FinanceController.materializeDueRecurrences();

        Finance_Transaction__c latest = [
            SELECT Currency__c, Exchange_Rate__c, Amount_AUD__c FROM Finance_Transaction__c
            WHERE Recurrence__c = 'Monthly' LIMIT 1
        ];
        Assert.areEqual('USD', latest.Currency__c);
        Assert.areEqual(1.4, latest.Exchange_Rate__c);
        Assert.areEqual(28, latest.Amount_AUD__c);
    }

    @IsTest
    static void materializeDueRecurrences_leavesOtherUsersAlone() {
        User other = createAppUser('fothr4');
        System.runAs(other) {
            Finance_Transaction__c theirs = newTxn('Expense', 'Home', 550, Date.today().addDays(-7));
            theirs.Recurrence__c = 'Weekly';
            insert theirs;
        }

        Assert.areEqual(0, FinanceController.materializeDueRecurrences());
    }

    // ─── Budgets ─────────────────────────────────────────────────────────────

    @IsTest
    static void saveBudgets_insertsUpdatesAndRemoves() {
        FinanceController.saveBudgets(new List<FinanceController.BudgetInput>{
            budget('Food', 700), budget('Entertainment', 200), budget('Travel', 500)
        });
        FinanceController.saveBudgets(new List<FinanceController.BudgetInput>{
            budget('Food', 650), budget('Entertainment', null), budget('Travel', 0), budget('Health', 100)
        });

        Map<String, Decimal> limits = new Map<String, Decimal>();
        for (FinanceController.BudgetInput entry : FinanceController.getBudgets()) {
            limits.put(entry.category, entry.monthlyLimit);
        }
        Assert.areEqual(new Set<String>{ 'Food', 'Health' }, limits.keySet());
        Assert.areEqual(650, limits.get('Food'));
    }

    @IsTest
    static void saveBudgets_rejectsUnknownCategory() {
        try {
            FinanceController.saveBudgets(new List<FinanceController.BudgetInput>{ budget('Yachts', 100) });
            Assert.fail('Expected unknown category error');
        } catch (AuraHandledException e) {
            Assert.areEqual('Unknown category: Yachts', errorMessageOf(e));
        }
    }

    @IsTest
    static void budgets_arePrivateToEachUser() {
        FinanceController.saveBudgets(new List<FinanceController.BudgetInput>{ budget('Food', 700) });

        User other = createAppUser('fothr5');
        System.runAs(other) {
            Assert.isTrue(FinanceController.getBudgets().isEmpty());
            FinanceController.saveBudgets(new List<FinanceController.BudgetInput>{ budget('Food', 300) });
        }

        Assert.areEqual(700, FinanceController.getBudgets()[0].monthlyLimit);
    }

    // ─── Permission set sufficiency ──────────────────────────────────────────

    @IsTest
    static void standardUserWithPermissionSet_canUseTheWholeApp() {
        User appUser = createAppUser('fapp1');
        System.runAs(appUser) {
            FinanceController.TransactionInput rent = input('Expense', 'Home', 550, MONTH_START);
            rent.recurrence = 'Weekly';
            rent.description = 'Rent';
            Id rentId = FinanceController.saveTransaction(rent);

            FinanceController.saveBudgets(new List<FinanceController.BudgetInput>{ budget('Home', 2400) });
            FinanceController.materializeDueRecurrences();

            FinanceController.Dashboard dashboard = FinanceController.getDashboard(MONTH_START.month(), MONTH_START.year());
            Assert.isTrue(dashboard.month.expenses >= 550);
            Assert.areEqual(2400, dashboard.categories[0].budget);

            FinanceController.PagedTransactions page =
                FinanceController.getTransactions(MONTH_START.month(), MONTH_START.year(), 'rent', 'Expense', 'Home', 1);
            Assert.isTrue(page.totalCount >= 1);

            FinanceController.deleteTransaction(rentId);
        }
    }
}
