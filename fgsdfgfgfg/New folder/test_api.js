import axios from 'axios';

const token = "221674d0e07375da253cfa06e11fb3d77c96969d";
const baseUrl = "https://client.peyflex.com.ng";

async function testApi() {
    try {
        const client = axios.create({
            baseURL: baseUrl,
            headers: {
                'Authorization': `Token ${token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log("Fetching: " + baseUrl + "/api/data/plans/?network=mtn_data_share");
        const res = await client.get("/api/data/plans/?network=mtn_gifting_data");
        console.log("Success! Got data:");
        console.log(Object.keys(res.data));
    } catch (err) {
        console.log("FAILED:");
        if (err.response) {
            console.log("Status:", err.response.status);
            console.log("Data:", JSON.stringify(err.response.data, null, 2));
        } else {
            console.log("Message:", err.message);
        }
    }
}

testApi();
