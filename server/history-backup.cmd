@echo off
rem PriceWise: weekly backup of the price history (published site -> GitHub release "history-backups").
rem Run by the "PriceWise History Backup" scheduled task; log: server\data\history-backup.log
cd /d "%~dp0.."
"C:\Program Files\nodejs\node.exe" server\src\cli.ts history-backup >> server\data\history-backup.log 2>&1
