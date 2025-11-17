#!/bin/bash
# Quick fix script for Returns Impact Card

cd /Users/samwilhoit/Documents/sales-dashboard

echo "🔧 Fixing Returns Card..."
echo ""

echo "1. Checking BigQuery data..."
bq query --use_legacy_sql=false "SELECT COUNT(*) as returns, ROUND(SUM(refund_amount), 2) as refunds FROM \`intercept-sales-2508061117.amazon_seller.returns\`"

echo ""
echo "2. Testing API..."
API_RESPONSE=$(curl -s http://localhost:3000/api/amazon/returns/summary)
echo "$API_RESPONSE" | python3 -m json.tool

echo ""
echo "3. Checking if data exists..."
RETURN_COUNT=$(echo "$API_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('total_returns', 0))" 2>/dev/null || echo "0")

if [ "$RETURN_COUNT" -eq "0" ]; then
    echo "⚠️  No returns data found. Re-syncing..."
    python3 sync-amazon-returns.py
    echo ""
    echo "Waiting 10 seconds for API to refresh..."
    sleep 10
else
    echo "✅ Data exists: $RETURN_COUNT returns"
fi

echo ""
echo "4. Testing API again..."
curl -s http://localhost:3000/api/amazon/returns/summary | python3 -m json.tool | head -20

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Fix complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Open dashboard: http://localhost:3000/dashboard/overview"
echo ""
echo "🔄 Hard refresh browser:"
echo "   Mac: Cmd + Shift + R"
echo "   Windows: Ctrl + Shift + R"
echo ""
echo "🐛 Check browser console (F12) for debug logs:"
echo "   - 'Overview Page - Returns Data'"
echo "   - 'Returns Impact Card Data'"
echo ""

