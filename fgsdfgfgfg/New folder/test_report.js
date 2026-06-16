import { db } from './src/services/firebase.js';
import reportService from './src/services/ReportService.js';

async function verifyReportLogic() {
    console.log('🧪 Testing ReportService.generateWeeklyStats()...');

    // Seed test data for 'report_test_user'
    const userId = 'report_test_user';

    // Clear old data
    const oldDocs = await db.ledger.where('userId', '==', userId).get();
    for (let doc of oldDocs.docs) {
        await doc.ref.delete();
    }

    // Insert 2 records within the last 7 days, and 1 older record
    const today = new Date();

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(today.getDate() - 3);

    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(today.getDate() - 10);

    // Record A (Last 7 Days)
    await db.ledger.add({
        type: 'COMPLETED_DATA', userId,
        amount: 250, settlement: { coMemberShare: 50 }, buyerPhone: '2348000000001',
        createdAt: threeDaysAgo.toISOString()
    });

    // Record B (Last 7 Days - Same buyer)
    await db.ledger.add({
        type: 'COMPLETED_DATA', userId,
        amount: 400, settlement: { coMemberShare: 100 }, buyerPhone: '2348000000001',
        createdAt: today.toISOString()
    });

    // Record C (Older than 7 Days - Different buyer)
    await db.ledger.add({
        type: 'COMPLETED_DATA', userId,
        amount: 1000, settlement: { coMemberShare: 200 }, buyerPhone: '2348000000002',
        createdAt: tenDaysAgo.toISOString()
    });

    // Generate stats
    console.log(`\nGenerating report for ${userId}...`);
    const stats = await reportService.generateWeeklyStats(userId);

    if (stats) {
        console.log(`✅ Success! Data returned:`);
        console.log(`Orders Processed: ${stats.totalOrders} (Expected: 2)`);
        console.log(`Gross Revenue: ${stats.grossRevenue} (Expected: 650)`);
        console.log(`Net Profit: ${stats.netProfit} (Expected: 150)`);
        console.log(`Active Customers: ${stats.activeCustomers} (Expected: 1)`);
    } else {
        console.log('❌ Failed: Stats returned null.');
    }

    process.exit(0);
}

verifyReportLogic();
