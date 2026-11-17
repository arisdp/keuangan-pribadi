import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Add a boolean state to track postgres loading
content = content.replace(
    'const [cloudSync, setCloudSync] = useState<boolean>(false);',
    'const [cloudSync, setCloudSync] = useState<boolean>(false);\n  const [loadingPg, setLoadingPg] = useState<boolean>(false);'
)

pg_load_effect = """
  // Download from Postgres on login
  useEffect(() => {
    if (currentUser) {
      const loadPgData = async () => {
        setLoadingPg(true);
        try {
          const pgData = await syncFromPostgres();
          if (pgData) {
            if (pgData.transactions && pgData.transactions.length > 0) setTransactions(pgData.transactions);
            if (pgData.accounts && pgData.accounts.length > 0) setAccounts(pgData.accounts);
            if (pgData.budgets && pgData.budgets.length > 0) setBudgets(pgData.budgets);
            if (pgData.debts && pgData.debts.length > 0) setDebts(pgData.debts);
            if (pgData.investments && pgData.investments.length > 0) setInvestments(pgData.investments);
            if (pgData.emergencyConfig) setEmergencyConfig(pgData.emergencyConfig);
            if (pgData.emergencyTransactions && pgData.emergencyTransactions.length > 0) setEmergencyTransactions(pgData.emergencyTransactions);
            if (pgData.recurringTransactions && pgData.recurringTransactions.length > 0) setRecurringTransactions(pgData.recurringTransactions);
            if (pgData.savingsGoals && pgData.savingsGoals.length > 0) setSavingsGoals(pgData.savingsGoals);
          }
        } catch (e) {
          console.error("Gagal load dari Postgres:", e);
        } finally {
          setLoadingPg(false);
        }
      };
      loadPgData();
    }
  }, [currentUser]);
"""

pg_save_effect = """
  // Upload to Postgres on state change
  useEffect(() => {
    if (currentUser && !loadingPg) {
      syncToPostgres({
        transactions,
        accounts,
        budgets,
        debts,
        investments,
        recurringTransactions,
        savingsGoals,
        emergencyConfig,
        emergencyTransactions
      }).catch((err) => console.error("Gagal save ke Postgres:", err));
    }
  }, [
    transactions,
    accounts,
    budgets,
    debts,
    investments,
    recurringTransactions,
    savingsGoals,
    emergencyConfig,
    emergencyTransactions,
    currentUser,
    loadingPg
  ]);
"""

# Insert the effects right before the Google Sheets effect
idx = content.find('// Download from Cloud on login')
if idx != -1:
    content = content[:idx] + pg_load_effect + '\n' + pg_save_effect + '\n' + content[idx:]
    with open('src/App.tsx', 'w') as f:
        f.write(content)
    print("Patched successfully")
else:
    print("Could not find insertion point")
