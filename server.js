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

// Helper: extract mx_ fields from a lead object
function extractFields(lead) {
  const result = {};
  FIELDS.forEach(f => {
    const v = lead[f];
    result[f] = (v === undefined || v === null) ? '' : String(v);
  });
  return result;
}

// Helper: check if any mx_ fields actually have values
function hasMxData(lead) {
  return lead && FIELDS.some(f => lead[f] !== undefined && lead[f] !== null && lead[f] !== '');
}

app.get('/lead-intelligence', async (req, res) => {
  const { pid } = req.query;
  if (!pid) return res.status(400).json({ error: 'Missing pid parameter' });

  try {
    let lead = null;

    if (pid.includes('@')) {
      // ── Email lookup ──────────────────────────────────────────────────────
      const url = `${LSQ_HOST}/v2/LeadManagement.svc/Leads.GetByEmailaddress` +
        `?accessKey=${ACCESS_KEY}&secretKey=${SECRET_KEY}&emailaddress=${encodeURIComponent(pid)}`;
      console.log('Fetching by email:', url.replace(SECRET_KEY, '***'));
      const r = await fetch(url);
      const t = await r.text();
      console.log('Email status:', r.status, '| snippet:', t.substring(0, 200));
      if (!r.ok) return res.status(r.status).json({ error: 'LSQ error', detail: t });
      const d = JSON.parse(t);
      lead = Array.isArray(d) ? d[0] : d;

    } else {
      // ── ProspectID lookup ─────────────────────────────────────────────────
      // Strategy 1: Leads.GetById — fast but sometimes omits mx_ custom fields
      const url1 = `${LSQ_HOST}/v2/LeadManagement.svc/Leads.GetById` +
        `?accessKey=${ACCESS_KEY}&secretKey=${SECRET_KEY}&id=${encodeURIComponent(pid)}`;
      console.log('Strategy 1 – GetById:', url1.replace(SECRET_KEY, '***'));
      const r1 = await fetch(url1);
      const t1 = await r1.text();
      console.log('GetById status:', r1.status, '| snippet:', t1.substring(0, 200));

      if (r1.ok) {
        const d1 = JSON.parse(t1);
        const candidate = Array.isArray(d1) ? d1[0] : d1;
        if (hasMxData(candidate)) {
          lead = candidate;
          console.log('mx_ fields found via GetById ✓');
        } else {
          console.log('GetById returned no mx_ fields — trying Search fallback...');
        }
      }

      // Strategy 2: Leads.Search by ProspectID — returns full field set including mx_
      if (!lead || !hasMxData(lead)) {
        const searchUrl = `${LSQ_HOST}/v2/LeadManagement.svc/Leads.Search` +
          `?accessKey=${ACCESS_KEY}&secretKey=${SECRET_KEY}`;
        const searchBody = JSON.stringify({
          Filters: [{ Attribute: 'ProspectID', Operator: 'Equal', Value: pid }],
          Columns: { Include_CSV: FIELDS.join(',') },
          Paging: { PageIndex: 1, PageSize: 1 }
        });
        console.log('Strategy 2 – Leads.Search');
        const r2 = await fetch(searchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: searchBody
        });
        const t2 = await r2.text();
        console.log('Search status:', r2.status, '| snippet:', t2.substring(0, 200));

        if (r2.ok) {
          const d2 = JSON.parse(t2);
          // Leads.Search returns { Leads: [...], RecordCount: N }
          const list = d2.Leads || d2;
          const candidate2 = Array.isArray(list) ? list[0] : list;
          if (candidate2) lead = candidate2;
        }
      }

      // Strategy 3: Leads.GetByLeadId (alternate endpoint)
      if (!lead || !hasMxData(lead)) {
        const url3 = `${LSQ_HOST}/v2/LeadManagement.svc/Leads.GetByLeadId` +
          `?accessKey=${ACCESS_KEY}&secretKey=${SECRET_KEY}&leadId=${encodeURIComponent(pid)}`;
        console.log('Strategy 3 – GetByLeadId:', url3.replace(SECRET_KEY, '***'));
        const r3 = await fetch(url3);
        const t3 = await r3.text();
        console.log('GetByLeadId status:', r3.status, '| snippet:', t3.substring(0, 200));
        if (r3.ok) {
          const d3 = JSON.parse(t3);
          const candidate3 = Array.isArray(d3) ? d3[0] : d3;
          if (candidate3) lead = candidate3;
        }
      }
    }

    if (!lead) {
      console.log('No lead found for pid:', pid);
      return res.json({});
    }

    const result = extractFields(lead);
    console.log('Returning result:', JSON.stringify(result).substring(0, 300));

    // Return fields FLAT at top level — frontend reads d.mx_AI_Readiness_Score directly
    res.json(result);

  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Lead Intelligence API running on port ${PORT}`));
