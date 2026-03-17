# Lead Reply Dashboard (Vite + Vercel)

Deploy-ready React + Vercel serverless application.

## Environment Variables (Vercel Project Settings)

- `HEYREACH_API_KEY_1`
- `HEYREACH_API_KEY_2`
- `HEYREACH_API_KEY_3`
- `SMARTLEAD_API_KEY`

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```

## API Routes

- `GET /api/heyreach`
- `GET /api/smartlead`

Both endpoints return:

```json
{
  "replies": [
    {
      "id": "...",
      "source": "...",
      "channel": "linkedin|email",
      "lastMessageText": "...",
      "lastMessageAt": "...",
      "sentiment": "positive|negative|neutral|unknown",
      "lead": {
        "name": "...",
        "company": "..."
      },
      "messages": []
    }
  ]
}
```
