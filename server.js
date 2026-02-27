const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const ACCESS_KEY = process.env.LSQ_ACCESS_KEY;
const SECRET_KEY = process.env.LSQ_SECRET_KEY;
const LSQ_HOST = 'https://api-us11.leadsquared.com';

const FIELDS = [
  'mx_AI_Readiness_Score','mx_Readiness_Bucket','mx_AI_Detected_Intent','mx_AI_Reasoning',
  'mx_QA_Status','mx_QA_Risk_Level','mx_QA_Summary','mx_QA_Key_Findings','mx_QA_Advisory_Notes','mx_QA_Concerns',
  'mx_AI_Anomaly_Status','mx_Latest_Anomaly_Type','mx_Latest_Anomaly_Severity','mx_Latest_Anomaly_Confidence',
  'mx_Last_Intelligence_Run','mx_Latest_Anomaly_Explanation',
  'mx_Primary_Hesitation','mx_Motivation_Trigger','mx_Decision_Owner','mx_Enrollment_Timeline_Voice_Call'
];

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/lead-intelligence', async (req, res) => {
  const { pid } = req.query;
  if (!pid) return res.status(400).json({ error: 'Missing pid parameter' });

  try {
    let url;
    // If it looks like an email, use email lookup; otherwise use ID lookup
    if (pid.includes('@')) {
      url = `${LSQ_HOST}/v2/LeadManagement.svc/Leads.GetByEmailaddress?accessKey=${ACCESS_KEY}&secretKey=${SECRET_KEY}&emailaddress=${encodeURIComponent(pid)}`;
    } else {
      url = `${LSQ_HOST}/v2/LeadManagement.svc/Leads.GetById?accessKey=${ACCESS_KEY}&secretKey=${SECRET_KEY}&id=${pid}`;
    }

    console.log('Fetching:', url.replace(SECRET_KEY, '***'));

    const response = await fetch(url);
    const text = await response.text();

    console.log('Status:', response.status);
    console.log('Response:', text.substring(0, 200));

    if (!response.ok) {
      return res.status(response.status).json({ error: 'LeadSquared API error', detail: text });
    }

    let data;
    try { data = JSON.parse(text); }
    catch(e) { return res.status(500).json({ error: 'Invalid JSON from LeadSquared', detail: text }); }

    const lead = Array.isArray(data) ? data[0] : data;
    if (!lead) return res.json({ success: true, data: {} });

    const result = {};
    FIELDS.forEach(f => { result[f] = lead[f] || ''; });

    res.json({ success: true, data: result });

  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Lead Intelligence API running on port ${PORT}`));
