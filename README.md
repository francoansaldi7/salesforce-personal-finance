# Salesforce Personal Finance

A multi-currency personal finance tracker built entirely on the Salesforce Platform with Lightning Web Components and Apex. Log income and expenses in Australian dollars, US dollars, Uruguayan pesos or Argentine pesos. The app converts each one at a live exchange rate, locks that rate in, and reports everything in AUD: monthly KPIs, spending by category against budgets, and a 12-month income vs. expenses trend.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Features

### Tracking
- **Income and expenses** with categories that depend on the type (6 income categories, 12 expense categories)
- **Multi-currency**: AUD by default, or USD, UYU or ARS per transaction. Choosing a foreign currency prefills the **live exchange rate**, which you can override. The rate is locked in when you save, so past months never change.
- **Edit any transaction**, **search** descriptions, **filter** by type and category, **15 per page**
- **Recurring transactions**: weekly, fortnightly or monthly (rent, salary, subscriptions). Missed occurrences are created automatically.
- **Planned transactions** up to 12 months ahead. Future months are flagged "Planned".
- **Undo delete**: a deleted transaction disappears straight away, with a 5-second Undo before it's actually removed

### Insight
- **Monthly KPIs**: income, expenses, net balance and savings rate, plus the month's and the year's balance in the header
- **Currency mix**: what the month contained in each original currency, e.g. `US$800 in · AR$85,000 out`
- **Spending by category with monthly budgets**: a progress bar per budget that turns amber at 80% and red once you go over
- **12-month trend chart** of income vs. expenses, with hover tooltips (plain SVG, no chart library)

### Design
- Dark theme, built entirely from custom components, including a themed dropdown and loading states instead of the standard Salesforce ones
- Responsive: one column on phones, two on desktop
- Accessible: dropdowns work fully from the keyboard, chart bars have screen-reader labels, and animations respect `prefers-reduced-motion`

## How multi-currency works

Salesforce has a built-in Multi-Currency feature, but this app deliberately doesn't use it. Enabling it **can't be undone**, it changes the whole org, and anyone deploying this repo would have to enable it in their own org first. Instead, each transaction stores:

| Field | Example | Purpose |
|---|---|---|
| `Amount__c` | `85,000` | What you actually paid, in the original currency |
| `Currency__c` | `ARS` | AUD, USD, UYU or ARS |
| `Exchange_Rate__c` | `0.00094` | AUD per 1 unit of that currency, **locked in when saved** |
| `Amount_AUD__c` | `79.90` | Calculated by the trigger. A real stored field rather than a formula, so it can be summed with `SUM()` in aggregate SOQL. |

Every total in the app is a simple `SUM(Amount_AUD__c)`, so changing exchange rates never alter past months, just like a bank statement. The transaction list shows the original amount with its AUD equivalent underneath.

**Live rates** come from [ExchangeRate-API](https://www.exchangerate-api.com)'s free, keyless endpoint through an Apex callout. The Remote Site Setting it needs is deployed with the app. If the call fails, the form asks you to type the rate yourself. Recurring transactions reuse the rate their series was saved with.

## Security

- **Private sharing** on both objects: nobody can see another user's transactions or budgets
- **Every query filters by `OwnerId`** and runs in **`USER_MODE`**, and so does every DML statement (`AccessLevel.USER_MODE`). Object permissions, field-level security and sharing are therefore enforced even for administrators.
- **Protection against editing other users' records by ID**: edit and delete re-check ownership on the server, so a user can't change or delete someone else's transaction even if they know its record ID
- **Injection-safe dynamic SOQL**: the transaction list's filters use `Database.queryWithBinds`. Only fixed query fragments are joined together; every value the user types is a bind variable.
- **Validated callout**: the currency is checked against an allow-list before the exchange-rate URL is built
- **Least-privilege permission set** (`Finance_Full_Access`): it grants only what the app needs. The Apex tests run the whole app as a **Standard User holding only this permission set**, proving it's sufficient.

## Architecture

```
force-app/main/default/
├── applications/Personal_Finance.app-meta.xml     # Lightning app (lands on the dashboard)
├── classes/
│   ├── FinanceController.cls                      # All server-side logic (see below)
│   ├── FinanceTransactionTriggerHandler.cls       # AUD conversion + recurrence scheduling
│   └── FinanceControllerTest.cls                  # 38 tests
├── triggers/FinanceTransactionTrigger.trigger
├── objects/
│   ├── Finance_Transaction__c/                    # Transactions, fields, list views, validation rules
│   └── Finance_Budget__c/                         # One monthly AUD limit per expense category
├── lwc/                                           # 10 components (see below)
├── flexipages/Personal_Finance_Home.flexipage-meta.xml
├── tabs/                                          # Dashboard tab + Transactions object tab
├── permissionsets/Finance_Full_Access.permissionset-meta.xml
├── remoteSiteSettings/ExchangeRate_API.remoteSite-meta.xml
└── contentassets/personalFinanceLogo.*            # App logo
scripts/apex/seed-sample-data.apex                 # Optional demo data
```

### Apex: `FinanceController`

| Method | Purpose |
|---|---|
| `getDashboard(month, year)` | One call for the whole dashboard: month and year balances, category totals with budget status, currency mix, and the 12-month trend |
| `getTransactions(month, year, searchTerm, typeFilter, categoryFilter, pageNumber)` | The transaction list: filtered and paginated (15 per page), with a total count |
| `saveTransaction(input)` | Creates a transaction or updates one you own |
| `deleteTransaction(transactionId)` | Deletes a transaction you own |
| `getExchangeRate(currencyCode)` | Live AUD rate for USD / UYU / ARS |
| `materializeDueRecurrences()` | Creates every recurring occurrence whose date has arrived; runs when the dashboard loads |
| `getBudgets()` / `saveBudgets(budgets)` | Read and save the monthly limits; a blank limit removes that category's budget |

`FinanceTransactionTrigger` (before insert/update) sets the AUD rate to 1, calculates `Amount_AUD__c`, and schedules `Next_Occurrence_Date__c`. Because this lives in a trigger, it holds for records created anywhere: the app, the standard Transactions tab, or the API. In a recurring series only the **newest** occurrence carries the schedule, so stopping a series means editing its latest entry.

### Lightning Web Components

- **`financeHome`**: the dashboard shell. Handles month navigation (up to 12 months ahead), loads the dashboard, and ignores out-of-date responses when you click through months quickly.
- **`financeKpis`**: the four KPI tiles and the currency-mix line
- **`financeCategoryBreakdown`**: spending by category with budget progress bars
- **`financeTrendChart`**: the 12-month SVG bar chart with tooltips
- **`financeTransactionList`**: search, filters, pagination, edit, and undo-delete
- **`financeTransactionModal`**: the add/edit form, with currency and live-rate prefill
- **`financeBudgetModal`**: sets a monthly limit per expense category
- **`financeSelect`**: a themed, keyboard-accessible replacement for `lightning-combobox`, whose option list can't be styled from outside
- **`financeUtils`** (shared JavaScript) and **`financeStyles`** (shared CSS)

### Data model

**`Finance_Transaction__c`**: `Type__c` (Income/Expense), `Category__c` (depends on Type), `Amount__c`, `Currency__c`, `Exchange_Rate__c`, `Amount_AUD__c`, `Date__c`, `Description__c`, `Recurrence__c` (None/Weekly/Fortnightly/Monthly), `Next_Occurrence_Date__c`, plus the formula fields `Signed_Amount__c` and `Month_Year__c` for reports.

**`Finance_Budget__c`**: `Category__c` and `Monthly_Limit__c` (AUD), one per category per user.

## Deployment

Requires the [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli).

```bash
# 1. Authorize the target org
sf org login web --alias myOrg

# 2. Deploy everything (objects, Apex, components, app, permission set, Remote Site Setting)
sf project deploy start --target-org myOrg

# 3. Give yourself access to the app
sf org assign permset --name Finance_Full_Access --target-org myOrg

# 4. (Optional) Load ~9 months of realistic sample data ending this month. Run it once.
sf apex run --file scripts/apex/seed-sample-data.apex --target-org myOrg
```

Then open **Personal Finance** from the App Launcher. Every user of the app needs the `Finance_Full_Access` permission set.

## Testing

**Apex**: 38 tests covering every controller method and the trigger. They include cross-user tests (another user can't read, edit or delete your transactions, or see your budgets), mocked exchange-rate callouts (success, error and malformed responses), recurrence catch-up, and a full run of the app as a Standard User with only the permission set.

```bash
sf apex run test --class-names FinanceControllerTest --code-coverage --result-format human --target-org myOrg
```

**LWC (Jest)**: 60 tests covering rendering, formatting, filters, pagination, undo-delete, the live-rate form, budgets, chart tooltips, dropdown keyboard support, and ignoring out-of-date responses.

```bash
npm install
npm run test:unit
```

## Known limitations

- **Live rates are today's rates.** The free API has no historical endpoint, so a back-dated transaction is prefilled with today's rate. It's editable if you know the rate on the day.
- **Recurring transactions are created when the dashboard loads.** There's no scheduled job; a series catches up on the next visit. For a personal app that gets opened regularly, this is a deliberate low-complexity choice.
- **The dashboard refreshes after changes you make in the app.** Changes made elsewhere, such as the standard Transactions tab or another device, appear on the next load.
- **Four currencies.** Adding one means a new `Currency__c` picklist value, an entry in the controller's allow-list, and a symbol in `financeUtils`.

## Credits

Exchange rates: [Rates By Exchange Rate API](https://www.exchangerate-api.com).
