SELECT 'tabelle' AS art, table_name AS name FROM information_schema.tables
WHERE table_schema = 'unterlagenpilot' AND table_name = 'document_split_segments'
UNION ALL
SELECT 'spalte', column_name FROM information_schema.columns
WHERE table_schema = 'unterlagenpilot' AND table_name = 'documents'
  AND column_name IN ('splitStatus', 'aufgeteiltAusId');
