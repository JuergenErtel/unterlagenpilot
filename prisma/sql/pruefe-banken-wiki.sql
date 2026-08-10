SELECT table_name FROM information_schema.tables
WHERE table_schema = 'unterlagenpilot' AND table_name IN ('banken','bank_kriterien')
ORDER BY table_name;
