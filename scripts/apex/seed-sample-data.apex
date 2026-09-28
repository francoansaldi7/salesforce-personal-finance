// Optional sample data for the Personal Finance app.
// Run ONCE as a user with the Finance_Full_Access permission set:
//   sf apex run --file scripts/apex/seed-sample-data.apex --target-org <alias>
//
// Loads ~9 months of history ending in the current month (salary, rent, subscriptions, groceries,
// freelance income in USD, a trip paid in UYU/ARS), two planned future expenses, and 7 budgets.
// Dates are relative to today, so the dashboard always looks current. Recurring series are seeded
// with their first occurrence only; the app's own materializeDueRecurrences() generates the rest.
// Format: type|category|amount|currency|rateToAud|monthOffset|dayOfMonth|description|recurrence

List<String> rows = new List<String>{
    'Income|Salary|3150|AUD||-8|8|Salary - Acme Digital|Fortnightly',
    'Expense|Home|560|AUD||-8|5|Rent|Weekly',
    'Expense|Subscriptions|18.99|AUD||-8|12|Netflix|Monthly',
    'Expense|Subscriptions|13.99|AUD||-8|3|Spotify|Monthly',
    'Expense|Health|65|AUD||-8|15|Gym membership|Monthly',
    'Expense|Technology|45|AUD||-8|20|Phone plan|Monthly',
    'Expense|Home|75|AUD||-8|18|Home internet|Monthly',
    'Expense|Technology|15|USD|1.5|-8|22|Figma subscription|Monthly',
    'Expense|Food|120.91|AUD||-8|3|Coles groceries|None',
    'Expense|Food|126.59|AUD||-8|10|Woolworths groceries|None',
    'Expense|Food|100.79|AUD||-8|17|Woolworths groceries|None',
    'Expense|Food|124.26|AUD||-8|24|Woolworths groceries|None',
    'Expense|Food|167.78|AUD||-8|31|Coles groceries|None',
    'Expense|Food|98.0|AUD||-7|7|Harris Farm groceries|None',
    'Expense|Food|128.45|AUD||-7|14|Coles groceries|None',
    'Expense|Food|102.26|AUD||-7|21|Harris Farm groceries|None',
    'Expense|Food|99.73|AUD||-7|28|Woolworths groceries|None',
    'Expense|Food|170.8|AUD||-6|7|Woolworths groceries|None',
    'Expense|Food|141.17|AUD||-6|14|Harris Farm groceries|None',
    'Expense|Food|98.97|AUD||-6|21|Coles groceries|None',
    'Expense|Food|98.73|AUD||-6|28|Coles groceries|None',
    'Expense|Food|118.17|AUD||-5|4|Coles groceries|None',
    'Expense|Food|138.25|AUD||-5|11|Aldi groceries|None',
    'Expense|Food|139.82|AUD||-5|18|Coles groceries|None',
    'Expense|Food|103.24|AUD||-5|25|Coles groceries|None',
    'Expense|Food|124.79|AUD||-4|2|Woolworths groceries|None',
    'Expense|Food|140.15|AUD||-4|9|Coles groceries|None',
    'Expense|Food|134.71|AUD||-4|16|Harris Farm groceries|None',
    'Expense|Food|157.18|AUD||-4|23|Harris Farm groceries|None',
    'Expense|Food|141.84|AUD||-4|30|Harris Farm groceries|None',
    'Expense|Food|123.93|AUD||-3|6|Coles groceries|None',
    'Expense|Food|158.55|AUD||-3|13|Coles groceries|None',
    'Expense|Food|101.55|AUD||-3|20|Aldi groceries|None',
    'Expense|Food|137.02|AUD||-3|27|Aldi groceries|None',
    'Expense|Food|153.36|AUD||-2|4|Aldi groceries|None',
    'Expense|Food|143.72|AUD||-2|11|Woolworths groceries|None',
    'Expense|Food|104.45|AUD||-2|18|Harris Farm groceries|None',
    'Expense|Food|108.2|AUD||-2|25|Aldi groceries|None',
    'Expense|Food|107.16|AUD||-1|1|Harris Farm groceries|None',
    'Expense|Food|128.74|AUD||-1|8|Woolworths groceries|None',
    'Expense|Food|156.17|AUD||-1|15|Aldi groceries|None',
    'Expense|Food|122.21|AUD||-1|22|Aldi groceries|None',
    'Expense|Food|142.55|AUD||-1|29|Harris Farm groceries|None',
    'Expense|Food|100.5|AUD||0|5|Woolworths groceries|None',
    'Expense|Food|170.57|AUD||0|12|Harris Farm groceries|None',
    'Expense|Food|150.76|AUD||0|19|Woolworths groceries|None',
    'Expense|Food|99.85|AUD||0|26|Aldi groceries|None',
    'Expense|Food|73.07|AUD||-8|22|Thai takeaway|None',
    'Expense|Food|66.01|AUD||-8|20|Thai takeaway|None',
    'Expense|Food|19.51|AUD||-8|23|Pizza night|None',
    'Expense|Transport|50|AUD||-8|4|Opal card top-up|None',
    'Expense|Transport|50|AUD||-8|19|Opal card top-up|None',
    'Expense|Entertainment|58.77|AUD||-8|21|Cinema|None',
    'Expense|Health|29.81|AUD||-8|8|Pharmacy|None',
    'Expense|Food|67.47|AUD||-7|26|Pizza night|None',
    'Expense|Food|44.19|AUD||-7|11|Pizza night|None',
    'Expense|Food|23.4|AUD||-7|6|Pizza night|None',
    'Expense|Transport|50|AUD||-7|4|Opal card top-up|None',
    'Expense|Transport|50|AUD||-7|19|Opal card top-up|None',
    'Expense|Entertainment|63.16|AUD||-7|10|Concert tickets|None',
    'Expense|Clothing & Shoes|138.31|AUD||-7|19|Winter jacket|None',
    'Expense|Food|63.74|AUD||-6|24|Pizza night|None',
    'Expense|Food|82.17|AUD||-6|15|Coffee & brunch|None',
    'Expense|Food|23.56|AUD||-6|13|Coffee & brunch|None',
    'Expense|Transport|50|AUD||-6|4|Opal card top-up|None',
    'Expense|Transport|50|AUD||-6|19|Opal card top-up|None',
    'Expense|Entertainment|47.04|AUD||-6|9|Cinema|None',
    'Expense|Food|35.6|AUD||-5|17|Dinner out|None',
    'Expense|Food|27.76|AUD||-5|20|Sushi with friends|None',
    'Expense|Food|42.74|AUD||-5|7|Sushi with friends|None',
    'Expense|Transport|50|AUD||-5|4|Opal card top-up|None',
    'Expense|Transport|50|AUD||-5|19|Opal card top-up|None',
    'Expense|Entertainment|55.27|AUD||-5|6|Footy tickets|None',
    'Expense|Clothing & Shoes|154.03|AUD||-5|22|Uniqlo|None',
    'Expense|Health|28.7|AUD||-5|26|Pharmacy|None',
    'Expense|Food|44.67|AUD||-4|23|Pizza night|None',
    'Expense|Food|24.94|AUD||-4|19|Pizza night|None',
    'Expense|Food|22.17|AUD||-4|14|Dinner out|None',
    'Expense|Transport|50|AUD||-4|4|Opal card top-up|None',
    'Expense|Transport|50|AUD||-4|19|Opal card top-up|None',
    'Expense|Entertainment|118.54|AUD||-4|16|Concert tickets|None',
    'Expense|Food|21.52|AUD||-3|5|Dinner out|None',
    'Expense|Food|55.97|AUD||-3|12|Sushi with friends|None',
    'Expense|Food|24.8|AUD||-3|21|Thai takeaway|None',
    'Expense|Transport|50|AUD||-3|4|Opal card top-up|None',
    'Expense|Transport|50|AUD||-3|19|Opal card top-up|None',
    'Expense|Entertainment|83.31|AUD||-3|4|Concert tickets|None',
    'Expense|Clothing & Shoes|113.69|AUD||-3|6|Winter jacket|None',
    'Expense|Food|26.23|AUD||-2|13|Pizza night|None',
    'Expense|Food|84.54|AUD||-2|21|Pizza night|None',
    'Expense|Food|50.19|AUD||-2|17|Thai takeaway|None',
    'Expense|Transport|50|AUD||-2|4|Opal card top-up|None',
    'Expense|Transport|50|AUD||-2|19|Opal card top-up|None',
    'Expense|Entertainment|33.16|AUD||-2|5|Bowling|None',
    'Expense|Health|37.21|AUD||-2|17|Pharmacy|None',
    'Expense|Food|19.55|AUD||-1|24|Sushi with friends|None',
    'Expense|Food|42.24|AUD||-1|7|Sushi with friends|None',
    'Expense|Food|79.25|AUD||-1|18|Sushi with friends|None',
    'Expense|Transport|50|AUD||-1|4|Opal card top-up|None',
    'Expense|Transport|50|AUD||-1|19|Opal card top-up|None',
    'Expense|Entertainment|53.32|AUD||-1|22|Cinema|None',
    'Expense|Clothing & Shoes|123.54|AUD||-1|10|Winter jacket|None',
    'Expense|Food|32.93|AUD||0|7|Sushi with friends|None',
    'Expense|Food|70.2|AUD||0|13|Thai takeaway|None',
    'Expense|Food|60.64|AUD||0|26|Sushi with friends|None',
    'Expense|Transport|50|AUD||0|4|Opal card top-up|None',
    'Expense|Transport|50|AUD||0|19|Opal card top-up|None',
    'Expense|Entertainment|102.09|AUD||0|26|Concert tickets|None',
    'Expense|Home|246.43|AUD||-7|14|Electricity bill|None',
    'Expense|Home|247.28|AUD||-4|14|Electricity bill|None',
    'Expense|Home|241.79|AUD||-1|14|Electricity bill|None',
    'Income|Investments|79.07|AUD||-6|21|ETF dividends|None',
    'Income|Investments|90.71|AUD||-3|21|ETF dividends|None',
    'Income|Investments|84.22|AUD||0|21|ETF dividends|None',
    'Income|Freelance|800|USD|1.53|-7|17|Freelance Salesforce project|None',
    'Income|Freelance|1200|USD|1.51|-4|12|Freelance Salesforce project|None',
    'Income|Freelance|950|USD|1.43|-1|11|Freelance Salesforce project|None',
    'Income|Freelance|600|USD|1.4258|0|16|Freelance Salesforce project|None',
    'Expense|Education|19.99|USD|1.52|-6|9|Udemy LWC course|None',
    'Expense|Education|19.99|USD|1.4258|0|7|Udemy Apex course|None',
    'Income|Refund / Reward|1240|AUD||-2|28|Tax refund|None',
    'Expense|Travel|1850|AUD||-4|20|Flights to Montevideo|None',
    'Expense|Travel|12400|UYU|0.0356|-2|6|Hotel in Montevideo|None',
    'Expense|Travel|3900|UYU|0.0356|-2|9|Ferry to Colonia|None',
    'Expense|Other Expenses|5200|UYU|0.0356|-2|10|Gifts for family|None',
    'Expense|Food|85000|ARS|0.00094|-2|13|Asado with family|None',
    'Expense|Food|62000|ARS|0.00094|-2|15|Dinner in Palermo|None',
    'Expense|Transport|18500|ARS|0.00094|-2|16|Taxis in Buenos Aires|None',
    'Expense|Entertainment|145|AUD||0|20|Concert tickets|None',
    'Expense|Food|62.4|AUD||0|27|Harris Farm groceries|None',
    'Expense|Transport|890|AUD||2|10|Car registration|None',
    'Expense|Travel|1200|AUD||3|15|Christmas flights to Melbourne|None'
};

Date monthStart = Date.today().toStartOfMonth();
List<Finance_Transaction__c> transactions = new List<Finance_Transaction__c>();
for (String row : rows) {
    List<String> f = row.split('\\|', -1);
    Date txnDate = monthStart.addMonths(Integer.valueOf(f[5])).addDays(Integer.valueOf(f[6]) - 1);
    Boolean isRecurring = f[8] != 'None';
    // Skip one-off items later this month, so "this month" only shows what has already happened.
    if (!isRecurring && Integer.valueOf(f[5]) == 0 && txnDate > Date.today()) {
        continue;
    }
    transactions.add(new Finance_Transaction__c(
        Type__c = f[0],
        Category__c = f[1],
        Amount__c = Decimal.valueOf(f[2]),
        Currency__c = f[3],
        Exchange_Rate__c = String.isBlank(f[4]) ? null : Decimal.valueOf(f[4]),
        Date__c = txnDate,
        Description__c = f[7],
        Recurrence__c = f[8]
    ));
}
insert transactions;
Integer generated = FinanceController.materializeDueRecurrences();

Map<String, Decimal> limits = new Map<String, Decimal>{
    'Food' => 900, 'Entertainment' => 200, 'Transport' => 150, 'Subscriptions' => 60,
    'Travel' => 1000, 'Clothing & Shoes' => 150, 'Health' => 150
};
List<FinanceController.BudgetInput> budgets = new List<FinanceController.BudgetInput>();
for (String category : limits.keySet()) {
    FinanceController.BudgetInput budget = new FinanceController.BudgetInput();
    budget.category = category;
    budget.monthlyLimit = limits.get(category);
    budgets.add(budget);
}
FinanceController.saveBudgets(budgets);

System.debug('Sample data loaded: ' + transactions.size() + ' transactions, '
    + generated + ' recurring occurrences, ' + budgets.size() + ' budgets.');
