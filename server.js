const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const ACCESS_KEY = process.env.LSQ_ACCESS_KEY;
const SECRET_KEY = process.env.LSQ_SECRET_KEY;
const LSQ_HOST = 'https://api.leadsquared.com';

function getAuthHeader(method, contentType, date) {
  const stringToSign = `${method}\n${contentType}\n${date}`;
  const hmac = crypto.createHmac('sha256', SECRET_KEY);
  hmac.update(stringToSign);
  const signature = hmac.digest('base64');
  return `LSQ AccessKey=${ACCESS_KEY},Signature=${signature}`;
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/lead-intelligence', async (req, res) => {
  const { pid } = req.query;
  if (!pid) return res.status(400).json({ error: 'Missing pid parameter' });

  try {
    const date = new Date().toUTCString();
    const contentType = 'application/json';
    const auth = getAuthHeader('GET', contentType, date);

    const fields = [
      'mx_AI_Readiness_Score',
      'mx_Readiness_Bucket',
      'mx_AI_Detected_Intent',
      'mx_AI_Reasoning',
      'mx_QA_Status',
      'mx_QA_Risk_Level',
      'mx_QA_Summary',
      'mx_QA_Key_Findings',
      'mx_QA_Advisory_Notes',
      'mx_QA_Concerns',
      'mx_AI_Anomaly_Status',
      'mx_Latest_Anomaly_Type',
      'mx_Latest_Anomaly_Severity',
      'mx_Latest_Anomaly_Confidence',
      'mx_Last_Intelligence_Run',
      'mx_Latest_Anomaly_Explanation',
      'mx_Primary_Hesitation',
      'mx_Motivation_Trigger',
      'mx_Decision_Owner',
      'mx_Enrollment_Timeline_Voice_Call'
    ];

    const url = `${LSQ_HOST}/v2/LeadManagement.svc/Lead.GetById?id=${pid}&Columns=${fields.join(',')}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': auth,
        'Content-Type': contentType,
        'Date': date
      }
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: 'LeadSquared API error', detail: text });
    }

    const data = await response.json();
    
    // Extract just the fields we need
    const lead = data[0] || {};
    const result = {};
    fields.forEach(f => {
      result[f] = lead[f] || '';
    });

    res.json({ success: true, data: result });

  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Lead Intelligence API running on port ${PORT}`));
