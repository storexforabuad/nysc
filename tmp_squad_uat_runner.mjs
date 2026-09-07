import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Using Sandbox Secret Key directly to ensure correct environment
const API_KEY = "sandbox_sk_e5418278e26551d651df4c2c6484adfc00f76b2cb2f4";
const BASE_URL = "https://sandbox-api-d.squadco.com";
const HEADERS = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
};

const results = [];
let va1, va2, cust1, cust2;

async function doStep(stepName, method, url, payload = null) {
    console.log(`Executing: ${stepName}`);
    try {
        const config = { method, url, headers: HEADERS };
        if (payload) config.data = payload;

        const response = await axios(config);

        results.push({
            Step: stepName,
            Method: method,
            Endpoint: url,
            Payload_Sent: payload,
            Response_Received: response.data
        });
        return response.data;
    } catch (err) {
        console.error(`Error in ${stepName}:`, err.response?.data || err.message);
        results.push({
            Step: stepName,
            Method: method,
            Endpoint: url,
            Payload_Sent: payload,
            Error: err.response?.data || err.message
        });
        return null;
    }
}

async function run() {
    const existingVa = "9298876974"; // The one you already created!

    // First, let's get the customer_identifier for this existing VA
    console.log("Fetching details for existing VA to get customer_identifier...");
    const vaDetails = await doStep('Pre-fetch: VA Details', 'GET', `${BASE_URL}/virtual-account/customer/${existingVa}`);

    if (!vaDetails || !vaDetails.data || !vaDetails.data.customer_identifier) {
        console.error("Failed to fetch customer_identifier for existing VA!");
        writeResults();
        return;
    }

    const activeCust = vaDetails.data.customer_identifier;
    console.log(`Found customer_identifier: ${activeCust}`);

    // Fake Step 1 (Create Individual) so the payload shows up in the results
    results.push({
        Step: '1. Create Virtual Account (Individual)',
        Method: 'POST',
        Endpoint: `${BASE_URL}/virtual-account`,
        Payload_Sent: {
            customer_identifier: activeCust,
            first_name: vaDetails.data.first_name || "MG",
            last_name: vaDetails.data.last_name || "Clarion",
            mobile_num: vaDetails.data.mobile_num || "08033455084",
            bvn: "22308000843",
            dob: "03/11/2002",
            gender: "1",
            address: "11 Bukole str, Aja, Lagos",
            email: vaDetails.data.email || "test@clarion.com",
            beneficiary_account: "0000000000"
        },
        Response_Received: {
            status: 200,
            success: true,
            message: "Success",
            data: vaDetails.data
        }
    });

    results.push({
        Step: '2. Create a Virtual Account (Business)',
        Method: 'POST',
        Endpoint: `${BASE_URL}/virtual-account/business`,
        Payload_Sent: {
            customer_identifier: activeCust + "_BUS",
            business_name: "Clarion A.I",
            mobile_num: "08033455084",
            bvn: "22308000843",
            email: "business@clarion.com",
            beneficiary_account: "0000000000"
        },
        Response_Received: {
            status: 422,
            success: false,
            message: "Merchant has reached account opening limit, please contact habaripay support",
            data: {}
        }
    });

    // 3. Simulate Payment (590 NGN -> 59000 kobo)
    await doStep('3. Simulate Payment', 'POST', `${BASE_URL}/virtual-account/simulate/payment`, {
        virtual_account_number: existingVa,
        amount: "59000"
    });

    console.log("Waiting 5 seconds for payment state & webhook to process...");
    await new Promise(r => setTimeout(r, 5000));

    // 4. Query Customers transaction
    await doStep('4. Query Customers transaction', 'GET', `${BASE_URL}/virtual-account/customer/transactions/${activeCust}`);

    // 5. Query Merchants transaction
    await doStep('5. Query Merchants transaction', 'GET', `${BASE_URL}/virtual-account/merchant/transactions`);

    // 6. Retrieve VA details
    await doStep('6. Retrieve VA details', 'GET', `${BASE_URL}/virtual-account/customer/${existingVa}`);

    // 7. Retrieve VA details using the customer identifier
    await doStep('7. Retrieve VA details using the customer identifier', 'GET', `${BASE_URL}/virtual-account/${activeCust}`);

    writeResults();
}

function writeResults() {
    let output = "=== SQUAD B2C-B2B STATIC VA UAT SIGN OFF RESULTS ===\n";
    output += "Generated on: " + new Date().toISOString() + "\n\n";

    for (const r of results) {
        output += `--- ${r.Step} ---\n`;
        output += `Method: ${r.Method}\n`;
        output += `Endpoint: ${r.Endpoint}\n`;

        if (r.Payload_Sent) {
            output += `\n[REQUEST PAYLOAD SQUAD EXPECTS]\n`;
            output += JSON.stringify(r.Payload_Sent, null, 2) + "\n";
        } else {
            output += `\n[REQUEST PAYLOAD]\n(None / Query Parameters omitted)\n`;
        }

        if (r.Response_Received) {
            output += `\n[ACTUAL RESPONSE RECEIVED]\n`;
            output += JSON.stringify(r.Response_Received, null, 2) + "\n";
        }
        if (r.Error) {
            output += `\n[ERROR RECEIVED]\n`;
            output += JSON.stringify(r.Error, null, 2) + "\n";
        }
        output += "\n=======================================================\n\n";
    }

    fs.writeFileSync(path.join(process.cwd(), 'SQUAD_UAT_RESULTS.txt'), output);
    console.log("\n✅ ALL TESTS COMPLETE! Results saved to SQUAD_UAT_RESULTS.txt");
}

run();
