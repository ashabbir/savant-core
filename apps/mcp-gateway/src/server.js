import { createApp } from './app.js';

const app = createApp();
const port = Number(process.env.PORT || 4444);
const host = process.env.HOST || '0.0.0.0';

app.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`mcp-gateway listening on http://${host}:${port}`);
});
