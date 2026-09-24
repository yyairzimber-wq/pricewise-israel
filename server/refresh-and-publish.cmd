@echo off
rem PriceWise: one refresh cycle (ingest -> geocode -> publish to Vercel).
rem Run by the "PriceWise Refresh" scheduled task; log: server\data\refresh.log
cd /d "%~dp0.."
"C:\Program Files\nodejs\node.exe" server\src\cli.ts refresh --stores all --publish-vercel >> server\data\refresh.log 2>&1
