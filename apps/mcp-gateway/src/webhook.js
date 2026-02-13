export async function sendIndexWebhook(payload, fetchImpl = fetch) {
  const webhookUrl = process.env.TASK_MASTER_WEBHOOK_URL || '';
  if (!webhookUrl) return { sent: false };
  const token = String(process.env.CONTEXT_GATEWAY_TOKEN || '').trim();

  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  });

  return { sent: true, status: response.status };
}
