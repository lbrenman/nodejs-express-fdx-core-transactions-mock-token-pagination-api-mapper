// Express app that mocks the FDX /accounts/{accountId}/transactions endpoint
// Maps offset/limit pagination to a token-based backend API

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 5000;

const API_KEY = process.env.API_KEY;
const UPSTREAM_API_KEY = process.env.UPSTREAM_API_KEY;
const UPSTREAM_API_URL = process.env.UPSTREAM_API_URL;
const DEFAULT_LIMIT = parseInt(process.env.DEFAULT_LIMIT) || 10;
const DEFAULT_OFFSET = parseInt(process.env.DEFAULT_OFFSET) || 0;

// Middleware for API key validation
app.use((req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Utility function to build the next link href
function buildNextHref(accountId, nextOffset, limit) {
  return `/accounts/${accountId}/transactions?offSet=${nextOffset}&limit=${limit}`;
}

// GET /accounts/:accountId/transactions
app.get('/accounts/:accountId/transactions', async (req, res) => {
  const accountId = req.params.accountId;
  const limit = parseInt(req.query.limit) || DEFAULT_LIMIT;
  const offset = parseInt(req.query.offSet || req.query.offset) || DEFAULT_OFFSET;

  try {
    let currentOffset = 0;
    let pageToken = null;
    let pageData;

    // Walk through token-paginated API until we reach the page containing the desired offset
    while (currentOffset + limit <= offset) {
      const response = await axios.get(UPSTREAM_API_URL, {
        headers: { 'x-api-key': UPSTREAM_API_KEY },
        params: {
          pageSize: limit,
          pageToken: pageToken
        }
      });

      if (!response.data.nextPageToken) {
        return res.status(416).json({ error: 'Offset exceeds available data' });
      }

      currentOffset += limit;
      pageToken = response.data.nextPageToken;
    }

    // Final call to fetch the page that contains our target slice
    const finalResponse = await axios.get(UPSTREAM_API_URL, {
      headers: { 'x-api-key': UPSTREAM_API_KEY },
      params: {
        pageSize: limit,
        pageToken: pageToken
      }
    });

    const items = finalResponse.data.items || [];
    const sliceStart = offset - currentOffset;
    const transactions = items.slice(sliceStart, sliceStart + limit);

    // Determine next offset
    const nextOffset = offset + transactions.length < finalResponse.data.total
      ? offset + transactions.length
      : null;

    const responseBody = {
      page: {
        nextOffset: nextOffset !== null ? String(nextOffset) : null,
        total: finalResponse.data.total
      },
      links: {
        next: nextOffset !== null
          ? { href: buildNextHref(accountId, nextOffset, limit) }
          : null
      },
      transactions: transactions
    };

    res.json(responseBody);
  } catch (err) {
    console.error('Error calling upstream API:', err.message);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.listen(PORT, () => {
  console.log(`FDX Transactions Mock API listening at http://localhost:${PORT}`);
});
